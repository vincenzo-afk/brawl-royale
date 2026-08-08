// ============================================================
// SHARED CONSTANTS — used by both client and server
// ============================================================

// Tick rates
export const SERVER_TICK_RATE = 20;          // Hz — authoritative server
export const CLIENT_TICK_RATE = 60;          // Hz — input send rate
export const INTERPOLATION_DELAY_MS = 100;   // ms — remote entity render delay
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE; // 50ms

// Map
export const MAP_WIDTH = 4096;
export const MAP_HEIGHT = 4096;
export const TILE_SIZE = 32;
export const MAP_TILES_X = MAP_WIDTH / TILE_SIZE;   // 128
export const MAP_TILES_Y = MAP_HEIGHT / TILE_SIZE;  // 128

// Player
export const PLAYER_RADIUS = 16;
export const PLAYER_BASE_SPEED = 160;         // px/s
export const PLAYER_SPRINT_MULTIPLIER = 1.5;
export const PLAYER_CROUCH_MULTIPLIER = 0.5;
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_MAX_SHIELD = 100;
export const PLAYER_SHIELD_REGEN_DELAY = 5000; // ms after last damage

// Armor tiers
export const ARMOR_TIERS = {
  1: { headReduction: 0.15, bodyReduction: 0.15 },
  2: { headReduction: 0.25, bodyReduction: 0.25 },
  3: { headReduction: 0.40, bodyReduction: 0.40 },
};

export const HEADSHOT_MULTIPLIER = 2.0;

// Storm phases
export const STORM_PHASES = [
  { phase: 0, radiusFraction: 1.0,  waitMs: 0,      shrinkMs: 0,     damage: 0   },
  { phase: 1, radiusFraction: 0.80, waitMs: 60000,   shrinkMs: 30000, damage: 5   },
  { phase: 2, radiusFraction: 0.60, waitMs: 60000,   shrinkMs: 30000, damage: 10  },
  { phase: 3, radiusFraction: 0.40, waitMs: 45000,   shrinkMs: 30000, damage: 15  },
  { phase: 4, radiusFraction: 0.20, waitMs: 45000,   shrinkMs: 30000, damage: 20  },
  { phase: 5, radiusFraction: 0.05, waitMs: 30000,   shrinkMs: 30000, damage: 25  },
  { phase: 6, radiusFraction: 0.00, waitMs: 20000,   shrinkMs: 20000, damage: 40  },
];

// Lobby sizes
export const GAME_MODES = {
  SOLO:  { teamSize: 1, maxPlayers: 64,  minToStart: 2  },
  DUO:   { teamSize: 2, maxPlayers: 64,  minToStart: 4  },
  SQUAD: { teamSize: 4, maxPlayers: 64,  minToStart: 8  },
};

// Loot tiers
export const LOOT_TIERS = {
  COMMON:    { color: '#aaaaaa', dropWeight: 50 },
  UNCOMMON:  { color: '#1eff00', dropWeight: 30 },
  RARE:      { color: '#0070dd', dropWeight: 15 },
  EPIC:      { color: '#a335ee', dropWeight: 4  },
  LEGENDARY: { color: '#ff8000', dropWeight: 1  },
};

// Inventory slots
export const INVENTORY_SLOTS = {
  PRIMARY_1: 0,
  PRIMARY_2: 1,
  MELEE: 2,
  HEALING_1: 3,
  HEALING_2: 4,
  HEALING_3: 5,
  AMMO_LIGHT: 6,
  AMMO_HEAVY: 7,
  AMMO_SHOTGUN: 8,
  AMMO_SNIPER: 9,
};

// Ammo types
export const AMMO_TYPES = {
  LIGHT:   'LIGHT',
  HEAVY:   'HEAVY',
  SHOTGUN: 'SHOTGUN',
  SNIPER:  'SNIPER',
};

// Healing items
export const HEALING_ITEMS = {
  BANDAGE:   { name: 'Bandage',   healAmount: 15,  healTime: 4000, maxHealth: 75,  stackSize: 5  },
  MED_KIT:   { name: 'Med Kit',   healAmount: 100, healTime: 8000, maxHealth: 100, stackSize: 1  },
  SHIELD_SMALL: { name: 'Small Shield', shieldAmount: 25, healTime: 3000, maxShield: 50, stackSize: 3 },
  SHIELD_BIG:   { name: 'Big Shield',  shieldAmount: 50, healTime: 5000, maxShield: 100, stackSize: 1 },
};

// ELO
export const ELO_DEFAULT = 1000;
export const ELO_K_FACTOR = 32;
export const ELO_MATCH_RANGE_INITIAL = 200;
export const ELO_MATCH_RANGE_EXPAND_MS = 30000; // expand every 30s
export const ELO_MATCH_RANGE_STEP = 100;

// Networking
export const MAX_INPUT_BUFFER = 120;   // max unacked inputs stored client-side
export const STATE_SNAPSHOT_HISTORY = 10; // server snapshots to keep for reconciliation

// Physics
export const WORLD_GRAVITY = 0;        // top-down, no gravity
export const MAX_VELOCITY = 400;       // px/s cap

// Airdrops
export const AIRDROP_INTERVAL_MS = 120000; // every 2 min
export const AIRDROP_RADIUS = 64;

// Kill feed
export const KILL_FEED_DURATION_MS = 5000;
export const KILL_FEED_MAX = 5;
