const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mediasoup = require("mediasoup");

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

app.use(express.json());

const server = http.createServer(app);
const MAX_CHAT_HISTORY_PER_ROOM = 200;

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

const isProduction = process.env.NODE_ENV === "production";
const listenIp = process.env.MEDIASOUP_LISTEN_IP || (isProduction ? "0.0.0.0" : "127.0.0.1");
const announcedIp =
  process.env.MEDIASOUP_ANNOUNCED_IP ||
  (listenIp === "0.0.0.0" ? "127.0.0.1" : listenIp);

const mediasoupConfig = {
  worker: {
    rtcMinPort: Number(process.env.MEDIASOUP_MIN_PORT || 40000),
    rtcMaxPort: Number(process.env.MEDIASOUP_MAX_PORT || 49999),
    logLevel: "warn",
    logTags: ["ice", "dtls", "rtp", "srtp", "rtcp"],
  },
  router: {
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: {
          "x-google-start-bitrate": 1000,
        },
      },
      {
        kind: "video",
        mimeType: "video/H264",
        clockRate: 90000,
        parameters: {
          "packetization-mode": 1,
          "profile-level-id": "42e01f",
          "level-asymmetry-allowed": 1,
          "x-google-start-bitrate": 1000,
        },
      },
    ],
  },
  webRtcTransport: {
    listenIps: [
      {
        ip: listenIp,
        announcedIp,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  },
};

let worker;

// roomId -> { router, peers:Set<socketId> }
const rooms = new Map();
// roomId -> message[]
const roomChatHistory = new Map();
// socketId -> peer state
const peers = new Map();

async function createWorker() {
  const nextWorker = await mediasoup.createWorker(mediasoupConfig.worker);
  nextWorker.on("died", () => {
    console.error("mediasoup worker died, exiting in 2 seconds...");
    setTimeout(() => process.exit(1), 2000);
  });
  return nextWorker;
}

async function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (room) return room;

  const router = await worker.createRouter(mediasoupConfig.router);
  room = {
    router,
    peers: new Set(),
  };
  rooms.set(roomId, room);

  if (!roomChatHistory.has(roomId)) {
    roomChatHistory.set(roomId, []);
  }

  return room;
}

async function createWebRtcTransport(router) {
  const transport = await router.createWebRtcTransport(
    mediasoupConfig.webRtcTransport
  );

  await transport.setMaxIncomingBitrate(1500000).catch(() => {});

  return transport;
}

function closePeer(socketId) {
  const peer = peers.get(socketId);
  if (!peer) return;

  peer.consumers.forEach((consumer) => {
    try {
      consumer.close();
    } catch (err) {
      console.log("consumer close error", err.message);
    }
  });

  peer.producers.forEach((producer) => {
    try {
      producer.close();
    } catch (err) {
      console.log("producer close error", err.message);
    }
  });

  peer.transports.forEach((transport) => {
    try {
      transport.close();
    } catch (err) {
      console.log("transport close error", err.message);
    }
  });

  const roomId = peer.roomId;
  const room = roomId ? rooms.get(roomId) : null;

  if (room) {
    room.peers.delete(socketId);
    io.to(roomId).emit("peer-left", { peerId: socketId });

    if (room.peers.size === 0) {
      try {
        room.router.close();
      } catch (err) {
        console.log("router close error", err.message);
      }
      rooms.delete(roomId);
      roomChatHistory.delete(roomId);
    }
  }

  peers.delete(socketId);
}

function getPeer(socketId) {
  return peers.get(socketId);
}

app.get("/", (req, res) => {
  res.send("NexMeet SFU Server Running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  peers.set(socket.id, {
    socketId: socket.id,
    name: "Guest",
    roomId: null,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  });

  socket.on("join-room", async ({ roomId, name }, callback = () => {}) => {
    try {
      if (!roomId) {
        callback({ error: "roomId is required" });
        return;
      }

      const peer = getPeer(socket.id);
      if (!peer) {
        callback({ error: "peer not found" });
        return;
      }

      if (peer.roomId && peer.roomId !== roomId) {
        closePeer(socket.id);
        peers.set(socket.id, {
          socketId: socket.id,
          name: "Guest",
          roomId: null,
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
        });
      }

      const participantName = String(name || "").trim() || "Guest";
      const room = await getOrCreateRoom(roomId);
      const currentPeer = getPeer(socket.id);

      currentPeer.name = participantName;
      currentPeer.roomId = roomId;
      room.peers.add(socket.id);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.name = participantName;

      const peerList = [...room.peers]
        .filter((id) => id !== socket.id)
        .map((id) => {
          const p = getPeer(id);
          return {
            peerId: id,
            name: p?.name || "Guest",
          };
        });

      const existingProducers = [];
      room.peers.forEach((id) => {
        if (id === socket.id) return;
        const otherPeer = getPeer(id);
        if (!otherPeer) return;

        otherPeer.producers.forEach((producer) => {
          existingProducers.push({
            producerId: producer.id,
            peerId: id,
            kind: producer.kind,
          });
        });
      });

      socket.emit("room-peers", { peers: peerList });
      socket.emit("chat-history", {
        roomId,
        messages: roomChatHistory.get(roomId) || [],
      });

      socket.to(roomId).emit("peer-joined", {
        peerId: socket.id,
        name: participantName,
      });

      console.log(
        `[join-room] room=${roomId} socket=${socket.id} peers=${room.peers.size} existingProducers=${existingProducers.length}`
      );

      callback({
        peers: peerList,
        existingProducers,
      });
    } catch (err) {
      console.error("join-room error", err);
      callback({ error: "Failed to join room" });
    }
  });

  socket.on("get-rtp-capabilities", async ({ roomId }, callback = () => {}) => {
    try {
      const room = rooms.get(roomId);
      if (!room) {
        callback({ error: "Room not found" });
        return;
      }

      callback({ rtpCapabilities: room.router.rtpCapabilities });
    } catch (err) {
      console.error("get-rtp-capabilities error", err);
      callback({ error: "Failed to fetch RTP capabilities" });
    }
  });

  socket.on(
    "create-webRtc-transport",
    async ({ roomId, direction }, callback = () => {}) => {
      try {
        const room = rooms.get(roomId);
        const peer = getPeer(socket.id);

        if (!room || !peer) {
          callback({ error: "Room or peer not found" });
          return;
        }

        const transport = await createWebRtcTransport(room.router);
        peer.transports.set(transport.id, transport);

        transport.observer.on("close", () => {
          peer.transports.delete(transport.id);
        });

        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            direction,
          },
        });
      } catch (err) {
        console.error("create-webRtc-transport error", err);
        callback({ error: "Failed to create transport" });
      }
    }
  );

  socket.on(
    "connect-transport",
    async ({ transportId, dtlsParameters }, callback = () => {}) => {
      try {
        const peer = getPeer(socket.id);
        const transport = peer?.transports?.get(transportId);

        if (!transport) {
          callback({ error: "Transport not found" });
          return;
        }

        await transport.connect({ dtlsParameters });
        callback({ connected: true });
      } catch (err) {
        console.error("connect-transport error", err);
        callback({ error: "Failed to connect transport" });
      }
    }
  );

  socket.on(
    "produce",
    async ({ transportId, kind, rtpParameters, appData }, callback = () => {}) => {
      try {
        const peer = getPeer(socket.id);
        const transport = peer?.transports?.get(transportId);

        if (!peer || !transport || !peer.roomId) {
          callback({ error: "Invalid peer/transport/room" });
          return;
        }

        const producer = await transport.produce({
          kind,
          rtpParameters,
          appData: {
            ...appData,
            peerId: socket.id,
          },
        });

        peer.producers.set(producer.id, producer);

        producer.on("transportclose", () => {
          peer.producers.delete(producer.id);
        });

        producer.on("close", () => {
          peer.producers.delete(producer.id);
        });

        socket.to(peer.roomId).emit("new-producer", {
          producerId: producer.id,
          peerId: socket.id,
          kind,
        });

        console.log(
          `[produce] room=${peer.roomId} socket=${socket.id} producer=${producer.id} kind=${kind}`
        );

        callback({ id: producer.id });
      } catch (err) {
        console.error("produce error", err);
        callback({ error: "Failed to produce" });
      }
    }
  );

  socket.on(
    "consume",
    async ({ roomId, transportId, producerId, rtpCapabilities }, callback = () => {}) => {
      try {
        const room = rooms.get(roomId);
        const peer = getPeer(socket.id);
        const transport = peer?.transports?.get(transportId);

        if (!room || !peer || !transport) {
          callback({ error: "Room/peer/transport missing" });
          return;
        }

        const producerOwner = [...room.peers].find((id) => {
          const p = getPeer(id);
          return p?.producers?.has(producerId);
        });

        if (!producerOwner) {
          callback({ error: "Producer not found" });
          return;
        }

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
          callback({ error: "Cannot consume this producer" });
          return;
        }

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true,
          appData: {
            peerId: producerOwner,
          },
        });

        console.log(
          `[consume] room=${roomId} socket=${socket.id} consumer=${consumer.id} producer=${producerId} owner=${producerOwner} kind=${consumer.kind}`
        );

        peer.consumers.set(consumer.id, consumer);

        consumer.on("transportclose", () => {
          peer.consumers.delete(consumer.id);
        });

        consumer.on("producerclose", () => {
          peer.consumers.delete(consumer.id);
          socket.emit("producer-closed", {
            producerId,
            peerId: producerOwner,
          });
        });

        callback({
          params: {
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            appData: consumer.appData,
          },
        });
      } catch (err) {
        console.error("consume error", err);
        callback({ error: "Failed to consume" });
      }
    }
  );

  socket.on("resume-consumer", async ({ consumerId }, callback = () => {}) => {
    try {
      const peer = getPeer(socket.id);
      const consumer = peer?.consumers?.get(consumerId);
      if (!consumer) {
        callback({ error: "Consumer not found" });
        return;
      }

      await consumer.resume();
      console.log(`[resume-consumer] socket=${socket.id} consumer=${consumerId}`);
      callback({ resumed: true });
    } catch (err) {
      console.error("resume-consumer error", err);
      callback({ error: "Failed to resume consumer" });
    }
  });

  socket.on("chat-message", ({ roomId, message }) => {
    const activeRoomId = socket.data.roomId || roomId;
    if (!activeRoomId || !message) return;

    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: String(message.text || "").trim(),
      senderId: socket.id,
      senderName:
        String(message.senderName || "").trim() || socket.data.name || "Guest",
      createdAt: message.createdAt || Date.now(),
    };

    if (!payload.text) return;

    const history = roomChatHistory.get(activeRoomId) || [];
    history.push(payload);
    if (history.length > MAX_CHAT_HISTORY_PER_ROOM) {
      history.splice(0, history.length - MAX_CHAT_HISTORY_PER_ROOM);
    }
    roomChatHistory.set(activeRoomId, history);

    io.to(activeRoomId).emit("chat-message", payload);
  });

  socket.on("media-state", ({ roomId, state }) => {
    if (!roomId || !state) return;

    socket.to(roomId).emit("media-state", {
      from: socket.id,
      state: {
        videoEnabled: Boolean(state.videoEnabled),
        audioEnabled: Boolean(state.audioEnabled),
        isScreenSharing: Boolean(state.isScreenSharing),
      },
    });
  });

  socket.on("leave-room", () => {
    closePeer(socket.id);

    peers.set(socket.id, {
      socketId: socket.id,
      name: socket.data.name || "Guest",
      roomId: null,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    });
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    closePeer(socket.id);
  });
});

const PORT = process.env.PORT || 4000;

async function start() {
  worker = await createWorker();

  if (isProduction && !process.env.MEDIASOUP_ANNOUNCED_IP) {
    console.warn(
      "MEDIASOUP_ANNOUNCED_IP is not set in production. Remote media may fail across devices/networks."
    );
  }

  server.listen(PORT, () => {
    console.log("SFU server running on port", PORT);
    console.log(`mediasoup transport listenIp=${listenIp} announcedIp=${announcedIp}`);
  });
}

start().catch((err) => {
  console.error("Failed to start SFU server", err);
  process.exit(1);
});