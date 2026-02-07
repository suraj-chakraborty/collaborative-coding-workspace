import { Server, Socket } from "socket.io";

export interface AgentCommand {
    type: "START_CONTAINER" | "STOP_CONTAINER" | "RESTART_CONTAINER" | "GET_STATUS" | "CLEANUP" | "FS_TREE" | "FS_READ" | "FS_WRITE" | "FS_DELETE" | "FS_RENAME" | "FS_MKDIR";
    workspaceId?: string;
    options?: any;
}

export class AgentManager {
    private static agents: Map<string, Socket> = new Map(); // userId -> Socket

    static registerAgent(userId: string, socket: Socket) {
        console.log(`[AgentManager] ✅ Registering agent for user: ${userId} (${socket.id})`);
        this.agents.set(userId, socket);

        socket.on("disconnect", (reason) => {
            console.log(`[AgentManager] ❌ Agent disconnected for user: ${userId}. Reason: ${reason}`);
            if (this.agents.get(userId) === socket) {
                this.agents.delete(userId);
            }
        });

        // Listen for status updates from agent
        socket.on("agent-status-update", (data) => {
            console.log(`[AgentManager] Received status update from agent for user ${userId}:`, data);
            // Optionally broadcast to frontend if needed
        });
    }

    static isAgentConnected(userId: string): boolean {
        return this.agents.has(userId);
    }

    static async sendCommand(userId: string, command: AgentCommand): Promise<any> {
        const socket = this.agents.get(userId);
        if (!socket) {
            console.error(`[AgentManager] 🚫 No local agent connected for user: ${userId}`);
            throw new Error(`Local agent not connected. Please ensure your local agent app is running and connected.`);
        }

        console.log(`[AgentManager] 📤 Sending command to agent for user ${userId}:`, command.type);

        return new Promise((resolve, reject) => {
            // Set a timeout for the command
            const timeout = setTimeout(() => {
                reject(new Error("Agent command timed out"));
            }, 30000);

            socket.emit("agent-command", command, (response: any) => {
                clearTimeout(timeout);
                if (response?.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }

    static getConnectedUserIds(): string[] {
        return Array.from(this.agents.keys());
    }
}
