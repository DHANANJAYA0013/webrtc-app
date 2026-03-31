const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// roomId -> Set(socketIds)
const rooms = new Map();

function removeSocketFromRoom(socket, roomId) {
  if (!roomId) return;

  const set = rooms.get(roomId);
  if (!set) return;

  set.delete(socket.id);
  socket.leave(roomId);

  socket.to(roomId).emit("peer-left", {
    peerId: socket.id,
  });

  if (set.size === 0) {
    rooms.delete(roomId);
  }

  socket.data.roomId = undefined;
}

app.get("/", (req, res) => {
  res.send("WebRTC Signaling Server Running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // =========================
  // JOIN ROOM
  // =========================

  socket.on("join-room", ({ roomId }) => {
    if (!roomId) return;

    console.log(`Join request ${socket.id} -> ${roomId}`);

    // leave old rooms
    socket.rooms.forEach((room) => {
      if (room !== socket.id) {
        removeSocketFromRoom(socket, room);
      }
    });

    // join new room
    socket.join(roomId);
    socket.data.roomId = roomId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    rooms.get(roomId).add(socket.id);

    const peers = [...rooms.get(roomId)].filter(
      (id) => id !== socket.id
    );

    // send existing peers to new user
    socket.emit("room-peers", { peers });

    // notify others
    socket.to(roomId).emit("peer-joined", {
      peerId: socket.id,
    });

    console.log(
      `Room ${roomId} -> ${rooms.get(roomId).size} users`
    );
  });

  socket.on("leave-room", () => {
    const roomId = socket.data.roomId;
    removeSocketFromRoom(socket, roomId);
  });

  // =========================
  // OFFER
  // =========================

  socket.on("offer", ({ to, offer }) => {
    io.to(to).emit("offer", {
      from: socket.id,
      offer,
    });
  });

  // =========================
  // ANSWER
  // =========================

  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", {
      from: socket.id,
      answer,
    });
  });

  // =========================
  // ICE
  // =========================

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", {
      from: socket.id,
      candidate,
    });
  });

  socket.on("chat-message", ({ roomId, message }) => {
    if (!roomId || !message) return;

    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: String(message.text || "").trim(),
      senderId: socket.id,
      senderName: message.senderName || `Peer ${socket.id.slice(0, 6)}`,
      createdAt: message.createdAt || Date.now(),
    };

    if (!payload.text) return;

    io.to(roomId).emit("chat-message", payload);
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

  // =========================
  // DISCONNECT
  // =========================

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);

    const roomId = socket.data.roomId;
    removeSocketFromRoom(socket, roomId);
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});