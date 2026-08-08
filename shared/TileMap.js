// ============================================================
// SHARED TILE MAP — grid storage + circle-vs-grid collision
// Used by BOTH the server (authoritative) and the client
// (prediction) so movement feels identical everywhere.
// ============================================================
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from './constants.js';
import { isSolidTile, isWaterTile } from './mapTiles.js';

function decodeUint16(b64) {
  // Works in browsers (atob) and Node 16+ (atob global)
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength >> 1);
}

export class TileMap {
  constructor(tilesX, tilesY, ground, collision) {
    this.tilesX = tilesX;
    this.tilesY = tilesY;
    this.ground = ground || new Uint16Array(tilesX * tilesY);
    this.collision = collision || new Uint16Array(tilesX * tilesY);
    this.tileSize = TILE_SIZE;
  }

  // Build a TileMap from the payload the server sends (base64 layers)
  static fromServerData(data) {
    if (!data) return null;
    const tilesX = data.tilesX || Math.floor((data.width || MAP_WIDTH) / TILE_SIZE);
    const tilesY = data.tilesY || Math.floor((data.height || MAP_HEIGHT) / TILE_SIZE);
    return new TileMap(
      tilesX,
      tilesY,
      data.ground ? decodeUint16(data.ground) : null,
      data.collision ? decodeUint16(data.collision) : null
    );
  }

  tileAt(layer, tileX, tileY) {
    if (tileX < 0 || tileY < 0 || tileX >= this.tilesX || tileY >= this.tilesY) return 0;
    return layer[tileY * this.tilesX + tileX];
  }

  tileAtWorld(layer, wx, wy) {
    return this.tileAt(layer, Math.floor(wx / this.tileSize), Math.floor(wy / this.tileSize));
  }

  isSolidAt(wx, wy) {
    if (wx < 0 || wy < 0 || wx > MAP_WIDTH || wy > MAP_HEIGHT) return true;
    return isSolidTile(this.tileAtWorld(this.collision, wx, wy));
  }

  isWaterAt(wx, wy) {
    return isWaterTile(this.tileAtWorld(this.collision, wx, wy));
  }

  // Push a circle out of solid tiles. Uses the minimum-penetration
  // axis so the circle slides smoothly along walls instead of sticking.
  resolveCircle(x, y, r) {
    const ts = this.tileSize;
    let outX = x;
    let outY = y;

    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      const minTx = Math.floor((outX - r) / ts);
      const maxTx = Math.floor((outX + r) / ts);
      const minTy = Math.floor((outY - r) / ts);
      const maxTy = Math.floor((outY + r) / ts);

      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          if (tx < 0 || ty < 0 || tx >= this.tilesX || ty >= this.tilesY) continue;
          if (!isSolidTile(this.collision[ty * this.tilesX + tx])) continue;

          // Closest point on this solid tile to the circle center
          const cx = Math.max(tx * ts, Math.min(outX, (tx + 1) * ts));
          const cy = Math.max(ty * ts, Math.min(outY, (ty + 1) * ts));
          const dx = outX - cx;
          const dy = outY - cy;
          const distSq = dx * dx + dy * dy;

          if (distSq >= r * r) continue;

          if (distSq === 0) {
            // Center is inside the tile — escape along the nearest face
            const left = outX - tx * ts;
            const right = (tx + 1) * ts - outX;
            const top = outY - ty * ts;
            const bottom = (ty + 1) * ts - outY;
            const minD = Math.min(left, right, top, bottom);
            if (minD === left) outX = tx * ts - r;
            else if (minD === right) outX = (tx + 1) * ts + r;
            else if (minD === top) outY = ty * ts - r;
            else outY = (ty + 1) * ts + r;
          } else {
            // Push along the dominant axis → natural wall sliding
            const dist = Math.sqrt(distSq);
            if (Math.abs(dx) > Math.abs(dy)) {
              outX += (dx / dist) * (r - dist);
            } else {
              outY += (dy / dist) * (r - dist);
            }
          }
          moved = true;
        }
      }

      if (!moved) break;
    }

    return { x: outX, y: outY };
  }

  // True if a circle would overlap any solid tile at (x, y)
  overlapsSolid(x, y, r) {
    const res = this.resolveCircle(x, y, r);
    return Math.abs(res.x - x) > 0.001 || Math.abs(res.y - y) > 0.001;
  }
}
