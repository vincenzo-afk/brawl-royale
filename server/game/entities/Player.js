// ============================================================
// SERVER-SIDE PLAYER ENTITY
// ============================================================
import { v4 as uuidv4 } from 'uuid';
import {
  PLAYER_MAX_HEALTH, PLAYER_MAX_SHIELD, PLAYER_RADIUS,
  PLAYER_BASE_SPEED, PLAYER_SPRINT_MULTIPLIER, PLAYER_CROUCH_MULTIPLIER,
  INVENTORY_SLOTS, INPUT_FLAGS,
} from 'battle-royale-shared';

export class Player {
  constructor({ socketId, playerId, name, skin = 0, elo = 1000, teamId = null }) {
    this.id = playerId || uuidv4();
    this.socketId = socketId;
    this.name = name || `Player_${this.id.slice(0, 5)}`;
    this.skin = skin;
    this.elo = elo;
    this.teamId = teamId;

    // Position & physics
    this.x = 0;
    this.y = 0;
    this.angle = 0;           // radians, aim direction
    this.vx = 0;
    this.vy = 0;
    this.speed = PLAYER_BASE_SPEED;
    this.radius = PLAYER_RADIUS;
    this.isSprinting = false;
    this.isCrouching = false;

    // Health
    this.health = PLAYER_MAX_HEALTH;
    this.maxHealth = PLAYER_MAX_HEALTH;
    this.shield = 0;
    this.maxShield = PLAYER_MAX_SHIELD;
    this.armor = { helmet: 0, vest: 0 };   // 0=none, 1-3=tier

    // State
    this.alive = true;
    this.isSpectating = false;
    this.spectatingId = null;
    this.kills = 0;
    this.damageDealt = 0;
    this.spawnTime = Date.now();

    // Inventory
    this.inventory = {
      [INVENTORY_SLOTS.PRIMARY_1]: null,
      [INVENTORY_SLOTS.PRIMARY_2]: null,
      [INVENTORY_SLOTS.MELEE]: { weaponId: 'FISTS', ammoInMag: Infinity, reserveAmmo: Infinity },
      [INVENTORY_SLOTS.HEALING_1]: null,
      [INVENTORY_SLOTS.HEALING_2]: null,
      [INVENTORY_SLOTS.HEALING_3]: null,
      ammoLight: 0,
      ammoHeavy: 0,
      ammoShotgun: 0,
      ammoSniper: 0,
    };
    this.activeSlot = INVENTORY_SLOTS.MELEE;

    // Weapon state
    this.reloadEndTime = 0;
    this.lastFireTime = 0;
    this.recoilIndex = 0;
    this.isReloading = false;
    this.isHealing = false;
    this.healEndTime = 0;
    this.healingItem = null;

    // Networking
    this.lastInputSeq = 0;
    this.inputBuffer = [];   // unprocessed inputs
    this.lastProcessedInput = 0;

    // Storm damage
    this.lastStormDamageTime = 0;

    // Dirty tracking for delta compression
    this._dirty = new Set();
    this._prevState = {};
  }

  // ── Getters ────────────────────────────────────────────────
  get activeWeapon() {
    return this.inventory[this.activeSlot] || null;
  }

  get isAlive() { return this.alive && this.health > 0; }

  // ── Damage ────────────────────────────────────────────────
  takeDamage(amount, { isHeadshot = false, isStorm = false } = {}) {
    if (!this.isAlive) return 0;

    let dmg = amount;

    // Shield absorbs first
    if (this.shield > 0) {
      const shieldAbsorb = Math.min(this.shield, dmg);
      this.shield -= shieldAbsorb;
      dmg -= shieldAbsorb;
      this._dirty.add('shield');
    }

    // Apply remaining to health
    if (dmg > 0) {
      this.health = Math.max(0, this.health - dmg);
      this._dirty.add('health');
    }

    if (this.health <= 0) {
      this.alive = false;
      this._dirty.add('alive');
    }

    return amount; // return total damage for kill feed
  }

  heal(amount) {
    const prev = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    if (this.health !== prev) this._dirty.add('health');
  }

  replenishShield(amount) {
    const prev = this.shield;
    this.shield = Math.min(this.maxShield, this.shield + amount);
    if (this.shield !== prev) this._dirty.add('shield');
  }

  // ── Movement ──────────────────────────────────────────────
  applyInput(input, dt) {
    const flags = input.flags || 0;
    const up     = !!(flags & INPUT_FLAGS.UP);
    const down   = !!(flags & INPUT_FLAGS.DOWN);
    const left   = !!(flags & INPUT_FLAGS.LEFT);
    const right  = !!(flags & INPUT_FLAGS.RIGHT);
    const sprint = !!(flags & INPUT_FLAGS.SPRINT);
    const crouch = !!(flags & INPUT_FLAGS.CROUCH);

    this.isSprinting = sprint && !crouch;
    this.isCrouching = crouch;

    let spd = PLAYER_BASE_SPEED;
    if (this.isSprinting) spd *= PLAYER_SPRINT_MULTIPLIER;
    if (this.isCrouching) spd *= PLAYER_CROUCH_MULTIPLIER;

    let dx = 0, dy = 0;
    if (up)    dy -= 1;
    if (down)  dy += 1;
    if (left)  dx -= 1;
    if (right) dx += 1;

    // Normalize diagonal
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len; dy /= len;
    }

    const prevX = this.x, prevY = this.y;
    this.x += dx * spd * dt;
    this.y += dy * spd * dt;
    this.angle = input.angle ?? this.angle;

    if (this.x !== prevX) this._dirty.add('x');
    if (this.y !== prevY) this._dirty.add('y');
    if (this.angle !== input.angle) this._dirty.add('angle');
  }

  // ── Inventory ─────────────────────────────────────────────
  pickupWeapon(weaponId, ammoInMag, reserveAmmo) {
    // Try slot 0, then slot 1
    for (const slot of [INVENTORY_SLOTS.PRIMARY_1, INVENTORY_SLOTS.PRIMARY_2]) {
      if (!this.inventory[slot]) {
        this.inventory[slot] = { weaponId, ammoInMag, reserveAmmo };
        this.activeSlot = slot;
        this._dirty.add('inventory');
        return slot;
      }
    }
    // Drop current weapon, pick up new
    const current = this.inventory[this.activeSlot];
    this.inventory[this.activeSlot] = { weaponId, ammoInMag, reserveAmmo };
    this._dirty.add('inventory');
    return this.activeSlot;
  }

  // ── Serialization ─────────────────────────────────────────
  toSnapshot() {
    return {
      id: this.id,
      name: this.name,
      skin: this.skin,
      x: Math.round(this.x),
      y: Math.round(this.y),
      angle: this.angle,
      health: this.health,
      maxHealth: this.maxHealth,
      shield: this.shield,
      maxShield: this.maxShield,
      armor: this.armor,
      alive: this.alive,
      kills: this.kills,
      isSprinting: this.isSprinting,
      isCrouching: this.isCrouching,
      activeSlot: this.activeSlot,
      activeWeaponId: this.activeWeapon?.weaponId || null,
      ammoInMag: this.activeWeapon?.ammoInMag ?? 0,
      reserveAmmo: this.activeWeapon?.reserveAmmo ?? 0,
      teamId: this.teamId,
      lastProcessedInput: this.lastProcessedInput,
    };
  }

  toDelta() {
    const delta = { id: this.id };
    for (const key of this._dirty) {
      delta[key] = this[key];
    }
    this._dirty.clear();
    return delta;
  }

  hasDelta() { return this._dirty.size > 0; }

  markDirty(...fields) {
    for (const f of fields) this._dirty.add(f);
  }
}
