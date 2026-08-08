// ============================================================
// AUDIO MANAGER — procedural WebAudio synth engine
// All SFX are synthesized at runtime (oscillators + noise), so
// no audio asset files are required. Call unlock() on the first
// user gesture to create/resume the AudioContext.
// ============================================================

const WEAPON_SOUND_MAP = {
  PISTOL: 'sfx_pistol', SMG: 'sfx_smg', SHOTGUN: 'sfx_shotgun',
  ASSAULT_RIFLE: 'sfx_ar', DMR: 'sfx_dmr', SNIPER: 'sfx_sniper',
  LMG: 'sfx_lmg', RPG: 'sfx_rpg', LEGENDARY_AR: 'sfx_ar',
  FISTS: 'sfx_melee',
};

export class AudioManager {
  constructor() {
    this.enabled = true;
    this.masterVolume = 0.8;
    this.sfxVolume = 1.0;
    this.musicVolume = 0.4;
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this._noiseBuf = null;
    this._stormNodes = null;
    this._playVol = 1;
  }

  // Create/resume the AudioContext (must be called from a user gesture)
  unlock() {
    if (typeof window === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);

      this._noiseBuf = this._makeNoise(2);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _makeNoise(seconds) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ── Synthesis primitives ──────────────────────────────────
  _noise({ delay = 0, filterType = 'lowpass', from = 1000, to = null, q = 0.7, vol = 1, attack = 0.002, decay = 0.1, dest = null } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(20, from), t0);
    if (to != null && to !== from) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + decay);
    }
    const gain = this.ctx.createGain();
    const peak = vol * this._playVol;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    src.connect(filter); filter.connect(gain); gain.connect(dest || this.sfxGain);
    src.start(t0); src.stop(t0 + decay + 0.05);
  }

  _tone({ type = 'sine', delay = 0, from = 440, to = null, dur = 0.15, vol = 1, attack = 0.005, dest = null } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, from), t0);
    if (to != null && to !== from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    }
    const gain = this.ctx.createGain();
    const peak = vol * this._playVol;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(dest || this.sfxGain);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  // ── Public API (kept compatible with the old manager) ─────
  register() { /* no-op — sounds are synthesized */ }
  registerAll() { /* no-op — sounds are synthesized */ }

  play(id, options = {}) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const fn = this._synths[id];
    if (!fn) return;
    this._playVol = options.volume ?? 1;
    fn.call(this);
    this._playVol = 1;
  }

  playWeaponFire(weaponId) {
    this.play(WEAPON_SOUND_MAP[weaponId] || 'sfx_pistol', { volume: 0.8 + Math.random() * 0.2 });
  }
  playHit(isHeadshot) { this.play(isHeadshot ? 'sfx_headshot' : 'sfx_hit'); }
  playPickup() { this.play('sfx_pickup'); }
  playReload() { this.play('sfx_reload'); }
  playFootstep() { this.play('sfx_footstep'); }
  playHeal() { this.play('sfx_heal'); }
  playHurt() { this.play('sfx_hurt'); }
  playDeath() { this.play('sfx_death'); }
  playVictory() { this.play('sfx_victory'); }
  playThunder() { this.play('sfx_thunder'); }
  playAirdrop() { this.play('sfx_airdrop'); }
  playUI() { this.play('sfx_ui'); }
  playDryFire() { this.play('sfx_dryfire'); }

  // Looping storm rumble — pass true to start, false to stop
  playStormLoop(on) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (on && !this._stormNodes) {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuf;
      src.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 85; lp.Q.value = 0.6;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.35;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 0.06;
      lfo.connect(lfoGain); lfoGain.connect(g.gain);
      src.connect(lp); lp.connect(g); g.connect(this.sfxGain);
      g.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.6);
      src.start();
      lfo.start();
      this._stormNodes = { src, lfo, g };
    } else if (!on && this._stormNodes) {
      const { src, lfo, g } = this._stormNodes;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => {
        try { src.stop(); lfo.stop(); } catch (e) { /* already stopped */ }
      }, 1600);
      this._stormNodes = null;
    }
  }

  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
  }

  setMuted(m) {
    this.enabled = !m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : this.masterVolume;
  }

  // ── Sound definitions ─────────────────────────────────────
  _synths = {
    sfx_pistol() {
      this._noise({ from: 2600, to: 350, decay: 0.09, vol: 0.9 });
      this._tone({ type: 'triangle', from: 190, to: 70, dur: 0.08, vol: 0.8 });
    },
    sfx_smg() {
      for (let i = 0; i < 3; i++) {
        this._noise({ delay: i * 0.065, from: 2400, to: 400, decay: 0.05, vol: 0.75 });
      }
      this._tone({ from: 170, to: 80, dur: 0.06, vol: 0.5, delay: 0.02 });
    },
    sfx_ar() {
      for (let i = 0; i < 4; i++) {
        this._noise({ delay: i * 0.05, from: 2200, to: 320, decay: 0.055, vol: 0.85 });
      }
      this._tone({ type: 'triangle', from: 150, to: 70, dur: 0.1, vol: 0.6 });
    },
    sfx_shotgun() {
      this._noise({ from: 1100, to: 70, decay: 0.3, vol: 1.2 });
      this._tone({ type: 'sine', from: 130, to: 40, dur: 0.35, vol: 1.1 });
    },
    sfx_sniper() {
      this._noise({ filterType: 'highpass', from: 3200, to: 1500, q: 0.5, decay: 0.16, vol: 1.1 });
      this._noise({ delay: 0.09, filterType: 'highpass', from: 2200, to: 900, decay: 0.2, vol: 0.4 });
      this._tone({ type: 'triangle', from: 240, to: 60, dur: 0.14, vol: 0.8 });
    },
    sfx_dmr() {
      this._noise({ from: 2100, to: 260, decay: 0.16, vol: 1.0 });
      this._tone({ from: 200, to: 70, dur: 0.13, vol: 0.7 });
    },
    sfx_lmg() {
      for (let i = 0; i < 5; i++) {
        this._noise({ delay: i * 0.085, from: 1800, to: 250, decay: 0.08, vol: 0.9 });
      }
      this._tone({ type: 'triangle', from: 120, to: 55, dur: 0.3, vol: 0.7 });
    },
    sfx_rpg() {
      this._noise({ filterType: 'bandpass', from: 300, to: 1400, q: 1.2, decay: 0.45, vol: 0.6 });
      this._noise({ delay: 0.42, from: 700, to: 50, decay: 0.6, vol: 1.4 });
      this._tone({ type: 'sine', delay: 0.42, from: 110, to: 30, dur: 0.6, vol: 1.2 });
    },
    sfx_melee() {
      this._noise({ filterType: 'bandpass', from: 500, to: 1200, q: 1, decay: 0.16, vol: 0.5 });
    },
    sfx_hit() {
      this._tone({ type: 'sine', from: 170, to: 70, dur: 0.12, vol: 0.7 });
      this._noise({ from: 900, to: 250, decay: 0.06, vol: 0.4 });
    },
    sfx_headshot() {
      this._tone({ type: 'square', from: 1250, to: 950, dur: 0.14, vol: 0.35 });
      this._tone({ type: 'sine', from: 180, to: 70, dur: 0.14, vol: 0.8 });
      this._noise({ from: 1000, to: 300, decay: 0.08, vol: 0.5 });
    },
    sfx_pickup() {
      this._tone({ type: 'sine', from: 520, to: 780, dur: 0.08, vol: 0.5 });
      this._tone({ type: 'sine', from: 780, to: 1180, dur: 0.1, vol: 0.5, delay: 0.09 });
    },
    sfx_reload() {
      this._noise({ filterType: 'highpass', from: 2600, to: 1800, decay: 0.035, vol: 0.7 });
      this._noise({ filterType: 'highpass', delay: 0.16, from: 3000, to: 2000, decay: 0.04, vol: 0.8 });
    },
    sfx_dryfire() {
      this._noise({ filterType: 'highpass', from: 3400, to: 2600, decay: 0.03, vol: 0.4 });
      this._tone({ type: 'square', from: 1400, to: 900, dur: 0.04, vol: 0.15 });
    },
    sfx_footstep() {
      this._noise({ from: 620, to: 180, q: 0.9, decay: 0.055, vol: 0.42 });
    },
    sfx_heal() {
      this._noise({ filterType: 'bandpass', from: 900, to: 1900, q: 2, decay: 0.5, vol: 0.28 });
      this._tone({ type: 'sine', from: 440, to: 660, dur: 0.5, vol: 0.25 });
    },
    sfx_hurt() {
      this._tone({ type: 'sawtooth', from: 230, to: 90, dur: 0.22, vol: 0.4 });
      this._noise({ from: 1200, to: 300, decay: 0.16, vol: 0.35 });
    },
    sfx_death() {
      this._tone({ type: 'sawtooth', from: 320, to: 55, dur: 0.7, vol: 0.6 });
      this._noise({ from: 1400, to: 180, decay: 0.7, vol: 0.5 });
    },
    sfx_victory() {
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((f, i) => {
        this._tone({ type: 'square', from: f, to: f, dur: 0.16, vol: 0.3, delay: i * 0.11 });
      });
      this._tone({ type: 'square', from: 1568, to: 1568, dur: 0.5, vol: 0.32, delay: notes.length * 0.11 });
    },
    sfx_thunder() {
      this._noise({ from: 320, to: 45, decay: 2.2, vol: 1.1 });
      this._noise({ delay: 0.35, from: 220, to: 40, decay: 1.6, vol: 0.8 });
    },
    sfx_airdrop() {
      this._noise({ from: 1800, to: 500, decay: 0.5, vol: 0.7 });
      this._tone({ type: 'sine', from: 300, to: 120, dur: 0.5, vol: 0.6 });
    },
    sfx_ui() {
      this._tone({ type: 'sine', from: 700, to: 900, dur: 0.06, vol: 0.3 });
    },
  };
}
