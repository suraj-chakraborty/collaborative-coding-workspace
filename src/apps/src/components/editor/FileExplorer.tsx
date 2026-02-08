"use client";

import { useState, useEffect, useRef } from "react";
import {
    ChevronRight,
    ChevronDown,
    FileCode,
    Folder,
    FolderOpen,
    Loader2,
    FilePlus,
    FolderPlus,
    RefreshCw,
    ChevronsUp,
    ChevronsDown,
    MoreVertical,
    Pencil,
    Trash2,
    X,
    Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

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

    // UI State for creation/renaming
    const [creating, setCreating] = useState<{ parentPath: string; type: "file" | "directory" } | null>(null);
    const [renaming, setRenaming] = useState<{ path: string; oldName: string } | null>(null);
    const [newItemName, setNewItemName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchTree();
    }, [workspaceId]);

    useEffect(() => {
        if (creating || renaming) {
            inputRef.current?.focus();
        }
    }, [creating, renaming]);

    const fetchTree = async () => {
        try {
            const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "") || "";
            const res = await fetch(`${baseUrl}/api/files/${workspaceId}/tree`);
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

    const toggleFolder = (path: string) => {
        const newExpanded = new Set(expanded);
        if (newExpanded.has(path)) {
            newExpanded.delete(path);
        } else {
            newExpanded.add(path);
        }
        setExpanded(newExpanded);
    };

    const expandAll = () => {
        const allPaths = new Set<string>();
        const traverse = (nodes: FileNode[]) => {
            nodes.forEach(node => {
                if (node.type === "directory") {
                    allPaths.add(node.path);
                    if (node.children) traverse(node.children);
                }
            });
        };
        traverse(files);
        setExpanded(allPaths);
    };

    const collapseAll = () => {
        setExpanded(new Set());
    };

    const handleCreate = async () => {
        if (!creating || !newItemName.trim()) {
            setCreating(null);
            setNewItemName("");
            return;
        }

        const relativePath = creating.parentPath === "/" ? newItemName : `${creating.parentPath}/${newItemName}`;
        const endpoint = creating.type === "file" ? "write" : "mkdir";

        try {
            const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "") || "";
            const res = await fetch(`${baseUrl}/api/files/${workspaceId}/${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: relativePath, content: "" }),
            });

            if (res.ok) {
                toast.success(`${creating.type === "file" ? "File" : "Folder"} created`);
                await fetchTree();
                if (creating.parentPath !== "/") {
                    const newExpanded = new Set(expanded);
                    newExpanded.add(creating.parentPath);
                    setExpanded(newExpanded);
                }
            } else {
                const err = await res.json();
                toast.error(err.error || "Operation failed");
            }
        } catch (err) {
            toast.error("Network error");
        } finally {
            setCreating(null);
            setNewItemName("");
        }
    };

    const handleRename = async () => {
        if (!renaming || !newItemName.trim() || newItemName === renaming.oldName) {
            setRenaming(null);
            setNewItemName("");
            return;
        }

        const parentPath = renaming.path.substring(0, renaming.path.lastIndexOf("/"));
        const newPath = parentPath === "" ? `/${newItemName}` : `${parentPath}/${newItemName}`;

        try {
            const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "") || "";
            const res = await fetch(`${baseUrl}/api/files/${workspaceId}/rename`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldPath: renaming.path, newPath }),
            });

            if (res.ok) {
                toast.success("Renamed successfully");
                await fetchTree();
            } else {
                const err = await res.json();
                toast.error(err.error || "Rename failed");
            }
        } catch (err) {
            toast.error("Network error");
        } finally {
            setRenaming(null);
            setNewItemName("");
        }
    };

    const handleDelete = async (path: string) => {
        if (!confirm("Are you sure you want to delete this? This action cannot be undone.")) return;

        try {
            const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "") || "";
            const res = await fetch(`${baseUrl}/api/files/${workspaceId}/delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path }),
            });

            if (res.ok) {
                toast.success("Deleted");
                await fetchTree();
            } else {
                const err = await res.json();
                toast.error(err.error || "Delete failed");
            }
        } catch (err) {
            toast.error("Network error");
        }
    };

    const FileTreeItem = ({ node, depth = 0 }: { node: FileNode; depth?: number }) => {
        const isFolder = node.type === "directory";
        const isExpanded = expanded.has(node.path);
        const isRenaming = renaming?.path === node.path;
        const paddingLeft = depth * 12 + 12;

        return (
            <div className="group">
                <div
                    className={cn(
                        "flex items-center py-1 px-2 cursor-pointer hover:bg-white/5 text-sm select-none transition-colors",
                        !isFolder && "text-zinc-400 hover:text-white"
                    )}
                    style={{ paddingLeft: `${paddingLeft}px` }}
                    onClick={() => {
                        if (isFolder) toggleFolder(node.path);
                        else onFileSelect(node.path);
                    }}
                >
                    <span className="mr-1.5 opacity-70">
                        {isFolder ? (
                            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                            <FileCode className="h-3.5 w-3.5" />
                        )}
                    </span>

                    {isRenaming ? (
                        <input
                            ref={inputRef}
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            onBlur={handleRename}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleRename();
                                if (e.key === "Escape") setRenaming(null);
                            }}
                            className="bg-zinc-800 text-white border-0 outline-none h-5 w-full text-sm px-1 rounded ring-1 ring-indigo-500"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <>
                            <span className="truncate flex-1">{node.name}</span>
                            <div className="hidden group-hover:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                {isFolder && (
                                    <>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setCreating({ parentPath: node.path, type: "file" }); }}
                                            className="p-0.5 hover:bg-white/10 rounded text-zinc-400 hover:text-white"
                                            title="New File"
                                        >
                                            <FilePlus className="h-3 w-3" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setCreating({ parentPath: node.path, type: "directory" }); }}
                                            className="p-0.5 hover:bg-white/10 rounded text-zinc-400 hover:text-white"
                                            title="New Folder"
                                        >
                                            <FolderPlus className="h-3 w-3" />
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setRenaming({ path: node.path, oldName: node.name }); setNewItemName(node.name); }}
                                    className="p-0.5 hover:bg-white/10 rounded text-zinc-400 hover:text-white"
                                    title="Rename"
                                >
                                    <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(node.path); }}
                                    className="p-0.5 hover:bg-white/10 rounded text-zinc-400 hover:text-red-400"
                                    title="Delete"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Inline Creation Input */}
                {creating?.parentPath === node.path && (
                    <div className="flex items-center py-1 px-2" style={{ paddingLeft: `${paddingLeft + 24}px` }}>
                        <span className="mr-1.5 opacity-70">
                            {creating.type === "file" ? <FileCode className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
                        </span>
                        <input
                            ref={inputRef}
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            onBlur={handleCreate}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreate();
                                if (e.key === "Escape") setCreating(null);
                            }}
                            className="bg-zinc-800 text-white border-0 outline-none h-5 w-full text-sm px-1 rounded ring-1 ring-indigo-500"
                        />
                    </div>
                )}

                {isFolder && isExpanded && node.children && (
                    <div>
                        {node.children
                            .sort((a, b) => {
                                if (a.type === b.type) return a.name.localeCompare(b.name);
                                return a.type === "directory" ? -1 : 1;
                            })
                            .map((child) => (
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
        <div className={cn("h-full bg-zinc-900 flex flex-col select-none", className)}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-black/20">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Explorer</h3>
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={() => setCreating({ parentPath: "/", type: "file" })}
                        className="p-1 hover:bg-white/5 rounded text-zinc-500 hover:text-zinc-200"
                        title="New File"
                    >
                        <FilePlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={() => setCreating({ parentPath: "/", type: "directory" })}
                        className="p-1 hover:bg-white/5 rounded text-zinc-500 hover:text-zinc-200"
                        title="New Folder"
                    >
                        <FolderPlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={fetchTree}
                        className="p-1 hover:bg-white/5 rounded text-zinc-500 hover:text-zinc-200"
                        title="Refresh Explorer"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={collapseAll}
                        className="p-1 hover:bg-white/5 rounded text-zinc-500 hover:text-zinc-200"
                        title="Collapse Folders"
                    >
                        <ChevronsUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={expandAll}
                        className="p-1 hover:bg-white/5 rounded text-zinc-500 hover:text-zinc-200"
                        title="Expand Folders"
                    >
                        <ChevronsDown className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="py-1">
                    {/* Root Level Creation Input */}
                    {creating?.parentPath === "/" && (
                        <div className="flex items-center py-1 px-3">
                            <span className="mr-1.5 opacity-70">
                                {creating.type === "file" ? <FileCode className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
                            </span>
                            <input
                                ref={inputRef}
                                value={newItemName}
                                onChange={(e) => setNewItemName(e.target.value)}
                                onBlur={handleCreate}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleCreate();
                                    if (e.key === "Escape") setCreating(null);
                                }}
                                className="bg-zinc-800 text-white border-0 outline-none h-5 w-full text-sm px-1 rounded ring-1 ring-indigo-500"
                            />
                        </div>
                    )}

                    {files
                        .sort((a, b) => {
                            if (a.type === b.type) return a.name.localeCompare(b.name);
                            return a.type === "directory" ? -1 : 1;
                        })
                        .map((node) => (
                            <FileTreeItem key={node.path} node={node} />
                        ))}

                    {files.length === 0 && !creating && (
                        <div className="px-6 py-8 text-center text-[10px] text-zinc-600 uppercase tracking-widest leading-relaxed">
                            Empty Workspace
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
