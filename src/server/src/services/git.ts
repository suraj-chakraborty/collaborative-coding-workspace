import simpleGit from "simple-git";
import path from "path";
import fs from "fs";
import { CONFIG } from "../config";

const WORKSPACE_ROOT = CONFIG.WORKSPACE_ROOT;

// Ensure workspace root exists
if (!fs.existsSync(WORKSPACE_ROOT)) {
    fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
}

export class GitService {
    static async cloneRepository(url: string, workspaceId: string, token?: string) {
        const workspacePath = path.join(WORKSPACE_ROOT, workspaceId);

        // Construct auth URL if token is provided
        let remoteUrl = url;
        if (token) {
            let authPrefix = "oauth2"; // fallback
            if (url.includes("github.com")) {
                authPrefix = "x-access-token";
            } else if (url.includes("bitbucket.org")) {
                authPrefix = "x-token-auth";
            }
            remoteUrl = url.replace("https://", `https://${authPrefix}:${token}@`);
        }

        try {
            if (fs.existsSync(workspacePath)) {
                throw new Error("Workspace directory already exists");
            }

            await simpleGit().clone(remoteUrl, workspacePath);
            return { success: true, path: workspacePath };
        } catch (error: any) {
            console.error("Git Clone Error:", error);
            throw new Error(`Failed to clone repository: ${error.message}`);
        }
    }

    static async initRepository(workspaceId: string) {
        const workspacePath = path.join(WORKSPACE_ROOT, workspaceId);

        try {
            if (!fs.existsSync(workspacePath)) {
                fs.mkdirSync(workspacePath, { recursive: true });
            }

            const git = simpleGit(workspacePath);
            await git.init();
            return { success: true, path: workspacePath };
        } catch (error: any) {
            throw new Error(`Failed to init repository: ${error.message}`);
        }
    }
}
