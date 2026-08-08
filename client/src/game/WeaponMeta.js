// ============================================================
// CLIENT WEAPON META — mirrors the server weapon definitions
// enough for sound gating, tracer length and melee detection.
// ============================================================

export const WEAPON_META = {
  FISTS:         { kind: 'melee',   fireRate: 1.5, sound: 'sfx_melee',   range: 60,   projectile: false },
  PISTOL:        { kind: 'pistol',  fireRate: 2.5, sound: 'sfx_pistol',  range: 800,  projectile: false },
  SMG:           { kind: 'smg',     fireRate: 9,   sound: 'sfx_smg',     range: 600,  projectile: false },
  SHOTGUN:       { kind: 'shotgun', fireRate: 1.0, sound: 'sfx_shotgun', range: 300,  projectile: false },
  ASSAULT_RIFLE: { kind: 'rifle',   fireRate: 6,   sound: 'sfx_ar',      range: 1200, projectile: false },
  DMR:           { kind: 'dmr',     fireRate: 1.5, sound: 'sfx_dmr',     range: 1800, projectile: false },
  SNIPER:        { kind: 'sniper',  fireRate: 0.5, sound: 'sfx_sniper',  range: 2000, projectile: false },
  RPG:           { kind: 'rpg',     fireRate: 0.33, sound: 'sfx_rpg',    range: 1500, projectile: true },
  LMG:           { kind: 'lmg',     fireRate: 10,  sound: 'sfx_lmg',     range: 900,  projectile: false },
  LEGENDARY_AR:  { kind: 'rifle',   fireRate: 7,   sound: 'sfx_ar',      range: 1500, projectile: false },
};
