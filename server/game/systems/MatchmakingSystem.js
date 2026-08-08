// ============================================================
// MATCHMAKING SYSTEM — ELO-based queue + team formation
// ============================================================
import { ELO_DEFAULT, ELO_MATCH_RANGE_INITIAL, ELO_MATCH_RANGE_EXPAND_MS,
         ELO_MATCH_RANGE_STEP, GAME_MODES } from 'battle-royale-shared';

export class MatchmakingSystem {
  constructor(roomManager) {
    this.roomManager = roomManager;
    // queue: Map<mode, Array<{ socketId, playerId, name, elo, teamId, joinedAt, region }>>
    this.queues = {
      SOLO: [],
      DUO: [],
      SQUAD: [],
    };
    this.tickInterval = setInterval(() => this.tick(), 2000); // check every 2s
  }

  enqueue(player, mode = 'SOLO', region = 'us-east') {
    const queue = this.queues[mode];
    if (!queue) return false;

    // Remove if already queued
    this.dequeue(player.socketId);

    queue.push({
      socketId: player.socketId,
      playerId: player.playerId,
      name: player.name,
      elo: player.elo || ELO_DEFAULT,
      region,
      mode,
      joinedAt: Date.now(),
    });

    return true;
  }

  dequeue(socketId) {
    for (const mode of Object.keys(this.queues)) {
      const q = this.queues[mode];
      const idx = q.findIndex(p => p.socketId === socketId);
      if (idx !== -1) { q.splice(idx, 1); return true; }
    }
    return false;
  }

  tick() {
    for (const mode of Object.keys(this.queues)) {
      this.tryMatch(mode);
    }
  }

  tryMatch(mode) {
    const queue = this.queues[mode];
    const modeConfig = GAME_MODES[mode];
    if (!queue || !modeConfig) return;

    if (queue.length < 1) return;

    const now = Date.now();

    // Sort by ELO
    queue.sort((a, b) => a.elo - b.elo);

    // Try to form teams
    const matched = [];
    const toRemove = new Set();

    for (let i = 0; i < queue.length; i++) {
      if (toRemove.has(i)) continue;
      const anchor = queue[i];
      const waitTime = now - anchor.joinedAt;
      const expandedRange = ELO_MATCH_RANGE_INITIAL +
        Math.floor(waitTime / ELO_MATCH_RANGE_EXPAND_MS) * ELO_MATCH_RANGE_STEP;

      const team = [anchor];
      for (let j = i + 1; j < queue.length && team.length < modeConfig.teamSize; j++) {
        if (toRemove.has(j)) continue;
        const candidate = queue[j];
        if (Math.abs(candidate.elo - anchor.elo) <= expandedRange &&
            candidate.region === anchor.region) {
          team.push(candidate);
          toRemove.add(j);
        }
      }

      // Only add complete teams
      if (team.length === modeConfig.teamSize || mode === 'SOLO') {
        matched.push(...team);
        toRemove.add(i);
      }

      if (matched.length >= modeConfig.maxPlayers) break;
    }

    if (matched.length < 1) return;

    // Remove matched players from queue
    this.queues[mode] = queue.filter((_, i) => !toRemove.has(i));

    // Create room and start match
    this.roomManager.createMatchFromMatchmaking(matched, mode);
  }

  getQueueStatus(mode) {
    return {
      mode,
      players: this.queues[mode]?.length || 0,
      estimatedWait: this.estimateWait(mode),
    };
  }

  estimateWait(mode) {
    const modeConfig = GAME_MODES[mode];
    const inQueue = this.queues[mode]?.length || 0;
    if (inQueue >= (modeConfig?.minToStart || 2)) return 5;
    return 30; // rough estimate in seconds
  }

  destroy() {
    clearInterval(this.tickInterval);
  }
}
