import { EventEmitter } from "events";
import { Response } from "express";

class ProgressService extends EventEmitter {
    private clientStreams: Map<string, Response[]> = new Map();

    constructor() {
        super();
        this.setMaxListeners(100);
    }

    emitProgress(workspaceId: string, stage: string, progress: number, message: string) {
        const data = JSON.stringify({ stage, progress, message });
        this.emit(`progress:${workspaceId}`, data);

        // Also log for debugging
        console.log(`[Progress] [${workspaceId}] ${stage} (${progress}%): ${message}`);
    }

    addClient(workspaceId: string, res: Response) {
        if (!this.clientStreams.has(workspaceId)) {
            this.clientStreams.set(workspaceId, []);
        }
        this.clientStreams.get(workspaceId)?.push(res);

        const listener = (data: string) => {
            res.write(`data: ${data}\n\n`);
        };

        this.on(`progress:${workspaceId}`, listener);

        res.on("close", () => {
            this.removeListener(`progress:${workspaceId}`, listener);
            const clients = this.clientStreams.get(workspaceId) || [];
            this.clientStreams.set(workspaceId, clients.filter(c => c !== res));
        });
    }
}

export const progressService = new ProgressService();
