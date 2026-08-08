// ============================================================
// STATE SERIALIZER — delta compression + bit-packing
// ============================================================

export class StateSerializer {
  constructor() {
    this.prevPlayerStates = new Map(); // playerId → last sent state
  }

  // Full state snapshot
  serializeFull(players, loot, storm, tick) {
    return {
      type: 'full',
      tick,
      players: [...players.values()].map(p => p.toSnapshot()),
      loot: loot.getAllLootSnapshots(),
      storm: storm.toSnapshot(),
    };
  }

  // Delta state — only changed fields per player
  serializeDelta(players, tick, serverTime) {
    const deltaPlayers = [];

    for (const player of players.values()) {
      const prev = this.prevPlayerStates.get(player.id);
      const curr = player.toSnapshot();

      if (!prev) {
        this.prevPlayerStates.set(player.id, curr);
        deltaPlayers.push(curr); // send full for new players
        continue;
      }

      const delta = { id: player.id };
      let hasChange = false;

      for (const [key, val] of Object.entries(curr)) {
        if (key === 'id') continue;
        if (JSON.stringify(val) !== JSON.stringify(prev[key])) {
          delta[key] = val;
          hasChange = true;
        }
      }

      if (hasChange) {
        deltaPlayers.push(delta);
        this.prevPlayerStates.set(player.id, curr);
      }
    }

    if (deltaPlayers.length === 0) return null;

    return {
      type: 'delta',
      tick,
      serverTime,
      players: deltaPlayers,
    };
  }

  // Pack input flags into a single integer (already done via INPUT_FLAGS)
  static packFlags(keys) {
    return keys.reduce((acc, flag) => acc | flag, 0);
  }

  // Quantize angle to 16-bit integer (0–65535)
  static quantizeAngle(radians) {
    return Math.round(((radians % (Math.PI * 2)) / (Math.PI * 2)) * 65535) & 0xFFFF;
  }

  static dequantizeAngle(quantized) {
    return (quantized / 65535) * Math.PI * 2;
  }

  // Quantize position to 16-bit (0–65535 for 0–4096 world units)
  static quantizePos(worldPos) {
    return Math.round((worldPos / 4096) * 65535) & 0xFFFF;
  }

  static dequantizePos(quantized) {
    return (quantized / 65535) * 4096;
  }

  cleanupPlayer(playerId) {
    this.prevPlayerStates.delete(playerId);
  }
}
