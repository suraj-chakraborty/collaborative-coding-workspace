import { useEffect, useRef, useState, useCallback } from "react";
import Peer from "simple-peer";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";

interface PeerUser {
    peerID: string;
    peer: Peer.Instance;
}

export const useWebRTC = (workspaceId: string, user: any, token: string | null, audioOnly: boolean = false) => {
    const [peers, setPeers] = useState<PeerUser[]>([]);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const peersRef = useRef<{ peerID: string; peer: Peer.Instance }[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(audioOnly);

    useEffect(() => {
        if (!token) return;

        let stream: MediaStream | null = null;

        // Initialize socket with token
        socketRef.current = io(process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001", {
            auth: { token }
        });

        // Get User Media
        navigator.mediaDevices
            .getUserMedia({ video: !audioOnly, audio: true })
            .then((s) => {
                stream = s;
                setLocalStream(s);

                // Join room
                socketRef.current?.emit("join-voice-room", workspaceId);

                // Listen for other users
                socketRef.current?.on("all-users", (users: string[]) => {
                    const peers: PeerUser[] = [];
                    users.forEach((userID) => {
                        const peer = createPeer(userID, socketRef.current!.id, s);
                        peersRef.current.push({ peerID: userID, peer });
                        peers.push({ peerID: userID, peer });
                    });
                    setPeers(peers);
                });

                // Listen for new user joining
                socketRef.current?.on("user-joined", (payload: { signal: any; callerID: string }) => {
                    const peer = addPeer(payload.signal, payload.callerID, s);
                    peersRef.current.push({ peerID: payload.callerID, peer });
                    setPeers((users) => [...users, { peerID: payload.callerID, peer }]);
                });

                // Receive returned signal
                socketRef.current?.on("receiving-returned-signal", (payload: { signal: any; id: string }) => {
                    const item = peersRef.current.find((p) => p.peerID === payload.id);
                    item?.peer.signal(payload.signal);
                });
            })
            .catch((err) => {
                console.error("Failed to get local stream", err);
                toast.error("Microphone/Camera access denied or failed.");
            });

        return () => {
            stream?.getTracks().forEach(track => track.stop());
            socketRef.current?.disconnect();
            peersRef.current.forEach(p => p.peer.destroy());
            peersRef.current = [];
        };
    }, [workspaceId, token, audioOnly]);

    function createPeer(userToSignal: string, callerID: string, stream: MediaStream) {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on("signal", (signal) => {
            socketRef.current?.emit("sending-signal", { userToSignal, callerID, signal });
        });

        return peer;
    }

    function addPeer(incomingSignal: any, callerID: string, stream: MediaStream) {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on("signal", (signal) => {
            socketRef.current?.emit("returning-signal", { signal, callerID });
        });

        peer.signal(incomingSignal);

        return peer;
    }

    const toggleMute = useCallback(() => {
        if (localStream) {
            localStream.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
            setIsMuted(!localStream.getAudioTracks()[0].enabled);
        }
    }, [localStream]);

    const toggleVideo = useCallback(() => {
        if (localStream) {
            localStream.getVideoTracks().forEach((track) => (track.enabled = !track.enabled));
            setIsVideoOff(!localStream.getVideoTracks()[0].enabled);
        }
    }, [localStream]);

    const leaveCall = useCallback(() => {
        localStream?.getTracks().forEach(track => track.stop());
        socketRef.current?.disconnect();
        setPeers([]);
        setLocalStream(null);
    }, [localStream]);

    return {
        peers,
        localStream,
        toggleMute,
        toggleVideo,
        leaveCall,
        isMuted,
        isVideoOff
    };
};
