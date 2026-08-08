# BRAWL ROYALE — Multiplayer Battle Royale Shooter

A browser-based 2D top-down battle royale shooter with real-time multiplayer,
built with HTML5 Canvas, Socket.io, Node.js, Vite, Redis, and MongoDB.

---

## 🗂 Project Structure

```
GAME 2D/
├── client/          ← Vite SPA (deploy to Vercel)
│   ├── src/
│   │   ├── engine/       ← Renderer, Camera, InputHandler, AssetLoader
│   │   ├── network/      ← NetworkClient, Prediction, Reconciliation, Interpolation
│   │   ├── entities/     ← LocalPlayer, RemotePlayer, Projectile, Loot
│   │   ├── ui/           ← HUD, Minimap, Inventory, Lobby, DeathScreen, Leaderboard
│   │   ├── audio/        ← AudioManager (Howler.js)
│   │   ├── map/          ← MapLoader, TileRenderer
│   │   ├── Game.js       ← Main game loop
│   │   └── main.js       ← Entry point
│   ├── assets/
│   │   ├── maps/         ← Tiled JSON maps
│   │   └── sounds/       ← Audio files
│   └── index.html
├── server/          ← Node.js server (deploy to Render)
│   ├── game/
│   │   ├── entities/     ← Player, Projectile, Loot
│   │   ├── systems/      ← Physics, Combat, Storm, Loot, Matchmaking
│   │   ├── weapons/      ← WeaponDefinitions
│   │   ├── World.js      ← Map + tile collision
│   │   └── Room.js       ← Match lifecycle
│   ├── networking/       ← SocketManager, StateSerializer
│   ├── rooms/            ← RoomManager
│   ├── db/               ← MongoDB models + queries
│   ├── redis/            ← Pub/Sub scaling
│   ├── config/           ← Regions
│   └── index.js          ← Entry point
└── shared/          ← Shared constants + protocol
    ├── constants.js
    ├── protocol.js
    └── gameConfig.js
```

---

## 🚀 Quick Start (Local Dev)

### Prerequisites
- Node.js 20+
- npm 10+

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
# Server
cp server/.env.example server/.env
# Edit server/.env — add MONGODB_URI and REDIS_URL if you have them
# Both are optional for local dev

# Client
cp client/.env.example client/.env
```

### 3. Run both client and server
```bash
npm run dev
```

This runs:
- **Server** on `http://localhost:3001`
- **Client** on `http://localhost:5173`

Open `http://localhost:5173` in your browser!

---

## 🎮 Game Controls

| Action | Key |
|--------|-----|
| Move | WASD / Arrow Keys |
| Aim | Mouse |
| Fire | Left Mouse Button |
| Reload | R |
| Sprint | Shift |
| Crouch | Ctrl / C |
| Interact / Pickup | E |
| Heal | H |
| Switch weapon slot | 1 / 2 / 3 |
| Zoom | Mouse Wheel |

---

## ⚙️ Architecture

### Server (Node.js — Render)
- **20Hz authoritative game loop** — physics, combat, storm
- **Socket.io** for real-time WebSocket communication
- **Input queue** — processes player inputs each tick
- **Delta compression** — only sends changed state each tick
- **ELO matchmaking** — skill-based with expanding ELO range

### Client (Vite — Vercel)
- **Client-side prediction** — inputs applied immediately at 60Hz
- **Server reconciliation** — snaps to server state, re-applies unacked inputs
- **Entity interpolation** — remote players rendered with 100ms delay buffer
- **HTML5 Canvas 2D** — layered rendering with camera transforms

### Networking Protocol
- All events defined in `shared/protocol.js`
- Input bit-packing via `INPUT_FLAGS` bit mask
- Sequence numbers on all inputs for ordered reconciliation

---

## 🌩 Storm System

| Phase | Radius | Wait | Shrink | Damage/s |
|-------|--------|------|--------|----------|
| 0 | 100% | — | — | 0 |
| 1 | 80% | 60s | 30s | 5 |
| 2 | 60% | 60s | 30s | 10 |
| 3 | 40% | 45s | 30s | 15 |
| 4 | 20% | 45s | 30s | 20 |
| 5 | 5% | 30s | 30s | 25 |
| 6 | 0% | 20s | 20s | 40 |

---

## 🔫 Weapons

| Tier | Weapons |
|------|---------|
| Common (gray) | Pistol, Shotgun, Fists |
| Uncommon (green) | SMG |
| Rare (blue) | Assault Rifle, DMR |
| Epic (purple) | Sniper, LMG |
| Legendary (orange) | Legendary AR, RPG |

---

## 🚢 Deployment

### Client → Vercel
```bash
cd client
# Set VITE_SERVER_URL to your Render server URL
vercel --prod
```

### Server → Render
1. Push code to GitHub
2. Create new **Web Service** on Render
3. Use `render.yaml` for automatic config
4. Set env vars: `MONGODB_URI`, `REDIS_URL`, `CLIENT_ORIGIN`

### Database → MongoDB Atlas
1. Create free M0 cluster at mongodb.com/atlas
2. Create `battle_royale` database
3. Copy connection string to `MONGODB_URI`

### Cache → Redis (Upstash)
1. Create free Redis instance at upstash.com
2. Copy connection URL to `REDIS_URL`

---

## 🛠 Dependencies

### Server
- `socket.io` — WebSocket server
- `express` — HTTP server
- `mongoose` — MongoDB ORM
- `ioredis` — Redis client
- `uuid` — Entity IDs
- `dotenv` — Environment config

### Client
- `socket.io-client` — WebSocket client
- `howler` — Web audio
- `vite` — Build tool + dev server

---

## 📈 Scaling

The server uses Redis Pub/Sub for horizontal scaling across multiple instances:
- Each match is pinned to one server instance
- Player presence tracked in Redis (`player:{id}:instance`)
- Matchmaking can be distributed across instances via Pub/Sub channels

---

## 📝 License

MIT — build something great!
