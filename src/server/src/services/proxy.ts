import httpProxy from "http-proxy";
import { ServerResponse, IncomingMessage } from "http";
import * as fs from 'fs';
import * as path from 'path';
import Dockerode from "dockerode";
import { CONFIG } from "../config";

export const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
});

// For HTTP requests that might be intending to upgrade
proxy.on("proxyReq", (proxyReq, req, res, options) => {
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === "websocket") {
        proxyReq.setHeader("Connection", "Upgrade");
        proxyReq.setHeader("Upgrade", "websocket");
    }
});

// For explicit WebSocket proxying
proxy.on("proxyReqWs", (proxyReq, req, socket, options, head) => {
    proxyReq.setHeader("Connection", "Upgrade");
    proxyReq.setHeader("Upgrade", "websocket");
});

// Intercept responses to rewrite redirects
proxy.on("proxyRes", (proxyRes, req, res) => {
    const location = proxyRes.headers["location"];
    if (location && (req as any).workspaceId) {
        const workspaceId = (req as any).workspaceId;
        // If it's a relative redirect or a root redirect, prefix it, but avoid double prefixing
        if (location.startsWith("/") && !location.startsWith(`/ws/${workspaceId}`)) {
            proxyRes.headers["location"] = `/ws/${workspaceId}${location}`;
        }
    }
});

const docker = new Dockerode();

export const getContainerPort = async (workspaceId: string) => {
    const containerName = `ccw-${workspaceId}`;
    const container = docker.getContainer(containerName);
    const data = await container.inspect();

    if (!data.State.Running) {
        throw new Error("Container not running");
    }

    const portBindings = data.NetworkSettings.Ports[`${CONFIG.CONTAINER_PORT}/tcp`];
    if (!portBindings || portBindings.length === 0) {
        throw new Error("No port bindings found");
    }

    return portBindings[0].HostPort;
};

import { prisma } from "../lib/prisma";
import { AgentService } from "./agent";

// ... existing code ...

// Helper for file logging
function logFile(msg: string) {
    try {
        fs.appendFileSync(path.join(process.cwd(), 'proxy-debug.log'), `[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) { /* ignore */ }
}

export const proxyRequestHandler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || "";
    logFile(`Incoming request: ${req.method} ${url}`);

    // Pause the request stream to prevent data loss during async operations
    if (req.readable && !req.readableEnded) {
        req.pause();
    }

    console.log(`[Proxy] Incoming request: ${req.method} ${url}`);

    const match = url.match(/^\/ws\/([^\/]+)/);

    if (!match) {
        console.log(`[Proxy] No match for /ws/ pattern`);
        res.writeHead(404);
        res.end("Not Found");
        return;
    }

    const workspaceId = match[1];
    (req as any).workspaceId = workspaceId;
    console.log(`[Proxy] Workspace ID: ${workspaceId}`);

    try {
        // 1. Fetch Workspace Hosting Type and Container Info
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                hostingType: true,
                ownerId: true,
                id: true,
                localPort: true,
                containers: {
                    where: { status: "RUNNING" },
                    orderBy: { createdAt: "desc" },
                    take: 1
                }
            }
        });

        logFile(`Workspace found: ${workspace ? JSON.stringify({ type: workspace.hostingType, id: workspace.id }) : 'null'}`);

        if (!workspace) {
            logFile(`Workspace not found`);
            res.writeHead(404);
            res.end("Workspace not found");
            return;
        }

        // 2. Route based on Hosting Type
        if (workspace.hostingType === "LOCAL") {
            logFile(`Routing to LOCAL agent logic`);
            // Check if Agent is connected
            if (AgentService.isAgentConnected(workspace.ownerId)) {
                // Resume request before passing to agent service
                if (req.readable && !req.readableEnded) req.resume();

                // Strip prefix
                req.url = url.replace(/^\/ws\/[^\/]+/, "");
                if (req.url === "") req.url = "/";

                await AgentService.proxyRequest(workspace.ownerId, req, res);
                return;
            }
            logFile(`Agent not connected, falling through`);
            // Fallback to local Docker (legacy / dev mode)
            // Proceed to existing logic below...
        }

        // 3. Handle CLOUD hosting - proxy to running container
        if (workspace.hostingType === "CLOUD") {
            logFile(`Routing to CLOUD container logic`);
            // For CLOUD hosting, we look for a running Docker container named ccw-{workspaceId}
            // The container should be spawned via the Docker service
            try {
                const hostPort = await getContainerPort(workspaceId);
                logFile(`Found container port: ${hostPort}`);
                const target = `http://127.0.0.1:${hostPort}`;

                // Strip the /ws/:id prefix because code-server runs at root
                req.url = url.replace(/^\/ws\/[^\/]+/, "");
                if (req.url === "") req.url = "/";

                // Resume request before proxying
                if (req.readable && !req.readableEnded) req.resume();

                proxy.web(req, res, {
                    target,
                    headers: {
                        "Host": `127.0.0.1:${hostPort}`,
                        "Origin": `http://127.0.0.1:${hostPort}`
                    }
                }, (err) => {
                    logFile(`Proxy error: ${err.message}`);
                    console.error(`Proxy error for workspace ${workspaceId}:`, err);
                    if (!res.writableEnded) {
                        res.writeHead(502);
                        res.end("Container not reachable. Is the container running?");
                    }
                });
                return;
            } catch (error) {
                logFile(`Container setup error: ${error}`);
                console.error(`Cloud container error for workspace ${workspaceId}:`, error);
                res.writeHead(503);
                res.end("Cloud IDE container is not running. Please start the workspace first.");
                return;
            }
        }

        // 4. Fallback / Existing Docker Logic (for LOCAL without agent)
        const containerName = `ccw-${workspaceId}`;
        const hostPort = await getContainerPort(workspaceId);
        const target = `http://127.0.0.1:${hostPort}`;

        // Strip the /ws/:id prefix because code-server runs at root
        req.url = url.replace(/^\/ws\/[^\/]+/, "");
        if (req.url === "") req.url = "/";

        // Resume request before proxying
        if (req.readable && !req.readableEnded) req.resume();

        // Manual Host header rewrite is still good practice to ensure code-server sees 'localhost'
        proxy.web(req, res, {
            target,
            headers: {
                "Host": `127.0.0.1:${hostPort}`,
                "Origin": `http://127.0.0.1:${hostPort}`
            }
        }, (err) => {
            logFile(`Proxy logic error: ${err.message}`);
            console.error(`Proxy error for workspace ${workspaceId}:`, err);
            if (!res.writableEnded) {
                res.writeHead(500);
                res.end("Proxy Error");
            }
        });
    } catch (error) {
        logFile(`Top level proxy error: ${error}`);
        console.error("Proxy error:", error);
        res.writeHead(404);
        res.end("Workspace not found or container not running");
    }
};
