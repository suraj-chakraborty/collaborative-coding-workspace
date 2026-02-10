"use client";

import { useState, useEffect } from "react";

import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import { Plus, LayoutDashboard, Terminal, Settings, LogOut, Search, PlusCircle, Loader2, Play, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LanguageToggle } from "@/components/language-toggle";
import { CreateWorkspaceModal } from "@/components/workspace/create-modal";
import { JoinWorkspaceModal } from "@/components/workspace/join-modal";
import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

const MY_WORKSPACES = gql`
  query MyWorkspaces($email: String!) {
    myWorkspaces(email: $email) {
      id
      name
      description
      ownerId
      updatedAt
      members {
        role
        user {
            image
        }
      }
      invites {
        code
        isRevoked
      }
    }
  }
`;

export default function DashboardPage() {
    const { user, isLoaded } = useUser();
    const [searchQuery, setSearchQuery] = useState("");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const { data, loading, error } = useQuery(MY_WORKSPACES, {
        variables: { email: user?.primaryEmailAddress?.emailAddress },
        skip: !user?.primaryEmailAddress?.emailAddress
    }) as any;

    const allWorkspaces = data?.myWorkspaces || [];
    const filteredWorkspaces = allWorkspaces.filter((ws: any) =>
        ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ws.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <DashboardLayout>
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Your Workspaces</h1>
                    <p className="mt-1 text-muted-foreground">Manage and launch your cloud development environments.</p>
                </div>
                <div className="flex gap-3">
                    <JoinWorkspaceModal />
                    <CreateWorkspaceModal />
                </div>
            </div>

            {loading || !isLoaded ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredWorkspaces.map((ws: any) => {
                        const activeInvite = ws.invites?.find((inv: any) => !inv.isRevoked);
                        const isOwner = ws.ownerId === user?.id;

                        return (
                            <Card key={ws.id} className="group relative overflow-y-scroll border-white/10 bg-zinc-900/50 backdrop-blur-xl transition-all duration-300 hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/20">
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 opacity-0 transition-opacity group-hover:opacity-100" />

                                <CardHeader className="relative pb-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 border border-indigo-500/10 shadow-inner">
                                            <Terminal className="h-6 w-6" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Member Stack */}
                                            <div className="flex -space-x-2">
                                                {ws.members.slice(0, 3).map((m: any, i: number) => (
                                                    <div key={i} className="h-6 w-6 rounded-full border border-black bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 overflow-hidden">
                                                        {m.user?.image ? (
                                                            <img src={m.user.image} alt="User" className="h-full w-full object-cover" />
                                                        ) : (
                                                            <span>{m.user?.name?.[0] || "?"}</span>
                                                        )}
                                                    </div>
                                                ))}
                                                {ws.members.length > 3 && (
                                                    <div className="h-6 w-6 rounded-full border border-black bg-zinc-900 flex items-center justify-center text-[10px] text-zinc-500">
                                                        +{ws.members.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wider text-emerald-500 uppercase border border-emerald-500/20">
                                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                READY
                                            </div>
                                        </div>
                                    </div>
                                    <CardTitle className="mt-4 text-xl font-bold tracking-tight text-white group-hover:text-indigo-400 transition-colors">
                                        {ws.name}
                                    </CardTitle>
                                    <CardDescription className="font-mono text-xs line-clamp-1 text-zinc-500">
                                        {ws.description || "No description provided"}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="relative">
                                    {/* Invite Code Section - Requested by user */}
                                    {isOwner && activeInvite && (
                                        <div className="mb-4 flex items-center justify-between rounded-lg bg-black/20 p-2 border border-white/5">
                                            <div className="flex items-center gap-2 px-1">
                                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">INVITE:</span>
                                                <code className="text-xs font-mono text-indigo-300">{activeInvite.code}</code>
                                            </div>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6 hover:bg-white/10"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    navigator.clipboard.writeText(`${window.location.origin}/join/${activeInvite.code}`);
                                                    toast.success("Invite link copied!");
                                                }}
                                            >
                                                <Copy className="h-3 w-3 text-zinc-400" />
                                            </Button>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 mt-auto">
                                        <Link href={`/workspace/${ws.id}`} className="flex-1">
                                            <Button className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/20 border-0">
                                                <Play className="mr-2 h-4 w-4 fill-white" />
                                                Launch IDE
                                            </Button>
                                        </Link>
                                        {isOwner && (
                                            <Link href={`/workspace/${ws.id}/settings`}>
                                                <Button size="icon" variant="outline" className="border-white/10 bg-black/20 hover:bg-white/10 hover:text-white hover:border-white/20">
                                                    <Settings className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}

                    {/* Empty State */}
                    {filteredWorkspaces.length === 0 && (
                        <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
                            <PlusCircle className="h-12 w-12 text-muted-foreground/50" />
                            <p className="mt-4 text-muted-foreground">No workspaces found. Create your first one to get started.</p>
                            <div className="mt-4">
                                <CreateWorkspaceModal />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </DashboardLayout>
    );
}
