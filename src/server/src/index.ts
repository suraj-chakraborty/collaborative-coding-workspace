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
            context: async ({ req }) => ({ token: req.headers.token }),
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

    app.get("/api/containers/:id/status", async (req, res) => {
        try {
            const status = await DockerService.getContainerStatus(req.params.id);
            res.json({ status });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Proxy routes for the IDE
    app.all("/ws/:id*", (req, res) => {
        proxyRequestHandler(req, res);
    });

    // Handle WebSocket upgrades for the proxy (code-server)
    server.on("upgrade", async (req, socket, head) => {
        const url = req.url || "";
        const match = url.match(/^\/ws\/([^\/]+)/);

        if (match) {
            const workspaceId = match[1];
            try {
                const hostPort = await getContainerPort(workspaceId);
                const target = `http://localhost:${hostPort}`;

                // Rewrite URL for the container
                req.url = url.replace(/^\/ws\/[^\/]+/, "");
                if (req.url === "") req.url = "/";

                proxy.ws(req, socket, head, { target });
            } catch (error) {
                console.error("WS Upgrade error:", error);
                socket.destroy();
            }
        }
    });

    app.get("/health", (req, res) => {
        res.send("Server healthy");
    });

    // Socket.IO for real-time features (collaboration)
    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);

        socket.on("join-workspace", (workspaceId: string) => {
            socket.join(`workspace-${workspaceId}`);
            console.log(`User ${socket.id} joined workspace ${workspaceId}`);
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
