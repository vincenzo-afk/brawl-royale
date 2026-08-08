// ============================================================
// SOCKET.IO PROTOCOL — all event names shared between client/server
// ============================================================

// Client → Server
export const C2S = {
  // Connection / Lobby
  JOIN_MATCHMAKING:    'c2s:join_matchmaking',     // { mode, region }
  JOIN_CUSTOM_LOBBY:   'c2s:join_custom_lobby',    // { code }
  CREATE_CUSTOM_LOBBY: 'c2s:create_custom_lobby',  // { mode }
  LEAVE_MATCHMAKING:   'c2s:leave_matchmaking',
  PLAYER_READY:        'c2s:player_ready',

  // Gameplay
  PLAYER_INPUT:        'c2s:player_input',         // { seq, tick, keys, angle, fire, reload, useItem, switchSlot }
  PING:                'c2s:ping',                  // { timestamp }

  // Post-match
  REQUEST_LEADERBOARD: 'c2s:request_leaderboard',
  REQUEST_MATCH_HISTORY: 'c2s:request_match_history',
};

// Server → Client
export const S2C = {
  // Connection
  CONNECTED:           's2c:connected',            // { playerId, region }
  MATCHMAKING_STATUS:  's2c:matchmaking_status',   // { status, players, maxPlayers, countdown }
  LOBBY_CREATED:       's2c:lobby_created',        // { code, mode }
  MATCH_START:         's2c:match_start',          // { mapSeed, gameMode, players[] }

  // Game state
  GAME_STATE:          's2c:game_state',            // full/delta state snapshot
  PLAYER_JOINED:       's2c:player_joined',         // { player }
  PLAYER_LEFT:         's2c:player_left',           // { playerId }
  PLAYER_DIED:         's2c:player_died',           // { playerId, killerId, weapon }
  PLAYER_SPECTATING:   's2c:player_spectating',     // { targetId }

  // Combat
  HIT_CONFIRM:         's2c:hit_confirm',           // { targetId, damage, isHeadshot, isCrit }
  PROJECTILE_SPAWN:    's2c:projectile_spawn',      // { id, x, y, vx, vy, weaponId }
  PROJECTILE_DESTROY:  's2c:projectile_destroy',    // { id }
  LOOT_SPAWN:          's2c:loot_spawn',            // { id, x, y, item }
  LOOT_PICKUP:         's2c:loot_pickup',           // { lootId, playerId }
  AIRDROP_INCOMING:    's2c:airdrop_incoming',      // { x, y, eta }
  AIRDROP_LANDED:      's2c:airdrop_landed',        // { x, y, lootIds[] }

  // Storm
  STORM_UPDATE:        's2c:storm_update',          // { phase, centerX, centerY, currentRadius, targetRadius, shrinkProgress, nextShrinkIn }

  // Match events
  KILL_FEED:           's2c:kill_feed',             // { killer, victim, weapon, isHeadshot }
  PLAYER_COUNT:        's2c:player_count',          // { alive, total }
  MATCH_END:           's2c:match_end',             // { winnerId, winnerName, stats }
  PLACEMENT:           's2c:placement',             // { rank, kills, survivalTime }

  // Networking
  PONG:                's2c:pong',                  // { timestamp, serverTime }
  INPUT_ACK:           's2c:input_ack',             // { seq } — ack last processed input
  LEADERBOARD_DATA:    's2c:leaderboard_data',
  MATCH_HISTORY_DATA:  's2c:match_history_data',

  // Error
  ERROR:               's2c:error',                 // { code, message }
};

// Input bit flags (pack multiple booleans into one integer)
export const INPUT_FLAGS = {
  UP:      1 << 0,   // W / ArrowUp
  DOWN:    1 << 1,   // S / ArrowDown
  LEFT:    1 << 2,   // A / ArrowLeft
  RIGHT:   1 << 3,   // D / ArrowRight
  FIRE:    1 << 4,   // Mouse Left
  RELOAD:  1 << 5,   // R
  SPRINT:  1 << 6,   // Shift
  CROUCH:  1 << 7,   // Ctrl / C
  USE:     1 << 8,   // E — interact / pickup
  HEAL:    1 << 9,   // H
};
