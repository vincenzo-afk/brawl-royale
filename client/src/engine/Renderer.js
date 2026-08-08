// ============================================================
// RENDERER — Canvas 2D drawing engine
// ============================================================
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, PLAYER_RADIUS, LOOT_TIERS } from 'battle-royale-shared';

const SKIN_COLORS = ['#4cc9f0', '#f72585', '#7209b7', '#3a86ff', '#fb8500', '#2dc653', '#e63946', '#ffd60a'];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.offscreenMap = null;  // cached map render
    this._effects = [];        // particle/visual effects
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.width = w;
    this.height = h;
    this.offscreenMap = null; // invalidate cache
  }

  clear() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#1a2a18';
    ctx.fillRect(0, 0, this.width, this.height);
  }

  // ── Map tiles ─────────────────────────────────────────────
  drawMap(mapData) {
    if (!mapData) return;
    const ctx = this.ctx;
    const { tilesX, tilesY, tiles, visualTiles } = mapData;

    const COLORS = {
      0: '#1a2a18',   // grass
      1: '#2d3a2b',   // grass variant
      2: '#5a4a3a',   // wall
      3: '#6a5a4a',   // wall variant
      4: '#8a7a6a',   // stone
      10: '#3a3a4a',  // building floor
      11: '#4a4a5a',  // building wall
      20: '#5a5040',  // rock
    };

    if (!tilesX || !tiles) return;

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const tile = tiles[ty * tilesX + tx] || 0;
        ctx.fillStyle = COLORS[tile] || '#1a2a18';
        ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.5;
    // Only draw visible tiles
    const visStartX = 0, visStartY = 0;
    for (let tx = visStartX; tx < tilesX; tx += 4) {
      ctx.beginPath();
      ctx.moveTo(tx * TILE_SIZE, 0);
      ctx.lineTo(tx * TILE_SIZE, tilesY * TILE_SIZE);
      ctx.stroke();
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
        ctx.fillStyle = (i + j) % 2 === 0 ? '#1a2a18' : '#1c2c1a';
        ctx.fillRect(i * size, j * size, size, size);
      }
    }
  }

  // ── Players ───────────────────────────────────────────────
  drawPlayer(player, isLocal = false) {
    const ctx = this.ctx;
    const { x, y, angle, health, maxHealth, shield, maxShield, name, skin, alive, isSprinting, isCrouching, armor } = player;
    if (!alive) return;

    const r = PLAYER_RADIUS;
    const color = SKIN_COLORS[skin % SKIN_COLORS.length] || '#4cc9f0';

    ctx.save();
    ctx.translate(x, y);

    // Shadow
    ctx.shadowColor = isLocal ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = isLocal ? 12 : 8;

    // Body circle
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Border
    ctx.strokeStyle = isLocal ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.5)';
    ctx.lineWidth = isLocal ? 2.5 : 1.5;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Direction indicator (gun barrel direction)
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(r * 0.4, 0);
    ctx.lineTo(r + 8, 0);
    ctx.strokeStyle = isLocal ? '#fff' : '#ccc';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.restore();

    // ── Health/shield bars (world space) ──────────────────────
    const barW = r * 2.5;
    const barH = 4;
    const barY = y - r - 14;

    // Shield bar (blue)
    if (shield > 0 && maxShield > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x - barW / 2, barY - 5, barW, barH);
      ctx.fillStyle = '#4cc9f0';
      ctx.fillRect(x - barW / 2, barY - 5, barW * (shield / maxShield), barH);
    }

    // Health bar (green)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - barW / 2, barY, barW, barH);
    const hFrac = health / (maxHealth || 100);
    const hColor = hFrac > 0.5 ? '#2dc653' : hFrac > 0.25 ? '#f5a623' : '#e63946';
    ctx.fillStyle = hColor;
    ctx.fillRect(x - barW / 2, barY, barW * hFrac, barH);

    // Name tag
    ctx.fillStyle = isLocal ? 'rgba(255,255,255,0.9)' : 'rgba(200,200,200,0.75)';
    ctx.font = isLocal ? 'bold 12px Rajdhani, sans-serif' : '11px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(name || '', x, barY - 2);
    ctx.textBaseline = 'alphabetic';
  }

  // ── Loot items ────────────────────────────────────────────
  drawLootItem(item, now = Date.now()) {
    const ctx = this.ctx;
    const { x, y, type, tier, itemId } = item;
    const tierColor = LOOT_TIERS[tier]?.color || '#aaa';
    const bob = Math.sin(now / 600 + x) * 2;

    ctx.save();
    ctx.translate(x, y + bob);

    // Glow
    ctx.shadowColor = tierColor;
    ctx.shadowBlur = 8;

    // Outer ring
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.strokeStyle = tierColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Icon based on type
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icons = {
      weapon: '🔫', ammo: '🔸', healing: '💊', armor: '🛡', shield: '🔵',
    };
    ctx.fillText(icons[type] || '?', 0, 0);

    ctx.restore();
  }

  // ── Projectiles ───────────────────────────────────────────
  drawProjectile(proj) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.rotate(proj.angle);
    ctx.fillStyle = '#ffe066';
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 6;
    ctx.fillRect(-6, -2, 12, 4);
    ctx.restore();
  }

  // ── Storm circle ──────────────────────────────────────────
  drawStorm(storm) {
    const ctx = this.ctx;
    const { centerX, centerY, currentRadius, targetCenterX, targetCenterY, targetRadius } = storm;

    // Outside-storm overlay (dark blue radial fill outside circle)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2, true); // clockwise cutout
    ctx.fillStyle = 'rgba(30,0,80,0.35)';
    ctx.fill('evenodd');

    // Storm ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,0,200,0.85)';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#7b00ff';
    ctx.shadowBlur = 20;
    ctx.stroke();

    // Target ring (dashed)
    if (targetRadius > 0 && targetRadius !== currentRadius) {
      ctx.beginPath();
      ctx.setLineDash([12, 8]);
      ctx.arc(targetCenterX || centerX, targetCenterY || centerY, targetRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100,0,200,0.35)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  // ── Effects ───────────────────────────────────────────────
  addMuzzleFlash(x, y, angle) {
    this._effects.push({ type: 'muzzleFlash', x, y, angle, life: 1, maxLife: 1, startTime: Date.now() });
  }

  addBulletTrace(x1, y1, x2, y2) {
    this._effects.push({ type: 'bulletTrace', x1, y1, x2, y2, life: 1, maxLife: 1, startTime: Date.now() });
  }

  addBloodSplat(x, y) {
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 40;
      this._effects.push({
        type: 'particle', x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, maxLife: 1,
        startTime: Date.now(),
        color: '#cc1122',
        radius: 2 + Math.random() * 3,
      });
    }
  }

  drawEffects(now = Date.now()) {
    const ctx = this.ctx;
    const keep = [];

    for (const fx of this._effects) {
      const age = (now - fx.startTime) / 300; // 300ms lifetime
      const life = Math.max(0, 1 - age);

      if (life <= 0) continue;
      keep.push(fx);

      if (fx.type === 'muzzleFlash') {
        ctx.save();
        ctx.translate(fx.x, fx.y);
        ctx.rotate(fx.angle);
        ctx.globalAlpha = life;
        ctx.fillStyle = '#ffe066';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.ellipse(8, 0, 16, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      } else if (fx.type === 'bulletTrace') {
        ctx.save();
        ctx.globalAlpha = life * 0.5;
        ctx.strokeStyle = '#ffe566';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fx.x1, fx.y1);
        ctx.lineTo(fx.x2, fx.y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      } else if (fx.type === 'particle') {
        const dt = (now - fx.startTime) / 1000;
        const x = fx.x + fx.vx * dt;
        const y = fx.y + fx.vy * dt + 80 * dt * dt; // slight gravity
        ctx.save();
        ctx.globalAlpha = life;
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.arc(x, y, fx.radius * life, 0, Math.PI * 2);
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
    ctx.fillStyle = '#f5a623';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📦', x, y);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
