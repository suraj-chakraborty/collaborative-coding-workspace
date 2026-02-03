import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { DockerService } from "./services/docker";
import { proxyRequestHandler, proxy, getContainerPort } from "./services/proxy";

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import { typeDefs, resolvers } from "./graphql/schema";
import { filesRouter } from "./routes/files";
import { serve } from "inngest/express";
import { inngest } from "./lib/inngest";
import { setupWorkspace } from "./inngest/functions";

const startServer = async () => {
    const app = express();
    const server = createServer(app);
    const io = new Server(server, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:3000",
            methods: ["GET", "POST"],
        },
    });

    const apolloServer = new ApolloServer({
        typeDefs,
        resolvers,
    });

    await apolloServer.start();

    app.use(cors());
    app.use(express.json());

    app.use(
        "/graphql",
        expressMiddleware(apolloServer, {
            context: async ({ req }) => ({ token: (req as any).headers.token }),
        }) as any
    );

    app.use(
        "/api/inngest",
        serve({
            client: inngest,
            functions: [setupWorkspace]
        })
    );

    // Container management routes
    app.post("/api/containers/:id/start", async (req, res) => {
        try {
            const status = await DockerService.startContainer(req.params.id);
            res.json(status);
        } catch (error: any) {
            console.error("Start error:", error);
            res.status(500).json({ error: error.message });
        }
    });

    app.post("/api/containers/:id/stop", async (req, res) => {
        try {
            await DockerService.stopContainer(req.params.id);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post("/api/containers/:id/restart", async (req, res) => {
        try {
            await DockerService.restartContainer(req.params.id);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get("/api/containers/:id/status", async (req, res) => {
        try {
            const status = await DockerService.getContainerStatus(req.params.id);
            res.json({ status });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // File System Routes
    app.use("/api/files", filesRouter);

    // Proxy routes for the IDE
    app.all("/ws/:id*", (req, res) => {
        proxyRequestHandler(req, res);
    });

    // Handle WebSocket upgrades
    server.on("upgrade", async (req, socket, head) => {
        const url = req.url || "";

        // 1. Yjs WebSocket (Real-time Collaboration)
        if (url.startsWith("/yjs")) {
            const { setupWSConnection } = require("./yjs-handler");
            const wss = new (require("ws").WebSocketServer)({ noServer: true });

            wss.handleUpgrade(req, socket, head, (ws: any) => {
                setupWSConnection(ws, req);
            });
            return;
        }

        // 2. Proxy WebSocket (Code-Server / Terminal)
        const match = url.match(/^\/ws\/([^\/]+)/);
        if (match) {
            const workspaceId = match[1];
            try {
                const hostPort = await getContainerPort(workspaceId);
                const target = `ws://127.0.0.1:${hostPort}`;

                // Rewrite URL for the container - preserve everything after /ws/:id
                const pathAfterWorkspace = url.substring(match[0].length);
                req.url = pathAfterWorkspace || "/";
                // req.url = url;

                proxy.ws(req, socket, head, {
                    target,
                    headers: {
                        "Host": `127.0.0.1:${hostPort}`,
                        "Origin": `http://127.0.0.1:${hostPort}`
                    }
                }, (err) => {
                    if (err) {
                        console.error(`WebSocket proxy error for workspace ${workspaceId}:`, err);
                        socket.destroy();
                    }
                });
            } catch (error) {
                console.error("WS Upgrade error:", error);
                socket.destroy();
            }
        }
    });

    app.get("/health", (req, res) => {
        res.send("Server healthy");
    });

    // Socket.IO for Chat & Platform Events
    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);

        socket.on("join-workspace", (workspaceId: string) => {
            socket.join(`workspace-${workspaceId}`);
            console.log(`User ${socket.id} joined workspace ${workspaceId}`);
        });

        // Chat Message Event
        socket.on("chat-message", async (data: { workspaceId: string; message: string; user: any }) => {
            // Broadcast to everyone in the room INCLUDING sender (for simplicity, or exclude sender)
            io.to(`workspace-${data.workspaceId}`).emit("chat-message", data);

            // TODO: Persist message to DB here
        });

        // File Lock Event (Presence)
        socket.on("file-lock", (data: { workspaceId: string; path: string; user: any }) => {
            socket.to(`workspace-${data.workspaceId}`).emit("file-lock", data);
        });

        socket.on("file-unlock", (data: { workspaceId: string; path: string; user: any }) => {
            socket.to(`workspace-${data.workspaceId}`).emit("file-unlock", data);
        });

        socket.on("disconnect", () => {
            console.log("User disconnected:", socket.id);
        });
    });

    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        // Run initial cleanup
        DockerService.cleanupStaleContainers();
    });
};

startServer();
