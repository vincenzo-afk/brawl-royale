// ============================================================
// LOBBY UI
// ============================================================
export class Lobby {
  constructor(network) {
    this.network = network;
    this.currentMode = 'SOLO';
    this._queueStart = 0;
    this._queueInterval = null;

    this.$queueMode = document.getElementById('queue-mode');
    this.$queueCount = document.getElementById('queue-count');
    this.$queueTime = document.getElementById('queue-time');
    this.$lobbyCode = document.getElementById('lobby-code');
    this.$codeInput = document.getElementById('lobby-code-input');
  }

  showMatchmaking(mode, players, maxPlayers) {
    this.currentMode = mode;
    if (this.$queueMode) this.$queueMode.textContent = mode;
    if (this.$queueCount) this.$queueCount.textContent = `${players} / ${maxPlayers}`;
    this._queueStart = Date.now();
    clearInterval(this._queueInterval);
    this._queueInterval = setInterval(() => {
      const secs = Math.round((Date.now() - this._queueStart) / 1000);
      if (this.$queueTime) this.$queueTime.textContent = `Searching… ${secs}s`;
    }, 1000);
  }

  updateMatchmakingStatus(data) {
    if (data.players && this.$queueCount) {
      this.$queueCount.textContent = `${data.players} / ${data.maxPlayers || 64}`;
    }
  }

  stopMatchmaking() {
    clearInterval(this._queueInterval);
  }

  showLobbyCode(code) {
    if (this.$lobbyCode) {
      this.$lobbyCode.textContent = code;
    }
  }

  getEnteredCode() {
    return (this.$codeInput?.value || '').trim().toUpperCase();
  }

  clearCode() {
    if (this.$codeInput) this.$codeInput.value = '';
  }
}
