// ============================================================
// AUDIO MANAGER — Howler.js wrapper
// ============================================================

export class AudioManager {
  constructor() {
    this.sounds = {};
    this.masterVolume = 0.8;
    this.sfxVolume = 1.0;
    this.musicVolume = 0.4;
    this.enabled = true;
    this._music = null;
  }

  // Register a sound (called during asset loading)
  register(id, config) {
    // Dynamic import to avoid bundling issues when Howler isn't available
    if (typeof window === 'undefined') return;
    import('howler').then(({ Howl }) => {
      this.sounds[id] = new Howl({
        src: config.src,
        volume: (config.volume ?? 1) * this.sfxVolume * this.masterVolume,
        loop: config.loop || false,
        preload: true,
        pool: config.pool || 5,
      });
    }).catch(() => {/* no audio available */});
  }

  play(id, options = {}) {
    if (!this.enabled) return;
    const sound = this.sounds[id];
    if (!sound) return;
    const soundId = sound.play();
    if (options.volume !== undefined) sound.volume(options.volume * this.sfxVolume * this.masterVolume, soundId);
    if (options.rate !== undefined) sound.rate(options.rate, soundId);
    return soundId;
  }

  playWeaponFire(weaponId) {
    const map = {
      PISTOL: 'sfx_pistol', SMG: 'sfx_smg', SHOTGUN: 'sfx_shotgun',
      ASSAULT_RIFLE: 'sfx_ar', DMR: 'sfx_dmr', SNIPER: 'sfx_sniper',
      LMG: 'sfx_lmg', RPG: 'sfx_rpg', LEGENDARY_AR: 'sfx_ar',
      FISTS: 'sfx_melee',
    };
    this.play(map[weaponId] || 'sfx_pistol', { rate: 0.9 + Math.random() * 0.2 });
  }

  playHit(isHeadshot) {
    this.play(isHeadshot ? 'sfx_headshot' : 'sfx_hit');
  }

  playPickup() { this.play('sfx_pickup'); }
  playReload() { this.play('sfx_reload'); }
  playFootstep() { this.play('sfx_footstep', { volume: 0.3, rate: 0.8 + Math.random() * 0.4 }); }

  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
  }

  // Register all game sounds
  registerAll() {
    const sounds = [
      { id: 'sfx_pistol',   src: ['/assets/sounds/pistol.wav'],   volume: 0.7 },
      { id: 'sfx_ar',       src: ['/assets/sounds/ar.wav'],       volume: 0.8 },
      { id: 'sfx_smg',      src: ['/assets/sounds/smg.wav'],      volume: 0.7 },
      { id: 'sfx_shotgun',  src: ['/assets/sounds/shotgun.wav'],  volume: 0.9 },
      { id: 'sfx_sniper',   src: ['/assets/sounds/sniper.wav'],   volume: 1.0 },
      { id: 'sfx_dmr',      src: ['/assets/sounds/dmr.wav'],      volume: 0.9 },
      { id: 'sfx_lmg',      src: ['/assets/sounds/lmg.wav'],      volume: 0.8 },
      { id: 'sfx_rpg',      src: ['/assets/sounds/rpg.wav'],      volume: 1.0 },
      { id: 'sfx_melee',    src: ['/assets/sounds/melee.wav'],    volume: 0.7 },
      { id: 'sfx_hit',      src: ['/assets/sounds/hit.wav'],      volume: 0.6 },
      { id: 'sfx_headshot', src: ['/assets/sounds/headshot.wav'], volume: 0.8 },
      { id: 'sfx_pickup',   src: ['/assets/sounds/pickup.wav'],   volume: 0.5 },
      { id: 'sfx_reload',   src: ['/assets/sounds/reload.wav'],   volume: 0.6 },
      { id: 'sfx_footstep', src: ['/assets/sounds/footstep.wav'], volume: 0.3, pool: 8 },
    ];
    for (const s of sounds) this.register(s.id, s);
  }
}
