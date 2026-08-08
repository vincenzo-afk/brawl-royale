// ============================================================
// DEATH SCREEN — post-death stats + spectator controls
// ============================================================
export class DeathScreen {
  constructor() {
    this.$screen = document.getElementById('death-screen');
    this.$stats = document.getElementById('death-stats');
    this.$spectateName = document.getElementById('spectate-name');
    this.$btnPrev = document.getElementById('btn-spectate-prev');
    this.$btnNext = document.getElementById('btn-spectate-next');
    this.spectatePlayers = [];
    this.spectateIndex = 0;
    this.onSpectateChange = null;
  }

  show(placement, kills, damageDealt, survivalTime, killerName) {
    if (!this.$screen) return;
    this.$screen.classList.remove('hidden');
    if (this.$stats) {
      const mins = Math.floor(survivalTime / 60);
      const secs = survivalTime % 60;
      this.$stats.innerHTML = `
        <div>Eliminated by: <strong>${this._escape(killerName || 'Storm')}</strong></div>
        <div>Placement: <strong>#${placement}</strong></div>
        <div>Kills: <strong>${kills}</strong></div>
        <div>Damage: <strong>${damageDealt}</strong></div>
        <div>Survived: <strong>${mins}m ${secs}s</strong></div>
      `;
    }
  }

  hide() {
    if (this.$screen) this.$screen.classList.add('hidden');
  }

  setSpectatePlayers(players) {
    this.spectatePlayers = players.filter(p => p.alive);
    this.spectateIndex = 0;
    this.updateSpectateLabel();
  }

  spectateNext() {
    if (this.spectatePlayers.length === 0) return;
    this.spectateIndex = (this.spectateIndex + 1) % this.spectatePlayers.length;
    this.updateSpectateLabel();
    if (this.onSpectateChange) this.onSpectateChange(this.spectatePlayers[this.spectateIndex]);
  }

  spectatePrev() {
    if (this.spectatePlayers.length === 0) return;
    this.spectateIndex = (this.spectateIndex - 1 + this.spectatePlayers.length) % this.spectatePlayers.length;
    this.updateSpectateLabel();
    if (this.onSpectateChange) this.onSpectateChange(this.spectatePlayers[this.spectateIndex]);
  }

  updateSpectateLabel() {
    const p = this.spectatePlayers[this.spectateIndex];
    if (this.$spectateName) {
      this.$spectateName.textContent = p ? `Spectating: ${p.name}` : 'No players alive';
    }
  }

  _escape(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
