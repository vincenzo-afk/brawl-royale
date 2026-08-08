// ============================================================
// SERVER-SIDE LOOT ENTITY
// ============================================================
import { v4 as uuidv4 } from 'uuid';
import { LOOT_TIERS } from 'battle-royale-shared';

export const LOOT_ITEM_TYPES = {
  WEAPON: 'weapon',
  AMMO: 'ammo',
  HEALING: 'healing',
  ARMOR: 'armor',
  SHIELD: 'shield',
};

export class LootItem {
  constructor({ type, itemId, x, y, quantity = 1, tier = 'COMMON', extra = {} }) {
    this.id = uuidv4();
    this.type = type;
    this.itemId = itemId;    // weapon id, ammo type, healing type, armor tier, etc.
    this.x = x;
    this.y = y;
    this.quantity = quantity;
    this.tier = tier;
    this.extra = extra;      // weapon: { ammoInMag, reserveAmmo }
    this.alive = true;
    this.radius = 20;
  }

  pickup() {
    this.alive = false;
  }

  toSnapshot() {
    return {
      id: this.id,
      type: this.type,
      itemId: this.itemId,
      x: Math.round(this.x),
      y: Math.round(this.y),
      quantity: this.quantity,
      tier: this.tier,
      extra: this.extra,
    };
  }
}



