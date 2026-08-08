// ============================================================
// ROOM — single match instance
// ============================================================
import { v4 as uuidv4 } from 'uuid';
import {
  S2C, GAME_MODES, SERVER_TICK_MS, INPUT_FLAGS, KILL_FEED_MAX, KILL_FEED_DURATION_MS,
  PLAYER_SHIELD_REGEN_DELAY, PLAYER_SHIELD_REGEN_RATE, HEAL_SLOTS,
} from 'battle-royale-shared';
import { Player } from './entities/Player.js';
import { World } from './World.js';
import { StormSystem } from './systems/StormSystem.js';
import { LootSystem } from './systems/LootSystem.js';
import { CombatSystem } from './systems/CombatSystem.js';
import { PhysicsSystem } from './systems/PhysicsSystem.js';
import { StateSerializer } from '../networking/StateSerializer.js';
import { BotController } from './entities/BotController.js';

export const ROOM_STATES = {
  LOBBY: 'lobby',
  STARTING: 'starting',
  ACTIVE: 'active',
  ENDED: 'ended',
};

export class Room {
  constructor(io, roomId, mode = 'SOLO') {
    this.io = io;
    this.roomId = roomId;
    this.mode = mode;
    this.modeConfig = GAME_MODES[mode];
    this.state = ROOM_STATES.LOBBY;
    this.createdAt = Date.now();

    // Entities
    this.players = new Map();   // playerId → Player
    this.sockets = new Map();   // socketId → playerId
    this.projectiles = new Map();

    // Systems
    this.mapSeed = Math.floor(Math.random() * 99999);
    this.world = new World(null, this.mapSeed);
    this.storm = new StormSystem();
    this.loot = new LootSystem(this.world);
    this.combat = new CombatSystem(this);
    this.physics = new PhysicsSystem(this.world);
    this.serializer = new StateSerializer();

    // Game state
    this.tick = 0;
    this.startTime = 0;
    this.endTime = 0;
    this.killFeed = [];
    this.customCode = null; // for custom lobbies
    this.countdownTimer = null;
    this.gameLoop = null;

    // Snapshot history for delta compression
    this.lastSnapshot = {};

    // AI Bots
    this.bots = [];
  }

  // ── Player management ─────────────────────────────────────
  addPlayer(socket, playerData) {
    const player = new Player({
      socketId: socket.id,
      playerId: playerData.playerId || uuidv4(),
      name: playerData.name,
      skin: playerData.skin || 0,
      elo: playerData.elo || 1000,
      teamId: playerData.teamId || null,
    });

    this.players.set(player.id, player);
    this.sockets.set(socket.id, player.id);

    socket.join(this.roomId);

    // Notify others
    socket.to(this.roomId).emit(S2C.PLAYER_JOINED, player.toSnapshot());

    // Send current state to new player
    socket.emit(S2C.GAME_STATE, {
      type: 'full',
      tick: this.tick,
      map: this.world.toMapData(),
      players: [...this.players.values()].map(p => p.toSnapshot()),
      loot: this.loot.getAllLootSnapshots(),
      storm: this.storm.toSnapshot(),
      playerCount: { alive: this.aliveCount(), total: this.players.size },
    });

    return player;
  }

  removePlayer(socketId) {
    const playerId = this.sockets.get(socketId);
    if (!playerId) return;

    this.sockets.delete(socketId);
    const player = this.players.get(playerId);
    if (player) {
      player.alive = false;
      // Drop their loot
      const drops = this.loot.dropInventory(player);
      if (drops.length > 0) {
        this.emit(S2C.LOOT_SPAWN, { items: drops });
      }
    }
    this.players.delete(playerId);
    this.emit(S2C.PLAYER_LEFT, { playerId });

    this.checkMatchEnd();
  }

  // ── Input handling ────────────────────────────────────────
  handleInput(socketId, input) {
    const playerId = this.sockets.get(socketId);
    if (!playerId) return;
    const player = this.players.get(playerId);
    if (!player || !player.isAlive) return;

    // Add to input buffer (processed each tick)
    player.inputBuffer.push(input);
    if (player.inputBuffer.length > 10) {
      player.inputBuffer.shift(); // cap buffer
    }
  }

  // ── Game loop ─────────────────────────────────────────────
  startGameLoop() {
    if (this.gameLoop) return;

    this.state = ROOM_STATES.ACTIVE;
    this.startTime = Date.now();

    // Spawn loot
    const lootItems = this.loot.spawnGroundLoot(0.04);
    this.emit(S2C.LOOT_SPAWN, { items: lootItems });

    // Set spawn positions
    const spawns = this.world.getSafeSpawnPositions(this.players.size + 15); // spawn positions for players + 15 bots
    let si = 0;
    for (const player of this.players.values()) {
      const spawn = spawns[si++] || { x: 2048, y: 2048 };
      player.x = spawn.x;
      player.y = spawn.y;
      player.markDirty('x', 'y');
    }

    // Spawn 15 bots
    const names = ['AlphaBot', 'BetaBot', 'OmegaBot', 'Rust', 'Clank', 'Pixel', 'Solder', 'Spark', 'Widget', 'Glitch', 'Binary', 'Hex', 'Logic', 'Giga', 'Vector'];
    for (let i = 0; i < 15; i++) {
      const botId = `bot-${uuidv4().slice(0, 8)}`;
      const spawn = spawns[si++] || { x: 2048, y: 2048 };
      const botPlayer = new Player({
        socketId: `bot-socket-${botId}`,
        playerId: botId,
        name: names[i % names.length],
        skin: Math.floor(Math.random() * 8),
        elo: 800 + Math.floor(Math.random() * 400),
      });
      botPlayer.x = spawn.x;
      botPlayer.y = spawn.y;
      botPlayer.markDirty('x', 'y');

      // Distribute armor & basic weapons
      botPlayer.armor = { helmet: Math.floor(Math.random() * 3), vest: Math.floor(Math.random() * 3) };
      const botWeapons = ['PISTOL', 'SMG', 'SHOTGUN', 'ASSAULT_RIFLE'];
      const chosenWeapon = botWeapons[Math.floor(Math.random() * botWeapons.length)];
      botPlayer.pickupWeapon(chosenWeapon, 10, 90);

      this.players.set(botId, botPlayer);
      const controller = new BotController(botPlayer, this);
      this.bots.push(controller);
    }

    // Send match start
    this.emit(S2C.MATCH_START, {
      mapSeed: this.mapSeed,
      gameMode: this.mode,
      map: this.world.toMapData(),
      players: [...this.players.values()].map(p => p.toSnapshot()),
      storm: this.storm.toSnapshot(),
      loot: this.loot.getAllLootSnapshots(),
    });

    this.gameLoop = setInterval(() => this.gameTick(), SERVER_TICK_MS);
  }

  gameTick() {
    const now = Date.now();
    const dt = SERVER_TICK_MS / 1000;

    this.tick++;

    // 1. Process Bot Logic
    for (const bot of this.bots) {
      bot.update(now, dt);
    }

    // 2. Capture each player's latest input BEFORE physics drains
    //    the buffer (physics.update() consumes it). Actions are
    //    evaluated on the freshest input received since the last
    //    tick. Flags are OR-aggregated across the whole buffer so
    //    quick taps (R / H / E / weapon keys) are never dropped
    //    between the 50ms ticks.
    const lastInputs = new Map();
    for (const [socketId, playerId] of this.sockets) {
      const player = this.players.get(playerId);
      if (!player?.isAlive) continue;
      const buf = player.inputBuffer;
      if (buf.length === 0) continue;

      let actionFlags = 0;
      let switchSlot = -1;
      for (const input of buf) {
        actionFlags |= input.flags || 0;
        if (typeof input.switchSlot === 'number' && input.switchSlot >= 0) {
          switchSlot = input.switchSlot;
        }
      }
      lastInputs.set(playerId, {
        flags: actionFlags,
        angle: buf[buf.length - 1].angle ?? 0,
      });
      if (switchSlot >= 0) lastInputs.get(playerId).switchSlot = switchSlot;
    }

    // 3. Process inputs + physics (drains input buffers)
    this.physics.update(this.players, dt);

    // 4. Process player actions from captured inputs
    for (const [playerId, input] of lastInputs) {
      const player = this.players.get(playerId);
      if (!player?.isAlive) continue;
      const flags = input.flags || 0;

      // Weapon switch (keys 1 / 2 / 3)
      if (typeof input.switchSlot === 'number' && input.switchSlot >= 0 && input.switchSlot <= 5) {
        player.switchWeaponSlot(input.switchSlot);
      }

      // Reload (R)
      if (flags & INPUT_FLAGS.RELOAD) {
        this.combat.tryReload(player);
      }

      // Heal (H) — use first usable healing item
      if (flags & INPUT_FLAGS.HEAL) {
        for (const slot of HEAL_SLOTS) {
          if (player.startHealing(slot)) break;
        }
      }

      // Fire (LMB)
      if (flags & INPUT_FLAGS.FIRE) {
        const events = this.combat.processFireInput(player, input, this.players, this.projectiles);
        if (events) this.processCombatEvents(events, player);
      }

      // Use / pickup (E)
      if (flags & INPUT_FLAGS.USE) {
        const pickups = this.loot.checkPickups(this.players);
        for (const pickup of pickups) {
          this.emit(S2C.LOOT_PICKUP, pickup);
        }
      }
    }

    // 5. Update projectiles
    this.physics.updateProjectiles(this.projectiles, dt);

    // 6. Check projectile collisions
    const projEvents = this.combat.checkProjectileCollisions(this.projectiles, this.players);
    for (const evt of projEvents) {
      this.processCombatEvent(evt);
    }

    // 7. Clean dead projectiles
    for (const [id, proj] of this.projectiles) {
      if (!proj.alive) this.projectiles.delete(id);
    }

    // 8. Storm update (every 5 ticks = 250ms)
    if (this.tick % 5 === 0) {
      this.storm.update(now);
      const stormDamaged = this.storm.applyDamage(this.players, now);
      for (const { playerId, alive } of stormDamaged) {
        const p = this.players.get(playerId);
        if (p && !alive) this.handlePlayerDeath(p, null, 'storm');
      }
      this.emit(S2C.STORM_UPDATE, this.storm.toSnapshot(now));
    }

    // 9. Complete reloads + healing
    this.combat.updateReloads(this.players);
    for (const player of this.players.values()) {
      if (player.isAlive) player.updateHealing(now);
    }

    // 10. Shield regen after a quiet period
    for (const player of this.players.values()) {
      if (!player.isAlive) continue;
      if (now - player.lastDamageTime >= PLAYER_SHIELD_REGEN_DELAY && player.shield < player.maxShield) {
        player.replenishShield(PLAYER_SHIELD_REGEN_RATE * dt);
      }
    }

    // 11. Airdrops (check per tick)
    const airdrop = this.loot.updateAirdrop(now, this.players);
    if (airdrop) {
      this.emit(S2C.AIRDROP_INCOMING, { x: airdrop.x, y: airdrop.y, eta: airdrop.eta });
      setTimeout(() => {
        // Broadcast the crate's contents now that it has landed (the
        // items existed server-side but were never sent to clients).
        if (airdrop.items?.length) {
          this.emit(S2C.LOOT_SPAWN, { items: airdrop.items });
        }
        this.emit(S2C.AIRDROP_LANDED, { x: airdrop.x, y: airdrop.y, lootIds: airdrop.lootIds });
      }, airdrop.eta);
    }

    // 12. Send delta state snapshot
    this.sendDeltaState(now);

    // 13. Player count
    if (this.tick % 10 === 0) {
      this.emit(S2C.PLAYER_COUNT, { alive: this.aliveCount(), total: this.players.size });
    }

    // 14. Check match end
    this.checkMatchEnd();
  }

  processCombatEvents(events, attacker) {
    for (const evt of events) {
      this.processCombatEvent(evt, attacker);
    }
  }

  processCombatEvent(evt, attacker = null) {
    if (!evt) return;

    if (evt.type === 'hit') {
      const target = this.players.get(evt.targetId);
      const attackerPlayer = attacker || this.players.get(evt.attackerId);

      // Send hit confirmation to attacker
      if (attackerPlayer) {
        const attackerSocket = this.io.sockets.sockets.get(attackerPlayer.socketId);
        attackerSocket?.emit(S2C.HIT_CONFIRM, {
          targetId: evt.targetId,
          damage: evt.damage,
          isHeadshot: evt.isHeadshot,
          killed: evt.killed,
        });
      }

      if (evt.killed && target) {
        this.handlePlayerDeath(target, attackerPlayer, evt.weaponId);
      }
    } else if (evt.type === 'projectile_spawn') {
      this.emit(S2C.PROJECTILE_SPAWN, evt.projectile);
    } else if (evt.type === 'projectile_destroy') {
      this.emit(S2C.PROJECTILE_DESTROY, { id: evt.id });
    }
  }

  handlePlayerDeath(player, killer, weaponId) {
    if (!player.alive) return; // already dead
    player.alive = false;

    // Drop loot
    const drops = this.loot.dropInventory(player);
    if (drops.length > 0) {
      this.emit(S2C.LOOT_SPAWN, { items: drops });
    }

    // Kill feed
    const killEntry = {
      killer: killer?.name || 'Storm',
      killerId: killer?.id || null,
      victim: player.name,
      victimId: player.id,
      weapon: weaponId || 'storm',
      isHeadshot: false,
      timestamp: Date.now(),
    };
    this.killFeed.unshift(killEntry);
    if (this.killFeed.length > KILL_FEED_MAX) this.killFeed.pop();
    this.emit(S2C.KILL_FEED, killEntry);

    // Notify the dead player
    const deadSocket = this.io.sockets.sockets.get(player.socketId);
    deadSocket?.emit(S2C.PLAYER_DIED, {
      playerId: player.id,
      killerId: killer?.id || null,
      weapon: weaponId || 'storm',
    });
    deadSocket?.emit(S2C.PLACEMENT, {
      rank: this.aliveCount() + 1,
      kills: player.kills,
      survivalTime: Math.round((Date.now() - this.startTime) / 1000),
    });
    deadSocket?.emit(S2C.PLAYER_SPECTATING, { targetId: killer?.id || null });

    this.emit(S2C.PLAYER_DIED, { playerId: player.id, killerId: killer?.id, weapon: weaponId });
  }

  sendDeltaState(now) {
    const deltaPlayers = [];
    for (const player of this.players.values()) {
      if (player.hasDelta()) {
        deltaPlayers.push(player.toDelta());
      }
    }

    if (deltaPlayers.length === 0) return;

    this.emit(S2C.GAME_STATE, {
      type: 'delta',
      tick: this.tick,
      serverTime: now,
      players: deltaPlayers,
    });
  }

  checkMatchEnd() {
    if (this.state !== ROOM_STATES.ACTIVE) return;

    const alive = [...this.players.values()].filter(p => p.isAlive);
    const modeConfig = GAME_MODES[this.mode];

    let hasWinner = false;
    let winnerId = null, winnerName = null;

    if (this.mode === 'SOLO' && alive.length <= 1) {
      hasWinner = true;
      winnerId = alive[0]?.id;
      winnerName = alive[0]?.name;
    } else if (this.mode !== 'SOLO' && alive.length <= (modeConfig.teamSize || 1)) {
      const teamIds = new Set(alive.map(p => p.teamId));
      if (teamIds.size <= 1) {
        hasWinner = true;
        winnerId = alive[0]?.id;
        winnerName = alive[0]?.name;
      }
    }

    if (hasWinner) {
      this.state = ROOM_STATES.ENDED;
      clearInterval(this.gameLoop);
      this.gameLoop = null;
      this.endTime = Date.now();

      this.emit(S2C.MATCH_END, {
        winnerId,
        winnerName: winnerName || 'Nobody',
        stats: { duration: Math.round((this.endTime - this.startTime) / 1000) },
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────
  aliveCount() {
    return [...this.players.values()].filter(p => p.isAlive).length;
  }

  emit(event, data) {
    this.io.to(this.roomId).emit(event, data);
  }

  startCountdown(seconds) {
    this.state = ROOM_STATES.STARTING;
    let remaining = seconds;
    this.countdownTimer = setInterval(() => {
      this.emit(S2C.MATCHMAKING_STATUS, {
        status: 'starting',
        players: this.players.size,
        maxPlayers: this.modeConfig.maxPlayers,
        countdown: --remaining,
      });
      if (remaining <= 0) {
        clearInterval(this.countdownTimer);
        this.startGameLoop();
      }
    }, 1000);
  }

  destroy() {
    clearInterval(this.gameLoop);
    clearInterval(this.countdownTimer);
    this.gameLoop = null;
  }
}
