import express from "express";
import { v2 as cloudinary } from "cloudinary";

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

router.post("/", async (req, res) => {
    try {
        const { name, type, content } = req.body;

        if (!content || !name) {
            return res.status(400).json({ error: "File content and name required" });
        }

        // Determine resource type for Cloudinary
        let resourceType: "image" | "video" | "raw" = "raw";
        if (type?.startsWith("image/")) {
            resourceType = "image";
        } else if (type?.startsWith("video/") || type?.startsWith("audio/")) {
            resourceType = "video"; // Cloudinary uses "video" for both video and audio
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(content, {
            resource_type: resourceType,
            folder: "collab-coding",
            public_id: name.replace(/\.[^/.]+$/, ""), // Remove extension for public_id
        });

        res.json({
            url: result.secure_url,
            name: result.public_id,
            type,
            cloudinaryId: result.public_id,
        });
    } catch (error: any) {
        console.error("Cloudinary upload error:", error);
        res.status(500).json({ error: error.message });
    }
});

export const uploadRouter = router;
