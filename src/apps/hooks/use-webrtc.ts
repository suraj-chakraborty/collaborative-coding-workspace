import { useEffect, useRef, useState, useCallback } from "react";
import Peer from "simple-peer";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";

interface PeerUser {
    peerID: string;
    peer: Peer.Instance;
    name: string;
    image?: string;
}

export const useWebRTC = (workspaceId: string, user: any, token: string | null, audioOnly: boolean = false) => {
    const [peers, setPeers] = useState<PeerUser[]>([]);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const peersRef = useRef<PeerUser[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(audioOnly);

    useEffect(() => {
        if (!token) return;

        let stream: MediaStream | null = null;

        socketRef.current = io(process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001", {
            auth: { token }
        });

        navigator.mediaDevices
            .getUserMedia({ video: !audioOnly, audio: true })
            .then((s) => {
                stream = s;
                setLocalStream(s);

                socketRef.current?.emit("join-voice-room", workspaceId, audioOnly ? "audio" : "video");

                socketRef.current?.on("all-users", (users: { id: string, name: string, image?: string }[]) => {
                    const peers: PeerUser[] = [];
                    users.forEach((u) => {
                        const peer = createPeer(u.id, socketRef.current!.id, s);
                        const newUser = { peerID: u.id, peer, name: u.name, image: u.image };
                        peersRef.current.push(newUser);
                        peers.push(newUser);
                    });
                    setPeers(peers);
                });

                socketRef.current?.on("user-joined", (payload: { signal: any; callerID: string; name: string; image?: string }) => {
                    const peer = addPeer(payload.signal, payload.callerID, s);
                    const newUser = { peerID: payload.callerID, peer, name: payload.name, image: payload.image };
                    peersRef.current.push(newUser);
                    setPeers((users) => [...users, newUser]);
                });

                socketRef.current?.on("receiving-returned-signal", (payload: { signal: any; id: string }) => {
                    const item = peersRef.current.find((p) => p.peerID === payload.id);
                    item?.peer.signal(payload.signal);
                });

                socketRef.current?.on("user-left", (peerID: string) => {
                    const peerObj = peersRef.current.find(p => p.peerID === peerID);
                    if (peerObj) peerObj.peer.destroy();
                    const filteredPeers = peersRef.current.filter(p => p.peerID !== peerID);
                    peersRef.current = filteredPeers;
                    setPeers(filteredPeers);
                });

                socketRef.current?.on("call-ended", ({ reason }: { reason: string }) => {
                    toast.info(`Call ended: ${reason === "initiator-left" ? "Initiator left" : "Finished"}`);
                    leaveCall();
                });
            })
            .catch((err) => {
                console.error("Failed to get local stream", err);
                toast.error("Microphone/Camera access denied or failed.");
            });

        return () => {
            stream?.getTracks().forEach(track => track.stop());
            socketRef.current?.emit("leave-voice-room", workspaceId);
            socketRef.current?.disconnect();
            peersRef.current.forEach(p => p.peer.destroy());
            peersRef.current = [];
        };
    }, [workspaceId, token, audioOnly, user]);

    function createPeer(userToSignal: string, callerID: string, stream: MediaStream) {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on("signal", (signal) => {
            socketRef.current?.emit("sending-signal", {
                userToSignal,
                callerID,
                signal,
                name: user.fullName || user.name || "Unknown",
                image: user.imageUrl || user.image
            });
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
        socketRef.current?.emit("leave-voice-room", workspaceId);
        localStream?.getTracks().forEach(track => track.stop());
        socketRef.current?.disconnect();
        setPeers([]);
        setLocalStream(null);
    }, [localStream, workspaceId]);

    return {
        peers,
        localStream,
        toggleMute,
        toggleVideo,
        leaveCall,
        isMuted,
        isVideoOff
    };
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
