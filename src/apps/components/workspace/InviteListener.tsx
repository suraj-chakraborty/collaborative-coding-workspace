"use client";

import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";

const JOIN_WORKSPACE = gql`
  mutation JoinWorkspace($inviteCode: String!, $userId: String!, $email: String, $name: String, $image: String) {
    joinWorkspace(inviteCode: $inviteCode, userId: $userId, email: $email, name: $name, image: $image) {
      id
      name
    }
  }
`;

export function InviteListener() {
    const { user, isSignedIn } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const [token, setToken] = useState<string | null>(null);

    const [joinWorkspace] = useMutation(JOIN_WORKSPACE);

    useEffect(() => {
        if (isSignedIn) {
            getToken().then(setToken);
        }
    }, [isSignedIn, getToken]);

    useEffect(() => {
        if (!isSignedIn || !user?.id || !token) return;

        const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";
        const socket = io(socketUrl, {
            auth: { token },
        });

        socket.on("workspace-invite-received", (data: { workspaceId: string; workspaceName: string; inviterName: string; inviteCode: string }) => {
            console.log("InviteListener: Received workspace-invite-received", data);

            toast(
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">
                        {data.inviterName} invited you to join "{data.workspaceName}"
                    </p>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            className="bg-indigo-600 hover:bg-indigo-500 text-white"
                            onClick={async () => {
                                try {
                                    if (data.inviteCode) {
                                        await joinWorkspace({
                                            variables: {
                                                inviteCode: data.inviteCode,
                                                userId: user.id,
                                                email: user.primaryEmailAddress?.emailAddress,
                                                name: user.fullName || user.username,
                                                image: user.imageUrl,
                                            }
                                        });
                                        toast.success(`Joined ${data.workspaceName}!`);
                                    }
                                    router.push(`/workspace/${data.workspaceId}`);
                                    toast.dismiss();
                                } catch (err: any) {
                                    console.error("Failed to join workspace", err);
                                    toast.error(`Failed to join: ${err.message}`);
                                }
                            }}
                        >
                            Join Now
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="border-zinc-700"
                            onClick={() => toast.dismiss()}
                        >
                            Later
                        </Button>
                    </div>
                </div>,
                {
                    duration: 15000,
                    className: "bg-zinc-900 border-zinc-800",
                }
            );
        });

        return () => {
            socket.disconnect();
        };
    }, [isSignedIn, user, token, router, joinWorkspace]);

    return null;
}
