import express from "express";
import fs from "fs";
import path from "path";
import { CONFIG } from "../config";
import { AgentManager } from "../services/agent-manager";
import { prisma } from "../lib/prisma";

const router = express.Router();

// Helper to sanitize path
const getSafePath = (workspaceId: string, relativePath: string) => {
    const workspaceRoot = path.resolve(CONFIG.WORKSPACE_ROOT, workspaceId);
    const targetPath = path.resolve(workspaceRoot, relativePath.replace(/^\//, ""));

    if (!targetPath.startsWith(workspaceRoot)) {
        throw new Error("Access denied: Path outside workspace");
    }
    return targetPath;
};

// 1. Get File Tree (Recursive)
router.get("/:workspaceId/tree", async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) return res.status(404).json({ error: "Workspace not found" });

        if (AgentManager.isAgentConnected(workspace.ownerId)) {
            const tree = await AgentManager.sendCommand(workspace.ownerId, {
                type: "FS_TREE",
                workspaceId
            });
            return res.json(tree);
        }

        const workspaceRoot = path.resolve(CONFIG.WORKSPACE_ROOT, workspaceId);
        if (!fs.existsSync(workspaceRoot)) {
            return res.status(404).json({ error: "Workspace not found on disk" });
        }

        const buildTree = (dirConfig: string): any[] => {
            const stats = fs.statSync(dirConfig);
            if (!stats.isDirectory()) return [];

            const files = fs.readdirSync(dirConfig);
            return files.map((file) => {
                const filePath = path.join(dirConfig, file);
                const fileStats = fs.statSync(filePath);
                const isDirectory = fileStats.isDirectory();
                const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");

                return {
                    name: file,
                    path: "/" + relativePath,
                    type: isDirectory ? "directory" : "file",
                    children: isDirectory ? buildTree(filePath) : undefined,
                };
            });
        };

        const tree = buildTree(workspaceRoot);
        res.json(tree);
    } catch (error: any) {
        console.error("Tree error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Read File
router.post("/:workspaceId/read", async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { path: filePath } = req.body;
        if (!filePath) return res.status(400).json({ error: "Path required" });

        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) return res.status(404).json({ error: "Workspace not found" });

        if (AgentManager.isAgentConnected(workspace.ownerId)) {
            const resp = await AgentManager.sendCommand(workspace.ownerId, {
                type: "FS_READ",
                workspaceId,
                options: { path: filePath }
            });
            return res.json(resp);
        }

        const targetPath = getSafePath(workspaceId, filePath);
        if (!fs.existsSync(targetPath)) return res.status(404).json({ error: "File not found" });
        if (fs.statSync(targetPath).isDirectory()) return res.status(400).json({ error: "Cannot read directory" });

        const content = fs.readFileSync(targetPath, "utf-8");
        res.json({ content });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Write File
router.post("/:workspaceId/write", async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { path: filePath, content } = req.body;
        if (!filePath) return res.status(400).json({ error: "Path required" });

        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) return res.status(404).json({ error: "Workspace not found" });

        if (AgentManager.isAgentConnected(workspace.ownerId)) {
            await AgentManager.sendCommand(workspace.ownerId, {
                type: "FS_WRITE",
                workspaceId,
                options: { path: filePath, content }
            });
            return res.json({ success: true });
        }

        const targetPath = getSafePath(workspaceId, filePath);
        const parentDir = path.dirname(targetPath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.writeFileSync(targetPath, content || "");
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Delete File/Folder
router.post("/:workspaceId/delete", async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { path: filePath } = req.body;
        if (!filePath) return res.status(400).json({ error: "Path required" });

        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) return res.status(404).json({ error: "Workspace not found" });

        if (AgentManager.isAgentConnected(workspace.ownerId)) {
            await AgentManager.sendCommand(workspace.ownerId, {
                type: "FS_DELETE",
                workspaceId,
                options: { path: filePath }
            });
            return res.json({ success: true });
        }

        const targetPath = getSafePath(workspaceId, filePath);
        if (!fs.existsSync(targetPath)) return res.status(404).json({ error: "Not found" });

        fs.rmSync(targetPath, { recursive: true, force: true });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Rename/Move
router.post("/:workspaceId/rename", async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { oldPath, newPath } = req.body;
        if (!oldPath || !newPath) return res.status(400).json({ error: "Paths required" });

        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) return res.status(404).json({ error: "Workspace not found" });

        if (AgentManager.isAgentConnected(workspace.ownerId)) {
            await AgentManager.sendCommand(workspace.ownerId, {
                type: "FS_RENAME",
                workspaceId,
                options: { oldPath, newPath }
            });
            return res.json({ success: true });
        }

        const sourcePath = getSafePath(workspaceId, oldPath);
        const destinationPath = getSafePath(workspaceId, newPath);

        if (!fs.existsSync(sourcePath)) return res.status(404).json({ error: "Source not found" });
        if (fs.existsSync(destinationPath)) return res.status(400).json({ error: "Destination already exists" });

        const parentDir = path.dirname(destinationPath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.renameSync(sourcePath, destinationPath);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Create Directory
router.post("/:workspaceId/mkdir", async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { path: dirPath } = req.body;
        if (!dirPath) return res.status(400).json({ error: "Path required" });

        const workspace: any = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) return res.status(404).json({ error: "Workspace not found" });

        if (AgentManager.isAgentConnected(workspace.ownerId)) {
            await AgentManager.sendCommand(workspace.ownerId, {
                type: "FS_MKDIR",
                workspaceId,
                options: { path: dirPath }
            });
            return res.json({ success: true });
        }

        const targetPath = getSafePath(workspaceId, dirPath);
        if (fs.existsSync(targetPath)) return res.status(400).json({ error: "Already exists" });

        fs.mkdirSync(targetPath, { recursive: true });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export const filesRouter = router;
