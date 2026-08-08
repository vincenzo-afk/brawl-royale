// ============================================================
// MINIMAP
// ============================================================
import { MAP_WIDTH, MAP_HEIGHT } from 'battle-royale-shared';

export class Minimap {
  constructor() {
    this.canvas = document.getElementById('minimap-canvas');
    this.ctx = this.canvas?.getContext('2d');
    this.size = 200;
    this.$phase = document.getElementById('mm-phase');
  }

  render(localPlayer, remotePlayers, storm, lootItems = []) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const s = this.size;
    const scaleX = s / MAP_WIDTH;
    const scaleY = s / MAP_HEIGHT;

    ctx.clearRect(0, 0, s, s);

    // Background
    ctx.fillStyle = 'rgba(10,15,10,0.92)';
    ctx.fillRect(0, 0, s, s);

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
