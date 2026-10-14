// Line-of-sight fog of war. A tiny per-view visibility grid (2 samples per
// board square) is computed on the CPU with 2D line of sight, uploaded to a
// DataTexture, and every world material greys out what the viewer can't see.
// The green channel stores the region so blending never bleeds through walls.
import * as THREE from "three";
import { GRID, COLS, ROWS, CELL } from "./data.js";
import { losClear } from "./nav.js";

const NS = 2, W = COLS * NS, H = ROWS * NS, STEP = CELL / NS;
const X0 = -COLS * CELL / 2, Z0 = -ROWS * CELL / 2;
const REG = {};
[...new Set(GRID.join(""))].forEach((ch, i) => (REG[ch] = i + 1));
const regionOf = new Uint8Array(W * H);
const SX = new Float32Array(W * H), SZ = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const k = j * W + i;
  regionOf[k] = REG[GRID[Math.floor(j / NS)][Math.floor(i / NS)]];
  SX[k] = X0 + (i + 0.5) * STEP; SZ[k] = Z0 + (j + 0.5) * STEP;
}
const HALL = REG["."];

const data = new Uint8Array(W * H * 4);
for (let k = 0; k < W * H; k++) { data[k * 4] = 255; data[k * 4 + 1] = regionOf[k] * 16; data[k * 4 + 3] = 255; }
const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
tex.magFilter = tex.minFilter = THREE.NearestFilter;
tex.needsUpdate = true;
export const FOW_UNIFORMS = {
  fowMap: { value: tex },
  fowOn: { value: 0 },
  fowGrid: { value: new THREE.Vector4(X0, Z0, STEP, 0) },
};

const sampleIndex = (x, z) => {
  const i = Math.floor((x - X0) / STEP), j = Math.floor((z - Z0) / STEP);
  return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i;
};

// Per-view state: { vis: Float32Array, key }
export function computeVis(state, ex, ez, doors, force = false) {
  const key = `${Math.round(ex * 3)},${Math.round(ez * 3)},${doors.map((d) => Math.round(d * 8)).join("")}`;
  if (!force && state.vis && state.key === key) return state.vis;
  state.key = key;
  const vis = state.vis || (state.vis = new Float32Array(W * H));
  const me = sampleIndex(ex, ez);
  const myReg = me >= 0 ? regionOf[me] : 0;
  for (let k = 0; k < W * H; k++) {
    if (myReg && regionOf[k] === myReg && myReg !== HALL) { vis[k] = 1; continue; }
    const dx = SX[k] - ex, dz = SZ[k] - ez, d = Math.hypot(dx, dz);
    if (d < 0.9) { vis[k] = 1; continue; }
    if (d > 30) { vis[k] = 0; continue; }
    vis[k] = losClear(ex, ez, SX[k], SZ[k], doors) ? 1 : 0;
  }
  return vis;
}
export function uploadVis(vis) {
  if (!vis) { for (let k = 0; k < W * H; k++) data[k * 4] = 255; }
  else for (let k = 0; k < W * H; k++) data[k * 4] = vis[k] * 255;
  tex.needsUpdate = true;
}
// Visibility of a world point (0..1) for the given vis array.
export function visAt(vis, x, z) {
  if (!vis) return 1;
  const k = sampleIndex(x, z);
  return k < 0 ? 1 : vis[k];
}

const VERT_HEAD = "varying vec3 vFowP;\n";
const VERT_BODY = `
  {
    vec4 fw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      fw = instanceMatrix * fw;
    #endif
    fw = modelMatrix * fw;
    vFowP = fw.xyz + normalize(mat3(modelMatrix) * normal) * 0.25;
  }
`;
const FRAG_HEAD = `
varying vec3 vFowP;
uniform sampler2D fowMap;
uniform float fowOn;
uniform vec4 fowGrid;
float fowVis(vec2 p) {
  if (fowOn < 0.5) return 1.0;
  vec2 g = (p - fowGrid.xy) / fowGrid.z;
  ivec2 sz = ivec2(${W}, ${H});
  if (g.x < 0.0 || g.y < 0.0 || g.x >= float(sz.x) || g.y >= float(sz.y)) return 1.0;
  ivec2 c = ivec2(floor(g));
  vec4 me = texelFetch(fowMap, c, 0);
  vec2 f = g - 0.5;
  ivec2 b = ivec2(floor(f));
  vec2 t = fract(f);
  float sum = 0.0, ws = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    ivec2 q = clamp(b + ivec2(i, j), ivec2(0), sz - 1);
    vec4 s = texelFetch(fowMap, q, 0);
    float w = (i == 0 ? 1.0 - t.x : t.x) * (j == 0 ? 1.0 - t.y : t.y);
    if (abs(s.g - me.g) < 0.02) { sum += s.r * w; ws += w; }
  }
  return ws > 0.001 ? sum / ws : me.r;
}
`;
const FRAG_BODY = `
  {
    float fv = fowVis(vFowP.xz);
    float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
    outgoingLight = mix(vec3(lum) * vec3(0.16, 0.17, 0.2), outgoingLight, fv);
  }
  #include <opaque_fragment>
`;

const patched = new WeakSet();
export function patchMaterial(m) {
  if (!m || patched.has(m) || m.isShaderMaterial || m.isPointsMaterial || m.isSpriteMaterial || m.isLineBasicMaterial) return;
  patched.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev?.call(m, shader, r);
    Object.assign(shader.uniforms, FOW_UNIFORMS);
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + VERT_BODY);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace("#include <opaque_fragment>", FRAG_BODY);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : "") + "|fow";
  m.needsUpdate = true;
}
export function patchTree(root) {
  root.traverse((o) => {
    if (!o.material || o.userData.noFow) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) patchMaterial(m);
  });
}
