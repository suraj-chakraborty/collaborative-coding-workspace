import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import rateLimit from "express-rate-limit"; // Rate limiting
import { DockerService } from "./services/docker";
import { proxyRequestHandler, proxy, getContainerPort } from "./services/proxy";
import { progressService } from "./services/progress";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { prisma } from "./lib/prisma";

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import { typeDefs, resolvers } from "./graphql/schema";
import { filesRouter } from "./routes/files";
import { uploadRouter } from "./routes/upload";
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
    app.use(express.json({ limit: "50mb" }));
    app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

    // 1. Rate Limiting (Basic)
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 500, // Limit each IP to 500 requests per windowMs
    });
    app.use(limiter);

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

    // Upload Route
    // Upload Route
    app.use("/api/upload", uploadRouter);

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

    app.get("/api/workspaces/:id/setup-status", (req, res) => {
        const workspaceId = req.params.id;
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        progressService.addClient(workspaceId, res);

        // Initial heartbeat
        res.write(`data: ${JSON.stringify({ stage: "CONNECTING", progress: 0, message: "Establishing stream..." })}\n\n`);
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

    // Socket.IO Middleware for Authentication
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error("Authentication error: No token provided"));

            // Verify with Clerk
            // Note: Verify logic depends on your Clerk config. 
            // Using a simple decode or verify method if available.
            // For now, assuming the token passed IS the session token or JWT.
            const decoded = await clerkClient.verifyToken(token).catch(() => null);

            if (!decoded) return next(new Error("Authentication error: Invalid token"));

            (socket as any).userId = decoded.sub; // 'sub' is the User ID in Clerk
            next();
        } catch (err) {
            console.error("Socket Auth Error:", err);
            next(new Error("Authentication error"));
        }
    });

    // Socket.IO for Chat & Platform Events
    io.on("connection", (socket) => {
        const userId = (socket as any).userId;
        console.log(`User connected: ${userId} (${socket.id})`);

        socket.on("join-workspace", async (workspaceId: string) => {
            socket.join(`workspace-${workspaceId}`);
            console.log(`User ${socket.id} joined workspace ${workspaceId}`);

            // Fetch and emit chat history
            try {
                const history = await prisma.chatMessage.findMany({
                    where: { workspaceId },
                    orderBy: { createdAt: "asc" },
                    take: 50,
                    include: { user: true }
                });

                // Map to frontend message format
                const formattedHistory = history.map(msg => ({
                    id: msg.id,
                    text: msg.content,
                    sender: {
                        id: msg.user.id,
                        name: msg.user.name || "Unknown",
                        image: msg.user.image
                    },
                    timestamp: msg.createdAt.getTime(),
                    lang: "en" // Defaulting since DB doesn't store lang yet, or we could add it.
                }));

                socket.emit("chat-history", formattedHistory);
            } catch (err) {
                console.error("Error fetching chat history:", err);
            }
        });

        // Chat Message Event
        socket.on("chat-message", async (data: { workspaceId: string; message: string; user: any; lang?: string }) => {
            // Broadcast to everyone in the room INCLUDING sender (for simplicity, or exclude sender)
            io.to(`workspace-${data.workspaceId}`).emit("chat-message", data);

            // Persist message to DB
            try {
                await prisma.chatMessage.create({
                    data: {
                        content: data.message,
                        workspaceId: data.workspaceId,
                        userId: data.user.id
                    }
                });
            } catch (err) {
                console.error("Failed to persist message:", err);
            }
        });

        // File Lock Event (Presence)
        socket.on("file-lock", (data: { workspaceId: string; path: string; user: any }) => {
            socket.to(`workspace-${data.workspaceId}`).emit("file-lock", data);
        });

        socket.on("file-unlock", (data: { workspaceId: string; path: string; user: any }) => {
            socket.to(`workspace-${data.workspaceId}`).emit("file-unlock", data);
        });

        // Shared Terminal Events
        socket.on("terminal-init", async (workspaceId: string) => {
            const { TerminalService } = require("./services/terminal");
            await TerminalService.getOrCreateSession(workspaceId, io);
            console.log(`[Terminal] User ${socket.id} initialized terminal for ${workspaceId}`);
        });

        socket.on("terminal-input", (data: { workspaceId: string; input: string }) => {
            const { TerminalService } = require("./services/terminal");
            TerminalService.write(data.workspaceId, data.input);
        });

        // WebRTC Signaling Events
        socket.on("join-voice-room", async (workspaceId: string) => {
            // Access Control: Verify user is a member of the workspace
            try {
                const member = await prisma.workspaceMember.findUnique({
                    where: {
                        workspaceId_userId: {
                            workspaceId,
                            userId
                        }
                    }
                });

                // Also check if owner
                const workspace = !member ? await prisma.workspace.findUnique({ where: { id: workspaceId } }) : null;
                const isOwner = workspace && workspace.ownerId === userId;

                if (!member && !isOwner) {
                    console.log(`User ${userId} denied access to voice room ${workspaceId}`);
                    socket.emit("error", "Access denied");
                    return;
                }

                const roomId = `voice-${workspaceId}`;
                socket.join(roomId);
                const clients = io.sockets.adapter.rooms.get(roomId);
                const otherUsers = Array.from(clients || []).filter(id => id !== socket.id);

                // If this is the FIRST person joining (or just notify anyway), alert the workspace
                // Better: If they explicitly "call" -> we can add a specific event.
                // For now, if they join and there are others, it's a join.
                // If they join and it's empty, maybe they are starting a call? 
                // Or simply ALWAYS notify "User joined voice".
                // But the user asked for "Alerting team members...".

                // Let's emit an 'incoming-call' event to the WORKSPACE room (not voice room)
                // alerting them that someone is in the voice channel.
                const user = await prisma.user.findUnique({ where: { id: userId } });
                socket.to(`workspace-${workspaceId}`).emit("incoming-call", {
                    workspaceId,
                    caller: {
                        id: userId,
                        name: user?.name || "Unknown",
                        image: user?.image
                    }
                });

                // Notify existing users that new user joined, so they can initiate offers
                socket.emit("all-users", otherUsers);
                console.log(`User ${userId} joined voice room ${workspaceId}`);
            } catch (err) {
                console.error("Join Room Error:", err);
            }
        });

        socket.on("sending-signal", (payload: { userToSignal: string; signal: any; callerID: string }) => {
            io.to(payload.userToSignal).emit("user-joined", {
                signal: payload.signal,
                callerID: payload.callerID,
            });
        });

        socket.on("returning-signal", (payload: { callerID: string; signal: any; id: string }) => {
            io.to(payload.callerID).emit("receiving-returned-signal", {
                signal: payload.signal,
                id: socket.id,
            });
        });

        socket.on("disconnect", () => {
            console.log("User disconnected:", socket.id);
            // Notify rooms this user was in (cleanup not trivial without tracking room membership, 
            // but for mesh, peers usually detect disconnect via ICE connection state)
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
