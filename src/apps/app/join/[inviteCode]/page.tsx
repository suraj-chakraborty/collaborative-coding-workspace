"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useUser } from "@clerk/nextjs";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const JOIN_WORKSPACE = gql`
  mutation JoinWorkspace($inviteCode: String!, $userId: String!) {
    joinWorkspace(inviteCode: $inviteCode, userId: $userId) {
      id
      name
    }
  }
`;

export default function JoinWorkspacePage() {
    const { inviteCode } = useParams();
    const router = useRouter();
    const { user, isLoaded } = useUser();
    const [joinWorkspace] = useMutation(JOIN_WORKSPACE);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isLoaded || !user || !inviteCode) return;

        const join = async () => {
            try {
                const { data } = await joinWorkspace({
                    variables: {
                        inviteCode: inviteCode as string,
                        userId: user.id
                    }
                }) as any;

                if (data?.joinWorkspace) {
                    toast.success(`Joined workspace ${data.joinWorkspace.name}`);
                    router.push(`/workspace/${data.joinWorkspace.id}`);
                }
            } catch (err: any) {
                console.error("Failed to join workspace", err);
                setError(err.message || "Failed to join workspace");
            }
        };

        join();
    }, [isLoaded, user, inviteCode, joinWorkspace, router]);

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <Card className="w-[400px] border-red-500/20 bg-red-500/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-500">
                            <AlertCircle className="h-5 w-5" />
                            Join Failed
                        </CardTitle>
                        <CardDescription className="text-red-400">
                            {error}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="secondary"
                            className="w-full"
                            onClick={() => router.push("/dashboard")}
                        >
                            Back to Dashboard
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
            <p className="text-muted-foreground animate-pulse">Joining workspace...</p>
        </div>
    );
}
