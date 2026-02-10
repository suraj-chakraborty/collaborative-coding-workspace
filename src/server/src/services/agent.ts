
import { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma";

// Map: UserId -> SocketId
const agentSockets = new Map<string, string>();
let io: Server;

export class AgentService {
    static init(socketIo: Server) {
        io = socketIo;

        // Namespace for agents? Or use main namespace with auth check?
        // Let's use main namespace but filter by token type if needed.
        // Ideally, agents should connect to a specific namespace like '/agent'.
        const agentNamespace = io.of("/agent");

        agentNamespace.use(async (socket, next) => {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error("Authentication error: Token missing"));

            try {
                // Verify API Key
                const apiKey = await prisma.apiKey.findUnique({
                    where: { key: token },
                    select: { userId: true }
                });

                if (!apiKey) return next(new Error("Authentication error: Invalid Token"));

                // Allow connection and attach userId
                (socket as any).userId = apiKey.userId;
                next();
            } catch (error) {
                console.error("Agent Auth Error:", error);
                next(new Error("Internal Server Error during Auth"));
            }
        });

        agentNamespace.on("connection", (socket) => {
            const userId = (socket as any).userId;
            console.log(`[AgentService] Agent connected for user ${userId}`);
            agentSockets.set(userId, socket.id);

            socket.on("disconnect", () => {
                console.log(`[AgentService] Agent disconnected for user ${userId}`);
                agentSockets.delete(userId);
            });

            socket.on("proxy:http:response:start", (data) => {
                const { requestId, statusCode, headers } = data;
                const pending = pendingRequests.get(requestId);
                if (pending) {
                    pending.res.status(statusCode).set(headers);
                }
            });

            socket.on("proxy:http:response:chunk", (data) => {
                const { requestId, chunk } = data;
                const pending = pendingRequests.get(requestId);
                if (pending) {
                    pending.res.write(chunk);
                }
            });

            socket.on("proxy:http:response:end", (data) => {
                const { requestId } = data;
                const pending = pendingRequests.get(requestId);
                if (pending) {
                    pending.res.end();
                    pendingRequests.delete(requestId);
                }
            });

            socket.on("proxy:http:response:error", (data) => {
                const { requestId, statusCode, body } = data;
                const pending = pendingRequests.get(requestId);
                if (pending) {
                    if (!pending.res.headersSent) {
                        pending.res.status(statusCode).send(body);
                    } else {
                        pending.res.end(); // Or destroy?
                    }
                    pendingRequests.delete(requestId);
                }
            });
        });
    }

    static isAgentConnected(userId: string): boolean {
        return agentSockets.has(userId);
    }

    static async spawnContainer(userId: string, workspaceId: string) {
        const socketId = agentSockets.get(userId);
        if (!socketId) throw new Error("Agent not connected");

        return new Promise((resolve, reject) => {
            io.of("/agent").to(socketId).emit("docker:spawn", { workspaceId }, (response: any) => {
                if (response.success) resolve(response);
                else reject(new Error(response.error));
            });

            // Timeout if no response
            setTimeout(() => reject(new Error("Agent spawn timeout")), 10000);
        });
    }

    static async proxyRequest(userId: string, req: any, res: any) {
        const socketId = agentSockets.get(userId);
        if (!socketId) {
            res.status(503).send("Agent not connected");
            return;
        }

        const requestId = Math.random().toString(36).substring(7);
        pendingRequests.set(requestId, { res });

        // Forward request implementation
        // We need to parse body properly (buffer or string)

        io.of("/agent").to(socketId).emit("proxy:http:request", {
            requestId,
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body // Express json() might have parsed it. We might need raw body.
        });

        // Timeout
        setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.get(requestId)?.res.status(504).send("Gateway Timeout");
                pendingRequests.delete(requestId);
            }
        }, 10000);
    }
}

const pendingRequests = new Map<string, { res: any }>();
