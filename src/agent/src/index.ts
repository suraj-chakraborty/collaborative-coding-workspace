import { io, Socket } from "socket.io-client";
import Docker from "dockerode";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const SERVER_URL = process.env.SERVER_URL || "https://collaborative-coding-workspace-1.onrender.com";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "dev-agent-key";
const USER_ID = process.env.USER_ID;

if (!USER_ID) {
    console.error("USER_ID is required in .env. Please copy your Clerk User ID from the dashboard.");
    // We don't exit here to allow Clerk JWT auth if provided via AUTH_TOKEN, 
    // but the shared key auth needs USER_ID.
}

const docker = new Docker(); // Defaults to /var/run/docker.sock or Windows named pipe

console.log(`[Agent] Connecting to ${SERVER_URL}/agent...`);

const socket: Socket = io(`${SERVER_URL}/agent`, {
    auth: {
        token: AUTH_TOKEN,
        userId: USER_ID
    },
    transports: ["websocket"]
});

socket.on("connect", () => {
    console.log("✅ [Agent] Connected to cloud backend");
});

socket.on("connect_error", (err) => {
    console.error("❌ [Agent] Connection error:", err.message);
    if (err.message.includes("Authentication error")) {
        console.error("👉 PRO TIP: Double check your AUTH_TOKEN in .env");
    }
});

socket.on("agent-command", async (command: any, callback: (res: any) => void) => {
    console.log("[Agent] Received command:", command);
    const { type, workspaceId, options } = command;

    try {
        switch (type) {
            case "START_CONTAINER":
                await handleStartContainer(workspaceId, options, callback);
                break;
            case "STOP_CONTAINER":
                await handleStopContainer(workspaceId, callback);
                break;
            case "RESTART_CONTAINER":
                await handleRestartContainer(workspaceId, callback);
                break;
            case "GET_STATUS":
                await handleGetStatus(workspaceId, callback);
                break;
            default:
                callback({ error: `Unknown command type: ${type}` });
        }
    } catch (err: any) {
        console.error("[Agent] command error:", err.message);
        callback({ error: err.message });
    }
});

async function handleStartContainer(workspaceId: string, options: any, callback: any) {
    const containerName = `ccw-${workspaceId}`;
    let container = docker.getContainer(containerName);

    try {
        const data = await container.inspect().catch(() => null);
        if (!data) {
            console.log(`[Agent] 🏗️ Creating container ${containerName} using image ${options.image}...`);
            container = await docker.createContainer({
                Image: options.image || "node:18-alpine",
                name: containerName,
                HostConfig: {
                    PortBindings: { "3000/tcp": [{ HostPort: "" }] },
                    // In a real local setup, we might skip complex mounts or use direct paths
                    Binds: options.mountSource ? [`${options.mountSource}:/home/coder/workspace`] : []
                },
                Cmd: [
                    "/app/code-server/bin/code-server",
                    "--auth", "none",
                    "--bind-addr", "0.0.0.0:3000",
                    "/home/coder/workspace"
                ],
            });
        }

        const freshData = await container.inspect();
        if (!freshData.State.Running) {
            console.log(`[Agent] 🚀 Starting container ${containerName}...`);
            await container.start();
        }

        const inspectData = await container.inspect();
        const hostPort = inspectData.NetworkSettings.Ports["3000/tcp"]?.[0]?.HostPort;
        console.log(`[Agent] ✅ Container ${containerName} is running on local port ${hostPort}`);
        callback({ success: true, status: "RUNNING", port: hostPort });
    } catch (err: any) {
        console.error(`[Agent] ❌ Error starting container: ${err.message}`);
        throw err;
    }
}

async function handleStopContainer(workspaceId: string, callback: any) {
    const containerName = `ccw-${workspaceId}`;
    const container = docker.getContainer(containerName);
    const data = await container.inspect().catch(() => null);

    if (data && data.State.Running) {
        console.log(`[Agent] Stopping container ${containerName}...`);
        await container.stop();
    }
    callback({ success: true, status: "STOPPED" });
}

async function handleRestartContainer(workspaceId: string, callback: any) {
    const containerName = `ccw-${workspaceId}`;
    const container = docker.getContainer(containerName);
    console.log(`[Agent] Restarting container ${containerName}...`);
    await container.restart();
    callback({ success: true, status: "RUNNING" });
}

async function handleGetStatus(workspaceId: string, callback: any) {
    const containerName = `ccw-${workspaceId}`;
    const container = docker.getContainer(containerName);
    const data = await container.inspect().catch(() => null);
    callback({ status: data?.State.Running ? "RUNNING" : data ? "STOPPED" : "OFFLINE" });
}
