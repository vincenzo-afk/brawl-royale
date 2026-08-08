// ============================================================
// SERVER-SIDE BOT CONTROLLER
// Simulates human player input, movement, combat, looting,
// and storm avoidance for AI players.
// ============================================================
import { INPUT_FLAGS, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, S2C } from 'battle-royale-shared';
import { WEAPONS } from '../weapons/WeaponDefinitions.js';

export class BotController {
  constructor(player, room) {
    this.player = player;
    this.room = room;
    this.player.isBot = true;

    // AI States: 'looting' | 'wandering' | 'hunting' | 'running_storm'
    this.state = 'looting';
    this.targetX = player.x;
    this.targetY = player.y;
    this.targetEntity = null;

    // Retarget intervals
    this.lastDecisionTime = 0;
    this.decisionDelay = 1000 + Math.random() * 2000; // 1-3s

    // Combat cooldowns
    this.lastShotTime = 0;
    this.shotCooldown = 400 + Math.random() * 600;     // reaction speed

    // Stuck detection
    this.lastX = player.x;
    this.lastY = player.y;
    this.stuckTime = 0;
  }

  update(now, dt) {
    if (!this.player.isAlive) return;

    // 1. periodic decision making
    if (now - this.lastDecisionTime > this.decisionDelay) {
      this.makeDecision(now);
      this.lastDecisionTime = now;
    }

    // 2. execute behavior state
    this.executeBehavior(now, dt);
  }

  makeDecision(now) {
    const p = this.player;

    // A. Priority 1: Storm check
    const storm = this.room.storm;
    if (storm) {
      const distToStormCenter = Math.hypot(p.x - storm.centerX, p.y - storm.centerY);
      if (distToStormCenter > storm.currentRadius - 200) {
        this.state = 'running_storm';
        // Pick a target coordinate safely inside the storm circle
        const angle = Math.random() * Math.PI * 2;
        const radius = storm.currentRadius * 0.5 * Math.random();
        this.targetX = storm.centerX + Math.cos(angle) * radius;
        this.targetY = storm.centerY + Math.sin(angle) * radius;
        return;
      }
    }

    // B. Priority 2: Spot nearby players to hunt
    let closestEnemy = null;
    let closestEnemyDist = Infinity;
    for (const other of this.room.players.values()) {
      if (other.id === p.id || !other.isAlive) continue;
      if (other.teamId && other.teamId === p.teamId) continue; // teammates

      const dist = Math.hypot(other.x - p.x, other.y - p.y);
      if (dist < 600 && dist < closestEnemyDist) {
        closestEnemyDist = dist;
        closestEnemy = other;
      }
    }

    if (closestEnemy) {
      this.state = 'hunting';
      this.targetEntity = closestEnemy;
      return;
    }

    // C. Priority 3: Loot if inventory isn't full/great
    const primary1 = p.inventory[0];
    const primary2 = p.inventory[1];
    if (!primary1 || !primary2) {
      let closestLoot = null;
      let closestLootDist = Infinity;
      for (const loot of this.room.loot.lootItems.values()) {
        if (!loot.alive) continue;
        const dist = Math.hypot(loot.x - p.x, loot.y - p.y);
        if (dist < 500 && dist < closestLootDist) {
          closestLootDist = dist;
          closestLoot = loot;
        }
      }

      if (closestLoot) {
        this.state = 'looting';
        this.targetEntity = closestLoot;
        this.targetX = closestLoot.x;
        this.targetY = closestLoot.y;
        return;
      }
    }

    // D. Priority 4: Wander around the safe zone
    this.state = 'wandering';
    const wanderRadius = 400;
    const wanderAngle = Math.random() * Math.PI * 2;
    let wx = p.x + Math.cos(wanderAngle) * wanderRadius;
    let wy = p.y + Math.sin(wanderAngle) * wanderRadius;

    // Clamp to map boundaries
    wx = Math.max(100, Math.min(MAP_WIDTH - 100, wx));
    wy = Math.max(100, Math.min(MAP_HEIGHT - 100, wy));

    // Keep wander target inside storm
    if (storm) {
      const dist = Math.hypot(wx - storm.centerX, wy - storm.centerY);
      if (dist > storm.currentRadius - 50) {
        wx = storm.centerX;
        wy = storm.centerY;
      }
    }

    this.targetX = wx;
    this.targetY = wy;
    this.targetEntity = null;
  }

  executeBehavior(now, dt) {
    const p = this.player;
    let flags = 0;
    let aimAngle = p.angle;

    // ── Stuck detection: if we barely moved while chasing a target,
    //    pick a fresh direction so bots don't grind against walls ──
    const moved = Math.hypot(p.x - this.lastX, p.y - this.lastY);
    if (moved < 3) {
      this.stuckTime += dt * 1000;
      if (this.stuckTime > 1200) {
        this.stuckTime = 0;
        if (this.state !== 'hunting') {
          this.state = 'wandering';
          const angle = Math.random() * Math.PI * 2;
          this.targetX = p.x + Math.cos(angle) * 250;
          this.targetY = p.y + Math.sin(angle) * 250;
        } else {
          // Try flanking the target instead of walking into the wall
          const off = (Math.random() * 2 - 1) * 120;
          this.targetX = this.targetEntity?.x + off || p.x;
          this.targetY = this.targetEntity?.y + off || p.y;
        }
      }
    } else {
      this.stuckTime = 0;
    }
    this.lastX = p.x;
    this.lastY = p.y;

    // Target position coordinates
    let tx = this.targetX;
    let ty = this.targetY;

    // Override target coordinates if targeting a live entity
    if (this.targetEntity) {
      if (this.targetEntity.alive === false || (this.targetEntity.hasOwnProperty('alive') && !this.targetEntity.alive)) {
        this.targetEntity = null;
        this.state = 'wandering';
      } else {
        tx = this.targetEntity.x;
        ty = this.targetEntity.y;
      }
    }

    const dist = Math.hypot(tx - p.x, ty - p.y);

    // ── Movement Input Generation ──────────────────────────
    if (dist > 25) {
      const moveAngle = Math.atan2(ty - p.y, tx - p.x);
      aimAngle = moveAngle;

      const cos = Math.cos(moveAngle);
      const sin = Math.sin(moveAngle);

      if (cos > 0.3)  flags |= INPUT_FLAGS.RIGHT;
      if (cos < -0.3) flags |= INPUT_FLAGS.LEFT;
      if (sin > 0.3)  flags |= INPUT_FLAGS.DOWN;
      if (sin < -0.3) flags |= INPUT_FLAGS.UP;

      // Sprint if far or running from storm
      if (dist > 150 || this.state === 'running_storm') {
        flags |= INPUT_FLAGS.SPRINT;
      }
    }

    // ── Combat/Loot Action Generation ───────────────────────
    if (this.state === 'hunting' && this.targetEntity) {
      aimAngle = Math.atan2(this.targetEntity.y - p.y, this.targetEntity.x - p.x);
      
      // Auto weapon selection: switch to a gun slot if holding fists
      if (p.activeSlot === 2 && (p.inventory[0] || p.inventory[1])) {
        p.activeSlot = p.inventory[0] ? 0 : 1;
        p.markDirty('activeSlot');
      }

      // Fire weapon
      const weapon = p.activeWeapon;
      const def = weapon ? WEAPONS[weapon.weaponId] : null;
      const combatRange = def ? def.range : 100;

      if (dist <= combatRange && now - this.lastShotTime > this.shotCooldown) {
        flags |= INPUT_FLAGS.FIRE;
        this.lastShotTime = now;

        // Auto reload if magazine empty
        if (weapon && weapon.ammoInMag <= 0 && !p.isReloading) {
          flags |= INPUT_FLAGS.RELOAD;
        }
      }
    }

    // ── Heal when badly hurt ────────────────────────────────
    if (!p.isHealing && p.health < 50) {
      for (const slot of [3, 4, 5]) {
        if (p.inventory[slot]?.itemId) {
          if (p.startHealing(slot)) break;
        }
      }
    } else if (this.state === 'looting' && this.targetEntity) {
      if (dist <= 40) {
        flags |= INPUT_FLAGS.USE; // Interact key
        this.targetEntity = null;
        this.state = 'wandering';
      }
    }

    // ── Apply Simulation Inputs ─────────────────────────────
    const simulatedInput = {
      seq: p.lastProcessedInput + 1,
      flags,
      angle: aimAngle,
      dt,
    };

    // Apply movement & update variables
    p.applyInput(simulatedInput, dt, this.room.world);
    p.lastProcessedInput = simulatedInput.seq;

    // Clamp to map boundaries
    p.x = Math.max(p.radius, Math.min(MAP_WIDTH - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(MAP_HEIGHT - p.radius, p.y));

    // Resolve tile based collision
    if (this.room.physics) {
      this.room.physics.resolveMapCollision(p);
    }

    // Auto-complete fire events for bots
    if (flags & INPUT_FLAGS.FIRE) {
      const events = this.room.combat.processFireInput(p, simulatedInput, this.room.players, this.room.projectiles);
      if (events) this.room.processCombatEvents(events, p);
    }

    // Auto-reload for bots
    if (flags & INPUT_FLAGS.RELOAD) {
      this.room.combat.tryReload(p);
    }

    // Auto-complete looting events for bots
    if (flags & INPUT_FLAGS.USE) {
      const pickups = this.room.loot.checkPickups(this.room.players);
      for (const pickup of pickups) {
        this.room.emit(S2C.LOOT_PICKUP, pickup);
      }
    }
  }
}
