// ============================================================
// WEAPON DEFINITIONS
// ============================================================

export const WEAPON_TYPES = {
  HITSCAN: 'hitscan',
  PROJECTILE: 'projectile',
  MELEE: 'melee',
};

export const WEAPONS = {
  // ── PISTOLS (Common) ──────────────────────────────────────
  PISTOL: {
    id: 'PISTOL',
    name: 'Pistol',
    tier: 'COMMON',
    type: WEAPON_TYPES.HITSCAN,
    ammoType: 'LIGHT',
    damage: 28,
    headshotMultiplier: 2.0,
    fireRate: 2.5,           // shots per second
    magazineSize: 10,
    totalAmmo: 60,
    reloadTime: 1400,        // ms
    spread: 0.06,            // radians
    range: 800,
    bulletSpeed: null,       // hitscan
    recoilPattern: [0, 0.02, 0.03, 0.04, 0.05],  // vertical recoil per shot
    pellets: 1,
    color: '#aaa',
  },

  // ── SMGs (Uncommon) ───────────────────────────────────────
  SMG: {
    id: 'SMG',
    name: 'SMG',
    tier: 'UNCOMMON',
    type: WEAPON_TYPES.HITSCAN,
    ammoType: 'LIGHT',
    damage: 22,
    headshotMultiplier: 2.0,
    fireRate: 9,
    magazineSize: 25,
    totalAmmo: 150,
    reloadTime: 2200,
    spread: 0.08,
    range: 600,
    bulletSpeed: null,
    recoilPattern: [0, 0.01, 0.02, 0.03, 0.035, 0.04],
    pellets: 1,
    color: '#1eff00',
  },

  // ── Shotguns ──────────────────────────────────────────────
  SHOTGUN: {
    id: 'SHOTGUN',
    name: 'Shotgun',
    tier: 'COMMON',
    type: WEAPON_TYPES.HITSCAN,
    ammoType: 'SHOTGUN',
    damage: 20,              // per pellet
    headshotMultiplier: 1.5,
    fireRate: 1.0,
    magazineSize: 5,
    totalAmmo: 40,
    reloadTime: 600,         // per shell pump
    spread: 0.3,
    range: 300,
    bulletSpeed: null,
    recoilPattern: [0, 0.15],
    pellets: 8,
    color: '#aaa',
  },

  // ── Assault Rifles (Rare) ─────────────────────────────────
  ASSAULT_RIFLE: {
    id: 'ASSAULT_RIFLE',
    name: 'Assault Rifle',
    tier: 'RARE',
    type: WEAPON_TYPES.HITSCAN,
    ammoType: 'HEAVY',
    damage: 35,
    headshotMultiplier: 2.0,
    fireRate: 6,
    magazineSize: 30,
    totalAmmo: 180,
    reloadTime: 2500,
    spread: 0.04,
    range: 1200,
    bulletSpeed: null,
    recoilPattern: [0, 0.015, 0.025, 0.03, 0.035, 0.03, 0.025],
    pellets: 1,
    color: '#0070dd',
  },

  // ── DMR (Rare) ────────────────────────────────────────────
  DMR: {
    id: 'DMR',
    name: 'DMR',
    tier: 'RARE',
    type: WEAPON_TYPES.HITSCAN,
    ammoType: 'SNIPER',
    damage: 60,
    headshotMultiplier: 2.0,
    fireRate: 1.5,
    magazineSize: 10,
    totalAmmo: 60,
    reloadTime: 3000,
    spread: 0.01,
    range: 1800,
    bulletSpeed: null,
    recoilPattern: [0, 0.1],
    pellets: 1,
    color: '#0070dd',
  },

  // ── Sniper (Epic) ─────────────────────────────────────────
  SNIPER: {
    id: 'SNIPER',
    name: 'Bolt-Action Sniper',
    tier: 'EPIC',
    type: WEAPON_TYPES.HITSCAN,
    ammoType: 'SNIPER',
    damage: 100,
    headshotMultiplier: 2.5,
    fireRate: 0.5,
    magazineSize: 5,
    totalAmmo: 30,
    reloadTime: 4000,
    spread: 0.005,
    range: 2000,
    bulletSpeed: null,
    recoilPattern: [0, 0.3],
    pellets: 1,
    color: '#a335ee',
  },

  // ── Rocket Launcher (Legendary) ───────────────────────────
  RPG: {
    id: 'RPG',
    name: 'RPG',
    tier: 'LEGENDARY',
    type: WEAPON_TYPES.PROJECTILE,
    ammoType: 'HEAVY',
    damage: 150,
    headshotMultiplier: 1.0,
    fireRate: 0.33,
    magazineSize: 1,
    totalAmmo: 6,
    reloadTime: 5000,
    spread: 0.01,
    range: 1500,
    bulletSpeed: 400,        // px/s — projectile
    explosionRadius: 160,
    recoilPattern: [0, 0.4],
    pellets: 1,
    color: '#ff8000',
  },

  // ── LMG (Epic) ────────────────────────────────────────────
  LMG: {
    id: 'LMG',
    name: 'Light Machine Gun',
    tier: 'EPIC',
    type: WEAPON_TYPES.HITSCAN,
    ammoType: 'HEAVY',
    damage: 30,
    headshotMultiplier: 2.0,
    fireRate: 10,
    magazineSize: 75,
    totalAmmo: 300,
    reloadTime: 5500,
    spread: 0.07,
    range: 900,
    bulletSpeed: null,
    recoilPattern: [0, 0.01, 0.02, 0.025, 0.03],
    pellets: 1,
    color: '#a335ee',
  },

  // ── Legendary AR ─────────────────────────────────────────
  LEGENDARY_AR: {
    id: 'LEGENDARY_AR',
    name: 'Legendary Assault Rifle',
    tier: 'LEGENDARY',
    type: WEAPON_TYPES.HITSCAN,
    ammoType: 'HEAVY',
    damage: 45,
    headshotMultiplier: 2.0,
    fireRate: 7,
    magazineSize: 35,
    totalAmmo: 210,
    reloadTime: 2000,
    spread: 0.02,
    range: 1500,
    bulletSpeed: null,
    recoilPattern: [0, 0.01, 0.018, 0.022, 0.025],
    pellets: 1,
    color: '#ff8000',
  },

  // ── Melee ─────────────────────────────────────────────────
  FISTS: {
    id: 'FISTS',
    name: 'Fists',
    tier: 'COMMON',
    type: WEAPON_TYPES.MELEE,
    ammoType: null,
    damage: 20,
    headshotMultiplier: 1.5,
    fireRate: 1.5,
    magazineSize: Infinity,
    totalAmmo: Infinity,
    reloadTime: 0,
    spread: 0,
    range: 60,
    bulletSpeed: null,
    recoilPattern: [],
    pellets: 1,
    color: '#aaa',
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

// Get random weapon by tier weights
export function getRandomWeaponForTier(tier) {
  const filtered = WEAPON_IDS.filter(id => WEAPONS[id].tier === tier && id !== 'FISTS');
  if (filtered.length === 0) return 'PISTOL';
  return filtered[Math.floor(Math.random() * filtered.length)];
}
