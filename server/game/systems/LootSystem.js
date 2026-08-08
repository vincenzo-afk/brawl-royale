// ============================================================
// LOOT SYSTEM — item spawning, pickup, airdrops
// ============================================================
import { v4 as uuidv4 } from 'uuid';
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, LOOT_TIERS, AIRDROP_INTERVAL_MS, AIRDROP_RADIUS, HEALING_ITEMS } from 'battle-royale-shared';
import { LootItem, LOOT_ITEM_TYPES } from '../entities/Loot.js';
import { WEAPONS, WEAPON_IDS, getRandomWeaponForTier } from '../weapons/WeaponDefinitions.js';
import { PhysicsSystem } from './PhysicsSystem.js';

const PICKUP_RADIUS = 40;

export class LootSystem {
  constructor(world) {
    this.world = world;
    this.lootItems = new Map();  // id → LootItem
    this.lastAirdropTime = 0;
  }

  // Spawn initial ground loot on match start
  spawnGroundLoot(density = 0.04) {
    const tilesX = Math.floor(MAP_WIDTH / TILE_SIZE);
    const tilesY = Math.floor(MAP_HEIGHT / TILE_SIZE);

    for (let tx = 0; tx < tilesX; tx++) {
      for (let ty = 0; ty < tilesY; ty++) {
        if (Math.random() > density) continue;
        if (this.world?.isSolid(tx * TILE_SIZE + 16, ty * TILE_SIZE + 16)) continue;

        const x = tx * TILE_SIZE + 8 + Math.random() * (TILE_SIZE - 16);
        const y = ty * TILE_SIZE + 8 + Math.random() * (TILE_SIZE - 16);

        const item = this.createRandomLoot(x, y);
        this.lootItems.set(item.id, item);
      }
    }

    return [...this.lootItems.values()].map(l => l.toSnapshot());
  }

  createRandomLoot(x, y) {
    // Pick tier by weight
    const tierEntries = Object.entries(LOOT_TIERS);
    const totalWeight = tierEntries.reduce((sum, [, v]) => sum + v.dropWeight, 0);
    let rand = Math.random() * totalWeight;
    let tier = 'COMMON';
    for (const [t, v] of tierEntries) {
      rand -= v.dropWeight;
      if (rand <= 0) { tier = t; break; }
    }

    const types = [LOOT_ITEM_TYPES.WEAPON, LOOT_ITEM_TYPES.AMMO, LOOT_ITEM_TYPES.HEALING, LOOT_ITEM_TYPES.ARMOR];
    const weights = [0.3, 0.4, 0.2, 0.1];
    const typeRand = Math.random();
    let cumulative = 0;
    let type = LOOT_ITEM_TYPES.AMMO;
    for (let i = 0; i < types.length; i++) {
      cumulative += weights[i];
      if (typeRand < cumulative) { type = types[i]; break; }
    }

    return this.createLootOfType(type, tier, x, y);
  }

  createLootOfType(type, tier, x, y) {
    switch (type) {
      case LOOT_ITEM_TYPES.WEAPON: {
        const weaponId = getRandomWeaponForTier(tier);
        const def = WEAPONS[weaponId];
        return new LootItem({
          type, itemId: weaponId, x, y, tier,
          extra: {
            ammoInMag: def?.magazineSize || 10,
            reserveAmmo: (def?.totalAmmo || 30) - (def?.magazineSize || 10),
          },
        });
      }
      case LOOT_ITEM_TYPES.AMMO: {
        const ammoTypes = ['LIGHT', 'HEAVY', 'SHOTGUN', 'SNIPER'];
        const ammoType = ammoTypes[Math.floor(Math.random() * ammoTypes.length)];
        return new LootItem({ type, itemId: ammoType, x, y, quantity: 20 + Math.floor(Math.random() * 60), tier });
      }
      case LOOT_ITEM_TYPES.HEALING: {
        const healTypes = Object.keys(HEALING_ITEMS);
        return new LootItem({ type, itemId: healTypes[Math.floor(Math.random() * healTypes.length)], x, y, quantity: 1, tier });
      }
      case LOOT_ITEM_TYPES.ARMOR: {
        const armorTier = { LEGENDARY: 3, EPIC: 3, RARE: 2, UNCOMMON: 1, COMMON: 1 }[tier] || 1;
        return new LootItem({ type, itemId: 'VEST', x, y, quantity: 1, tier, extra: { armorTier } });
      }
      default:
        return new LootItem({ type: LOOT_ITEM_TYPES.AMMO, itemId: 'LIGHT', x, y, quantity: 30, tier: 'COMMON' });
    }
  }

  // Check if player can pick up loot
  checkPickups(players) {
    const events = [];

    for (const player of players.values()) {
      if (!player.isAlive) continue;

      for (const [lootId, item] of this.lootItems) {
        if (!item.alive) continue;

        if (PhysicsSystem.circleOverlap(player.x, player.y, PICKUP_RADIUS, item.x, item.y, item.radius)) {
          const picked = this.applyPickup(player, item);
          if (picked) {
            item.pickup();
            events.push({ playerId: player.id, lootId, item: item.toSnapshot() });
          }
        }
      }
    }

    // Clean up dead loot
    for (const [id, item] of this.lootItems) {
      if (!item.alive) this.lootItems.delete(id);
    }

    return events;
  }

  applyPickup(player, item) {
    switch (item.type) {
      case LOOT_ITEM_TYPES.WEAPON:
        player.pickupWeapon(item.itemId, item.extra.ammoInMag, item.extra.reserveAmmo);
        return true;

      case LOOT_ITEM_TYPES.AMMO: {
        const key = `ammo${item.itemId.charAt(0) + item.itemId.slice(1).toLowerCase()}`;
        player.inventory[key] = (player.inventory[key] || 0) + item.quantity;
        player.markDirty('inventory');
        return true;
      }

      case LOOT_ITEM_TYPES.HEALING: {
        // Find empty healing slot
        const healSlots = [3, 4, 5];
        for (const slot of healSlots) {
          if (!player.inventory[slot]) {
            player.inventory[slot] = { itemId: item.itemId, quantity: item.quantity };
            player.markDirty('inventory');
            return true;
          }
          if (player.inventory[slot]?.itemId === item.itemId) {
            player.inventory[slot].quantity += item.quantity;
            player.markDirty('inventory');
            return true;
          }
        }
        return false; // full
      }

      case LOOT_ITEM_TYPES.ARMOR: {
        const armorTier = item.extra?.armorTier || 1;
        if (armorTier > (player.armor.vest || 0)) {
          player.armor = { ...player.armor, vest: armorTier };
          player.markDirty('armor');
          return true;
        }
        return false;
      }

      default:
        return false;
    }
  }

  // Airdrop system
  updateAirdrop(now = Date.now(), players) {
    if (now - this.lastAirdropTime < AIRDROP_INTERVAL_MS) return null;
    this.lastAirdropTime = now;

    // Pick random location within map (biased toward center)
    const x = MAP_WIDTH * 0.2 + Math.random() * MAP_WIDTH * 0.6;
    const y = MAP_HEIGHT * 0.2 + Math.random() * MAP_HEIGHT * 0.6;

    // Keep track of the crate's contents so the room can broadcast
    // them to clients when the crate lands (airdrop loot was previously
    // created but never emitted → clients never saw it).
    const items = [];
    const lootIds = [];
    for (let i = 0; i < 5; i++) {
      const tier = i < 2 ? 'LEGENDARY' : i < 4 ? 'EPIC' : 'RARE';
      const lx = x + (Math.random() - 0.5) * AIRDROP_RADIUS;
      const ly = y + (Math.random() - 0.5) * AIRDROP_RADIUS;
      const item = this.createLootOfType(LOOT_ITEM_TYPES.WEAPON, tier, lx, ly);
      this.lootItems.set(item.id, item);
      lootIds.push(item.id);
      items.push(item.toSnapshot());
    }

    return { x: Math.round(x), y: Math.round(y), lootIds, items, eta: 5000 };
  }

  // Drop player's inventory on death
  dropInventory(player) {
    const drops = [];
    const slots = [0, 1, 2, 3, 4, 5];
    for (const slot of slots) {
      const item = player.inventory[slot];
      if (!item) continue;
      if (slot <= 1) {
        // Weapon drop
        const loot = new LootItem({
          type: LOOT_ITEM_TYPES.WEAPON,
          itemId: item.weaponId,
          x: player.x + (Math.random() - 0.5) * 40,
          y: player.y + (Math.random() - 0.5) * 40,
          tier: WEAPONS[item.weaponId]?.tier || 'COMMON',
          extra: { ammoInMag: item.ammoInMag, reserveAmmo: item.reserveAmmo },
        });
        this.lootItems.set(loot.id, loot);
        drops.push(loot.toSnapshot());
      } else if (slot >= 3 && item.itemId) {
        // Healing drop
        const loot = new LootItem({
          type: LOOT_ITEM_TYPES.HEALING,
          itemId: item.itemId,
          x: player.x + (Math.random() - 0.5) * 40,
          y: player.y + (Math.random() - 0.5) * 40,
          quantity: item.quantity,
          tier: 'COMMON',
        });
        this.lootItems.set(loot.id, loot);
        drops.push(loot.toSnapshot());
      }
    }
    return drops;
  }

  getAllLootSnapshots() {
    return [...this.lootItems.values()].filter(l => l.alive).map(l => l.toSnapshot());
  }
}
