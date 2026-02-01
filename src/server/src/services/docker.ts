import Dockerode from "dockerode";
import path from "path";

const docker = new Dockerode();
const WORKSPACE_STORAGE_ROOT = path.resolve(process.cwd(), "..", "..", "storage", "workspaces");

export class DockerService {
    static async createContainer(workspaceId: string) {
        const containerName = `ccw-${workspaceId}`;
        const absoluteRepoPath = path.join(WORKSPACE_STORAGE_ROOT, workspaceId);

        try {
            const existingContainer = docker.getContainer(containerName);
            const data = await existingContainer.inspect().catch(() => null);
            if (data) {
                return existingContainer;
            }

            const container = await docker.createContainer({
                Image: "linuxserver/code-server:latest",
                name: containerName,
                HostConfig: {
                    Binds: [`${absoluteRepoPath}:/config/workspace`],
                    PortBindings: {
                        "8443/tcp": [{ HostPort: "0" }],
                    },
                    Memory: 1024 * 1024 * 512, // 512MB
                    CpuQuota: 50000, // 50% CPU
                },
                Env: [
                    "PUID=1000",
                    "PGID=1000",
                    "TZ=Etc/UTC",
                    "DEFAULT_WORKSPACE=/config/workspace",
                ],
            });

            return container;
        } catch (error) {
            console.error("Docker create error:", error);
            throw error;
        }
    }

    static async startContainer(workspaceId: string) {
        const container = docker.getContainer(`ccw-${workspaceId}`);
        await container.start();
        const data = await container.inspect();
        const port = data.NetworkSettings.Ports["8443/tcp"][0].HostPort;
        return { workspaceId, port };
    }

    static async stopContainer(workspaceId: string) {
        const container = docker.getContainer(`ccw-${workspaceId}`);
        await container.stop();
    }

    static async getContainerStatus(workspaceId: string) {
        const container = docker.getContainer(`ccw-${workspaceId}`);
        const data = await container.inspect().catch(() => null);
        if (!data) return "OFFLINE";
        return data.State.Running ? "RUNNING" : "STOPPED";
    }
}
