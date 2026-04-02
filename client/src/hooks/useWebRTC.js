import { useEffect, useRef, useCallback, useState } from "react";
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";

const SERVER_URL =
  import.meta.env.VITE_SIGNALING_SERVER ||
  (import.meta.env.DEV
    ? "http://localhost:4000"
    : "https://webrtc-app-pinq.onrender.com");

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
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteMediaStreamsRef = useRef({});
  const consumedProducerIdsRef = useRef(new Set());
  const pendingProducersRef = useRef([]);
  const consumersRef = useRef(new Map());
  const producersRef = useRef({ audio: null, video: null });
  const roomIdRef = useRef("");
  const cameraVideoTrackRef = useRef(null);
  const activeVideoTrackRef = useRef(null);
  const screenVideoTrackRef = useRef(null);

  const emitWithAck = useCallback((event, payload = {}) => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket) {
        reject(new Error("Socket not connected"));
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            `Timed out waiting for '${event}' response. Check that client and server run the same SFU version.`
          )
        );
      }, 8000);

      socket.emit(event, payload, (response = {}) => {
        clearTimeout(timeoutId);
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      });
    });
  }, []);

  const ensureRemoteStream = useCallback((peerId) => {
    if (!remoteMediaStreamsRef.current[peerId]) {
      remoteMediaStreamsRef.current[peerId] = new MediaStream();
    }

    const stream = remoteMediaStreamsRef.current[peerId];

    setRemoteStreams((prev) => {
      const exists = prev.some((p) => p.peerId === peerId);
      if (exists) {
        return prev.map((p) =>
          p.peerId === peerId ? { ...p, stream } : p
        );
      }

      return [...prev, { peerId, stream }];
    });

    return stream;
  }, []);

  const removeRemotePeer = useCallback((peerId) => {
    setRemoteStreams((prev) => prev.filter((p) => p.peerId !== peerId));
    delete remoteMediaStreamsRef.current[peerId];
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
  }, []);

  const consumeProducer = useCallback(
    async (producerId, peerIdHint = "") => {
      if (!recvTransportRef.current || !deviceRef.current || !roomIdRef.current) {
        return;
      }

      if (consumedProducerIdsRef.current.has(producerId)) {
        return;
      }

      consumedProducerIdsRef.current.add(producerId);

      try {
        const { params } = await emitWithAck("consume", {
          roomId: roomIdRef.current,
          transportId: recvTransportRef.current.id,
          producerId,
          rtpCapabilities: deviceRef.current.rtpCapabilities,
        });

        const consumer = await recvTransportRef.current.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
          appData: params.appData || {},
        });

        const ownerPeerId = params.appData?.peerId || peerIdHint || "unknown";
        const targetStream = ensureRemoteStream(ownerPeerId);
        const hasTrack = targetStream
          .getTracks()
          .some((track) => track.id === consumer.track.id);

        if (!hasTrack) {
          targetStream.addTrack(consumer.track);
        }

        // Trigger React render when tracks are added to an existing stream object.
        setRemoteStreams((prev) => {
          const exists = prev.some((p) => p.peerId === ownerPeerId);
          if (!exists) {
            return [...prev, { peerId: ownerPeerId, stream: targetStream }];
          }

          return prev.map((p) =>
            p.peerId === ownerPeerId
              ? { ...p, stream: targetStream }
              : p
          );
        });

        consumersRef.current.set(consumer.id, {
          consumer,
          producerId,
          peerId: ownerPeerId,
        });

        consumer.on("transportclose", () => {
          consumersRef.current.delete(consumer.id);
        });

        consumer.on("producerclose", () => {
          consumersRef.current.delete(consumer.id);
          consumedProducerIdsRef.current.delete(producerId);

          const stream = remoteMediaStreamsRef.current[ownerPeerId];
          if (stream) {
            stream.removeTrack(consumer.track);
            if (stream.getTracks().length === 0) {
              removeRemotePeer(ownerPeerId);
            }
          }
        });

        await emitWithAck("resume-consumer", { consumerId: consumer.id });
      } catch (err) {
        consumedProducerIdsRef.current.delete(producerId);
        console.log("consume producer error", err);
        setError(`Failed to receive remote media: ${err.message}`);
      }
    },
    [emitWithAck, ensureRemoteStream, removeRemotePeer]
  );

  const queueOrConsumeProducer = useCallback(
    async ({ producerId, peerId }) => {
      if (!producerId) return;

      const canConsumeNow =
        Boolean(recvTransportRef.current) &&
        Boolean(deviceRef.current) &&
        Boolean(roomIdRef.current);

      if (!canConsumeNow) {
        const alreadyQueued = pendingProducersRef.current.some(
          (item) => item.producerId === producerId
        );

        if (!alreadyQueued) {
          pendingProducersRef.current.push({ producerId, peerId });
        }
        return;
      }

      await consumeProducer(producerId, peerId);
    },
    [consumeProducer]
  );

  const flushPendingProducers = useCallback(async () => {
    if (
      !recvTransportRef.current ||
      !deviceRef.current ||
      !roomIdRef.current ||
      pendingProducersRef.current.length === 0
    ) {
      return;
    }

    const queue = [...pendingProducersRef.current];
    pendingProducersRef.current = [];

    for (const item of queue) {
      await consumeProducer(item.producerId, item.peerId);
    }
  }, [consumeProducer]);

  const createSendTransport = useCallback(
    async (activeRoomId) => {
      const { params } = await emitWithAck("create-webRtc-transport", {
        roomId: activeRoomId,
        direction: "send",
      });

      const transport = deviceRef.current.createSendTransport(params);

      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        emitWithAck("connect-transport", {
          transportId: transport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });

      transport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
        emitWithAck("produce", {
          transportId: transport.id,
          kind,
          rtpParameters,
          appData,
        })
          .then(({ id }) => callback({ id }))
          .catch(errback);
      });

      sendTransportRef.current = transport;
      return transport;
    },
    [emitWithAck]
  );

  const createRecvTransport = useCallback(
    async (activeRoomId) => {
      const { params } = await emitWithAck("create-webRtc-transport", {
        roomId: activeRoomId,
        direction: "recv",
      });

      const transport = deviceRef.current.createRecvTransport(params);

      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        emitWithAck("connect-transport", {
          transportId: transport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });

      recvTransportRef.current = transport;
      return transport;
    },
    [emitWithAck]
  );

  const produceLocalTracks = useCallback(async () => {
    const transport = sendTransportRef.current;
    const stream = localStreamRef.current;
    if (!transport || !stream) return;

    const audioTrack = stream.getAudioTracks()[0] || null;
    const videoTrack = stream.getVideoTracks()[0] || null;

    if (audioTrack && !producersRef.current.audio) {
      producersRef.current.audio = await transport.produce({
        track: audioTrack,
        appData: { source: "microphone" },
      });
    }

    if (videoTrack && !producersRef.current.video) {
      producersRef.current.video = await transport.produce({
        track: videoTrack,
        appData: { source: "camera" },
      });
    }
  }, []);

  const replaceVideoTrack = useCallback(async (nextTrack) => {
    const videoProducer = producersRef.current.video;
    if (videoProducer) {
      await videoProducer.replaceTrack({ track: nextTrack });
    }

    const audioTrack = localStreamRef.current?.getAudioTracks?.()[0] || null;
    const updatedTracks = [nextTrack].filter(Boolean);
    if (audioTrack) updatedTracks.push(audioTrack);

    const updatedStream = new MediaStream(updatedTracks);
    localStreamRef.current = updatedStream;
    setLocalStream(updatedStream);
    activeVideoTrackRef.current = nextTrack;
  }, []);

  const emitLocalMediaState = useCallback(
    (nextState) => {
      const activeRoomId = roomIdRef.current;
      if (!socketRef.current || !activeRoomId) return;

      socketRef.current.emit("media-state", {
        roomId: activeRoomId,
        state: nextState,
      });
    },
    []
  );

  const cleanUpMediaRefs = useCallback(() => {
    consumersRef.current.forEach(({ consumer }) => {
      try {
        consumer.close();
      } catch (err) {
        console.log("consumer close error", err);
      }
    });
    consumersRef.current.clear();

    Object.values(producersRef.current).forEach((producer) => {
      if (!producer) return;
      try {
        producer.close();
      } catch (err) {
        console.log("producer close error", err);
      }
    });
    producersRef.current = { audio: null, video: null };

    if (sendTransportRef.current) {
      try {
        sendTransportRef.current.close();
      } catch (err) {
        console.log("send transport close error", err);
      }
      sendTransportRef.current = null;
    }

    if (recvTransportRef.current) {
      try {
        recvTransportRef.current.close();
      } catch (err) {
        console.log("recv transport close error", err);
      }
      recvTransportRef.current = null;
    }

    consumedProducerIdsRef.current.clear();
    pendingProducersRef.current = [];
    remoteMediaStreamsRef.current = {};
    deviceRef.current = null;
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSelfId(socket.id);
    });

    socket.on("room-peers", ({ peers }) => {
      if (!Array.isArray(peers)) return;

      setPeerNames((prev) => {
        const next = { ...prev };
        peers.forEach((peer) => {
          if (!peer?.peerId) return;
          next[peer.peerId] = peer.name || "Guest";
          ensureRemoteStream(peer.peerId);
        });
        return next;
      });
    });

    socket.on("peer-joined", ({ peerId, name }) => {
      if (!peerId) return;

      setPeerNames((prev) => ({
        ...prev,
        [peerId]: name || "Guest",
      }));
      ensureRemoteStream(peerId);
    });

    socket.on("new-producer", async ({ producerId, peerId }) => {
      await queueOrConsumeProducer({ producerId, peerId });
    });

    socket.on("producer-closed", ({ producerId, peerId }) => {
      if (producerId) {
        consumedProducerIdsRef.current.delete(producerId);
      }

      const stream = peerId ? remoteMediaStreamsRef.current[peerId] : null;
      if (stream && stream.getTracks().length === 0) {
        removeRemotePeer(peerId);
      }
    });

    socket.on("peer-left", ({ peerId }) => {
      if (!peerId) return;
      removeRemotePeer(peerId);
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

    return () => {
      socket.disconnect();
    };
  }, [ensureRemoteStream, queueOrConsumeProducer, removeRemotePeer]);

  const startCall = useCallback(
    async (room, userName) => {
      try {
        setError("");

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
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
        } catch (mediaErr) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
        }

        localStreamRef.current = stream;
        cameraVideoTrackRef.current = stream.getVideoTracks()[0] || null;
        activeVideoTrackRef.current = cameraVideoTrackRef.current;
        screenVideoTrackRef.current = null;

        setLocalStream(stream);
        setRoomId(room);
        roomIdRef.current = room;
        setSelfName(userName);
        setIsInCall(true);
        setChatMessages([]);
        setRemoteStreams([]);
        setPeerNames({});
        setMediaStateByPeer({});
        setIsVideoEnabled(true);
        setIsAudioEnabled(true);
        setIsScreenSharing(false);

        const joinResult = await emitWithAck("join-room", {
          roomId: room,
          name: userName,
        });

        const { rtpCapabilities } = await emitWithAck("get-rtp-capabilities", {
          roomId: room,
        });

        const device = new Device();
        await device.load({ routerRtpCapabilities: rtpCapabilities });
        deviceRef.current = device;

        await createSendTransport(room);
        await createRecvTransport(room);
        await produceLocalTracks();
        await flushPendingProducers();

        const peers = Array.isArray(joinResult.peers) ? joinResult.peers : [];
        if (peers.length > 0) {
          setPeerNames((prev) => {
            const next = { ...prev };
            peers.forEach((peer) => {
              if (!peer?.peerId) return;
              next[peer.peerId] = peer.name || "Guest";
              ensureRemoteStream(peer.peerId);
            });
            return next;
          });
        }

        const existingProducers = Array.isArray(joinResult.existingProducers)
          ? joinResult.existingProducers
          : [];

        for (const producer of existingProducers) {
          await consumeProducer(producer.producerId, producer.peerId);
        }

        await flushPendingProducers();

        emitLocalMediaState({
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
        });
      } catch (err) {
        console.log("startCall error", err);
        setError(
          err.message ||
            "Failed to start call. Verify both users connect to the same SFU signaling server URL."
        );
        setIsInCall(false);
      }
    },
    [
      consumeProducer,
      createRecvTransport,
      createSendTransport,
      emitLocalMediaState,
      emitWithAck,
      ensureRemoteStream,
      flushPendingProducers,
      produceLocalTracks,
    ]
  );

  const sendChatMessage = useCallback(
    (text) => {
      const trimmed = text.trim();
      const activeRoomId = roomIdRef.current;
      if (!trimmed || !socketRef.current || !activeRoomId) return;

      socketRef.current.emit("chat-message", {
        roomId: activeRoomId,
        message: {
          text: trimmed,
          senderName: selfName || "Guest",
          createdAt: Date.now(),
        },
      });
    },
    [selfName]
  );

  const toggleVideo = useCallback(() => {
    const next = !isVideoEnabled;
    const activeTrack = activeVideoTrackRef.current;
    if (activeTrack) activeTrack.enabled = next;
    if (cameraVideoTrackRef.current) cameraVideoTrackRef.current.enabled = next;

    setIsVideoEnabled(next);
    emitLocalMediaState({
      videoEnabled: next,
      audioEnabled: isAudioEnabled,
      isScreenSharing,
    });
  }, [emitLocalMediaState, isAudioEnabled, isScreenSharing, isVideoEnabled]);

  const toggleAudio = useCallback(() => {
    const next = !isAudioEnabled;
    const audioTrack = localStreamRef.current?.getAudioTracks?.()[0] || null;
    if (audioTrack) audioTrack.enabled = next;

    setIsAudioEnabled(next);
    emitLocalMediaState({
      videoEnabled: isVideoEnabled,
      audioEnabled: next,
      isScreenSharing,
    });
  }, [emitLocalMediaState, isAudioEnabled, isScreenSharing, isVideoEnabled]);

  const stopScreenShare = useCallback(async () => {
    if (!isScreenSharing) return;

    const cameraTrack = cameraVideoTrackRef.current;
    if (!cameraTrack) return;

    cameraTrack.enabled = isVideoEnabled;
    await replaceVideoTrack(cameraTrack);

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
      await replaceVideoTrack(screenTrack);
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

  const leaveCall = useCallback(() => {
    socketRef.current?.emit("leave-room");

    if (screenVideoTrackRef.current) {
      screenVideoTrackRef.current.onended = null;
      screenVideoTrackRef.current.stop();
      screenVideoTrackRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    cleanUpMediaRefs();

    localStreamRef.current = null;
    roomIdRef.current = "";
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
  }, [cleanUpMediaRefs]);

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