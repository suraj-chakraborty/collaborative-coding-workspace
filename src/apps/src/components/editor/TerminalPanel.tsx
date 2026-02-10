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

        let term: Terminal | null = null;
        let fitAddon: FitAddon | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let resizeTimeout: NodeJS.Timeout;
        let initTimeout: NodeJS.Timeout;
        let disposed = false;

        // Wait for container to have dimensions before opening terminal
        const initTerminal = () => {
            if (disposed) return;

            const container = terminalRef.current;
            if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) {
                // Retry until container has dimensions
                initTimeout = setTimeout(initTerminal, 100);
                return;
            }

            term = new Terminal({
                theme: {
                    background: "#09090b",
                    foreground: "#e4e4e7",
                    cursor: "#6366f1",
                },
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 13,
                allowProposedApi: true,
            });

            fitAddon = new FitAddon();
            term.loadAddon(fitAddon);

            try {
                term.open(container);
            } catch (e) {
                console.warn("[TerminalPanel] Failed to open terminal:", e);
                // Retry after a delay
                initTimeout = setTimeout(initTerminal, 200);
                term.dispose();
                return;
            }

            xtermRef.current = term;

            // Use ResizeObserver to fit terminal when container size changes
            resizeObserver = new ResizeObserver(() => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    if (
                        !disposed &&
                        terminalRef.current &&
                        terminalRef.current.offsetWidth > 0 &&
                        terminalRef.current.offsetHeight > 0 &&
                        term?.element &&
                        (term as any)._core?._renderService
                    ) {
                        try {
                            fitAddon?.fit();
                        } catch (e) {
                            // Ignore transient fit errors
                        }
                    }
                }, 100);
            });

            resizeObserver.observe(container);

            // Initial fit with better retry logic
            const tryFit = (retries = 10) => {
                if (disposed || !term) return;
                if (
                    terminalRef.current &&
                    terminalRef.current.offsetWidth > 0 &&
                    term.element &&
                    (term as any)._core?._renderService
                ) {
                    try {
                        fitAddon?.fit();
                    } catch (e) {
                        if (retries > 0) setTimeout(() => tryFit(retries - 1), 200);
                    }
                } else if (retries > 0) {
                    setTimeout(() => tryFit(retries - 1), 200);
                }
            };

            // Delay initial fit to ensure everything is ready
            setTimeout(() => tryFit(), 100);

            getToken().then(token => {
                if (!token || disposed) return;

                const socket = io(socketUrl, {
                    auth: { token }
                });
                socketRef.current = socket;

                socket.on("connect", () => {
                    socket.emit("join-workspace", workspaceId);
                    socket.emit("terminal-init", workspaceId);
                });

                socket.on("terminal-output", (data: string) => {
                    term?.write(data);
                });

                term?.onData((data) => {
                    socket.emit("terminal-input", { workspaceId, input: data });
                });
            });
        };

        // Start initialization
        initTerminal();

        return () => {
            disposed = true;
            clearTimeout(initTimeout);
            clearTimeout(resizeTimeout);
            resizeObserver?.disconnect();
            socketRef.current?.disconnect();
            term?.dispose();
        };
    }, [workspaceId, socketUrl, getToken]);

    return (
        <div className="h-full w-full bg-[#09090b] p-2">
            <div ref={terminalRef} className="h-full w-full" />
        </div>
    );
}
