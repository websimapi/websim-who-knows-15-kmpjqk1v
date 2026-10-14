// Seeded randomness and noise. Every subsystem forks its own stream from the
// world seed so changing one system never reshuffles another.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function fork(seed, name) {
  return mulberry32((seed ^ hashStr(name)) >>> 0);
}

export const randInt = (r, a, b) => a + Math.floor(r() * (b - a + 1));
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// ---- 2D simplex noise (seeded) ----
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1],
];

export function makeNoise2D(rand) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  return function noise(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = GRAD[perm[ii + perm[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = GRAD[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = GRAD[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * n; // ~[-1, 1]
  };
}

export function fbm(noise, x, y, oct = 5, lac = 2, gain = 0.5) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * noise(x * f, y * f);
    norm += amp;
    amp *= gain;
    f *= lac;
  }
  return sum / norm;
}

export function ridged(noise, x, y, oct = 4) {
  let amp = 0.5, f = 1, sum = 0, prev = 1;
  for (let o = 0; o < oct; o++) {
    let n = 1 - Math.abs(noise(x * f, y * f));
    n *= n;
    sum += n * amp * prev;
    prev = n;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum; // ~[0, 1]
}
