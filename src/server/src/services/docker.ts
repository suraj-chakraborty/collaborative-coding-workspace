import Dockerode from "dockerode";
import path from "path";
import fs from "fs";
import { CONFIG } from "../config";

const docker = new Dockerode();
const WORKSPACE_ROOT = CONFIG.WORKSPACE_ROOT;

export class DockerService {
    static async createContainer(workspaceId: string) {
        const containerName = `ccw-${workspaceId}`;
        const absoluteRepoPath = path.resolve(WORKSPACE_ROOT, workspaceId);

        // Ensure the directory exists before mounting
        if (!fs.existsSync(absoluteRepoPath)) {
            fs.mkdirSync(absoluteRepoPath, { recursive: true });
        }

        try {
            const existingContainer = docker.getContainer(containerName);
            const data = await existingContainer.inspect().catch(() => null);

            if (data) {
                console.log(`Container ${containerName} already exists.`);
                return existingContainer;
            }

            console.log(`Creating container ${containerName} with image ${CONFIG.DOCKER_IMAGE}...`);

            const createOptions = {
                Image: CONFIG.DOCKER_IMAGE,
                name: containerName,
                HostConfig: {
                    Binds: [`${absoluteRepoPath}:/config/workspace`],
                    PortBindings: {
                        [`${CONFIG.CONTAINER_PORT}/tcp`]: [{ HostPort: "" }], // Dynamic port
                    },
                    Memory: CONFIG.MEMORY_LIMIT,
                    CpuQuota: CONFIG.CPU_QUOTA,
                    CpuPeriod: 100000,
                    RestartPolicy: { Name: "unless-stopped" },
                },
                Env: [
                    "PUID=1000",
                    "PGID=1000",
                    "TZ=Etc/UTC",
                    "PASSWORD=ccw", // Default password for code-server
                    "DEFAULT_WORKSPACE=/config/workspace",
                    "SUDO_PASSWORD=ccw",
                ],
                ExposedPorts: {
                    [`${CONFIG.CONTAINER_PORT}/tcp`]: {},
                },
            };

            try {
                return await docker.createContainer(createOptions);
            } catch (err: any) {
                if (err.statusCode === 404 && err.reason === "no such image") {
                    console.log(`Image ${CONFIG.DOCKER_IMAGE} not found. Pulling...`);
                    // Pull image logic
                    await new Promise((resolve, reject) => {
                        docker.pull(CONFIG.DOCKER_IMAGE, (err: any, stream: any) => {
                            if (err) return reject(err);
                            docker.modem.followProgress(stream, onFinished, onProgress);

                            function onFinished(err: any, output: any) {
                                if (err) return reject(err);
                                resolve(output);
                            }
                            function onProgress(event: any) {
                                // console.log(event); // Optional: log progress
                            }
                        });
                    });
                    console.log(`Image pulled. Retrying creation...`);
                    return await docker.createContainer(createOptions);
                }
                throw err;
            }
        } catch (error) {
            console.error("Docker create error:", error);
            throw error;
        }
    }

    static async startContainer(workspaceId: string) {
        const containerName = `ccw-${workspaceId}`;
        const container = docker.getContainer(containerName);

        const data = await container.inspect().catch(() => null);
        if (!data) {
            await this.createContainer(workspaceId);
        }

        const freshData = await container.inspect();
        if (!freshData.State.Running) {
            console.log(`Starting container ${containerName}...`);
            await container.start();
        }

        // Wait a moment for network settings to populate if just started
        const finalData = await container.inspect();
        const portBindings = finalData.NetworkSettings.Ports[`${CONFIG.CONTAINER_PORT}/tcp`];

        if (!portBindings || portBindings.length === 0) {
            throw new Error("No port bindings found for container");
        }

        const port = portBindings[0].HostPort;
        console.log(`Container ${containerName} is running on host port ${port}`);
        return { workspaceId, port };
    }

    static async stopContainer(workspaceId: string) {
        const container = docker.getContainer(`ccw-${workspaceId}`);
        const data = await container.inspect().catch(() => null);
        if (data && data.State.Running) {
            await container.stop();
        }
    }

    static async getContainerStatus(workspaceId: string) {
        const container = docker.getContainer(`ccw-${workspaceId}`);
        const data = await container.inspect().catch(() => null);
        if (!data) return "OFFLINE";
        return data.State.Running ? "RUNNING" : "STOPPED";
    }

    static async cleanupStaleContainers() {
        try {
            const containers = await docker.listContainers({ all: true });
            const ccwContainers = containers.filter(c => c.Names.some(name => name.startsWith("/ccw-")));

            for (const c of ccwContainers) {
                // Potential logic for removing containers that haven't been used in a while
                // For now, just a placeholder for infra maintenance
            }
        } catch (e) {
            console.error("Cleanup error:", e);
        }
    }
}
