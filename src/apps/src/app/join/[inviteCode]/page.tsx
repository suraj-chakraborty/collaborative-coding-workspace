"use client";

import { use } from "react";

import { useQuery, useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Terminal, UserPlus, Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const GET_WORKSPACE_BY_INVITE = gql`
  query GetWorkspaceByInvite($code: String!) {
    workspaceByInvite(code: $code) {
      id
      name
      description
    }
  }
`;

const JOIN_WORKSPACE = gql`
  mutation JoinWorkspace($inviteCode: String!, $userId: String!, $email: String, $name: String, $image: String) {
    joinWorkspace(inviteCode: $inviteCode, userId: $userId, email: $email, name: $name, image: $image) {
      id
    }
  }
`;

export default function JoinPage({ params }: { params: Promise<{ inviteCode: string }> }) {
    const { inviteCode } = use(params);
    const { user, isLoaded } = useUser();
    const router = useRouter();

    const { data, loading, error } = useQuery(GET_WORKSPACE_BY_INVITE, {
        variables: { code: inviteCode },
    }) as any;

    const [joinWorkspace, { loading: isJoining }] = useMutation(JOIN_WORKSPACE);

    const handleJoin = async () => {
        if (!user) {
            toast.error("Please sign in to join the workspace");
            return;
        }

        try {
            const { data: joinData } = await joinWorkspace({
                variables: {
                    inviteCode: inviteCode,
                    userId: user.id,
                    email: user.primaryEmailAddress?.emailAddress,
                    name: user.fullName,
                    image: user.imageUrl
                }
            }) as any;
            toast.success(`Joined ${data.workspaceByInvite.name}!`);
            router.push(`/workspace/${joinData.joinWorkspace.id}`);
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Failed to join workspace");
        }
    };

    if (loading || !isLoaded) return (
        <div className="flex h-screen items-center justify-center bg-zinc-950">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        </div>
    );

    if (error || !data?.workspaceByInvite) return (
        <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 text-white p-6 text-center">
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.05),transparent_70%)]" />
            <h1 className="relative text-3xl font-bold text-red-500">Invalid Invite Code</h1>
            <p className="relative text-zinc-500 mt-2 max-w-md">This invite may have expired, been revoked, or the code is incorrect.</p>
            <Link href="/dashboard" className="relative mt-8">
                <Button className="bg-white/5 hover:bg-white/10">Return to Dashboard</Button>
            </Link>
        </div>
    );

    const workspace = data.workspaceByInvite;

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(79,70,229,0.1),transparent_70%)]" />

            <Card className="relative w-full max-w-md border-white/10 bg-zinc-900/50 backdrop-blur-2xl shadow-2xl">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-500">
                        <UserPlus className="h-8 w-8" />
                    </div>
                    <CardTitle className="text-2xl font-bold">You're Invited!</CardTitle>
                    <CardDescription>
                        Join <span className="text-indigo-400 font-semibold">{workspace.name}</span> as an Editor.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="rounded-xl bg-white/5 p-4 space-y-3">
                        <div className="flex items-center gap-3 text-sm text-zinc-300">
                            <Terminal className="h-4 w-4 text-indigo-400" />
                            <span>Shared Development Environment</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-zinc-300">
                            <ShieldCheck className="h-4 w-4 text-indigo-400" />
                            <span>Collaborative Real-time IDE</span>
                        </div>
                    </div>

                    <Button
                        onClick={handleJoin}
                        disabled={isJoining}
                        className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-lg group gap-2"
                    >
                        {isJoining ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <>
                                Join Workspace
                                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                            </>
                        )}
                    </Button>

                    <p className="text-center text-xs text-zinc-500">
                        By joining, you will have access to all project files and collaborators.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
