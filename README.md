# NexMeet — Multi-User WebRTC Video Calling App

A production-ready, multi-user video calling application built with:
- **Frontend**: React 18 + Vite + Socket.io-client
- **Backend**: Node.js + Express + Socket.io
- **WebRTC**: RTCPeerConnection with Google STUN servers
- **Signaling**: Full offer/answer/ICE exchange over Socket.io

---

## Project Structure

```
nexmeet-webrtc/
├── server/
│   ├── index.js          # Express + Socket.io signaling server
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.jsx               # Root component
│   │   ├── App.css               # All styles
│   │   ├── main.jsx              # React entry
│   │   ├── hooks/
│   │   │   └── useWebRTC.js      # Core WebRTC + signaling logic
│   │   └── components/
│   │       ├── Lobby.jsx         # Room ID input screen
│   │       ├── Room.jsx          # Active call layout
│   │       └── VideoTile.jsx     # Single video element
│   ├── index.html
│   ├── vite.config.js
│   ├── .env.example
│   └── package.json
├── render.yaml           # Render.com deployment config
├── .gitignore
└── README.md
```

---

## How It Works

### Signaling Flow (via Socket.io)

```
User A joins room
  → server sends room-peers (empty list)

User B joins same room
  → server sends room-peers [A] to B
  → server sends peer-joined to A

B creates RTCPeerConnection, sends offer → A
A responds with answer → B
Both exchange ICE candidates
Peer-to-peer video stream established ✓
```

### Multi-Peer Mesh
Each new user creates a direct peer connection with **every** existing participant. For N users there are N*(N-1)/2 peer connections (mesh topology). This works well for ≤ 6 users; for larger groups consider an SFU (e.g. mediasoup, LiveKit).

---

## Running Locally

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9
- HTTPS or localhost (WebRTC camera access requires secure context)

### 1. Install Dependencies

```bash
# Backend
cd server && npm install

# Frontend
cd ../client && npm install
```

### 2. Start the Signaling Server

```bash
cd server
npm run dev       # uses nodemon (hot reload)
# or
node index.js     # plain node
```
Server starts on **http://localhost:4000**

### 3. Start the React Dev Server

```bash
cd client
cp .env.example .env.local   # uses localhost:4000 by default
npm run dev
```
App starts on **http://localhost:3000**

### 4. Test Multi-User
Open **two or more browser tabs** (or different browsers/devices on the same network) at `http://localhost:3000`, enter the **same Room ID**, and click **Start Call**.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` (server) | `4000` | Signaling server port |
| `VITE_SIGNALING_SERVER` (client) | `http://localhost:4000` | Signaling server URL |

---

## Deploying to the Cloud

### Option A — Render.com (recommended, one config file)

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Point to the repo — Render reads `render.yaml` automatically
4. After the server deploys, copy its URL and set `VITE_SIGNALING_SERVER` in the client's environment on Render, then redeploy the client

### Option B — Railway

**Server:**
1. New project → Deploy from GitHub → select `server/` root
2. Set `PORT=8080` (Railway auto-assigns)
3. Copy the public URL

**Client:**
1. New service → Static → select `client/` root
2. Build command: `npm run build`
3. Publish dir: `dist`
4. Add env var `VITE_SIGNALING_SERVER=<your railway server URL>`

### Option C — Vercel (frontend) + Render/Railway (backend)

Vercel works great for the static React build:
```bash
cd client
npm run build
# Deploy dist/ to Vercel
```
Set `VITE_SIGNALING_SERVER` in Vercel's environment variables.

> ⚠️ **Important for production**: WebRTC requires a **secure context (HTTPS)**. All cloud providers above give you HTTPS automatically. For LAN testing, `localhost` is also considered secure.

---

## Scaling Beyond 6 Users

For large rooms, replace the mesh topology with a **Selective Forwarding Unit (SFU)**:
- [LiveKit](https://livekit.io) — open source, self-hostable
- [mediasoup](https://mediasoup.org) — low-level, highly customizable
- [Daily.co](https://daily.co) — managed SFU API

---

## License
MIT
