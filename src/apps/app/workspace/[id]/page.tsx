"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Terminal, Send, Users, ChevronLeft, Layout, Share2, Play, Square, RefreshCcw, Settings, Loader2 } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";

const GET_WORKSPACE = gql`
  query GetWorkspace($id: String!) {
    workspace(id: $id) {
      id
      name
      description
      ownerId
      members {
        role
        user {
          id
          name
          email
        }
      }
    }
  }
`;

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, isLoaded } = useUser();
    const [containerStatus, setContainerStatus] = useState<"IDLE" | "STARTING" | "RUNNING" | "ERROR">("IDLE");
    const [isIframeReady, setIsIframeReady] = useState(false);

    const { data, loading, error } = useQuery(GET_WORKSPACE, {
        variables: { id },
    }) as any;

    const startContainer = async () => {
        setContainerStatus("STARTING");
        try {
            const response = await fetch(`http://localhost:3001/api/containers/${id}/start`, {
                method: "POST",
            });
            if (!response.ok) throw new Error("Failed to start container");
            const result = await response.json();
            console.log("Container started:", result);
            setContainerStatus("RUNNING");
            setTimeout(() => setIsIframeReady(true), 1500); // Give it a moment to stabilize
        } catch (err: any) {
            console.error(err);
            setContainerStatus("ERROR");
            toast.error("Cloud IDE failed to start. Please try again.");
        }
    };

    useEffect(() => {
        if (data?.workspace) {
            startContainer();
        }
    }, [data?.workspace]);

    const workspace = data?.workspace;
    const myMember = workspace?.members.find((m: any) => m.user.id === user?.id);
    const isOwner = workspace?.ownerId === user?.id || myMember?.role === "OWNER";

    if (loading) return (
        <div className="flex h-screen items-center justify-center bg-zinc-950">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        </div>
    );

    if (error || !workspace) return (
        <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 text-white">
            <h1 className="text-2xl font-bold">Workspace not found</h1>
            <Link href="/dashboard" className="mt-4">
                <Button>Back to Dashboard</Button>
            </Link>
        </div>
    );

    return (
        <div className="flex h-screen flex-col bg-background overflow-hidden">
            {/* IDE Header */}
            <header className="flex h-12 items-center justify-between border-b border-white/5 bg-zinc-900/50 px-4 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard">
                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-white/5">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-indigo-400" />
                        <span className="text-sm font-medium">{workspace.name}</span>
                    </div>
                    <div className="h-4 w-[1px] bg-white/10 mx-2" />
                    <div className="flex items-center gap-1">
                        <div className={`h-2 w-2 rounded-full ${containerStatus === "RUNNING" ? "bg-emerald-500" : "bg-zinc-500"}`} />
                        <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
                            {containerStatus === "RUNNING" ? "Live" : containerStatus}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-8 gap-2 text-xs text-zinc-400 hover:bg-white/5" onClick={() => {
                        const inviteUrl = `${window.location.origin}/join/INVITE_CODE`;
                        navigator.clipboard.writeText(inviteUrl);
                        toast.success("Invite link copied!");
                    }}>
                        <Share2 className="h-3.5 w-3.5" />
                        Share
                    </Button>
                    {isOwner && (
                        <>
                            <div className="h-4 w-[1px] bg-white/10 mx-1" />
                            <Button
                                size="sm"
                                onClick={startContainer}
                                disabled={containerStatus === "STARTING"}
                                className="h-8 gap-2 text-xs bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                            >
                                <Play className="h-3.5 w-3.5 fill-current" />
                                {containerStatus === "STARTING" ? "Starting..." : "Restart Container"}
                            </Button>
                        </>
                    )}
                </div>
            </header>

            {/* Main Workspace Area */}
            <main className="flex flex-1 overflow-hidden">
                {/* Left Sidebar Tools */}
                <aside className="w-12 flex flex-col items-center py-4 gap-4 border-r border-white/5 bg-zinc-950/50">
                    <Layout className="h-5 w-5 text-indigo-400 cursor-pointer" />
                    <Users className="h-5 w-5 text-zinc-500 hover:text-white cursor-pointer transition-colors" />
                    {isOwner && (
                        <Link href={`/workspace/${id}/settings`}>
                            <Settings className="h-5 w-5 text-zinc-500 hover:text-white cursor-pointer transition-colors" />
                        </Link>
                    )}
                </aside>

                {/* IDE Iframe */}
                <div className="relative flex-1 bg-zinc-950">
                    {containerStatus !== "RUNNING" || !isIframeReady ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10 animate-pulse">
                                <Terminal className="h-8 w-8 text-indigo-500" />
                            </div>
                            <h2 className="mt-4 text-xl font-semibold text-zinc-300">
                                {containerStatus === "ERROR" ? "Failed to Start" : "Initializing Workspace..."}
                            </h2>
                            <p className="mt-2 text-sm text-zinc-500">
                                {containerStatus === "ERROR" ? "Try restarting the container." : "Connecting to your isolated Docker environment."}
                            </p>
                            {containerStatus === "ERROR" && (
                                <Button onClick={startContainer} className="mt-4 bg-indigo-600">Retry Now</Button>
                            )}
                        </div>
                    ) : (
                        <iframe
                            src={`http://localhost:3001/ws/${id}/`}
                            className="w-full h-full border-none"
                            title="Cloud IDE"
                        />
                    )}
                </div>

                {/* Right Sidebar - Active Collaborators / Chat */}
                <aside className="w-72 border-l border-white/5 bg-zinc-950/50 flex flex-col">
                    <div className="p-4 border-b border-white/5">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                            <Users className="h-3 w-3" />
                            Collaborators
                        </h3>
                        <div className="mt-4 flex flex-col gap-2">
                            {workspace.members.map((member: any) => (
                                <div key={member.user.id} className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold">
                                        {member.user.email.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-medium">{member.user.name || member.user.email.split('@')[0]}</span>
                                        <span className="text-[10px] text-zinc-500">{member.role}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 p-4 flex flex-col justify-end gap-4 overflow-hidden">
                        <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-indigo-400">System</span>
                                <p className="text-xs text-zinc-400 bg-white/5 p-2 rounded-lg rounded-tl-none">
                                    Welcome to {workspace.name}. Happy coding! 🚀
                                </p>
                            </div>
                        </div>

                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Type a message..."
                                className="w-full h-10 bg-white/5 border border-white/5 rounded-lg px-3 text-xs focus:outline-none focus:border-indigo-500/50 text-white"
                            />
                            <Button size="icon" className="absolute right-1 top-1 h-8 w-8 bg-transparent hover:bg-indigo-500/10 text-indigo-400">
                                <Send className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
}
