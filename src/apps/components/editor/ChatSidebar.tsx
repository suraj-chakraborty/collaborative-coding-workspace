"use client";

import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useAuth, useUser } from "@clerk/nextjs";
import { VoiceChatPanel } from "@/components/workspace/voice-chat";

import { Mic, Phone, PhoneIncoming, Video, Type, Settings, Check, Paperclip, StopCircle, FileText, Download } from "lucide-react";
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
}

interface ChatSidebarProps {
    workspaceId: string;
    socketUrl: string;
    isOpen: boolean;
    onClose: () => void;
}

export function ChatSidebar({ workspaceId, socketUrl, isOpen, onClose }: ChatSidebarProps) {
    const { user } = useUser();
    const { getToken } = useAuth();
    const { locale } = useLingoContext();

    const [socket, setSocket] = useState<Socket | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isVoiceActive, setIsVoiceActive] = useState(false);
    const [callMode, setCallMode] = useState<"video" | "audio">("video");

    const [chatFontSize, setChatFontSize] = useState<"text-xs" | "text-sm" | "text-base">("text-xs");
    const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
    const [incomingCall, setIncomingCall] = useState<{ name: string; image?: string; mode?: "video" | "audio" } | null>(null);

    // File/Voice State
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        getToken().then(setToken);
    }, [getToken]);

    useEffect(() => {
        if (!token) return;

        const newSocket = io(socketUrl, {
            auth: { token }
        });
        setSocket(newSocket);

        newSocket.on("connect", () => {
            console.log("Chat connected");
            newSocket.emit("join-workspace", workspaceId);
        });

        newSocket.on("chat-history", (history: Message[]) => {
            setMessages(history);
            // Auto-scroll to bottom
            setTimeout(() => {
                scrollRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
        });

        newSocket.on("chat-message", async (msg: any) => {
            setMessages((prev) => [...prev, msg]);

            // Translation Logic
            if (msg.lang && msg.lang !== locale) {
                const translated = await translate(msg.text, msg.lang, locale as string);
                setTranslatedMessages(prev => ({ ...prev, [`${msg.id}-${locale}`]: translated }));
            }

            // Auto-scroll
            setTimeout(() => {
                scrollRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
        });

        newSocket.on("incoming-call", (payload: { caller: { name: string, image?: string }, mode?: "video" | "audio" }) => {
            if (isVoiceActive) return; // Already in call
            setIncomingCall({ ...payload.caller, mode: payload.mode || "video" });
            // Play a sound if possible (optional)
        });

        return () => {
            newSocket.disconnect();
        };
    }, [workspaceId, socketUrl, token, locale, isVoiceActive]); // Added isVoiceActive dependency so we don't alert if already active

    // Translate existing messages when locale changes
    useEffect(() => {
        messages.forEach(async (msg: any) => {
            if (msg.lang && msg.lang !== locale && !translatedMessages[`${msg.id}-${locale}`]) {
                const translated = await translate(msg.text, msg.lang, locale as string);
                setTranslatedMessages(prev => ({ ...prev, [`${msg.id}-${locale}`]: translated }));
            }
        });
    }, [locale, messages]);

    const handleSend = async () => {
        if ((!input.trim() && !uploading) || !socket || !user) return;

        const msg: Message = {
            id: Math.random().toString(36).substr(2, 9),
            text: input,
            sender: {
                name: user.fullName || "Anonymous",
                image: user.imageUrl,
                id: user.id
            },
            timestamp: Date.now(),
        };

        // Send with language info (current user's locale)
        socket.emit("chat-message", {
            workspaceId,
            message: msg.text,
            user: msg.sender,
            ...msg,
            lang: locale || "en"
        });
        setInput("");
    };

    // File Upload Handler
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

    // Voice Recording Handlers
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunks, { type: "audio/webm;codecs=opus" });
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onload = async () => {
                    await uploadAndSend(`voice-${Date.now()}.webm`, "audio", reader.result as string);
                };
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Mic error:", err);
            toast.error("Could not access microphone");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
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
                const msg: Message = {
                    id: Math.random().toString(36).substr(2, 9),
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
                    user: msg.sender,
                    ...msg,
                    lang: locale || "en"
                });
            }
        } catch (err) {
            console.error("Upload send error:", err);
            toast.error("Failed to send content");
        }
    };

    // if (!isOpen) return null; // REMOVED: Keep mounted for socket connection

    return (
        <>
            <Dialog open={!!incomingCall} onOpenChange={(open) => !open && setIncomingCall(null)}>
                <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800 text-white">
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

            <div className={`w-80 border-l border-white/10 bg-zinc-900 flex flex-col h-screen absolute right-0 top-0 z-50 shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}>
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

                        {isVoiceActive ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsVoiceActive(false)}
                                className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                title="Leave Call"
                            >
                                <Phone className="h-4 w-4" />
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => { setCallMode("audio"); setIsVoiceActive(true); }}
                                    className="h-6 w-6 text-zinc-400 hover:text-emerald-400"
                                    title="Start Audio Call"
                                >
                                    <Phone className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => { setCallMode("video"); setIsVoiceActive(true); }}
                                    className="h-6 w-6 text-zinc-400 hover:text-indigo-400"
                                    title="Start Video Call"
                                >
                                    <Video className="h-4 w-4" />
                                </Button>
                            </>
                        )}

                        <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6 text-zinc-400 hover:text-white">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {isVoiceActive && (
                    <div className="h-1/3 border-b border-white/10 relative">
                        <VoiceChatPanel workspaceId={workspaceId} user={user} mode={callMode} />
                    </div>
                )}

                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
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
                            messages.map((msg) => {
                                const isMe = msg.sender.id === user?.id;
                                return (
                                    <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                                        <Avatar className="h-6 w-6 mt-1">
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
                                            <div
                                                className={`rounded-lg px-3 py-2 ${chatFontSize} ${isMe
                                                    ? "bg-indigo-600 text-white"
                                                    : "bg-zinc-800 text-zinc-300 border border-white/5"
                                                    }`}
                                            >
                                                {msg.fileUrl ? (
                                                    <div className="flex flex-col gap-2">
                                                        {msg.fileType === "audio" && (
                                                            <audio controls src={msg.fileUrl} className="w-48 h-8 rounded-full" />
                                                        )}
                                                        {msg.fileType === "image" && (
                                                            <img src={msg.fileUrl} alt="attachment" className="max-w-[200px] rounded-md border border-white/10" />
                                                        )}
                                                        {msg.fileType === "file" && (
                                                            <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                                                                <FileText className="h-4 w-4" />
                                                                {msg.fileName}
                                                            </a>
                                                        )}
                                                        {msg.text && <span className="text-[10px] opacity-70">{msg.text}</span>}
                                                    </div>
                                                ) : (
                                                    msg.text
                                                )}
                                                {translatedMessages[`${msg.id}-${locale}`] && (
                                                    <div className="mt-1 pt-1 border-t border-white/10 text-[10px] opacity-70 italic">
                                                        {translatedMessages[`${msg.id}-${locale}`]}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={scrollRef} />
                    </div>
                </ScrollArea>

                <div className="p-3 border-t border-white/10 bg-black/20">
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

                        <Button
                            size="icon"
                            variant={isRecording ? "destructive" : "ghost"}
                            className={`h-9 w-9 ${isRecording ? "animate-pulse" : "text-zinc-400 hover:text-white"}`}
                            onMouseDown={startRecording}
                            onMouseUp={stopRecording}
                            onTouchStart={startRecording}
                            onTouchEnd={stopRecording}
                            title="Hold to Record"
                        >
                            <Mic className="h-4 w-4" />
                        </Button>

                        <Button size="icon" onClick={handleSend} className="h-9 w-9 bg-indigo-600 hover:bg-indigo-500" disabled={uploading}>
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}
