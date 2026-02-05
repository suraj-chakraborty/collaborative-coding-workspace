"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useUser, useAuth } from "@clerk/nextjs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Minus, User as UserIcon, Users, X } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";

const MY_FRIENDS = gql`
  query MyFriends($userId: String!) {
    myFriends(userId: $userId) {
      id
      name
      image
      email
    }
  }
`;

interface Friend {
    id: string;
    name: string | null;
    image: string | null;
    email: string;
}

interface FriendsModalProps {
    isOpen: boolean;
    onClose: () => void;
    workspaceId: string;
    workspaceName: string;
    socketUrl: string;
    workspaceMemberIds: string[];
    isOwner: boolean;
    onRemoveMember?: (userId: string) => void;
}

export function FriendsModal({
    isOpen,
    onClose,
    workspaceId,
    workspaceName,
    socketUrl,
    workspaceMemberIds,
    isOwner,
    onRemoveMember
}: FriendsModalProps) {
    const { user } = useUser();
    const { getToken } = useAuth();
    const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
    const [socket, setSocket] = useState<Socket | null>(null);
    const [token, setToken] = useState<string | null>(null);

    const { data, loading, refetch: refetchFriends } = useQuery<{ myFriends: Friend[] }>(MY_FRIENDS, {
        variables: { userId: user?.id },
        skip: !user?.id,
    });

    const friends: Friend[] = data?.myFriends || [];

    // Fetch token
    useEffect(() => {
        if (isOpen && user?.id) {
            getToken().then(setToken);
            refetchFriends(); // Refetch friends when modal opens or user changes
        }
    }, [isOpen, user?.id, getToken, refetchFriends]);

    // Connect to socket for online status
    useEffect(() => {
        if (!token || !isOpen) return;

        const newSocket = io(socketUrl, {
            auth: { token },
        });

        // Removed console.log for connect/connect_error

        newSocket.on("online-users", (userIds: string[]) => {
            setOnlineUserIds(new Set(userIds));
        });

        newSocket.on("user-online", ({ userId }: { userId: string }) => {
            setOnlineUserIds(prev => new Set([...prev, userId]));
        });

        newSocket.on("user-offline", ({ userId }: { userId: string }) => {
            setOnlineUserIds(prev => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [token, isOpen, socketUrl]);

    const handleInvite = (friendId: string, friendName: string) => {
        if (!socket || !user) {
            return;
        }

        socket.emit("workspace-invite-request", {
            targetUserId: friendId,
            workspaceId,
            workspaceName,
            inviterName: user.fullName || user.username || "Someone",
        });

        toast.success(`Invite sent to ${friendName || "friend"}!`);
    };

    const handleRemove = (friendId: string, friendName: string) => {
        if (!isOwner) {
            toast.error("Only the workspace owner can remove members");
            return;
        }
        onRemoveMember?.(friendId);
        toast.success(`${friendName || "Member"} removed from workspace`);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <Users className="h-5 w-5 text-indigo-400" />
                        Friends
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-80">
                    {loading ? (
                        <div className="flex items-center justify-center py-8 text-zinc-500">
                            Loading friends...
                        </div>
                    ) : friends.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
                            <UserIcon className="h-8 w-8 mb-2 opacity-50" />
                            <p className="text-sm">No friends yet</p>
                            <p className="text-xs text-zinc-600 mt-1">
                                Collaborate on workspaces to add friends!
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1 p-1">
                            {friends.map((friend) => {
                                const isOnline = onlineUserIds.has(friend.id);
                                const isMember = workspaceMemberIds.some(mId => String(mId) === String(friend.id));

                                return (
                                    <div
                                        key={friend.id}
                                        className={`flex items-center justify-between p-3 rounded-lg transition-colors ${isOnline
                                            ? "bg-emerald-500/10 border border-emerald-500/20"
                                            : "bg-zinc-800/50 hover:bg-zinc-800"
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                {friend.image ? (
                                                    <img
                                                        src={friend.image}
                                                        alt={friend.name || "Friend"}
                                                        className="h-10 w-10 rounded-full object-cover border-2 border-zinc-700"
                                                    />
                                                ) : (
                                                    <div className="h-10 w-10 rounded-full bg-zinc-700 flex items-center justify-center border-2 border-zinc-700">
                                                        <UserIcon className="h-5 w-5 text-zinc-400" />
                                                    </div>
                                                )}
                                                <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-zinc-900 ${isOnline ? "bg-emerald-500" : "bg-zinc-500"}`} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-zinc-100">
                                                    {friend.name || friend.email.split("@")[0]}
                                                </p>
                                                <p className="text-xs text-zinc-500">
                                                    {isMember ? (
                                                        <span className="text-indigo-400">In workspace</span>
                                                    ) : isOnline ? (
                                                        <span className="text-emerald-400">● Online</span>
                                                    ) : (
                                                        <span>Offline</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        {isMember ? (
                                            // Show remove button for members (only owner can use it)
                                            isOwner && (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                    onClick={() => handleRemove(friend.id, friend.name || "")}
                                                    title="Remove from workspace"
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </Button>
                                            )
                                        ) : isOnline ? (
                                            // Show invite button for online non-members
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                                                onClick={() => handleInvite(friend.id, friend.name || "")}
                                                title="Invite to this workspace"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
