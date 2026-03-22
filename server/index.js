const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// roomId -> Set of socketIds
const rooms = new Map();

app.get("/health", (req, res) => res.json({ status: "ok" }));

io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Join Room ──────────────────────────────────────────────────────────────
  socket.on("join-room", ({ roomId }) => {
    if (!roomId) return;

    // Leave any previous room
    socket.rooms.forEach((r) => {
      if (r !== socket.id) {
        socket.leave(r);
        const set = rooms.get(r);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) rooms.delete(r);
        }
      }
    });

    socket.join(roomId);
    socket.data.roomId = roomId;

    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(socket.id);

    // Tell the new peer who else is already in the room
    const peers = [...rooms.get(roomId)].filter((id) => id !== socket.id);
    socket.emit("room-peers", { peers });

    // Tell existing peers about the newcomer
    socket.to(roomId).emit("peer-joined", { peerId: socket.id });

    console.log(`[room:${roomId}] ${socket.id} joined. peers: ${peers.length}`);
  });

  // ── WebRTC Signaling ───────────────────────────────────────────────────────
  socket.on("offer", ({ to, offer }) => {
    io.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms.has(roomId)) {
      rooms.get(roomId).delete(socket.id);
      if (rooms.get(roomId).size === 0) rooms.delete(roomId);
      io.to(roomId).emit("peer-left", { peerId: socket.id });
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Signaling server running on :${PORT}`));
