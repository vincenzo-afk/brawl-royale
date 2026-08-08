// ============================================================
// MAIN ENTRY POINT — app bootstrap + scene routing
// ============================================================
import { NetworkClient } from './network/NetworkClient.js';
import { AudioManager } from './audio/AudioManager.js';
import { Game } from './Game.js';
import { Lobby } from './ui/Lobby.js';
import { Leaderboard } from './ui/Leaderboard.js';
import { S2C, GAME_MODES } from 'battle-royale-shared';

// ── Boot loader animation ──────────────────────────────────
const loaderBar = document.getElementById('loader-bar');
const loaderStatus = document.getElementById('loader-status');

function setProgress(pct, msg) {
  if (loaderBar) loaderBar.style.width = `${pct}%`;
  if (loaderStatus) loaderStatus.textContent = msg;
}

// ── Skin picker ────────────────────────────────────────────
const SKIN_COLORS = ['#4cc9f0', '#f72585', '#7209b7', '#3a86ff', '#fb8500', '#2dc653', '#e63946', '#ffd60a'];
let selectedSkin = 0;

function initSkinPicker() {
  const container = document.getElementById('skin-picker');
  if (!container) return;
  SKIN_COLORS.forEach((color, i) => {
    const btn = document.createElement('div');
    btn.className = `skin-option${i === 0 ? ' selected' : ''}`;
    btn.style.background = color;
    btn.title = `Skin ${i + 1}`;
    btn.addEventListener('click', () => {
      selectedSkin = i;
      container.querySelectorAll('.skin-option').forEach((el, idx) => {
        el.classList.toggle('selected', idx === i);
      });
    });
    container.appendChild(btn);
  });
}

// ── Screen manager ─────────────────────────────────────────
function showScreen(id) {
  const screens = ['loading-screen', 'main-menu', 'matchmaking-screen', 'custom-lobby-screen',
    'countdown-overlay', 'game-layer', 'death-screen', 'match-end-screen', 'leaderboard-overlay'];

  screens.forEach(s => {
    const el = document.getElementById(s);
    if (!el) return;
    if (s === id) {
      el.classList.remove('hidden');
    } else if (s !== 'game-layer' || id !== 'hud') {
      // Don't hide game-layer when showing HUD elements
    }
  });
}

function hideScreen(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

// ── Main boot ─────────────────────────────────────────────
async function boot() {
  setProgress(10, 'Starting engine…');

  // Initialize skin picker
  initSkinPicker();

  setProgress(30, 'Connecting to server…');

  // Network
  const network = new NetworkClient();

  // Audio
  const audio = new AudioManager();
  audio.registerAll();

  // Game instance
  const game = new Game(network, audio);

  // UI
  const lobby = new Lobby(network);
  const leaderboard = new Leaderboard();

  // ── Network event handlers ───────────────────────────────
  network.on(S2C.CONNECTED, ({ playerId }) => {
    game.setLocalPlayerId(playerId);
  });

  network.on(S2C.MATCHMAKING_STATUS, (data) => {
    if (data.status === 'queued') {
      lobby.showMatchmaking(data.mode || 'SOLO', data.players || 1, data.maxPlayers || 64);
    } else if (data.status === 'starting' || data.status === 'matched') {
      lobby.updateMatchmakingStatus(data);
      if (data.countdown !== undefined) {
        showCountdown(data.countdown);
      }
    } else if (data.status === 'left') {
      hideScreen('matchmaking-screen');
      showScreen('main-menu');
    }
  });

  network.on(S2C.LOBBY_CREATED, ({ code }) => {
    lobby.showLobbyCode(code);
  });

  network.on(S2C.MATCH_START, (data) => {
    hideScreen('matchmaking-screen');
    hideScreen('countdown-overlay');
    hideScreen('custom-lobby-screen');
    document.getElementById('game-layer').classList.remove('hidden');
    game._onMatchStart(data);
  });

  network.on(S2C.MATCH_END, () => {
    // Already handled in Game.js — just hide death screen if showing
    hideScreen('death-screen');
  });

  network.on(S2C.PLAYER_DIED, (data) => {
    if (data.playerId === game.localPlayerId) {
      showScreen('death-screen');
    }
  });

  network.on(S2C.LEADERBOARD_DATA, (data) => {
    leaderboard.render(data || []);
    showScreen('leaderboard-overlay');
  });

  network.on('disconnect', () => {
    if (serverStatus) {
      serverStatus.textContent = '● Disconnected';
      serverStatus.className = 'server-status error';
    }
  });

  network.on('reconnect', () => {
    if (serverStatus) {
      serverStatus.textContent = '● Reconnected';
      serverStatus.className = 'server-status connected';
    }
  });

  setProgress(60, 'Connecting…');

  const serverStatus = document.getElementById('server-status');

  try {
    await network.connect();
    setProgress(90, 'Connected!');
    if (serverStatus) {
      serverStatus.textContent = '● Connected';
      serverStatus.className = 'server-status connected';
    }
  } catch (err) {
    setProgress(100, 'Failed to connect. Retrying…');
    if (serverStatus) {
      serverStatus.textContent = '● Offline — server unreachable';
      serverStatus.className = 'server-status error';
    }
  }

  setProgress(100, 'Ready!');

  // ── Transition to main menu ──────────────────────────────
  await sleep(600);
  const loadingEl = document.getElementById('loading-screen');
  if (loadingEl) {
    loadingEl.style.opacity = '0';
    await sleep(500);
    loadingEl.style.display = 'none';
  }
  showScreen('main-menu');

  // ── Button handlers ──────────────────────────────────────
  const getName = () => (document.getElementById('player-name')?.value || 'Brawler').trim().slice(0, 16);

  // Mode buttons
  ['solo', 'duo', 'squad'].forEach(mode => {
    document.getElementById(`btn-${mode}`)?.addEventListener('click', () => {
      const modeUpper = mode.toUpperCase();
      network.joinMatchmaking(modeUpper, 'us-east', getName(), 1000, selectedSkin);
      hideScreen('main-menu');
      showScreen('matchmaking-screen');
      lobby.showMatchmaking(modeUpper, 1, GAME_MODES[modeUpper]?.maxPlayers || 64);
    });
  });

  // Cancel queue
  document.getElementById('btn-cancel-queue')?.addEventListener('click', () => {
    network.leaveMatchmaking();
    lobby.stopMatchmaking();
  });

  // Custom lobby
  document.getElementById('btn-custom')?.addEventListener('click', () => {
    hideScreen('main-menu');
    showScreen('custom-lobby-screen');
  });

  document.getElementById('btn-back-main')?.addEventListener('click', () => {
    hideScreen('custom-lobby-screen');
    showScreen('main-menu');
  });

  document.getElementById('btn-create-lobby')?.addEventListener('click', () => {
    network.createCustomLobby('SOLO', getName(), selectedSkin);
  });

  document.getElementById('btn-join-code')?.addEventListener('click', () => {
    const code = lobby.getEnteredCode();
    if (code.length >= 4) {
      network.joinCustomLobby(code, getName(), selectedSkin);
      lobby.clearCode();
    }
  });

  // Leaderboard
  document.getElementById('btn-leaderboard')?.addEventListener('click', () => {
    network.requestLeaderboard();
  });

  document.getElementById('btn-lb-close')?.addEventListener('click', () => {
    hideScreen('leaderboard-overlay');
  });

  // Play again / back to menu
  document.getElementById('btn-play-again')?.addEventListener('click', () => {
    location.reload();
  });

  document.getElementById('btn-end-menu')?.addEventListener('click', () => {
    location.reload();
  });

  document.getElementById('btn-back-menu')?.addEventListener('click', () => {
    location.reload();
  });

  // Lobby code click to copy
  document.getElementById('lobby-code')?.addEventListener('click', async () => {
    const code = document.getElementById('lobby-code')?.textContent;
    if (code && code !== '------') {
      await navigator.clipboard.writeText(code).catch(() => {});
    }
  });
}

// ── Countdown overlay ─────────────────────────────────────
let _countdownInterval = null;
function showCountdown(startValue) {
  clearInterval(_countdownInterval);
  showScreen('countdown-overlay');
  const el = document.getElementById('countdown-number');
  let val = startValue;
  if (el) el.textContent = val;

  _countdownInterval = setInterval(() => {
    val--;
    if (el) {
      el.textContent = val > 0 ? val : 'GO!';
      // Trigger CSS animation
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = 'countPulse 1s ease-in-out';
    }
    if (val <= 0) {
      clearInterval(_countdownInterval);
      setTimeout(() => hideScreen('countdown-overlay'), 800);
    }
  }, 1000);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

boot().catch(err => console.error('Boot failed:', err));
