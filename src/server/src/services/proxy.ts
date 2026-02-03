import httpProxy from "http-proxy";
import { ServerResponse, IncomingMessage } from "http";
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

export const proxyRequestHandler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || "";
    const match = url.match(/^\/ws\/([^\/]+)/);

    if (!match) {
        res.writeHead(404);
        res.end("Not Found");
        return;
    }

    const workspaceId = match[1];
    (req as any).workspaceId = workspaceId;
    const containerName = `ccw-${workspaceId}`;

    try {
        const hostPort = await getContainerPort(workspaceId);
        const target = `http://127.0.0.1:${hostPort}`;

        // Strip the /ws/:id prefix because code-server runs at root
        req.url = url.replace(/^\/ws\/[^\/]+/, "");
        if (req.url === "") req.url = "/";

        // Manual Host header rewrite is still good practice to ensure code-server sees 'localhost'
        proxy.web(req, res, {
            target,
            headers: {
                "Host": `127.0.0.1:${hostPort}`,
                "Origin": `http://127.0.0.1:${hostPort}`
            }
        }, (err) => {
            console.error(`Proxy error for workspace ${workspaceId}:`, err);
            if (!res.writableEnded) {
                res.writeHead(500);
                res.end("Proxy Error");
            }
        });
    } catch (error) {
        console.error("Proxy error:", error);
        res.writeHead(404);
        res.end("Workspace not found or container not running");
    }
};
