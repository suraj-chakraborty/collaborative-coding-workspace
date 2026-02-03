import Dockerode from "dockerode";
import path from "path";
import fs from "fs";
import { CONFIG } from "../config";
import { prisma } from "../lib/prisma";

const docker = new Dockerode();
const WORKSPACE_ROOT = CONFIG.WORKSPACE_ROOT;

export class DockerService {
    static async createContainer(workspaceId: string) {
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) throw new Error("Workspace not found");

        const containerName = `ccw-${workspaceId}`;
        let mountSource: string;

        if (workspace.hostingType === "LOCAL") {
            const rawPath = path.join(CONFIG.WORKSPACE_ROOT, workspaceId);

            if (!fs.existsSync(rawPath)) {
                fs.mkdirSync(rawPath, { recursive: true });
            }

            // Normalize path for Windows Docker Desktop: J:\foo -> /j/foo
            mountSource =
                process.platform === "win32"
                    ? rawPath
                        .replace(/\\/g, "/")
                        .replace(/^([A-Za-z]):/, (_, d) => `/run/desktop/mnt/host/${d.toLowerCase()}`)
                    : rawPath;
            console.log(`[DockerService] Workspace ${workspaceId} -> Using Local Bind Mount: ${mountSource}`);
        } else {
            const volumeName = `ccw-vol-${workspaceId}`;
            // Ensure volume exists
            await docker.createVolume({ Name: volumeName }).catch(() => null);
            mountSource = volumeName;
            console.log(`[DockerService] Workspace ${workspaceId} -> Using Cloud Volume: ${mountSource}`);
        }

        try {
            const existingContainer = docker.getContainer(containerName);
            const data = await existingContainer.inspect().catch(() => null);

            if (data) {
                // Check if image matches what we expect
                if (data.Image !== CONFIG.DOCKER_IMAGE && data.Config?.Image !== CONFIG.DOCKER_IMAGE) {
                    console.log(`[DockerService] Container ${containerName} uses old image. Recreating with ${CONFIG.DOCKER_IMAGE}...`);
                    await existingContainer.remove({ force: true }).catch(() => null);
                    // Continue to creation
                } else {
                    console.log(`Container ${containerName} already exists.`);
                    return existingContainer;
                }
            }

            console.log(`Creating container ${containerName} with image ${CONFIG.DOCKER_IMAGE}...`);

            const createOptions = {
                Image: CONFIG.DOCKER_IMAGE,
                name: containerName,
                HostConfig: {
                    Binds: [`${mountSource}:/home/coder/workspace`],
                    PortBindings: {
                        [`${CONFIG.CONTAINER_PORT}/tcp`]: [{ HostPort: "" }], // Dynamic port
                    },
                    Memory: CONFIG.MEMORY_LIMIT,
                    CpuQuota: CONFIG.CPU_QUOTA,
                    CpuPeriod: 100000,
                    RestartPolicy: { Name: "unless-stopped" },
                },
                Env: [
                    "PASSWORD=", // Empty to disable strict auth logic if any
                ],
                Cmd: [
                    "--auth", "none",
                    "--bind-addr", `0.0.0.0:${CONFIG.CONTAINER_PORT}`,
                    "/home/coder/workspace"
                ],
                ExposedPorts: {
                    [`${CONFIG.CONTAINER_PORT}/tcp`]: {},
                },
            };

            try {
                return await docker.createContainer(createOptions);
            } catch (err: any) {
                // Check for container name conflict (409)
                if (err.statusCode === 409 && err.json?.message?.includes("already in use")) {
                    console.log(`Container ${containerName} already exists, reusing it...`);
                    return docker.getContainer(containerName);
                }

                // Check for missing image error
                const isMissingImage =
                    err.statusCode === 404 &&
                    (err.json?.message?.includes("No such image") || err.reason === "no such image" || err.message?.includes("No such image"));

                if (isMissingImage) {
                    console.log(`Image ${CONFIG.DOCKER_IMAGE} not found. Pulling...`);
                    // Pull image logic
                    await new Promise((resolve, reject) => {
                        docker.pull(CONFIG.DOCKER_IMAGE, (err: any, stream: any) => {
                            if (err) return reject(err);
                            // Follow progress
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
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) throw new Error("Workspace not found");

        const containerName = `ccw-${workspaceId}`;
        let container = docker.getContainer(containerName);

        const data = await container.inspect().catch(() => null);

        // Migration: If container exists but mount type doesn't match HostingType, remove and recreate
        if (data) {
            const hasBindMount = data.Mounts?.some((m: any) => m.Type === 'bind');
            const hasVolumeMount = data.Mounts?.some((m: any) => m.Type === 'volume');

            const needsRecreation =
                (workspace.hostingType === "LOCAL" && !hasBindMount) ||
                (workspace.hostingType === "CLOUD" && !hasVolumeMount);

            if (needsRecreation) {
                console.log(`[DockerService] Container mount mismatch for ${containerName} (Expected: ${workspace.hostingType}). Recreating...`);
                await container.remove({ force: true }).catch(() => null);
                container = await this.createContainer(workspaceId);
            }
        } else {
            container = await this.createContainer(workspaceId);
        }

        const freshData = await container.inspect();
        if (!freshData.State.Running) {
            console.log(`Starting container ${containerName}...`);
            await container.start();
            // Wait for code-server to initialize
            console.log(`Waiting for code-server to initialize...`);
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Check if we need to clone the repository into the volume
            if (workspace.repoUrl) {
                try {
                    console.log(`Checking if repository clone is needed...`);
                    const checkExec = await container.exec({
                        Cmd: ['sh', '-c', 'ls -A /home/coder/workspace | grep -v "lost+found"'],
                        AttachStdout: true,
                    });
                    const checkStream = await checkExec.start({});
                    let output = "";
                    await new Promise((resolve) => {
                        checkStream.on('data', chunk => output += chunk.toString());
                        checkStream.on('end', resolve);
                    });

                    if (output.trim() === "") {
                        console.log(`Cloning repository ${workspace.repoUrl} into volume...`);
                        let cloneUrl = workspace.repoUrl;
                        if ((workspace as any).repoToken) {
                            cloneUrl = workspace.repoUrl.replace("https://", `https://${(workspace as any).repoToken}@`);
                        }
                        const cloneExec = await container.exec({
                            Cmd: ['git', 'clone', cloneUrl, '/home/coder/workspace'],
                            AttachStdout: true,
                            AttachStderr: true
                        });
                        const cloneStream = await cloneExec.start({});
                        await new Promise((resolve) => {
                            cloneStream.on('data', chunk => console.log(`[Clone] ${chunk.toString().trim()}`));
                            cloneStream.on('end', resolve);
                        });
                        console.log(`Repository cloned successfully.`);
                    }
                } catch (cloneErr) {
                    console.error("Failed to clone repository inside container", cloneErr);
                }
            }
            // Provision settings - do it every time we start/ensure container
            await this.createDefaultVSCodeSettings(workspaceId);
        }

        // Wait a moment for network settings to populate if just started
        const finalData = await container.inspect();
        const portBindings = finalData.NetworkSettings.Ports[`${CONFIG.CONTAINER_PORT}/tcp`];

        if (!portBindings || portBindings.length === 0) {
            throw new Error("No port bindings found for container");
        }

        const port = portBindings[0].HostPort;

        // Health check: verify code-server is responding
        const maxRetries = 10;
        let retries = 0;
        while (retries < maxRetries) {
            try {
                const response = await fetch(`http://127.0.0.1:${port}/healthz`).catch(() => null);
                if (response && response.ok) {
                    break;
                }
            } catch (e) {
                // Ignore and retry
            }
            retries++;
            if (retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

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

    static async stopAndRemoveContainer(workspaceId: string) {
        const containerName = `ccw-${workspaceId}`;
        const container = docker.getContainer(containerName);
        const data = await container.inspect().catch(() => null);

        if (data) {
            if (data.State.Running) {
                console.log(`Stopping container ${containerName}...`);
                await container.stop().catch(() => null);
            }
            console.log(`Removing container ${containerName}...`);
            await container.remove({ force: true }).catch(() => null);

            // Also attempt to remove the associated volume if it exists (for Cloud mode)
            const volumeName = `ccw-vol-${workspaceId}`;
            const volume = docker.getVolume(volumeName);
            await volume.remove().catch((err) => {
                // Volume might not exist or be in use, which is fine
                console.log(`Volume removal failed or skipped for ${volumeName}`);
            });
            console.log(`Cleanup complete for workspace ${workspaceId}`);
        }
    }

    static async getContainerStatus(workspaceId: string) {
        const container = docker.getContainer(`ccw-${workspaceId}`);
        const data = await container.inspect().catch(() => null);
        if (!data) return "OFFLINE";
        return data.State.Running ? "RUNNING" : "STOPPED";
    }

    static async restartContainer(workspaceId: string) {
        const containerName = `ccw-${workspaceId}`;
        const container = docker.getContainer(containerName);

        const data = await container.inspect().catch(() => null);
        if (!data) {
            console.log(`Container ${containerName} not found, starting full initialization...`);
            return this.startContainer(workspaceId);
        }

        console.log(`Restarting container ${containerName}...`);
        await container.restart();

        // Wait for code-server to initialize
        console.log(`Waiting for code-server to initialize...`);
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Health check
        const finalData = await container.inspect();
        const portBindings = finalData.NetworkSettings.Ports[`${CONFIG.CONTAINER_PORT}/tcp`];

        if (portBindings && portBindings.length > 0) {
            const port = portBindings[0].HostPort;

            // Verify code-server is responding
            const maxRetries = 10;
            let retries = 0;
            while (retries < maxRetries) {
                try {
                    const response = await fetch(`http://127.0.0.1:${port}/healthz`).catch(() => null);
                    if (response && response.ok) {
                        break;
                    }
                } catch (e) {
                    // Ignore and retry
                }
                retries++;
                if (retries < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        console.log(`Container ${containerName} restarted successfully`);
        return { success: true };
    }

    static async createDefaultVSCodeSettings(workspaceId: string) {
        const containerName = `ccw-${workspaceId}`;
        const container = docker.getContainer(containerName);

        try {
            const defaultSettings = {
                "extensions.autoCheckUpdates": false,
                "extensions.autoUpdate": false,
                "github.gitAuthentication": false,
                "telemetry.telemetryLevel": "off",
                "workbench.enableExperiments": false,
                "extensions.ignoreRecommendations": true,
                "update.mode": "none"
            };

            const settingsStr = JSON.stringify(defaultSettings, null, 2);

            // Create directory and file inside the container
            const cmd = [
                'sh', '-c',
                `mkdir -p /home/coder/workspace/.vscode && echo '${settingsStr}' > /home/coder/workspace/.vscode/settings.json`
            ];

            const exec = await container.exec({
                Cmd: cmd,
                AttachStdout: true,
                AttachStderr: true
            });

            await exec.start({});
            console.log(`[DockerService] Provisioned default VS Code settings inside container ${containerName}`);
        } catch (error) {
            console.error(`Failed to create VS Code settings for workspace ${workspaceId}:`, error);
        }
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
