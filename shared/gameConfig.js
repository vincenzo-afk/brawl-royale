// ============================================================
// GAME CONFIG — tunable balance parameters
// ============================================================

export const GAME_CONFIG = {
  // Match settings
  match: {
    lobbyCountdown: 15,     // seconds to wait after min players reached
    maxLobbyWait: 90,       // max seconds to wait for full lobby
    gracePeriod: 10,        // seconds at match start (no storm, no damage)
  },

  // Movement
  movement: {
    baseSpeed: 160,
    sprintSpeed: 240,
    crouchSpeed: 80,
    swimSpeed: 80,
    aimWalkSpeed: 100,      // speed while ADS
  },

  // Combat
  combat: {
    maxHitscanRange: 2000,
    headshotMultiplier: 2.0,
    friendlyFire: false,
    respawnEnabled: false,
  },

  // Loot
  loot: {
    groundLootDensity: 0.04,   // loot items per tile (average)
    chestLootItems: 3,
    airdropLootItems: 5,
    maxGroundLootItems: 800,
  },

  // Audio
  audio: {
    masterVolume: 0.8,
    sfxVolume: 1.0,
    musicVolume: 0.4,
    maxHearingDistance: 600,   // px — beyond this, sounds fade to 0
  },

  // Rendering
  rendering: {
    viewportWidth: 1280,
    viewportHeight: 720,
    minZoom: 0.5,
    maxZoom: 2.0,
    defaultZoom: 1.0,
    minimapSize: 200,         // px, square
    minimapOpacity: 0.85,
  },

  // Network
  network: {
    reconnectAttempts: 5,
    reconnectDelayMs: 1000,
    pingInterval: 5000,
    latencyWarningMs: 150,
    latencyCriticalMs: 300,
  },
};
