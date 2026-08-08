// ============================================================
// THREE MODELS — low-poly player + weapon factories
// Players are built from shared "templates" (one per skin) and
// cloned per entity. Clones share geometry & materials, so 80
// characters stay cheap. Animations are applied per-frame to
// named parts (legs/arms bob, crouch squash, sprint lean, ADS).
// ============================================================
import * as THREE from 'three';

export const SKIN_COLORS = [
  '#4cc9f0', '#f72585', '#7209b7', '#3a86ff',
  '#fb8500', '#2dc653', '#e63946', '#ffd60a',
];

// Shared weapon-palette materials (module-level, reused everywhere)
const W_GRIP = new THREE.MeshLambertMaterial({ color: 0x2b2318 });
const W_BODY = new THREE.MeshLambertMaterial({ color: 0x3d3d48 });
const W_DARK = new THREE.MeshLambertMaterial({ color: 0x22222a });
const W_LIGHT = new THREE.MeshLambertMaterial({ color: 0x7d7d8c });
const W_ACCENT = new THREE.MeshLambertMaterial({ color: 0xf5a623 });
const W_SCOPE = new THREE.MeshLambertMaterial({ color: 0x14141c });

function shade(hex, factor) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return c;
}

// ── Skin materials (shared per skin index) ──────────────────
const skinMats = new Map();
function skinMaterials(i) {
  let mats = skinMats.get(i);
  if (mats) return mats;
  const base = SKIN_COLORS[i % SKIN_COLORS.length];
  mats = {
    body: new THREE.MeshLambertMaterial({ color: base }),
    head: new THREE.MeshLambertMaterial({ color: shade(base, 1.12) }),
    limbs: new THREE.MeshLambertMaterial({ color: shade(base, 0.62) }),
    dark: new THREE.MeshLambertMaterial({ color: 0x1c1c24 }),
    belt: new THREE.MeshLambertMaterial({ color: 0x2a2a33 }),
  };
  skinMats.set(i, mats);
  return mats;
}

// ── Weapon model builder (points along +Z) ──────────────────
const WEAPON_MODEL_CACHE = new Map();
function buildWeaponModel(kind) {
  if (WEAPON_MODEL_CACHE.has(kind)) return WEAPON_MODEL_CACHE.get(kind);
  const g = new THREE.Group();
  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const cyl = (rt, rb, h, mat, x = 0, y = 0, z = 0, rotX = Math.PI / 2) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), mat);
    m.rotation.x = rotX;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };

  switch (kind) {
    case 'pistol':
      box(4, 5, 10, W_BODY, 0, 0, 2);          // slide
      box(3, 3.4, 6, W_DARK, 0, -1.5, 6);      // barrel
      box(3.5, 6, 4, W_GRIP, 0, -4, -2);       // grip
      break;
    case 'smg':
      box(4.5, 5, 14, W_BODY, 0, 0, 1);
      box(3, 3.4, 7, W_DARK, 0, -1.5, 7);
      box(3.5, 7, 5, W_DARK, 0, -4, -1);       // mag
      box(2.5, 3.5, 3, W_GRIP, 0, -3, -5);     // grip
      break;
    case 'shotgun':
      box(4.5, 5.5, 15, W_BODY, 0, 0, 1);
      cyl(2, 2, 12, W_DARK, 0, 0, 8);          // barrel tube
      box(3.5, 4, 5, W_LIGHT, 0, 0, -3);       // pump
      box(3, 6, 4, W_GRIP, 0, -3.5, -6);
      break;
    case 'rifle':
      box(4.5, 5.5, 18, W_BODY, 0, 0, 1);
      cyl(1.6, 1.6, 14, W_DARK, 0, 0, 11);
      box(3, 4, 6, W_DARK, 0, -2, -8);         // stock
      box(3.5, 7, 5, W_DARK, 0, -4, 2);        // mag
      box(2.5, 3.5, 3, W_GRIP, 0, -3, -6);
      break;
    case 'dmr':
      box(4.5, 5.5, 20, W_BODY, 0, 0, 1);
      cyl(1.5, 1.5, 17, W_DARK, 0, 0, 13);
      box(3, 4, 7, W_DARK, 0, -2, -9);
      box(3.5, 7, 5, W_DARK, 0, -4, 2);
      box(2.5, 3.5, 3, W_GRIP, 0, -3, -6);
      cyl(2, 2, 4, W_LIGHT, 0, 2.5, 6, 0);     // scope ring
      break;
    case 'sniper':
      box(4, 5, 24, W_BODY, 0, 0, 1);
      cyl(1.4, 1.4, 20, W_DARK, 0, 0, 15);
      box(2.8, 4, 8, W_DARK, 0, -2, -10);
      box(2.8, 7, 4, W_DARK, 0, -4, 1);        // mag
      cyl(2.6, 2.6, 9, W_SCOPE, 0, 3, 5, 0);   // scope
      cyl(1.1, 1.1, 3, W_ACCENT, 0, 3, 10, 0);
      break;
    case 'lmg':
      box(5, 6, 20, W_BODY, 0, 0, 1);
      cyl(2, 2, 15, W_DARK, 0, 0, 12);
      box(3, 4, 7, W_DARK, 0, -2, -9);
      cyl(5, 5, 5, W_DARK, 0, -2.5, 4, 0);     // drum
      box(2.5, 3.5, 3, W_GRIP, 0, -3, -6);
      box(2, 2, 5, W_ACCENT, 0, 4.5, 4);       // front grip
      break;
    case 'rpg':
      cyl(3.4, 3.4, 24, W_BODY, 0, 0, 1);      // tube
      cyl(1.6, 1.6, 3, W_ACCENT, 0, 0, 15);    // warhead
      box(4, 2, 4, W_ACCENT, 0, 0, -7);        // grip block
      box(3, 3, 6, W_GRIP, 0, -1, -11);
      box(8, 0.8, 3, W_ACCENT, 0, 3.4, -4);    // fins
      box(8, 0.8, 3, W_ACCENT, 0, -3.4, -4);
      break;
    default: // fists / melee — bare hands, nothing to draw
      break;
  }
  WEAPON_MODEL_CACHE.set(kind, g);
  return g;
}

// ── Player template builder ─────────────────────────────────
const templates = new Map();
export function getPlayerTemplate(skin) {
  const idx = skin % SKIN_COLORS.length;
  let t = templates.get(idx);
  if (t) return t;

  const mats = skinMaterials(idx);
  const g = new THREE.Group();

  // Blob shadow (circle on the ground, unaffected by model rotation)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(17, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.6;
  shadow.name = 'shadow';
  g.add(shadow);

  // Legs (pivot at hip)
  const legGeo = new THREE.BoxGeometry(9, 20, 10);
  legGeo.translate(0, -10, 0);
  const legL = new THREE.Mesh(legGeo, mats.limbs);
  legL.position.set(-6, 22, 0);
  legL.name = 'legL';
  const legR = new THREE.Mesh(legGeo, mats.limbs);
  legR.position.set(6, 22, 0);
  legR.name = 'legR';
  g.add(legL, legR);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(22, 26, 15), mats.body);
  torso.position.set(0, 40, 0);
  torso.name = 'torso';
  g.add(torso);

  // Belt / pants band
  const belt = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 14), mats.belt);
  belt.position.set(0, 29, 0);
  belt.name = 'belt';
  g.add(belt);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 10), mats.head);
  head.position.set(0, 62, 0);
  head.name = 'head';
  g.add(head);
  // Helmet visor accent (keeps facing aim)
  const visor = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 2), mats.dark);
  visor.position.set(0, 63, 8);
  visor.name = 'visor';
  g.add(visor);

  // Arms (pivot at shoulder)
  const armGeo = new THREE.BoxGeometry(7, 20, 8);
  armGeo.translate(0, -10, 0);
  const armL = new THREE.Mesh(armGeo, mats.limbs);
  armL.position.set(-14, 46, 0);
  armL.name = 'armL';
  const armR = new THREE.Mesh(armGeo, mats.limbs);
  armR.position.set(14, 46, 0);
  armR.name = 'armR';
  g.add(armL, armR);

  // Weapon anchor — right hand (torso child so it inherits lean)
  const anchor = new THREE.Object3D();
  anchor.position.set(15, 42, 6);
  anchor.name = 'weaponAnchor';
  torso.add(anchor);

  templates.set(idx, g);
  return g;
}

// Clone a template into a fresh instance
export function createPlayerModel(skin) {
  const template = getPlayerTemplate(skin);
  const clone = template.clone(true);
  clone.userData.anim = { phase: Math.random() * 10, speed: 0, moving: false };
  return clone;
}

// Attach/detach a weapon model by kind
export function setWeaponModel(model, weaponKind) {
  const anchor = model.getObjectByName('weaponAnchor');
  if (!anchor) return;
  // Clear old weapon
  while (anchor.children.length) anchor.remove(anchor.children[0]);
  if (weaponKind && weaponKind !== 'melee') {
    const w = buildWeaponModel(weaponKind).clone();
    w.traverse(o => { if (o.isMesh) o.castShadow = false; });
    anchor.add(w);
  }
}

// ── Per-frame animation ─────────────────────────────────────
// animState: { moving, speed01, phase, crouch, sprint, ads, reloading, healing }
export function animatePlayerModel(model, animState, now = 0) {
  const legL = model.getObjectByName('legL');
  const legR = model.getObjectByName('legR');
  const armL = model.getObjectByName('armL');
  const armR = model.getObjectByName('armR');
  const torso = model.getObjectByName('torso');
  const shadow = model.getObjectByName('shadow');
  if (!legL) return;

  const { moving = false, speed01 = 0, phase = 0, crouch = false, sprint = false, ads = false, reloading = false, healing = false } = animState;

  const amp = moving ? (0.55 + speed01 * 0.5) * (sprint ? 1.25 : 1) : 0.04;
  const swing = Math.sin(phase);
  legL.rotation.x = swing * amp;
  legR.rotation.x = -swing * amp;
  armL.rotation.x = -swing * amp * 0.8;
  armR.rotation.x = swing * amp * 0.8;

  // Body bob
  const bob = moving ? Math.abs(Math.sin(phase)) * (sprint ? 2.6 : 1.7) * (0.4 + speed01 * 0.6) : 0;
  model.position.y = bob;

  // Crouch — squash + lower
  const crouchScale = crouch ? 0.62 : 1;
  model.scale.set(1, crouchScale, 1);
  if (shadow) {
    shadow.scale.set(crouch ? 0.8 : 1, crouch ? 0.8 : 1, 1);
    shadow.position.y = 0.6;
  }

  // Sprint — lean forward + arms drive more
  if (torso) {
    const lean = sprint && moving ? 0.32 : crouch ? 0.14 : 0.08;
    torso.rotation.x = lean;
  }

  // ADS — raise the weapon toward the eye
  const anchor = model.getObjectByName('weaponAnchor');
  if (anchor) {
    if (ads) {
      anchor.position.set(7, 58, 5);
    } else {
      anchor.position.set(15, 42, 6);
    }
    if (reloading) anchor.rotation.x = -0.5;
    else anchor.rotation.x = 0;
  }

  // Healing — hover-pulse ring is handled by effects; gentle sway here
  if (healing) {
    model.rotation.z = Math.sin(now / 250) * 0.04;
  } else if (!moving) {
    model.rotation.z = 0;
  } else {
    model.rotation.z = Math.cos(phase) * 0.02 * amp;
  }
}
