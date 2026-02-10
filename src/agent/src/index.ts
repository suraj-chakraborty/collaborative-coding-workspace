#!/usr/bin/env node

import { io, Socket } from "socket.io-client";
import Docker from "dockerode";
import { Command } from "commander";
import dotenv from "dotenv";
import http from "http";
import chalk from "chalk";
// @ts-ignore
import prompts from "prompts";
import { StatusDisplay } from "./utils/status-display";
import { ProcessManager } from "./utils/process-manager";

dotenv.config();

const program = new Command();

program
    .name("CCW")
    .version("1.0.0")
    .description("Collab Cloud Local Agent");

// Start command (default)
program
    .command("start", { isDefault: true })
    .description("Start the agent")
    .option("-k, --key <key>", "API Key for authentication")
    .option("-s, --server <url>", "Backend Server URL", "http://localhost:3001")
    .option("-p, --port <number>", "Local container port", "8080")
    .action(async (options) => {
        await startAgent(options);
    });

// Stop command
program
    .command("stop")
    .description("Stop the running agent")
    .action(() => {
        stopAgent();
    });

program.parse(process.argv);

// Start Agent Logic
async function startAgent(options: any) {
    console.log(chalk.cyan("Starting CCW Agent..."));

    // Check if already running
    const existingPid = ProcessManager.getPid();
    if (existingPid && ProcessManager.isProcessRunning(existingPid)) {
        console.log(chalk.yellow(`Agent is already running (PID: ${existingPid})`));
        console.log(chalk.dim(`Run 'CCW stop' to stop it first.`));
        process.exit(1);
    }

    // Prompt for key if not provided
    if (!options.key) {
        const response = await prompts({
            type: 'text',
            name: 'key',
            message: 'Enter your Workspace API Key:',
            validate: (value: string) => value.length > 0 ? true : 'API Key is required'
        });

        if (!response.key) {
            console.error(chalk.red("API Key is required."));
            process.exit(1);
        }
        options.key = response.key;
    }

    // Save PID
    ProcessManager.savePid();

    // Initialize status display
    const statusDisplay = new StatusDisplay(options.server);

    console.log(chalk.green(`\n✓ Connecting to ${options.server}/agent...\n`));

    const docker = new Docker();
    const socket: Socket = io(`${options.server}/agent`, {
        auth: { token: options.key },
        reconnection: true,
        reconnectionDelay: 1000,
    });

    // Start status display
    statusDisplay.start();

    // Setup socket handlers
    setupSocket(socket, docker, options, statusDisplay);

    // Handle graceful shutdown
    const cleanup = () => {
        console.log(chalk.yellow("\n\nShutting down gracefully..."));
        statusDisplay.stop();
        socket.disconnect();
        ProcessManager.removePid();
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

// Stop Agent Logic
function stopAgent() {
    const pid = ProcessManager.getPid();

    if (!pid) {
        console.log(chalk.yellow("No running agent found."));
        return;
    }

    if (!ProcessManager.isProcessRunning(pid)) {
        console.log(chalk.yellow("Agent process is not running (stale PID file)."));
        ProcessManager.removePid();
        return;
    }

    console.log(chalk.cyan(`Stopping agent (PID: ${pid})...`));

    if (ProcessManager.stopProcess(pid)) {
        console.log(chalk.green("✓ Agent stopped successfully."));
        ProcessManager.removePid();
    } else {
        console.log(chalk.red("✗ Failed to stop agent."));
    }
}

// Setup Socket Event Handlers
function setupSocket(socket: Socket, docker: Docker, options: any, statusDisplay: StatusDisplay) {
    socket.on("connect", () => {
        statusDisplay.updateConnection(true, socket.id);
    });

    socket.on("disconnect", () => {
        statusDisplay.updateConnection(false);
    });

    socket.on("connect_error", (err) => {
        // Silently handle connection errors (status display shows disconnected state)
    });

    // --- Docker Management ---
    socket.on("docker:spawn", async (data, callback) => {
        const { workspaceId, image, env } = data;

        try {
            const containerName = `ccw-${workspaceId}`;
            const existing = docker.getContainer(containerName);

            try {
                const info = await existing.inspect();
                if (info.State.Running) {
                    callback({ success: true, port: 8080 });
                    return;
                } else {
                    await existing.start();
                    statusDisplay.incrementContainers();
                    callback({ success: true, port: 8080 });
                    return;
                }
            } catch (e: any) {
                if (e.statusCode !== 404) throw e;
            }

            // Create new
            const container = await docker.createContainer({
                Image: image || "linuxserver/code-server:latest",
                name: containerName,
                ExposedPorts: { "8080/tcp": {} },
                HostConfig: {
                    PortBindings: { "8080/tcp": [{ HostPort: options.port }] },
                    Binds: []
                },
                Env: env || []
            });

            await container.start();
            statusDisplay.incrementContainers();
            callback({ success: true, port: options.port });

        } catch (err: any) {
            callback({ success: false, error: err.message });
        }
    });

    socket.on("docker:stop", async (data, callback) => {
        try {
            const container = docker.getContainer(`ccw-${data.workspaceId}`);
            await container.stop();
            statusDisplay.decrementContainers();
            callback({ success: true });
        } catch (err: any) {
            callback({ success: false, error: err.message });
        }
    });

    // --- Tunneling Logic (Simple HTTP Proxy over Socket) ---
    socket.on("proxy:http:request", async (data) => {
        const { requestId, method, url, headers, body } = data;
        const targetUrl = `http://127.0.0.1:${options.port}${url}`;

        statusDisplay.incrementRequests();

        try {
            const req = http.request(targetUrl, {
                method,
                headers: { ...headers, host: `127.0.0.1:${options.port}` }
            }, (res) => {
                socket.emit("proxy:http:response:start", {
                    requestId,
                    statusCode: res.statusCode,
                    headers: res.headers
                });

                res.on("data", (chunk) => {
                    socket.emit("proxy:http:response:chunk", {
                        requestId,
                        chunk
                    });
                });

                res.on("end", () => {
                    socket.emit("proxy:http:response:end", {
                        requestId
                    });
                });
            });

            req.on("error", (err) => {
                socket.emit("proxy:http:response:error", { requestId, statusCode: 502, body: "Bad Gateway" });
            });

            if (body) {
                if (typeof body === "string") {
                    req.write(body);
                } else if (Buffer.isBuffer(body)) {
                    req.write(body);
                } else if (body instanceof Uint8Array) {
                    req.write(Buffer.from(body));
                } else if (typeof body === "object") {
                    req.write(JSON.stringify(body));
                }
            }
            req.end();

        } catch (err) {
            socket.emit("proxy:http:response:error", { requestId, statusCode: 500, body: "Agent Proxy Error" });
        }
    });
}
