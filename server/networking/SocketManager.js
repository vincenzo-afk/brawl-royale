// ============================================================
// SOCKET MANAGER — handles all socket.io events
// ============================================================
import { C2S, S2C } from 'battle-royale-shared';

export class SocketManager {
  constructor(io, roomManager, matchmaking) {
    this.io = io;
    this.roomManager = roomManager;
    this.matchmaking = matchmaking;
    this.setupHandlers();
  }

  setupHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`[Socket] Connected: ${socket.id}`);

      // Send connection ack
      socket.emit(S2C.CONNECTED, {
        playerId: socket.id,
        region: process.env.RENDER_REGION || 'local',
        serverTime: Date.now(),
      });

      // ── Matchmaking ──────────────────────────────────────
      socket.on(C2S.JOIN_MATCHMAKING, (data) => {
        const { mode = 'SOLO', region = 'us-east', name = 'Player', elo = 1000, skin = 0 } = data || {};
        const playerData = { socketId: socket.id, playerId: socket.id, name, elo, skin };

        const ok = this.matchmaking.enqueue(playerData, mode, region);
        if (ok) {
          socket.emit(S2C.MATCHMAKING_STATUS, {
            status: 'queued',
            mode,
            players: this.matchmaking.queues[mode]?.length || 1,
            estimatedWait: this.matchmaking.estimateWait(mode),
          });
        }
      });

      socket.on(C2S.LEAVE_MATCHMAKING, () => {
        this.matchmaking.dequeue(socket.id);
        socket.emit(S2C.MATCHMAKING_STATUS, { status: 'left' });
      });

      // ── Custom Lobby ─────────────────────────────────────
      socket.on(C2S.CREATE_CUSTOM_LOBBY, (data) => {
        const { mode = 'SOLO', name = 'Player', skin = 0 } = data || {};
        this.roomManager.createCustomLobby(socket, { socketId: socket.id, playerId: socket.id, name, skin }, mode);
      });

      socket.on(C2S.JOIN_CUSTOM_LOBBY, (data) => {
        const { code, name = 'Player', skin = 0 } = data || {};
        if (!code) return;
        this.roomManager.joinCustomLobby(socket, { socketId: socket.id, playerId: socket.id, name, skin }, code);
      });

      socket.on(C2S.PLAYER_READY, () => {
        this.roomManager.playerReady(socket.id);
      });

      // ── Gameplay ─────────────────────────────────────────
      socket.on(C2S.PLAYER_INPUT, (input) => {
        const room = this.roomManager.getRoomBySocket(socket.id);
        if (room) room.handleInput(socket.id, input);
      });

      // ── Ping / latency ───────────────────────────────────
      socket.on(C2S.PING, (data) => {
        socket.emit(S2C.PONG, { timestamp: data?.timestamp, serverTime: Date.now() });
      });

      // ── Leaderboard ──────────────────────────────────────
      socket.on(C2S.REQUEST_LEADERBOARD, async () => {
        try {
          const { getLeaderboard } = await import('../db/Leaderboard.js');
          const data = await getLeaderboard(20);
          socket.emit(S2C.LEADERBOARD_DATA, data);
        } catch (e) {
          socket.emit(S2C.LEADERBOARD_DATA, []);
        }
      });

      socket.on(C2S.REQUEST_MATCH_HISTORY, async (data) => {
        try {
          const { getMatchHistory } = await import('../db/Leaderboard.js');
          const history = await getMatchHistory(data?.playerId || socket.id);
          socket.emit(S2C.MATCH_HISTORY_DATA, history);
        } catch (e) {
          socket.emit(S2C.MATCH_HISTORY_DATA, []);
        }
      });

      // ── Disconnect ────────────────────────────────────────
      socket.on('disconnect', (reason) => {
        console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
        this.matchmaking.dequeue(socket.id);
        this.roomManager.handleDisconnect(socket.id);
      });
    });
  }
}
