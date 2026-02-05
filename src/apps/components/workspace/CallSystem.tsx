"use client";

import { useState, useEffect, useRef } from "react";
import { Socket } from "socket.io-client";
import { PhoneIncoming, Video, Phone, GripHorizontal } from "lucide-react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VoiceChatPanel } from "@/components/workspace/voice-chat";

interface CallSystemProps {
    workspaceId: string;
    user: any;
    socket: Socket | null;
    isVoiceActive: boolean;
    callMode: "video" | "audio";
    setIsVoiceActive: (active: boolean) => void;
    setCallMode: (mode: "video" | "audio") => void;
}

export function CallSystem({
    workspaceId,
    user,
    socket,
    isVoiceActive,
    callMode,
    setIsVoiceActive,
    setCallMode,
}: CallSystemProps) {
    const [incomingCall, setIncomingCall] = useState<{ name: string; image?: string; mode?: "video" | "audio" } | null>(null);
    const dragControls = useDragControls();

    useEffect(() => {
        if (!socket) return;

        const handleIncomingCall = (payload: { caller: { name: string, image?: string }, mode?: "video" | "audio" }) => {
            if (isVoiceActive) return;
            setIncomingCall({ ...payload.caller, mode: payload.mode || "video" });
        };

        socket.on("incoming-call", handleIncomingCall);

        return () => {
            socket.off("incoming-call", handleIncomingCall);
        };
    }, [socket, isVoiceActive]);

    return (
        <>
            <Dialog open={!!incomingCall} onOpenChange={(open) => !open && setIncomingCall(null)}>
                <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800 text-white z-[100]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <PhoneIncoming className="h-5 w-5 text-indigo-400 animate-pulse" />
                            Incoming Call
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            <span className="font-semibold text-zinc-200">{incomingCall?.name}</span> is inviting you to a voice call.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center justify-center py-6">
                        <Avatar className="h-20 w-20 ring-4 ring-indigo-500/20">
                            <AvatarImage src={incomingCall?.image} />
                            <AvatarFallback className="bg-zinc-800 text-xl">{incomingCall?.name?.[0]}</AvatarFallback>
                        </Avatar>
                    </div>
                    <DialogFooter className="flex gap-2 sm:justify-center">
                        <Button
                            variant="outline"
                            onClick={() => setIncomingCall(null)}
                            className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 w-full sm:w-auto"
                        >
                            Decline
                        </Button>
                        <Button
                            onClick={() => {
                                setCallMode(incomingCall?.mode || "video");
                                setIsVoiceActive(true);
                                setIncomingCall(null);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white w-full sm:w-auto"
                        >
                            Accept & Join {incomingCall?.mode === "audio" ? "(Audio)" : "(Video)"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AnimatePresence>
                {isVoiceActive && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        drag
                        dragControls={dragControls}
                        dragMomentum={false}
                        dragListener={false}
                        className="fixed top-24 right-8 w-80 z-[60] shadow-2xl rounded-2xl overflow-hidden border border-white/10"
                    >
                        <div
                            className="bg-zinc-900 p-2 flex items-center justify-between border-b border-white/5 cursor-grab active:cursor-grabbing select-none"
                            onPointerDown={(e) => dragControls.start(e)}
                        >
                            <div className="flex items-center gap-2 px-2">
                                <GripHorizontal className="h-3 w-3 text-zinc-500" />
                                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-100">Active {callMode}</span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsVoiceActive(false)}
                                className="h-7 w-7 text-zinc-400 hover:text-white"
                            >
                                <Phone className="h-4 w-4 rotate-[135deg] text-red-400" />
                            </Button>
                        </div>
                        <div className="h-[300px]">
                            <VoiceChatPanel workspaceId={workspaceId} user={user} mode={callMode} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
