import React, { useEffect, useRef, useState } from "react";
import { useWebRTC } from "@/hooks/use-webrtc";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { useAuth } from "@clerk/nextjs";

const VideoPlayer = ({ peer }: { peer: any }) => {
    const ref = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        peer.on("stream", (stream: MediaStream) => {
            if (ref.current) {
                ref.current.srcObject = stream;
            }
        });
    }, [peer]);

    return <video playsInline autoPlay ref={ref} className="w-full h-full object-cover rounded-lg bg-gray-900" />;
};

export const VoiceChatPanel = ({ workspaceId, user, mode = "video" }: { workspaceId: string; user: any; mode?: "video" | "audio" }) => {
    const { getToken } = useAuth();
    const [token, setToken] = useState<string | null>(null);

    useEffect(() => {
        getToken().then(setToken);
    }, [getToken]);

    const { peers, localStream, toggleMute, toggleVideo, leaveCall, isMuted, isVideoOff } = useWebRTC(workspaceId, user, token, mode === "audio");
    const localVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    if (!localStream) return <div className="p-4 text-white">Connecting to voice...</div>;

    return (
        <div className="flex flex-col h-full bg-gray-950 p-2 overflow-hidden">
            <h3 className="text-xs font-semibold text-gray-400 mb-2 px-1">Voice Connected</h3>

            <div className="grid grid-cols-2 gap-2 overflow-y-auto flex-1 min-h-0 bg-black/20 rounded-lg p-2 mb-2">
                {/* Local User */}
                <div className="relative aspect-video bg-gray-900 rounded-md overflow-hidden border border-gray-800 shadow-sm">
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <div className="absolute bottom-1 left-1 text-[10px] bg-black/50 px-1.5 py-0.5 rounded text-white">You</div>
                </div>

                {/* Remote Peers */}
                {peers.map((p, index) => (
                    <div key={index} className="relative aspect-video bg-gray-900 rounded-md overflow-hidden border border-gray-800 shadow-sm">
                        <VideoPlayer peer={p.peer} />
                        <div className="absolute bottom-1 left-1 text-[10px] bg-black/50 px-1.5 py-0.5 rounded text-white">User {p.peerID.slice(0, 4)}</div>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="w-full py-2 bg-gray-950 flex justify-center gap-3">
                <button
                    onClick={toggleMute}
                    className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button
                    onClick={toggleVideo}
                    className={`p-3 rounded-full transition-colors ${isVideoOff ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                >
                    {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                </button>
                <button
                    onClick={leaveCall}
                    className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors shadow-lg shadow-red-900/20"
                >
                    <PhoneOff size={20} />
                </button>
            </div>
        </div>
    );
};
