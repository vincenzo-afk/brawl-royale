// ============================================================
// MINIMAP
// ============================================================
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, isSolidTile, isWaterTile } from 'battle-royale-shared';

export class Minimap {
  constructor() {
    this.canvas = document.getElementById('minimap-canvas');
    this.ctx = this.canvas?.getContext('2d');
    this.size = 200;
    this.$phase = document.getElementById('mm-phase');
  }

  render(localPlayer, remotePlayers, storm, mapData = null, lootItems = []) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const s = this.size;
    const scaleX = s / MAP_WIDTH;
    const scaleY = s / MAP_HEIGHT;

    ctx.clearRect(0, 0, s, s);

    // Map base — walls, water and place markers
    if (mapData?.collision) {
      const { tilesX, tilesY, collision, pois } = mapData;
      const step = 2;
      for (let ty = 0; ty < tilesY; ty += step) {
        for (let tx = 0; tx < tilesX; tx += step) {
          const tile = collision[ty * tilesX + tx];
          if (isSolidTile(tile)) {
            ctx.fillStyle = 'rgba(45,45,50,0.95)';
            ctx.fillRect(tx * TILE_SIZE * scaleX, ty * TILE_SIZE * scaleY, 2, 2);
          } else if (isWaterTile(tile)) {
            ctx.fillStyle = 'rgba(60,120,190,0.55)';
            ctx.fillRect(tx * TILE_SIZE * scaleX, ty * TILE_SIZE * scaleY, 2, 2);
          }
        }
      }

      // Named places
      if (pois) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (const poi of pois) {
          const px = poi.x * scaleX;
          const py = poi.y * scaleY;
          ctx.fillStyle = '#ffd60a';
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '600 7px Rajdhani, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = 1.5;
          ctx.strokeText(poi.name.toUpperCase().slice(0, 12), px, py + 3);
          ctx.fillText(poi.name.toUpperCase().slice(0, 12), px, py + 3);
        }
      }
    } else {
      ctx.fillStyle = 'rgba(10,15,10,0.92)';
      ctx.fillRect(0, 0, s, s);
    }

    // Storm ring
    if (storm) {
      const cx = storm.centerX * scaleX;
      const cy = storm.centerY * scaleY;
      const r = storm.currentRadius * scaleX;

      // Dark outside
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, s, s);
      ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(50,0,100,0.4)';
      ctx.fill('evenodd');

      // Ring
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(140,0,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Target ring
      if (storm.targetRadius && storm.targetRadius !== storm.currentRadius) {
        const tr = storm.targetRadius * scaleX;
        const tx = (storm.targetCenterX || storm.centerX) * scaleX;
        const ty = (storm.targetCenterY || storm.centerY) * scaleY;
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.arc(tx, ty, tr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(140,0,255,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();

      if (this.$phase) this.$phase.textContent = storm.phase || 0;
    }

    // Remote players (triangles)
    for (const player of remotePlayers) {
      if (!player.alive) continue;
      const px = player.x * scaleX;
      const py = player.y * scaleY;
      ctx.fillStyle = player.teamId && localPlayer?.teamId === player.teamId ? '#2dc653' : '#e63946';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Local player (bright dot)
    if (localPlayer && localPlayer.alive) {
      const lx = localPlayer.x * scaleX;
      const ly = localPlayer.y * scaleY;

      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Direction arrow
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(localPlayer.angle || 0);
      ctx.fillStyle = '#f5a623';
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-3, -2.5);
      ctx.lineTo(-3, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, s, s);
  }
}
