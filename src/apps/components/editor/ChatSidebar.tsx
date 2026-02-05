"use client";
// Audio playback fix HMR trigger

import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Socket } from "socket.io-client";
import { toast } from "sonner";
import { useAuth, useUser } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";

import { Mic, Type, Settings, Check, Paperclip, StopCircle, FileText, Download, Heart, Trash, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useLingoContext } from "@lingo.dev/compiler/react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

// Mock Translation Helper (Simulates translation logic)
// In a real APP, this would call a translation API.
const translate = async (text: string, sourceLang: string, targetLang: string) => {
    if (sourceLang === targetLang) return text;
    // Simulate async translation
    await new Promise(r => setTimeout(r, 100));
    return `[${targetLang}] ${text}`;
};

interface Message {
    id: string;
    text: string;
    sender: {
        name: string;
        image?: string;
        id: string;
    };
    timestamp: number;
    fileUrl?: string;
    fileType?: "audio" | "image" | "file";
    fileName?: string;
    likes?: number;
    isDeleted?: boolean;
}

interface ChatSidebarProps {
    workspaceId: string;
    socket: Socket | null;
    isOpen: boolean;
    ownerId?: string;
    onUnreadCountChange?: (count: number) => void;
    onClose: () => void;
}

export function ChatSidebar({ workspaceId, socket, isOpen, ownerId, onUnreadCountChange, onClose }: ChatSidebarProps) {
    const { user } = useUser();
    const { getToken } = useAuth();
    const { locale } = useLingoContext();

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [chatFontSize, setChatFontSize] = useState<"text-xs" | "text-sm" | "text-base">("text-xs");
    const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});

    // File/Voice State
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const [uploading, setUploading] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Refs for socket listeners to avoid re-effects
    const isOpenRef = useRef(isOpen);
    const onUnreadCountChangeRef = useRef(onUnreadCountChange);

    useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
    useEffect(() => { onUnreadCountChangeRef.current = onUnreadCountChange; }, [onUnreadCountChange]);


    const scrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    };

    useEffect(() => {
        if (!socket) return;


        socket.on("chat-history", (history: Message[]) => {
            setMessages(history);
            setTimeout(scrollToBottom, 300);
        });

        socket.on("chat-message", async (msg: any) => {
            setMessages((prev) => [...prev, msg]);

            if (!isOpenRef.current && onUnreadCountChangeRef.current) {
                onUnreadCountChangeRef.current(1);
            }

            if (msg.lang && msg.lang !== locale) {
                const translated = await translate(msg.text, msg.lang, locale as string);
                setTranslatedMessages(prev => ({ ...prev, [`${msg.id}-${locale}`]: translated }));
            }

            setTimeout(scrollToBottom, 100);
        });

        socket.on("chat-like", (data: { messageId: string, likes: number }) => {
            setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, likes: data.likes } : m));
        });

        socket.on("chat-delete", (data: { messageId: string }) => {
            setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, isDeleted: true, text: "This message was deleted" } : m));
        });

        return () => {
            socket.off("chat-history");
            socket.off("chat-message");
            socket.off("chat-like");
            socket.off("chat-delete");
        };
    }, [workspaceId, socket, locale]);

    const handleSend = async () => {
        if ((!input.trim() && !uploading) || !socket || !user) return;

        const msgId = Math.random().toString(36).substr(2, 9);
        const msg: Message = {
            id: msgId,
            text: input,
            sender: {
                name: user.fullName || "Anonymous",
                image: user.imageUrl,
                id: user.id
            },
            timestamp: Date.now(),
        };

        socket.emit("chat-message", {
            workspaceId,
            message: msg.text,
            ...msg,
            lang: locale || "en"
        });
        setInput("");
    };

    const handleLike = (messageId: string) => {
        socket?.emit("chat-like", { workspaceId, messageId });
    };

    const handleDelete = (messageId: string) => {
        socket?.emit("chat-delete", { workspaceId, messageId });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);

        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = reader.result as string;
                await uploadAndSend(file.name, file.type.startsWith("image/") ? "image" : "file", base64);
            };
        } catch (err) {
            console.error(err);
            toast.error("Upload failed");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : "audio/mp4";

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunks, { type: mimeType });
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onload = async () => {
                    await uploadAndSend(`voice-${Date.now()}.${mimeType.includes("webm") ? "webm" : "m4a"}`, "audio", reader.result as string);
                };
                stream.getTracks().forEach(track => track.stop());

                if (recordingIntervalRef.current) {
                    clearInterval(recordingIntervalRef.current);
                    recordingIntervalRef.current = null;
                }
                setRecordingTime(0);
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error("Mic error:", err);
            toast.error("Could not access microphone");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const uploadAndSend = async (name: string, type: "audio" | "image" | "file", content: string) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001"}/api/upload`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, type, content }),
            });
            const data = await res.json();

            if (data.url) {
                const msgId = Math.random().toString(36).substr(2, 9);
                const msg: Message = {
                    id: msgId,
                    text: type === "audio" ? "Voice Note" : type === "image" ? "Image Attached" : "File Attached",
                    sender: {
                        name: user?.fullName || "Anonymous",
                        image: user?.imageUrl,
                        id: user?.id || "unknown"
                    },
                    timestamp: Date.now(),
                    fileUrl: data.url,
                    fileType: type as any,
                    fileName: name
                };

                socket?.emit("chat-message", {
                    workspaceId,
                    message: msg.text,
                    ...msg,
                    lang: locale || "en"
                });
            }
        } catch (err) {
            console.error("Upload send error:", err);
            toast.error("Failed to send content");
        }
    };

    return (
        <>

            <Dialog open={!!selectedImage} onOpenChange={(open) => {
                if (!open) {
                    setSelectedImage(null);
                    setZoom(1);
                }
            }}>
                <DialogContent className="max-w-7xl h-[90vh] bg-zinc-950/90 backdrop-blur-xl border-zinc-800 p-0 overflow-hidden flex flex-col">
                    <DialogHeader className="sr-only">
                        <DialogTitle>View Image</DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 relative overflow-auto flex items-center justify-center p-4">
                        <div
                            className="transition-transform duration-200 ease-out flex items-center justify-center min-h-full min-w-full"
                            style={{ transform: `scale(${zoom})` }}
                        >
                            {selectedImage && (
                                <img
                                    src={selectedImage}
                                    alt="Full Size"
                                    className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
                                />
                            )}
                        </div>
                    </div>

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-2xl scale-110">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setZoom(prev => Math.max(0.5, prev - 0.25))}>
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <span className="text-[10px] font-bold text-white w-12 text-center uppercase tracking-tighter">
                            {Math.round(zoom * 100)}%
                        </span>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setZoom(prev => Math.min(3, prev + 0.25))}>
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                        <div className="w-[1px] h-4 bg-white/20 mx-1" />
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setZoom(1)} title="Reset Zoom">
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                        <div className="w-[1px] h-4 bg-white/20 mx-1" />
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-3 text-white hover:bg-white/10 text-[10px] font-bold uppercase tracking-tighter"
                            onClick={() => {
                                const link = document.createElement("a");
                                link.href = selectedImage || "";
                                link.download = "downloaded-image";
                                link.click();
                            }}
                        >
                            <Download className="h-3 w-3 mr-2" />
                            Save
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <div className={"w-80 border-l border-white/10 bg-zinc-900 flex flex-col h-full absolute right-0 top-0 z-50 shadow-2xl transition-transform duration-300 min-h-0 " + (isOpen ? "translate-x-0" : "translate-x-full pointer-events-none")}>
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20">
                    <div className="flex items-center gap-2 text-zinc-100">
                        <MessageSquare className="h-4 w-4" />
                        <span className="font-semibold text-sm">Team Chat</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" title="Chat Settings">
                                    <Settings className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-800 text-zinc-200">
                                <DropdownMenuLabel>Font Size</DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-zinc-800" />
                                <DropdownMenuItem onClick={() => setChatFontSize("text-xs")}>
                                    <span className="text-xs flex-1">Small</span>
                                    {chatFontSize === "text-xs" && <Check className="h-3 w-3" />}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setChatFontSize("text-sm")}>
                                    <span className="text-sm flex-1">Medium</span>
                                    {chatFontSize === "text-sm" && <Check className="h-3 w-3" />}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setChatFontSize("text-base")}>
                                    <span className="text-base flex-1">Large</span>
                                    {chatFontSize === "text-base" && <Check className="h-3 w-3" />}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>


                        <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6 text-zinc-400 hover:text-white">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">

                    <ScrollArea className="flex-1" ref={scrollContainerRef} type="always">
                        <div className="p-4 space-y-4 pb-4">
                            {messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full py-20 text-center space-y-3 opacity-50">
                                    <div className="p-3 bg-zinc-800/50 rounded-full">
                                        <MessageSquare className="h-6 w-6 text-zinc-400" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-zinc-300">No conversation yet</p>
                                        <p className="text-xs text-zinc-500 max-w-[180px]">Start the discussion by sending a message below.</p>
                                    </div>
                                </div>
                            ) : (
                                messages.map((msg, index) => {
                                    const isMe = msg.sender.id === user?.id;
                                    const canDelete = isMe || user?.id === ownerId;
                                    return (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, x: isMe ? 20 : -20, scale: 0.95 }}
                                            animate={{ opacity: 1, x: 0, scale: 1 }}
                                            transition={{
                                                duration: 0.3,
                                                delay: Math.min(index * 0.05, 0.5),
                                                type: "spring",
                                                stiffness: 260,
                                                damping: 20
                                            }}
                                            className={`flex gap-2 group ${isMe ? "flex-row-reverse" : "flex-row"}`}
                                        >
                                            <Avatar className="h-6 w-6 mt-1 flex-shrink-0">
                                                <AvatarImage src={msg.sender.image} />
                                                <AvatarFallback>{msg.sender.name[0]}</AvatarFallback>
                                            </Avatar>
                                            <div className={`flex flex-col max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                                                <div className="flex items-baseline gap-2 mb-1">
                                                    <span className="text-[10px] text-zinc-500 font-medium">{msg.sender.name}</span>
                                                    <span className="text-[9px] text-zinc-600">
                                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <motion.div
                                                    whileHover={{ scale: 1.01 }}
                                                    className={`rounded-lg px-3 py-2 relative shadow-sm transition-shadow hover:shadow-indigo-500/10 ${chatFontSize} ${isMe
                                                        ? "bg-indigo-600 text-white"
                                                        : "bg-zinc-800 text-zinc-300 border border-white/5"
                                                        }`}
                                                >
                                                    {msg.fileUrl ? (
                                                        <div className="flex flex-col gap-2">
                                                            {msg.fileType === "audio" && (
                                                                <div className="flex flex-col gap-1">
                                                                    <div className="flex items-center gap-2 bg-black/40 px-2 py-1.5 rounded-full border border-white/5">
                                                                        <audio
                                                                            src={msg.fileUrl}
                                                                            controls
                                                                            preload="auto"
                                                                            onError={(e) => {
                                                                                const audio = e.currentTarget;
                                                                                console.error("Audio playback error:", {
                                                                                    code: audio.error?.code,
                                                                                    message: audio.error?.message,
                                                                                    src: audio.src
                                                                                });
                                                                            }}
                                                                            onLoadedMetadata={(e) => {
                                                                                const audio = e.currentTarget;
                                                                                if (audio.duration === Infinity) {
                                                                                    audio.currentTime = 1e101;
                                                                                    audio.ontimeupdate = function () {
                                                                                        this.ontimeupdate = () => { };
                                                                                        audio.currentTime = 0;
                                                                                    }
                                                                                }
                                                                            }}
                                                                            className="w-44 h-8"
                                                                        />
                                                                    </div>
                                                                    <span className="text-[9px] opacity-60 text-center font-bold tracking-widest uppercase">Voice Note</span>
                                                                </div>
                                                            )}
                                                            {msg.fileType === "image" && (
                                                                <div
                                                                    className="relative group cursor-zoom-in overflow-hidden rounded-md border border-white/10"
                                                                    onClick={() => setSelectedImage(msg.fileUrl || null)}
                                                                >
                                                                    <img src={msg.fileUrl} alt="attachment" className="max-w-[200px] transition-transform duration-300 group-hover:scale-105" />
                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                        <ZoomIn className="h-5 w-5 text-white" />
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {msg.fileType === "file" && (
                                                                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                                                                    <FileText className="h-4 w-4" />
                                                                    {msg.fileName}
                                                                </a>
                                                            )}
                                                            {msg.text && msg.fileType !== "audio" && msg.fileType !== "image" && <span className="text-[10px] opacity-70">{msg.text}</span>}
                                                        </div>
                                                    ) : (
                                                        <span className={msg.isDeleted ? "italic opacity-50" : ""}>{msg.text}</span>
                                                    )}
                                                    {translatedMessages[`${msg.id}-${locale}`] && (
                                                        <div className="mt-1 pt-1 border-t border-white/10 text-[10px] opacity-70 italic">
                                                            {translatedMessages[`${msg.id}-${locale}`]}
                                                        </div>
                                                    )}
                                                </motion.div>

                                                {!msg.isDeleted && (
                                                    <div className={`flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                                                        <motion.button
                                                            whileHover={{ scale: 1.2, rotate: 15 }}
                                                            whileTap={{ scale: 0.9 }}
                                                            onClick={() => handleLike(msg.id)}
                                                            className={`flex items-center gap-1 text-[9px] hover:text-red-400 transition-colors ${msg.likes ? "text-red-400 font-bold" : "text-zinc-500"}`}
                                                        >
                                                            <Heart className={`h-3 w-3 ${msg.likes ? "fill-current" : ""}`} />
                                                            {msg.likes || ""}
                                                        </motion.button>
                                                        {canDelete && (
                                                            <motion.button
                                                                whileHover={{ scale: 1.2, color: "#ef4444" }}
                                                                whileTap={{ scale: 0.9 }}
                                                                onClick={() => handleDelete(msg.id)}
                                                                className="text-zinc-500 hover:text-red-400 transition-colors"
                                                                title="Delete Message"
                                                            >
                                                                <Trash className="h-3 w-3" />
                                                            </motion.button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                            <div ref={scrollRef} className="h-1" />
                        </div>
                    </ScrollArea>
                </div>

                <div className="p-3 border-t border-white/10 bg-black/20 shrink-0">
                    <div className="flex gap-2 items-center">
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-zinc-400 hover:text-white"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                        >
                            <Paperclip className="h-4 w-4" />
                        </Button>

                        <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={uploading ? "Uploading..." : "Type a message..."}
                            className="bg-zinc-950 border-zinc-800 focus-visible:ring-indigo-500 h-9"
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            disabled={uploading}
                        />

                        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                            <Button
                                size="icon"
                                variant={isRecording ? "destructive" : "ghost"}
                                className={`h-9 w-9 relative transition-all duration-300 ${isRecording ? "scale-110 shadow-[0_0_15px_rgba(239,68,68,0.4)]" : "text-zinc-400 hover:text-white"}`}
                                onMouseDown={startRecording}
                                onMouseUp={stopRecording}
                                onMouseLeave={stopRecording}
                                onTouchStart={startRecording}
                                onTouchEnd={stopRecording}
                                title="Hold to Record"
                            >
                                {isRecording && (
                                    <div className="absolute -top-12 right-0 bg-red-600 text-[10px] font-bold text-white px-2 py-1 rounded flex items-center gap-1 whitespace-nowrap shadow-lg animate-in fade-in slide-in-from-bottom-2">
                                        <span className="h-1.5 w-1.5 bg-white rounded-full animate-pulse" />
                                        REC {formatTime(recordingTime)}
                                    </div>
                                )}
                                <Mic className="h-4 w-4" />
                            </Button>
                        </motion.div>

                        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                            <Button size="icon" onClick={handleSend} className="h-9 w-9 bg-indigo-600 hover:bg-indigo-500" disabled={uploading || (!input.trim() && !uploading)}>
                                <Send className="h-4 w-4" />
                            </Button>
                        </motion.div>
                    </div>
                </div>
            </div>
        </>
    );
}
