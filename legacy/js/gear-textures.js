// Small deterministic, tileable material maps. DataTexture keeps this usable
// in the browser and in geometry checks without a canvas or fetched assets.
import * as THREE from "three";

const cache = new Map();
const fract = (x) => x - Math.floor(x);
const hash = (x, y, seed) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);

export function gearTexture(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const size = 128;
  const bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = hash(x, y, 3) - 0.5;
    const slow = hash(Math.floor(x / 8), Math.floor(y / 8), 7) - 0.5;
    let v = 226;
    if (kind === "steel") v = 225 + n * 19 + slow * 12 + Math.sin(y * 0.74 + Math.sin(x * 0.09) * 3) * 5;
    else if (kind === "brass") v = 224 + n * 16 + Math.sin(y * 0.31) * 7;
    else if (kind === "wood") v = 202 + n * 17 + slow * 14 + Math.sin(x * 0.38 + Math.sin(y * 0.035) * 3) * 19;
    else if (kind === "leather") v = 209 + n * 29 + slow * 15;
    else if (kind === "cloth") v = 222 + n * 13 + ((x % 4 === 0 || y % 4 === 0) ? -7 : 3);
    else if (kind === "mail") {
      const u = x % 12, w = y % 10;
      const cx = w < 5 ? 3 : 9;
      const d = Math.hypot((u - cx) / 4.1, (w - 4.5) / 3.5);
      v = 109 + (Math.abs(d - 1) < 0.2 ? 126 : 0) + n * 17;
    }
    const i = (y * size + x) * 4;
    const c = Math.max(35, Math.min(255, Math.round(v)));
    bytes[i] = c; bytes[i + 1] = c; bytes[i + 2] = c; bytes[i + 3] = 255;
  }
  const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(kind === "mail" ? 4 : 2, kind === "mail" ? 6 : 2);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  cache.set(kind, t);
  return t;
}
