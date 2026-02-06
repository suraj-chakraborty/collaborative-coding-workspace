import React, { useEffect, useRef, useState } from "react";
import { useWebRTC } from "@/hooks/use-webrtc";
import { Mic, MicOff, Video, VideoOff, PhoneOff, User, Maximize2, X } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

const VideoPlayer = ({ peer, className = "w-full h-full object-cover rounded-lg bg-gray-900" }: { peer: any, className?: string }) => {
    const ref = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const handleStream = (stream: MediaStream) => {
            if (ref.current) {
                ref.current.srcObject = stream;
            }
        };
        peer.on("stream", handleStream);
        return () => {
            peer.off("stream", handleStream);
        }
    }, [peer]);

    return <video playsInline autoPlay ref={ref} className={className} />;
};

const AudioUserAvatar = ({ name, image, isSpeaking = false }: { name: string; image?: string; isSpeaking?: boolean }) => {
    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative">
                <AnimatePresence>
                    {isSpeaking && (
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1.2, opacity: 0.4 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                            className="absolute -inset-1 rounded-full bg-indigo-500 blur-sm"
                        />
                    )}
                </AnimatePresence>
                <Avatar className={`h-16 w-16 border-2 transition-colors duration-300 ${isSpeaking ? "border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.4)]" : "border-zinc-800"}`}>
                    <AvatarImage src={image} />
                    <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xl font-bold uppercase">{name[0]}</AvatarFallback>
                </Avatar>
                {isSpeaking && <div className="absolute -bottom-1 -right-1 bg-indigo-500 p-1 rounded-full shadow-lg"><Mic className="h-3 w-3 text-white" /></div>}
            </div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{name}</span>
        </div>
    );
};

export const VoiceChatPanel = ({ workspaceId, user, mode = "video" }: { workspaceId: string; user: any; mode?: "video" | "audio" }) => {
    const { getToken } = useAuth();
    const [token, setToken] = useState<string | null>(null);
    const [expandedPeerId, setExpandedPeerId] = useState<string | null>(null);

    useEffect(() => {
        getToken().then(setToken);
    }, [getToken]);

    const { peers, localStream, toggleMute, toggleVideo, leaveCall, isMuted, isVideoOff } = useWebRTC(workspaceId, user, token, mode === "audio");
    const localVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream, isVideoOff]);

    if (!localStream) return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-950/50 backdrop-blur-sm gap-4">
            <div className="relative">
                <div className="h-12 w-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                <PhoneOff className="absolute inset-0 m-auto h-5 w-5 text-indigo-400" />
            </div>
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest animate-pulse">Establishing Secure Connection...</p>
        </div>
    );

    const isAudioMode = mode === "audio";

    return (
        <div className="flex flex-col h-full bg-zinc-950 border-white/5 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-zinc-900/50">
                <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-zinc-100 uppercase tracking-[0.2em]">Live {isAudioMode ? "Voice" : "Video"}</span>
                </div>
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">
                    {peers.length + 1} Connected
                </div>
            </div>

            <div className="flex-1 p-2 overflow-hidden flex flex-col min-h-0 relative">
                <ScrollArea className="h-full">
                    {isAudioMode ? (
                        <div className="flex flex-wrap items-center justify-center gap-8 py-8 h-full min-h-[160px]">
                            {/* Local User Audio */}
                            <AudioUserAvatar name={user?.fullName || "You"} image={user?.imageUrl} isSpeaking={!isMuted} />

                            {/* Remote Peers Audio */}
                            {peers.map((p) => (
                                <motion.div
                                    key={p.peerID}
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.5 }}
                                >
                                    <AudioUserAvatar name={p.name} image={p.image} isSpeaking={true} />
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <motion.div
                            layout
                            className="grid grid-cols-2 gap-2 pb-2"
                        >
                            <AnimatePresence mode="popLayout">
                                {/* Local User Video */}
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="relative aspect-video bg-zinc-900 rounded-xl overflow-hidden border border-white/5 group shadow-2xl"
                                >
                                    {isVideoOff ? (
                                        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 gap-2">
                                            <div className="p-3 bg-zinc-800 rounded-full border border-white/5">
                                                <User className="h-6 w-6 text-zinc-500" />
                                            </div>
                                            <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest text-center">Video Paused</span>
                                        </div>
                                    ) : (
                                        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-[9px] font-bold text-white uppercase tracking-wider truncate max-w-[100px]">You</span>
                                        <Button size="icon" variant="ghost" className="h-5 w-5 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setExpandedPeerId("me")}>
                                            <Maximize2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </motion.div>

                                {/* Remote Peers Video */}
                                {peers.map((p) => (
                                    <motion.div
                                        key={p.peerID}
                                        layout
                                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        className="relative aspect-video bg-zinc-900 rounded-xl overflow-hidden border border-white/5 group shadow-2xl"
                                    >
                                        <VideoPlayer peer={p.peer} />
                                        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[9px] font-bold text-white uppercase tracking-wider truncate max-w-[100px]">{p.name}</span>
                                            <Button size="icon" variant="ghost" className="h-5 w-5 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setExpandedPeerId(p.peerID)}>
                                                <Maximize2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </ScrollArea>
            </div>

            <div className="p-3 bg-zinc-900/80 backdrop-blur-md border-t border-white/5 flex justify-center items-center gap-4">
                <Button
                    size="icon"
                    variant={isMuted ? "destructive" : "secondary"}
                    onClick={toggleMute}
                    className={`h-10 w-10 rounded-full shadow-lg transition-all duration-300 ${!isMuted && "hover:scale-110 active:scale-95"}`}
                >
                    {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>

                {!isAudioMode && (
                    <Button
                        size="icon"
                        variant={isVideoOff ? "destructive" : "secondary"}
                        onClick={toggleVideo}
                        className={`h-10 w-10 rounded-full shadow-lg transition-all duration-300 ${!isVideoOff && "hover:scale-110 active:scale-95"}`}
                    >
                        {isVideoOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                    </Button>
                )}

                <Button
                    size="icon"
                    variant="destructive"
                    onClick={leaveCall}
                    className="h-10 w-10 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:bg-red-500 transition-all duration-500 group animate-pulse hover:animate-none"
                >
                    <PhoneOff className="h-4 w-4 group-hover:rotate-[135deg] transition-transform duration-500" />
                </Button>
            </div>

            {/* Expansion Modal */}
            <Dialog open={!!expandedPeerId} onOpenChange={() => setExpandedPeerId(null)}>
                <DialogContent className="max-w-[95vw] w-max h-[80vh] bg-zinc-950 border-white/10 p-0 overflow-hidden flex flex-col shadow-2xl">
                    <DialogHeader className="p-4 border-b border-white/5 bg-zinc-900/50 flex flex-row items-center justify-between space-y-0">
                        <DialogTitle className="text-zinc-100 text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                            <Video className="h-4 w-4 text-indigo-400" />
                            Viewing {expandedPeerId === "me" ? "Self" : peers.find(p => p.peerID === expandedPeerId)?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 bg-black relative flex items-center justify-center p-4">
                        {expandedPeerId === "me" ? (
                            <video
                                ref={(el) => {
                                    if (el && localStream) el.srcObject = localStream;
                                }}
                                autoPlay
                                playsInline
                                muted
                                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/5"
                            />
                        ) : (
                            peers.find(p => p.peerID === expandedPeerId) && (
                                <VideoPlayer
                                    peer={peers.find(p => p.peerID === expandedPeerId)!.peer}
                                    className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/5"
                                />
                            )
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
