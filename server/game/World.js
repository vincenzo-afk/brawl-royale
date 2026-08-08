// ============================================================
// WORLD — seeded procedural tile map + collision
// Generates a map with named POIs (towns, lakes, forests,
// quarries, ruins), roads between them, and environmental
// objects — all deterministic per match seed.
// ============================================================
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, TileMap, TILE } from 'battle-royale-shared';

// Simple deterministic PRNG (mulberry32)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor(mapData = null, seed = 42) {
    this.mapData = mapData;
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.tilesX = MAP_WIDTH / TILE_SIZE;
    this.tilesY = MAP_HEIGHT / TILE_SIZE;

    // Flat tile arrays (index = ty * tilesX + tx)
    this.groundLayer = new Uint16Array(this.tilesX * this.tilesY);
    this.collisionLayer = new Uint16Array(this.tilesX * this.tilesY);

    // Shared collision/grid helper (same code the client prediction uses)
    this.tileMap = new TileMap(this.tilesX, this.tilesY, this.groundLayer, this.collisionLayer);

    // Named points of interest: [{ name, x, y, type }]
    this.pois = [];

    if (mapData) {
      this.loadFromTiled(mapData);
    } else {
      this.generateProceduralMap();
    }
  }

  loadFromTiled(mapData) {
    const colLayer = mapData.layers?.find(l => l.name === 'collision' || l.name === 'Collision');
    if (colLayer?.data) {
      for (let i = 0; i < colLayer.data.length && i < this.collisionLayer.length; i++) {
        this.collisionLayer[i] = colLayer.data[i];
      }
    }
    const groundLayer = mapData.layers?.find(l => l.name === 'ground' || l.name === 'Ground');
    if (groundLayer?.data) {
      for (let i = 0; i < groundLayer.data.length && i < this.groundLayer.length; i++) {
        this.groundLayer[i] = groundLayer.data[i];
      }
    }
  }

  // ── Procedural generation ────────────────────────────────
  generateProceduralMap() {
    const rng = this.rng;
    const { tilesX, tilesY } = this;

    const setGround = (tx, ty, id) => {
      if (tx < 0 || ty < 0 || tx >= tilesX || ty >= tilesY) return;
      this.groundLayer[ty * tilesX + tx] = id;
    };
    const setCollision = (tx, ty, id) => {
      if (tx < 0 || ty < 0 || tx >= tilesX || ty >= tilesY) return;
      this.collisionLayer[ty * tilesX + tx] = id;
    };
    const setTile = (tx, ty, id) => { setGround(tx, ty, id); setCollision(tx, ty, id); };
    const groundAt = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= tilesX || ty >= tilesY) return 0;
      return this.groundLayer[ty * tilesX + tx];
    };
    const isGrassy = (tx, ty) => {
      const g = groundAt(tx, ty);
      return g === TILE.GRASS || g === TILE.GRASS_VARIANT;
    };

    // 1. Base terrain
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        this.groundLayer[ty * tilesX + tx] = rng() < 0.25 ? TILE.GRASS_VARIANT : TILE.GRASS;
      }
    }

    // 2. POI layout — jittered 3×3 grid, center is always "Crossroads"
    const GRID = 3;
    const cellW = tilesX / GRID;
    const cellH = tilesY / GRID;
    const poiCenters = [];

    const templates = [
      { name: 'Crossroads',    type: 'town',   gridX: 1, gridY: 1, jitter: 0 },
      { name: 'Dusty Depot',   type: 'town',   gridX: 0, gridY: 0, jitter: 6 },
      { name: 'Crate Town',    type: 'crates', gridX: 2, gridY: 0, jitter: 6 },
      { name: 'Silent Pines',  type: 'forest', gridX: 0, gridY: 1, jitter: 7 },
      { name: 'Boneyard',      type: 'quarry', gridX: 2, gridY: 1, jitter: 6 },
      { name: 'Lake Serene',   type: 'lake',   gridX: 0, gridY: 2, jitter: 6 },
      { name: 'Ruin Ridge',    type: 'ruins',  gridX: 1, gridY: 2, jitter: 6 },
      { name: 'Haunted Grove', type: 'forest', gridX: 2, gridY: 2, jitter: 7 },
    ];

    for (const t of templates) {
      const jx = t.jitter ? (rng() * 2 - 1) * t.jitter : 0;
      const jy = t.jitter ? (rng() * 2 - 1) * t.jitter : 0;
      const cx = (t.gridX + 0.5) * cellW + jx;
      const cy = (t.gridY + 0.5) * cellH + jy;
      poiCenters.push({ ...t, x: cx, y: cy });
    }

    // 3. Roads — connect every POI to Crossroads + ring between neighbors
    const centerPoi = poiCenters[0];
    for (let i = 1; i < poiCenters.length; i++) {
      this.carveRoad(centerPoi.x, centerPoi.y, poiCenters[i].x, poiCenters[i].y, isGrassy);
    }
    for (let i = 1; i < poiCenters.length; i++) {
      const next = poiCenters[i + 1] || poiCenters[1];
      this.carveRoad(poiCenters[i].x, poiCenters[i].y, next.x, next.y, isGrassy);
    }

    // 4. POI content
    for (const poi of poiCenters) {
      const r = poi.type === 'lake' ? 11 + Math.floor(rng() * 3) : 9 + Math.floor(rng() * 4);
      this.generatePOIContent(poi, r, rng);
      this.pois.push({ name: poi.name, type: poi.type, x: Math.round(poi.x * TILE_SIZE), y: Math.round(poi.y * TILE_SIZE) });
    }

    // 5. Scattered environmental detail (outside POI cores)
    for (let ty = 1; ty < tilesY - 1; ty++) {
      for (let tx = 1; tx < tilesX - 1; tx++) {
        if (!isGrassy(tx, ty)) continue;
        const roll = rng();
        if (roll < 0.012) {
          setTile(tx, ty, rng() < 0.5 ? TILE.TREE : TILE.TREE_2);
        } else if (roll < 0.02) {
          setTile(tx, ty, rng() < 0.5 ? TILE.ROCK : TILE.ROCK_2);
        } else if (roll < 0.028) {
          setGround(tx, ty, TILE.GRASS_VARIANT);
        } else if (roll < 0.031) {
          setTile(tx, ty, TILE.CRATE);
        }
      }
    }

    // 6. Border walls (2 thick)
    for (let tx = 0; tx < tilesX; tx++) {
      for (const ty of [0, 1, tilesY - 2, tilesY - 1]) {
        setTile(tx, ty, TILE.WALL);
      }
    }
    for (let ty = 0; ty < tilesY; ty++) {
      for (const tx of [0, 1, tilesX - 2, tilesX - 1]) {
        setTile(tx, ty, TILE.WALL);
      }
    }
  }

  carveRoad(x1, y1, x2, y2, isGrassy) {
    // Bresenham-ish thick line, only over grass
    const steps = Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const tx = Math.round(x1 + (x2 - x1) * t);
      const ty = Math.round(y1 + (y2 - y1) * t);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          if (!isGrassy(tx + ox, ty + oy)) continue;
          const id = rngDeterministic(tx + ox, ty + oy) < 0.35 ? TILE.ROAD_VARIANT : TILE.ROAD;
          const idx = (ty + oy) * this.tilesX + (tx + ox);
          this.groundLayer[idx] = id;
          this.collisionLayer[idx] = 0;
        }
      }
    }
  }

  generatePOIContent(poi, radius, rng) {
    const { x, y } = poi;
    const tilesX = this.tilesX;
    const setGround = (tx, ty, id) => {
      if (tx < 0 || ty < 0 || tx >= this.tilesX || ty >= this.tilesY) return;
      this.groundLayer[ty * tilesX + tx] = id;
    };
    const setCollision = (tx, ty, id) => {
      if (tx < 0 || ty < 0 || tx >= this.tilesX || ty >= this.tilesY) return;
      this.collisionLayer[ty * tilesX + tx] = id;
    };
    const setTile = (tx, ty, id) => { setGround(tx, ty, id); setCollision(tx, ty, id); };

    switch (poi.type) {
      case 'town': {
        const buildings = 4 + Math.floor(rng() * 2);
        const placed = [];
        for (let i = 0; i < buildings; i++) {
          const bw = 5 + Math.floor(rng() * 4);
          const bh = 5 + Math.floor(rng() * 4);
          const bx = Math.round(x + (rng() * 2 - 1) * (radius - bw / 2 - 2));
          const by = Math.round(y + (rng() * 2 - 1) * (radius - bh / 2 - 2));
          if (placed.some(p => Math.abs(p.x - bx) < bw + 3 && Math.abs(p.y - by) < bh + 3)) continue;
          placed.push({ x: bx, y: by });
          this.placeBuilding(bx, by, bw, bh, rng() < 0.4 ? 'stone' : 'wood');
        }
        // Crates around town
        for (let i = 0; i < 12; i++) {
          const cx = Math.round(x + (rng() * 2 - 1) * (radius - 2));
          const cy = Math.round(y + (rng() * 2 - 1) * (radius - 2));
          if (this.groundLayer[cy * tilesX + cx] === TILE.GRASS || this.groundLayer[cy * tilesX + cx] === TILE.GRASS_VARIANT) {
            setTile(cx, cy, TILE.CRATE);
          }
        }
        break;
      }

      case 'crates': {
        for (let i = 0; i < 3; i++) {
          const bw = 6 + Math.floor(rng() * 3);
          const bh = 6 + Math.floor(rng() * 3);
          this.placeBuilding(Math.round(x - bw / 2), Math.round(y - bh / 2), bw, bh, 'wood');
        }
        for (let i = 0; i < 26; i++) {
          const cx = Math.round(x + (rng() * 2 - 1) * radius);
          const cy = Math.round(y + (rng() * 2 - 1) * radius);
          const g = this.groundLayer[cy * tilesX + cx];
          if (g === TILE.GRASS || g === TILE.GRASS_VARIANT) setTile(cx, cy, TILE.CRATE);
        }
        break;
      }

      case 'forest': {
        for (let ty = Math.floor(y - radius); ty <= y + radius; ty++) {
          for (let tx = Math.floor(x - radius); tx <= x + radius; tx++) {
            const d = Math.hypot(tx - x, ty - y) / radius;
            if (d > 1) continue;
            const prob = (1 - d) * (0.55 + rng() * 0.25);
            if (rng() < prob) setTile(tx, ty, rng() < 0.6 ? TILE.TREE : TILE.TREE_2);
          }
        }
        break;
      }

      case 'quarry': {
        // Stone patches + scattered rocks
        for (let ty = Math.floor(y - radius); ty <= y + radius; ty++) {
          for (let tx = Math.floor(x - radius); tx <= x + radius; tx++) {
            const d = Math.hypot(tx - x, ty - y) / radius;
            if (d > 1) continue;
            if (rng() < 0.22 * (1 - d)) setGround(tx, ty, TILE.STONE);
            if (rng() < 0.3 * (1 - d)) setTile(tx, ty, rng() < 0.5 ? TILE.ROCK : TILE.ROCK_2);
          }
        }
        break;
      }

      case 'ruins': {
        // Stone floor patches + broken wall lines
        const lines = 5 + Math.floor(rng() * 3);
        for (let i = 0; i < lines; i++) {
          const startX = Math.round(x + (rng() * 2 - 1) * (radius - 4));
          const startY = Math.round(y + (rng() * 2 - 1) * (radius - 4));
          const len = 3 + Math.floor(rng() * 5);
          const horizontal = rng() < 0.5;
          for (let l = 0; l < len; l++) {
            const tx = horizontal ? startX + l : startX;
            const ty = horizontal ? startY : startY + l;
            if (rng() < 0.2) continue; // broken gap
            setTile(tx, ty, TILE.STONE_WALL);
          }
        }
        for (let ty = Math.floor(y - radius); ty <= y + radius; ty++) {
          for (let tx = Math.floor(x - radius); tx <= x + radius; tx++) {
            const d = Math.hypot(tx - x, ty - y) / radius;
            if (d > 1) continue;
            if (rng() < 0.25 * (1 - d)) setGround(tx, ty, TILE.STONE_FLOOR);
          }
        }
        break;
      }

      case 'lake': {
        const rx = radius + Math.floor(rng() * 3);
        const ry = radius + Math.floor(rng() * 3);
        for (let ty = Math.floor(y - ry); ty <= y + ry; ty++) {
          for (let tx = Math.floor(x - rx); tx <= x + rx; tx++) {
            const d = Math.hypot((tx - x) / rx, (ty - y) / ry);
            if (d <= 1) {
              setTile(tx, ty, TILE.WATER);
            } else if (d <= 1.18) {
              setGround(tx, ty, TILE.SAND);
            }
          }
        }
        break;
      }
    }
  }

  placeBuilding(tx0, ty0, w, h, style) {
    const wall = style === 'stone' ? TILE.STONE_WALL : TILE.WOOD_WALL;
    const floor = style === 'stone' ? TILE.STONE_FLOOR : TILE.WOOD_FLOOR;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const isWall = tx === 0 || ty === 0 || tx === w - 1 || ty === h - 1;
        const wx = tx0 + tx;
        const wy = ty0 + ty;
        if (wx < 0 || wy < 0 || wx >= this.tilesX || wy >= this.tilesY) continue;
        const idx = wy * this.tilesX + wx;
        if (isWall) {
          this.groundLayer[idx] = wall;
          this.collisionLayer[idx] = wall;
        } else {
          this.groundLayer[idx] = floor;
          this.collisionLayer[idx] = 0;
        }
      }
    }
    // Door gap on the bottom wall
    const doorX = tx0 + Math.floor(w / 2);
    const doorY = ty0 + h - 1;
    if (doorX >= 0 && doorX < this.tilesX && doorY >= 0 && doorY < this.tilesY) {
      const idx = doorY * this.tilesX + doorX;
      this.groundLayer[idx] = floor;
      this.collisionLayer[idx] = 0;
    }
  }

  // ── Queries ──────────────────────────────────────────────
  tileAt(worldX, worldY) {
    const tx = Math.floor(worldX / TILE_SIZE);
    const ty = Math.floor(worldY / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.tilesX || ty >= this.tilesY) return 0;
    return this.collisionLayer[ty * this.tilesX + tx];
  }

  isSolid(worldX, worldY) {
    return this.tileMap.isSolidAt(worldX, worldY);
  }

  isWaterAt(worldX, worldY) {
    return this.tileMap.isWaterAt(worldX, worldY);
  }

  // Resolve a circle out of solid tiles (server-authoritative).
  // Delegates to the SAME resolver the client uses for prediction,
  // so local and authoritative physics stay in lockstep.
  resolveCircle(x, y, radius) {
    return this.tileMap.resolveCircle(x, y, radius);
  }

  // Safe, well-separated spawn positions
  getSafeSpawnPositions(count) {
    const rng = this.rng;
    const margin = TILE_SIZE * 5;
    const minSep = 180;
    const spawns = [];
    let attempts = 0;

    while (spawns.length < count && attempts < count * 80) {
      attempts++;
      const x = margin + rng() * (MAP_WIDTH - margin * 2);
      const y = margin + rng() * (MAP_HEIGHT - margin * 2);
      if (this.isSolid(x, y) || this.isWaterAt(x, y)) continue;
      if (spawns.some(s => Math.hypot(s.x - x, s.y - y) < minSep)) continue;
      spawns.push({ x, y });
    }

    // Fallback: scan walkable tiles
    if (spawns.length < count) {
      outer:
      for (let ty = 6; ty < this.tilesY - 6 && spawns.length < count; ty += 3) {
        for (let tx = 6; tx < this.tilesX - 6 && spawns.length < count; tx += 3) {
          const x = tx * TILE_SIZE + TILE_SIZE / 2;
          const y = ty * TILE_SIZE + TILE_SIZE / 2;
          if (this.isSolid(x, y) || this.isWaterAt(x, y)) continue;
          if (spawns.some(s => Math.hypot(s.x - x, s.y - y) < minSep)) continue;
          spawns.push({ x, y });
          if (spawns.length >= count) break outer;
        }
      }
    }

    return spawns;
  }

  // Serialize map state for clients (compressed base64 layers)
  toMapData() {
    return {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tileSize: TILE_SIZE,
      tilesX: this.tilesX,
      tilesY: this.tilesY,
      ground: Buffer.from(this.groundLayer.buffer).toString('base64'),
      collision: Buffer.from(this.collisionLayer.buffer).toString('base64'),
      pois: this.pois,
    };
  }
}

// Deterministic hash for road texture variation
function rngDeterministic(tx, ty) {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
