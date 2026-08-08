// ============================================================
// DAY / NIGHT CYCLE
// Drives the global lighting: ambient darkness, a color-grade
// tint (sunset oranges, night blues, dawn pinks) and a fake
// 24h clock. A full cycle takes cycleDurationMs.
// ============================================================

// [sunHeight, {r,g,b,a}] keyframes — sunHeight: 1 = noon, 0 = horizon, -1 = midnight
const TINT_KEYFRAMES = [
  [1.0,  { r: 255, g: 246, b: 214, a: 0.05 }],  // noon — barely warm
  [0.45, { r: 255, g: 216, b: 150, a: 0.14 }],  // afternoon
  [0.12, { r: 255, g: 150, b: 82,  a: 0.28 }],  // golden hour
  [0.0,  { r: 214, g: 122, b: 108, a: 0.30 }],  // sunset
  [-0.35,{ r: 108, g: 96,  b: 168, a: 0.34 }],  // twilight
  [-0.7, { r: 30,  g: 44,  b: 100, a: 0.40 }],  // night
  [-1.0, { r: 22,  g: 32,  b: 76,  a: 0.46 }],  // midnight
  [-0.2, { r: 96,  g: 74,  b: 130, a: 0.34 }],  // pre-dawn
  [0.18, { r: 255, g: 176, b: 122, a: 0.24 }],  // dawn
  [1.0,  { r: 255, g: 246, b: 214, a: 0.05 }],  // wrap
];

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function blendTint(sunHeight) {
  let lo = TINT_KEYFRAMES[0];
  let hi = TINT_KEYFRAMES[TINT_KEYFRAMES.length - 1];
  for (let i = 0; i < TINT_KEYFRAMES.length - 1; i++) {
    if (sunHeight >= TINT_KEYFRAMES[i][0] && sunHeight <= TINT_KEYFRAMES[i + 1][0]) {
      lo = TINT_KEYFRAMES[i];
      hi = TINT_KEYFRAMES[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const t = Math.max(0, Math.min(1, (sunHeight - lo[0]) / span));
  const a = lo[1], b = hi[1];
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
    a: lerp(a.a, b.a, t),
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

    const ambient = 0.13 + nightFactor * 0.37;            // darkness amount
    const tint = blendTint(sunHeight);

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
