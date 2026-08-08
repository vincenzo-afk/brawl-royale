// ============================================================
// RENDERER — Canvas 2D drawing engine
// Characters, dynamic lighting, shading, particles & effects
// ============================================================
import {
  MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, PLAYER_RADIUS, LOOT_TIERS,
  TILE, TILE_COLORS, TILE_EMOJI, isSolidTile,
} from 'battle-royale-shared';

const SKIN_COLORS = ['#4cc9f0', '#f72585', '#7209b7', '#3a86ff', '#fb8500', '#2dc653', '#e63946', '#ffd60a'];
const MAX_EFFECTS = 260;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.offscreenMap = null;  // cached map render
    this._effects = [];        // particle/visual effects
    this._lightCanvas = null;  // cached lighting canvas
    this._lightCtx = null;
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.width = w;
    this.height = h;
    this.offscreenMap = null;
    this._lightCanvas = null;
    this._lightCtx = null;
  }

  clear() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#16251a';
    ctx.fillRect(0, 0, this.width, this.height);
  }

  // ── Map tiles ─────────────────────────────────────────────
  drawMap(mapData) {
    if (!mapData) return;
    const ctx = this.ctx;
    const { tilesX, tilesY, ground, collision, pois } = mapData;
    const ts = TILE_SIZE;
    if (!tilesX || !ground) return;

    const t = ctx.getTransform();
    const zoom = Math.hypot(t.a, t.b) || 1;
    const viewLeft = -t.e / zoom;
    const viewTop = -t.f / zoom;
    const viewW = this.width / zoom;
    const viewH = this.height / zoom;

    const startTx = Math.max(0, Math.floor(viewLeft / ts) - 1);
    const endTx = Math.min(tilesX - 1, Math.ceil((viewLeft + viewW) / ts) + 1);
    const startTy = Math.max(0, Math.floor(viewTop / ts) - 1);
    const endTy = Math.min(tilesY - 1, Math.ceil((viewTop + viewH) / ts) + 1);

    const showEmoji = zoom >= 0.55;

    // ── Ground pass ─────────────────────────────────────────
    for (let ty = startTy; ty <= endTy; ty++) {
      for (let tx = startTx; tx <= endTx; tx++) {
        const idx = ty * tilesX + tx;
        const tile = ground[idx];
        const base = TILE_COLORS[tile] || TILE_COLORS[TILE.GRASS];
        const x = tx * ts;
        const y = ty * ts;

        if (tile === TILE.GRASS || tile === TILE.GRASS_VARIANT) {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? base : shade(base, 0.92);
        } else if (tile === TILE.WATER) {
          ctx.fillStyle = base;
          ctx.fillRect(x, y, ts, ts);
          // Depth gradient: lighter top, darker bottom
          const grd = ctx.createLinearGradient(0, y, 0, y + ts);
          grd.addColorStop(0, 'rgba(255,255,255,0.14)');
          grd.addColorStop(0.5, 'rgba(255,255,255,0.02)');
          grd.addColorStop(1, 'rgba(0,20,45,0.3)');
          ctx.fillStyle = grd;
          ctx.fillRect(x, y, ts, ts);
        } else {
          ctx.fillStyle = base;
        }
        ctx.fillRect(x, y, ts, ts);

        // Decorative glyphs (trees, rocks, crates, water sparkles)
        const glyph = TILE_EMOJI[tile];
        if (glyph && showEmoji && tile !== TILE.WATER) {
          ctx.font = `${Math.round(ts * 0.9)}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(glyph, x + ts / 2, y + ts / 2 + 2);
        } else if (tile === TILE.WATER && showEmoji) {
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          ctx.fillRect(x + 4, y + 6 + ((tx + ty) % 3), ts - 8, 3);
        }
      }
    }

    // ── Solid pass (raised edges + cast shadows) ────────────
    for (let ty = startTy; ty <= endTy; ty++) {
      for (let tx = startTx; tx <= endTx; tx++) {
        const idx = ty * tilesX + tx;
        const tile = collision[idx];
        if (!isSolidTile(tile)) continue;

        const x = tx * ts;
        const y = ty * ts;
        ctx.fillStyle = TILE_COLORS[tile] || '#555';
        ctx.fillRect(x, y, ts, ts);

        // Fake height: darker bottom/right edge, lighter top/left
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 2, y + ts - 4, ts - 2, 4);
        ctx.fillRect(x + ts - 4, y + 2, 4, ts - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(x, y, ts - 4, 3);
        ctx.fillRect(x, y, 3, ts - 4);

        // Soft shadow cast onto the walkable tile below
        if (ty + 1 < tilesY && !isSolidTile(collision[idx + tilesX])) {
          const grd = ctx.createLinearGradient(0, y + ts - 10, 0, y + ts + 6);
          grd.addColorStop(0, 'rgba(0,0,0,0.28)');
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grd;
          ctx.fillRect(x + 2, y + ts - 10, ts - 4, 16);
        }
      }
    }

    // ── Place labels (named POIs) ───────────────────────────
    if (pois && pois.length) {
      const labelSize = Math.min(26, Math.max(11, Math.round(17 / zoom)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const poi of pois) {
        if (poi.x < viewLeft - 300 || poi.x > viewLeft + viewW + 300) continue;
        if (poi.y < viewTop - 300 || poi.y > viewTop + viewH + 300) continue;

        ctx.fillStyle = 'rgba(255, 214, 10, 0.9)';
        ctx.beginPath();
        ctx.arc(poi.x, poi.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = `700 ${labelSize}px Orbitron, sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(poi.name.toUpperCase(), poi.x + 1, poi.y + labelSize + 1);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 6;
        ctx.fillText(poi.name.toUpperCase(), poi.x, poi.y + labelSize);
        ctx.shadowBlur = 0;
      }
    }
  }

  // ── Background (when no map) ───────────────────────────────
  drawBackground() {
    const ctx = this.ctx;
    const size = 32;
    const cols = Math.ceil(MAP_WIDTH / size);
    const rows = Math.ceil(MAP_HEIGHT / size);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? '#1e3a1f' : '#1a2a18';
        ctx.fillRect(i * size, j * size, size, size);
      }
    }
  }

  // ── Players (detailed characters) ─────────────────────────
  // anim: { phase, speed, moving } computed by the game loop
  drawPlayer(player, isLocal = false, now = 0, anim = null) {
    const ctx = this.ctx;
    const { x, y, angle, health, maxHealth, shield, maxShield, name, skin, alive, isSprinting, isCrouching, armor, activeWeaponId, isReloading, isHealing } = player;
    if (!alive) return;

    const r = PLAYER_RADIUS;
    const color = SKIN_COLORS[skin % SKIN_COLORS.length] || '#4cc9f0';
    const moving = anim?.moving ?? false;
    const speed01 = Math.min(1, (anim?.speed ?? 0) / 180);

    // Walk bob + subtle sway
    const bob = moving ? Math.sin(anim.phase) * 1.6 * (0.5 + speed01 * 0.5) : 0;
    const sway = moving ? Math.cos(anim.phase * 0.5) * 1.2 * speed01 : 0;

    // Ground shadow
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.95, r * (isCrouching ? 0.8 : 1.05), r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x + sway, y + bob);

    // Crouch squash / sprint stretch
    if (isCrouching) ctx.scale(1, 0.82);
    else if (isSprinting) ctx.scale(1.06, 0.94);

    // Shield aura
    if (shield > 0) {
      ctx.save();
      const aura = 0.25 + (shield / (maxShield || 100)) * 0.45;
      const grd = ctx.createRadialGradient(0, 0, r, 0, 0, r + 9);
      grd.addColorStop(0, `rgba(76,201,240,${aura * 0.9})`);
      grd.addColorStop(1, 'rgba(76,201,240,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(0, 0, r + 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Body (3D sphere look)
    const bodyGrd = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.15, 0, 0, r);
    bodyGrd.addColorStop(0, lighten(color, 1.5));
    bodyGrd.addColorStop(0.55, color);
    bodyGrd.addColorStop(1, darken(color, 0.55));
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrd;
    ctx.fill();

    // Outfit ring (slightly darker under-band)
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Outline
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = isLocal ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth = isLocal ? 2.5 : 1.75;
    ctx.stroke();

    // Armor badges
    if (armor?.helmet > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = helmetColor(armor.helmet);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (armor?.vest > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = vestColor(armor.vest);
      ctx.fill();
    }

    // Healing pulse ring
    if (isHealing) {
      const pulse = 0.5 + Math.sin(now / 150) * 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4 + pulse * 2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(45,198,83,${0.4 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Weapon (rotated toward aim) — derive from live inventory so
    // remote weapon models stay correct after pickups
    const weaponId = player.inventory?.[player.activeSlot]?.weaponId || activeWeaponId || null;
    const weaponKind = weaponKindFor(weaponId);
    ctx.save();
    ctx.rotate(angle);
    const ads = !!player.isADS;
    const reloadDip = isReloading ? -0.35 : 0;
    ctx.rotate(reloadDip);
    this._drawWeapon(ctx, weaponKind, { isLocal, ads, melee: weaponKind === 'melee' });
    ctx.restore();

    ctx.restore();

    // ── Bars + name (world space, above) ─────────────────────
    const barW = r * 2.5;
    const barH = 4;
    const barY = y - r - 16;
    const radius = 2;

    // Shield bar
    if (shield > 0 && maxShield > 0) {
      roundRect(ctx, x - barW / 2, barY - 5, barW, barH, radius);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      const shW = barW * (shield / maxShield);
      if (shW > 1) {
        roundRect(ctx, x - barW / 2, barY - 5, shW, barH, radius);
        const sgrd = ctx.createLinearGradient(x - barW / 2, 0, x + barW / 2, 0);
        sgrd.addColorStop(0, '#4cc9f0');
        sgrd.addColorStop(1, '#a8edfd');
        ctx.fillStyle = sgrd;
        ctx.fill();
      }
    }

    // Health bar
    roundRect(ctx, x - barW / 2, barY, barW, barH, radius);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    const hFrac = Math.max(0, Math.min(1, health / (maxHealth || 100)));
    if (hFrac > 0) {
      roundRect(ctx, x - barW / 2, barY, barW * hFrac, barH, radius);
      const hColor = hFrac > 0.5 ? '#2dc653' : hFrac > 0.25 ? '#f5a623' : '#e63946';
      ctx.fillStyle = hColor;
      ctx.fill();
    }

    // Name tag
    ctx.fillStyle = isLocal ? 'rgba(255,255,255,0.95)' : 'rgba(210,210,220,0.8)';
    ctx.font = isLocal ? 'bold 12px Rajdhani, sans-serif' : '11px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(name || '', x, barY - 3);
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
  }

  _drawWeapon(ctx, kind, { isLocal = false, ads = false, melee = false } = {}) {
    const r = PLAYER_RADIUS;
    const metal = isLocal ? '#5a5a68' : '#3f3f4a';
    const dark = '#26262e';
    const light = '#8a8a9a';
    const accent = '#f5a623';

    ctx.lineCap = 'round';

    if (melee) {
      // Fists — two knuckle balls at the front
      ctx.fillStyle = isLocal ? '#e8d8b8' : '#c9b691';
      ctx.beginPath(); ctx.arc(r + 3, -3, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r + 3, 3, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(r + 3, -3, 3.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(r + 3, 3, 3.5, 0, Math.PI * 2); ctx.stroke();
      return;
    }

    const drawBarrel = (len, w, color) => {
      ctx.fillStyle = color;
      roundRect(ctx, r - 1, -w / 2, len + 1, w, w / 2);
      ctx.fill();
    };
    const drawBody = (len, w, color, x = r - 2) => {
      ctx.fillStyle = color;
      roundRect(ctx, x, -w / 2, len, w, 2);
      ctx.fill();
    };

    switch (kind) {
      case 'pistol':
        drawBody(12, 6, metal);
        drawBarrel(8, 3.5, dark);
        // grip
        ctx.fillStyle = dark;
        roundRect(ctx, r + 3, 1, 5, 7, 2);
        ctx.fill();
        break;
      case 'smg':
        drawBody(16, 6.5, metal);
        drawBarrel(8, 3.5, dark);
        // mag
        ctx.fillStyle = dark;
        roundRect(ctx, r + 4, 2, 4, 8, 2);
        ctx.fill();
        break;
      case 'shotgun':
        drawBody(14, 9, metal);
        drawBarrel(10, 6, dark);
        // pump
        ctx.fillStyle = light;
        roundRect(ctx, r + 8, -4, 6, 8, 2);
        ctx.fill();
        break;
      case 'rifle':
        drawBody(20, 7, metal);
        drawBarrel(14, 3, dark);
        // stock
        ctx.fillStyle = dark;
        roundRect(ctx, r - 8, -2.5, 7, 5, 2);
        ctx.fill();
        // mag
        ctx.fillStyle = dark;
        roundRect(ctx, r + 8, 1.5, 4, 8, 2);
        ctx.fill();
        break;
      case 'dmr':
        drawBody(24, 7, metal);
        drawBarrel(18, 3, dark);
        ctx.fillStyle = dark;
        roundRect(ctx, r - 8, -2.5, 7, 5, 2);
        ctx.fill();
        ctx.fillStyle = light;
        roundRect(ctx, r + 14, -4, 6, 8, 2);
        ctx.fill();
        break;
      case 'sniper':
        drawBody(30, 7, metal);
        drawBarrel(24, 3, dark);
        ctx.fillStyle = dark;
        roundRect(ctx, r - 8, -2.5, 7, 5, 2);
        ctx.fill();
        // scope
        ctx.fillStyle = '#2b2b33';
        ctx.beginPath();
        ctx.arc(r + 10, -6, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7ee3ff';
        ctx.beginPath();
        ctx.arc(r + 10, -6, 1.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'lmg':
        drawBody(24, 8, metal);
        drawBarrel(18, 4, dark);
        // drum
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.arc(r + 10, 5, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(r + 10, 5, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'rpg':
        drawBody(26, 10, metal);
        drawBarrel(20, 7, dark);
        // fins
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(r + 2, -5);
        ctx.lineTo(r + 8, -3.5);
        ctx.lineTo(r + 2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(r + 2, 5);
        ctx.lineTo(r + 8, 3.5);
        ctx.lineTo(r + 2, 0);
        ctx.closePath();
        ctx.fill();
        // tip
        ctx.fillStyle = '#ff5252';
        ctx.beginPath();
        ctx.arc(r + 26, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      default: // generic rifle
        drawBody(18, 6, metal);
        drawBarrel(10, 3, dark);
        break;
    }

    // ADS iron-sight highlight
    if (ads) {
      ctx.fillStyle = 'rgba(245,166,35,0.85)';
      ctx.beginPath();
      ctx.arc(r + 2, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Loot items ────────────────────────────────────────────
  drawLootItem(item, now = Date.now()) {
    const ctx = this.ctx;
    const { x, y, type, tier, itemId } = item;
    const tierColor = LOOT_TIERS[tier]?.color || '#aaa';
    const bob = Math.sin(now / 600 + x) * 2;
    const pulse = 1 + Math.sin(now / 250 + x * 0.1) * 0.12;

    ctx.save();
    ctx.translate(x, y + bob);

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(pulse, pulse);

    // Glow
    ctx.shadowColor = tierColor;
    ctx.shadowBlur = 10;

    // Disc body with gradient
    const grd = ctx.createRadialGradient(-4, -5, 2, 0, 0, 14);
    grd.addColorStop(0, lighten(tierColor, 1.7));
    grd.addColorStop(0.5, darken(tierColor, 0.85));
    grd.addColorStop(1, darken(tierColor, 0.5));
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,12,20,0.85)';
    ctx.fill();
    ctx.strokeStyle = tierColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Icon
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icons = { weapon: '🔫', ammo: '🔸', healing: '💊', armor: '🛡', shield: '🔵' };
    ctx.fillText(icons[type] || '?', 0, 1);

    ctx.restore();
  }

  // ── Projectiles ───────────────────────────────────────────
  drawProjectile(proj) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.rotate(proj.angle);
    // glow trail
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(-10, -2, 20, 4);
    ctx.fillStyle = '#fff7cc';
    ctx.fillRect(-12, -1, 24, 2);
    ctx.restore();
  }

  // ── Storm circle ──────────────────────────────────────────
  // Full storm treatment: rotating cloud bands, rain curtain,
  // wind streaks, jagged electric arcs + synced lightning bolts,
  // and a dual-layer energy ring.
  drawStorm(storm, now = 0) {
    const ctx = this.ctx;
    const { centerX, centerY, currentRadius, targetCenterX, targetCenterY, targetRadius } = storm;
    if (!currentRadius || currentRadius <= 0) return;
    const t = now / 1000;

    ctx.save();
    ctx.lineCap = 'round';

    // Segment counts scale with radius so the ring/bands stay
    // smooth even when the storm is huge at match start
    const segs = Math.max(24, Math.min(90, Math.round(currentRadius / 35)));

    // ── Outside-storm overlay ────────────────────────────────
    ctx.beginPath();
    ctx.rect(-40, -40, MAP_WIDTH + 80, MAP_HEIGHT + 80);
    ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(20,0,58,0.46)';
    ctx.fill('evenodd');

    // ── Rotating cloud bands circling the eye ────────────────
    const bandSpan = 3.2; // arc coverage per band (~183°)
    for (let arm = 0; arm < 3; arm++) {
      const base = (arm / 3) * Math.PI * 2 + t * 0.14 * (arm % 2 === 0 ? 1 : -1);
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const a = base + (i / segs) * bandSpan;
        const rr = currentRadius + 34 + Math.sin((i / segs) * bandSpan * 1.7 + arm * 2.1) * 46;
        const px = centerX + Math.cos(a) * rr;
        const py = centerY + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(58,14,110,0.20)';
      ctx.lineWidth = 26;
      ctx.stroke();
    }

    // ── Drifting cloud puffs ─────────────────────────────────
    const puffs = 10;
    for (let i = 0; i < puffs; i++) {
      const a = (i / puffs) * Math.PI * 2 + t * 0.05;
      const rr = currentRadius + 90 + Math.sin(t * 0.3 + i * 1.7) * 30;
      ctx.fillStyle = 'rgba(40,8,90,0.10)';
      ctx.beginPath();
      ctx.arc(
        centerX + Math.cos(a) * rr,
        centerY + Math.sin(a) * rr,
        26 + Math.sin(t + i * 2) * 6, 0, Math.PI * 2
      );
      ctx.fill();
    }

    // ── Rain curtain band just inside the edge ───────────────
    const band = ctx.createRadialGradient(centerX, centerY, currentRadius - 70, centerX, centerY, currentRadius);
    band.addColorStop(0, 'rgba(70,90,140,0)');
    band.addColorStop(1, 'rgba(70,90,140,0.28)');
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
    ctx.fill();

    // ── Wind streaks circling just outside the ring ──────────
    const streaks = Math.max(18, Math.round(segs * 0.6));
    for (let i = 0; i < streaks; i++) {
      const a = (i / streaks) * Math.PI * 2 + t * 0.55;
      const rr = currentRadius + 10;
      const px = centerX + Math.cos(a) * rr;
      const py = centerY + Math.sin(a) * rr;
      const ta = a + Math.PI / 2; // tangent direction
      ctx.strokeStyle = `rgba(168,160,255,${0.10 + (i % 3) * 0.05})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(ta) * 16, py + Math.sin(ta) * 16);
      ctx.stroke();
    }

    // ── Jagged electric arcs (constant faint crackle) ────────
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const jig = Math.sin(now / 150 + i * 5.1) * 4 + Math.sin(now / 400 + i * 2.3) * 3;
      const rr = currentRadius + jig;
      const px = centerX + Math.cos(a) * rr;
      const py = centerY + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = 'rgba(150,80,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Lightning bolts (synced with thunder via stormStrike) ─
    const strikeAge = now - (this._stormStrikeAt ?? -1e9);
    if (strikeAge >= 0 && strikeAge < 420) {
      const fade = 1 - strikeAge / 420;
      const seed = this._stormStrikeSeed || 0;
      const bolts = 3 + (seed % 3);
      for (let b = 0; b < bolts; b++) {
        const baseA = seed * 1.31 + b * ((Math.PI * 2) / bolts) + 0.7;
        ctx.beginPath();
        let px = centerX + Math.cos(baseA) * currentRadius;
        let py = centerY + Math.sin(baseA) * currentRadius;
        ctx.moveTo(px, py);
        for (let s2 = 0; s2 < 5; s2++) {
          const a = baseA + Math.sin(seed + s2 * 2.7) * 0.5;
          const len = 22 + (seed % 7) * 3;
          px += Math.cos(a) * len;
          py += Math.sin(a) * len;
          ctx.lineTo(px, py);
        }
        ctx.shadowColor = '#a66bff';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = `rgba(200,190,255,${0.75 * fade})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // ── Dual-layer energy ring ───────────────────────────────
    ctx.beginPath();
    ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(110,40,230,0.28)';
    ctx.lineWidth = 12;
    ctx.shadowColor = '#7b00ff';
    ctx.shadowBlur = 30;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(168,90,255,0.95)';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Target ring (dashed)
    if (targetRadius > 0 && targetRadius !== currentRadius) {
      ctx.beginPath();
      ctx.setLineDash([12, 8]);
      ctx.arc(targetCenterX || centerX, targetCenterY || centerY, targetRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(123,0,255,0.35)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  // Trigger a visible lightning strike along the storm ring.
  // Call right when thunder plays so bolts + flash + sound line up.
  stormStrike(now = Date.now()) {
    this._stormStrikeAt = now;
    this._stormStrikeSeed = Math.floor(Math.random() * 1000);
  }

  // ── Storm rain overlay (screen space, masked to the storm) ─
  // cx, cy, radius in SCREEN coords. Only the area outside the
  // storm circle gets rain, with a heavy curtain right at the
  // edge that thins out deeper in the storm.
  drawRainOverlay(cx, cy, radius, dt = 0.016, now = 0, intensity = 1) {
    if (!radius || radius <= 0 || intensity <= 0) return;
    const ctx = this.ctx;
    const w = this.width, h = this.height;

    if (!this._rainDrops) {
      this._rainDrops = [];
      for (let i = 0; i < 130; i++) this._rainDrops.push(this._newRainDrop(w, h));
      this._rainSplashes = [];
      this._rainSplashAcc = 0;
    }

    const wind = Math.sin(now / 4000) * 0.18 + 0.30; // horizontal drift per vertical px
    const speed = 640;

    ctx.save();
    // Mask: everything OUTSIDE the storm circle
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
    ctx.clip('evenodd');

    ctx.lineCap = 'round';
    const drops = this._rainDrops;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.x += wind * speed * dt;
      d.y += speed * dt;
      if (d.x > w + 40) d.x = -40 - Math.random() * 60;
      if (d.y > h + 40) {
        d.y = -40 - Math.random() * 60;
        d.x = Math.random() * (w + 80) - 40;
      }

      // Heavy curtain right at the ring, thinning out deeper inside
      const dx = d.x - cx, dy = d.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const edgeFade = Math.min(1, Math.max(0, (dist - radius) / 90));

      ctx.globalAlpha = intensity * (0.18 + 0.30 * (1 - edgeFade));
      ctx.strokeStyle = '#9fb4e8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - wind * d.len, d.y - d.len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Splash ripples
    this._rainSplashAcc += intensity * dt;
    while (this._rainSplashAcc >= 0.09 && this._rainSplashes.length < 24) {
      this._rainSplashAcc -= 0.09;
      this._rainSplashes.push({ x: Math.random() * w, y: Math.random() * h, born: now, dur: 420 });
    }
    if (this._rainSplashes.length >= 24) this._rainSplashAcc = 0;
    this._rainSplashes = this._rainSplashes.filter((s) => now - s.born < s.dur);
    ctx.strokeStyle = 'rgba(190,205,255,0.8)';
    ctx.lineWidth = 1;
    for (const s of this._rainSplashes) {
      const p = (now - s.born) / s.dur;
      ctx.globalAlpha = 0.35 * (1 - p);
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 3 + p * 7, 1.5 + p * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _newRainDrop(w, h) {
    return {
      x: Math.random() * (w + 80) - 40,
      y: Math.random() * (h + 80) - 40,
      len: 8 + Math.random() * 10,
    };
  }

  // ── Lighting pass (screen space) ──────────────────────────
  // sources: [{ x, y, radius, intensity, color }] in SCREEN coords
  // tint: { r, g, b, a } color grade — drawn UNDER the light holes so
  //       player light reveals clear, warm ground
  renderLighting(sources = [], { ambient = 0.42, flash = 0, tint = null } = {}) {
    if (!this._lightCanvas || this._lightCanvas.width !== this.width) {
      this._lightCanvas = document.createElement('canvas');
      this._lightCanvas.width = this.width;
      this._lightCanvas.height = this.height;
      this._lightCtx = this._lightCanvas.getContext('2d');
    }
    const lctx = this._lightCtx;
    const w = this.width, h = this.height;

    lctx.clearRect(0, 0, w, h);
    lctx.globalCompositeOperation = 'source-over';

    // Color grade (day/night tint) — punched holes reveal un-tinted scene
    if (tint && tint.a > 0) {
      lctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${tint.a})`;
      lctx.fillRect(0, 0, w, h);
    }

    // Ambient darkness
    lctx.fillStyle = `rgba(6,8,22,${ambient})`;
    lctx.fillRect(0, 0, w, h);

    // Punch light holes
    lctx.globalCompositeOperation = 'destination-out';
    for (const src of sources) {
      const r = src.radius || 160;
      const grd = lctx.createRadialGradient(src.x, src.y, r * 0.15, src.x, src.y, r);
      grd.addColorStop(0, `rgba(0,0,0,${Math.min(1, src.intensity || 0.7)})`);
      grd.addColorStop(0.6, 'rgba(0,0,0,0.4)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = grd;
      lctx.beginPath();
      lctx.arc(src.x, src.y, r, 0, Math.PI * 2);
      lctx.fill();
    }

    // Warm glow on top of the holes
    lctx.globalCompositeOperation = 'source-over';
    for (const src of sources) {
      const r = src.radius || 160;
      const grd = lctx.createRadialGradient(src.x, src.y, 0, src.x, src.y, r * 0.7);
      grd.addColorStop(0, hexToRgba(src.color || '#ffd9a0', 0.14 * (src.intensity || 0.7)));
      grd.addColorStop(1, hexToRgba(src.color || '#ffd9a0', 0));
      lctx.fillStyle = grd;
      lctx.beginPath();
      lctx.arc(src.x, src.y, r * 0.7, 0, Math.PI * 2);
      lctx.fill();
    }

    // Lightning flash overlay
    if (flash > 0) {
      lctx.fillStyle = `rgba(220,230,255,${Math.min(0.75, flash)})`;
      lctx.fillRect(0, 0, w, h);
    }

    this.ctx.drawImage(this._lightCanvas, 0, 0);
  }

  // ── Effects ───────────────────────────────────────────────
  _push(fx) {
    if (this._effects.length > MAX_EFFECTS) this._effects.shift();
    this._effects.push(fx);
  }

  addMuzzleFlash(x, y, angle) {
    this._push({ type: 'muzzleFlash', x, y, angle, life: 1, maxLife: 1, startTime: Date.now() });
  }

  addBulletTrace(x1, y1, x2, y2) {
    this._push({ type: 'bulletTrace', x1, y1, x2, y2, life: 1, maxLife: 1, startTime: Date.now() });
  }

  addDamageNumber(x, y, damage, isHeadshot = false, isKill = false) {
    this._push({ type: 'damageNumber', x, y, damage, isHeadshot, isKill, life: 1, maxLife: 1, startTime: Date.now() });
  }

  addImpact(x, y, isHeadshot = false) {
    const color = isHeadshot ? '#ffe600' : '#ffb066';
    for (let i = 0; i < (isHeadshot ? 9 : 6); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      this._push({
        type: 'particle', x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, maxLife: 1, startTime: Date.now(),
        color, radius: 1.5 + Math.random() * 2.5, gravity: 260,
      });
    }
  }

  addBloodPool(x, y) {
    this._push({ type: 'bloodPool', x, y, life: 1, maxLife: 1, startTime: Date.now(), duration: 8000 });
    // splatter
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 70;
      this._push({
        type: 'particle', x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, maxLife: 1, startTime: Date.now(),
        color: '#a31222', radius: 2 + Math.random() * 3, gravity: 300,
      });
    }
  }

  addFirefly(x, y) {
    const seed = Math.random() * Math.PI * 2;
    this._push({
      type: 'firefly', x, y,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.5) * 16,
      seed,
      life: 1, maxLife: 1,
      startTime: Date.now(),
      duration: 3200 + Math.random() * 2800,
    });
  }

  addDust(x, y) {
    for (let i = 0; i < 2; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const speed = 12 + Math.random() * 18;
      this._push({
        type: 'particle', x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, maxLife: 1, startTime: Date.now(),
        color: 'rgba(150,130,110,0.8)', radius: 1.5 + Math.random() * 2, gravity: -40,
      });
    }
  }

  addHealRing(x, y) {
    this._push({ type: 'healRing', x, y, life: 1, maxLife: 1, startTime: Date.now() });
  }

  addConfetti(x, y) {
    const colors = ['#f5a623', '#4cc9f0', '#2dc653', '#f72585', '#ffd60a', '#a335ee'];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 160;
      this._push({
        type: 'particle', x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, maxLife: 1, startTime: Date.now(),
        color: colors[i % colors.length], radius: 2 + Math.random() * 2.5, gravity: 120, spin: Math.random() * 10,
      });
    }
  }

  drawEffects(now = Date.now()) {
    const ctx = this.ctx;
    const keep = [];

    for (const fx of this._effects) {
      // Damage numbers — 700ms lifetime
      if (fx.type === 'damageNumber') {
        const dt = (now - fx.startTime) / 700;
        if (dt > 1) continue;
        keep.push(fx);
        const rise = -36 * dt;
        const text = `${fx.isKill ? '☠ ' : ''}${fx.damage}${fx.isHeadshot ? ' 🎯' : ''}`;
        ctx.save();
        ctx.globalAlpha = 1 - dt;
        ctx.font = `800 ${fx.isHeadshot ? 19 : 14}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 3;
        ctx.strokeText(text, fx.x, fx.y + rise);
        ctx.fillStyle = fx.isHeadshot ? '#ffe600' : '#ff5252';
        ctx.fillText(text, fx.x, fx.y + rise);
        ctx.globalAlpha = 1;
        ctx.restore();
        continue;
      }

      // Blood pools — long-lived
      if (fx.type === 'bloodPool') {
        const age = now - fx.startTime;
        if (age > fx.duration) continue;
        keep.push(fx);
        const fade = age > fx.duration - 2000 ? (fx.duration - age) / 2000 : 1;
        const grow = Math.min(1, age / 400);
        ctx.save();
        ctx.globalAlpha = 0.75 * fade;
        ctx.fillStyle = '#7c0d1d';
        ctx.beginPath();
        ctx.ellipse(fx.x, fx.y, 14 * grow, 8 * grow, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a31222';
        ctx.beginPath();
        ctx.ellipse(fx.x - 3, fx.y + 1, 8 * grow, 4.5 * grow, 0.3, 0, Math.PI * 2);
        ctx.fill();
        // skull marker
        ctx.globalAlpha = 0.9 * fade;
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀', fx.x + 1, fx.y - 16 * grow);
        ctx.restore();
        continue;
      }

      // Fireflies — slow drifting glow (night ambience)
      if (fx.type === 'firefly') {
        const dt = (now - fx.startTime) / fx.duration;
        if (dt > 1) continue;
        keep.push(fx);
        const fade = Math.sin(dt * Math.PI); // fade in + out
        const x = fx.x + fx.vx * dt + Math.sin(fx.seed + dt * 3.1) * 7;
        const y = fx.y + fx.vy * dt + Math.cos(fx.seed + dt * 2.4) * 5;
        ctx.save();
        ctx.globalAlpha = 0.85 * fade;
        ctx.shadowColor = '#b8ff5e';
        ctx.shadowBlur = 9;
        ctx.fillStyle = '#e2ff9e';
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.35 * fade;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
        continue;
      }

      // Healing ring — expanding
      if (fx.type === 'healRing') {
        const dt = (now - fx.startTime) / 500;
        if (dt > 1) continue;
        keep.push(fx);
        ctx.save();
        ctx.globalAlpha = 1 - dt;
        ctx.strokeStyle = '#2dc653';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 10 + dt * 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      const age = (now - fx.startTime) / 300;
      const life = Math.max(0, 1 - age);
      if (life <= 0) continue;
      keep.push(fx);

      if (fx.type === 'muzzleFlash') {
        ctx.save();
        ctx.translate(fx.x, fx.y);
        ctx.rotate(fx.angle);
        ctx.globalAlpha = life;
        // Core
        ctx.fillStyle = '#fffbe0';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.ellipse(10, 0, 13, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Starburst
        ctx.fillStyle = '#ff9d00';
        ctx.beginPath();
        ctx.moveTo(2, 0); ctx.lineTo(26, -5); ctx.lineTo(20, 0); ctx.lineTo(26, 5);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      } else if (fx.type === 'bulletTrace') {
        ctx.save();
        ctx.globalAlpha = life * 0.6;
        ctx.strokeStyle = '#ffe566';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(fx.x1, fx.y1);
        ctx.lineTo(fx.x2, fx.y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      } else if (fx.type === 'particle') {
        const dt = (now - fx.startTime) / 1000;
        const x = fx.x + fx.vx * dt;
        const y = fx.y + fx.vy * dt + (fx.gravity ?? 80) * dt * dt;
        ctx.save();
        ctx.globalAlpha = life;
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, fx.radius * life), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    this._effects = keep;
  }

  // ── Airdrop ───────────────────────────────────────────────
  drawAirdropIndicator(x, y, now = Date.now()) {
    const ctx = this.ctx;
    const pulse = Math.sin(now / 200) * 0.3 + 0.7;
    ctx.save();
    ctx.globalAlpha = pulse;
    // ground target circle
    ctx.strokeStyle = 'rgba(245,166,35,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, 22, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f5a623';
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📦', x, y - 20);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ── Helpers ─────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r || 0, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r * factor); g = Math.round(g * factor); b = Math.round(b * factor);
  return `rgb(${r},${g},${b})`;
}

function lighten(hex, f) { return shade(hex, f); }
function darken(hex, f) { return shade(hex, f); }

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function helmetColor(tier) {
  return ['', '#8a8a8a', '#4cc9f0', '#ffd60a'][tier] || '#8a8a8a';
}
function vestColor(tier) {
  return ['', '#8a8a8a', '#3a86ff', '#f5a623'][tier] || '#8a8a8a';
}
function weaponKindFor(weaponId) {
  const map = {
    FISTS: 'melee', PISTOL: 'pistol', SMG: 'smg', SHOTGUN: 'shotgun',
    ASSAULT_RIFLE: 'rifle', DMR: 'dmr', SNIPER: 'sniper',
    RPG: 'rpg', LMG: 'lmg', LEGENDARY_AR: 'rifle',
  };
  return map[weaponId] || 'rifle';
}
