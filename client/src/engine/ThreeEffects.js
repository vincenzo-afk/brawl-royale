// ============================================================
// THREE EFFECTS — pooled screen/world effects for the 3D renderer
// All coordinates are game coords (x, y) → three (x, 0, y).
// Effects are cheap primitives with a fixed max-life; dead ones
// are removed every frame.
// ============================================================
import * as THREE from 'three';

const MAX_TRACERS = 96;
const MAX_MUZZLE = 12;
const MAX_DAMAGE_NUMBERS = 48;
const MAX_PARTICLES = 320;

const tempV = new THREE.Vector3();
const ADDITIVE = THREE.AdditiveBlending;

export class ThreeEffects {
  constructor(scene) {
    this.scene = scene;
    this.effects = [];

    // Muzzle flash point lights (shared pool)
    this.flashLights = [];
    for (let i = 0; i < 6; i++) {
      const light = new THREE.PointLight(0xffb45e, 0, 160);
      light.visible = false;
      scene.add(light);
      this.flashLights.push(light);
    }
    this._lightIdx = 0;

    // Shared geometries
    this.sparkGeo = new THREE.BoxGeometry(4, 4, 4);
    this.confettiGeo = new THREE.BoxGeometry(7, 4, 2);

    // Shared sprite canvas for muzzle flashes
    this.muzzleTex = makeGlowTexture('#ffe9a8');
  }

  // ── Muzzle flash (game coords + aim angle) ─────────────────
  addMuzzleFlash(x, y, angle, weaponId = null) {
    const fx = x + Math.cos(angle) * 34;
    const fy = y + Math.sin(angle) * 34;
    const size = weaponId === 'SNIPER' ? 26 : weaponId === 'RPG' ? 30 : 18 + Math.random() * 8;

    const mat = new THREE.SpriteMaterial({
      map: this.muzzleTex, color: 0xfff2c0, transparent: true,
      opacity: 0.95, blending: ADDITIVE, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(fx, 52 + Math.random() * 6, fy);
    sprite.scale.set(size, size, 1);
    this.scene.add(sprite);
    this.effects.push({
      mesh: sprite, life: 0, maxLife: 0.05,
      update: (dt, t, e) => {
        const k = 1 - e.life / e.maxLife;
        sprite.material.opacity = k;
        sprite.scale.setScalar(size * (1 + (1 - k) * 0.9));
        const light = this.flashLights[this._lightIdx++ % this.flashLights.length];
        light.position.copy(sprite.position);
        light.intensity = 90 * k;
        light.visible = true;
        if (e.life >= e.maxLife - 0.016) { light.visible = false; light.intensity = 0; }
      },
    });
  }

  // ── Bullet tracer ─────────────────────────────────────────
  addBulletTrace(x1, y1, x2, y2, color = 0xffd75e) {
    if (this.effects.filter(e => e.isTracer).length >= MAX_TRACERS) return;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, 52, y1),
      new THREE.Vector3(x2, 52, y2),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.85, blending: ADDITIVE, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.effects.push({
      mesh: line, isTracer: true, life: 0, maxLife: 0.09,
      update: (dt, t, e) => { mat.opacity = Math.max(0, 0.85 * (1 - e.life / e.maxLife)); },
    });
  }

  // ── Impact sparks + blood burst at a point ────────────────
  addImpact(x, y, isHeadshot = false) {
    this._burst(x, y, isHeadshot ? 10 : 7, isHeadshot ? 0xffe066 : 0xffcf4d, 0.35, 200, 400, true, 42);
  }

  addBloodPool(x, y) {
    // Ground decal
    const r = 16 + Math.random() * 10;
    const decal = new THREE.Mesh(
      new THREE.CircleGeometry(r, 14),
      new THREE.MeshBasicMaterial({
        color: 0x7a1020, transparent: true, opacity: 0.5,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      })
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(x, 1.2, y);
    decal.rotation.z = Math.random() * Math.PI * 2;
    this.scene.add(decal);
    this.effects.push({
      mesh: decal, life: 0, maxLife: 9,
      update: (dt, t, e) => {
        decal.material.opacity = e.life > 7.5 ? 0.5 * (1 - (e.life - 7.5) / 1.5) : 0.5;
      },
    });

    // Red burst
    this._burst(x, y, 12, 0xa31427, 0.5, 220, 400, true, 28);
  }

  // ── Floating damage number ────────────────────────────────
  addDamageNumber(x, y, dmg, isHeadshot = false, killed = false) {
    if (dmg == null) return;
    if (this.effects.filter(e => e.isDamageNumber).length >= MAX_DAMAGE_NUMBERS) return;
    const text = killed ? `💀 ${dmg}` : String(dmg);
    const color = isHeadshot ? '#ff3b5c' : killed ? '#ff8a3d' : '#ffd75e';
    const sprite = makeTextSprite(text, color, isHeadshot ? 30 : 24);
    sprite.position.set(x + (Math.random() - 0.5) * 12, 92 + (isHeadshot ? 10 : 0), y + (Math.random() - 0.5) * 12);
    this.scene.add(sprite);
    this.effects.push({
      mesh: sprite, isDamageNumber: true, life: 0, maxLife: 0.7,
      update: (dt, t, e) => {
        sprite.position.y += 34 * dt;
        sprite.material.opacity = 1 - Math.pow(e.life / e.maxLife, 2);
      },
    });
  }

  // ── Dust puffs at feet ────────────────────────────────────
  addDust(x, y) {
    this._burst(x, y, 3, 0x9a8f7d, 0.5, 70, 400, true, 10);
  }

  // ── Healing ring ──────────────────────────────────────────
  addHealRing(x, y) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 40),
      new THREE.MeshBasicMaterial({
        color: 0x2dc653, transparent: true, opacity: 0.8,
        side: THREE.DoubleSide, depthWrite: false, blending: ADDITIVE,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 1.6, y);
    this.scene.add(ring);
    this.effects.push({
      mesh: ring, life: 0, maxLife: 0.8,
      update: (dt, t, e) => {
        const k = e.life / e.maxLife;
        ring.scale.setScalar(1 + k * 2.2);
        ring.material.opacity = 0.8 * (1 - k);
      },
    });
  }

  // ── Firefly (night ambience) ──────────────────────────────
  addFirefly(x, y) {
    if (this.effects.length > 420) return;
    const mat = new THREE.SpriteMaterial({
      map: this.muzzleTex, color: 0xfff0a8, transparent: true,
      opacity: 0.9, blending: ADDITIVE, depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(x, 26, y);
    s.scale.setScalar(5 + Math.random() * 4);
    this.scene.add(s);
    const driftX = (Math.random() - 0.5) * 26;
    const driftY = (Math.random() - 0.5) * 20;
    const driftZ = (Math.random() - 0.5) * 26;
    this.effects.push({
      mesh: s, life: 0, maxLife: 1.4 + Math.random() * 0.8,
      update: (dt, t, e) => {
        s.position.x += Math.sin(e.life * 2 + driftX) * 14 * dt;
        s.position.z += Math.cos(e.life * 1.7 + driftZ) * 14 * dt;
        s.position.y += driftY * dt;
        s.material.opacity = 0.5 + 0.4 * Math.sin(e.life * 5);
        if (s.position.y > 44 || s.position.y < 4) { e.life = e.maxLife; }
      },
    });
  }

  // ── Victory confetti ──────────────────────────────────────
  addConfetti(x, y) {
    const colors = [0xf5a623, 0x4cc9f0, 0xf72585, 0x2dc653, 0xffd60a, 0xa335ee];
    const mat = new THREE.MeshLambertMaterial({ color: colors[(Math.random() * colors.length) | 0] });
    const m = new THREE.Mesh(this.confettiGeo, mat);
    m.position.set(x + (Math.random() - 0.5) * 120, 120 + Math.random() * 60, y + (Math.random() - 0.5) * 120);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    this.scene.add(m);
    const vx = (Math.random() - 0.5) * 40;
    const vz = (Math.random() - 0.5) * 40;
    const spin = (Math.random() - 0.5) * 8;
    this.effects.push({
      mesh: m, life: 0, maxLife: 1.8,
      update: (dt, t, e) => {
        m.position.x += vx * dt;
        m.position.z += vz * dt;
        m.position.y -= 46 * dt;
        m.rotation.x += spin * dt;
        m.rotation.y += spin * dt;
      },
    });
  }

  // ── Explosion ─────────────────────────────────────────────
  addExplosion(x, y) {
    // Flash
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.muzzleTex, color: 0xffa040, transparent: true,
      opacity: 1, blending: ADDITIVE, depthWrite: false,
    }));
    flash.position.set(x, 40, y);
    flash.scale.setScalar(160);
    this.scene.add(flash);
    this.effects.push({
      mesh: flash, life: 0, maxLife: 0.22,
      update: (dt, t, e) => {
        const k = e.life / e.maxLife;
        flash.material.opacity = 1 - k;
        flash.scale.setScalar(160 * (1 + k * 2.4));
      },
    });

    // Shockwave ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffb45e, transparent: true, opacity: 0.9,
        side: THREE.DoubleSide, depthWrite: false, blending: ADDITIVE,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 2, y);
    this.scene.add(ring);
    this.effects.push({
      mesh: ring, life: 0, maxLife: 0.5,
      update: (dt, t, e) => {
        const k = e.life / e.maxLife;
        ring.scale.setScalar(1 + k * 9);
        ring.material.opacity = 0.9 * (1 - k);
      },
    });

    // Debris burst + smoke puffs
    this._burst(x, y, 14, 0xffa040, 0.6, 260, 420, true, 36);
    this._burst(x, y, 8, 0x555560, 0.9, 120, -260, false, 28);
  }

  // ── Storm lightning bolt ──────────────────────────────────
  addLightningBolt(x, y) {
    const pts = [];
    let px = x, py = 420;
    pts.push(new THREE.Vector3(px, py, y));
    const dirX = (Math.random() - 0.5) * 40;
    const dirZ = (Math.random() - 0.5) * 40;
    const segs = 10;
    for (let i = 1; i <= segs; i++) {
      py -= (420 - 2) / segs;
      px += dirX / segs + (Math.random() - 0.5) * 46;
      const pz = y + dirZ / segs + (Math.random() - 0.5) * 46;
      pts.push(new THREE.Vector3(px, py, pz));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0xb9a6ff, transparent: true, opacity: 1,
      blending: ADDITIVE, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.effects.push({
      mesh: line, life: 0, maxLife: 0.42,
      update: (dt, t, e) => { mat.opacity = Math.max(0, 1 - e.life / e.maxLife); },
    });
    // Ground flash
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.muzzleTex, color: 0x9a6bff, transparent: true,
      opacity: 0.8, blending: ADDITIVE, depthWrite: false,
    }));
    gl.position.set(x, 6, y);
    gl.scale.setScalar(70);
    this.scene.add(gl);
    this.effects.push({
      mesh: gl, life: 0, maxLife: 0.35,
      update: (dt, t, e) => { gl.material.opacity = 0.8 * (1 - e.life / e.maxLife); gl.scale.setScalar(70 + e.life * 140); },
    });
  }

  // ── Generic particle burst ────────────────────────────────
  // (gx, gy) are GAME coords; height = three.js y. gravity>0 pulls down.
  _burst(gx, gy, count, color, speed, spread, gravity = 400, rising = true, height = 34, size = 4) {
    if (this.effects.filter(e => e.isParticle).length >= MAX_PARTICLES) return;
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.95 });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.sparkGeo, mat);
      m.position.set(gx + (Math.random() - 0.5) * 8, height + Math.random() * 8, gy + (Math.random() - 0.5) * 8);
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (rising ? 1 : -1) * Math.random() * spread * 0.5,
        (Math.random() - 0.5) * spread
      );
      dir.normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      dir.y = Math.abs(dir.y) * 0.5 + (rising ? 20 : 0);
      m.userData.vel = dir;
      m.scale.setScalar(size / 4 * (0.6 + Math.random() * 0.8));
      this.scene.add(m);
      this.effects.push({
        mesh: m, isParticle: true, life: 0, maxLife: 0.45 + Math.random() * 0.4,
        update: (dt, t, e) => {
          m.userData.vel.y -= gravity * dt;
          m.position.addScaledVector(m.userData.vel, dt);
          if (m.position.y < 1) m.position.y = 1;
          m.rotation.x += dt * 6;
          m.rotation.z += dt * 5;
          mat.opacity = 0.95 * (1 - e.life / e.maxLife);
        },
      });
    }
  }

  // ── Advance + cull ────────────────────────────────────────
  update(dt, now) {
    const alive = [];
    for (const e of this.effects) {
      e.life += dt;
      if (e.life >= e.maxLife) {
        e.mesh.parent?.remove(e.mesh);
        if (e.mesh.material) {
          if (Array.isArray(e.mesh.material)) e.mesh.material.forEach(disposeMat);
          else disposeMat(e.mesh.material);
        }
        if (e.mesh.geometry) e.mesh.geometry.dispose();
        continue;
      }
      e.update?.(dt, now, e);
      alive.push(e);
    }
    this.effects = alive;
  }

  // Clear everything (new match)
  clear() {
    for (const e of this.effects) {
      e.mesh.parent?.remove(e.mesh);
      if (e.mesh.material) disposeMat(e.mesh.material);
      if (e.mesh.geometry) e.mesh.geometry.dispose();
    }
    this.effects = [];
    for (const l of this.flashLights) { l.visible = false; l.intensity = 0; }
  }
}

function disposeMat(m) {
  if (m.map) m.map.dispose();
  m.dispose();
}

// ── Sprite helpers ──────────────────────────────────────────
export function makeGlowTexture(hex = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, hex);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export function makeTextSprite(text, color, fontSize = 24) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = `900 ${fontSize}px Rajdhani, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.strokeText(text, 128, 64);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(56, 28, 1);
  return sprite;
}
