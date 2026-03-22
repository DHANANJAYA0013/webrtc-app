import { useEffect, useRef, useCallback, useState } from "react";
import { io } from "socket.io-client";

const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const SERVER_URL =
  import.meta.env.VITE_SIGNALING_SERVER || "http://localhost:4000";

export function useWebRTC() {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]); // [{peerId, stream}]
  const [isInCall, setIsInCall] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");
  const [peers, setPeers] = useState([]); // connected peer ids

  const socketRef = useRef(null);
  const peerConnectionsRef = useRef({}); // peerId -> RTCPeerConnection
  const localStreamRef = useRef(null);

  // ── Socket Init ────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => console.log("[socket] connected", socket.id));
    socket.on("disconnect", () => console.log("[socket] disconnected"));

    // Existing peers when we join
    socket.on("room-peers", ({ peers }) => {
      console.log("[room] existing peers:", peers);
      peers.forEach((peerId) => createPeerConnection(peerId, true));
    });

    // New peer joined after us
    socket.on("peer-joined", ({ peerId }) => {
      console.log("[room] new peer:", peerId);
      createPeerConnection(peerId, false);
    });

    // Receive offer
    socket.on("offer", async ({ from, offer }) => {
      console.log("[signal] offer from", from);
      let pc = peerConnectionsRef.current[from];
      if (!pc) pc = createPeerConnection(from, false);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { to: from, answer });
    });

    // Receive answer
    socket.on("answer", async ({ from, answer }) => {
      console.log("[signal] answer from", from);
      const pc = peerConnectionsRef.current[from];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    // Receive ICE candidate
    socket.on("ice-candidate", async ({ from, candidate }) => {
      const pc = peerConnectionsRef.current[from];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("[ice] error adding candidate", e);
        }
      }
    });

    // Peer left
    socket.on("peer-left", ({ peerId }) => {
      console.log("[room] peer left:", peerId);
      closePeerConnection(peerId);
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Create RTCPeerConnection ───────────────────────────────────────────────
  const createPeerConnection = useCallback((peerId, shouldOffer) => {
    if (peerConnectionsRef.current[peerId]) {
      return peerConnectionsRef.current[peerId];
    }

    const pc = new RTCPeerConnection(STUN_SERVERS);
    peerConnectionsRef.current[peerId] = pc;

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("ice-candidate", {
          to: peerId,
          candidate: event.candidate,
        });
      }
    };

    // Remote stream
    pc.ontrack = (event) => {
      console.log("[pc] track received from", peerId);
      const [remoteStream] = event.streams;
      setRemoteStreams((prev) => {
        const exists = prev.find((r) => r.peerId === peerId);
        if (exists) {
          return prev.map((r) =>
            r.peerId === peerId ? { peerId, stream: remoteStream } : r
          );
        }
        return [...prev, { peerId, stream: remoteStream }];
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`[pc:${peerId}] state:`, pc.connectionState);
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        closePeerConnection(peerId);
      }
    };

    setPeers((p) => [...new Set([...p, peerId])]);

    // Initiate offer if we are the newcomer
    if (shouldOffer) {
      (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit("offer", { to: peerId, offer });
      })();
    }

    return pc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Close peer connection ──────────────────────────────────────────────────
  const closePeerConnection = useCallback((peerId) => {
    const pc = peerConnectionsRef.current[peerId];
    if (pc) {
      pc.close();
      delete peerConnectionsRef.current[peerId];
    }
    setRemoteStreams((prev) => prev.filter((r) => r.peerId !== peerId));
    setPeers((prev) => prev.filter((id) => id !== peerId));
  }, []);

  // ── Start call ─────────────────────────────────────────────────────────────
  const startCall = useCallback(
    async (room) => {
      setError("");
      if (!room.trim()) {
        setError("Please enter a room ID.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setRoomId(room.trim());
        setIsInCall(true);
        socketRef.current?.emit("join-room", { roomId: room.trim() });
      } catch (err) {
        setError("Could not access camera/microphone: " + err.message);
      }
    },
    []
  );

  // ── Leave call ─────────────────────────────────────────────────────────────
  const leaveCall = useCallback(() => {
    // Stop local tracks
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    // Close all peer connections
    Object.keys(peerConnectionsRef.current).forEach(closePeerConnection);

    setRemoteStreams([]);
    setPeers([]);
    setIsInCall(false);
    setRoomId("");
  }, [closePeerConnection]);

  return {
    localStream,
    remoteStreams,
    isInCall,
    roomId,
    error,
    peers,
    startCall,
    leaveCall,
  };
}
