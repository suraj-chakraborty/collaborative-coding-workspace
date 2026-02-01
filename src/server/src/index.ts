import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { DockerService } from "./services/docker";
import { proxyRequestHandler } from "./services/proxy";

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
    },
});

app.use(cors());
app.use(express.json());

// Container management routes
app.post("/api/containers/:id/start", async (req, res) => {
    try {
        await DockerService.createContainer(req.params.id);
        const status = await DockerService.startContainer(req.params.id);
        res.json(status);
    } catch (error: any) {
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

// Proxy routes
app.all("/ws/:id*", (req, res) => {
    proxyRequestHandler(req, res);
});

app.get("/health", (req, res) => {
    res.send("Server healthy");
});

// Socket.IO for real-time features
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
});
