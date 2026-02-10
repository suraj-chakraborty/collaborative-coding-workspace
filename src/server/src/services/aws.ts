
import {
    ECSClient,
    RunTaskCommand,
    StopTaskCommand,
    DescribeTasksCommand,
    Tag
} from "@aws-sdk/client-ecs";
import {
    EC2Client,
    DescribeNetworkInterfacesCommand
} from "@aws-sdk/client-ec2";
import { CONFIG } from "../config";
import { prisma } from "../lib/prisma";
import { progressService } from "./progress";

const ecsClient = new ECSClient({
    region: CONFIG.AWS.REGION,
    credentials: {
        accessKeyId: CONFIG.AWS.ACCESS_KEY_ID,
        secretAccessKey: CONFIG.AWS.SECRET_ACCESS_KEY
    }
});

const ec2Client = new EC2Client({
    region: CONFIG.AWS.REGION,
    credentials: {
        accessKeyId: CONFIG.AWS.ACCESS_KEY_ID,
        secretAccessKey: CONFIG.AWS.SECRET_ACCESS_KEY
    }
});

export class AwsService {
    static async createContainer(workspaceId: string): Promise<{ workspaceId: string, port: string, publicIp?: string }> {
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) throw new Error("Workspace not found");

        console.log(`[AwsService] Starting ECS Task for workspace ${workspaceId}...`);
        progressService.emitProgress(workspaceId, "PREPARING", 10, "Provisioning cloud instance...");

        try {
            // Check if there is already a running container (task) for this workspace
            // We can query our database for the last known container ID
            // For simplicity in this implementation, we will always create a new one unless we track state better.
            // A robust solution would check `workspace.containers`.

            const command = new RunTaskCommand({
                cluster: CONFIG.AWS.ECS_CLUSTER,
                taskDefinition: CONFIG.AWS.ECS_TASK_DEFINITION,
                launchType: "FARGATE",
                networkConfiguration: {
                    awsvpcConfiguration: {
                        subnets: CONFIG.AWS.VPC_SUBNETS,
                        securityGroups: CONFIG.AWS.SECURITY_GROUPS,
                        assignPublicIp: "ENABLED"
                    }
                },
                tags: [
                    { key: "WorkspaceId", value: workspaceId },
                    { key: "Project", value: "CollaborativeCoding" }
                ]
            });

            progressService.emitProgress(workspaceId, "STARTING", 30, "Launching container...");
            const response = await ecsClient.send(command);
            const task = response.tasks?.[0];

            if (!task || !task.taskArn) {
                throw new Error("Failed to start ECS task");
            }

            const taskArn = task.taskArn;
            const containerId = taskArn.split("/").pop() || taskArn;

            // Track the container in the database
            await prisma.container.create({
                data: {
                    workspaceId: workspaceId,
                    containerId: taskArn, // Using ARN as the ID
                    status: "PROVISIONING"
                }
            });

            console.log(`[AwsService] Task started: ${taskArn}`);

            // Wait for task to be RUNNING
            progressService.emitProgress(workspaceId, "STARTING", 50, "Waiting for network...");
            const runningTask = await this.waitForTaskRunning(taskArn);

            const publicIp = await this.getPublicIp(runningTask.attachments?.[0]?.details);
            console.log(`[AwsService] Task ${taskArn} is RUNNING at ${publicIp}`);

            progressService.emitProgress(workspaceId, "COMPLETED", 100, "Cloud environment ready.");

            // Update container status to RUNNING
            // We need to find the record we just created. Using findFirst for simplicity based on workspaceId and containerId.
            const containerRecord = await prisma.container.findFirst({
                where: { workspaceId, containerId: taskArn }
            });

            if (containerRecord) {
                await prisma.container.update({
                    where: { id: containerRecord.id },
                    data: { status: "RUNNING" }
                });
            }

            return { workspaceId, port: "8080", publicIp };

        } catch (error) {
            console.error("[AwsService] Failed to create container:", error);
            throw error;
        }
    }

    static async stopContainer(workspaceId: string) {
        // Find running container for this workspace
        // We look for the most recent running container
        const container = await prisma.container.findFirst({
            where: { workspaceId, status: "RUNNING" },
            orderBy: { id: "desc" }
        });

        if (container && container.containerId) {
            console.log(`[AwsService] Stopping task ${container.containerId}...`);
            try {
                await ecsClient.send(new StopTaskCommand({
                    cluster: CONFIG.AWS.ECS_CLUSTER,
                    task: container.containerId,
                    reason: "Workspace stopped"
                }));
            } catch (e) {
                console.warn(`[AwsService] Failed to stop task (might already be stopped):`, e);
            }

            await prisma.container.update({
                where: { id: container.id },
                data: { status: "STOPPED" }
            });
        }
    }

    private static async waitForTaskRunning(taskArn: string): Promise<any> {
        for (let i = 0; i < 20; i++) { // Wait up to 100s
            const task = await this.getTaskDetails(taskArn);
            if (!task) throw new Error("Task not found");

            if (task.lastStatus === "RUNNING") return task;
            if (task.lastStatus === "STOPPED") throw new Error(`Task stopped unexpectedly: ${task.stopCode} - ${task.stoppedReason}`);

            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        throw new Error("Timeout waiting for task to start");
    }

    private static async getTaskDetails(taskArn: string) {
        const res = await ecsClient.send(new DescribeTasksCommand({
            cluster: CONFIG.AWS.ECS_CLUSTER,
            tasks: [taskArn]
        }));
        return res.tasks?.[0];
    }

    private static async getPublicIp(details: any[] = []): Promise<string | undefined> {
        const eniId = details.find(d => d.name === "networkInterfaceId")?.value;
        if (!eniId) return undefined;

        try {
            const res = await ec2Client.send(new DescribeNetworkInterfacesCommand({
                NetworkInterfaceIds: [eniId]
            }));

            return res.NetworkInterfaces?.[0]?.Association?.PublicIp;
        } catch (e) {
            console.error("[AwsService] Failed to get public IP:", e);
            return undefined;
        }
    }
}
