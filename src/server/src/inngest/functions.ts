import { inngest } from "../lib/inngest";
import { DockerService } from "../services/docker";
import { prisma } from "../lib/prisma";

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

        // 2. Create Docker Resources (Volumes & Container)
        await step.run("create-container", async () => {
            await DockerService.createContainer(workspaceId);
        });

        // 3. Start Container & Clone Repo
        await step.run("start-container", async () => {
            await DockerService.startContainer(workspaceId);
        });

        return {
            success: true,
            workspaceId,
            hostingType: workspace.hostingType
        };
    }
);
