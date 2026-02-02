import httpProxy from "http-proxy";
import { ServerResponse, IncomingMessage } from "http";
import Dockerode from "dockerode";
import { CONFIG } from "../config";

export const proxy = httpProxy.createProxyServer({
    ws: true,
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
    const containerName = `ccw-${workspaceId}`;

    try {
        const hostPort = await getContainerPort(workspaceId);
        const target = `http://localhost:${hostPort}`;

        // Strip the /ws/:id prefix for the container
        req.url = url.replace(/^\/ws\/[^\/]+/, "");
        if (req.url === "") req.url = "/";

        proxy.web(req, res, { target }, (err) => {
            console.error("Proxy error:", err);
            if (!res.writableEnded) {
                res.writeHead(502);
                res.end("Bad Gateway");
            }
        });
    } catch (error) {
        console.error("Proxy error:", error);
        res.writeHead(404);
        res.end("Workspace not found or container not running");
    }
};
