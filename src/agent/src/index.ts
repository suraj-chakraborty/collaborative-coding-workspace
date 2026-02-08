import { io, Socket } from "socket.io-client";
import Docker from "dockerode";
import dotenv from "dotenv";
import path from "path";
import fs from "fs-extra";
import { ConfigManager, AgentConfig } from "./config-manager";

dotenv.config();

const docker = new Docker(); // Defaults to /var/run/docker.sock or Windows named pipe
const terminalSessions = new Map<string, any>();
let socket: Socket;

export async function startAgent(overrides?: Partial<AgentConfig>) {
    const config = await ConfigManager.getMergedConfig();
    const SERVER_URL = overrides?.serverUrl || config.serverUrl;
    const AUTH_TOKEN = overrides?.authToken || config.authToken;
    const USER_ID = overrides?.userId || config.userId;

    if (!USER_ID) {
        console.error("❌ ERROR: USER_ID is missing. Use 'collab-agent config' to set your configuration.");
        return;
    }

    console.log(`[Agent] 🚀 Connecting to ${SERVER_URL}/agent...`);

    socket = io(`${SERVER_URL}/agent`, {
        auth: {
            token: AUTH_TOKEN,
            userId: USER_ID
        },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
        console.log("✅ [Agent] Connected to cloud backend");
    });

    socket.on("disconnect", (reason) => {
        console.log("❌ [Agent] Disconnected:", reason);
        if (reason === "io server disconnect") {
            socket.connect();
        }
    });

    socket.on("reconnect", (attemptNumber) => {
        console.log("✅ [Agent] Reconnected on attempt:", attemptNumber);
    });

    socket.on("connect_error", (err) => {
        console.error("❌ [Agent] Connection error:", err.message);
        if (err.message.includes("Authentication error")) {
            console.error("👉 PRO TIP: Double check your Agent Key / Auth Token");
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
                case "FS_TREE":
                    await handleFsTree(workspaceId, callback);
                    break;
                case "FS_READ":
                    await handleFsRead(workspaceId, options.path, callback);
                    break;
                case "FS_WRITE":
                    await handleFsWrite(workspaceId, options.path, options.content, callback);
                    break;
                case "FS_DELETE":
                    await handleFsDelete(workspaceId, options.path, callback);
                    break;
                case "FS_RENAME":
                    await handleFsRename(workspaceId, options.oldPath, options.newPath, callback);
                    break;
                case "FS_MKDIR":
                    await handleFsMkdir(workspaceId, options.path, callback);
                    break;
                case "TERMINAL_INIT":
                    await handleTerminalInit(workspaceId, callback);
                    break;
                case "TERMINAL_INPUT":
                    handleTerminalInput(workspaceId, options.input);
                    callback({ success: true });
                    break;
                default:
                    callback({ error: `Unknown command type: ${type}` });
            }
        } catch (err: any) {
            console.error("[Agent] command error:", err.message);
            callback({ error: err.message });
        }
    });
}

// Helper to run exec commands in container
async function runExec(container: any, command: string[], user: string = "abc", workingDir: string = "/config/workspace") {
    const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        User: user,
        WorkingDir: workingDir
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise((resolve, reject) => {
        let output = "";
        container.modem.demuxStream(stream, { write: (chunk: any) => output += chunk }, { write: (chunk: any) => output += chunk });
        stream.on("end", () => resolve(output));
        stream.on("error", reject);
    });
}

async function handleStartContainer(workspaceId: string, options: any, callback: any) {
    const containerName = `ccw-${workspaceId}`;
    let container = docker.getContainer(containerName);

    try {
        const data = await container.inspect().catch(() => null);
        if (!data) {
            console.log(`[Agent] 🏗️ Creating container ${containerName} using image ${options.image}...`);
            container = await docker.createContainer({
                Image: options.image || "linuxserver/code-server:latest",
                name: containerName,
                Env: [
                    "DEFAULT_WORKSPACE=/config/workspace"
                ],
                HostConfig: {
                    PortBindings: { "3000/tcp": [{ HostPort: "" }] },
                    Binds: options.mountSource ? [`${options.mountSource}:/config/workspace`] : []
                },
                Cmd: [
                    "/app/code-server/bin/code-server",
                    "--auth", "none",
                    "--bind-addr", "0.0.0.0:3000",
                    "/config/workspace"
                ],
            });
        }

        const freshData = await container.inspect();
        if (!freshData.State.Running) {
            console.log(`[Agent] 🚀 Starting container ${containerName}...`);
            await container.start();
            // Give it a moment to boot
            await new Promise(r => setTimeout(r, 2000));
        }

        // Setup: Clone Repo if needed
        console.log(`[Agent] Setup options:`, { repoUrl: options.repoUrl, hasToken: !!options.repoToken });

        if (options.repoUrl) {
            try {
                console.log(`[Agent] Checking if repo needs cloning...`);
                const files = await runExec(container, ["ls", "-A", "/config/workspace"], "abc");
                console.log(`[Agent] Current workspace files:`, files);

                if (!files || (files as string).trim().length === 0) {
                    // Build clone URL with token if available (for private repos)
                    let cloneUrl = options.repoUrl;
                    if (options.repoToken) {
                        cloneUrl = options.repoUrl.replace("https://", `https://${options.repoToken}@`);
                    }

                    console.log(`[Agent] 📥 Cloning ${options.repoUrl}...`);
                    const cloneResult = await runExec(container, ["git", "clone", cloneUrl, "."], "abc");
                    console.log(`[Agent] ✅ Clone complete. Output:`, cloneResult);
                } else {
                    console.log(`[Agent] Workspace not empty, skipping clone.`);
                }

                // Detect stack from cloned files
                let detectedStack = options.stack;
                console.log(`[Agent] 🔍 Detecting stack (current: ${detectedStack})...`);

                const lsOutput = await runExec(container, ["ls", "-A", "/config/workspace"], "abc") as string;
                console.log(`[Agent] Workspace file listing:`, lsOutput);

                const fileList = lsOutput.split(/\s+/).map(f => f.trim().toLowerCase()).filter(Boolean);
                console.log(`[Agent] Parsed file list:`, fileList);

                if (fileList.includes("next.config.js") || fileList.includes("next.config.mjs") || fileList.includes("next.config.ts")) {
                    detectedStack = "nextjs";
                } else if (fileList.includes("package.json")) {
                    detectedStack = "node";
                } else if (fileList.includes("cargo.toml")) {
                    detectedStack = "rust";
                } else if (fileList.includes("requirements.txt") || fileList.includes("pyproject.toml")) {
                    detectedStack = "python";
                } else if (fileList.includes("go.mod")) {
                    detectedStack = "go";
                } else if (fileList.includes("pom.xml") || fileList.includes("build.gradle")) {
                    detectedStack = "java";
                }
                console.log(`[Agent] 🎯 Detected stack: ${detectedStack}`);

                // Install runtime environment based on detected stack
                console.log(`[Agent] 🔧 Setting up runtime environment for ${detectedStack}...`);
                try {
                    if (detectedStack === "node" || detectedStack === "nextjs") {
                        // Check if Node.js is already installed
                        const nodeCheck = await runExec(container, ["which", "node"], "abc").catch(() => null);
                        if (!nodeCheck) {
                            console.log(`[Agent] 📦 Installing Node.js and npm...`);
                            await runExec(container, ["apk", "add", "--no-cache", "nodejs", "npm"], "root");
                            console.log(`[Agent] ✅ Node.js installed.`);
                        } else {
                            console.log(`[Agent] ✅ Node.js already installed.`);
                        }
                    } else if (detectedStack === "python") {
                        const pythonCheck = await runExec(container, ["which", "python3"], "abc").catch(() => null);
                        if (!pythonCheck) {
                            console.log(`[Agent] 📦 Installing Python and pip...`);
                            await runExec(container, ["apk", "add", "--no-cache", "python3", "py3-pip"], "root");
                            console.log(`[Agent] ✅ Python installed.`);
                        } else {
                            console.log(`[Agent] ✅ Python already installed.`);
                        }
                    } else if (detectedStack === "go") {
                        const goCheck = await runExec(container, ["which", "go"], "abc").catch(() => null);
                        if (!goCheck) {
                            console.log(`[Agent] 📦 Installing Go...`);
                            await runExec(container, ["apk", "add", "--no-cache", "go"], "root");
                            console.log(`[Agent] ✅ Go installed.`);
                        } else {
                            console.log(`[Agent] ✅ Go already installed.`);
                        }
                    } else if (detectedStack === "rust") {
                        const rustCheck = await runExec(container, ["which", "cargo"], "abc").catch(() => null);
                        if (!rustCheck) {
                            console.log(`[Agent] 📦 Installing Rust...`);
                            await runExec(container, ["apk", "add", "--no-cache", "rust", "cargo"], "root");
                            console.log(`[Agent] ✅ Rust installed.`);
                        } else {
                            console.log(`[Agent] ✅ Rust already installed.`);
                        }
                    } else if (detectedStack === "java") {
                        const javaCheck = await runExec(container, ["which", "java"], "abc").catch(() => null);
                        if (!javaCheck) {
                            console.log(`[Agent] 📦 Installing Java (OpenJDK)...`);
                            await runExec(container, ["apk", "add", "--no-cache", "openjdk17"], "root");
                            console.log(`[Agent] ✅ Java installed.`);
                        } else {
                            console.log(`[Agent] ✅ Java already installed.`);
                        }
                    }
                } catch (runtimeErr) {
                    console.error(`[Agent] ⚠️ Runtime installation failed (non-fatal):`, runtimeErr);
                }

                // Post-clone environment setup based on detected stack (blocking)
                if (detectedStack === "node" || detectedStack === "nextjs") {
                    console.log(`[Agent] 🔧 Running npm install (this may take a while)...`);
                    try {
                        const npmOut = await runExec(container, ["npm", "install"], "abc");
                        console.log(`[Agent] ✅ npm install completed.`);
                    } catch (e) {
                        console.error("[Agent] ⚠️ npm install failed (non-fatal):", e);
                    }
                } else if (detectedStack === "python") {
                    console.log(`[Agent] 🐍 Running pip install...`);
                    try {
                        await runExec(container, ["pip3", "install", "-r", "requirements.txt"], "abc");
                        console.log(`[Agent] ✅ pip install completed.`);
                    } catch (e) {
                        console.error("[Agent] ⚠️ pip install failed (non-fatal):", e);
                    }
                } else if (detectedStack === "go") {
                    console.log(`[Agent] 🔧 Running go mod download...`);
                    try {
                        await runExec(container, ["go", "mod", "download"], "abc");
                        console.log(`[Agent] ✅ go mod download completed.`);
                    } catch (e) {
                        console.error("[Agent] ⚠️ go mod download failed (non-fatal):", e);
                    }
                } else if (detectedStack === "rust") {
                    console.log(`[Agent] 🦀 Running cargo build...`);
                    try {
                        await runExec(container, ["cargo", "build"], "abc");
                        console.log(`[Agent] ✅ cargo build completed.`);
                    } catch (e) {
                        console.error("[Agent] ⚠️ cargo build failed (non-fatal):", e);
                    }
                }
            } catch (err) {
                console.error("[Agent] ⚠️ Post-start setup warning:", err);
            }
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

// FS Handlers
const getWorkspaceRoot = (workspaceId: string) => {
    const root = process.env.WORKSPACE_ROOT || path.join(process.cwd(), "workspaces");
    return path.join(root, workspaceId);
};

async function handleFsTree(workspaceId: string, callback: any) {
    try {
        const containerName = `ccw-${workspaceId}`;
        const container = docker.getContainer(containerName);

        // Check if container exists
        const data = await container.inspect().catch(() => null);
        if (!data || !data.State.Running) {
            console.log(`[Agent] Container ${containerName} not running, returning empty tree`);
            return callback([]);
        }

        // Use ls -lAR to get recursive listing with file types
        const lsOutput = await runExec(container, ["ls", "-lAR", "/config/workspace"], "abc") as string;

        // Parse ls output into tree structure
        const tree: any[] = [];
        const pathMap: Record<string, any> = { "": { children: tree } };

        let currentDir = "";
        const lines = lsOutput.split("\n");

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Directory header: /config/workspace/path:
            if (trimmed.startsWith("/config/workspace")) {
                currentDir = trimmed.replace("/config/workspace", "").replace(":", "").replace(/^\//, "");
                continue;
            }

            // Skip total line
            if (trimmed.startsWith("total")) continue;

            // Parse file/directory line: drwxr-xr-x ... name
            const match = trimmed.match(/^([d-])[rwx-]+\s+\d+\s+\w+\s+\w+\s+\d+\s+\w+\s+\d+\s+[\d:]+\s+(.+)$/);
            if (!match) continue;

            const isDir = match[1] === "d";
            const name = match[2];

            // Skip . and ..
            if (name === "." || name === "..") continue;

            const fullPath = currentDir ? `${currentDir}/${name}` : name;

            const node = {
                name,
                path: "/" + fullPath,
                type: isDir ? "directory" : "file",
                children: isDir ? [] : undefined
            };

            // Find parent
            const parent = pathMap[currentDir] || pathMap[""];
            if (parent && parent.children) {
                parent.children.push(node);
            }

            if (isDir) {
                pathMap[fullPath] = node;
            }
        }

        callback(tree);
    } catch (err: any) {
        console.error("[Agent] FS_TREE error:", err.message);
        callback({ error: err.message });
    }
}

async function handleFsRead(workspaceId: string, filePath: string, callback: any) {
    try {
        const containerName = `ccw-${workspaceId}`;
        const container = docker.getContainer(containerName);
        const targetPath = `/config/workspace${filePath}`;

        const exec = await container.exec({
            Cmd: ["cat", targetPath],
            AttachStdout: true,
            AttachStderr: true,
            User: "abc"
        });

        const stream = await exec.start({ hijack: true, stdin: false });

        let content = "";
        let error = "";
        await new Promise<void>((resolve) => {
            container.modem.demuxStream(
                stream,
                { write: (chunk: any) => content += chunk },
                { write: (chunk: any) => error += chunk }
            );
            stream.on("end", resolve);
        });

        if (error.includes("No such file")) {
            return callback({ error: "File not found" });
        }
        callback({ content });
    } catch (err: any) {
        callback({ error: err.message });
    }
}

async function handleFsWrite(workspaceId: string, filePath: string, content: string, callback: any) {
    try {
        const containerName = `ccw-${workspaceId}`;
        const container = docker.getContainer(containerName);
        const targetPath = `/config/workspace${filePath}`;

        // Create parent directory if needed
        const parentDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
        await runExec(container, ["mkdir", "-p", parentDir], "abc");

        // Write content using echo and redirect (base64 to handle special chars)
        const b64Content = Buffer.from(content || "").toString("base64");
        await runExec(container, ["sh", "-c", `echo '${b64Content}' | base64 -d > '${targetPath}'`], "abc");

        callback({ success: true });
    } catch (err: any) {
        callback({ error: err.message });
    }
}

async function handleFsDelete(workspaceId: string, filePath: string, callback: any) {
    try {
        const containerName = `ccw-${workspaceId}`;
        const container = docker.getContainer(containerName);
        const targetPath = `/config/workspace${filePath}`;

        await runExec(container, ["rm", "-rf", targetPath], "abc");
        callback({ success: true });
    } catch (err: any) {
        callback({ error: err.message });
    }
}

async function handleFsRename(workspaceId: string, oldPath: string, newPath: string, callback: any) {
    try {
        const containerName = `ccw-${workspaceId}`;
        const container = docker.getContainer(containerName);
        const sourcePath = `/config/workspace${oldPath}`;
        const destPath = `/config/workspace${newPath}`;

        // Create parent directory if needed
        const parentDir = destPath.substring(0, destPath.lastIndexOf("/"));
        await runExec(container, ["mkdir", "-p", parentDir], "abc");

        await runExec(container, ["mv", sourcePath, destPath], "abc");
        callback({ success: true });
    } catch (err: any) {
        callback({ error: err.message });
    }
}

async function handleFsMkdir(workspaceId: string, dirPath: string, callback: any) {
    try {
        const workspaceRoot = getWorkspaceRoot(workspaceId);
        const targetPath = path.join(workspaceRoot, dirPath.replace(/^\//, ""));

        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }
        callback({ success: true });
    } catch (err: any) {
        callback({ error: err.message });
    }
}

async function handleTerminalInit(workspaceId: string, callback: any) {
    const containerName = `ccw-${workspaceId}`;
    const container = docker.getContainer(containerName);

    try {
        const data = await container.inspect();
        if (!data.State.Running) throw new Error("Container not running");

        // Cleanup existing if any
        if (terminalSessions.has(workspaceId)) {
            terminalSessions.get(workspaceId).destroy();
            terminalSessions.delete(workspaceId);
        }

        const exec = await container.exec({
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,
            User: 'abc', // Matching the server's user
            WorkingDir: '/config/workspace',
            Cmd: ['/bin/sh'] // Fallback to sh for local compatibility
        });

        const stream = await exec.start({
            hijack: true,
            stdin: true
        });

        terminalSessions.set(workspaceId, stream);

        stream.on('data', (chunk: Buffer) => {
            if (socket) {
                socket.emit("terminal-output", { workspaceId, output: chunk.toString() });
            }
        });

        stream.on('end', () => {
            terminalSessions.delete(workspaceId);
        });

        stream.on('error', () => {
            terminalSessions.delete(workspaceId);
        });

        callback({ success: true });
    } catch (err: any) {
        console.error(`[Agent] Terminal Init Error: ${err.message}`);
        callback({ error: err.message });
    }
}

function handleTerminalInput(workspaceId: string, input: string) {
    const stream = terminalSessions.get(workspaceId);
    if (stream && stream.writable) {
        stream.write(input);
    }
}
