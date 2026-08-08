// ============================================================
// WORLD — tile map loader + collision
// ============================================================
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE } from 'battle-royale-shared';

// Tile IDs that are solid (impassable)
const SOLID_TILE_IDS = new Set([
  2, 3, 4, 5,          // walls
  10, 11, 12,          // buildings
  20, 21, 22, 23,      // rocks
]);

export class World {
  constructor(mapData = null) {
    this.mapData = mapData;
    this.tilesX = MAP_WIDTH / TILE_SIZE;
    this.tilesY = MAP_HEIGHT / TILE_SIZE;

    // Flat array of tile IDs for collision layer (layer index 0)
    this.collisionLayer = new Uint16Array(this.tilesX * this.tilesY);

    if (mapData) {
      this.loadFromTiled(mapData);
    } else {
      this.generateProceduralMap();
    }
  }

  loadFromTiled(mapData) {
    // Find collision layer
    const colLayer = mapData.layers?.find(l => l.name === 'collision' || l.name === 'Collision');
    if (colLayer?.data) {
      for (let i = 0; i < colLayer.data.length; i++) {
        this.collisionLayer[i] = colLayer.data[i];
      }
    }
  }

  generateProceduralMap() {
    // Simple procedural: add some walls around buildings
    // This is a fallback when no Tiled map is provided
    for (let tx = 0; tx < this.tilesX; tx++) {
      for (let ty = 0; ty < this.tilesY; ty++) {
        // Border walls
        if (tx === 0 || ty === 0 || tx === this.tilesX - 1 || ty === this.tilesY - 1) {
          this.collisionLayer[ty * this.tilesX + tx] = 2;
          continue;
        }

        // Random building clusters every ~20 tiles
        const clusterX = Math.floor(tx / 20);
        const clusterY = Math.floor(ty / 20);
        const localX = tx % 20;
        const localY = ty % 20;

        // Use a simple hash to decide if cluster has a building
        const hash = (clusterX * 31 + clusterY * 17) % 100;
        if (hash < 25) {
          // Building at 4-8 x 4-8 in the cluster
          if (localX >= 4 && localX <= 8 && localY >= 4 && localY <= 8) {
            // Only wall tiles on border of building
            if (localX === 4 || localX === 8 || localY === 4 || localY === 8) {
              this.collisionLayer[ty * this.tilesX + tx] = 2;
            }
          }
        }
      }
    }
  }

  tileAt(worldX, worldY) {
    const tx = Math.floor(worldX / TILE_SIZE);
    const ty = Math.floor(worldY / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.tilesX || ty >= this.tilesY) return 0;
    return this.collisionLayer[ty * this.tilesX + tx];
  }

  isSolid(worldX, worldY) {
    return SOLID_TILE_IDS.has(this.tileAt(worldX, worldY));
  }

  // Push player out of solid tile
  resolvePlayerTile(px, py, radius, checkX, checkY) {
    const tx = Math.floor(checkX / TILE_SIZE);
    const ty = Math.floor(checkY / TILE_SIZE);

    const tileLeft   = tx * TILE_SIZE;
    const tileRight  = tileLeft + TILE_SIZE;
    const tileTop    = ty * TILE_SIZE;
    const tileBottom = tileTop + TILE_SIZE;

    // Find closest point on tile to player center
    const closestX = Math.max(tileLeft, Math.min(tileRight, px));
    const closestY = Math.max(tileTop, Math.min(tileBottom, py));

    const dx = px - closestX;
    const dy = py - closestY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= radius || dist === 0) return null;

    const push = radius - dist;
    return {
      x: px + (dx / dist) * push,
      y: py + (dy / dist) * push,
    };
  }

  // Get safe spawn positions
  getSafeSpawnPositions(count) {
    const spawns = [];
    const margin = TILE_SIZE * 3;
    let attempts = 0;

    while (spawns.length < count && attempts < count * 20) {
      attempts++;
      const x = margin + Math.random() * (MAP_WIDTH - margin * 2);
      const y = margin + Math.random() * (MAP_HEIGHT - margin * 2);
      if (!this.isSolid(x, y)) {
        spawns.push({ x, y });
      }
    }

    // Fallback positions if not enough found
    while (spawns.length < count) {
      spawns.push({
        x: MAP_WIDTH * 0.1 + Math.random() * MAP_WIDTH * 0.8,
        y: MAP_HEIGHT * 0.1 + Math.random() * MAP_HEIGHT * 0.8,
      });
    }

    return spawns;
  }

  // Serialize map state for clients (compressed)
  toClientData() {
    return {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tileSize: TILE_SIZE,
      tilesX: this.tilesX,
      tilesY: this.tilesY,
      // Send as base64 compressed for bandwidth
      collisionLayer: Buffer.from(this.collisionLayer.buffer).toString('base64'),
    };
  }
}
