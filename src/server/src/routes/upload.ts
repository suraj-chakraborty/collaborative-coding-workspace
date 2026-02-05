import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, "../../uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

router.post("/", async (req, res) => {
    try {
        const { name, type, content } = req.body;

        if (!content || !name) {
            return res.status(400).json({ error: "File content and name required" });
        }

        // Generate unique filename
        const ext = path.extname(name);
        const uniqueName = `${crypto.randomBytes(16).toString("hex")}${ext}`;
        const filePath = path.join(UPLOADS_DIR, uniqueName);

        // Decode Base64 (remove data: prefix if present)
        let buffer;
        if (content.includes(";base64,")) {
            const base64Content = content.split(";base64,")[1];
            buffer = Buffer.from(base64Content, "base64");
        } else {
            // Fallback for raw base64 or other formats
            buffer = Buffer.from(content, "base64");
        }

        fs.writeFileSync(filePath, buffer);

        const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";
        const fileUrl = `${serverUrl}/uploads/${uniqueName}`;

        res.json({ url: fileUrl, name: uniqueName, type });
    } catch (error: any) {
        console.error("Upload error:", error);
        res.status(500).json({ error: error.message });
    }
});

export const uploadRouter = router;
