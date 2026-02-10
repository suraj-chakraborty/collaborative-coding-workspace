import { inngest } from "../lib/inngest";
import { DockerService } from "../services/docker";
import { prisma } from "../lib/prisma";
import { detectStack } from "../lib/stack-detector";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export const setupWorkspace = inngest.createFunction(
    { id: "setup-workspace", name: "Setup Workspace" },
    { event: "workspace/setup" },
    async ({ event, step }) => {
        const { workspaceId } = event.data;

        // 1. Fetch workspace details
        const workspace = await step.run("fetch-workspace", async () => {
            return await prisma.workspace.findUnique({
                where: { id: workspaceId }
            });
        });

        if (!workspace) {
            console.error(`Workspace ${workspaceId} not found in Inngest setup`);
            return { error: "Workspace not found" };
        }

        // 2. Detect Stack
        const detectedStack = await step.run("detect-stack", async () => {
            if (!workspace.repoUrl) return "unknown";

            const tempDir = path.join(os.tmpdir(), `cc-detect-${workspaceId}`);
            try {
                if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
                fs.mkdirSync(tempDir, { recursive: true });

                // Use git clone --depth 1 --no-checkout to quickly get the tree info
                // Replace https:// with token if available
                let cloneUrl = workspace.repoUrl;
                if (workspace.repoToken) {
                    cloneUrl = workspace.repoUrl.replace("https://", `https://${workspace.repoToken}@`);
                }

                execSync(`git clone --depth 1 --no-checkout ${cloneUrl} .`, { cwd: tempDir, stdio: 'ignore' });
                const files = execSync(`git ls-tree -r --name-only HEAD`, { cwd: tempDir }).toString().split("\n");
                const stack = detectStack(files);
                console.log(`[Inngest] Detected stack for ${workspaceId}: ${stack}`);

                await prisma.workspace.update({
                    where: { id: workspaceId },
                    data: { stack } as any
                });

                return stack;
            } catch (err) {
                console.error("Stack detection failed:", err);
                return "unknown";
            } finally {
                if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });

        // 3. Create & Start Resources
        if (workspace.hostingType === "CLOUD") {
            const { AwsService } = await import("../services/aws");
            await step.run("create-cloud-container", async () => {
                await AwsService.createContainer(workspaceId);
            });
        } else {
            // Local Docker Setup (via Agent or Server)
            const { AgentService } = await import("../services/agent");

            // Check if agent is connected
            if (AgentService.isAgentConnected(workspace.ownerId)) {
                await step.run("spawn-agent-container", async () => {
                    await AgentService.spawnContainer(workspace.ownerId, workspaceId);
                });
            } else {
                // Legacy / Dev Fallback: Server-side Docker
                // Only run this if we are NOT in production or if explicitly desired
                console.log("No agent connected, falling back to server-side Docker");

                await step.run("create-container", async () => {
                    await DockerService.createContainer(workspaceId);
                });

                await step.run("start-container", async () => {
                    await DockerService.startContainer(workspaceId);
                });
            }
        }

        return {
            success: true,
            workspaceId,
            stack: detectedStack,
            hostingType: workspace.hostingType
        };
    }
);
