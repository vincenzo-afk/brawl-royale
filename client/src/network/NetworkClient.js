// ============================================================
// NETWORK CLIENT — Socket.io wrapper with reconnect + ping
// ============================================================
import { io } from 'socket.io-client';
import { C2S, S2C } from 'battle-royale-shared';

const SERVER_URL = typeof __SERVER_URL__ !== 'undefined' ? __SERVER_URL__ : window.location.origin;

export class NetworkClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.latency = 0;
    this.handlers = new Map();  // event → [handler]
    this._pingInterval = null;
    this._pingTimestamp = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 5000,
      });

      this.socket.on('connect', () => {
        this.connected = true;
        console.log('[Network] Connected:', this.socket.id);
        this.startPing();
        resolve(this.socket.id);
      });

      this.socket.on('connect_error', (err) => {
        console.warn('[Network] Connect error:', err.message);
        if (!this.connected) reject(err);
      });

      this.socket.on('disconnect', (reason) => {
        this.connected = false;
        console.warn('[Network] Disconnected:', reason);
        this.stopPing();
        this._emit('disconnect', reason);
      });

      this.socket.on('reconnect', () => {
        this.connected = true;
        this.startPing();
        this._emit('reconnect');
      });

      // Route all S2C events
      for (const event of Object.values(S2C)) {
        this.socket.on(event, (data) => this._emit(event, data));
      }
    });
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  _emit(event, data) {
    const handlers = this.handlers.get(event);
    if (handlers) handlers.forEach(h => h(data));
  }

  // ── Send ───────────────────────────────────────────────────
  send(event, data) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(event, data);
  }

  sendInput(input) {
    this.send(C2S.PLAYER_INPUT, input);
  }

  joinMatchmaking(mode, region, name, elo, skin) {
    this.send(C2S.JOIN_MATCHMAKING, { mode, region, name, elo, skin });
  }

  leaveMatchmaking() {
    this.send(C2S.LEAVE_MATCHMAKING);
  }

  createCustomLobby(mode, name, skin) {
    this.send(C2S.CREATE_CUSTOM_LOBBY, { mode, name, skin });
  }

  joinCustomLobby(code, name, skin) {
    this.send(C2S.JOIN_CUSTOM_LOBBY, { code, name, skin });
  }

  playerReady() {
    this.send(C2S.PLAYER_READY);
  }

  requestLeaderboard() {
    this.send(C2S.REQUEST_LEADERBOARD);
  }

  // ── Ping ───────────────────────────────────────────────────
  startPing() {
    this._pingInterval = setInterval(() => {
      this._pingTimestamp = Date.now();
      this.send(C2S.PING, { timestamp: this._pingTimestamp });
    }, 5000);
  }

  stopPing() {
    clearInterval(this._pingInterval);
  }

  handlePong(data) {
    if (data?.timestamp) {
      this.latency = Math.round((Date.now() - data.timestamp) / 2);
    }
  }

  disconnect() {
    this.stopPing();
    this.socket?.disconnect();
  }
}
