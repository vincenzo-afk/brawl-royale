// ============================================================
// ENTITY INTERPOLATION
// Remote entities are rendered 100ms in the past using a
// circular snapshot buffer. This hides network jitter and
// provides smooth movement between server updates.
// ============================================================
import { INTERPOLATION_DELAY_MS } from 'battle-royale-shared';

export class Interpolation {
  constructor() {
    // Per-entity snapshot buffer: Map<entityId, Array<{time, state}>>
    this.snapshots = new Map();
    this.delay = INTERPOLATION_DELAY_MS;
    this.maxSnapshots = 20;  // keep 20 snapshots per entity (= 1s at 20Hz)
  }

  // Called when server sends new state for an entity
  addSnapshot(entityId, state, serverTime = Date.now()) {
    if (!this.snapshots.has(entityId)) {
      this.snapshots.set(entityId, []);
    }
    const buf = this.snapshots.get(entityId);
    buf.push({ time: serverTime, state: { ...state } });

    // Trim old snapshots
    while (buf.length > this.maxSnapshots) {
      buf.shift();
    }
  }

  // Get interpolated state for entity at current render time
  // Returns the interpolated {x, y, angle, ...} or null
  getInterpolatedState(entityId, now = Date.now()) {
    const buf = this.snapshots.get(entityId);
    if (!buf || buf.length === 0) return null;

    const renderTime = now - this.delay;

    // Need at least 2 snapshots to interpolate
    if (buf.length === 1) return buf[0].state;

    // Find the two snapshots that straddle renderTime
    let from = null, to = null;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].time <= renderTime) {
        from = buf[i];
        to = buf[i + 1] || null;
        break;
      }
    }

    // renderTime is behind all snapshots — use oldest
    if (!from) return buf[0].state;

    // renderTime is ahead of all snapshots — extrapolate slightly or use newest
    if (!to) {
      // Simple extrapolation: dead reckoning (up to 200ms)
      const age = renderTime - from.time;
      if (age > 200) return from.state;
      const s = from.state;
      const vx = s.vx || 0, vy = s.vy || 0;
      const dt = age / 1000;
      return { ...s, x: s.x + vx * dt, y: s.y + vy * dt };
    }

    // Interpolate between from and to
    const t = Math.max(0, Math.min(1, (renderTime - from.time) / (to.time - from.time)));
    return this.lerp(from.state, to.state, t);
  }

  lerp(a, b, t) {
    const result = { ...b };
    result.x = a.x + (b.x - a.x) * t;
    result.y = a.y + (b.y - a.y) * t;

    // Angle interpolation (shortest path)
    let da = b.angle - a.angle;
    if (da > Math.PI)  da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    result.angle = a.angle + da * t;

    return result;
  }

  // Remove entity on leave/death
  removeEntity(entityId) {
    this.snapshots.delete(entityId);
  }

  // Clear all
  reset() {
    this.snapshots.clear();
  }
}
