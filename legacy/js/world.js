// World generation: seeded heightfield, biomes, seamless chunked terrain, rivers,
// roads, the three Act I settlements, Wayshrines, vegetation, a collision
// hash grid, line-of-sight ray marching and the Sunken Mile dungeon.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fork, makeNoise2D, fbm, ridged, randInt } from "./rng.js";
import { buildMarrowgate } from "./city.js";
import { createGrassField } from "./grass.js";
import { createTerrainTextures } from "./terrain-texture.js";
import { LeafFall } from "./foliage.js";
import { createTreeAssets } from "./trees.js";
import { buildCaves, CAVES } from "./caves.js";
import { horseStableSpots } from "../server.js";

export const HALF = 400;           // overworld spans [-HALF, HALF]
const STEP = 2;                    // heightfield spacing (m)
const N = HALF * 2 / STEP + 1;     // samples per side
const CHUNK = 100;
export const DUNGEON_X = 1400;     // the Sunken Mile lives off-map at this x

// Near blades carry the silhouette; simpler clumps continue the field toward
// the horizon without paying the near geometry cost across the whole map.
const GRASS_PROFILES = {
  low: {
    near: { capacity: 7500, radius: 44, fade: 12, spacing: .95, blades: 5, segments: 2, update: 4 },
    middle: { capacity: 4000, radius: 86, inner: 32, fade: 16, spacing: 2.45, blades: 3, segments: 2, update: 13 },
    far: { capacity: 4000, radius: 160, inner: 70, fade: 18, spacing: 5, blades: 2, segments: 1, update: 35 },
  },
  medium: {
    near: { capacity: 23500, radius: 65, fade: 18, spacing: .78, blades: 6, segments: 3, update: 3.5 },
    middle: { capacity: 16000, radius: 132, inner: 47, fade: 24, spacing: 1.8, blades: 4, segments: 2, update: 11 },
    far: { capacity: 16000, radius: 280, inner: 108, fade: 28, spacing: 4.2, blades: 2, segments: 1, update: 30 },
  },
  high: {
    near: { capacity: 62500, radius: 86, fade: 22, spacing: .62, blades: 7, segments: 3, update: 3 },
    middle: { capacity: 46000, radius: 185, inner: 64, fade: 30, spacing: 1.45, blades: 4, segments: 2, update: 9 },
    far: { capacity: 35000, radius: 380, inner: 155, fade: 34, spacing: 3.8, blades: 2, segments: 1, update: 26 },
  },
};

function grassHash(seed, x, z, salt) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed | 0, 362437) + salt;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return [Math.sqrt(x * x + z * z), t];
}

// ---------- collision grid ----------
class Colliders {
  constructor() { this.cells = new Map(); this.all = []; }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  add(c) {
    const r = c.type === "c" ? c.r : Math.hypot(c.hw, c.hd);
    c.id = this.all.length; this.all.push(c);
    for (let i = Math.floor((c.x - r) / 4); i <= Math.floor((c.x + r) / 4); i++)
      for (let j = Math.floor((c.z - r) / 4); j <= Math.floor((c.z + r) / 4); j++) {
        const k = this.key(i, j);
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(c);
      }
    return c;
  }
  remove(c) {
    if (!c || !this.all[c.id]) return;
    const r = c.type === "c" ? c.r : Math.hypot(c.hw, c.hd);
    for (let i = Math.floor((c.x - r) / 4); i <= Math.floor((c.x + r) / 4); i++)
      for (let j = Math.floor((c.z - r) / 4); j <= Math.floor((c.z + r) / 4); j++) {
        const key = this.key(i, j), list = this.cells.get(key);
        if (!list) continue;
        const at = list.indexOf(c);
        if (at >= 0) list.splice(at, 1);
        if (!list.length) this.cells.delete(key);
      }
    this.all[c.id] = null;
  }
  circle(x, z, r, h = 6) { return this.add({ type: "c", x, z, r, h }); }
  box(x, z, hw, hd, rot = 0, h = 4, y0 = -50) { return this.add({ type: "b", x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), h, y0 }); }
  near(x, z, r, out = []) {
    out.length = 0;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let i = Math.floor((x - r) / 4); i <= Math.floor((x + r) / 4); i++)
      for (let j = Math.floor((z - r) / 4); j <= Math.floor((z + r) / 4); j++) {
        const a = this.cells.get(this.key(i, j));
        if (a) for (const c of a) if (!seen.has(c.id)) { seen.add(c.id); out.push(c); }
      }
    return out;
  }
  // push a circle (p.x, p.z, r) out of all static colliders
  resolve(p, r) {
    const list = this.near(p.x, p.z, r + 2, this._tmp || (this._tmp = []));
    for (const c of list) {
      if (c.disabled) continue;
      if (Number.isFinite(c.top) && p.y >= c.top + .1) continue;
      if (Number.isFinite(c.y0) && p.y + 1.4 < c.y0) continue;
      if (c.type === "c") {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-5) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
      } else {
        // Door holes only pass a full-height actor when there is clearance on both jambs.
        const dx = p.x - c.x, dz = p.z - c.z;
        const lx = dx * c.cos + dz * c.sin, lz = -dx * c.sin + dz * c.cos;
        const fitsOpening = c.holes?.some(h => p.y >= h.y0 - .04 && p.y + 1.4 <= h.y1 + .04
          && h.axis === "x" && lx >= h.min + r && lx <= h.max - r);
        if (fitsOpening) continue;
        const cx = Math.max(-c.hw, Math.min(c.hw, lx)), cz = Math.max(-c.hd, Math.min(c.hd, lz));
        let ox = lx - cx, oz = lz - cz;
        const d = Math.hypot(ox, oz);
        let nx, nz;
        if (d > 1e-5) { if (d >= r) continue; nx = cx + ox / d * r; nz = cz + oz / d * r; }
        else { // inside: push out along least-penetration axis
          const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
          if (px < pz) { nx = Math.sign(lx || 1) * (c.hw + r); nz = lz; } else { nx = lx; nz = Math.sign(lz || 1) * (c.hd + r); }
        }
        p.x = c.x + nx * c.cos - nz * c.sin; p.z = c.z + nx * c.sin + nz * c.cos;
      }
    }
  }
  // is point (x,y,z) inside a solid collider (for LOS / audio rays)
  solidAt(x, y, z) {
    const a = this.cells.get(this.key(Math.floor(x / 4), Math.floor(z / 4)));
    if (!a) return false;
    for (const c of a) {
      if (c.disabled || c.noRay) continue;
      if (y > (c.top ?? 99) || y < (c.y0 ?? -50)) continue;
      if (c.type === "c") { if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r && y < (c.top ?? 6)) return true; }
      else {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cos + dz * c.sin, lz = -dx * c.sin + dz * c.cos;
        if (Math.abs(lx) < c.hw && Math.abs(lz) < c.hd && y < (c.top ?? 99)
          && !c.holes?.some(h => y > h.y0 && y < h.y1 && (h.axis === "x" ? lx > h.min && lx < h.max : lz > h.min && lz < h.max))) return true;
      }
    }
    return false;
  }
}

// ---------- materials & prop geometry ----------
function colorGeo(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  if (g.index) g = g.toNonIndexed();
  return g;
}
function propGeos() {
  const dead = mergeGeometries([
    colorGeo(new THREE.CylinderGeometry(0.12, 0.25, 4, 5).translate(0, 2, 0), "#3e3830"),
    colorGeo(new THREE.CylinderGeometry(0.05, 0.1, 1.8, 4).rotateZ(0.9).translate(0.6, 3, 0), "#3e3830"),
    colorGeo(new THREE.CylinderGeometry(0.05, 0.1, 1.4, 4).rotateZ(-0.8).translate(-0.5, 2.4, 0), "#3e3830"),
  ]);
  const deadFar = dead.clone();
  const rock = colorGeo(new THREE.DodecahedronGeometry(1, 0).scale(1.2, 0.7, 1), "#7a746a");
  const reed = mergeGeometries([0, 1, 2].map((i) => colorGeo(new THREE.CylinderGeometry(0.02, 0.03, 1.4, 3).translate(Math.cos(i * 2) * 0.2, 0.7, Math.sin(i * 2) * 0.2), "#7a7a40")));
  const fern = mergeGeometries([0, 1, 2, 3].map((i) => colorGeo(new THREE.ConeGeometry(0.25, 0.65, 3).rotateZ(0.65).rotateY(i * Math.PI / 2).translate(Math.cos(i * Math.PI / 2) * 0.16, 0.3, Math.sin(i * Math.PI / 2) * 0.16), i % 2 ? "#416d36" : "#548444")));
  const flower = mergeGeometries([
    colorGeo(new THREE.CylinderGeometry(0.014, 0.02, 0.42, 3).translate(0, 0.21, 0), "#567c39"),
    colorGeo(new THREE.IcosahedronGeometry(0.12, 0).translate(0, 0.46, 0), "#d9bb66"),
  ]);
  return { dead, deadFar, rock, reed, fern, flower };
}

function gableHouse(w, d, h, wall, roof) {
  const body = colorGeo(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), wall);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.4, 0); shape.lineTo(w / 2 + 0.4, 0); shape.lineTo(0, w * 0.45); shape.closePath();
  const r = colorGeo(new THREE.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false }).translate(0, h, -d / 2 - 0.4), roof);
  const door = colorGeo(new THREE.BoxGeometry(1.2, 2.1, 0.12).translate(0, 1.05, d / 2 + 0.03), "#3a2618");
  const win1 = colorGeo(new THREE.BoxGeometry(0.8, 0.8, 0.1).translate(-w / 3.2, h * 0.6, d / 2 + 0.03), "#ffd890");
  const win2 = colorGeo(new THREE.BoxGeometry(0.8, 0.8, 0.1).translate(w / 3.2, h * 0.6, d / 2 + 0.03), "#ffd890");
  return mergeGeometries([body, r, door, win1, win2]);
}

// ---------- the world ----------
export class World {
  constructor(seed, tier, scene, grassProfile = tier.name) {
    this.seed = seed;
    this.tier = tier;
    this.scene = scene;
    this.initialGrassProfile = grassProfile;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.col = new Colliders();
    this.spots = {};        // named NPC/feature positions
    this.spawns = [];       // enemy groups
    this.interactables = []; // { id, kind, pos, label }
    this.shrines = [];
    this.lights = [];       // dungeon torches
    this.waterLevel = 0;
    this.waterSurface = this.waterLevel - 0.3;
    this.noise = makeNoise2D(fork(seed, "terrain"));
    this.noise2 = makeNoise2D(fork(seed, "detail"));
    this.layout();
    this.buildHeights();
    this.buildTerrain();
    this.buildWater();
    this.buildRoadsVisual();
    this.buildSites();
    this.buildVegetation();
    this.buildWildernessSpawns();
    this.buildGatherables();
    this.buildDungeon();
    buildCaves(this);
  }

  // ---------- layout ----------
  layout() {
    const r = fork(this.seed, "layout");
    const j = (a) => (r() * 2 - 1) * a;
    this.sites = {
      marrowgate: { x: j(40), z: -60 + j(40), r: 56, name: "Marrowgate", square: true },
      brightwell: { x: 230 + j(40), z: j(90), r: 34, name: "Brightwell" },
      gallowmere: { x: -230 + j(40), z: -80 + j(90), r: 30, name: "Gallowmere Watch", ridge: 16 },
      sunken: { x: j(80), z: 270 + j(30), r: 22, name: "The Sunken Mile" },
    };
    const S = this.sites;
    S.wake = { x: S.sunken.x + 24 * (r() < 0.5 ? -1 : 1), z: S.sunken.z - 26, r: 12, name: "The Broken Mile" };
    // river: from north edge, bending past Marrowgate's east wall, to the south-east
    const M = S.marrowgate;
    this.river = [[M.x + 70 + j(20), -HALF - 20], [M.x + 72, M.z - 30], [M.x + 76, M.z + 40], [M.x + 120 + j(30), 120], [S.brightwell.x - 60 + j(20), 260], [S.brightwell.x - 40, HALF + 20]];
    // roads: wake → Marrowgate, Marrowgate → Brightwell, Marrowgate → Gallowmere, Brightwell → Sunken
    const mid = (a, b, k) => [lerp(a.x, b.x, k) + j(35), lerp(a.z, b.z, k) + j(35)];
    const road = (a, b, ...via) => [[a.x, a.z], ...via, [b.x, b.z]];
    const gateS = { x: M.x, z: M.z + M.r + 6 }, gateE = { x: M.x + M.r + 6, z: M.z }, gateW = { x: M.x - M.r - 6, z: M.z };
    this.roads = [
      road(S.wake, gateS, mid(S.wake, gateS, 0.35), mid(S.wake, gateS, 0.7)),
      road(gateE, S.brightwell, mid(gateE, S.brightwell, 0.4), mid(gateE, S.brightwell, 0.75)),
      road(gateW, S.gallowmere, mid(gateW, S.gallowmere, 0.5)),
      road(S.brightwell, S.sunken, mid(S.brightwell, S.sunken, 0.5)),
      road(S.wake, S.sunken),
    ];
    // densify polylines for smooth curves
    this.roads = this.roads.map((pts) => {
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const p0 = pts[Math.max(0, i - 1)], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let t = 0; t < 1; t += 0.1) {
          const t2 = t * t, t3 = t2 * t;
          const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
          out.push([cr(p0[0], ax, bx, p3[0]), cr(p0[1], az, bz, p3[1])]);
        }
      }
      out.push(pts[pts.length - 1]);
      return out;
    });
    // inner city street to the gates
    this.roads.push([[M.x, M.z + M.r + 6], [M.x, M.z]], [[M.x - M.r - 6, M.z], [M.x + M.r + 6, M.z]]);
    // shrines along the roads
    const shr = [[0, 0.5], [1, 0.5], [2, 0.6], [3, 0.4]];
    this.shrinePos = shr.map(([ri, k]) => { const p = this.roads[ri][Math.floor(this.roads[ri].length * k)]; return { x: p[0] + 7, z: p[1] + 3 }; });
    // folio cache somewhere off-road in the hills
    const fa = r() * Math.PI * 2;
    this.folioPos = { x: Math.cos(fa) * 200, z: Math.sin(fa) * 120 + 60 };
  }

  rawHeight(x, z) {
    const n = this.noise;
    let h = fbm(n, x * 0.0045, z * 0.0045, this.tier.octaves) * 16 + ridged(n, x * 0.006 + 40, z * 0.006, 4) * 14 + 6;
    h += fbm(this.noise2, x * 0.03, z * 0.03, 3) * 1.2;
    const e = Math.max(Math.abs(x), Math.abs(z)) / HALF;
    h += smoothstep(0.72, 1.0, e) * 70 * (0.6 + 0.4 * ridged(n, x * 0.01, z * 0.01, 3));
    // fen low ground around the Sunken Mile
    const S = this.sites.sunken;
    const fd = Math.hypot(x - S.x, z - S.z);
    h = lerp(h, 0.6 + fbm(this.noise2, x * 0.02, z * 0.02, 2) * 1.4, smoothstep(150, 60, fd) * 0.85);
    // river channel
    let rd = 1e9;
    for (let i = 0; i < this.river.length - 1; i++) rd = Math.min(rd, segDist(x, z, ...this.river[i], ...this.river[i + 1])[0]);
    h = lerp(h, -2.2, smoothstep(16, 5, rd));
    this._riverD = rd;
    // flatten sites
    for (const s of Object.values(this.sites)) {
      const d = s.square ? Math.max(Math.abs(x - s.x), Math.abs(z - s.z)) - 3 : Math.hypot(x - s.x, z - s.z);
      if (d > s.r + 40) continue;
      if (s.baseH === undefined) s.baseH = 0; // set in buildHeights
      const top = s.flatH;
      if (top === undefined) continue;
      h = lerp(h, top, smoothstep(s.r + (s.ridge ? 45 : 28), s.r, d));
    }
    return h;
  }

  buildHeights() {
    // site heights first (sampled from pre-flatten terrain)
    for (const s of Object.values(this.sites)) s.flatH = undefined;
    for (const s of Object.values(this.sites)) s.flatH = Math.max(2.5, this.rawHeight(s.x, s.z)) + (s.ridge || 0);
    this.sites.sunken.flatH = 1.6; this.sites.wake.flatH = 1.8;
    const H = (this.H = new Float32Array(N * N));
    const R = (this.riverD = new Float32Array(N * N));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -HALF + i * STEP, z = -HALF + j * STEP;
      H[j * N + i] = this.rawHeight(x, z);
      R[j * N + i] = this._riverD;
    }
    // roads: flatten to a smooth profile, rising above the river as causeways
    const RD = (this.roadD = new Float32Array(N * N).fill(99));
    for (const pts of this.roads) {
      const hs = pts.map(([x, z]) => Math.max(this.sampleGrid(H, x, z), 1.2));
      // smooth the profile
      for (let k = 0; k < 3; k++) for (let i = 1; i < hs.length - 1; i++) hs[i] = (hs[i - 1] + hs[i] * 2 + hs[i + 1]) / 4;
      for (let s = 0; s < pts.length - 1; s++) {
        const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
        const minx = Math.min(ax, bx) - 10, maxx = Math.max(ax, bx) + 10, minz = Math.min(az, bz) - 10, maxz = Math.max(az, bz) + 10;
        for (let j = Math.max(0, Math.floor((minz + HALF) / STEP)); j <= Math.min(N - 1, Math.ceil((maxz + HALF) / STEP)); j++)
          for (let i = Math.max(0, Math.floor((minx + HALF) / STEP)); i <= Math.min(N - 1, Math.ceil((maxx + HALF) / STEP)); i++) {
            const x = -HALF + i * STEP, z = -HALF + j * STEP;
            const [d, t] = segDist(x, z, ax, az, bx, bz);
            if (d < RD[j * N + i]) {
              RD[j * N + i] = d;
              const target = lerp(hs[s], hs[s + 1], t);
              H[j * N + i] = lerp(H[j * N + i], target, smoothstep(9, 3.5, d));
            }
          }
      }
    }
    // settlements: re-level after the road pass so streets, plazas and fort
    // yards sit exactly on the site's ground plane (roads only blend in at the edges)
    for (const s of Object.values(this.sites)) {
      const inner = s.square ? s.r + 3 : s.r + 1, outer = s.square ? s.r + 12 : s.r + 8;
      const i0 = Math.max(0, Math.floor((s.x - outer + HALF) / STEP)), i1 = Math.min(N - 1, Math.ceil((s.x + outer + HALF) / STEP));
      const j0 = Math.max(0, Math.floor((s.z - outer + HALF) / STEP)), j1 = Math.min(N - 1, Math.ceil((s.z + outer + HALF) / STEP));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -HALF + i * STEP, z = -HALF + j * STEP;
        const d = s.square ? Math.max(Math.abs(x - s.x), Math.abs(z - s.z)) : Math.hypot(x - s.x, z - s.z);
        const k = smoothstep(outer, inner, d);
        if (k > 0) H[j * N + i] = lerp(H[j * N + i], s.flatH, k);
      }
    }
  }

  sampleGrid(A, x, z) {
    const fx = (x + HALF) / STEP, fz = (z + HALF) / STEP;
    const i = Math.max(0, Math.min(N - 2, Math.floor(fx))), j = Math.max(0, Math.min(N - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    const a = A[j * N + i], b = A[j * N + i + 1], c = A[(j + 1) * N + i], d = A[(j + 1) * N + i + 1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  inDungeon(x, z) { return x > HALF + 300; }
  caveAt(x) { return CAVES.find((c) => Math.abs(x - c.origin) < 110) || null; }

  // ground height (bilinear), city/road flattening already baked
  heightAt(x, z) {
    if (this.activeInterior && !this.activeInterior.inPlace && Math.abs(x - this.activeInterior.x) < this.activeInterior.hw + 3 && Math.abs(z - this.activeInterior.z) < this.activeInterior.hd + 3) return 0;
    if (this.activeInterior2 && !this.activeInterior2.inPlace && Math.abs(x - this.activeInterior2.x) < this.activeInterior2.hw + 3 && Math.abs(z - this.activeInterior2.z) < this.activeInterior2.hd + 3) return 0;
    if (this.inDungeon(x, z)) return 0;
    if (Math.abs(x) > HALF || Math.abs(z) > HALF) return 80;
    // inside Marrowgate's walls the ground is the cobble plane itself
    const M = this.sites.marrowgate;
    const md = Math.max(Math.abs(x - M.x), Math.abs(z - M.z));
    if (md < M.r) return M.flatH + 0.045 * smoothstep(M.r, M.r - 4, md);
    return this.sampleGrid(this.H, x, z);
  }
  waterDepthAt(x, z) {
    return Math.max(0, this.waterSurface - this.heightAt(x, z));
  }
  // Height of the triangles the player actually sees. Bilinear heightAt is
  // useful for movement, but can sit above a diagonal on coarse terrain.
  surfaceHeightAt(x, z) {
    if (this.inDungeon(x, z) || Math.abs(x) >= HALF || Math.abs(z) >= HALF) return this.heightAt(x, z);
    const M = this.sites.marrowgate;
    if (Math.max(Math.abs(x - M.x), Math.abs(z - M.z)) < M.r) return this.heightAt(x, z);
    const stride = this.tier.terrainRes;
    const cells = CHUNK / STEP;
    const fx = (x + HALF) / STEP, fz = (z + HALF) / STEP;
    const cx = Math.min(7, Math.floor(fx / cells)), cz = Math.min(7, Math.floor(fz / cells));
    const i0 = cx * cells + Math.floor((fx - cx * cells) / stride) * stride;
    const j0 = cz * cells + Math.floor((fz - cz * cells) / stride) * stride;
    const i1 = Math.min((cx + 1) * cells, i0 + stride), j1 = Math.min((cz + 1) * cells, j0 + stride);
    const u = (fx - i0) / (i1 - i0), v = (fz - j0) / (j1 - j0);
    const a = this.H[j0 * N + i0], b = this.H[j0 * N + i1];
    const c = this.H[j1 * N + i0], d = this.H[j1 * N + i1];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  floorHeightAt(x,z,currentY=0,surface=false) {
    const M=this.sites.marrowgate;
    if (Math.abs(x-M.x)>M.r || Math.abs(z-M.z)>M.r)
      return surface ? this.surfaceHeightAt(x,z) : this.heightAt(x,z);
    for (const house of this.houseFloors || []) {
      const dx=x-house.x,dz=z-house.z,c=Math.cos(house.rot),s=Math.sin(house.rot);
      const lx=dx*c+dz*s,lz=-dx*s+dz*c;
      const front=house.d/2;
      const rampStart=front+.55,rampEnd=front-.55;
      if (Math.abs(lx-house.doorX)<=house.doorWidth/2 && lz>=rampEnd && lz<=rampStart) {
        const t=(rampStart-lz)/(rampStart-rampEnd);
        return house.ground+(house.base-house.ground)*t;
      }
      if (Math.abs(lx)>house.w/2-.15 || Math.abs(lz)>house.d/2-.15) continue;
      if (!house.upper) return house.base;
      if (lx>=house.stairX-house.stairHalf && lx<=house.stairX+house.stairHalf
        && lz>=house.stairBack && lz<=house.stairFront)
        return house.base+(house.upper-house.base)*(house.stairFront-lz)/(house.stairFront-house.stairBack);
      return currentY>house.upper-.45 ? house.upper : house.base;
    }
    return surface ? this.surfaceHeightAt(x,z) : this.heightAt(x,z);
  }
  houseStairAt(x,z) {
    const M=this.sites.marrowgate;
    if (Math.abs(x-M.x)>M.r || Math.abs(z-M.z)>M.r) return false;
    for (const house of this.houseFloors || []) {
      if (!house.upper) continue;
      const dx=x-house.x,dz=z-house.z,c=Math.cos(house.rot),s=Math.sin(house.rot);
      const lx=dx*c+dz*s,lz=-dx*s+dz*c;
      if (lx>=house.stairX-house.stairHalf && lx<=house.stairX+house.stairHalf
        && lz>=house.stairBack && lz<=house.stairFront) return true;
    }
    return false;
  }
  roadDist(x, z) { return this.inDungeon(x, z) ? 99 : this.sampleGrid(this.roadD, x, z); }
  slopeAt(x, z) {
    const e = 1.2;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z), dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.atan(Math.hypot(dx, dz) / (2 * e));
  }
  // inside a guarded settlement (Marrowgate's walls or Brightwell's green)
  inCity(x, z) {
    const M = this.sites.marrowgate, B = this.sites.brightwell;
    return (Math.abs(x - M.x) < M.r && Math.abs(z - M.z) < M.r) || Math.hypot(x - B.x, z - B.z) < B.r;
  }
  regionAt(x, z) {
    const inRoom = room => room && Math.abs(x-room.x)<room.hw+(room.inPlace?0:3) && Math.abs(z-room.z)<room.hd+(room.inPlace?0:3);
    if (inRoom(this.activeInterior)) return this.activeInterior.name;
    if (inRoom(this.activeInterior2)) return this.activeInterior2.name;
    if (this.inDungeon(x, z)) return this.caveAt(x)?.name || "The Sunken Mile";
    let best = null, bd = 1e9;
    for (const [k, s] of Object.entries(this.sites)) {
      const d = Math.hypot(x - s.x, z - s.z) - s.r;
      if (d < bd) { bd = d; best = s; }
    }
    return bd < 30 ? best.name : "The Old Road";
  }

  // ---------- terrain mesh ----------
  vertexColor(x, z, h, out) {
    const slope = this.slopeAt(x, z);
    const n = this.noise2(x * 0.05, z * 0.05);
    const rd = this.roadDist(x, z);
    const fen = smoothstep(150, 70, Math.hypot(x - this.sites.sunken.x, z - this.sites.sunken.z));
    const grass = new THREE.Color().setRGB(0.22 + n * 0.055, 0.31 + n * 0.07, 0.13 + n * 0.035);
    const fenC = new THREE.Color(0.18, 0.25, 0.16);
    const rock = new THREE.Color(0.34, 0.33, 0.3);
    const sand = new THREE.Color(0.48, 0.42, 0.29);
    const road = new THREE.Color(0.39, 0.32, 0.24);
    const snow = new THREE.Color(0.86, 0.88, 0.9);
    out.copy(grass).lerp(fenC, fen);
    if (h < 1.2) out.lerp(sand, smoothstep(1.2, 0, h) * (1 - fen * 0.6));
    out.lerp(rock, smoothstep(0.55, 0.85, slope));
    out.lerp(snow, smoothstep(55, 72, h + n * 4));
    out.lerp(road, smoothstep(5, 2.5, rd) * 0.92);
    // plaza stone inside Marrowgate
    const M = this.sites.marrowgate;
    if (Math.abs(x - M.x) < M.r && Math.abs(z - M.z) < M.r) out.lerp(new THREE.Color(0.39, 0.38, 0.35), 0.55);
    return out;
  }

  buildTerrain() {
    // Adjacent chunks use the same edge grid. Independent LOD switching used
    // to put a coarse edge beside a fine one, exposing dark gaps and skirts.
    const step = this.tier.terrainRes;
    this.terrainTextures = createTerrainTextures(this.seed);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.terrainTextures.map,
      bumpMap: this.terrainTextures.bumpMap, bumpScale: this.tier.name === "low" ? .045 : .085,
      roughness: 0.94, metalness: 0 });
    this.terrainMat = mat;
    const c = new THREE.Color();
    // colours per grid vertex (shared by LODs)
    const C = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -HALF + i * STEP, z = -HALF + j * STEP;
      this.vertexColor(x, z, this.H[j * N + i], c);
      C.set([c.r, c.g, c.b], (j * N + i) * 3);
    }
    const cellsPerChunk = CHUNK / STEP;
    this.chunks = [];
    for (let cz = 0; cz < (HALF * 2) / CHUNK; cz++) for (let cx = 0; cx < (HALF * 2) / CHUNK; cx++) {
      const centerX = -HALF + (cx * cellsPerChunk + cellsPerChunk / 2) * STEP;
      const centerZ = -HALF + (cz * cellsPerChunk + cellsPerChunk / 2) * STEP;
      const g = this.chunkGeometry(cx * cellsPerChunk, cz * cellsPerChunk, cellsPerChunk, step, C, centerX, centerZ);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(centerX, 0, centerZ);
      // Terrain receives the moving tree/character shadows. Casting each
      // 100 m terrain tile into the sun map redraws the whole heightfield.
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.chunks.push(mesh);
    }
  }

  chunkGeometry(i0, j0, cells, stp, C, centerX, centerZ) {
    // Include the far edge even when the LOD stride does not divide the
    // chunk width (50 heightfield cells). This keeps neighboring chunks
    // watertight at every LOD.
    const samples = [];
    for (let o = 0; o < cells; o += stp) samples.push(o);
    if (samples[samples.length - 1] !== cells) samples.push(cells);
    const n = samples.length;
    const pos = [], col = [], uv = [], idx = [];
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const i = Math.min(N - 1, i0 + samples[a]), j = Math.min(N - 1, j0 + samples[b]);
      pos.push(-HALF + i * STEP - centerX, this.H[j * N + i], -HALF + j * STEP - centerZ);
      uv.push((-HALF + i * STEP) / 13, (-HALF + j * STEP) / 13);
      col.push(C[(j * N + i) * 3], C[(j * N + i) * 3 + 1], C[(j * N + i) * 3 + 2]);
    }
    for (let b = 0; b < n - 1; b++) for (let a = 0; a < n - 1; a++) {
      const k = b * n + a;
      idx.push(k, k + n, k + 1, k + 1, k + n, k + n + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    // Sample the global heightfield for normals so lighting also agrees at edges.
    const normals = [];
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const i = i0 + samples[a], j = j0 + samples[b];
      const dx = (this.H[j * N + Math.min(N - 1, i + 1)] - this.H[j * N + Math.max(0, i - 1)]) / (STEP * (i === 0 || i === N - 1 ? 1 : 2));
      const dz = (this.H[Math.min(N - 1, j + 1) * N + i] - this.H[Math.max(0, j - 1) * N + i]) / (STEP * (j === 0 || j === N - 1 ? 1 : 2));
      const l = Math.hypot(dx, 1, dz);
      normals.push(-dx / l, 1 / l, -dz / l);
    }
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    return g;
  }

  buildWater() {
    const g = new THREE.PlaneGeometry(HALF * 2.4, HALF * 2.4, 1, 1).rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x2f5560, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.82 });
    const w = new THREE.Mesh(g, this.waterMat);
    w.position.y = this.waterSurface;
    w.receiveShadow = true;
    this.group.add(w);
  }

  buildRoadsVisual() {
    // milestones along roads (and the Broken Mile's cracked slabs near the wake)
    const r = fork(this.seed, "roadprops");
    const geos = [];
    for (const pts of this.roads) for (let i = 5; i < pts.length - 2; i += 14) {
      const [x, z] = pts[i];
      const dx = pts[i + 1][0] - x, dz = pts[i + 1][1] - z, L = Math.hypot(dx, dz) || 1;
      const px = x - dz / L * 5, pz = z + dx / L * 5;
      geos.push(colorGeo(new THREE.BoxGeometry(0.4, 1.1, 0.25).translate(px, this.heightAt(px, pz) + 0.45, pz), "#8a8478"));
      this.col.circle(px, pz, 0.3, 1.1);
    }
    const W = this.sites.wake;
    for (let k = 0; k < 14; k++) {
      const x = W.x + (r() - 0.5) * 30, z = W.z + (r() - 0.5) * 30;
      const s = 0.8 + r() * 1.6;
      const g = new THREE.BoxGeometry(s * 1.6, 0.3, s).rotateY(r() * 3).rotateX((r() - 0.5) * 0.6).translate(x, this.heightAt(x, z) + 0.05, z);
      geos.push(colorGeo(g, "#6f6a60"));
    }
    if (geos.length) {
      const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
  }

  // ---------- settlements ----------
  buildSites() {
    const geos = [];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const add = (g, x, z, rot = 0, y) => { geos.push(g.rotateY(rot).translate(x, y ?? this.heightAt(x, z), z)); };
    const house = (x, z, rot, w, d, h, wall = "#b9a98c", roof = "#6a3a2a", solid = true) => {
      add(gableHouse(w, d, h, wall, roof), x, z, rot);
      if (solid) this.col.box(x, z, w / 2, d / 2, -rot, h + w * 0.45);
    };
    const wall = (x1, z1, x2, z2, h = 6, t = 1.6, color = "#8d877c") => {
      const L = Math.hypot(x2 - x1, z2 - z1), rot = Math.atan2(z2 - z1, x2 - x1);
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      const y = Math.min(this.heightAt(x1, z1), this.heightAt(x2, z2), this.heightAt(cx, cz)) - 1;
      add(colorGeo(new THREE.BoxGeometry(L, h + 1, t).translate(0, (h + 1) / 2, 0), color), cx, cz, -rot, y);
      this.col.box(cx, cz, L / 2, t / 2, rot, h);
    };
    const tower = (x, z, r = 3, h = 10, c = "#857f74") => {
      add(mergeGeometries([colorGeo(new THREE.CylinderGeometry(r, r * 1.1, h, 10).translate(0, h / 2 - 1, 0), c), colorGeo(new THREE.ConeGeometry(r * 1.25, 3, 10).translate(0, h + 0.4, 0), "#4a3028")]), x, z);
      this.col.circle(x, z, r, h);
    };
    const spot = (k, x, z, face = 0) => (this.spots[k] = { x, z, y: this.heightAt(x, z), face });

    // ---- Marrowgate (dense hand-laid city, see city.js) ----
    buildMarrowgate(this);
    const M = this.sites.marrowgate;

    // ---- Brightwell ----
    const Bw = this.sites.brightwell;
    add(mergeGeometries([colorGeo(new THREE.CylinderGeometry(1.5, 1.6, 1, 12).translate(0, 0.5, 0), "#8a8478"), colorGeo(new THREE.BoxGeometry(0.2, 2.6, 0.2).translate(-1.3, 1.3, 0), "#5a4030"), colorGeo(new THREE.BoxGeometry(0.2, 2.6, 0.2).translate(1.3, 1.3, 0), "#5a4030"), colorGeo(new THREE.ConeGeometry(2, 1, 4).rotateY(Math.PI / 4).translate(0, 3, 0), "#6a3a2a")]), Bw.x, Bw.z);
    this.col.circle(Bw.x, Bw.z, 1.7, 1);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + 0.3;
      const x = Bw.x + Math.cos(a) * 22, z = Bw.z + Math.sin(a) * 22;
      house(x, z, -a - Math.PI / 2, 7, 6, 3.6, "#c9b993", k % 2 ? "#7a6a3a" : "#8a5a2a");
    }
    house(Bw.x, Bw.z - 30, 0, 12, 7, 4, "#d9cfb8", "#5a4a3a");
    // Brightwell's watch lanterns make the settlement readable on foggy nights.
    const lanternGlow = new THREE.MeshBasicMaterial({ color: 0xffb96b, toneMapped: false });
    for (const [dx, dz] of [[-12,-12], [12,-12], [-12,12], [12,12], [-8,-24], [8,-24]]) {
      const x = Bw.x + dx, z = Bw.z + dz, y = this.heightAt(x, z);
      add(mergeGeometries([
        colorGeo(new THREE.CylinderGeometry(.07, .11, 2.5, 7).translate(0, 1.25, 0), "#43392f"),
        colorGeo(new THREE.BoxGeometry(.48, .12, .48).translate(0, 2.5, 0), "#514536"),
      ]), x, z);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(.17, 8, 6), lanternGlow);
      flame.position.set(x, y + 2.36, z); this.group.add(flame);
      this.cityLamps.push(new THREE.Vector3(x, y + 2.36, z));
    }
    spot("green", Bw.x + 4, Bw.z + 3);
    spot("sick", Bw.x - 2, Bw.z - 24);
    spot("sick2", Bw.x + 4, Bw.z - 23);
    spot("bw_respawn", Bw.x - 5, Bw.z + 5);
    for (let k = 0; k < 4; k++) this.interactables.push({ id: "villager" + k, kind: "villager", pos: new THREE.Vector3(Bw.x - 6 + k * 3, this.heightAt(Bw.x - 6 + k * 3, Bw.z - 20), Bw.z - 20), label: "Sick villager" });

    // ---- Gallowmere Watch ----
    const G = this.sites.gallowmere, gr = G.r;
    const rr = fork(this.seed, "gallowmere");
    for (let k = 0; k < 8; k++) {
      if (k === 0) continue; // broad east approach where the watch challenges visitors
      const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2;
      const broken = rr() * 0.3;
      wall(G.x + Math.cos(a0) * gr, G.z + Math.sin(a0) * gr, G.x + Math.cos(a1 - broken) * gr, G.z + Math.sin(a1 - broken) * gr, 4 + rr() * 2, 1.8, "#76706a");
    }
    tower(G.x - 8, G.z - 10, 4, 12, "#6a645c");
    for (let k = 0; k < 4; k++) {
      const a = k * 1.5 + 0.4, x = G.x + Math.cos(a) * 12, z = G.z + Math.sin(a) * 12;
      add(colorGeo(new THREE.ConeGeometry(2.4, 2.6, 4).translate(0, 1.3, 0), k % 2 ? "#7a2a24" : "#8a7a5a"), x, z, a);
      this.col.circle(x, z, 2, 2.6);
    }
    // medicine crates
    const cx = G.x + 6, cz = G.z + 2;
    add(mergeGeometries([0, 1, 2].map((i) => colorGeo(new THREE.BoxGeometry(1, 0.8, 0.8).translate(i * 1.1 - 1.1, 0.4, 0), "#8a6a40"))), cx, cz);
    this.col.box(cx, cz, 1.7, 0.45, 0, 0.8);
    this.interactables.push({ id: "medicine", kind: "crates", pos: new THREE.Vector3(cx, this.heightAt(cx, cz), cz + 1.2), label: "Medicine crates" });
    spot("cell", G.x - 4, G.z + 8);
    add(mergeGeometries([colorGeo(new THREE.BoxGeometry(4, 0.2, 4).translate(0, 0, 0), "#3a3028"), ...[-1.9, 1.9].flatMap((dx) => [-1.9, 1.9].map((dz) => colorGeo(new THREE.BoxGeometry(0.12, 2.4, 0.12).translate(dx, 1.2, dz), "#2a2420")))]), G.x - 4, G.z + 8);
    // ramp: approach east breach
    spot("gm_out", G.x + gr + 22, G.z);
    this.spawns.push({ id: "gm_camp", kind: "brigand", pos: [G.x + 4, G.z - 6], n: 3, radius: 6, site: "gallowmere", talkable: true });
    this.spawns.push({ id: "gm_archers", kind: "brigand_archer", pos: [G.x - 8, G.z - 10], n: 2, radius: 3, site: "gallowmere" });
    this.spawns.push({ id: "gm_sell", kind: "sellsword", pos: [G.x + 8, G.z + 6], n: 1, radius: 2, site: "gallowmere" });

    // Three roadside stables. Their open pens leave room to lead a horse in;
    // the server uses these same seeded coordinates to validate naming.
    this.stables = horseStableSpots(this.seed);
    for (const [city, p] of Object.entries(this.stables)) {
      const timber = "#5c3b28", rail = "#8c6040", roof = city === "gallowmere" ? "#653a31" : "#745235";
      for (const dx of [-5, 5]) for (const dz of [-4, 4])
        add(colorGeo(new THREE.BoxGeometry(.42, 4.8, .42).translate(0, 2.4, 0), timber), p.x + dx, p.z + dz);
      for (const dz of [-4, 4]) for (const dy of [1.1, 2.1])
        add(colorGeo(new THREE.BoxGeometry(10.3, .22, .2).translate(0, dy, 0), rail), p.x, p.z + dz);
      for (const side of [-1, 1])
        add(colorGeo(new THREE.BoxGeometry(6, .28, 9.2).rotateZ(-side * .28).translate(side * 2.5, 5.35, -1), roof), p.x, p.z);
      add(colorGeo(new THREE.BoxGeometry(2.7, .75, 1.1).translate(0, .38, 0), "#704a2c"), p.x - 3.1, p.z + 1.6);
      for (const dz of [-1.3, 1.3]) add(colorGeo(new THREE.BoxGeometry(1.4, .8, 1).translate(0, .4, 0), "#b49559"), p.x + 3.4, p.z + dz);
      add(colorGeo(new THREE.BoxGeometry(1.8, .75, .16).translate(0, 2.55, 0), "#c2a478"), p.x + 4.6, p.z + 4.35);
      this.interactables.push({ id: `stable_${city}`, kind: "stable", city,
        pos: new THREE.Vector3(p.x, this.heightAt(p.x, p.z), p.z), label: `${this.sites[city].name} stable` });
    }

    // ---- Sunken Mile entrance ----
    const Sk = this.sites.sunken;
    const arch = new THREE.TorusGeometry(4.5, 1.4, 6, 12, Math.PI).translate(0, 0, 0);
    add(mergeGeometries([colorGeo(arch, "#5a564e"), colorGeo(new THREE.CircleGeometry(3.6, 12, 0, Math.PI).translate(0, 0, -0.5), "#050403")]), Sk.x, Sk.z - 2, 0, this.heightAt(Sk.x, Sk.z));
    this.interactables.push({ id: "dungeon_enter", kind: "portal", pos: new THREE.Vector3(Sk.x, this.heightAt(Sk.x, Sk.z), Sk.z - 1), label: "Descend into the Sunken Mile" });
    spot("sunken_out", Sk.x, Sk.z - 7);
    // wake spot & first rats
    const W = this.sites.wake;
    spot("wake", W.x, W.z);
    this.spawns.push({ id: "wake_rats", kind: "gloam_rat", pos: [lerp(W.x, Sk.x, 0.4) + 6, lerp(W.z, Sk.z, 0.4) - 10], n: 3, radius: 3, tutorial: true });
    // road encounters
    const rd = this.roads[0];
    this.spawns.push({ id: "road_brig", kind: "brigand", pos: [rd[Math.floor(rd.length * 0.6)][0] + 10, rd[Math.floor(rd.length * 0.6)][1]], n: 2, radius: 4 });
    const rd2 = this.roads[1];
    this.spawns.push({ id: "road_rats2", kind: "gloam_rat", pos: [rd2[Math.floor(rd2.length * 0.3)][0] + 12, rd2[Math.floor(rd2.length * 0.3)][1] - 6], n: 4, radius: 4 });
    // wolves at the well (champion pack)
    this.spawns.push({ id: "wolves", kind: "fen_hound", pos: [Bw.x + 60, Bw.z + 30], n: 3, radius: 5, champion: true, quest: "wolves" });

    // ---- Wayshrines ----
    this.shrinePos.forEach((p, i) => {
      const y = this.heightAt(p.x, p.z);
      add(mergeGeometries([colorGeo(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 8).translate(0, 0.25, 0), "#8a8478"), colorGeo(new THREE.BoxGeometry(0.5, 2.2, 0.5).translate(0, 1.5, 0), "#9a948a"), colorGeo(new THREE.OctahedronGeometry(0.35).translate(0, 2.9, 0), "#c9a04a")]), p.x, p.z);
      this.col.circle(p.x, p.z, 1, 2.5);
      const flame = new THREE.PointLight(0xffb050, 0, 12);
      flame.position.set(p.x, y + 3, p.z);
      this.group.add(flame);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0x555048 }));
      orb.position.set(p.x, y + 2.9, p.z);
      this.group.add(orb);
      this.shrines.push({ i, pos: new THREE.Vector3(p.x, y, p.z), light: flame, orb, lit: false });
      this.interactables.push({ id: "shrine" + i, kind: "shrine", pos: new THREE.Vector3(p.x, y, p.z + 1.5), label: "Wayshrine" });
    });
    // folio cache
    const f = this.folioPos;
    add(colorGeo(new THREE.BoxGeometry(1, 0.7, 0.7).translate(0, 0.35, 0), "#5a3a20"), f.x, f.z, 0.4);
    this.interactables.push({ id: "folio", kind: "cache", pos: new THREE.Vector3(f.x, this.heightAt(f.x, f.z), f.z), label: "Weathered cache", hidden: true });

    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
  }

  setShrineLit(i, lit) {
    const s = this.shrines[i];
    if (!s) return;
    s.lit = lit;
    s.light.intensity = lit ? 30 : 0;
    s.orb.material.color.set(lit ? 0xffd27a : 0x555048);
  }

  // ---------- vegetation ----------
  buildVegetation() {
    const trees = createTreeAssets();
    const G = { ...propGeos(), broad: trees.broad.near, broadFar: trees.broad.far, pine: trees.pine.near, pineFar: trees.pine.far };
    this.treeGeometries = [trees.broad.near, trees.broad.far, trees.pine.near, trees.pine.far];
    const r = fork(this.seed, "veg");
    const dens = this.tier.veg;
    const lists = { pine: [], broad: [], dead: [], rock: [], reed: [], fern: [], flower: [] };
    const blocked = (x, z) => {
      for (const s of Object.values(this.sites)) if ((s.square ? Math.max(Math.abs(x - s.x), Math.abs(z - s.z)) : Math.hypot(x - s.x, z - s.z)) < s.r + 8) return true;
      for (const p of this.shrinePos) if (Math.hypot(x - p.x, z - p.z) < 6) return true;
      return this.roadDist(x, z) < 6;
    };
    const fenOf = (x, z) => smoothstep(150, 70, Math.hypot(x - this.sites.sunken.x, z - this.sites.sunken.z));
    const tries = Math.floor(9000 * dens);
    for (let k = 0; k < tries; k++) {
      const x = (r() * 2 - 1) * (HALF - 4), z = (r() * 2 - 1) * (HALF - 4);
      if (blocked(x, z)) continue;
      const h = this.surfaceHeightAt(x, z);
      if (h < 0.3 || h > 62) continue;
      const slope = this.slopeAt(x, z);
      const forest = fbm(this.noise2, x * 0.008 + 100, z * 0.008, 3);
      const fen = fenOf(x, z);
      if (slope > 0.75) { if (r() < 0.3) lists.rock.push([x, h, z, 0.6 + r() * 1.8]); continue; }
      if (fen > 0.4) { if (r() < 0.25) lists.dead.push([x, h, z, 0.8 + r() * 0.5]); else if (r() < 0.6) lists.reed.push([x, h, z, 0.8 + r() * 0.6]); continue; }
      if (forest > 0.05 && r() < 0.8) (h > 25 || forest > 0.3 ? lists.pine : (r() < 0.5 ? lists.broad : lists.pine)).push([x, h, z, 0.75 + r() * 0.6]);
      else if (r() < 0.12) lists.rock.push([x, h, z, 0.4 + r() * 1.2]);
      else if (r() < 0.2) lists.broad.push([x, h, z, 0.7 + r() * 0.5]);
    }
    if (this.tier.grass > 0) {
      const gN = Math.floor(14000 * this.tier.grass);
      for (let k = 0; k < gN; k++) {
        const x = (r() * 2 - 1) * (HALF - 4), z = (r() * 2 - 1) * (HALF - 4);
        if (this.roadDist(x, z) < 6.8) continue;
        const Mg = this.sites.marrowgate;
        if (Math.max(Math.abs(x - Mg.x), Math.abs(z - Mg.z)) < Mg.r + 2) continue;
        const h = this.surfaceHeightAt(x, z);
        if (h < 0.4 || h > 40 || this.slopeAt(x, z) > 0.6) continue;
        const plant = r();
        const patch = fbm(this.noise2, x * 0.025 + 20, z * 0.025, 2);
        if (patch < -0.28) continue;
        if (plant < .07) lists.fern.push([x, h, z, .7 + r() * .8]);
        else if (plant < .11) lists.flower.push([x, h, z, .7 + r() * .8]);
      }
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    this.treeWind = { time: { value: 0 }, direction: { value: new THREE.Vector2(1, 0) }, strength: { value: .5 } };
    const addTreeWind = material => {
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, { uTreeTime: this.treeWind.time, uTreeDir: this.treeWind.direction, uTreeStrength: this.treeWind.strength });
        shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
          uniform float uTreeTime;
          uniform vec2 uTreeDir;
          uniform float uTreeStrength;`);
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          vec2 root = instanceMatrix[3].xz;
          vec2 localWind = vec2(dot(uTreeDir, normalize(instanceMatrix[0].xz)), dot(uTreeDir, normalize(instanceMatrix[2].xz)));
          float flex = max(0.0, position.y - 0.65);
          float travelingWave = uTreeTime * 0.95 - dot(root, uTreeDir) * 0.052;
          float gust = 0.56 + 0.26 * sin(travelingWave) + 0.18 * sin(travelingWave * 1.83 + 1.4);
          float leaf = step(0.5, uv.x);
          float branchPhase = position.x * 2.15 + position.z * 1.73 + dot(root, vec2(0.047, 0.061));
          float branchSway = sin(uTreeTime * 2.15 + branchPhase) * 0.052 * leaf;
          float flutter = sin(uTreeTime * 5.7 + branchPhase * 2.6 + position.y * 1.8) * 0.034 * leaf;
          transformed.xz += localWind * (flex * flex * 0.009 * gust + branchSway) * uTreeStrength;
          transformed.xz += vec2(-localWind.y, localWind.x) * flutter * uTreeStrength;`);
      };
      material.customProgramCacheKey = () => "woodland-wind-v2";
      return material;
    };
    // Distant crowns keep their silhouette and lighting, but their sway is
    // too small to see. A static shader saves the wind math on every far leaf.
    const farTreeMaterials = {
      broad: trees.broad.material.clone(),
      pine: trees.pine.material.clone(),
    };
    addTreeWind(trees.broad.material);
    addTreeWind(trees.pine.material);
    this.treeMaterials = [mat, trees.broad.material, trees.pine.material, farTreeMaterials.broad, farTreeMaterials.pine];
    this.treeTextures = [trees.broad.map, trees.pine.map];
    const dummy = new THREE.Object3D();
    this.treeChunks = [];
    const makeInstances = (geometry, material, points, castShadow) => {
      const mesh = new THREE.InstancedMesh(geometry, material, points.length);
      points.forEach(([x, y, z, s, angle], i) => {
        dummy.position.set(x, y - .1, z);
        dummy.rotation.set(Math.sin(angle * 2.7) * .018, angle, Math.cos(angle * 3.1) * .025);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      return mesh;
    };
    if (this.cityTreePositions?.length) makeInstances(G.broad, trees.broad.material, this.cityTreePositions, true);
    for (const [k, arr] of Object.entries(lists)) {
      if (!arr.length) continue;
      if (k === "pine" || k === "broad" || k === "dead") {
        const buckets = new Map();
        arr.forEach(([x, y, z, s]) => {
          const key = `${Math.floor(x / 100)},${Math.floor(z / 100)}`;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push([x, y, z, s, r() * Math.PI * 2]);
          this.col.circle(x, z, .4 * s, 7 * s).top = y + 7 * s;
        });
        for (const [key, points] of buckets) {
          const [ix, iz] = key.split(",").map(Number);
          const treeMaterial = k === "dead" ? mat : trees[k].material;
          const near = makeInstances(G[k], treeMaterial, points, true);
          const far = makeInstances(G[`${k}Far`], k === "dead" ? mat : farTreeMaterials[k], points, false);
          near.visible = false;
          this.treeChunks.push({ near, far, x: ix * 100 + 50, z: iz * 100 + 50, nearMode: false });
        }
        continue;
      }
      const im = new THREE.InstancedMesh(G[k], mat, arr.length);
      arr.forEach(([x, y, z, s], i) => {
        dummy.position.set(x, y - (k === "rock" ? 0.3 * s : 0.1), z);
        dummy.rotation.set(0, r() * 6.28, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        if (k === "pine" || k === "broad" || k === "dead") this.col.circle(x, z, 0.4 * s, 7 * s).top = y + 7 * s;
        if (k === "rock") this.col.circle(x, z, 1.0 * s, 1.2 * s).top = y + 0.9 * s;
      });
      im.castShadow = k !== "flower" && k !== "fern";
      im.receiveShadow = true;
      this.group.add(im);
    }
    this.leafFall = new LeafFall(this.group, lists.broad, this.tier.name);
    this.setGrassProfile(this.initialGrassProfile);
  }

  updateFoliage(dt, time, wind, x, z) {
    if (this.activeInterior && Math.abs(x - this.activeInterior.x) < this.activeInterior.hw + 3 && Math.abs(z - this.activeInterior.z) < this.activeInterior.hd + 3) { this.leafFall.mesh.visible = false; return; }
    if (this.inDungeon(x, z)) { this.leafFall.mesh.visible = false; return; }
    this.leafFall.mesh.visible = true;
    this.treeWind.time.value = time;
    const strength = Math.hypot(wind.x, wind.z);
    this.treeWind.direction.value.set(wind.x / (strength || 1), wind.z / (strength || 1));
    this.treeWind.strength.value = Math.min(1.7, strength);
    for (const chunk of this.treeChunks) {
      const distance = Math.hypot(chunk.x - x, chunk.z - z);
      const near = distance < (chunk.nearMode ? 170 : 145);
      if (near !== chunk.nearMode) { chunk.nearMode = near; chunk.near.visible = near; chunk.far.visible = !near; }
    }
    this.leafFall.update(dt, time, wind, x, z, (px, pz) => this.surfaceHeightAt(px, pz));
  }

  buildWildernessSpawns() {
    const rand = fork(this.seed, "wilderness-encounters");
    const occupied = [];
    // Small roaming herds live in separate clearings. Each group is a stable
    // saveable encounter; cleared groups stay cleared like the authored packs.
    const kinds = [
      { kind: "bristleback", groups: 9, count: 2, minForest: -.08, fen: false, roamRadius: 19 },
      { kind: "briar_stag", groups: 7, count: 2, minForest: .12, fen: false, roamRadius: 25 },
      { kind: "fen_hound", groups: 4, count: 2, minForest: -1, fen: true, roamRadius: 22 },
    ];
    for (const spec of kinds) for (let index = 0; index < spec.groups; index++) {
      for (let attempt = 0; attempt < 1200; attempt++) {
        const x = (rand() * 2 - 1) * 365, z = (rand() * 2 - 1) * 365;
        if (this.sites && Object.values(this.sites).some(s => {
          const distance = s.square ? Math.max(Math.abs(x - s.x), Math.abs(z - s.z)) : Math.hypot(x - s.x, z - s.z);
          return distance < s.r + 38;
        })) continue;
        if (occupied.some(p => Math.hypot(x - p[0], z - p[1]) < 46)) continue;
        const fen = Math.hypot(x - this.sites.sunken.x, z - this.sites.sunken.z) < 145;
        if (fen !== spec.fen || this.roadDist(x, z) < 20) continue;
        const forest = fbm(this.noise2, x * .008 + 100, z * .008, 3);
        if (forest < spec.minForest || this.surfaceHeightAt(x, z) < 2 || this.slopeAt(x, z) > .37) continue;
        if (this.col.near(x, z, 3).some(c => !c.disabled && Math.hypot(x - c.x, z - c.z) < (c.r || 1) + 2)) continue;
        occupied.push([x, z]);
        this.spawns.push({ id: `wild_${spec.kind}_${index}`, kind: spec.kind, pos: [x, z],
          n: spec.count + (index % 3 === 0 ? 1 : 0), radius: 2.8, roamRadius: spec.roamRadius });
        break;
      }
    }
  }

  setGrassProfile(profile) {
    if (this.grassProfile === profile && this.grassLayers) return;
    for (const layer of Object.values(this.previousGrassLayers || {})) layer.field.dispose();
    this.previousGrassLayers = this.grassLayers || null;
    this.grassProfile = GRASS_PROFILES[profile] ? profile : "medium";
    this.grassSites = Object.values(this.sites);
    this.grassLayers = {};
    for (const [name, q] of Object.entries(GRASS_PROFILES[this.grassProfile])) {
      const field = createGrassField(this.group, { ...q, coarse: name !== "near" });
      field.setReceiveShadow(name === "near");
      this.grassLayers[name] = { q, field, center: null, job: null, cells: new Map() };
    }
  }

  grassJob(layer, x, z) {
    const { q } = layer;
    const step = q.spacing;
    const x0 = Math.floor((x - q.radius) / step), x1 = Math.ceil((x + q.radius) / step);
    const z0 = Math.floor((z - q.radius) / step), z1 = Math.ceil((z + q.radius) / step);
    return { x, z, x0, z0, cols: x1 - x0 + 1, total: (x1 - x0 + 1) * (z1 - z0 + 1),
      next: 0, positions: [], oldCells: layer.cells, cells: new Map() };
  }

  fillGrass(layer, budget) {
    const { q, field, job } = layer;
    const step = q.spacing, radius2 = q.radius * q.radius, inner2 = (q.inner || 0) ** 2;
    for (let done = 0; done < budget && job.next < job.total; done++) {
      const index = job.next++, ix = job.x0 + index % job.cols, iz = job.z0 + Math.floor(index / job.cols);
      // The lattice is fixed in world space. Reuse both accepted and rejected
      // cells from the previous field; only the narrow newly exposed edge
      // needs terrain, road, slope and noise sampling.
      const key = ix * 4096 + iz;
      const previous = job.oldCells.get(key);
      if (previous !== undefined) {
        job.cells.set(key, previous);
        if (previous) {
          const d2 = (previous.x - job.x) ** 2 + (previous.z - job.z) ** 2;
          if (d2 <= radius2 && d2 >= inner2) job.positions.push(previous);
        }
        continue;
      }
      const gx = (ix + .18 + grassHash(this.seed, ix, iz, 1) * .64) * step;
      const gz = (iz + .18 + grassHash(this.seed, ix, iz, 2) * .64) * step;
      const d2 = (gx - job.x) ** 2 + (gz - job.z) ** 2;
      if (d2 > radius2 || d2 < inner2 || Math.abs(gx) > HALF - 2 || Math.abs(gz) > HALF - 2) continue;
      if (this.grassSites.some(s => (s.square
        ? Math.max(Math.abs(gx - s.x), Math.abs(gz - s.z))
        : Math.hypot(gx - s.x, gz - s.z)) < s.r + 5)) { job.cells.set(key, null); continue; }
      if (this.roadDist(gx, gz) < 6.8) { job.cells.set(key, null); continue; }
      const h = this.surfaceHeightAt(gx, gz);
      if (h < .3 || h > 64 || this.slopeAt(gx, gz) > .48) { job.cells.set(key, null); continue; }
      const patch = fbm(this.noise2, gx * .025 + 20, gz * .025, 2);
      const lushness = smoothstep(-.42, .38, patch);
      if (patch < -.46 || grassHash(this.seed, ix, iz, 3) > .76 + lushness * .2) { job.cells.set(key, null); continue; }
      const point = { x: gx, y: h, z: gz,
        scale: (.54 + grassHash(this.seed, ix, iz, 4) * .76) * (.86 + lushness * .23),
        rotation: grassHash(this.seed, ix, iz, 5) * Math.PI * 2,
        tint: Math.max(0, Math.min(1, .14 + grassHash(this.seed, ix, iz, 6) * .55 + patch * .22)) };
      job.cells.set(key, point);
      job.positions.push(point);
    }
    if (job.next >= job.total) {
      field.setPositions(job.positions);
      layer.center = { x: job.x, z: job.z };
      layer.cells = job.cells;
      layer.job = null;
    }
  }

  updateGrass(x, z, time, wind) {
    if (!this.grassLayers) return;
    if (this.activeInterior && Math.abs(x - this.activeInterior.x) < this.activeInterior.hw + 3 && Math.abs(z - this.activeInterior.z) < this.activeInterior.hd + 3) { for (const layer of Object.values(this.grassLayers)) layer.field.mesh.visible = false; return; }
    const dt = Math.min(.05, Math.max(0, time - (this.grassLastTime ?? time)));
    this.grassLastTime = time;
    const dungeon = this.inDungeon(x, z);
    for (const [name, layer] of Object.entries(this.grassLayers)) {
      layer.field.mesh.visible = !dungeon;
      if (dungeon) continue;
      const { q } = layer;
      if (layer.job && Math.hypot(x - layer.job.x, z - layer.job.z) > q.update * 2) layer.job = null;
      if (!layer.job && (!layer.center || Math.hypot(x - layer.center.x, z - layer.center.z) > q.update)) {
        layer.job = this.grassJob(layer, x, z);
      }
      // Stream new fields over several frames so the larger detail range does not hitch.
      if (layer.job) this.fillGrass(layer, name === "near" ? (layer.center ? 3500 : 12000) : name === "middle" ? 1800 : 2400);
    }
    // Gusts swell over time; low, wet fen grass bends more heavily.
    const fen = smoothstep(150, 70, Math.hypot(x - this.sites.sunken.x, z - this.sites.sunken.z));
    for (const layer of Object.values(this.grassLayers)) layer.field.animate(time, wind, fen * .75, x, z, dt);
    if (this.previousGrassLayers) {
      let finished = true;
      for (const [name, layer] of Object.entries(this.previousGrassLayers)) {
        const reveal = this.grassLayers[name].field.getReveal();
        layer.field.mesh.visible = !dungeon;
        layer.field.setOpacity(1 - reveal);
        layer.field.animate(time, wind, fen * .75, x, z, dt);
        if (reveal < 1) finished = false;
      }
      if (finished) {
        for (const layer of Object.values(this.previousGrassLayers)) layer.field.dispose();
        this.previousGrassLayers = null;
      }
    }
  }

  buildGatherables() {
    const r = fork(this.seed, "gatherables");
    const kinds = {
      wild_berries: { label: "Pick wild berries" },
      moonleaf: { label: "Gather moonleaf" },
      dusk_mushroom: { label: "Pick dusk mushrooms" },
      carving_stick: { label: "Take a straight stick" },
    };
    const geos = {
      wild_berries: mergeGeometries([
        colorGeo(new THREE.IcosahedronGeometry(0.48, 0).scale(1, 0.65, 1).translate(0, 0.38, 0), "#3f703a"),
        ...[[0.26, 0.5, 0.16], [-0.2, 0.56, -0.18], [0.08, 0.33, -0.39]].map(([x, y, z]) => colorGeo(new THREE.IcosahedronGeometry(0.13, 0).translate(x, y, z), "#bb3e4c")),
      ]),
      moonleaf: mergeGeometries([0, 1, 2, 3].map((i) => colorGeo(new THREE.ConeGeometry(0.22, 0.75, 4).rotateZ(0.52).rotateY(i * Math.PI / 2).translate(Math.cos(i * Math.PI / 2) * 0.12, 0.36, Math.sin(i * Math.PI / 2) * 0.12), i % 2 ? "#80b978" : "#a3d7a2"))),
      dusk_mushroom: mergeGeometries([
        colorGeo(new THREE.CylinderGeometry(0.08, 0.11, 0.43, 5).translate(0, 0.22, 0), "#d6caac"),
        colorGeo(new THREE.ConeGeometry(0.35, 0.27, 7).translate(0, 0.51, 0), "#c78c58"),
        colorGeo(new THREE.CylinderGeometry(0.055, 0.07, 0.25, 5).translate(0.32, 0.13, 0.15), "#d6caac"),
        colorGeo(new THREE.ConeGeometry(0.2, 0.17, 6).translate(0.32, 0.3, 0.15), "#c78c58"),
      ]),
      carving_stick: mergeGeometries([
        colorGeo(new THREE.CylinderGeometry(.055, .085, 1.35, 6).rotateZ(1.18).translate(0, .22, 0), "#a78154"),
        colorGeo(new THREE.CylinderGeometry(.045, .065, .58, 6).rotateZ(.55).translate(.35, .45, 0), "#c09a69"),
      ]),
    };
    const dummy = new THREE.Object3D();
    this.gatherMeshes = {};
    for (const [kind, spec] of Object.entries(kinds)) {
      const positions = [];
      for (let tries = 0; tries < 2000 && positions.length < (kind === "carving_stick" ? 75 : 90); tries++) {
        let x = (r() * 2 - 1) * (HALF - 10), z = (r() * 2 - 1) * (HALF - 10);
        if (r() < 0.45) {
          const road = this.roads[Math.floor(r() * 4)];
          const point = road[Math.floor(r() * road.length)];
          x = point[0] + (r() * 2 - 1) * 20;
          z = point[1] + (r() * 2 - 1) * 20;
        }
        if (Math.abs(x) > HALF - 10 || Math.abs(z) > HALF - 10) continue;
        const h = this.heightAt(x, z);
        if (h < 0.8 || h > 43 || this.slopeAt(x, z) > 0.48) continue;
        if (this.roadDist(x, z) < 5 || Object.values(this.sites).some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 5)) continue;
        if (this.col.near(x, z, 1.2).some((c) => !c.disabled && Math.hypot(x - c.x, z - c.z) < (c.r || 1) + 0.9)) continue;
        positions.push([x, h, z]);
      }
      const mesh = new THREE.InstancedMesh(geos[kind], new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), positions.length);
      positions.forEach(([x, h, z], index) => {
        dummy.position.set(x, h - 0.04, z);
        dummy.rotation.set(0, r() * Math.PI * 2, 0);
        dummy.scale.setScalar(0.85 + r() * 0.5);
        dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
        this.interactables.push({ id: `gather_${this.seed}_${kind}_${index}`, kind: "gather", item: kind, instance: index, mesh, pos: new THREE.Vector3(x, h, z), label: spec.label });
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      this.gatherMeshes[kind] = mesh;
    }
  }

  setGathered(id) {
    const it = this.interactables.find((entry) => entry.id === id && entry.kind === "gather");
    if (!it || it.hidden) return;
    it.hidden = true;
    const dummy = new THREE.Object3D();
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    it.mesh.setMatrixAt(it.instance, dummy.matrix);
    it.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- the Sunken Mile ----------
  buildDungeon() {
    const r = fork(this.seed, "dungeon");
    const D = (this.dungeon = { rooms: [], origin: { x: DUNGEON_X, z: 0 } });
    const CELL = 30, GW = 5;
    // random walk across a 5x5 grid from top-middle to a far cell
    const path = [[2, 0]];
    const used = new Set(["2,0"]);
    while (path.length < 7) {
      const [x, y] = path[path.length - 1];
      const opts = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y + 1]].filter(([a, b]) => a >= 0 && a < GW && b >= 0 && b < GW && !used.has(a + "," + b));
      if (!opts.length) break;
      const n = opts[Math.floor(r() * opts.length)];
      path.push(n); used.add(n.join(","));
    }
    // side room
    const side = path[2 + Math.floor(r() * 3)];
    const sideCell = [[side[0] + 1, side[1]], [side[0] - 1, side[1]]].find(([a, b]) => a >= 0 && a < GW && !used.has(a + "," + b));
    const cells = path.map((c, i) => ({ c, i, boss: i === path.length - 1 }));
    if (sideCell) cells.push({ c: sideCell, i: 99, parent: side, side: true });
    // occupancy grid at 2 m
    const OG = GW * CELL / 2;
    const occ = new Uint8Array(OG * OG);
    const fillRect = (x0, z0, x1, z1) => { for (let j = Math.max(0, Math.floor(z0 / 2)); j < Math.min(OG, Math.ceil(z1 / 2)); j++) for (let i = Math.max(0, Math.floor(x0 / 2)); i < Math.min(OG, Math.ceil(x1 / 2)); i++) occ[j * OG + i] = 1; };
    const centers = new Map();
    for (const cl of cells) {
      const [cx, cy] = cl.c;
      const size = cl.boss ? 26 : 12 + Math.floor(r() * 8) * 1;
      const ox = cx * CELL + CELL / 2, oz = cy * CELL + CELL / 2;
      fillRect(ox - size / 2, oz - size / 2, ox + size / 2, oz + size / 2);
      centers.set(cl.c.join(","), [ox, oz]);
      D.rooms.push({ x: DUNGEON_X - OG + ox, z: oz, size, boss: cl.boss, i: cl.i, side: cl.side });
    }
    const corridor = (a, b) => {
      const [ax, az] = centers.get(a.join(",")), [bx, bz] = centers.get(b.join(","));
      fillRect(Math.min(ax, bx) - 2.5, Math.min(az, bz) - 2.5, Math.max(ax, bx) + 2.5, Math.max(az, bz) + 2.5);
    };
    for (let i = 0; i < path.length - 1; i++) corridor(path[i], path[i + 1]);
    if (sideCell) corridor(side, sideCell);
    // geometry
    const X0 = DUNGEON_X - OG; // world x of grid origin
    const floorG = [], wallG = [];
    for (let j = 0; j < OG; j++) for (let i = 0; i < OG; i++) {
      if (occ[j * OG + i]) floorG.push(colorGeo(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2).translate(X0 + i * 2 + 1, 0, j * 2 + 1), (i + j) % 3 ? "#3a352e" : "#332e28"));
    }
    // walls: runs of empty cells adjacent to occupied ones
    const isOcc = (i, j) => i >= 0 && j >= 0 && i < OG && j < OG && occ[j * OG + i];
    for (let j = -1; j <= OG; j++) {
      let run = -1;
      for (let i = -1; i <= OG + 1; i++) {
        const wallCell = !isOcc(i, j) && (isOcc(i + 1, j) || isOcc(i - 1, j) || isOcc(i, j + 1) || isOcc(i, j - 1) || isOcc(i + 1, j + 1) || isOcc(i - 1, j - 1) || isOcc(i + 1, j - 1) || isOcc(i - 1, j + 1));
        if (wallCell && run < 0) run = i;
        if ((!wallCell || i === OG + 1) && run >= 0) {
          const len = (i - run) * 2, cx = X0 + run * 2 + len / 2, cz = j * 2 + 1;
          wallG.push(colorGeo(new THREE.BoxGeometry(len, 5, 2).translate(cx, 2.5, cz), "#4a443c"));
          this.col.box(cx, cz, len / 2, 1, 0, 5);
          run = -1;
        }
      }
    }
    const dm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const fm = new THREE.Mesh(mergeGeometries(floorG), dm); fm.receiveShadow = true;
    const wm = new THREE.Mesh(mergeGeometries(wallG), dm); wm.castShadow = wm.receiveShadow = true;
    this.group.add(fm, wm);
    // debris, roots, torches
    const deb = [];
    for (const room of D.rooms) {
      for (let k = 0; k < 4; k++) {
        const x = room.x + (r() - 0.5) * room.size * 0.7, z = room.z + (r() - 0.5) * room.size * 0.7;
        if (Math.hypot(x - room.x, z - room.z) < 3) continue;
        const s = 0.5 + r();
        deb.push(colorGeo(new THREE.DodecahedronGeometry(s, 0).translate(x, s * 0.4, z), "#5a544a"));
        this.col.circle(x, z, s * 0.9, 1);
      }
      if (room.i === 0 || room.boss) {
        const t = new THREE.PointLight(room.boss ? 0x6fd0a0 : 0xff9a40, room.boss ? 8 : 28, room.boss ? 12 : 18, 1.8);
        t.userData.baseIntensity = t.intensity;
        t.position.set(room.x + room.size / 2 - 1.5, 3, room.z);
        this.group.add(t);
        this.lights.push(t);
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), new THREE.MeshBasicMaterial({ color: room.boss ? 0x8fffc0 : 0xffc070 }));
        fl.position.copy(t.position); this.group.add(fl);
      }
    }
    if (deb.length) { const m = new THREE.Mesh(mergeGeometries(deb), dm); m.castShadow = true; this.group.add(m); }
    const first = D.rooms[0];
    this.spots.dungeon_in = { x: first.x, z: first.z - first.size / 2 + 3, y: 0 };
    this.interactables.push({ id: "dungeon_exit", kind: "portal", pos: new THREE.Vector3(first.x, 0, first.z - first.size / 2 + 1.2), label: "Climb back to the surface" });
    D.rooms.forEach((room, k) => {
      if (k === 0) return;
      if (room.boss) {
        this.spawns.push({ id: "warden", kind: "mire_warden", pos: [room.x, room.z + 4], n: 1, radius: 0, boss: true, dungeon: true });
        this.spots.boss = { x: room.x, z: room.z, y: 0 };
        const chest = new THREE.Mesh(new THREE.BoxGeometry(2, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: 0x536b56, metalness: .45, roughness: .5 }));
        chest.position.set(room.x + 8, .55, room.z - 3);
        this.group.add(chest);
        this.interactables.push({ id: "sunken_chest", kind: "sunken_chest", pos: chest.position.clone(), label: "Open the Warden's reliquary" });
      }
      else if (room.side) this.spawns.push({ id: "d_uniq", kind: "fen_hound", pos: [room.x, room.z], n: 1, radius: 1, unique: true, dungeon: true });
      else this.spawns.push({ id: "d_rats" + k, kind: k % 2 ? "gloam_rat" : "brigand", pos: [room.x, room.z], n: k % 2 ? 4 : 2, radius: 4, dungeon: true });
    });
  }

  // ---------- rays ----------
  // line of sight between two world points (eye height already added)
  los(a, b, step = 0.8) {
    const d = a.distanceTo(b);
    const n = Math.ceil(d / step);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), z = lerp(a.z, b.z, t);
      if (y < this.heightAt(x, z) - 0.1) return false;
      if (this.col.solidAt(x, y, z)) return false;
    }
    return true;
  }
  // ground pick: march a ray against the heightfield
  rayGround(origin, dir, max = 400) {
    let t = 0, prev = origin.y - this.heightAt(origin.x, origin.z);
    const p = new THREE.Vector3();
    while (t < max) {
      t += 0.5 + t * 0.01;
      p.copy(origin).addScaledVector(dir, t);
      const h = p.y - this.heightAt(p.x, p.z);
      if (h < 0) {
        // refine
        const t0 = t - (0.5 + t * 0.01);
        const k = prev / (prev - h);
        return p.copy(origin).addScaledVector(dir, t0 + (t - t0) * k);
      }
      prev = h;
    }
    return null;
  }

  dispose() {
    this.leafFall?.dispose();
    for (const layer of Object.values(this.grassLayers || {})) layer.field.dispose();
    for (const layer of Object.values(this.previousGrassLayers || {})) layer.field.dispose();
    const geometries = new Set(this.treeGeometries || []);
    this.group.traverse((o) => { if (o.geometry) geometries.add(o.geometry); });
    for (const geometry of geometries) geometry.dispose();
    for (const material of this.treeMaterials || []) material.dispose();
    for (const texture of this.treeTextures || []) texture.dispose();
    for (const texture of Object.values(this.terrainTextures || {})) texture.dispose();
    this.terrainMat?.dispose();
    for (const texture of this.caveTextures || []) texture.dispose();
    for (const texture of this.citySignTextures || []) texture.dispose();
    this.cityGlassMaterial?.dispose();
    for (const material of this.caveMaterials || []) material.dispose();
    this.group.removeFromParent();
  }
}
