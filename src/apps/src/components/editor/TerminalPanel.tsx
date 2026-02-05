"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@clerk/nextjs";

interface TerminalPanelProps {
    workspaceId: string;
    socketUrl: string;
}

export function TerminalPanel({ workspaceId, socketUrl }: TerminalPanelProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const { getToken } = useAuth();

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            theme: {
                background: "#09090b",
                foreground: "#e4e4e7",
                cursor: "#6366f1",
            },
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13,
            allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        xtermRef.current = term;

        // Use ResizeObserver to fit terminal when container size changes
        let resizeTimeout: NodeJS.Timeout;
        const resizeObserver = new ResizeObserver(() => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (
                    terminalRef.current &&
                    terminalRef.current.offsetWidth > 0 &&
                    terminalRef.current.offsetHeight > 0 &&
                    term.element &&
                    (term as any)._core?._renderService &&
                    (term as any)._core?._charMeasure?.dimensions // Explicitly check dimensions
                ) {
                    try {
                        fitAddon.fit();
                    } catch (e) {
                        // Ignore transient fit errors
                    }
                }
            }, 100);
        });

        resizeObserver.observe(terminalRef.current);

        // Initial fit with better retry logic
        const tryFit = (retries = 10) => {
            if (
                terminalRef.current &&
                terminalRef.current.offsetWidth > 0 &&
                term.element &&
                (term as any)._core?._renderService &&
                (term as any)._core?._charMeasure?.dimensions
            ) {
                try {
                    fitAddon.fit();
                } catch (e) {
                    if (retries > 0) setTimeout(() => tryFit(retries - 1), 200);
                }
            } else if (retries > 0) {
                setTimeout(() => tryFit(retries - 1), 200);
            }
        };

        tryFit();

        getToken().then(token => {
            if (!token) return;

            const socket = io(socketUrl, {
                auth: { token }
            });
            socketRef.current = socket;

            socket.on("connect", () => {
                socket.emit("join-workspace", workspaceId);
                socket.emit("terminal-init", workspaceId);
            });

            socket.on("terminal-output", (data: string) => {
                term.write(data);
            });

            term.onData((data) => {
                socket.emit("terminal-input", { workspaceId, input: data });
            });
        });

        return () => {
            resizeObserver.disconnect();
            socketRef.current?.disconnect();
            term.dispose();
        };
    }, [workspaceId, socketUrl, getToken]);

    return (
        <div className="h-full w-full bg-[#09090b] p-2">
            <div ref={terminalRef} className="h-full w-full" />
        </div>
    );
}
