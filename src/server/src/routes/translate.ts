import { Router } from "express";
import { LingoDotDevEngine } from "lingo.dev/sdk";

const router = Router();

router.post("/", async (req, res) => {
    try {
        const { text, from, to } = req.body;

        if (!text) {
            return res.status(400).json({ error: "Text is required" });
        }

        const apiKey = process.env.LINGODOTDEV_API_KEY || process.env.LINGO_API_KEY;
        if (!apiKey) {
            console.error("LINGO API KEY is not set");
            return res.status(500).json({ error: "Translation service misconfigured" });
        }

        const lingo = new LingoDotDevEngine({
            apiKey: apiKey,
        });

        // Use localizeText for dynamic translation
        const translatedText = await lingo.localizeText(text, {
            sourceLocale: from || null,
            targetLocale: to,
        });

        res.json({ translated: translatedText });
    } catch (error: any) {
        console.error("Translation error:", error);
        res.status(500).json({ error: error.message || "Translation failed" });
    }
});

export { router as translateRouter };
