"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Loader2 } from "lucide-react";
import { useUser } from "@clerk/nextjs";

// Colors for cursor presence
const CURSOR_COLORS = [
    "#f87171", // red
    "#fbbf24", // amber
    "#34d399", // emerald
    "#60a5fa", // blue
    "#818cf8", // indigo
    "#a78bfa", // violet
    "#f472b6", // pink
];

interface CodeEditorProps {
    workspaceId: string;
    socketUrl: string; // e.g. ws://localhost:3001
    filePath?: string;
}

export default function CodeEditor({ workspaceId, socketUrl, filePath }: CodeEditorProps) {
    const { user } = useUser();
    const editorRef = useRef<any>(null);
    const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
    const providerRef = useRef<WebsocketProvider | null>(null);
    const docRef = useRef<Y.Doc>(new Y.Doc());
    const bindingRef = useRef<MonacoBinding | null>(null);

    // 1. Initial File Load (Content Fetch)
    useEffect(() => {
        if (!filePath || !editorRef.current) return;

        const loadContent = async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/files/${workspaceId}/read`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: filePath }),
                });
                if (res.ok) {
                    const { content } = await res.json();

                    // If we are unconnected or just starting, we might want to initialize with content
                    // But with Yjs, the truth is in the sync. 
                    // This is tricky: If Yjs doc is empty, populate it. If not, trust Yjs.
                    const yText = docRef.current.getText(filePath);
                    if (yText.toString() === "") {
                        yText.insert(0, content);
                    }
                }
            } catch (err) {
                console.error("Failed to load file", err);
            }
        };

        loadContent();
    }, [filePath, workspaceId]);

    // 2. Yjs Synchronization
    useEffect(() => {
        if (!editorRef.current || !filePath || !user) return;

        // Clean up previous binding
        if (bindingRef.current) bindingRef.current.destroy();
        if (providerRef.current) providerRef.current.destroy();

        const doc = docRef.current;
        const roomName = `ccw-${workspaceId}`;
        const wsEndpoint = `${socketUrl.replace("http", "ws")}/yjs`;

        const provider = new WebsocketProvider(wsEndpoint, roomName, doc);
        providerRef.current = provider;

        provider.on("status", (event: any) => {
            console.log("YJS Status:", event.status);
            setStatus(event.status);
        });

        const randomColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
        provider.awareness.setLocalStateField("user", {
            name: user.fullName || user.username || "Anonymous",
            color: randomColor,
        });

        let isBindingDestroyed = false;

        const initBinding = async () => {
            // Dynamic import to avoid SSR 'window' error
            const { MonacoBinding } = await import("y-monaco");

            if (isBindingDestroyed) return;

            const yText = doc.getText(filePath);
            const model = editorRef.current.getModel();

            if (model) {
                const binding = new MonacoBinding(
                    yText,
                    model,
                    new Set([editorRef.current]),
                    provider.awareness
                );
                bindingRef.current = binding;
            }

            // Check if we need to hydrate content (only if document is empty and we are the first ones presumably, 
            // but 'yText' syncs separate from provider status, so checking IsEmpty is a heuristic)
            if (yText.toString() === "") {
                console.log("Fetching content for", filePath);
                try {
                    const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/files/${workspaceId}/read`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ path: filePath }),
                    });
                    if (res.ok) {
                        const { content } = await res.json();
                        if (yText.toString() === "" && !isBindingDestroyed) {
                            console.log("Hydrating content for", filePath);
                            yText.insert(0, content);
                        }
                    } else {
                        console.error("Failed to read file:", res.statusText);
                    }
                } catch (e) {
                    console.error("Error reading file:", e);
                }
            }
        };

        initBinding();

        return () => {
            isBindingDestroyed = true;
            provider.disconnect();
            bindingRef.current?.destroy();
        };
    }, [filePath, workspaceId, socketUrl, user]);

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
    };

    if (!filePath) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 bg-[#1e1e1e]">
                <div className="text-6xl mb-4 opacity-20">←</div>
                <p>Select a file to start editing</p>
            </div>
        );
    }

    return (
        <div className="h-full relative flex flex-col">
            {/* Status Bar */}
            <div className="h-6 bg-zinc-900 border-b border-black flex items-center px-4 justify-between text-[10px] text-zinc-400 select-none">
                <span className="truncate max-w-[50%]">{filePath}</span>
                <div className="flex items-center gap-2">
                    <span
                        className={`h-2 w-2 rounded-full ${status === "connected" ? "bg-emerald-500" :
                            status === "connecting" ? "bg-amber-500" : "bg-red-500"
                            }`}
                    />
                    <span>{status.toUpperCase()}</span>
                </div>
            </div>

            {/* Monaco Editor */}
            <div className="flex-1 relative">
                <Editor
                    height="100%"
                    theme="vs-dark"
                    language={
                        filePath.endsWith(".ts") || filePath.endsWith(".tsx") ? "typescript" :
                            filePath.endsWith(".js") || filePath.endsWith(".jsx") ? "javascript" :
                                filePath.endsWith(".css") ? "css" :
                                    filePath.endsWith(".html") ? "html" :
                                        filePath.endsWith(".json") ? "json" :
                                            "markdown"
                    }
                    value="" // Value handled by Yjs
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontSize: 14,
                        lineHeight: 24,
                        padding: { top: 16 },
                        smoothScrolling: true,
                        cursorBlinking: "smooth",
                        cursorSmoothCaretAnimation: "on",
                    }}
                />
            </div>
        </div>
    );
}
