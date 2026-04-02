import { useEffect, useRef, useCallback, useState } from "react";
import { io } from "socket.io-client";

const ICE_SERVERS = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:openrelay.metered.ca:80",
      ],
    },

    {
      urls: [
        "turn:openrelay.metered.ca:80?transport=udp",
        "turn:openrelay.metered.ca:80?transport=tcp",
        "turn:openrelay.metered.ca:443?transport=tcp",
        "turns:openrelay.metered.ca:443?transport=tcp",
      ],
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
  const [chatMessages, setChatMessages] = useState([]);
  const [mediaStateByPeer, setMediaStateByPeer] = useState({});
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [selfId, setSelfId] = useState("");
  const [selfName, setSelfName] = useState("");
  const [peerNames, setPeerNames] = useState({});

  const socketRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const cameraVideoTrackRef = useRef(null);
  const activeVideoTrackRef = useRef(null);
  const screenVideoTrackRef = useRef(null);

  // ================= SOCKET =================

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("socket connected", socket.id);
      setSelfId(socket.id);
    });

    socket.on("room-peers", ({ peers }) => {
      peers.forEach((peer) => {
        const peerId = typeof peer === "string" ? peer : peer.peerId;
        const name = typeof peer === "string" ? "" : peer.name || "";
        if (!peerId) return;

        if (name) {
          setPeerNames((prev) => ({
            ...prev,
            [peerId]: name,
          }));
        }

        createPeer(peerId, true);
      });
    });

    socket.on("peer-joined", ({ peerId, name }) => {
      if (name) {
        setPeerNames((prev) => ({
          ...prev,
          [peerId]: name,
        }));
      }

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
      setPeerNames((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      setMediaStateByPeer((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    });

    socket.on("chat-message", (message) => {
      setChatMessages((prev) => [...prev, message]);
    });

    socket.on("chat-history", ({ messages }) => {
      if (Array.isArray(messages)) {
        setChatMessages(messages);
      }
    });

    socket.on("media-state", ({ from, state }) => {
      setMediaStateByPeer((prev) => ({
        ...prev,
        [from]: {
          videoEnabled: state.videoEnabled,
          audioEnabled: state.audioEnabled,
          isScreenSharing: state.isScreenSharing,
        },
      }));
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

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        try {
          pc.restartIce();
        } catch (err) {
          console.log("ICE restart failed", err);
        }
      }
    };

    // receive stream
    pc.ontrack = (e) => {
      const incomingStream = e.streams?.[0] || null;

      setRemoteStreams((prev) => {
        const exist = prev.find(
          (p) => p.peerId === peerId
        );

        // Some mobile browsers dispatch ontrack without e.streams populated.
        // Build/merge a stream from individual tracks to keep remote video visible.
        if (!incomingStream && e.track) {
          if (exist) {
            const existingStream = exist.stream;
            const hasTrack = existingStream
              .getTracks()
              .some((track) => track.id === e.track.id);

            if (!hasTrack) {
              existingStream.addTrack(e.track);
            }

            return prev.map((p) =>
              p.peerId === peerId
                ? { ...p, stream: existingStream }
                : p
            );
          }

          return [
            ...prev,
            { peerId, stream: new MediaStream([e.track]) },
          ];
        }

        if (exist) {
          return prev.map((p) =>
            p.peerId === peerId
              ? { peerId, stream: incomingStream }
              : p
          );
        }

        return [...prev, { peerId, stream: incomingStream }];
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

  const replaceVideoTrack = useCallback((nextTrack) => {
    Object.values(peerConnectionsRef.current).forEach((pc) => {
      const sender = pc
        .getSenders()
        .find((s) => s.track && s.track.kind === "video");

      if (sender) {
        sender.replaceTrack(nextTrack);
      }
    });

    const audioTracks = localStreamRef.current?.getAudioTracks?.() || [];
    const currentAudioTrack = audioTracks[0] || null;

    const updatedTracks = [nextTrack].filter(Boolean);
    if (currentAudioTrack) {
      updatedTracks.push(currentAudioTrack);
    }

    const updatedStream = new MediaStream(updatedTracks);
    localStreamRef.current = updatedStream;
    setLocalStream(updatedStream);
    activeVideoTrackRef.current = nextTrack;
  }, []);

  const emitLocalMediaState = useCallback(
    (nextState) => {
      const currentRoom = roomId || "";
      if (!socketRef.current || !currentRoom) return;

      socketRef.current.emit("media-state", {
        roomId: currentRoom,
        state: nextState,
      });
    },
    [roomId]
  );

  // ================= START =================

  const startCall = useCallback(async (room, userName) => {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

      localStreamRef.current = stream;
      cameraVideoTrackRef.current = stream.getVideoTracks()[0] || null;
      activeVideoTrackRef.current = cameraVideoTrackRef.current;
      screenVideoTrackRef.current = null;
      setLocalStream(stream);
      setRoomId(room);
      setSelfName(userName);
      setIsInCall(true);
      setChatMessages([]);
      setPeerNames({});
      setMediaStateByPeer({});
      setIsVideoEnabled(true);
      setIsAudioEnabled(true);
      setIsScreenSharing(false);

      socketRef.current.emit("join-room", {
        roomId: room,
        name: userName,
      });

      socketRef.current.emit("media-state", {
        roomId: room,
        state: {
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
        },
      });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const sendChatMessage = useCallback(
    (text) => {
      const trimmed = text.trim();
      if (!trimmed || !socketRef.current || !roomId) return;

      socketRef.current.emit("chat-message", {
        roomId,
        message: {
          text: trimmed,
          senderName: selfName || "Guest",
          createdAt: Date.now(),
        },
      });
    },
    [roomId, selfName]
  );

  const toggleVideo = useCallback(() => {
    const next = !isVideoEnabled;
    const activeTrack = activeVideoTrackRef.current;
    if (activeTrack) {
      activeTrack.enabled = next;
    }

    if (cameraVideoTrackRef.current) {
      cameraVideoTrackRef.current.enabled = next;
    }

    setIsVideoEnabled(next);
    emitLocalMediaState({
      videoEnabled: next,
      audioEnabled: isAudioEnabled,
      isScreenSharing,
    });
  }, [emitLocalMediaState, isAudioEnabled, isScreenSharing, isVideoEnabled]);

  const toggleAudio = useCallback(() => {
    const next = !isAudioEnabled;
    const audioTracks = localStreamRef.current?.getAudioTracks?.() || [];
    const audioTrack = audioTracks[0] || null;
    if (audioTrack) {
      audioTrack.enabled = next;
    }

    setIsAudioEnabled(next);
    emitLocalMediaState({
      videoEnabled: isVideoEnabled,
      audioEnabled: next,
      isScreenSharing,
    });
  }, [emitLocalMediaState, isAudioEnabled, isScreenSharing, isVideoEnabled]);

  const stopScreenShare = useCallback(() => {
    if (!isScreenSharing) return;

    const cameraTrack = cameraVideoTrackRef.current;
    if (!cameraTrack) return;

    cameraTrack.enabled = isVideoEnabled;
    replaceVideoTrack(cameraTrack);

    if (screenVideoTrackRef.current) {
      screenVideoTrackRef.current.onended = null;
      screenVideoTrackRef.current.stop();
      screenVideoTrackRef.current = null;
    }

    setIsScreenSharing(false);
    emitLocalMediaState({
      videoEnabled: isVideoEnabled,
      audioEnabled: isAudioEnabled,
      isScreenSharing: false,
    });
  }, [emitLocalMediaState, isAudioEnabled, isScreenSharing, isVideoEnabled, replaceVideoTrack]);

  const startScreenShare = useCallback(async () => {
    if (isScreenSharing) return;

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenTrack.enabled = isVideoEnabled;
      screenTrack.onended = () => {
        stopScreenShare();
      };

      screenVideoTrackRef.current = screenTrack;
      replaceVideoTrack(screenTrack);
      setIsScreenSharing(true);

      emitLocalMediaState({
        videoEnabled: isVideoEnabled,
        audioEnabled: isAudioEnabled,
        isScreenSharing: true,
      });
    } catch (err) {
      console.log("Screen share cancelled or failed", err);
    }
  }, [emitLocalMediaState, isAudioEnabled, isScreenSharing, isVideoEnabled, replaceVideoTrack, stopScreenShare]);

  const toggleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    startScreenShare();
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  // ================= LEAVE =================

  const leaveCall = useCallback(() => {
    socketRef.current?.emit("leave-room");

    if (screenVideoTrackRef.current) {
      screenVideoTrackRef.current.onended = null;
      screenVideoTrackRef.current.stop();
      screenVideoTrackRef.current = null;
    }

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
    setSelfName("");
    setChatMessages([]);
    setPeerNames({});
    setMediaStateByPeer({});
    setIsVideoEnabled(true);
    setIsAudioEnabled(true);
    setIsScreenSharing(false);
    cameraVideoTrackRef.current = null;
    activeVideoTrackRef.current = null;
  }, []);

  return {
    selfId,
    selfName,
    localStream,
    remoteStreams,
    peerNames,
    chatMessages,
    mediaStateByPeer,
    isInCall,
    roomId,
    error,
    isVideoEnabled,
    isAudioEnabled,
    isScreenSharing,
    startCall,
    sendChatMessage,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    leaveCall,
  };
}