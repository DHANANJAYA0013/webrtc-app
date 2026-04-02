# NexMeet — Multi-User WebRTC Video Calling App

A production-ready, multi-user video calling application built with:
- **Frontend**: React 18 + Vite + Socket.io-client
- **Backend**: Node.js + Express + Socket.io
- **WebRTC**: mediasoup-client (SFU consumers/producers)
- **SFU**: mediasoup Worker + Router + WebRtcTransport
- **Signaling**: Socket.io events for transport/producer/consumer lifecycle

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

### SFU Signaling Flow (via Socket.io)

```
User joins room
  → server returns router RTP capabilities

Client creates send transport + recv transport
  → client connects transports via DTLS

Client produces local audio/video once
  → SFU router forwards to all subscribed consumers

When a new producer appears
  → peers create consumer for that producer
  → consumer is resumed and media starts
```

### Why SFU
Each participant uploads one outbound stream to the SFU, and receives forwarded streams from other participants. This avoids mesh growth ($N*(N-1)/2$ connections) and scales far better for medium/large rooms.

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
| `PORT` (server) | `4000` | SFU server port |
| `MEDIASOUP_LISTEN_IP` (server) | `0.0.0.0` | Bind IP for mediasoup WebRTC transports |
| `MEDIASOUP_ANNOUNCED_IP` (server) | *(unset)* | Public IP/domain announced to clients (required on cloud/NAT) |
| `MEDIASOUP_MIN_PORT` (server) | `40000` | Lowest UDP/TCP port for mediasoup RTP |
| `MEDIASOUP_MAX_PORT` (server) | `49999` | Highest UDP/TCP port for mediasoup RTP |
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

NexMeet now uses a mediasoup SFU baseline. For production 10-100 user rooms, ensure:
- Server has enough CPU and outbound bandwidth.
- UDP port range (`MEDIASOUP_MIN_PORT`..`MEDIASOUP_MAX_PORT`) is open in firewall/security groups.
- `MEDIASOUP_ANNOUNCED_IP` is set to a routable public address.

---

## License
MIT
