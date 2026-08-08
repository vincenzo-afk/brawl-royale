// ============================================================
// HUD — HTML-based heads-up display management
// ============================================================
import { KILL_FEED_DURATION_MS, KILL_FEED_MAX } from 'battle-royale-shared';

export class HUD {
  constructor() {
    this.$alive = document.getElementById('hud-alive');
    this.$total = document.getElementById('hud-total');
    this.$stormTime = document.getElementById('hud-storm-time');
    this.$ping = document.getElementById('hud-ping');
    this.$shieldBar = document.getElementById('shield-bar');
    this.$shieldVal = document.getElementById('shield-val');
    this.$healthBar = document.getElementById('health-bar');
    this.$healthVal = document.getElementById('health-val');
    this.$killFeed = document.getElementById('kill-feed');
    this.$ammoMag = document.getElementById('ammo-mag');
    this.$ammoReserve = document.getElementById('ammo-reserve');
    this.$reloadIndicator = document.getElementById('reload-indicator');
    this.$reloadBar = document.getElementById('reload-bar');
    this.$interactionPrompt = document.getElementById('interaction-prompt');
    this.$interactItemName = document.getElementById('interact-item-name');
    this.$hitMarker = document.getElementById('hit-marker');
    this.$helmetIcon = document.getElementById('helmet-icon');
    this.$vestIcon = document.getElementById('vest-icon');

    this._killFeedEntries = [];
    this._hitMarkerTimeout = null;
    this._reloadStart = 0;
    this._reloadDuration = 0;
    this._reloadRAF = null;
  }

  updateHealth(health, maxHealth, shield, maxShield) {
    const hp = Math.max(0, health);
    const sh = Math.max(0, shield);
    if (this.$healthBar) this.$healthBar.style.width = `${(hp / maxHealth) * 100}%`;
    if (this.$healthVal) this.$healthVal.textContent = Math.round(hp);
    if (this.$shieldBar) this.$shieldBar.style.width = `${(sh / maxShield) * 100}%`;
    if (this.$shieldVal) this.$shieldVal.textContent = Math.round(sh);
  }

  updateAmmo(mag, reserve) {
    if (this.$ammoMag) this.$ammoMag.textContent = mag === Infinity ? '∞' : mag;
    if (this.$ammoReserve) this.$ammoReserve.textContent = reserve === Infinity ? '∞' : reserve;
  }

  updatePlayerCount(alive, total) {
    if (this.$alive) this.$alive.textContent = alive;
    if (this.$total) this.$total.textContent = total;
  }

  updateStormTimer(msRemaining) {
    if (!this.$stormTime) return;
    const secs = Math.max(0, Math.ceil(msRemaining / 1000));
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    this.$stormTime.textContent = `${m}:${s}`;
  }

  updatePing(ms) {
    if (!this.$ping) return;
    const color = ms < 80 ? '#2dc653' : ms < 150 ? '#f5a623' : '#e63946';
    this.$ping.textContent = `${ms} ms`;
    this.$ping.style.color = color;
  }

  updateArmor(helmetTier, vestTier) {
    if (this.$helmetIcon) this.$helmetIcon.classList.toggle('active', helmetTier > 0);
    if (this.$vestIcon) this.$vestIcon.classList.toggle('active', vestTier > 0);
  }

  // Weapon slots
  updateInventory(inventory, activeSlot) {
    for (let i = 0; i <= 2; i++) {
      const slotEl = document.getElementById(`inv-slot-${i}`);
      const weapEl = document.getElementById(`slot-weapon-${i}`);
      const ammoEl = document.getElementById(`slot-ammo-${i}`);
      if (!slotEl) continue;

      slotEl.classList.toggle('active', activeSlot === i);
      const item = inventory[i];
      if (item && item.weaponId) {
        if (weapEl) weapEl.textContent = item.weaponId.replace(/_/g, ' ');
        if (ammoEl) ammoEl.textContent = item.ammoInMag === Infinity ? '∞' : `${item.ammoInMag}/${item.reserveAmmo}`;
      } else {
        if (weapEl) weapEl.textContent = i === 2 ? 'FISTS' : '—';
        if (ammoEl) ammoEl.textContent = i === 2 ? '∞' : '';
      }
    }
  }

  // Kill feed
  addKillEntry(killer, victim, weapon, isHeadshot) {
    const entry = document.createElement('div');
    entry.className = `kill-entry${isHeadshot ? ' headshot' : ''}`;
    entry.innerHTML = `
      <span class="killer">${this._escapeHtml(killer)}</span>
      <span class="weapon"> [${this._escapeHtml(weapon || '?')}]${isHeadshot ? ' 🎯' : ''} </span>
      <span class="victim">${this._escapeHtml(victim)}</span>
    `;
    if (this.$killFeed) {
      this.$killFeed.prepend(entry);
      this._killFeedEntries.push(entry);
    }

    // Auto-remove after duration
    setTimeout(() => {
      entry.style.opacity = '0';
      setTimeout(() => entry.remove(), 500);
    }, KILL_FEED_DURATION_MS);

    // Cap
    while (this._killFeedEntries.length > KILL_FEED_MAX) {
      const old = this._killFeedEntries.shift();
      old?.remove();
    }
  }

  // Hit marker flash
  showHitMarker() {
    if (!this.$hitMarker) return;
    this.$hitMarker.classList.remove('hidden', 'visible');
    void this.$hitMarker.offsetWidth; // reflow
    this.$hitMarker.classList.add('visible');
    clearTimeout(this._hitMarkerTimeout);
    this._hitMarkerTimeout = setTimeout(() => {
      this.$hitMarker.classList.remove('visible');
      this.$hitMarker.classList.add('hidden');
    }, 300);
  }

  // Reload indicator
  showReload(durationMs) {
    if (!this.$reloadIndicator) return;
    this.$reloadIndicator.classList.remove('hidden');
    this._reloadStart = Date.now();
    this._reloadDuration = durationMs;
    this._animateReload();
  }

  _animateReload() {
    const progress = Math.min(1, (Date.now() - this._reloadStart) / this._reloadDuration);
    if (this.$reloadBar) this.$reloadBar.style.width = `${progress * 100}%`;
    if (progress < 1) {
      this._reloadRAF = requestAnimationFrame(() => this._animateReload());
    } else {
      this.hideReload();
    }
  }

  hideReload() {
    cancelAnimationFrame(this._reloadRAF);
    if (this.$reloadIndicator) this.$reloadIndicator.classList.add('hidden');
  }

  // Interaction prompt
  showInteractionPrompt(itemName) {
    if (!this.$interactionPrompt) return;
    this.$interactionPrompt.classList.remove('hidden');
    if (this.$interactItemName) this.$interactItemName.textContent = itemName;
  }

  hideInteractionPrompt() {
    if (this.$interactionPrompt) this.$interactionPrompt.classList.add('hidden');
  }

  _escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
