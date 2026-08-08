// ============================================================
// PHYSICS SYSTEM — server-side movement + collision
// ============================================================
import { MAP_WIDTH, MAP_HEIGHT, PLAYER_RADIUS, PLAYER_PLAYER_COLLISION } from 'battle-royale-shared';

export class PhysicsSystem {
  constructor(world) {
    this.world = world;
  }

  // Move all players according to their queued inputs
  update(players, dt) {
    for (const player of players.values()) {
      if (!player.isAlive) continue;

      // Buffered inputs arrive at ~60Hz while the server ticks at 20Hz,
      // so ~3 inputs land per tick. Each input represents 1/60s of
      // movement — applying the full tick dt to each would move the
      // player ~3× too fast. Normalize by distributing the tick dt
      // across the buffered inputs.
      const buffered = player.inputBuffer.length;
      if (buffered > 0) {
        const perInputDt = dt / buffered;
        while (player.inputBuffer.length > 0) {
          const input = player.inputBuffer.shift();
          player.applyInput(input, perInputDt, this.world);
          player.lastProcessedInput = input.seq;
        }
      }

      // Clamp to world bounds
      player.x = Math.max(PLAYER_RADIUS, Math.min(MAP_WIDTH - PLAYER_RADIUS, player.x));
      player.y = Math.max(PLAYER_RADIUS, Math.min(MAP_HEIGHT - PLAYER_RADIUS, player.y));

      // Tile-based collision with solid tiles (same resolver as client)
      this.resolveMapCollision(player);
    }

    // Player-vs-player soft collision
    if (PLAYER_PLAYER_COLLISION) {
      const alive = [...players.values()].filter(p => p.isAlive);
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i];
          const b = alive[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.radius + b.radius;
          if (dist >= minDist || dist === 0) continue;

          // Push both apart along the separation axis
          const push = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          a.markDirty('x', 'y');
          b.markDirty('x', 'y');

          // Re-resolve map collision so nobody gets pushed into a wall
          this.resolveMapCollision(a);
          this.resolveMapCollision(b);
        }
      }
    }
  }

  resolveMapCollision(player) {
    if (!this.world) return;
    const result = this.world.resolveCircle(player.x, player.y, player.radius);
    if (result.x !== player.x || result.y !== player.y) {
      player.x = result.x;
      player.y = result.y;
      player.markDirty('x', 'y');
    }
  }

  // Projectile movement
  updateProjectiles(projectiles, dt) {
    for (const [id, proj] of projectiles) {
      if (!proj.alive) continue;
      proj.update(dt);
      // Map bounds kill
      if (proj.x < 0 || proj.x > MAP_WIDTH || proj.y < 0 || proj.y > MAP_HEIGHT) {
        proj.alive = false;
      }
    }
  }

  // Circle-circle collision check
  static circleOverlap(ax, ay, ar, bx, by, br) {
    const dx = ax - bx, dy = ay - by;
    return (dx * dx + dy * dy) < (ar + br) * (ar + br);
  }

  // Point-in-circle check
  static pointInCircle(px, py, cx, cy, r) {
    const dx = px - cx, dy = py - cy;
    return (dx * dx + dy * dy) <= r * r;
  }

  // Raycast for hitscan weapons
  // Returns { hit: bool, target: Player|null, point: {x,y}, isHeadshot: bool }
  static raycast(originX, originY, angle, range, players, ownerId, teamId, friendlyFire = false) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let closestDist = range;
    let closestPlayer = null;
    let isHeadshot = false;

    for (const player of players.values()) {
      if (!player.isAlive) continue;
      if (player.id === ownerId) continue;
      if (!friendlyFire && teamId && player.teamId === teamId) continue;

      // Ray-circle intersection
      const relX = player.x - originX;
      const relY = player.y - originY;
      const proj = relX * dx + relY * dy;  // projection onto ray

      if (proj < 0 || proj > closestDist) continue;

      const perpSq = (relX * relX + relY * relY) - proj * proj;
      const bodyR = player.radius;
      const headR = player.radius * 0.6;
      const headOffY = -player.radius * 0.5; // head is slightly above center

      // Check headshot (smaller circle, higher y offset)
      const hRelY = relY - headOffY;
      const hPerpSq = (relX * relX + hRelY * hRelY) - proj * proj;
      if (hPerpSq <= headR * headR) {
        closestDist = proj;
        closestPlayer = player;
        isHeadshot = true;
        continue;
      }

      if (perpSq <= bodyR * bodyR) {
        closestDist = proj;
        closestPlayer = player;
        isHeadshot = false;
      }
    }

    return {
      hit: !!closestPlayer,
      target: closestPlayer,
      point: {
        x: originX + dx * closestDist,
        y: originY + dy * closestDist,
      },
      isHeadshot,
      distance: closestDist,
    };
  }
}
