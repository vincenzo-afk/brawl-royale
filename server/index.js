// ============================================================
// SERVER ENTRY POINT
// ============================================================
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';

import { connectMongo } from './db/mongoose.js';
import { connectRedis } from './redis/PubSub.js';
import { SocketManager } from './networking/SocketManager.js';
import { RoomManager } from './rooms/RoomManager.js';
import { MatchmakingSystem } from './game/systems/MatchmakingSystem.js';
import { REGIONS } from './config/regions.js';

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── Express + HTTP ────────────────────────────────────────
const app = express();
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// Health check (for Render)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    region: process.env.RENDER_REGION || 'local',
  });
});

// Region ping endpoint — clients ping all regions and pick lowest latency
app.get('/ping', (req, res) => {
  res.json({ pong: Date.now(), region: process.env.RENDER_REGION || 'local' });
});

// Simple leaderboard REST (also served via socket, but REST for embedding)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { getLeaderboard } = await import('./db/Leaderboard.js');
    const data = await getLeaderboard(20);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const httpServer = createServer(app);

// ─── Socket.IO ─────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling'],
});

// ─── Core systems ──────────────────────────────────────────
const roomManager = new RoomManager(io);
const matchmaking = new MatchmakingSystem(roomManager);
const socketManager = new SocketManager(io, roomManager, matchmaking);

// ─── Boot ──────────────────────────────────────────────────
async function boot() {
  // Optional DB connections — gracefully skip if not configured
  if (process.env.MONGODB_URI) {
    await connectMongo().catch(err => {
      console.warn('[DB] MongoDB connection failed (non-fatal in dev):', err.message);
    });
  } else {
    console.warn('[DB] MONGODB_URI not set — skipping MongoDB connection');
  }

  if (process.env.REDIS_URL) {
    await connectRedis().catch(err => {
      console.warn('[Redis] Connection failed (non-fatal):', err.message);
    });
  } else {
    console.warn('[Redis] REDIS_URL not set — running in single-instance mode');
  }

  httpServer.listen(PORT, () => {
    console.log(`\n🎮 Battle Royale Server`);
    console.log(`   Port    : ${PORT}`);
    console.log(`   Env     : ${NODE_ENV}`);
    console.log(`   Region  : ${process.env.RENDER_REGION || 'local'}`);
    console.log(`   Regions : ${REGIONS.map(r => r.id).join(', ')}`);
    console.log(`   Ready!\n`);
  });
}

boot().catch(err => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});

export { io, roomManager, matchmaking };
