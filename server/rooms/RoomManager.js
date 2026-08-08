// ============================================================
// ROOM MANAGER — manages all active rooms
// ============================================================
import { v4 as uuidv4 } from 'uuid';
import { Room, ROOM_STATES } from '../game/Room.js';
import { S2C, GAME_MODES } from 'battle-royale-shared';

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();         // roomId → Room
    this.customCodes = new Map();   // code → roomId
    this.playerRooms = new Map();   // socketId → roomId

    // Cleanup dead rooms every 30s
    setInterval(() => this.cleanupRooms(), 30000);
  }

  // Create a match from matchmaking
  createMatchFromMatchmaking(players, mode) {
    const roomId = uuidv4();
    const room = new Room(this.io, roomId, mode);
    this.rooms.set(roomId, room);

    // Notify matched players
    for (const playerData of players) {
      const socket = this.io.sockets.sockets.get(playerData.socketId);
      if (!socket) continue;

      this.playerRooms.set(playerData.socketId, roomId);
      room.addPlayer(socket, playerData);

      socket.emit(S2C.MATCHMAKING_STATUS, {
        status: 'matched',
        roomId,
        countdown: 5,
      });
    }

    // Countdown then start
    room.startCountdown(5);

    return room;
  }

  // Create custom lobby
  createCustomLobby(socket, playerData, mode = 'SOLO') {
    const roomId = uuidv4();
    const code = this.generateCode();
    const room = new Room(this.io, roomId, mode);
    room.customCode = code;
    this.rooms.set(roomId, room);
    this.customCodes.set(code, roomId);

    this.playerRooms.set(socket.id, roomId);
    room.addPlayer(socket, playerData);

    socket.emit(S2C.LOBBY_CREATED, { code, mode, roomId });
    return room;
  }

  // Join custom lobby by code
  joinCustomLobby(socket, playerData, code) {
    const roomId = this.customCodes.get(code.toUpperCase());
    if (!roomId) {
      socket.emit(S2C.ERROR, { code: 'ROOM_NOT_FOUND', message: 'Lobby not found' });
      return null;
    }

    const room = this.rooms.get(roomId);
    if (!room || room.state !== ROOM_STATES.LOBBY) {
      socket.emit(S2C.ERROR, { code: 'ROOM_CLOSED', message: 'Lobby is no longer open' });
      return null;
    }

    if (room.players.size >= room.modeConfig.maxPlayers) {
      socket.emit(S2C.ERROR, { code: 'ROOM_FULL', message: 'Lobby is full' });
      return null;
    }

    this.playerRooms.set(socket.id, roomId);
    room.addPlayer(socket, playerData);
    return room;
  }

  // Player ready in custom lobby (host can start)
  playerReady(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.state !== ROOM_STATES.LOBBY) return;

    if (room.players.size >= (room.modeConfig.minToStart || 2)) {
      room.startCountdown(10);
    }
  }

  // Remove player from their room
  handleDisconnect(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (roomId) {
      const room = this.rooms.get(roomId);
      if (room) room.removePlayer(socketId);
      this.playerRooms.delete(socketId);
    }
  }

  getRoom(roomId) { return this.rooms.get(roomId); }

  getRoomBySocket(socketId) {
    const roomId = this.playerRooms.get(socketId);
    return roomId ? this.rooms.get(roomId) : null;
  }

  cleanupRooms() {
    for (const [roomId, room] of this.rooms) {
      if (room.state === ROOM_STATES.ENDED) {
        if (Date.now() - room.endTime > 60000) { // 1 min after end
          room.destroy();
          if (room.customCode) this.customCodes.delete(room.customCode);
          this.rooms.delete(roomId);
        }
      } else if (room.players.size === 0 && room.state === ROOM_STATES.LOBBY) {
        room.destroy();
        if (room.customCode) this.customCodes.delete(room.customCode);
        this.rooms.delete(roomId);
      }
    }
  }

  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return this.customCodes.has(code) ? this.generateCode() : code;
  }

  getStats() {
    return {
      rooms: this.rooms.size,
      activePlayers: this.playerRooms.size,
    };
  }
}
