"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Terminal, ChevronLeft, Settings, Loader2, MessageSquare, RotateCw, AlertCircle, Trash2, Mic, Phone, Users } from "lucide-react";
import Link from "next/link";
import { useQuery, useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { gql } from "@apollo/client";
import { useUser, useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import { io } from "socket.io-client";
import { ChatSidebar } from "@/components/editor/ChatSidebar";
import { VoiceChatPanel } from "@/components/workspace/voice-chat";
import { FriendsModal } from "@/components/workspace/FriendsModal";
import { CustomIDE } from "@/components/editor/CustomIDE";
import { CallSystem } from "@/components/workspace/CallSystem";
import { Layout, Globe, Video } from "lucide-react";

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
          image
        }
      }
      hostingType
      localPort
    }
  }
`;

const DELETE_WORKSPACE = gql`
  mutation DeleteWorkspace($id: String!, $userId: String!) {
    deleteWorkspace(id: $id, userId: $userId)
  }
`;

const REMOVE_MEMBER = gql`
  mutation RemoveMember($workspaceId: String!, $userId: String!, $adminId: String!) {
    removeMember(workspaceId: $workspaceId, userId: $userId, adminId: $adminId)
  }
`;

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user } = useUser();
    const { getToken } = useAuth();
    const [token, setToken] = useState<string | null>(null);
    const [containerStatus, setContainerStatus] = useState<"IDLE" | "STARTING" | "RUNNING" | "ERROR">("IDLE");
    const [loadingStage, setLoadingStage] = useState<string>("");
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isRestarting, setIsRestarting] = useState(false);
    const [errorDetails, setErrorDetails] = useState<{ title: string; message: string; action?: string } | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [progress, setProgress] = useState(0);
    const [devTip, setDevTip] = useState("");
    const [viewMode, setViewMode] = useState<"cloud" | "collab">("collab");
    const [unreadCount, setUnreadCount] = useState(0);
    const [isFriendsModalOpen, setIsFriendsModalOpen] = useState(false);
    const [socket, setSocket] = useState<any>(null);
    const [isVoiceActive, setIsVoiceActive] = useState(false);
    const [callMode, setCallMode] = useState<"video" | "audio">("video");
    const router = useRouter();

    const [deleteWorkspace] = useMutation(DELETE_WORKSPACE);
    const [removeMember] = useMutation(REMOVE_MEMBER, {
        refetchQueries: [{ query: GET_WORKSPACE, variables: { id } }]
    });

    const { data, loading, error, refetch } = useQuery(GET_WORKSPACE, {
        variables: { id },
    }) as any;

    const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

    useEffect(() => {
        if (user) {
            getToken().then(setToken);
        }
    }, [user, getToken]);


    const startContainer = async () => {
        const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001/";
        setContainerStatus("STARTING");
        setErrorDetails(null);
        try {
            const response = await fetch(`${baseUrl}api/containers/${id}/start`,
                { method: "POST" });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "Failed to start container");
            }

            setContainerStatus("RUNNING");
        } catch (err: any) {
            console.error(err);
            setContainerStatus("ERROR");
            setErrorMessage(err.message);
            setErrorDetails(parseDockerError(err.message));
            toast.error("Cloud Environment failed to initialize.");
        }
    };

    const restartContainer = async () => {
        setIsRestarting(true);
        setContainerStatus("STARTING");
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL + `api/containers/${id}/restart` || "http://localhost:3001"}/api/containers/${id}/restart`, {
                method: "POST",
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "Failed to restart container");
            }
            toast.success("Environment restarted successfully");
            setContainerStatus("RUNNING");
        } catch (err: any) {
            console.error(err);
            setContainerStatus("ERROR");
            setErrorMessage(err.message);
            setErrorDetails(parseDockerError(err.message));
            toast.error("Failed to restart environment");
        } finally {
            setIsRestarting(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this workspace? This will stop and remove the cloud environment and delete all local files permanently.")) {
            return;
        }

        try {
            await deleteWorkspace({
                variables: { id, userId: user?.id },
            });
            toast.success("Workspace deleted successfully");
            router.push("/dashboard");
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Failed to delete workspace");
        }
    };

    const parseDockerError = (error: string) => {
        const err = error.toLowerCase();
        if (err.includes("no such image")) {
            return {
                title: "Docker Image Not Found",
                message: "The core engine components are being downloaded. This usually takes 1-3 minutes on the first run.",
                action: "Please wait or refresh in a moment..."
            };
        }
        if (err.includes("port is already allocated") || err.includes("address already in use")) {
            return {
                title: "Network Conflict",
                message: "The required network port is already being used by another process. Try restarting.",
                action: "Click the restart button above"
            };
        }
        if (err.includes("permission denied")) {
            return {
                title: "Permission Denied",
                message: "Docker doesn't have proper permissions to access the workspace filesystem.",
                action: "Check Docker Desktop or service permissions"
            };
        }
        if (err.includes("mkdir /run/desktop/mnt/host")) {
            return {
                title: "Windows Setup Error",
                message: "Docker Desktop is having trouble mounting your Windows drive. This often happens if the drive sharing is not properly configured in Docker settings.",
                action: "Enable 'Use the WSL 2 based engine' and 'File Sharing' in Docker Desktop settings"
            };
        }
        return {
            title: "Connection Error",
            message: error || "The cloud environment could not be reached or failed during startup.",
            action: "Try restarting or check your internet connection"
        };
    };

    const devTips = [
        "Lingo.dev Tip: You can switch between Spanish, French, and Hindi using the globe icon.",
        "Architecture: Your environment is powered by isolated Docker containers for maximum security.",
        "Pro Tip: Use the 'Collaborative' mode to code with your team in real-time.",
        "Caching: We cache your dependencies in shared volumes to make future setups lightning fast.",
        "Cloud IDE: The 'Cloud IDE' mode gives you a full VS Code experience in the browser.",
        "Lingo.dev fact: Our translation compiler automatically picks up new strings during the build.",
        "Performance: We allocate dedicated CPU and Memory for each workspace environment."
    ];

    useEffect(() => {
        if (!token || !id) return;

        const newSocket = io(socketUrl, {
            auth: { token }
        });
        setSocket(newSocket);

        newSocket.on("connect", () => {
            console.log(`WorkspacePage: Joined workspace room ${id}`);
            newSocket.emit("join-workspace", id);
        });

        newSocket.on("member-joined", (data) => {
            console.log("WorkspacePage: Member joined, refetching...", data);
            refetch();
            toast.info(`${data.name} joined the workspace!`);
        });

        newSocket.on("user-kicked", (data: { workspaceId: string; userId: string }) => {
            console.log("WorkspacePage: User kicked", data);
            if (data.workspaceId === id && data.userId === user?.id) {
                toast.error("You have been removed from this workspace");
                router.push("/dashboard");
            }
        });

        return () => {
            newSocket.disconnect();
            setSocket(null);
        };
    }, [token, id, socketUrl, refetch, user?.id, router]);

    useEffect(() => {
        if (containerStatus === "STARTING") {
            const baseUrl =
                process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001/";

            const eventSource = new EventSource(`${baseUrl}api/workspaces/${id}/setup-status`);

            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.progress) setProgress(data.progress);
                if (data.message) setLoadingStage(data.message);

                if (data.stage === "COMPLETED") {
                    eventSource.close();
                }
            };

            eventSource.onerror = () => {
                eventSource.close();
            };

            // Dev tips rotation
            setDevTip(devTips[Math.floor(Math.random() * devTips.length)]);
            const tipInterval = setInterval(() => {
                setDevTip(prev => {
                    const next = devTips[Math.floor(Math.random() * devTips.length)];
                    return next === prev ? devTips[(devTips.indexOf(next) + 1) % devTips.length] : next;
                });
            }, 5000);

            return () => {
                eventSource.close();
                clearInterval(tipInterval);
            };
        }
    }, [containerStatus, id]);

    useEffect(() => {
        if (data?.workspace) {
            startContainer();
            // Automatically show friends modal during initialization
            setIsFriendsModalOpen(true);
        }
    }, [data?.workspace]);

    const workspace = data?.workspace;
    const myMember = workspace?.members.find((m: any) => m.user.id === user?.id);
    const isOwner = workspace?.ownerId === user?.id || myMember?.role === "OWNER";

    if (loading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a0a] text-zinc-100">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-10 w-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Loading Workspace...</p>
                </div>
            </div>
        );
    }

    if (error || !workspace) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-zinc-100 p-6 text-center">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4 opacity-80" />
                <h2 className="text-xl font-bold mb-2">Workspace Not Found</h2>
                <p className="text-zinc-500 max-w-md mb-8">This workspace may have been deleted or you may not have permission to view it.</p>
                <Button onClick={() => router.push("/dashboard")} className="bg-indigo-600 hover:bg-indigo-700">
                    Back to Dashboard
                </Button>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-[#0a0a0a] text-zinc-100 overflow-hidden font-sans">
            <header className="h-14 border-b border-white/5 bg-[#0d0d0d]/80 backdrop-blur-md flex items-center justify-between px-4 shrink-0 z-50">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-indigo-400" />
                        <span className="text-sm font-semibold text-zinc-100">{workspace.name}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-1 bg-black/20 rounded-full border border-white/5">
                        <div className={`h-2 w-2 rounded-full ${containerStatus === "RUNNING" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : containerStatus === "STARTING" ? "bg-amber-500 animate-pulse" : "bg-zinc-500"}`} />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            {containerStatus === "RUNNING" ? "Connected" : containerStatus === "STARTING" ? "Initializing..." : containerStatus}
                        </span>
                    </div>

                    <Button
                        size="icon"
                        variant="ghost"
                        title="Restart Environment"
                        className={`h-8 w-8 hover:bg-white/5 text-zinc-400 hover:text-white ${isRestarting ? "animate-spin text-indigo-400" : ""}`}
                        onClick={restartContainer}
                        disabled={containerStatus === "STARTING" || isRestarting}
                    >
                        <RotateCw className="h-4 w-4" />
                    </Button>

                    <div className="h-4 w-[1px] bg-white/10 mx-1" />

                    <div className="flex bg-black/40 p-1 rounded-md border border-white/5 items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setCallMode("audio"); setIsVoiceActive(true); }}
                            className={`h-7 w-7 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-400/10 ${isVoiceActive && callMode === "audio" ? "text-emerald-400 bg-emerald-400/10" : ""}`}
                            title="Audio Call"
                        >
                            <Phone className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setCallMode("video"); setIsVoiceActive(true); }}
                            className={`h-7 w-7 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-400/10 ${isVoiceActive && callMode === "video" ? "text-indigo-400 bg-indigo-400/10" : ""}`}
                            title="Video Call"
                        >
                            <Video className="h-3.5 w-3.5" />
                        </Button>

                        <div className="w-[1px] h-4 bg-white/10 mx-1" />

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsFriendsModalOpen(true)}
                            className={`h-7 px-3 text-[10px] uppercase tracking-tighter transition-all text-zinc-500 hover:text-zinc-300`}
                        >
                            <Users className="h-3 w-3 mr-1.5" />
                            Friends
                        </Button>
                        <div className="w-[1px] h-4 bg-white/10 my-1.5 mx-1" />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode("collab")}
                            className={`h-7 px-3 text-[10px] uppercase tracking-tighter transition-all ${viewMode === "collab" ? "bg-indigo-600/20 text-indigo-400" : "text-zinc-500 hover:text-zinc-300"}`}
                        >
                            <Layout className="h-3 w-3 mr-1.5" />
                            Collaborative
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode("cloud")}
                            className={`h-7 px-3 text-[10px] uppercase tracking-tighter transition-all ${viewMode === "cloud" ? "bg-indigo-600/20 text-indigo-400" : "text-zinc-500 hover:text-zinc-300"}`}
                        >
                            <Globe className="h-3 w-3 mr-1.5" />
                            Cloud IDE
                        </Button>
                    </div>

                    {isOwner && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-zinc-400 hover:text-red-400 hover:bg-red-400/10"
                            onClick={handleDelete}
                            title="Destroy Workspace"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}

                    {isOwner && (
                        <Link href={`/workspace/${id}/settings`}>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/5">
                                <Settings className="h-4 w-4" />
                            </Button>
                        </Link>
                    )}
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">
                {containerStatus === "RUNNING" ? (
                    viewMode === "cloud" ? (
                        <iframe
                            src={`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001"}/ws/${id}/?folder=/home/coder/workspace`}
                            className="w-full h-full border-0"
                            allow="clipboard-read; clipboard-write"
                        />
                    ) : (
                        <CustomIDE workspaceId={id} socketUrl={socketUrl} />
                    )
                ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full text-zinc-500 bg-[#1e1e1e]">
                        {containerStatus === "ERROR" ? (
                            <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
                                <AlertCircle className="h-12 w-12 text-red-500/80 mb-4" />
                                <h3 className="text-xl font-semibold text-zinc-200 mb-2">
                                    {errorDetails?.title || "Environment Failed"}
                                </h3>
                                <p className="text-zinc-400 text-center max-w-md px-6 mb-6">
                                    {errorDetails?.message || errorMessage}
                                </p>
                                {errorDetails?.action && (
                                    <p className="text-xs text-zinc-500 mb-6 font-medium uppercase tracking-widest">
                                        ACTION: {errorDetails.action}
                                    </p>
                                )}
                                <div className="flex gap-3">
                                    <Button onClick={startContainer} variant="default" className="bg-indigo-600 hover:bg-indigo-700 text-white px-8">
                                        Try Reconnect
                                    </Button>
                                    <Button onClick={restartContainer} variant="outline" className="border-white/10 text-white px-8 hover:bg-white/5">
                                        Hard Reset
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center">
                                <div className="relative mb-8">
                                    <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
                                    <div className="relative h-16 w-16 bg-zinc-900 rounded-full flex items-center justify-center border border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                                    </div>
                                </div>
                                <h3 className="text-lg font-medium text-zinc-200 mb-2">Initializing Cloud Environment</h3>
                                <p className="text-sm text-zinc-400 mb-6">{loadingStage || "Preparing workspace..."}</p>
                                <div className="w-64 h-2 bg-zinc-800 rounded-full overflow-hidden border border-white/5 mb-8">
                                    <div className="h-full bg-gradient-to-r from-indigo-600 to-violet-600 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
                                </div>
                                <div className="max-w-md px-8 py-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-700">
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-400 font-bold mb-2 text-center">While you wait...</p>
                                    <p className="text-sm text-zinc-300 text-center italic leading-relaxed">"{devTip}"</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <FriendsModal
                    isOpen={isFriendsModalOpen}
                    onClose={() => setIsFriendsModalOpen(false)}
                    workspaceId={id}
                    workspaceName={workspace?.name || "Workspace"}
                    socketUrl={socketUrl}
                    workspaceMemberIds={workspace?.members.map((m: any) => m.user.id) || []}
                    isOwner={isOwner}
                    onRemoveMember={(targetUserId) => {
                        removeMember({ variables: { workspaceId: id, userId: targetUserId, adminId: user?.id } })
                            .then(() => toast.success("Member removed"))
                            .catch(err => toast.error(err.message));
                    }}
                />

                {!isChatOpen && (
                    <div className="absolute bottom-6 right-6 z-[60] animate-in slide-in-from-bottom-5 duration-300">
                        <Button
                            size="icon"
                            className="h-14 w-14 rounded-full shadow-2xl bg-indigo-600 hover:bg-indigo-500 transition-all duration-300 hover:scale-105"
                            onClick={() => { setIsChatOpen(true); setUnreadCount(0); }}
                        >
                            {unreadCount > 0 && (
                                <div className="absolute -top-1 -left-1 h-6 w-6 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-zinc-950 shadow-lg">
                                    {unreadCount > 9 ? "9+" : unreadCount}
                                </div>
                            )}
                            <MessageSquare className="h-6 w-6 text-white" />
                        </Button>
                    </div>
                )}

                <ChatSidebar
                    workspaceId={id}
                    socket={socket}
                    isOpen={isChatOpen}
                    ownerId={workspace.ownerId}
                    onUnreadCountChange={(count) => setUnreadCount(prev => prev + count)}
                    onClose={() => setIsChatOpen(false)}
                />

                <CallSystem
                    workspaceId={id}
                    user={user}
                    socket={socket}
                    isVoiceActive={isVoiceActive}
                    callMode={callMode}
                    setIsVoiceActive={setIsVoiceActive}
                    setCallMode={setCallMode}
                />
            </div>
        </div>
    );
}
