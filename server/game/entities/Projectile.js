// ============================================================
// SERVER-SIDE PROJECTILE ENTITY
// ============================================================
import { v4 as uuidv4 } from 'uuid';
import { WEAPONS } from '../weapons/WeaponDefinitions.js';

export class Projectile {
  constructor({ ownerId, weaponId, x, y, angle, speed }) {
    this.id = uuidv4();
    this.ownerId = ownerId;
    this.weaponId = weaponId;
    this.x = x;
    this.y = y;
    this.angle = angle;
    const def = WEAPONS[weaponId];
    const spd = speed ?? (def?.bulletSpeed || 400);
    this.vx = Math.cos(angle) * spd;
    this.vy = Math.sin(angle) * spd;
    this.damage = def?.damage || 0;
    this.headshotMultiplier = def?.headshotMultiplier || 2.0;
    this.explosionRadius = def?.explosionRadius || 0;
    this.range = def?.range || 1500;
    this.distanceTraveled = 0;
    this.alive = true;
    this.createdAt = Date.now();
  }

  update(dt) {
    const dx = this.vx * dt;
    const dy = this.vy * dt;
    this.x += dx;
    this.y += dy;
    this.distanceTraveled += Math.sqrt(dx * dx + dy * dy);
    if (this.distanceTraveled >= this.range) {
      this.alive = false;
    }
  }

  destroy() { this.alive = false; }

  toSnapshot() {
    return {
      id: this.id,
      ownerId: this.ownerId,
      weaponId: this.weaponId,
      x: Math.round(this.x),
      y: Math.round(this.y),
      angle: this.angle,
    };
  }
}
