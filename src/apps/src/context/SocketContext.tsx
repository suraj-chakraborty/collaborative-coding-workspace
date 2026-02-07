"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@clerk/nextjs";

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }: { children: React.ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const { getToken } = useAuth();

    useEffect(() => {
        let s: Socket | null = null;

        getToken().then((token) => {
            if (!token) return;

            // Connect via Next.js proxy
            // The rewrites in next.config.ts handle routing /socket.io to the backend
            s = io(process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001", {
                auth: { token },
                transports: ['polling', 'websocket'],
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                timeout: 20000,
            });

            s.on("connect", () => {
                console.log("SocketContext: Connected to server");
                setIsConnected(true);
            });

            s.on("connect_error", (error) => {
                console.error("SocketContext: Connection Error:", error.message);
                setIsConnected(false);
            });

            s.on("reconnect_attempt", (attempt) => {
                console.log(`SocketContext: Reconnection attempt ${attempt}`);
            });

            s.on("disconnect", (reason) => {
                console.info("SocketContext: Disconnected:", reason);
                setIsConnected(false);
            });

            setSocket(s);
        });

        return () => {
            if (s) {
                s.disconnect();
            }
        };
    }, [getToken]);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
}
