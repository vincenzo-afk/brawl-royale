// ============================================================
// CLIENT-SIDE PREDICTION
// Input is applied immediately on the local player without
// waiting for server confirmation. Must mirror the server's
// Player.applyInput + PhysicsSystem behavior exactly so the
// authoritative state and the predicted state stay in lockstep.
// ============================================================
import {
  INPUT_FLAGS, PLAYER_BASE_SPEED, PLAYER_SPRINT_MULTIPLIER, PLAYER_CROUCH_MULTIPLIER,
  PLAYER_AIM_WALK_SPEED, PLAYER_SWIM_SPEED,
  MAP_WIDTH, MAP_HEIGHT, PLAYER_RADIUS,
} from 'battle-royale-shared';

export class Prediction {
  constructor() {
    this.pendingInputs = [];   // inputs not yet acked by server
    this.inputSeq = 0;
    this.enabled = true;
    this.tileMap = null;       // set from server map data for local collision
  }

  setMap(tileMap) {
    this.tileMap = tileMap;
  }

  // Apply input locally to local player state
  applyInput(localPlayer, input) {
    if (!this.enabled) return;

    const flags = input.flags || 0;
    const sprint = !!(flags & INPUT_FLAGS.SPRINT);
    const crouch = !!(flags & INPUT_FLAGS.CROUCH);
    const ads    = !!(flags & INPUT_FLAGS.ADS);

    let spd = PLAYER_BASE_SPEED;
    if (sprint && !crouch && !ads) spd *= PLAYER_SPRINT_MULTIPLIER;
    if (crouch) spd *= PLAYER_CROUCH_MULTIPLIER;
    if (ads) spd = Math.min(spd, PLAYER_AIM_WALK_SPEED);
    if (this.tileMap?.isWaterAt?.(localPlayer.x, localPlayer.y)) spd = Math.min(spd, PLAYER_SWIM_SPEED);

    let dx = 0, dy = 0;
    const hasVec = typeof input.moveX === 'number' && typeof input.moveY === 'number';
    if (hasVec) {
      dx = input.moveX;
      dy = input.moveY;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
    } else {
      const up     = !!(flags & INPUT_FLAGS.UP);
      const down   = !!(flags & INPUT_FLAGS.DOWN);
      const left   = !!(flags & INPUT_FLAGS.LEFT);
      const right  = !!(flags & INPUT_FLAGS.RIGHT);
      if (up)    dy -= 1;
      if (down)  dy += 1;
      if (left)  dx -= 1;
      if (right) dx += 1;

      if (dx !== 0 && dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        dx /= len; dy /= len;
      }
    }

    const dt = input.dt || (1 / 60);
    localPlayer.x += dx * spd * dt;
    localPlayer.y += dy * spd * dt;
    localPlayer.angle = input.angle ?? localPlayer.angle;
    localPlayer.isADS = ads;
    localPlayer.isSprinting = sprint && !crouch && !ads;
    localPlayer.isCrouching = crouch;

    // Clamp to world
    localPlayer.x = Math.max(PLAYER_RADIUS, Math.min(MAP_WIDTH - PLAYER_RADIUS, localPlayer.x));
    localPlayer.y = Math.max(PLAYER_RADIUS, Math.min(MAP_HEIGHT - PLAYER_RADIUS, localPlayer.y));

    // Local tile collision — same resolver the server uses, so the
    // client slides along walls instead of phasing through them and
    // getting snapped back by reconciliation.
    if (this.tileMap) {
      const resolved = this.tileMap.resolveCircle(localPlayer.x, localPlayer.y, PLAYER_RADIUS);
      localPlayer.x = resolved.x;
      localPlayer.y = resolved.y;
    }
  }

  // Store input for reconciliation
  saveInput(input) {
    this.pendingInputs.push({ ...input });
    // Cap to prevent memory bloat
    if (this.pendingInputs.length > 120) {
      this.pendingInputs.shift();
    }
  }

  // Called when server acks an input seq — discard acked inputs
  acknowledgeInput(lastProcessedSeq) {
    this.pendingInputs = this.pendingInputs.filter(i => i.seq > lastProcessedSeq);
  }

  nextSeq() {
    return ++this.inputSeq;
  }

  // Get all unacknowledged inputs (for reconciliation re-application)
  getPendingInputs() {
    return this.pendingInputs;
  }

  reset() {
    this.pendingInputs = [];
    this.inputSeq = 0;
  }
}
