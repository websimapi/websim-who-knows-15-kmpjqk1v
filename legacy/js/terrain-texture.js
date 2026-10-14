import * as THREE from "three";

// A small, tileable detail texture. Biome and road colour still come from the
// terrain vertices; this supplies the fine soil, grit and root-scale relief.
export function createTerrainTextures(seed) {
  const size = 256;
  const albedo = document.createElement("canvas");
  const height = document.createElement("canvas");
  albedo.width = albedo.height = height.width = height.height = size;
  const colorData = albedo.getContext("2d").createImageData(size, size);
  const bumpData = height.getContext("2d").createImageData(size, size);
  const hash = (x, y) => {
    let h = Math.imul(x + seed, 374761393) ^ Math.imul(y - seed, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y, cells) => {
    const u = x * cells / size, v = y * cells / size;
    const ix = Math.floor(u), iy = Math.floor(v);
    const fx = u - ix, fy = v - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (a, b) => hash((a + cells) % cells, (b + cells) % cells);
    const top = at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx;
    const bottom = at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const broad = noise(x, y, 8), grain = noise(x, y, 32), fine = noise(x, y, 128);
    const pebble = hash(x * 11, y * 13);
    const grit = (broad - .5) * 30 + (grain - .5) * 23 + (fine - .5) * 13;
    const fleck = pebble > .985 ? -28 : pebble < .01 ? 12 : 0;
    const value = Math.max(176, Math.min(255, Math.round(235 + grit + fleck)));
    const relief = Math.max(0, Math.min(255, Math.round(128 + grit * 3 + fleck * 1.4)));
    const i = (y * size + x) * 4;
    colorData.data[i] = value;
    colorData.data[i + 1] = Math.max(0, value - 2);
    colorData.data[i + 2] = Math.max(0, value - 7);
    colorData.data[i + 3] = 255;
    bumpData.data[i] = bumpData.data[i + 1] = bumpData.data[i + 2] = relief;
    bumpData.data[i + 3] = 255;
  }
  albedo.getContext("2d").putImageData(colorData, 0, 0);
  height.getContext("2d").putImageData(bumpData, 0, 0);
  const map = new THREE.CanvasTexture(albedo);
  const bumpMap = new THREE.CanvasTexture(height);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [map, bumpMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
  }
  return { map, bumpMap };
}
