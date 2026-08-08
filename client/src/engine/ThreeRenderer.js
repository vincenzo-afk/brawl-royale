// ============================================================
// THREE RENDERER — the full 3D presentation layer
// World coords map 1:1 from the game: three(x, y=height, z) = game(x, y).
// Tiles become 3D terrain + props; players become animated models.
// ============================================================
import * as THREE from 'three';
import {
  TILE, TILE_COLORS, LOOT_TIERS, isWaterTile,
} from 'battle-royale-shared';
import { WEAPON_META } from '../game/WeaponMeta.js';
import { ThreeEffects } from './ThreeEffects.js';
import { createPlayerModel, setWeaponModel, animatePlayerModel } from './ThreeModels.js';

const TS = 32; // tile size (matches shared TILE_SIZE)

const SKY_VERT = `
  varying vec3 vWorld;
  void main() {
    vWorld = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float night;
  uniform float flash;
  varying vec3 vWorld;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  void main() {
    float h = clamp(vWorld.y, -1.0, 1.0);
    vec3 col = mix(bottomColor, topColor, smoothstep(-0.08, 0.4, h));
    float sun = pow(max(dot(vWorld, normalize(sunDir)), 0.0), 600.0);
    float halo = pow(max(dot(vWorld, normalize(sunDir)), 0.0), 24.0) * 0.35;
    col += sunColor * sun + sunColor * halo * 0.25;
    // Stars — only on the upper half, stronger at night
    if (vWorld.y > 0.02) {
      vec3 sp = vWorld * 240.0;
      vec3 cell = floor(sp);
      vec3 f = fract(sp);
      float star = hash(cell);
      star = step(0.992, star) * smoothstep(0.0, 0.5, f.y);
      col += vec3(star) * night * (0.7 + 0.3 * hash(cell + 7.0));
    }
    col += vec3(0.55, 0.65, 1.0) * flash * 0.5;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Darken the area outside the storm circle
const STORM_PLANE_VERT = `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vWorld = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const STORM_PLANE_FRAG = `
  uniform vec3 center;
  uniform float radius;
  uniform float intensity;
  varying vec3 vWorld;
  void main() {
    float d = distance(vWorld.xz, center.xz);
    if (d < radius) discard;
    float edge = smoothstep(radius, radius + 260.0, d);
    gl_FragColor = vec4(0.075, 0.0, 0.2, intensity * (0.55 + edge * 0.45));
  }
`;

const DAY = {
  top: 0x3d7ed6, bottom: 0xbfe3c0, fog: 0xb8d4bb,
  hemiSky: 0xa8c8e8, hemiGround: 0x2a3a2a, hemiInt: 1.05,
  sunColor: 0xfff2c8, sunInt: 1.45,
};
const NIGHT = {
  top: 0x05070f, bottom: 0x0d1a2b, fog: 0x060b14,
  hemiSky: 0x33405e, hemiGround: 0x0a0f18, hemiInt: 0.34,
  sunColor: 0xcfe0ff, sunInt: 0.12,
};

export class ThreeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(DAY.fog, 750, 2600);

    this.threeCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 6000);
    this.threeCamera.position.set(0, 500, 0);
    this.threeCamera.lookAt(0, 0, 0);

    // ── Lights ────────────────────────────────────────────────
    this.hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemiInt);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(DAY.sunColor, DAY.sunInt);
    this.scene.add(this.sun);
    this.moon = new THREE.DirectionalLight(0x9fb8ff, 0.22);
    this.moon.position.set(-600, 800, 400);
    this.scene.add(this.moon);

    // Lightning flash intensity boost (decays over a few frames)
    this._flashBoost = 0;

    // ── Sky sphere ────────────────────────────────────────────
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        topColor: { value: new THREE.Color(DAY.top) },
        bottomColor: { value: new THREE.Color(DAY.bottom) },
        sunDir: { value: new THREE.Vector3(0.5, 0.85, 0.35).normalize() },
        sunColor: { value: new THREE.Color(DAY.sunColor) },
        night: { value: 0 },
        flash: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2800, 28, 18), this.skyMat);
    sky.name = 'skySphere';
    sky.renderOrder = -10;
    this.scene.add(sky);
    this._skyFlash = 0;
    this._sunColorTmp = new THREE.Color();
    this._topTmp = new THREE.Color();
    this._botTmp = new THREE.Color();

    // ── Storm group ───────────────────────────────────────────
    this.stormGroup = new THREE.Group();
    this.stormGroup.visible = false;
    this.stormWall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 520, 72, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x2a0a4a, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })
    );
    this.stormWall.renderOrder = 2;
    this.stormGroup.add(this.stormWall);
    this.stormRing1 = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 72),
      new THREE.MeshBasicMaterial({ color: 0x7b2dff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    this.stormRing1.rotation.x = -Math.PI / 2;
    this.stormRing1.position.y = 3;
    this.stormGroup.add(this.stormRing1);
    this.stormRing2Spin = new THREE.Group();
    this.stormRing2 = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 72),
      new THREE.MeshBasicMaterial({ color: 0xc9a0ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.stormRing2.rotation.x = -Math.PI / 2;
    this.stormRing2.position.y = 4;
    this.stormRing2Spin.add(this.stormRing2);
    this.stormGroup.add(this.stormRing2Spin);

    this.stormPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(4096, 4096),
      new THREE.ShaderMaterial({
        vertexShader: STORM_PLANE_VERT,
        fragmentShader: STORM_PLANE_FRAG,
        uniforms: {
          center: { value: new THREE.Vector2(2048, 2048) },
          radius: { value: 2000 },
          intensity: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
      })
    );
    this.stormPlane.rotation.x = -Math.PI / 2;
    // The map spans 0..4096 on both axes — the 4096² plane must be centered at its middle.
    // Raised high so the darkness tints the whole scene outside the circle (players included).
    this.stormPlane.position.set(2048, 380, 2048);
    this.stormPlane.renderOrder = 1;
    this.scene.add(this.stormPlane);

    // Rain
    const RAIN_N = 650;
    this.rainPos = new Float32Array(RAIN_N * 3);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
      color: 0x9db4ff, size: 3, transparent: true, opacity: 0.32,
      depthWrite: false,
    }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    // ── Effects ───────────────────────────────────────────────
    this.effects = new ThreeEffects(this.scene);

    // ── Entity state ──────────────────────────────────────────
    this.worldBuilt = false;
    this.players = new Map();     // id → { model, nameSprite, weaponId, deathAt }
    this.projectileMeshes = new Map(); // id → mesh
    this._projPool = [];
    this._lootMesh = null;
    this._lootMat = null;
    this._anims = new Map();      // id → { phase, speed, lastX, lastZ }
    this.airdrops = new Map();    // key → { group, start, eta, landed }
    this._worldGroup = new THREE.Group();
    this.scene.add(this._worldGroup);
    this._rainReset();
  }

  // ── Public helpers ─────────────────────────────────────────
  resize(w, h) {
    this.renderer.setSize(w, h);
    this.threeCamera.aspect = w / h;
    this.threeCamera.updateProjectionMatrix();
  }

  flashLightning() {
    this._skyFlash = 1;
    this._flashBoost = 0.9;
  }

  addMuzzleFlash(x, y, angle, weaponId) { this.effects.addMuzzleFlash(x, y, angle, weaponId); }
  addBulletTrace(x1, y1, x2, y2, color) { this.effects.addBulletTrace(x1, y1, x2, y2, color); }
  addImpact(x, y, isHeadshot) { this.effects.addImpact(x, y, isHeadshot); }
  addBloodPool(x, y) { this.effects.addBloodPool(x, y); }
  addDamageNumber(x, y, dmg, isHeadshot, killed) { this.effects.addDamageNumber(x, y, dmg, isHeadshot, killed); }
  addDust(x, y) { this.effects.addDust(x, y); }
  addHealRing(x, y) { this.effects.addHealRing(x, y); }
  addFirefly(x, y) { this.effects.addFirefly(x, y); }
  addConfetti(x, y) { this.effects.addConfetti(x, y); }
  addExplosion(x, y) { this.effects.addExplosion(x, y); }
  addLightningBolt(x, y) { this.effects.addLightningBolt(x, y); }

  // ── World building ─────────────────────────────────────────
  buildWorld(mapData) {
    if (!mapData || this.worldBuilt) return;
    this.worldBuilt = true;
    const { tilesX, tilesY, ground, collision } = mapData;
    const g = this._worldGroup;

    // ── Ground (instanced quads, per-tile color) ─────────────
    const groundGeo = new THREE.PlaneGeometry(TS, TS);
    groundGeo.rotateX(-Math.PI / 2);
    const total = tilesX * tilesY;
    const groundMesh = new THREE.InstancedMesh(groundGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), total);
    groundMesh.frustumCulled = false;
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const pos = new THREE.Vector3();

    // Water tiles are collected for a separate animated plane
    const waterTiles = [];
    const waterMeshCount = countTiles(collision, tilesX, tilesY, isWaterTile);

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const idx = ty * tilesX + tx;
        const tile = ground[idx];
        const isWater = waterIdx(collision[idx]);
        if (isWater) waterTiles.push([tx, ty]);

        pos.set(tx * TS + TS / 2, 0, ty * TS + TS / 2);
        m4.makeTranslation(pos.x, pos.y, pos.z);
        groundMesh.setMatrixAt(idx, m4);

        let c = TILE_COLORS[tile] || TILE_COLORS[TILE.GRASS];
        if (tile === TILE.GRASS || tile === TILE.GRASS_VARIANT) {
          // Checkerboard + slight jitter, like the 2D renderer
          const jitter = hash2(tx, ty) * 0.12 - 0.06;
          const base = (tx + ty) % 2 === 0 ? 1 : 0.9;
          c = shadeHex(c, base + jitter);
        }
        if (collision[idx] === TILE.STONE) c = shadeHex(TILE_COLORS[TILE.STONE], 0.9 + hash2(tx, ty) * 0.2);
        col.set(c);
        groundMesh.setColorAt(idx, col);
      }
    }
    groundMesh.instanceMatrix.needsUpdate = true;
    if (groundMesh.instanceColor) groundMesh.instanceColor.needsUpdate = true;
    g.add(groundMesh);

    // ── Water (instanced, transparent, animated bob) ─────────
    if (waterMeshCount > 0) {
      const waterGeo = new THREE.PlaneGeometry(TS, TS);
      waterGeo.rotateX(-Math.PI / 2);
      const waterMesh = new THREE.InstancedMesh(waterGeo,
        new THREE.MeshPhongMaterial({ color: 0x1d5f8f, transparent: true, opacity: 0.72, shininess: 120, specular: 0x66aadd }),
        waterMeshCount);
      let wi = 0;
      for (const [tx, ty] of waterTiles) {
        pos.set(tx * TS + TS / 2, 0, ty * TS + TS / 2);
        m4.makeTranslation(pos.x, pos.y, pos.z);
        waterMesh.setMatrixAt(wi++, m4);
      }
      waterMesh.instanceMatrix.needsUpdate = true;
      waterMesh.frustumCulled = false;
      waterMesh.name = 'water';
      g.add(waterMesh);
      this.waterMesh = waterMesh;
    }

    // ── Solid props (instanced per kind) ─────────────────────
    // NOTE: TILE.STONE quarry patches are walkable ground (color-only,
    // handled in the ground pass) — no collision prop is spawned for them.
    const wallTiles = [TILE.WALL, TILE.WALL_VARIANT, TILE.WOOD_WALL, TILE.STONE_WALL];
    const rockTiles = [TILE.ROCK, TILE.ROCK_2, TILE.ROCK_3];
    const treeTiles = [TILE.TREE, TILE.TREE_2];
    const crateTiles = [TILE.CRATE];

    const counts = {
      walls: countTiles(collision, tilesX, tilesY, t => wallTiles.includes(t)),
      rocks: countTiles(collision, tilesX, tilesY, t => rockTiles.includes(t)),
      trees: countTiles(collision, tilesX, tilesY, t => treeTiles.includes(t)),
      crates: countTiles(collision, tilesX, tilesY, t => crateTiles.includes(t)),
    };

    if (counts.walls > 0) {
      const geo = new THREE.BoxGeometry(TS, 46, TS);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const mesh = new THREE.InstancedMesh(geo, mat, counts.walls);
      let i = 0;
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const t = collision[ty * tilesX + tx];
          if (!wallTiles.includes(t)) continue;
          pos.set(tx * TS + TS / 2, 23, ty * TS + TS / 2);
          m4.makeTranslation(pos.x, pos.y, pos.z);
          mesh.setMatrixAt(i, m4);
          const isStone = t === TILE.STONE_WALL || t === TILE.STONE;
          col.set(t === TILE.WOOD_WALL ? '#7d5f3e' : t === TILE.STONE_WALL ? '#5c5c66' : isStone ? '#8f8a83' : shadeHex('#6b5644', 0.92 + hash2(tx, ty) * 0.16));
          mesh.setColorAt(i, col);
          i++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      g.add(mesh);
      this.wallMesh = mesh;
    }

    if (counts.rocks > 0) {
      const geo = new THREE.DodecahedronGeometry(15, 0);
      geo.scale(1, 1.35, 1);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const mesh = new THREE.InstancedMesh(geo, mat, counts.rocks);
      mesh.frustumCulled = false;
      let i = 0;
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const t = collision[ty * tilesX + tx];
          if (!rockTiles.includes(t)) continue;
          const s = 0.8 + hash2(tx, ty) * 0.5;
          pos.set(tx * TS + TS / 2, 10 * s, ty * TS + TS / 2);
          m4.makeTranslation(pos.x, pos.y, pos.z);
          m4.multiply(m4.makeScale(s, s * 1.15, s));
          mesh.setMatrixAt(i, m4);
          col.set(t === TILE.ROCK_3 ? '#827c74' : t === TILE.ROCK_2 ? '#6f6962' : shadeHex('#77716a', 0.85 + hash2(tx, ty) * 0.3));
          mesh.setColorAt(i, col);
          i++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      g.add(mesh);
    }

    if (counts.trees > 0) {
      const trunkGeo = new THREE.CylinderGeometry(4, 5.5, 24, 6);
      trunkGeo.translate(0, 12, 0);
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3526 });
      const folGeo = new THREE.ConeGeometry(15, 34, 7);
      folGeo.translate(0, 32, 0);
      const folMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, counts.trees);
      const folMesh = new THREE.InstancedMesh(folGeo, folMat, counts.trees);
      trunkMesh.frustumCulled = false;
      folMesh.frustumCulled = false;
      let i = 0;
      const s = new THREE.Vector3();
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const t = collision[ty * tilesX + tx];
          if (!treeTiles.includes(t)) continue;
          const sc = 0.85 + hash2(tx, ty) * 0.5;
          pos.set(tx * TS + TS / 2, 0, ty * TS + TS / 2);
          m4.compose(pos, identityQuat, s.set(sc, sc, sc));
          trunkMesh.setMatrixAt(i, m4);
          folMesh.setMatrixAt(i, m4);
          col.set(t === TILE.TREE_2 ? '#1c4620' : '#2c5e2e');
          const folCol = new THREE.Color(col).multiplyScalar(0.75 + hash2(tx + 31, ty + 17) * 0.4);
          folMesh.setColorAt(i, folCol);
          i++;
        }
      }
      trunkMesh.instanceMatrix.needsUpdate = true;
      folMesh.instanceMatrix.needsUpdate = true;
      if (folMesh.instanceColor) folMesh.instanceColor.needsUpdate = true;
      g.add(trunkMesh, folMesh);
    }

    if (counts.crates > 0) {
      const geo = new THREE.BoxGeometry(24, 24, 24);
      geo.translate(0, 12, 0);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const mesh = new THREE.InstancedMesh(geo, mat, counts.crates);
      mesh.frustumCulled = false;
      let i = 0;
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const t = collision[ty * tilesX + tx];
          if (!crateTiles.includes(t)) continue;
          pos.set(tx * TS + TS / 2, 0, ty * TS + TS / 2);
          m4.makeTranslation(pos.x, pos.y, pos.z);
          mesh.setMatrixAt(i, m4);
          col.set(shadeHex('#8a6a3a', 0.9 + hash2(tx, ty) * 0.25));
          mesh.setColorAt(i, col);
          i++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      g.add(mesh);
    }

    // ── Loot instanced mesh ──────────────────────────────────
    const lootGeo = new THREE.OctahedronGeometry(10, 0);
    const lootMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lootMesh = new THREE.InstancedMesh(lootGeo, lootMat, 1100);
    lootMesh.frustumCulled = false;
    lootMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(lootMesh);
    this._lootMesh = lootMesh;
  }

  // ── Reset dynamic entities (new match) ─────────────────────
  resetEntities() {
    for (const { model, nameSprite } of this.players.values()) {
      this.scene.remove(model);
      if (nameSprite) this.scene.remove(nameSprite);
    }
    this.players.clear();
    this._anims.clear();
    this.effects.clear();
    for (const m of this.projectileMeshes.values()) this._freeProjectile(m);
    this.projectileMeshes.clear();
    for (const { group } of this.airdrops.values()) this.scene.remove(group);
    this.airdrops.clear();
    this._skyFlash = 0;
  }

  // ── Per-frame update + render ──────────────────────────────
  update(game, dt, now) {
    if (!this.worldBuilt && game.mapData) this.buildWorld(game.mapData);

    // ── Day / night + sky + lights ───────────────────────────
    const dn = game.dayNight?.getState?.(game.spawnTime ? Date.now() - game.spawnTime : 0) || { nightFactor: 0, tint: { r: 255, g: 246, b: 214, a: 0.05 } };
    const night = dn.nightFactor || 0;
    const tint = dn.tint || { r: 255, g: 246, b: 214, a: 0.05 };
    const mix = (a, b) => a + (b - a) * night;
    const tcol = new THREE.Color();
    tcol.setRGB(tint.r / 255, tint.g / 255, tint.b / 255);

    const fogCol = new THREE.Color(DAY.fog).lerp(new THREE.Color(NIGHT.fog), night);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.near = 700; this.scene.fog.far = 2500;

    const baseHemi = mix(DAY.hemiInt, NIGHT.hemiInt);
    const baseSun = mix(DAY.sunInt, NIGHT.sunInt);
    this.hemi.color.copy(new THREE.Color(DAY.hemiSky).lerp(new THREE.Color(NIGHT.hemiSky), night));
    this.hemi.groundColor.copy(new THREE.Color(DAY.hemiGround).lerp(new THREE.Color(NIGHT.hemiGround), night));
    this.hemi.intensity = baseHemi + this._flashBoost;
    this.sun.color.copy(new THREE.Color(DAY.sunColor).lerp(new THREE.Color(NIGHT.sunColor), night));
    this.sun.intensity = baseSun + this._flashBoost * 0.7;
    this._flashBoost = Math.max(0, this._flashBoost - dt * 2.2);

    // Sun position rotates with the day cycle
    const az = (dn.progress || 0) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(az), Math.sin(az), 0.4).normalize();
    this.sun.position.copy(sunDir).multiplyScalar(1400);
    const moonDir = sunDir.clone().multiplyScalar(-1);
    this.moon.position.copy(moonDir).multiplyScalar(1400);
    this.moon.intensity = night * 0.3;

    // Sky shader uniforms
    const u = this.skyMat.uniforms;
    u.night.value = night;
    u.sunDir.value.copy(sunDir);
    u.sunColor.value.copy(this._sunColorTmp.setRGB(1, 1, 1).lerp(tcol, tint.a * 0.4).multiplyScalar(mix(1.6, 0.5)));
    u.flash.value = Math.max(0, this._skyFlash);
    const topCol = this._topTmp.set(DAY.top).lerp(new THREE.Color(NIGHT.top), night);
    topCol.lerp(tcol, tint.a * 0.7);
    u.topColor.value.copy(topCol);
    const botCol = this._botTmp.set(DAY.bottom).lerp(new THREE.Color(NIGHT.bottom), night);
    botCol.lerp(tcol, tint.a * 0.5);
    u.bottomColor.value.copy(botCol);
    this._skyFlash = Math.max(0, this._skyFlash - dt * 3.2);

    // Sky sphere follows the camera so it never falls out of view
    this.scene.getObjectByName('skySphere')?.position.copy(this.threeCamera.position);

    // Water surface bob
    if (this.waterMesh) {
      this.waterMesh.position.y = 1.6 + Math.sin(now * 0.0012) * 1.1;
    }

    // ── Players ──────────────────────────────────────────────
    this._updatePlayers(game, dt, now);

    // ── Loot ─────────────────────────────────────────────────
    this._updateLoot(game.lootItems, now);

    // ── Projectiles ──────────────────────────────────────────
    this._updateProjectiles(game.projectiles, game, dt);

    // ── Storm ────────────────────────────────────────────────
    this._updateStorm(game, dt, now);

    // ── Airdrops ─────────────────────────────────────────────
    this._updateAirdrops(game, dt, now);

    // ── Effects + rain ───────────────────────────────────────
    this.effects.update(dt, now);
    this._updateRain(game, dt);

    this.renderer.render(this.scene, this.threeCamera);
  }

  // ── Players ────────────────────────────────────────────────
  _ensurePlayer(id, skin, name) {
    let entry = this.players.get(id);
    if (!entry) {
      const model = createPlayerModel(skin || 0);
      this.scene.add(model);
      entry = { model, nameSprite: null, weaponId: null, deathAt: 0 };
      if (name) entry.nameSprite = makeNameSprite(name);
      this.players.set(id, entry);
    }
    return entry;
  }

  _removePlayer(id) {
    const entry = this.players.get(id);
    if (!entry) return;
    this.scene.remove(entry.model);
    if (entry.nameSprite) this.scene.remove(entry.nameSprite);
    this.players.delete(id);
    this._anims.delete(id);
  }

  _updatePlayers(game, dt, now) {
    const interp = game.interpolation;
    const isSpectating = game.state === 'dead' || game.state === 'spectating';

    // Ensure models for everyone
    for (const p of game.players.values()) {
      if (!this.players.has(p.id)) this._ensurePlayer(p.id, p.skin, p.name);
    }

    // Camera position (for name-tag distance culling)
    const camX = this.threeCamera.position.x;
    const camZ = this.threeCamera.position.z;

    for (const [id, entry] of this.players) {
      // Clean up leavers
      if (!game.players.has(id)) {
        if (!entry.deathAt || now - entry.deathAt > 800) {
          this._removePlayer(id);
          continue;
        }
      }

      const p = game.players.get(id);
      const isLocal = id === game.localPlayerId;

      let state;
      if (isLocal) {
        state = game.localPlayer;
      } else if (interp) {
        state = interp.getInterpolatedState(id, now) || p;
      } else {
        state = p;
      }
      if (!state) continue;

      const model = entry.model;
      const alive = state.alive !== false;

      // Death → falling animation once
      if (!alive && !entry.deathAt) {
        entry.deathAt = now;
      }
      if (entry.deathAt) {
        const t = (now - entry.deathAt) / 700;
        if (t >= 1) { model.visible = false; continue; }
        model.position.x = state.x;
        model.position.z = state.y;
        model.position.y = 4;
        model.rotation.y = Math.PI / 2 - (state.angle || 0);
        model.rotation.z = (t * t) * Math.PI / 2;
        if (entry.nameSprite) entry.nameSprite.visible = false;
        continue;
      }

      // Hide local player's own model when dead/spectating others
      if (isLocal && !game.localPlayer?.alive) { model.visible = false; continue; }
      if (!alive) { model.visible = false; continue; }
      model.visible = true;

      // Position + rotation
      const x = state.x;
      const z = state.y;
      const angle = state.angle || 0;
      model.position.x = x;
      model.position.z = z;
      model.rotation.y = Math.PI / 2 - angle;

      // Animation state
      const anim = this._updateAnim(id, x, z, dt);
      const moving = anim.moving;
      const sprint = !!state.isSprinting;
      const crouch = !!state.isCrouching;
      const ads = !!state.isADS;
      const reloading = !!state.isReloading;
      const healing = !!state.isHealing;
      animatePlayerModel(model, {
        moving, speed01: Math.min(1, anim.speed / 190),
        phase: anim.phase, crouch, sprint, ads, reloading, healing,
      }, now);

      // Weapon model (derived from live inventory)
      const slot = state.inventory?.[state.activeSlot];
      const weaponId = slot?.weaponId || state.activeWeaponId || null;
      const kind = (weaponId && WEAPON_META[weaponId]?.kind) || 'melee';
      if (kind !== entry.weaponId) {
        entry.weaponId = kind;
        setWeaponModel(model, kind);
      }

      // Name tag (remote players within range)
      if (entry.nameSprite) {
        const dx = x - camX;
        const dz = z - camZ;
        const dist = Math.hypot(dx, dz);
        entry.nameSprite.visible = !isLocal && dist < 950 && game.state === 'playing';
        if (entry.nameSprite.visible) {
          entry.nameSprite.position.set(x, 96, z);
          entry.nameSprite.material.opacity = Math.max(0.35, 1 - dist / 950);
        }
      }
    }
  }

  _updateAnim(id, x, z, dt) {
    let a = this._anims.get(id);
    if (!a) {
      a = { phase: Math.random() * 10, speed: 0, lastX: x, lastZ: z };
      this._anims.set(id, a);
    }
    const dist = Math.hypot(x - a.lastX, z - a.lastZ);
    const inst = dt > 0 ? dist / dt : 0;
    a.speed = Math.min(400, a.speed * 0.8 + inst * 0.2);
    a.lastX = x;
    a.lastZ = z;
    if (dist > 0.4) a.phase += Math.min(1.6, inst / 170) * Math.PI * 2 * dt;
    return { phase: a.phase, speed: a.speed, moving: inst > 20 };
  }

  // ── Loot ───────────────────────────────────────────────────
  _updateLoot(lootItems, now) {
    const mesh = this._lootMesh;
    if (!mesh) return;
    const items = lootItems ? [...lootItems.values()].filter(l => l.alive !== false) : [];
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const pos = new THREE.Vector3();
    const N = Math.min(items.length, 1100);
    mesh.count = N;
    for (let i = 0; i < N; i++) {
      const item = items[i];
      const bob = Math.sin(now / 550 + i * 1.7) * 2.4;
      pos.set(item.x, 9 + bob, item.y);
      m4.compose(pos, idQuat2, oneScale2);
      mesh.setMatrixAt(i, m4);
      col.set(LOOT_TIERS[item.tier]?.color || '#aaa');
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // ── Projectiles ────────────────────────────────────────────
  _getProjectileMesh() {
    let m = this._projPool.pop();
    if (!m) {
      m = new THREE.Mesh(
        new THREE.SphereGeometry(6, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.95 })
      );
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0xff9a3d, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.setScalar(26);
      m.add(glow);
      m.userData.glow = glow;
    }
    m.visible = true;
    this.scene.add(m);
    return m;
  }

  _freeProjectile(mesh) {
    this.scene.remove(mesh);
    mesh.visible = false;
    this._projPool.push(mesh);
  }

  _updateProjectiles(projectiles, game, dt) {
    if (!projectiles) return;
    // Spawn new
    for (const [id, proj] of projectiles) {
      if (!this.projectileMeshes.has(id) && proj) {
        const m = this._getProjectileMesh();
        this.projectileMeshes.set(id, m);
        // Muzzle flash at the owner for feedback on remote rockets
        if (proj.ownerId && proj.ownerId !== game.localPlayerId) {
          const owner = game.players.get(proj.ownerId);
          if (owner) this.addMuzzleFlash(owner.x, owner.y, owner.angle || 0, proj.weaponId);
        }
      }
    }
    // Update positions / remove dead
    for (const [id, mesh] of this.projectileMeshes) {
      const proj = projectiles.get(id);
      if (!proj) {
        this._freeProjectile(mesh);
        this.projectileMeshes.delete(id);
        continue;
      }
      mesh.position.set(proj.x, 46, proj.y);
      mesh.rotation.y = Math.PI / 2 - (proj.angle || 0);
      const isRpg = proj.weaponId === 'RPG';
      mesh.material.color.set(isRpg ? 0xffa040 : 0xffd75e);
      mesh.scale.setScalar(isRpg ? 1.35 : 1);
      if (mesh.userData.glow) mesh.userData.glow.material.color.set(isRpg ? 0xff7a2a : 0xffd75e);
      // Trail
      if (Math.random() < dt * 40) {
        this.addFirefly(proj.x + (Math.random() - 0.5) * 10, proj.y + (Math.random() - 0.5) * 10);
      }
    }
  }

  // ── Storm ──────────────────────────────────────────────────
  _updateStorm(game, dt, now) {
    const storm = game.storm;
    const visible = storm && storm.currentRadius > 0;
    this.stormGroup.visible = visible;
    this.stormPlane.visible = visible;

    if (!visible) {
      this.rain.visible = false;
      return;
    }
    const cx = storm.centerX || 2048;
    const cy = storm.centerY || 2048;
    const r = storm.currentRadius || 1;

    this.stormGroup.position.set(cx, 0, cy);
    this.stormWall.scale.set(r, 1, r);
    this.stormRing1.scale.set(r, r, r);
    this.stormRing2Spin.scale.set(r, r, r);
    this.stormRing2Spin.rotation.y = now * 0.0004;

    this.stormPlane.material.uniforms.center.value.set(cx, cy);
    this.stormPlane.material.uniforms.radius.value = r;
    this.stormPlane.material.uniforms.intensity.value = 1;

    // Storm lightning bolts + rumble flashes are triggered from Game.js
    this.rain.visible = true;
  }

  // ── Rain (falls around the camera, confined to storm radius) ──
  _rainReset() {
    const N = this.rainPos.length / 3;
    for (let i = 0; i < N; i++) {
      this.rainPos[i * 3 + 0] = (Math.random() - 0.5) * 2000;
      this.rainPos[i * 3 + 1] = Math.random() * 420;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 2000;
    }
  }

  _updateRain(game, dt) {
    if (!this.rain.visible) return;
    const storm = game.storm;
    if (!storm || !storm.currentRadius) return;
    const cx = this.threeCamera.position.x;
    const cz = this.threeCamera.position.z;
    const maxR = Math.min(storm.currentRadius, 900);
    const N = this.rainPos.length / 3;
    for (let i = 0; i < N; i++) {
      const ix = i * 3;
      this.rainPos[ix + 1] -= 340 * dt;
      const dx = this.rainPos[ix] - cx;
      const dz = this.rainPos[ix + 2] - cz;
      const tooFar = Math.hypot(dx, dz) > maxR;
      if (this.rainPos[ix + 1] < 0 || tooFar) {
        this.rainPos[ix + 1] = 380 + Math.random() * 40;
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * maxR;
        this.rainPos[ix] = cx + Math.cos(a) * rr;
        this.rainPos[ix + 2] = cz + Math.sin(a) * rr;
      }
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  // ── Airdrops ───────────────────────────────────────────────
  _updateAirdrops(game, dt, now) {
    const indicators = game._airdropIndicators || [];
    // Create crates for new indicators
    for (const ad of indicators) {
      const key = `${ad.x}|${ad.y}`;
      if (this.airdrops.has(key)) continue;
      const group = new THREE.Group();
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(46, 42, 46),
        new THREE.MeshLambertMaterial({ color: 0x9c6b2f })
      );
      crate.position.y = 0;
      const chute = new THREE.Mesh(
        new THREE.ConeGeometry(46, 30, 8),
        new THREE.MeshLambertMaterial({ color: 0xd94a4a })
      );
      chute.position.y = 56;
      const lineMat = new THREE.LineBasicMaterial({ color: 0xdddddd });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const pts = [new THREE.Vector3(Math.cos(a) * 20, 44, Math.sin(a) * 20), new THREE.Vector3(Math.cos(a) * 30, 62, Math.sin(a) * 30)];
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
        group.add(line);
      }
      group.add(crate, chute);
      this.scene.add(group);
      this.airdrops.set(key, {
        group, start: now, eta: ad.eta || 5000, landed: false,
        crate, chute, x: ad.x, z: ad.y,
      });
    }
    // Update positions + fall
    for (const [key, ad] of this.airdrops) {
      const elapsed = now - ad.start;
      const t = Math.min(1, elapsed / ad.eta);
      if (t >= 1) {
        if (!ad.landed) {
          ad.landed = true;
          ad.landedAt = now;
          this.addExplosion(ad.x, ad.z);
          this.addDust(ad.x, ad.z);
        }
        const fade = 1 - Math.max(0, (now - ad.landedAt) / 2500);
        ad.group.scale.setScalar(Math.max(0.01, fade));
        if (fade <= 0.01) {
          this.scene.remove(ad.group);
          this.airdrops.delete(key);
          continue;
        }
        ad.group.position.set(ad.x, 0, ad.z);
      } else {
        // Ease-out fall from the sky
        const ease = 1 - Math.pow(1 - t, 2.4);
        ad.group.position.set(ad.x, 620 * (1 - ease), ad.z);
      }
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────
const identityQuat = new THREE.Quaternion();
const idQuat2 = new THREE.Quaternion();
const oneScale2 = new THREE.Vector3(1, 1, 1);

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shadeHex(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c.getHex();
}

function countTiles(layer, tilesX, tilesY, pred) {
  let n = 0;
  for (let i = 0; i < layer.length; i++) if (pred(layer[i])) n++;
  return n;
}

// Water lives in the collision layer only (setTile writes both)
function waterIdx(collisionTile) {
  return collisionTile === TILE.WATER;
}

function makeNameSprite(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '700 30px Rajdhani, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(name, 128, 32);
  ctx.fillStyle = '#e8e8f0';
  ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  }));
  sprite.scale.set(60, 15, 1);
  sprite.visible = false;
  return sprite;
}
