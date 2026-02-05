"use client";

import { useQuery, useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, Users, Shield, Copy, Trash2, Loader2, UserPlus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useState, use } from "react";

const GET_WORKSPACE_SETTINGS = gql`
  query GetWorkspaceSettings($id: String!) {
    workspace(id: $id) {
      id
      name
      ownerId
      members {
        id
        role
        user {
          id
          name
          email
          image
        }
      }
      invites {
        id
        code
        role
        isRevoked
      }
    }
  }
`;

const CREATE_INVITE = gql`
  mutation CreateInvite($workspaceId: String!, $role: String!, $inviterId: String!) {
    createInvite(workspaceId: $workspaceId, role: $role, inviterId: $inviterId) {
      id
      code
    }
  }
`;

const DELETE_WORKSPACE = gql`
  mutation DeleteWorkspace($id: String!, $userId: String!) {
    deleteWorkspace(id: $id, userId: $userId)
  }
`;

export default function WorkspaceSettings({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user } = useUser();
    const [isGenerating, setIsGenerating] = useState(false);

    const { data, loading, refetch } = useQuery(GET_WORKSPACE_SETTINGS, {
        variables: { id },
    }) as any;

    const [createInvite] = useMutation(CREATE_INVITE);
    const [deleteWorkspace] = useMutation(DELETE_WORKSPACE);

    const workspace = data?.workspace;
    const myMember = workspace?.members.find((m: any) => m.user.id === user?.id);
    const isOwner = workspace?.ownerId === user?.id || myMember?.role === "OWNER";

    const handleCreateInvite = async () => {
        setIsGenerating(true);
        try {
            await createInvite({
                variables: {
                    workspaceId: id,
                    role: "EDITOR",
                    inviterId: user?.id,
                },
            });
            await refetch();
            toast.success("New invite code generated!");
        } catch (err) {
            toast.error("Failed to generate invite code");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this workspace? This action is irreversible.")) return;
        try {
            await deleteWorkspace({ variables: { id, userId: user?.id } });
            toast.success("Workspace deleted");
            window.location.href = "/dashboard";
        } catch (err) {
            toast.error("Failed to delete workspace");
        }
    };

    if (loading) return (
        <div className="flex h-screen items-center justify-center bg-zinc-950">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        </div>
    );

    if (!workspace || !isOwner) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 text-white">
                <h1 className="text-2xl font-bold">Unauthorized</h1>
                <p className="text-zinc-500 mt-2">Only the owner can access settings.</p>
                <Link href={`/workspace/${id}`} className="mt-4">
                    <Button>Back to Workspace</Button>
                </Link>
            </div>
        );
    }

    const activeInvite = workspace.invites?.find((inv: any) => !inv.isRevoked);

    return (
        <div className="min-h-screen bg-background p-8">
            <div className="mx-auto max-w-4xl">
                <div className="mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={`/workspace/${id}`}>
                            <Button variant="ghost" size="icon">
                                <ChevronLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">Settings</h1>
                            <p className="text-muted-foreground">{workspace.name}</p>
                        </div>
                    </div>
                </div>

                <div className="grid gap-8">
                    {/* Team Members */}
                    <Card className="border-white/5 bg-white/[0.02]">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5 text-indigo-400" />
                                Team Members
                            </CardTitle>
                            <CardDescription>People with access to this workspace.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {workspace.members.map((member: any) => (
                                    <div key={member.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-400">
                                                {member.user.email.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium">{member.user.name || member.user.email.split('@')[0]}</p>
                                                <p className="text-xs text-zinc-500">{member.user.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Shield className={`h-4 w-4 ${member.role === 'OWNER' ? 'text-amber-500' : 'text-indigo-400'}`} />
                                            <span className="text-xs font-bold uppercase tracking-widest">{member.role}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Invites */}
                    <Card className="border-white/5 bg-white/[0.02]">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <UserPlus className="h-5 w-5 text-emerald-400" />
                                Invite Collaborators
                            </CardTitle>
                            <CardDescription>Share this code to invite others to your workspace.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-4">
                                {activeInvite ? (
                                    <div className="flex items-center gap-4 p-6 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5">
                                        <div className="flex-1">
                                            <p className="text-xs font-bold text-emerald-500 uppercase mb-1">Active Invite Code</p>
                                            <p className="text-2xl font-mono tracking-tighter">{activeInvite.code}</p>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            className="gap-2"
                                            onClick={() => {
                                                const url = `${window.location.origin}/join/${activeInvite.code}`;
                                                navigator.clipboard.writeText(url);
                                                toast.success("Invite link copied!");
                                            }}
                                        >
                                            <Copy className="h-4 w-4" />
                                            Copy Link
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        onClick={handleCreateInvite}
                                        disabled={isGenerating}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 py-6 text-lg gap-2"
                                    >
                                        {isGenerating ? <Loader2 className="animate-spin" /> : <RefreshCw className="h-5 w-5" />}
                                        Generate New Invite Code
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Danger Zone */}
                    <Card className="border-red-500/20 bg-red-500/5">
                        <CardHeader>
                            <CardTitle className="text-red-500">Danger Zone</CardTitle>
                            <CardDescription>Sensitive actions for this workspace.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button
                                variant="destructive"
                                onClick={handleDelete}
                                className="gap-2"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete Workspace Forever
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
