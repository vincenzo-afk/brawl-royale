// ============================================================
// COMBAT SYSTEM — hitscan, projectile, damage resolution
// ============================================================
import { HEADSHOT_MULTIPLIER, ARMOR_TIERS, INPUT_FLAGS } from 'battle-royale-shared';
import { WEAPONS, WEAPON_TYPES } from '../weapons/WeaponDefinitions.js';
import { PhysicsSystem } from './PhysicsSystem.js';
import { Projectile } from '../entities/Projectile.js';

export class CombatSystem {
  constructor(room) {
    this.room = room;
  }

  // Called per-player per-tick when FIRE flag is set
  processFireInput(player, input, players, projectiles) {
    const weapon = player.activeWeapon;
    if (!weapon) return null;

    const def = WEAPONS[weapon.weaponId];
    if (!def) return null;
    if (!player.isAlive) return null;
    if (player.isReloading) return null;

    const now = Date.now();
    const fireCooldown = 1000 / def.fireRate;
    if (now - player.lastFireTime < fireCooldown) return null;

    if (weapon.ammoInMag <= 0) {
      // Auto-start reload
      this.startReload(player, weapon, def);
      return null;
    }

    player.lastFireTime = now;
    weapon.ammoInMag--;

    // Apply server-authoritative recoil
    const recoilStep = player.recoilIndex % def.recoilPattern.length;
    const recoil = def.recoilPattern[recoilStep] || 0;
    player.recoilIndex++;
    const shotAngle = player.angle + (Math.random() * def.spread * 2 - def.spread) + recoil;

    const events = [];

    if (def.type === WEAPON_TYPES.HITSCAN) {
      // Multi-pellet for shotguns
      for (let p = 0; p < def.pellets; p++) {
        const pelletSpread = p === 0 ? 0 : (Math.random() * def.spread * 2 - def.spread);
        const pelletAngle = shotAngle + pelletSpread;

        const result = PhysicsSystem.raycast(
          player.x, player.y,
          pelletAngle,
          def.range,
          players,
          player.id,
          player.teamId,
          false
        );

        if (result.hit && result.target) {
          const dmg = this.applyDamage(result.target, player, def, result.isHeadshot);
          events.push({
            type: 'hit',
            attackerId: player.id,
            targetId: result.target.id,
            damage: dmg.totalDamage,
            isHeadshot: result.isHeadshot,
            killed: !result.target.isAlive,
            weaponId: weapon.weaponId,
            point: result.point,
          });
        }
      }
    } else if (def.type === WEAPON_TYPES.PROJECTILE) {
      const proj = new Projectile({
        ownerId: player.id,
        weaponId: weapon.weaponId,
        x: player.x,
        y: player.y,
        angle: shotAngle,
        speed: def.bulletSpeed,
      });
      projectiles.set(proj.id, proj);
      events.push({ type: 'projectile_spawn', projectile: proj.toSnapshot() });
    } else if (def.type === WEAPON_TYPES.MELEE) {
      // Melee — short range arc check
      for (const target of players.values()) {
        if (target.id === player.id) continue;
        if (!target.isAlive) continue;
        const dist = Math.hypot(target.x - player.x, target.y - player.y);
        if (dist <= def.range) {
          const dmg = this.applyDamage(target, player, def, false);
          events.push({
            type: 'hit',
            attackerId: player.id,
            targetId: target.id,
            damage: dmg.totalDamage,
            isHeadshot: false,
            killed: !target.isAlive,
            weaponId: weapon.weaponId,
            point: { x: target.x, y: target.y },
          });
        }
      }
    }

    player.markDirty('inventory');
    return events;
  }

  applyDamage(target, attacker, weaponDef, isHeadshot) {
    let damage = weaponDef.damage;

    // Headshot multiplier
    if (isHeadshot) {
      damage *= (weaponDef.headshotMultiplier || HEADSHOT_MULTIPLIER);
    }

    // Armor reduction
    if (target.armor.vest > 0) {
      const reduction = ARMOR_TIERS[target.armor.vest]?.bodyReduction || 0;
      if (!isHeadshot) damage *= (1 - reduction);
    }
    if (isHeadshot && target.armor.helmet > 0) {
      const reduction = ARMOR_TIERS[target.armor.helmet]?.headReduction || 0;
      damage *= (1 - reduction);
    }

    damage = Math.ceil(damage);

    const actualDamage = target.takeDamage(damage, { isHeadshot });

    // Track stats
    attacker.damageDealt += actualDamage;
    attacker.markDirty('damageDealt');

    if (!target.isAlive) {
      attacker.kills++;
      attacker.markDirty('kills');
    }

    return { totalDamage: damage, actualDamage };
  }

  // Check projectile collisions with players
  checkProjectileCollisions(projectiles, players) {
    const events = [];

    for (const [projId, proj] of projectiles) {
      if (!proj.alive) continue;

      // Map collision
      if (this.room.world?.isSolid(proj.x, proj.y)) {
        proj.alive = false;

        // Explosion
        if (proj.explosionRadius > 0) {
          events.push(...this.handleExplosion(proj, players));
        }
        events.push({ type: 'projectile_destroy', id: projId });
        continue;
      }

      // Player collision
      for (const player of players.values()) {
        if (!player.isAlive) continue;
        if (player.id === proj.ownerId) continue;

        if (PhysicsSystem.circleOverlap(proj.x, proj.y, 6, player.x, player.y, player.radius)) {
          proj.alive = false;

          if (proj.explosionRadius > 0) {
            events.push(...this.handleExplosion(proj, players));
          } else {
            const attacker = this.room.players.get(proj.ownerId);
            if (attacker) {
              const weaponDef = WEAPONS[proj.weaponId];
              const dmg = this.applyDamage(player, attacker, weaponDef || { damage: proj.damage, headshotMultiplier: 1.5 }, false);
              events.push({
                type: 'hit',
                attackerId: proj.ownerId,
                targetId: player.id,
                damage: dmg.totalDamage,
                isHeadshot: false,
                killed: !player.isAlive,
                weaponId: proj.weaponId,
                point: { x: proj.x, y: proj.y },
              });
            }
          }

          events.push({ type: 'projectile_destroy', id: projId });
          break;
        }
      }
    }

    return events;
  }

  handleExplosion(proj, players) {
    const events = [];
    for (const player of players.values()) {
      if (!player.isAlive) continue;
      const dist = Math.hypot(player.x - proj.x, player.y - proj.y);
      if (dist <= proj.explosionRadius) {
        const falloff = 1 - (dist / proj.explosionRadius);
        const damage = Math.ceil(proj.damage * falloff);
        const attacker = this.room.players.get(proj.ownerId);
        if (!attacker) continue;
        const weaponDef = WEAPONS[proj.weaponId] || { damage, headshotMultiplier: 1 };
        const dmg = this.applyDamage(player, attacker, { ...weaponDef, damage }, false);
        events.push({
          type: 'hit',
          attackerId: proj.ownerId,
          targetId: player.id,
          damage: dmg.totalDamage,
          isHeadshot: false,
          killed: !player.isAlive,
          weaponId: proj.weaponId,
          point: { x: proj.x, y: proj.y },
        });
      }
    }
    return events;
  }

  // Reload
  startReload(player, weapon, weaponDef) {
    if (player.isReloading) return;
    if (weapon.ammoInMag >= weaponDef.magazineSize) return;

    const ammoKey = `ammo${weaponDef.ammoType.charAt(0) + weaponDef.ammoType.slice(1).toLowerCase()}`;
    if ((player.inventory[ammoKey] || 0) <= 0) return;

    player.isReloading = true;
    player.reloadEndTime = Date.now() + weaponDef.reloadTime;
    player.recoilIndex = 0;
    player.markDirty('isReloading');
  }

  completeReload(player) {
    if (!player.isReloading) return;
    if (Date.now() < player.reloadEndTime) return;

    const weapon = player.activeWeapon;
    if (!weapon) { player.isReloading = false; return; }

    const def = WEAPONS[weapon.weaponId];
    if (!def) { player.isReloading = false; return; }

    const ammoKey = `ammo${def.ammoType.charAt(0) + def.ammoType.slice(1).toLowerCase()}`;
    const needed = def.magazineSize - weapon.ammoInMag;
    const available = player.inventory[ammoKey] || 0;
    const toLoad = Math.min(needed, available);

    weapon.ammoInMag += toLoad;
    player.inventory[ammoKey] -= toLoad;
    player.isReloading = false;

    player.markDirty('inventory', 'isReloading');
  }

  // Per-tick check all pending reloads
  updateReloads(players) {
    for (const player of players.values()) {
      if (player.isReloading) {
        this.completeReload(player);
      }
    }
  }
}
