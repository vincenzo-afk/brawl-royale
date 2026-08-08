// ============================================================
// STORM SYSTEM — shrinking safe zone
// ============================================================
import { MAP_WIDTH, MAP_HEIGHT, STORM_PHASES } from 'battle-royale-shared';

export class StormSystem {
  constructor() {
    const cx = MAP_WIDTH / 2;
    const cy = MAP_HEIGHT / 2;
    const maxR = Math.min(MAP_WIDTH, MAP_HEIGHT) / 2;

    this.phases = STORM_PHASES;
    this.currentPhase = 0;
    this.phaseStartTime = Date.now();
    this.phaseState = 'waiting'; // 'waiting' | 'shrinking' | 'done'

    // Current circle
    this.centerX = cx;
    this.centerY = cy;
    this.currentRadius = maxR * STORM_PHASES[0].radiusFraction;

    // Target circle (where we're shrinking to)
    this.targetCenterX = cx;
    this.targetCenterY = cy;
    this.targetRadius = this.currentRadius;

    this.maxRadius = maxR;
    this.shrinkStartRadius = this.currentRadius;
    this.shrinkStartX = cx;
    this.shrinkStartY = cy;
  }

  // Call once per second (or per tick)
  update(now = Date.now()) {
    const phase = this.phases[this.currentPhase];
    if (!phase) return; // storm fully done

    const elapsed = now - this.phaseStartTime;

    if (this.phaseState === 'waiting') {
      // Count down wait period
      if (elapsed >= phase.waitMs) {
        // Move to next phase's target
        const nextPhase = this.phases[this.currentPhase + 1];
        if (!nextPhase) { this.phaseState = 'done'; return; }

        // Pick a random center within current circle
        const newR = this.maxRadius * nextPhase.radiusFraction;
        const maxOffset = Math.max(0, this.currentRadius - newR);
        const randDist = Math.random() * maxOffset;
        const randAngle = Math.random() * Math.PI * 2;
        this.targetCenterX = this.centerX + Math.cos(randAngle) * randDist;
        this.targetCenterY = this.centerY + Math.sin(randAngle) * randDist;
        this.targetRadius = newR;

        this.shrinkStartRadius = this.currentRadius;
        this.shrinkStartX = this.centerX;
        this.shrinkStartY = this.centerY;

        this.currentPhase++;
        this.phaseStartTime = now;
        this.phaseState = 'shrinking';
      }
    } else if (this.phaseState === 'shrinking') {
      const shrinkPhase = this.phases[this.currentPhase];
      const shrinkElapsed = now - this.phaseStartTime;
      const t = Math.min(1, shrinkElapsed / (shrinkPhase?.shrinkMs || 30000));

      // Lerp center and radius
      this.currentRadius = lerp(this.shrinkStartRadius, this.targetRadius, t);
      this.centerX = lerp(this.shrinkStartX, this.targetCenterX, t);
      this.centerY = lerp(this.shrinkStartY, this.targetCenterY, t);

      if (t >= 1) {
        this.phaseState = 'waiting';
        this.phaseStartTime = now;
      }
    }
  }

  // Apply storm damage to players outside circle
  applyDamage(players, now = Date.now()) {
    const phase = this.phases[this.currentPhase];
    const damage = phase?.damage || 0;
    if (damage <= 0) return [];

    const damaged = [];

    for (const player of players.values()) {
      if (!player.isAlive) continue;

      const dist = Math.hypot(player.x - this.centerX, player.y - this.centerY);
      if (dist > this.currentRadius) {
        // Outside storm — apply damage once per second
        if (now - player.lastStormDamageTime >= 1000) {
          player.takeDamage(damage, { isStorm: true });
          player.lastStormDamageTime = now;
          damaged.push({ playerId: player.id, damage, alive: player.isAlive });
        }
      }
    }

    return damaged;
  }

  // Returns the state to send to clients
  toSnapshot(now = Date.now()) {
    const phase = this.phases[this.currentPhase];
    const nextPhase = this.phases[this.currentPhase + 1];

    let timeToNextShrink = 0;
    if (this.phaseState === 'waiting') {
      const elapsed = now - this.phaseStartTime;
      timeToNextShrink = Math.max(0, (phase?.waitMs || 0) - elapsed);
    }

    return {
      phase: this.currentPhase,
      phaseState: this.phaseState,
      centerX: Math.round(this.centerX),
      centerY: Math.round(this.centerY),
      currentRadius: Math.round(this.currentRadius),
      targetCenterX: Math.round(this.targetCenterX),
      targetCenterY: Math.round(this.targetCenterY),
      targetRadius: Math.round(this.targetRadius),
      damage: phase?.damage || 0,
      nextDamage: nextPhase?.damage || 0,
      timeToNextShrink: Math.round(timeToNextShrink),
      shrinkProgress: this.phaseState === 'shrinking'
        ? Math.min(1, (now - this.phaseStartTime) / (phase?.shrinkMs || 30000))
        : 0,
    };
  }

  isPlayerInSafeZone(px, py) {
    return Math.hypot(px - this.centerX, py - this.centerY) <= this.currentRadius;
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
