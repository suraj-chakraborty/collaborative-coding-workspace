"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, FileCode, Folder, FolderOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: FileNode[];
}

interface FileExplorerProps {
    workspaceId: string;
    onFileSelect: (path: string) => void;
    className?: string;
}

export function FileExplorer({ workspaceId, onFileSelect, className }: FileExplorerProps) {
    const [files, setFiles] = useState<FileNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchTree();
    }, [workspaceId]);

    const fetchTree = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/files/${workspaceId}/tree`);
            if (res.ok) {
                const data = await res.json();
                setFiles(data);
            }
        } catch (error) {
            console.error("Failed to load file tree", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleFolder = (path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = new Set(expanded);
        if (newExpanded.has(path)) {
            newExpanded.delete(path);
        } else {
            newExpanded.add(path);
        }
        setExpanded(newExpanded);
    };

    const FileTreeItem = ({ node, depth = 0 }: { node: FileNode; depth?: number }) => {
        const isFolder = node.type === "directory";
        const isExpanded = expanded.has(node.path);
        const paddingLeft = depth * 12 + 12;

        return (
            <div>
                <div
                    className={cn(
                        "flex items-center py-1 px-2 cursor-pointer hover:bg-white/5 text-sm select-none transition-colors",
                        !isFolder && "text-zinc-400 hover:text-white"
                    )}
                    style={{ paddingLeft: `${paddingLeft}px` }}
                    onClick={(e) => {
                        if (isFolder) toggleFolder(node.path, e);
                        else onFileSelect(node.path);
                    }}
                >
                    <span className="mr-1.5 opacity-70">
                        {isFolder ? (
                            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                        ) : (
                            <FileCode className="h-4 w-4" />
                        )}
                    </span>
                    <span className="truncate">{node.name}</span>
                </div>
                {isFolder && isExpanded && node.children && (
                    <div>
                        {node.children.map((child) => (
                            <FileTreeItem key={child.path} node={child} depth={depth + 1} />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
        );
    }

    return (
        <div className={cn("h-full bg-zinc-900 border-r border-white/10 flex flex-col", className)}>
            <div className="p-3 border-b border-white/5 bg-black/20">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Explorer</h3>
            </div>
            <ScrollArea className="flex-1">
                <div className="py-2">
                    {files.map((node) => (
                        <FileTreeItem key={node.path} node={node} />
                    ))}
                    {files.length === 0 && (
                        <div className="p-4 text-center text-xs text-zinc-600">
                            Workspace is empty
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
