import path from "path";
import os from "os";
import fs from "fs-extra";

export interface AgentConfig {
    serverUrl: string;
    authToken: string;
    userId: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".collab-cloud");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export class ConfigManager {
    static async loadConfig(): Promise<AgentConfig | null> {
        try {
            if (await fs.pathExists(CONFIG_FILE)) {
                return await fs.readJson(CONFIG_FILE);
            }
        } catch (err) {
            console.error("[ConfigManager] Error loading config:", err);
        }
        return null;
    }

    static async saveConfig(config: AgentConfig): Promise<void> {
        try {
            await fs.ensureDir(CONFIG_DIR);
            await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
        } catch (err) {
            console.error("[ConfigManager] Error saving config:", err);
            throw err;
        }
    }

    static async getMergedConfig(): Promise<AgentConfig> {
        const fileConfig = await this.loadConfig();

        return {
            serverUrl: process.env.SERVER_URL || fileConfig?.serverUrl || "https://collaborative-coding-workspace-1.onrender.com",
            authToken: process.env.AUTH_TOKEN || fileConfig?.authToken || "dev-agent-key",
            userId: process.env.USER_ID || fileConfig?.userId || ""
        };
    }
}
