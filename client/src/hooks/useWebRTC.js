import { useEffect, useRef, useCallback, useState } from "react";
import { io } from "socket.io-client";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },

    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

// ✅ IMPORTANT — your render server
const SERVER_URL =
  import.meta.env.VITE_SIGNALING_SERVER ||
  "https://webrtc-app-pinq.onrender.com";

export function useWebRTC() {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isInCall, setIsInCall] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");

  const socketRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);

  // ================= SOCKET =================

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () =>
      console.log("socket connected", socket.id)
    );

    socket.on("room-peers", ({ peers }) => {
      peers.forEach((peerId) => {
        createPeer(peerId, true);
      });
    });

    socket.on("peer-joined", ({ peerId }) => {
      createPeer(peerId, false);
    });

    socket.on("offer", async ({ from, offer }) => {
      let pc = peerConnectionsRef.current[from];

      if (!pc) pc = createPeer(from, false);

      await pc.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer", {
        to: from,
        answer,
      });
    });

    socket.on("answer", async ({ from, answer }) => {
      const pc = peerConnectionsRef.current[from];
      if (!pc) return;

      await pc.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });

    socket.on("ice-candidate", async ({ from, candidate }) => {
      const pc = peerConnectionsRef.current[from];
      if (!pc) return;

      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (e) {
        console.log("ICE error", e);
      }
    });

    socket.on("peer-left", ({ peerId }) => {
      closePeer(peerId);
    });

    return () => socket.disconnect();
  }, []);

  // ================= PEER =================

  const createPeer = useCallback((peerId, shouldOffer) => {
    if (peerConnectionsRef.current[peerId]) {
      return peerConnectionsRef.current[peerId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    peerConnectionsRef.current[peerId] = pc;

    // add local tracks
    if (localStreamRef.current) {
      localStreamRef.current
        .getTracks()
        .forEach((track) =>
          pc.addTrack(track, localStreamRef.current)
        );
    }

    // send ice
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current.emit("ice-candidate", {
          to: peerId,
          candidate: e.candidate,
        });
      }
    };

    // receive stream
    pc.ontrack = (e) => {
      const stream = e.streams[0];

      setRemoteStreams((prev) => {
        const exist = prev.find(
          (p) => p.peerId === peerId
        );

        if (exist) {
          return prev.map((p) =>
            p.peerId === peerId
              ? { peerId, stream }
              : p
          );
        }

        return [...prev, { peerId, stream }];
      });
    };

    if (shouldOffer) {
      (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socketRef.current.emit("offer", {
          to: peerId,
          offer,
        });
      })();
    }

    return pc;
  }, []);

  const closePeer = useCallback((peerId) => {
    const pc = peerConnectionsRef.current[peerId];

    if (pc) {
      pc.close();
      delete peerConnectionsRef.current[peerId];
    }

    setRemoteStreams((prev) =>
      prev.filter((p) => p.peerId !== peerId)
    );
  }, []);

  // ================= START =================

  const startCall = useCallback(async (room) => {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setRoomId(room);
      setIsInCall(true);

      socketRef.current.emit("join-room", {
        roomId: room,
      });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // ================= LEAVE =================

  const leaveCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) =>
      t.stop()
    );

    Object.keys(
      peerConnectionsRef.current
    ).forEach(closePeer);

    setRemoteStreams([]);
    setLocalStream(null);
    setIsInCall(false);
    setRoomId("");
  }, []);

  return {
    localStream,
    remoteStreams,
    isInCall,
    roomId,
    error,
    startCall,
    leaveCall,
  };
}