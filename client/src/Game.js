// ============================================================
// GAME — main game loop + state machine
// ============================================================
import { S2C, CLIENT_TICK_RATE } from 'battle-royale-shared';
import { Renderer } from './engine/Renderer.js';
import { Camera } from './engine/Camera.js';
import { InputHandler } from './engine/InputHandler.js';
import { Prediction } from './network/Prediction.js';
import { Reconciliation } from './network/Reconciliation.js';
import { Interpolation } from './network/Interpolation.js';
import { HUD } from './ui/HUD.js';
import { Minimap } from './ui/Minimap.js';
import { DeathScreen } from './ui/DeathScreen.js';

export const GAME_STATE = {
  IDLE: 'idle',
  PLAYING: 'playing',
  DEAD: 'dead',
  SPECTATING: 'spectating',
  ENDED: 'ended',
};

export class Game {
  constructor(network, audioManager) {
    this.network = network;
    this.audio = audioManager;

    // Canvas setup
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);
    this.camera = new Camera(window.innerWidth, window.innerHeight);
    this.input = new InputHandler(this.canvas);

    // Networking
    this.prediction = new Prediction();
    this.reconciliation = new Reconciliation(this.prediction);
    this.interpolation = new Interpolation();

    // UI
    this.hud = new HUD();
    this.minimap = new Minimap();
    this.deathScreen = new DeathScreen();

    // Game state
    this.state = GAME_STATE.IDLE;
    this.localPlayerId = null;
    this.localPlayer = null;        // local player state (with prediction)
    this.players = new Map();       // all players (authoritative state)
    this.lootItems = new Map();     // lootId → item
    this.projectiles = new Map();   // projId → { x, y, angle, weaponId }
    this.storm = null;
    this.mapData = null;
    this.spectatingId = null;
    this.spawnTime = 0;
    this.placementRank = null;

    // Loop
    this._raf = null;
    this._inputInterval = null;
    this._lastFrameTime = 0;
    this._inputTick = 0;
    this._airdropIndicators = [];

    this._setupNetworkHandlers();
    this._setupResizeHandler();
    this._setupDeathScreenButtons();
  }

  // ── Network handlers ──────────────────────────────────────
  _setupNetworkHandlers() {
    const net = this.network;

    net.on(S2C.MATCH_START, (data) => this._onMatchStart(data));
    net.on(S2C.GAME_STATE, (data) => this._onGameState(data));
    net.on(S2C.PLAYER_JOINED, (p) => this._onPlayerJoined(p));
    net.on(S2C.PLAYER_LEFT, ({ playerId }) => this._onPlayerLeft(playerId));
    net.on(S2C.PLAYER_DIED, (data) => this._onPlayerDied(data));
    net.on(S2C.HIT_CONFIRM, (data) => this._onHitConfirm(data));
    net.on(S2C.KILL_FEED, (data) => this.hud.addKillEntry(data.killer, data.victim, data.weapon, data.isHeadshot));
    net.on(S2C.STORM_UPDATE, (data) => { this.storm = data; });
    net.on(S2C.PLAYER_COUNT, ({ alive, total }) => this.hud.updatePlayerCount(alive, total));
    net.on(S2C.LOOT_SPAWN, ({ items }) => items?.forEach(l => this.lootItems.set(l.id, l)));
    net.on(S2C.LOOT_PICKUP, ({ lootId }) => this.lootItems.delete(lootId));
    net.on(S2C.PROJECTILE_SPAWN, (proj) => this.projectiles.set(proj.id, proj));
    net.on(S2C.PROJECTILE_DESTROY, ({ id }) => this.projectiles.delete(id));
    net.on(S2C.MATCH_END, (data) => this._onMatchEnd(data));
    net.on(S2C.PLACEMENT, (data) => { this.placementRank = data; });
    net.on(S2C.PONG, (data) => {
      net.handlePong(data);
      this.hud.updatePing(net.latency);
    });
    net.on(S2C.AIRDROP_INCOMING, (data) => {
      this._airdropIndicators.push({ ...data, until: Date.now() + data.eta + 5000 });
    });
    net.on(S2C.PLAYER_SPECTATING, ({ targetId }) => {
      this.spectatingId = targetId;
    });
  }

  // ── Match start ───────────────────────────────────────────
  _onMatchStart(data) {
    this.state = GAME_STATE.PLAYING;
    this.spawnTime = Date.now();
    this.players.clear();
    this.lootItems.clear();
    this.projectiles.clear();
    this.interpolation.reset();
    this.prediction.reset();
    this._airdropIndicators = [];

    // Init all players
    for (const p of (data.players || [])) {
      this.players.set(p.id, { ...p });
      if (p.id !== this.localPlayerId) {
        this.interpolation.addSnapshot(p.id, p, Date.now());
      }
    }

    // Init loot
    for (const item of (data.loot || [])) {
      this.lootItems.set(item.id, item);
    }

    this.storm = data.storm;
    this.localPlayer = { ...this.players.get(this.localPlayerId) };

    // Center camera on spawn
    if (this.localPlayer) {
      this.camera.x = this.localPlayer.x;
      this.camera.y = this.localPlayer.y;
    }

    this.input.enable();
    this._startLoop();
  }

  // ── Delta state from server ───────────────────────────────
  _onGameState(data) {
    if (!data || !data.players) return;
    const now = data.serverTime || Date.now();

    for (const delta of data.players) {
      const existing = this.players.get(delta.id);
      if (existing) {
        Object.assign(existing, delta);
      } else {
        this.players.set(delta.id, delta);
      }

      if (delta.id === this.localPlayerId) {
        // Reconcile local player
        if (this.localPlayer) {
          this.reconciliation.reconcile(
            this.localPlayer,
            delta,
            (player, input) => this.prediction.applyInput(player, input)
          );
          // Update health/shield from server
          if (delta.health !== undefined) this.localPlayer.health = delta.health;
          if (delta.shield !== undefined) this.localPlayer.shield = delta.shield;
          if (delta.alive === false) this.localPlayer.alive = false;
          if (delta.inventory !== undefined) this.localPlayer.inventory = delta.inventory;
          if (delta.activeSlot !== undefined) this.localPlayer.activeSlot = delta.activeSlot;
        }
      } else {
        // Feed into interpolation buffer
        this.interpolation.addSnapshot(delta.id, { ...this.players.get(delta.id) }, now);
      }
    }
  }

  _onPlayerJoined(p) {
    this.players.set(p.id, p);
    this.interpolation.addSnapshot(p.id, p, Date.now());
  }

  _onPlayerLeft(playerId) {
    this.players.delete(playerId);
    this.interpolation.removeEntity(playerId);
  }

  _onPlayerDied({ playerId, killerId, weapon }) {
    const p = this.players.get(playerId);
    if (p) { p.alive = false; this.players.set(playerId, p); }

    if (playerId === this.localPlayerId) {
      this.state = GAME_STATE.DEAD;
      this.localPlayer.alive = false;
      const killerPlayer = this.players.get(killerId);
      const survival = Math.round((Date.now() - this.spawnTime) / 1000);
      this.deathScreen.show(
        this.placementRank?.rank || '?',
        this.localPlayer?.kills || 0,
        this.localPlayer?.damageDealt || 0,
        survival,
        killerPlayer?.name || 'Storm'
      );
      this.deathScreen.setSpectatePlayers([...this.players.values()]);

      // Auto-spectate killer
      if (killerId) this.spectatingId = killerId;
    }

    this.interpolation.removeEntity(playerId);
  }

  _onHitConfirm({ damage, isHeadshot, killed }) {
    this.hud.showHitMarker();
    if (damage > 0) {
      this.camera.shake(isHeadshot ? 5 : 3);
      this.audio.playHit(isHeadshot);
    }
  }

  _onMatchEnd(data) {
    this.state = GAME_STATE.ENDED;
    const isWin = data.winnerId === this.localPlayerId;

    document.getElementById('end-title').textContent = isWin ? '🏆 VICTORY ROYALE' : 'MATCH ENDED';
    document.getElementById('end-winner').textContent = `Winner: ${data.winnerName || 'Nobody'}`;

    const stats = this.localPlayer;
    document.getElementById('end-stats').innerHTML = `
      <div>Kills: <strong>${stats?.kills || 0}</strong></div>
      <div>Damage: <strong>${stats?.damageDealt || 0}</strong></div>
      <div>Duration: <strong>${data.stats?.duration || 0}s</strong></div>
    `;

    document.getElementById('match-end-screen').classList.remove('hidden');
    this._stopLoop();
    this.input.disable();
  }

  // ── Input loop (60Hz) ─────────────────────────────────────
  _startInputLoop() {
    const dt = 1 / CLIENT_TICK_RATE;
    this._inputInterval = setInterval(() => {
      if (this.state !== GAME_STATE.PLAYING) return;
      if (!this.localPlayer?.alive) return;

      const seq = this.prediction.nextSeq();
      const flags = this.input.getFlags();
      const angle = this.input.getAimAngle();
      const switchSlot = this.input.getSlotSwitch();

      const input = { seq, flags, angle, dt, switchSlot };

      // Apply locally (prediction)
      this.prediction.applyInput(this.localPlayer, input);
      this.prediction.saveInput(input);

      // Send to server
      this.network.sendInput(input);

      // Update HUD
      this._updateHUD();

      // Zoom from mouse wheel
      const wheel = this.input.consumeWheel();
      if (wheel !== 0) this.camera.adjustZoom(wheel);

      this._inputTick++;
    }, 1000 / CLIENT_TICK_RATE);
  }

  _updateHUD() {
    const p = this.localPlayer;
    if (!p) return;
    this.hud.updateHealth(p.health, p.maxHealth || 100, p.shield, p.maxShield || 100);
    this.hud.updateArmor(p.armor?.helmet || 0, p.armor?.vest || 0);

    const activeWeapon = p.inventory?.[p.activeSlot];
    this.hud.updateAmmo(
      activeWeapon?.ammoInMag ?? '∞',
      activeWeapon?.reserveAmmo ?? '∞'
    );
    this.hud.updateInventory(p.inventory || {}, p.activeSlot);

    if (this.storm) {
      this.hud.updateStormTimer(this.storm.timeToNextShrink || 0);
    }
  }

  // ── Render loop ───────────────────────────────────────────
  _startLoop() {
    this._startInputLoop();
    const loop = (timestamp) => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (timestamp - this._lastFrameTime) / 1000);
      this._lastFrameTime = timestamp;
      this._render(dt, timestamp);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stopLoop() {
    cancelAnimationFrame(this._raf);
    clearInterval(this._inputInterval);
  }

  _render(dt, now) {
    const ctx = this.renderer.ctx;
    const canvas = this.renderer.canvas;

    // Determine camera target
    let camTarget = this.localPlayer;
    if (this.state === GAME_STATE.DEAD || this.state === GAME_STATE.SPECTATING) {
      camTarget = this.players.get(this.spectatingId) || camTarget;
    }

    if (camTarget) {
      this.camera.follow(camTarget.x, camTarget.y, dt);
    }

    this.renderer.clear();

    // Apply camera transform
    this.camera.begin(ctx);

    // Draw map
    if (this.mapData) {
      this.renderer.drawMap(this.mapData);
    } else {
      this.renderer.drawBackground();
    }

    // Draw loot
    for (const item of this.lootItems.values()) {
      this.renderer.drawLootItem(item, now);
    }

    // Draw projectiles
    for (const proj of this.projectiles.values()) {
      this.renderer.drawProjectile(proj);
    }

    // Draw remote players (interpolated)
    for (const [id, player] of this.players) {
      if (id === this.localPlayerId) continue;
      const interpState = this.interpolation.getInterpolatedState(id, now);
      if (interpState) {
        this.renderer.drawPlayer({ ...player, ...interpState }, false);
      }
    }

    // Draw local player (predicted)
    if (this.localPlayer && (this.state === GAME_STATE.PLAYING)) {
      this.renderer.drawPlayer(this.localPlayer, true);
    }

    // Draw storm
    if (this.storm) {
      this.renderer.drawStorm(this.storm);
    }

    // Draw effects
    this.renderer.drawEffects(now);

    // Airdrops
    for (const ad of this._airdropIndicators) {
      if (now < ad.until) this.renderer.drawAirdropIndicator(ad.x, ad.y, now);
    }
    this._airdropIndicators = this._airdropIndicators.filter(a => now < a.until);

    // End camera transform
    this.camera.end(ctx);

    // Minimap (outside camera transform)
    const remotePlayers = [...this.players.values()].filter(p => p.id !== this.localPlayerId);
    this.minimap.render(this.localPlayer, remotePlayers, this.storm);
  }

  // ── Resize ────────────────────────────────────────────────
  _setupResizeHandler() {
    const onResize = () => {
      this.renderer.resize(window.innerWidth, window.innerHeight);
      this.camera.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    onResize();
  }

  // ── Death screen buttons ──────────────────────────────────
  _setupDeathScreenButtons() {
    document.getElementById('btn-spectate-next')?.addEventListener('click', () => {
      this.deathScreen.spectateNext();
    });
    document.getElementById('btn-spectate-prev')?.addEventListener('click', () => {
      this.deathScreen.spectatePrev();
    });
    this.deathScreen.onSpectateChange = (target) => {
      if (target) this.spectatingId = target.id;
    };
  }

  setLocalPlayerId(id) {
    this.localPlayerId = id;
  }

  destroy() {
    this._stopLoop();
    this.input.disable();
  }
}
