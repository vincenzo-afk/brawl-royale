// ============================================================
// DAY / NIGHT CYCLE
// Drives the global lighting: ambient darkness, a color-grade
// tint (sunset oranges, night blues, dawn pinks) and a fake
// 24h clock. A full cycle takes cycleDurationMs.
// ============================================================

// [progress, {r,g,b,a}] keyframes keyed by CYCLE PROGRESS (0..1, monotonic
// time) so evening and morning can have distinct looks. 0 = noon,
// 0.25 ≈ sunset, 0.5 = midnight, 0.75 ≈ dawn.
const TINT_KEYFRAMES = [
  [0.00, { r: 255, g: 246, b: 214, a: 0.05 }],  // noon — barely warm
  [0.18, { r: 255, g: 216, b: 150, a: 0.14 }],  // afternoon
  [0.23, { r: 255, g: 150, b: 82,  a: 0.28 }],  // golden hour
  [0.26, { r: 214, g: 122, b: 108, a: 0.28 }],  // sunset
  [0.31, { r: 108, g: 96,  b: 168, a: 0.28 }],  // twilight
  [0.39, { r: 30,  g: 44,  b: 100, a: 0.30 }],  // night
  [0.50, { r: 22,  g: 32,  b: 76,  a: 0.34 }],  // midnight
  [0.61, { r: 96,  g: 74,  b: 130, a: 0.28 }],  // pre-dawn
  [0.73, { r: 255, g: 176, b: 122, a: 0.22 }],  // dawn
  [1.00, { r: 255, g: 246, b: 214, a: 0.05 }],  // wrap → noon
];

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function blendTint(progress) {
  // Progress is monotonic (0..1), so a simple ascending scan is exact:
  // every keyframe is reachable and the curve is continuous by construction.
  let lo = TINT_KEYFRAMES[0];
  let hi = TINT_KEYFRAMES[TINT_KEYFRAMES.length - 1];
  for (let i = 0; i < TINT_KEYFRAMES.length - 1; i++) {
    const a = TINT_KEYFRAMES[i][0];
    const b = TINT_KEYFRAMES[i + 1][0];
    if (progress >= a && progress <= b) {
      lo = TINT_KEYFRAMES[i];
      hi = TINT_KEYFRAMES[i + 1];
      break;
    }
  }
  const a = lo[0], b = hi[0];
  const t = b !== a ? (progress - a) / (b - a) : 0;
  const ca = lo[1], cb = hi[1];
  return {
    r: Math.round(lerp(ca.r, cb.r, t)),
    g: Math.round(lerp(ca.g, cb.g, t)),
    b: Math.round(lerp(ca.b, cb.b, t)),
    a: lerp(ca.a, cb.a, t),
  };
}

export class DayNightCycle {
  constructor(cycleDurationMs = 240000) { // 4 minutes
    this.cycleDurationMs = cycleDurationMs;
  }

  // elapsedMs = time since match start
  getState(elapsedMs) {
    const t = ((elapsedMs % this.cycleDurationMs) + this.cycleDurationMs) % this.cycleDurationMs;
    const progress = t / this.cycleDurationMs;            // 0..1
    const sunHeight = Math.cos(progress * Math.PI * 2);   // 1 noon → -1 midnight

    // Smooth day↔night blend around the horizon
    const nightFactor = 1 - smoothstep(-0.25, 0.25, sunHeight);

    // Ambient darkness — capped so night stays playable (ambient + tint
    // stack, ~0.62 effective darkness at midnight)
    const ambient = 0.13 + nightFactor * 0.32;
    const tint = blendTint(progress);

    // Fake 24h clock (noon = start of cycle)
    const hoursFloat = (12 + progress * 24) % 24;
    const hh = Math.floor(hoursFloat).toString().padStart(2, '0');
    const mm = Math.floor((hoursFloat % 1) * 60).toString().padStart(2, '0');

    return {
      progress,
      sunHeight,
      dayFactor: 1 - nightFactor,
      nightFactor,
      ambient,
      tint,
      clockLabel: `${hh}:${mm}`,
      icon: nightFactor > 0.5 ? '🌙' : '☀️',
    };
  }
}
