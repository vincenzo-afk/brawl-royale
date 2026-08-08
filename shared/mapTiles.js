// ============================================================
// SHARED MAP TILES — tile IDs + predicates used by client & server
// ============================================================

export const TILE = {
  // Ground (walkable)
  GRASS: 0,
  GRASS_VARIANT: 1,
  WOOD_FLOOR: 10,
  STONE_FLOOR: 12,
  SAND: 31,
  ROAD: 60,
  ROAD_VARIANT: 61,

  // Walls (solid)
  WALL: 2,
  WALL_VARIANT: 3,
  STONE: 4,
  WOOD_WALL: 11,
  STONE_WALL: 13,

  // Nature (solid)
  ROCK: 20,
  ROCK_2: 21,
  ROCK_3: 22,
  TREE: 40,
  TREE_2: 41,

  // Objects (solid)
  CRATE: 50,

  // Water (not solid, slows movement)
  WATER: 30,
};

const SOLID_IDS = new Set([
  TILE.WALL, TILE.WALL_VARIANT, TILE.STONE,
  TILE.WOOD_WALL, TILE.STONE_WALL,
  TILE.ROCK, TILE.ROCK_2, TILE.ROCK_3,
  TILE.TREE, TILE.TREE_2,
  TILE.CRATE,
]);

export function isSolidTile(id) {
  return SOLID_IDS.has(id);
}

export function isWaterTile(id) {
  return id === TILE.WATER;
}

// Tile → base color used by the client renderer
export const TILE_COLORS = {
  [TILE.GRASS]: '#1e3a1f',
  [TILE.GRASS_VARIANT]: '#254525',
  [TILE.WALL]: '#6b5644',
  [TILE.WALL_VARIANT]: '#7a6350',
  [TILE.STONE]: '#8f8a83',
  [TILE.WOOD_FLOOR]: '#8a6d47',
  [TILE.WOOD_WALL]: '#7d5f3e',
  [TILE.STONE_FLOOR]: '#6e6e78',
  [TILE.STONE_WALL]: '#5c5c66',
  [TILE.ROCK]: '#77716a',
  [TILE.ROCK_2]: '#6f6962',
  [TILE.ROCK_3]: '#827c74',
  [TILE.WATER]: '#1d5f8f',
  [TILE.SAND]: '#c9b17a',
  [TILE.TREE]: '#173a1a',
  [TILE.TREE_2]: '#143317',
  [TILE.CRATE]: '#8a6a3a',
  [TILE.ROAD]: '#4a4a4a',
  [TILE.ROAD_VARIANT]: '#424242',
};

// Decoration tiles that get an emoji glyph on top of their base color
export const TILE_EMOJI = {
  [TILE.TREE]: '🌲',
  [TILE.TREE_2]: '🌳',
  [TILE.ROCK]: '🪨',
  [TILE.ROCK_2]: '🪨',
  [TILE.ROCK_3]: '🗿',
  [TILE.CRATE]: '📦',
  [TILE.WATER]: '💧',
  [TILE.SAND]: '·',
};
