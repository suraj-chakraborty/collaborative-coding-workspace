import Dockerode from "dockerode";
import { Server } from "socket.io";

const docker = new Dockerode();

interface TerminalSession {
    stream: any;
    workspaceId: string;
}

const sessions = new Map<string, TerminalSession>();

export class TerminalService {
    static async getOrCreateSession(workspaceId: string, io: Server) {
        let session = sessions.get(workspaceId);

        // If session exists but stream is destroyed, clear it
        if (session && (session.stream.destroyed || !session.stream.writable)) {
            console.log(`[TerminalService] Session for ${workspaceId} was stale, cleaning up`);
            sessions.delete(workspaceId);
            session = undefined;
        }

        if (session) return session;

        console.log(`[TerminalService] Creating new session for workspace ${workspaceId}`);
        const containerName = `ccw-${workspaceId}`;
        const container = docker.getContainer(containerName);

        try {
            // Ensure container is running and not restarting
            const { DockerService } = await import("./docker");
            await DockerService.waitForContainerRunning(workspaceId);

            // First try bash, then sh
            const shells = ['/bin/bash', '/bin/sh', 'sh', 'bash'];
            let exec: any = null;
            let currentShell = '';

            for (const shell of shells) {
                try {
                    exec = await container.exec({
                        AttachStdin: true,
                        AttachStdout: true,
                        AttachStderr: true,
                        Tty: true,
                        User: 'abc',
                        WorkingDir: '/home/coder/workspace',
                        Env: [
                            'PATH=/home/coder/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                            'HOME=/home/coder',
                            'USER=abc'
                        ],
                        Cmd: [shell]
                    });
                    currentShell = shell;
                    break;
                } catch (e) {
                    continue;
                }
            }

            if (!exec) throw new Error("Could not find a valid shell in container");

            const stream = await exec.start({
                hijack: true,
                stdin: true
            });

            console.log(`[TerminalService] Started ${currentShell} for ${workspaceId}`);

            // Handle output
            stream.on('data', (chunk: Buffer) => {
                io.to(`workspace-${workspaceId}`).emit("terminal-output", chunk.toString());
            });

            stream.on('error', (err: any) => {
                console.error(`[TerminalService] Stream error for ${workspaceId}:`, err);
                sessions.delete(workspaceId);
            });

            stream.on('end', () => {
                console.log(`[TerminalService] Session for ${workspaceId} ended`);
                sessions.delete(workspaceId);
            });

            const newSession: TerminalSession = { stream, workspaceId };
            sessions.set(workspaceId, newSession);
            return newSession;
        } catch (err) {
            console.error(`[TerminalService] Failed to create session for ${workspaceId}:`, err);
            return null;
        }
    }

    static write(workspaceId: string, data: string) {
        const session = sessions.get(workspaceId);
        if (session && !session.stream.destroyed && session.stream.writable) {
            session.stream.write(data);
        } else if (session) {
            console.warn(`[TerminalService] Attempted to write to stale session ${workspaceId}`);
            sessions.delete(workspaceId);
        }
    }
}
