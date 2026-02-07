import Dockerode from "dockerode";
import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";
import { CONFIG } from "../config";
import { prisma } from "../lib/prisma";
import { detectStack } from "../lib/stack-detector";

import { progressService } from "./progress";
import { AgentManager } from "./agent-manager";

const docker = new Dockerode();
const WORKSPACE_ROOT = CONFIG.WORKSPACE_ROOT;

// Shared Cache Volumes
const SHARED_VOLUMES = {
    PNPM_STORE: "cc-pnpm-store",
    PIP_CACHE: "cc-pip-cache",
    CARGO_CACHE: "cc-cargo-cache",
    GRADLE_CACHE: "cc-gradle-cache",
    MAVEN_REPO: "cc-maven-repo"
};

export class DockerService {
    static async createContainer(workspaceId: string) {
        // Re-fetch to get latest data (like stack) which might have been updated by Inngest
        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) throw new Error("Workspace not found");

        const containerName = `ccw-${workspaceId}`;
        let mountSource: string;

        // Perform basic setup that doesn't touch Docker or FS yet
        let stack = (workspace as any).stack;
        const image = CONFIG.STACK_IMAGES[stack || "unknown"] || CONFIG.STACK_IMAGES.unknown;

        // Determine mountSource logic
        if (workspace.hostingType === "LOCAL") {
            mountSource = path.join(CONFIG.WORKSPACE_ROOT, workspaceId);
        } else {
            mountSource = `ccw-vol-${workspaceId}`;
        }

        // CRITICAL: Check for agent BEFORE any local docker or fs calls
        if (AgentManager.isAgentConnected(workspace.ownerId)) {
            return await AgentManager.sendCommand(workspace.ownerId, {
                type: "START_CONTAINER",
                workspaceId,
                options: { image, containerName, mountSource, stack }
            });
        }

        // Now proceed with local logic if NO agent
        if (workspace.hostingType === "LOCAL") {
            const rawPath = mountSource;
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
        } else {
            // Ensure volume exists - ONLY if not delegating
            await docker.createVolume({ Name: mountSource }).catch(() => null);
        }

        // Perform on-the-fly stack detection if missing to ensure correct image selection
        if (!stack && workspace.repoUrl) {
            console.log(`[DockerService] Stack unknown for ${workspaceId}, detecting before creation...`);
            const tempDir = path.join(os.tmpdir(), `cc-detect-${workspaceId}`);
            try {
                if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
                fs.mkdirSync(tempDir, { recursive: true });

                let cloneUrl = workspace.repoUrl;
                if ((workspace as any).repoToken) {
                    cloneUrl = workspace.repoUrl.replace("https://", `https://${(workspace as any).repoToken}@`);
                }

                execSync(`git clone --depth 1 --no-checkout ${cloneUrl} .`, { cwd: tempDir, stdio: 'ignore' });
                const files = execSync(`git ls-tree -r --name-only HEAD`, { cwd: tempDir }).toString().split("\n");
                stack = detectStack(files);

                console.log(`[DockerService] Detected stack: ${stack}`);
                await prisma.workspace.update({
                    where: { id: workspaceId },
                    data: { stack } as any
                });
            } catch (err) {
                console.error("[DockerService] Stack detection failed:", err);
                stack = "unknown";
            } finally {
                if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
            }
        }

        // Use already calculated image and stack
        console.log(`[DockerService] Selected image for workspace ${workspaceId} (stack: ${stack}): ${image}`);

        try {
            // Agent check already handled at the top of the method

            const existingContainer = docker.getContainer(containerName);
            const data = await existingContainer.inspect().catch(() => null);

            if (data) {
                // Check if image matches what we expect
                if (data.Image !== image && data.Config?.Image !== image) {
                    progressService.emitProgress(workspaceId, "PREPARING", 10, "Upgrading environment engine...");
                    console.log(`[DockerService] Container ${containerName} uses old image. Recreating with ${image}...`);
                    await existingContainer.remove({ force: true }).catch(() => null);
                    // Continue to creation
                } else {
                    console.log(`Container ${containerName} already exists.`);
                    return existingContainer;
                }
            }

            progressService.emitProgress(workspaceId, "PREPARING", 20, "Allocating cloud resources...");
            console.log(`Creating container ${containerName} with image ${image}...`);

            // Ensure shared volumes exist
            for (const vol of Object.values(SHARED_VOLUMES)) {
                await docker.createVolume({ Name: vol as string }).catch(() => null);
            }

            const createOptions = {
                Image: image,
                name: containerName,
                HostConfig: {
                    Binds: [
                        `${mountSource}:/home/coder/workspace`,
                        `${SHARED_VOLUMES.PNPM_STORE}:/home/coder/.local/share/pnpm/store`,
                        `${SHARED_VOLUMES.PIP_CACHE}:/home/coder/.cache/pip`,
                        `${SHARED_VOLUMES.CARGO_CACHE}:/home/coder/.cargo`,
                        `${SHARED_VOLUMES.GRADLE_CACHE}:/home/coder/.gradle`,
                        `${SHARED_VOLUMES.MAVEN_REPO}:/home/coder/.m2`
                    ],
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
                    "/app/code-server/bin/code-server",
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
                    progressService.emitProgress(workspaceId, "PREPARING", 30, "Downloading core engine components (first-time setup only)...");
                    console.log(`Image ${image} not found. Pulling...`);
                    // Pull image logic
                    await new Promise((resolve, reject) => {
                        docker.pull(image, (err: any, stream: any) => {
                            if (err) return reject(err);
                            // Follow progress
                            docker.modem.followProgress(stream, onFinished, onProgress);

                            function onFinished(err: any, output: any) {
                                if (err) return reject(err);
                                resolve(output);
                            }
                            function onProgress(event: any) {
                                if (event.status === "Downloading") {
                                    const pct = event.progressDetail?.current ? Math.round((event.progressDetail.current / event.progressDetail.total) * 40) + 30 : 35;
                                    progressService.emitProgress(workspaceId, "PREPARING", pct, `Downloading engine: ${event.id || ""}`);
                                }
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
        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) throw new Error("Workspace not found");

        const containerName = `ccw-${workspaceId}`;

        if (AgentManager.isAgentConnected(workspace.ownerId)) {
            // Recalculate options for the agent if needed
            const stack = (workspace as any).stack || "unknown";
            const image = CONFIG.STACK_IMAGES[stack] || CONFIG.STACK_IMAGES.unknown;
            const mountSource = workspace.hostingType === "LOCAL" ? path.join(CONFIG.WORKSPACE_ROOT, workspaceId) : `ccw-vol-${workspaceId}`;

            return await AgentManager.sendCommand(workspace.ownerId, {
                type: "START_CONTAINER",
                workspaceId,
                options: { image, containerName, mountSource, stack, repoUrl: workspace.repoUrl }
            });
        } else {
            // If on cloud but no agent, stop here
            if (process.env.NODE_ENV === "production" || process.env.RENDER) {
                console.error(`[DockerService] ❌ Local agent required but not connected for user ${workspace.ownerId}`);
                throw new Error("Local agent not connected. Please ensure your local agent application is running and connected (check https://collaborative-coding-workspace-1.onrender.com/api/debug/agents)");
            }
        }

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
            progressService.emitProgress(workspaceId, "STARTING", 75, "Waking up container...");
            console.log(`Starting container ${containerName}...`);
            await container.start();
            // Wait for container to be actually running before attempting exec
            await this.waitForContainerRunning(workspaceId);

            // Wait for code-server to initialize
            progressService.emitProgress(workspaceId, "STARTING", 85, "Booting IDE services...");
            console.log(`Waiting for code-server to initialize...`);
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Check if we need to clone the repository into the volume
            if (workspace.repoUrl) {
                try {
                    progressService.emitProgress(workspaceId, "CLONING", 90, "Fetching your codebase...");
                    console.log(`Checking if repository clone is needed...`);
                    const checkExec = await container.exec({
                        Cmd: ['sh', '-c', 'ls -A /home/coder/workspace | grep -v "lost+found"'],
                        AttachStdout: true,
                        User: 'abc'
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
                            AttachStderr: true,
                            User: 'abc'
                        });
                        const cloneStream = await cloneExec.start({});
                        await new Promise((resolve) => {
                            cloneStream.on('data', chunk => {
                                const out = chunk.toString().trim();
                                if (out) progressService.emitProgress(workspaceId, "CLONING", 92, `Git: ${out.slice(0, 50)}...`);
                                console.log(`[Clone] ${out}`);
                            });
                            cloneStream.on('end', resolve);
                        });
                        console.log(`Repository cloned successfully.`);
                    }

                    // Auto-stack Bootstrap
                    let currentStack = workspace.stack;
                    if (!currentStack) {
                        console.log(`[DockerService] Stack is missing for ${workspaceId}, attempting detection...`);
                        try {
                            const detectExec = await container.exec({
                                Cmd: ['sh', '-c', 'ls -A /home/coder/workspace'],
                                AttachStdout: true,
                            });
                            const detectStream = await detectExec.start({});
                            let detectOutput = "";
                            await new Promise((resolve) => {
                                detectStream.on('data', chunk => detectOutput += chunk.toString());
                                detectStream.on('end', resolve);
                            });
                            const { detectStack } = await import("../lib/stack-detector");
                            currentStack = detectStack(detectOutput.split("\n"));
                            await prisma.workspace.update({ where: { id: workspaceId }, data: { stack: currentStack } as any });
                        } catch (e) {
                            console.warn(`[DockerService] Fallback detection failed:`, e);
                        }
                    }

                    progressService.emitProgress(workspaceId, "BOOTSTRAPPING", 95, `Optimizing environment for ${currentStack}...`);
                    console.log(`[DockerService] Bootstrapping workspace for stack: ${currentStack}...`);
                    let bootstrapCmd = "";
                    switch (currentStack) {
                        case "node":
                            // Install Node.js if missing, then pnpm/yarn/npm install
                            bootstrapCmd = "if ! command -v node >/dev/null; then apt-get update && apt-get install -y nodejs npm && npm install -g pnpm yarn; fi && if [ -f package.json ]; then pnpm install --legacy-peer-deps || yarn install || npm install --legacy-peer-deps; fi";
                            break;
                        case "rust":
                            // Install Rust if missing, then cargo build
                            bootstrapCmd = "if ! command -v cargo >/dev/null; then curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && . $HOME/.cargo/env; fi && if [ -f Cargo.toml ]; then cargo build; fi";
                            break;
                        case "python":
                            // Install Python/pip if missing
                            bootstrapCmd = "if ! command -v python3 >/dev/null; then apt-get update && apt-get install -y python3 python3-pip python3-venv; fi && if [ -f requirements.txt ]; then pip3 install -r requirements.txt; elif [ -f pyproject.toml ]; then pip3 install .; fi";
                            break;
                        case "go":
                            // Install Go if missing
                            bootstrapCmd = "if ! command -v go >/dev/null; then apt-get update && apt-get install -y golang-go; fi && if [ -f go.mod ]; then go mod download; fi";
                            break;
                        case "java":
                            bootstrapCmd = "if ! command -v mvn >/dev/null; then apt-get update && apt-get install -y openjdk-17-jdk maven gradle; fi && if [ -f pom.xml ]; then mvn install -DskipTests; elif [ -f build.gradle ]; then ./gradlew build -x test; fi";
                            break;
                        case "php":
                            bootstrapCmd = "if ! command -v php >/dev/null; then apt-get update && apt-get install -y php php-cli composer; fi && if [ -f composer.json ]; then composer install; fi";
                            break;
                    }

                    if (bootstrapCmd) {
                        console.log(`[DockerService] Running bootstrap for ${currentStack}: ${bootstrapCmd}`);
                        const bootstrapExec = await container.exec({
                            Cmd: ['sh', '-c', `export PATH="/home/coder/.local/bin:$PATH"; cd /home/coder/workspace && ${bootstrapCmd} && chown -R abc:abc /home/coder/workspace`],
                            AttachStdout: true,
                            AttachStderr: true,
                            User: 'root'
                        });
                        const bootstrapStream = await bootstrapExec.start({});
                        await new Promise((resolve) => {
                            bootstrapStream.on('data', chunk => {
                                const output = chunk.toString().trim();
                                if (output) {
                                    progressService.emitProgress(workspaceId, "BOOTSTRAPPING", 97, `Setup: ${output.slice(0, 40)}...`);
                                    console.log(`[Bootstrap Output] ${output}`);
                                }
                            });
                            bootstrapStream.on('end', resolve);
                        });

                        const { ExitCode } = await bootstrapExec.inspect();
                        if (ExitCode !== 0) {
                            console.error(`[DockerService] Bootstrap failed with exit code ${ExitCode}`);
                        } else {
                            console.log(`[DockerService] Bootstrap completed successfully`);
                        }
                    }

                } catch (cloneErr) {
                    console.error("Failed to setup environment inside container", cloneErr);
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

        progressService.emitProgress(workspaceId, "COMPLETED", 100, "Environment ready! Finalizing connection...");
        console.log(`Container ${containerName} is running on host port ${port}`);
        return { workspaceId, port };
    }

    static async stopContainer(workspaceId: string) {
        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) throw new Error("Workspace not found");

        if (workspace && AgentManager.isAgentConnected(workspace.ownerId)) {
            return await AgentManager.sendCommand(workspace.ownerId, {
                type: "STOP_CONTAINER",
                workspaceId
            });
        }

        if (process.env.NODE_ENV === "production" || process.env.RENDER) {
            throw new Error("Local agent not connected.");
        }

        const container = docker.getContainer(`ccw-${workspaceId}`);
        const data = await container.inspect().catch(() => null);
        if (data && data.State.Running) {
            await container.stop();
        }
    }

    static async stopAndRemoveContainer(workspaceId: string) {
        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (workspace && AgentManager.isAgentConnected(workspace.ownerId)) {
            return await AgentManager.sendCommand(workspace.ownerId, {
                type: "CLEANUP", // Using CLEANUP for stop and remove
                workspaceId
            });
        }

        if (process.env.NODE_ENV === "production" || process.env.RENDER) {
            throw new Error("Local agent not connected.");
        }

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
        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (workspace && AgentManager.isAgentConnected(workspace.ownerId)) {
            const resp = await AgentManager.sendCommand(workspace.ownerId, {
                type: "GET_STATUS",
                workspaceId
            });
            return resp.status;
        }

        if (process.env.NODE_ENV === "production" || process.env.RENDER) {
            return "OFFLINE"; // Fallback for cloud without agent
        }

        const container = docker.getContainer(`ccw-${workspaceId}`);
        const data = await container.inspect().catch(() => null);
        if (!data) return "OFFLINE";
        return data.State.Running ? "RUNNING" : "STOPPED";
    }

    static async restartContainer(workspaceId: string) {
        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (workspace && AgentManager.isAgentConnected(workspace.ownerId)) {
            return await AgentManager.sendCommand(workspace.ownerId, {
                type: "RESTART_CONTAINER",
                workspaceId
            });
        }

        if (process.env.NODE_ENV === "production" || process.env.RENDER) {
            throw new Error("Local agent not connected.");
        }
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
            // Ensure container is running before exec
            await this.waitForContainerRunning(workspaceId);

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
                AttachStderr: true,
                User: 'abc'
            });

            await exec.start({});
            console.log(`[DockerService] Provisioned default VS Code settings inside container ${containerName}`);
        } catch (error) {
            console.error(`Failed to create VS Code settings for workspace ${workspaceId}:`, error);
        }
    }

    static async waitForContainerRunning(workspaceId: string, timeoutMs: number = 30000) {
        const container = docker.getContainer(`ccw-${workspaceId}`);
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            const data = await container.inspect();
            if (data.State.Running && !data.State.Restarting) {
                return;
            }
            if (!data.State.Restarting && data.State.Status === "exited") {
                throw new Error(`Container exited with code ${data.State.ExitCode}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        throw new Error(`Timeout waiting for container ${workspaceId} to be running`);
    }

    static async cleanupStaleContainers() {
        if (process.env.NODE_ENV === "production" || process.env.RENDER) {
            // No local cleanup on cloud (handled by agent or Render)
            return;
        }

        try {
            const containers = await docker.listContainers({ all: true });
            const ccwContainers = containers.filter(c => c.Names.some(name => name.startsWith("/ccw-")));

            for (const c of ccwContainers) {
                // If container is exited, remove it
                if (c.State === "exited" || c.State === "dead") {
                    try {
                        console.log(`[Cleanup] Removing stale container ${c.Names[0]}...`);
                        await docker.getContainer(c.Id).remove({ force: true });
                    } catch (err) {
                        console.error(`[Cleanup] Failed to remove ${c.Id}`, err);
                    }
                }
            }
        } catch (e) {
            console.error("Cleanup error:", e);
        }
    }
}
