"use client";

import { useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { FileExplorer } from "./FileExplorer";
import CodeEditor from "./Editor";
import dynamic from "next/dynamic";

const TerminalPanel = dynamic(
    () => import("./TerminalPanel").then((mod) => mod.TerminalPanel),
    { ssr: false }
);

interface CustomIDEProps {
    workspaceId: string;
    socketUrl: string;
}

export function CustomIDE({ workspaceId, socketUrl }: CustomIDEProps) {
    const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined);

    return (
        <div className="h-full w-full bg-zinc-950 overflow-hidden flex flex-col">
            <ResizablePanelGroup orientation="horizontal" className="flex-1">
                {/* File Explorer */}
                <ResizablePanel defaultSize={100} minSize={0} maxSize={400}>
                    <FileExplorer
                        workspaceId={workspaceId}
                        onFileSelect={(path) => setSelectedFile(path)}
                    />
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel defaultSize={80} minSize={0}>
                    <ResizablePanelGroup orientation="vertical">
                        {/* Editor */}
                        <ResizablePanel defaultSize={70} minSize={0}>
                            <CodeEditor
                                workspaceId={workspaceId}
                                socketUrl={socketUrl}
                                filePath={selectedFile}
                            />
                        </ResizablePanel>

                        <ResizableHandle withHandle />

                        {/* Terminal */}
                        <ResizablePanel defaultSize={30} minSize={0}>
                            <div className="h-full flex flex-col bg-zinc-900">
                                <div className="h-7 border-b border-white/5 bg-black/40 flex items-center px-4">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Shared Terminal</span>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <TerminalPanel
                                        workspaceId={workspaceId}
                                        socketUrl={socketUrl}
                                    />
                                </div>
                            </div>
                        </ResizablePanel>
                    </ResizablePanelGroup>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
