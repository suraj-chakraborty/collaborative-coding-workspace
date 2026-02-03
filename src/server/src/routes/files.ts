import express from "express";
import fs from "fs";
import path from "path";
import { CONFIG } from "../config";

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

        const targetPath = getSafePath(workspaceId, filePath);

        // Ensure parent directory exists
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

export const filesRouter = router;
