import httpProxy from "http-proxy";
import { ServerResponse, IncomingMessage } from "http";
import Dockerode from "dockerode";

const proxy = httpProxy.createProxyServer({});
const docker = new Dockerode();

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
        const container = docker.getContainer(containerName);
        const data = await container.inspect();

        if (!data.State.Running) {
            res.writeHead(503);
            res.end("Container not running");
            return;
        }

        const hostPort = data.NetworkSettings.Ports["8443/tcp"][0].HostPort;
        const target = `http://localhost:${hostPort}`;

        req.url = url.replace(`/ws/${workspaceId}`, "");

        proxy.web(req, res, { target }, (err) => {
            console.error("Proxy error:", err);
            res.writeHead(502);
            res.end("Bad Gateway");
        });
    } catch (error) {
        res.writeHead(404);
        res.end("Workspace not found");
    }
};
