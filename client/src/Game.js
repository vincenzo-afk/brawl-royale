// ============================================================
// GAME — main game loop + state machine (3D)
// ============================================================
import { S2C, CLIENT_TICK_RATE, TileMap, INPUT_FLAGS, HEALING_ITEMS, MAP_WIDTH, MAP_HEIGHT } from 'battle-royale-shared';
import { WEAPON_META } from './game/WeaponMeta.js';
import { DayNightCycle } from './game/DayNightCycle.js';
import { ThreeRenderer } from './engine/ThreeRenderer.js';
import { Camera3D } from './engine/Camera3D.js';
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

    // 3D engine setup
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new ThreeRenderer(this.canvas);
    this.camera = new Camera3D();
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
    this.tileMap = null;          // shared collision grid (from server map)
    this.spectatingId = null;
    this.spawnTime = 0;
    this.placementRank = null;
    this._reloadShown = false;
    this._lastFireTime = 0;
    this._lastFootstep = 0;
    this._prevHeal = false;
    this._wasAds = false;
    this._lastLightning = 0;
    this._lastStormGust = 0;
    this._stormGustInterval = 0;
    this._victoryFrames = 0;
    this._fireflyAcc = 0;
    this._lastDayNightLabel = null;
    this.dayNight = new DayNightCycle();
    this._preAdsZoom = null;

    // Loop
    this._raf = null;
    this._inputInterval = null;
    this._lastFrameTime = 0;
    this._inputTick = 0;
    this._airdropIndicators = [];

    this._setupNetworkHandlers();
    this._setupResizeHandler();
    this._setupDeathScreenButtons();
    this._setupPointerLock();
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
    net.on(S2C.LOOT_PICKUP, (data) => {
      this.lootItems.delete(data?.lootId);
      if (data?.playerId === this.localPlayerId) this.audio.playPickup();
    });
    net.on(S2C.PROJECTILE_SPAWN, (proj) => this.projectiles.set(proj.id, proj));
    net.on(S2C.PROJECTILE_DESTROY, ({ id }) => {
      const proj = this.projectiles.get(id);
      if (proj?.weaponId === 'RPG') this.renderer.addExplosion(proj.x, proj.y);
      this.projectiles.delete(id);
    });
    net.on(S2C.MATCH_END, (data) => this._onMatchEnd(data));
    net.on(S2C.PLACEMENT, (data) => { this.placementRank = data; });
    net.on(S2C.PONG, (data) => {
      net.handlePong(data);
      this.hud.updatePing(net.latency);
    });
    net.on(S2C.AIRDROP_INCOMING, (data) => {
      this._airdropIndicators.push({ ...data, until: Date.now() + data.eta + 5000 });
    });
    net.on(S2C.AIRDROP_LANDED, () => {
      this.audio.playAirdrop();
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
    this._reloadShown = false;
    this.renderer.resetEntities();

    // Build the local collision grid + 3D world from the server map
    this._applyMap(data.map);

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

    // Point the camera at the spawn + aim direction
    if (this.localPlayer) {
      this.camera.reset();
      this.camera.snapYaw(this.localPlayer.angle || 0);
      this.camera.targetX = this.localPlayer.x;
      this.camera.targetY = this.localPlayer.y;
      this.input.cameraYaw = this.camera.yaw;
    }

    this.input.enable();
    this._requestPointerLock();
    this._startLoop();
  }

  _applyMap(mapPayload) {
    if (!mapPayload) return;
    this.tileMap = TileMap.fromServerData(mapPayload);
    this.prediction.setMap(this.tileMap);
    this.mapData = {
      tilesX: mapPayload.tilesX,
      tilesY: mapPayload.tilesY,
      tileSize: mapPayload.tileSize,
      ground: this.tileMap.ground,
      collision: this.tileMap.collision,
      pois: mapPayload.pois || [],
    };
    // Build the 3D terrain (idempotent)
    this.renderer.buildWorld(this.mapData);
  }

  // ── Delta state from server ───────────────────────────────
  _onGameState(data) {
    if (!data || !data.players) return;
    const now = data.serverTime || Date.now();

    // Full states (late joins) carry the map — apply it if we don't have one
    if (data.type === 'full' && data.map && !this.tileMap) {
      this._applyMap(data.map);
    }

    for (const delta of data.players) {
      const existing = this.players.get(delta.id);
      if (existing) {
        Object.assign(existing, delta);
      } else {
        this.players.set(delta.id, delta);
      }

      if (delta.id === this.localPlayerId) {
        if (this.localPlayer) {
          // Reconcile: snap to server position only on real discrepancy,
          // then re-apply unacked inputs. Do NOT hard-override the
          // predicted position every frame — that caused rubber-banding.
          if (delta.x !== undefined && delta.y !== undefined) {
            this.reconciliation.reconcile(
              this.localPlayer,
              delta,
              (player, input) => this.prediction.applyInput(player, input)
            );
          } else if (delta.lastProcessedInput !== undefined) {
            // Position unchanged — still acknowledge processed inputs
            this.prediction.acknowledgeInput(delta.lastProcessedInput);
          }

          // Sync state from server + damage feedback
          if (delta.health !== undefined) {
            if (delta.health < this.localPlayer.health) {
              this._flashDamage();
              this.audio.playHurt();
              this.camera.shake(2.5);
            }
            this.localPlayer.health = delta.health;
          }
          if (delta.shield !== undefined) this.localPlayer.shield = delta.shield;
          if (delta.alive === false) this.localPlayer.alive = false;
          if (delta.inventory !== undefined) this.localPlayer.inventory = delta.inventory;
          if (delta.activeSlot !== undefined) this.localPlayer.activeSlot = delta.activeSlot;
          if (delta.isReloading !== undefined) this.localPlayer.isReloading = delta.isReloading;
          if (delta.isHealing !== undefined) this.localPlayer.isHealing = delta.isHealing;
          if (delta.angle !== undefined && delta.x === undefined) this.localPlayer.angle = delta.angle;
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
    if (p) {
      p.alive = false;
      this.players.set(playerId, p);
      this.renderer.addBloodPool(p.x, p.y);
    }

    if (playerId === this.localPlayerId) {
      this.state = GAME_STATE.DEAD;
      this.localPlayer.alive = false;
      this.audio.playDeath();
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

  _onHitConfirm({ targetId, damage, isHeadshot, killed }) {
    this.hud.showHitMarker();
    if (damage > 0) {
      this.camera.shake(isHeadshot ? 5 : 3);
      this.audio.playHit(isHeadshot);
    }

    // Floating damage number + impact sparks over the target
    if (targetId) {
      const t = this.interpolation.getInterpolatedState(targetId, Date.now()) || this.players.get(targetId);
      if (t) {
        this.renderer.addDamageNumber(t.x, t.y, damage, isHeadshot, killed);
        this.renderer.addImpact(t.x, t.y, isHeadshot);
        if (killed) this.renderer.addBloodPool(t.x, t.y);
      }
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

    // Stop any lingering storm rumble
    this.audio.playStormLoop(false);

    if (isWin && this.localPlayer) {
      // Victory celebration: confetti over the map before the end screen
      this.audio.playVictory();
      this._victoryFrames = 115; // ~1.9s
      setTimeout(() => {
        document.getElementById('match-end-screen').classList.remove('hidden');
        this._stopLoop();
        this.input.disable();
      }, 1900);
    } else {
      document.getElementById('match-end-screen').classList.remove('hidden');
      this._stopLoop();
      this.input.disable();
    }
  }

  // ── Pointer lock ──────────────────────────────────────────
  _setupPointerLock() {
    this.canvas.addEventListener('click', () => this._requestPointerLock());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      this.input.pointerLocked = locked;
      const overlay = document.getElementById('pointer-lock-overlay');
      if (overlay) {
        overlay.classList.toggle('hidden', locked || this.state !== GAME_STATE.PLAYING);
      }
    });
  }

  _requestPointerLock() {
    if (this.state !== GAME_STATE.PLAYING) return;
    if (document.pointerLockElement !== this.canvas) {
      // Chrome returns a promise that rejects if the call lacks a user gesture
      const p = this.canvas.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }

  // ── Input loop (60Hz) ─────────────────────────────────────
  _startInputLoop() {
    const dt = 1 / CLIENT_TICK_RATE;
    this._inputInterval = setInterval(() => {
      if (this.state !== GAME_STATE.PLAYING) return;
      if (!this.localPlayer?.alive) return;
      const now = Date.now();

      const seq = this.prediction.nextSeq();
      const flags = this.input.getFlags();
      const angle = this.camera.yaw;                 // aim = camera yaw
      const switchSlot = this.input.getSlotSwitch();
      const { moveX, moveY } = this.input.getMoveVector();

      const input = { seq, flags, angle, dt, switchSlot, moveX, moveY };

      // Apply locally (prediction)
      this.prediction.applyInput(this.localPlayer, input);
      this.prediction.saveInput(input);

      // Local weapon switch (instant feedback, server confirms)
      if (switchSlot >= 0 && this.localPlayer.inventory?.[switchSlot]) {
        this.localPlayer.activeSlot = switchSlot;
      }

      // Firing: muzzle flash + tracer + sound, gated by weapon fire rate
      if ((flags & INPUT_FLAGS.FIRE) && !this.localPlayer.isReloading) {
        const aw = this.localPlayer.inventory?.[this.localPlayer.activeSlot];
        const wid = aw?.weaponId || 'FISTS';
        const meta = WEAPON_META[wid] || WEAPON_META.FISTS;
        const a = this.localPlayer.angle;
        const cooldown = Math.max(40, (1000 / (meta.fireRate || 1)) - 15);

        if (now - this._lastFireTime >= cooldown) {
          this._lastFireTime = now;
          const mx = this.localPlayer.x + Math.cos(a) * 34;
          const my = this.localPlayer.y + Math.sin(a) * 34;

          // Empty magazine → dry-fire click, no muzzle flash
          if (wid !== 'FISTS' && (aw?.ammoInMag ?? Infinity) <= 0) {
            this.audio.playDryFire();
          } else {
            this.renderer.addMuzzleFlash(this.localPlayer.x, this.localPlayer.y, a, wid);
            this.audio.playWeaponFire(wid);
            this.camera.shake(0.5);

            // Hitscan tracer that stops at walls
            if (wid !== 'FISTS' && !meta.projectile) {
              const end = this._raycastWall(mx, my, a, meta.range || 800);
              this.renderer.addBulletTrace(mx, my, end.x, end.y);
            }
          }
        }
      }

      // Footsteps + dust while moving
      const moving = Math.hypot(moveX, moveY) > 0.05;
      if (moving) {
        const speedFactor = (flags & INPUT_FLAGS.SPRINT) && !(flags & (INPUT_FLAGS.CROUCH | INPUT_FLAGS.ADS))
          ? 0.62 : (flags & (INPUT_FLAGS.CROUCH | INPUT_FLAGS.ADS)) ? 1.7 : 1;
        if (now - this._lastFootstep > 300 * speedFactor) {
          this._lastFootstep = now;
          this.audio.playFootstep();
          const backX = this.localPlayer.x - Math.cos(this.localPlayer.angle) * 8;
          this.renderer.addDust(backX, this.localPlayer.y);
        }
      }

      // Dynamic crosshair
      document.body.classList.toggle('moving', moving);
      document.body.classList.toggle('firing', !!(flags & INPUT_FLAGS.FIRE));

      // ADS — camera FOV zoom + overlay
      if (this.input.rightMouseDown) {
        if (!this._wasAds) this._wasAds = true;
        this.camera.setAds(true);
      } else if (this._wasAds) {
        this._wasAds = false;
        this.camera.setAds(false);
      }
      document.body.classList.toggle('ads', this.input.rightMouseDown);

      // Send to server
      this.network.sendInput(input);

      // Update HUD
      this._updateHUD();

      // Camera distance from mouse wheel
      const wheel = this.input.consumeWheel();
      if (wheel !== 0) this.camera.adjustDistance(wheel);

      this._inputTick++;
    }, 1000 / CLIENT_TICK_RATE);
  }

  _raycastWall(x, y, angle, range) {
    const step = 16;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let px = x, py = y, d = 0;
    while (d < range) {
      px += cos * step;
      py += sin * step;
      d += step;
      if (px < 0 || py < 0 || px > MAP_WIDTH || py > MAP_HEIGHT) break;
      if (this.tileMap?.isSolidAt(px, py)) break;
    }
    return { x: px, y: py };
  }

  _updateHUD() {
    const p = this.localPlayer;
    if (!p) return;
    this.hud.updateHealth(p.health, p.maxHealth || 100, p.shield, p.maxShield || 100);
    this.hud.updateArmor(p.armor?.helmet || 0, p.armor?.vest || 0);

    const activeItem = p.inventory?.[p.activeSlot];
    if (activeItem?.weaponId) {
      this.hud.updateAmmo(activeItem.ammoInMag ?? '∞', activeItem.reserveAmmo ?? '∞');
    } else if (activeItem?.itemId) {
      // Healing item selected
      this.hud.updateAmmo(`💊×${activeItem.quantity ?? 1}`, 'H');
    }
    this.hud.updateInventory(p.inventory || {}, p.activeSlot);

    // Reload indicator (edge-triggered so the bar animates + sound plays once)
    if (p.isReloading && !this._reloadShown) {
      this._reloadShown = true;
      this.hud.showReload(2500);
      this.audio.playReload();
    } else if (!p.isReloading && this._reloadShown) {
      this._reloadShown = false;
      this.hud.hideReload();
    }

    // Healing edge sound + ring
    if (p.isHealing && !this._prevHeal) {
      this._prevHeal = true;
      this.audio.playHeal();
      this.renderer.addHealRing(p.x, p.y);
    } else if (!p.isHealing && this._prevHeal) {
      this._prevHeal = false;
    }

    // Interaction prompt — nearest loot within pickup range
    let nearest = null;
    let nd = 46;
    for (const item of this.lootItems.values()) {
      const d = Math.hypot(item.x - p.x, item.y - p.y);
      if (d < nd) { nd = d; nearest = item; }
    }
    if (nearest) this.hud.showInteractionPrompt(this._lootLabel(nearest));
    else this.hud.hideInteractionPrompt();

    if (this.storm) {
      this.hud.updateStormTimer(this.storm.timeToNextShrink || 0);
    }
  }

  _lootLabel(item) {
    switch (item.type) {
      case 'weapon': return item.itemId.replace(/_/g, ' ');
      case 'healing': return HEALING_ITEMS[item.itemId]?.name || item.itemId.replace(/_/g, ' ');
      case 'armor': return `Armor V${item.extra?.armorTier || 1}`;
      case 'ammo': return `${item.itemId} Ammo ×${item.quantity}`;
      default: return item.itemId || 'item';
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
    // ── Camera target ──────────────────────────────────────
    let camTarget = this.localPlayer;
    if (this.state === GAME_STATE.DEAD || this.state === GAME_STATE.SPECTATING) {
      camTarget = this.players.get(this.spectatingId) || camTarget;
    }

    if (camTarget) {
      this.camera.targetX = camTarget.x;
      this.camera.targetY = camTarget.y;
    }

    // Mouse-look
    const look = this.input.consumeLook();
    if (look.dx || look.dy) this.camera.rotateLook(look.dx, look.dy);
    this.camera.update(dt, this.renderer.threeCamera);
    this.input.cameraYaw = this.camera.yaw;

    // ── Day/night cycle (elapsed since match start) ─────────
    const dn = this.dayNight.getState(this.spawnTime ? Date.now() - this.spawnTime : 0);
    const label = `${dn.icon} ${dn.clockLabel}`;
    if (label !== this._lastDayNightLabel) {
      this._lastDayNightLabel = label;
      const el = document.getElementById('daynight-indicator');
      if (el) el.textContent = label;
    }

    // Fireflies drift out at night
    if (dn.nightFactor > 0.35 && this.localPlayer?.alive && this.state === GAME_STATE.PLAYING) {
      this._fireflyAcc += dn.nightFactor * dt * 5;
      if (this._fireflyAcc >= 1) {
        this._fireflyAcc -= 1;
        this.renderer.addFirefly(
          this.localPlayer.x + (Math.random() - 0.5) * 420,
          this.localPlayer.y + (Math.random() - 0.5) * 420
        );
      }
    } else {
      this._fireflyAcc = 0;
    }

    // Storm lightning + rumble while outside the safe zone
    if (this.storm && this.localPlayer?.alive && this.state === GAME_STATE.PLAYING) {
      const dist = Math.hypot(this.localPlayer.x - this.storm.centerX, this.localPlayer.y - this.storm.centerY);
      const inStorm = dist > (this.storm.currentRadius || 0);
      if (inStorm) {
        this.audio.playStormLoop(true);
        if (Math.random() < 0.006 && now - this._lastLightning > 4000) {
          this._lastLightning = now;
          this.audio.playThunder();
          this.renderer.flashLightning();
          const a = Math.random() * Math.PI * 2;
          const r = (this.storm.currentRadius || 800) * (0.85 + Math.random() * 0.2);
          this.renderer.addLightningBolt(
            this.storm.centerX + Math.cos(a) * r,
            this.storm.centerY + Math.sin(a) * r
          );
        }
        // Periodic wind gusts (interval picked once per reset)
        if (now - this._lastStormGust > this._stormGustInterval || this._lastStormGust === 0) {
          this._lastStormGust = now;
          this._stormGustInterval = 6500 + Math.random() * 4000;
          this.audio.playStormGust();
        }
      } else {
        this.audio.playStormLoop(false);
        // Occasional visible bolt when watching the storm from outside
        if (Math.random() < 0.003 && now - this._lastLightning > 5000) {
          this._lastLightning = now;
          const a = Math.random() * Math.PI * 2;
          const r = (this.storm.currentRadius || 800);
          this.renderer.addLightningBolt(
            this.storm.centerX + Math.cos(a) * r,
            this.storm.centerY + Math.sin(a) * r
          );
        }
      }
    }

    // Victory confetti rain while celebrating
    if (this._victoryFrames > 0) {
      this._victoryFrames--;
      const lp = this.localPlayer;
      if (lp && Math.random() < 0.5) {
        this.renderer.addConfetti(
          lp.x + (Math.random() - 0.5) * 360,
          lp.y + (Math.random() - 0.5) * 360
        );
      }
    }

    // ── Update + render the whole 3D scene ──────────────────
    this.renderer.update(this, dt, now);

    // ── HUD overlays (vignette) ─────────────────────────────
    this._updateOverlays();

    // Minimap (DOM canvas)
    const remotePlayers = [...this.players.values()].filter(p => p.id !== this.localPlayerId);
    this.minimap.render(this.localPlayer, remotePlayers, this.storm, this.mapData, [], now);
  }

  // Damage flash + persistent overlay states
  _updateOverlays() {
    const v = document.getElementById('vignette-layer');
    if (v && this.localPlayer) {
      const p = this.localPlayer;
      v.classList.toggle('lowhp', p.alive && p.health <= 30);
      v.classList.toggle('healing', p.alive && !!p.isHealing);
      v.classList.toggle('ads', this.input.rightMouseDown && this.state === GAME_STATE.PLAYING);
      v.classList.toggle('storm', !!this.storm && p.alive && this.state === GAME_STATE.PLAYING
        && Math.hypot(p.x - this.storm.centerX, p.y - this.storm.centerY) > (this.storm.currentRadius || 0));
    }

    // Pointer-lock hint — visible whenever we're playing without mouse lock
    const pl = document.getElementById('pointer-lock-overlay');
    if (pl) {
      const needLock = this.state === GAME_STATE.PLAYING && this.localPlayer?.alive && document.pointerLockElement !== this.canvas;
      pl.classList.toggle('hidden', !needLock);
    }
  }

  _flashDamage() {
    const v = document.getElementById('vignette-layer');
    if (!v) return;
    v.classList.remove('flash');
    void v.offsetWidth;
    v.classList.add('flash');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => v.classList.remove('flash'), 420);
  }

  // ── Resize ────────────────────────────────────────────────
  _setupResizeHandler() {
    const onResize = () => {
      this.renderer.resize(window.innerWidth, window.innerHeight);
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
    this.audio.playStormLoop(false);
    this.renderer.renderer.dispose();
  }
}
