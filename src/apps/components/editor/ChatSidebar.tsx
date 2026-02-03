"use client";

import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { io, Socket } from "socket.io-client";
import { useUser } from "@clerk/nextjs";

interface Message {
    id: string;
    text: string;
    sender: {
        name: string;
        image?: string;
        id: string;
    };
    timestamp: number;
}

interface ChatSidebarProps {
    workspaceId: string;
    socketUrl: string;
    isOpen: boolean;
    onClose: () => void;
}

export function ChatSidebar({ workspaceId, socketUrl, isOpen, onClose }: ChatSidebarProps) {
    const { user } = useUser();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const newSocket = io(socketUrl);
        setSocket(newSocket);

        newSocket.on("connect", () => {
            console.log("Chat connected");
            newSocket.emit("join-workspace", workspaceId);
        });

        newSocket.on("chat-message", (msg: any) => {
            setMessages((prev) => [...prev, msg]);
            // Auto-scroll
            setTimeout(() => {
                scrollRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
        });

        return () => {
            newSocket.disconnect();
        };
    }, [workspaceId, socketUrl]);

    const handleSend = () => {
        if (!input.trim() || !socket || !user) return;

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

        socket.emit("chat-message", { workspaceId, message: msg.text, user: msg.sender, ...msg });
        setInput("");
    };

    if (!isOpen) return null;

    return (
        <div className="w-80 border-l border-white/10 bg-zinc-900 flex flex-col h-full absolute right-0 top-0 z-50 shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20">
                <div className="flex items-center gap-2 text-zinc-100">
                    <MessageSquare className="h-4 w-4" />
                    <span className="font-semibold text-sm">Team Chat</span>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6 text-zinc-400 hover:text-white">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                    {messages.map((msg) => {
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
                                        className={`rounded-lg px-3 py-2 text-xs ${isMe
                                                ? "bg-indigo-600 text-white"
                                                : "bg-zinc-800 text-zinc-300 border border-white/5"
                                            }`}
                                    >
                                        {msg.text}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            <div className="p-3 border-t border-white/10 bg-black/20">
                <div className="flex gap-2">
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a message..."
                        className="bg-zinc-950 border-zinc-800 focus-visible:ring-indigo-500 h-9"
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    />
                    <Button size="icon" onClick={handleSend} className="h-9 w-9 bg-indigo-600 hover:bg-indigo-500">
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
