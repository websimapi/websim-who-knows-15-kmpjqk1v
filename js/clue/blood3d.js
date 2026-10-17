// Blood on the floor: decals for pools, flung drops and drag smears, the wet
// sheen of bleach, the Lens of Truth's luminol glow, and the burst of droplets
// when a blow lands. Pure rendering — the stains themselves live in match.js.
import * as THREE from "three";
import { patchTree } from "./fow.js";

const TEX = 256;
let rand = Math.random;
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Draw one splat shape into a context (white on transparent); callers colour it.
function drawShape(ctx, kind, seed) {
  rand = seeded(seed);
  const c = TEX / 2;
  ctx.clearRect(0, 0, TEX, TEX);
  ctx.fillStyle = "#fff";
  const blob = (x, y, r, wob = 0.25, n = 18) => {
    ctx.beginPath();
    const ph = rand() * 6.28;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 + wob * (Math.sin(a * 3 + ph) * 0.5 + Math.sin(a * 7 + ph * 2) * 0.3 + (rand() - 0.5) * 0.4));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  };
  if (kind === 0) {
    // Pool: a main body with lobes and a few satellite drops.
    blob(c, c, TEX * 0.3, 0.22, 28);
    for (let i = 0; i < 6; i++) { const a = rand() * 6.28, d = TEX * (0.18 + rand() * 0.14); blob(c + Math.cos(a) * d, c + Math.sin(a) * d, TEX * (0.06 + rand() * 0.08), 0.3, 12); }
    for (let i = 0; i < 14; i++) { const a = rand() * 6.28, d = TEX * (0.36 + rand() * 0.12); blob(c + Math.cos(a) * d, c + Math.sin(a) * d, TEX * (0.008 + rand() * 0.018), 0.2, 8); }
  } else if (kind === 3) {
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2, d = rand() * TEX * .3;
      ctx.globalAlpha = .35 + rand() * .55;
      blob(c + Math.cos(a) * d, c + Math.sin(a) * d, TEX * (.06 + rand() * .13), .42, 16);
    }
    ctx.globalAlpha = 1;
  } else if (kind === 1) {
    // Flung drop: round head, tapering tail with a spine of tiny spatters (+x = travel).
    blob(c - TEX * 0.12, c, TEX * 0.16, 0.12, 20);
    ctx.beginPath(); ctx.moveTo(c - TEX * 0.12, c - TEX * 0.13); ctx.quadraticCurveTo(c + TEX * 0.18, c - TEX * 0.02, c + TEX * 0.32, c); ctx.quadraticCurveTo(c + TEX * 0.18, c + TEX * 0.02, c - TEX * 0.12, c + TEX * 0.13); ctx.fill();
    for (let i = 0; i < 5; i++) blob(c + TEX * (0.34 + i * 0.03), c + (rand() - 0.5) * TEX * 0.04, TEX * (0.018 - i * 0.003), 0.2, 8);
    for (let i = 0; i < 6; i++) { const a = rand() * 6.28; blob(c - TEX * 0.12 + Math.cos(a) * TEX * 0.24, c + Math.sin(a) * TEX * 0.24, TEX * (0.008 + rand() * 0.012), 0.2, 8); }
  } else {
    // Drag smear: streaky band along x, broken and feathered at the ends.
    for (let s = 0; s < 9; s++) {
      const y = c + (s - 4) * TEX * 0.035 + (rand() - 0.5) * 6;
      ctx.globalAlpha = 0.35 + rand() * 0.5;
      ctx.lineCap = "round"; ctx.lineWidth = TEX * (0.02 + rand() * 0.04); ctx.strokeStyle = "#fff";
      ctx.beginPath();
      const x0 = TEX * (0.06 + rand() * 0.15), x1 = TEX * (0.8 + rand() * 0.14);
      ctx.moveTo(x0, y);
      for (let x = x0; x < x1; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.05 + s) * 2.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// Coloured blood map (dark rim, glossy core) plus a white mask for the glow.
function makeTextures(kind, seed) {
  const mask = document.createElement("canvas"); mask.width = mask.height = TEX;
  const m = mask.getContext("2d");
  drawShape(m, kind, seed);
  const col = document.createElement("canvas"); col.width = col.height = TEX;
  const g = col.getContext("2d");
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = "source-in";
  const grd = g.createRadialGradient(TEX / 2, TEX / 2, 0, TEX / 2, TEX / 2, TEX * 0.5);
  if (kind === 3) { grd.addColorStop(0, '#48483c'); grd.addColorStop(.65, '#514f3c'); grd.addColorStop(1, '#38372c'); }
  else if (kind === 2) { grd.addColorStop(0, "#5a0806"); grd.addColorStop(1, "#3a0403"); }
  else { grd.addColorStop(0, "#7a0a08"); grd.addColorStop(0.55, "#5c0605"); grd.addColorStop(0.8, "#3a0302"); grd.addColorStop(1, "#240201"); }
  g.fillStyle = grd; g.fillRect(0, 0, TEX, TEX);
  // Clotting speckle.
  g.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 260; i++) { g.fillStyle = kind === 3 ? `rgba(34,33,23,${0.1 + rand() * 0.25})` : `rgba(20,0,0,${0.1 + rand() * 0.25})`; g.fillRect(rand() * TEX, rand() * TEX, 2, 2); }
  const t = new THREE.CanvasTexture(col); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const mt = new THREE.CanvasTexture(mask);
  const edge = document.createElement("canvas"); edge.width = edge.height = TEX;
  const eg = edge.getContext("2d"), alpha = m.getImageData(0, 0, TEX, TEX).data;
  const pixels = eg.createImageData(TEX, TEX);
  for (let y = 4; y < TEX - 4; y++) for (let x = 4; x < TEX - 4; x++) {
    const i = (y * TEX + x) * 4;
    if (alpha[i + 3] < 96) continue;
    if (alpha[i - 16 + 3] >= 96 && alpha[i + 16 + 3] >= 96 && alpha[i - TEX * 16 + 3] >= 96 && alpha[i + TEX * 16 + 3] >= 96) continue;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
    pixels.data[i + 3] = 230;
  }
  eg.putImageData(pixels, 0, 0);
  return { map: t, mask: mt, outline: new THREE.CanvasTexture(edge) };
}

// A handful of variants per kind, shared by every stain.
let VARIANTS = null;
function variants() {
  if (VARIANTS) return VARIANTS;
  VARIANTS = [0, 1, 2, 3].map((k) => Array.from({ length: k === 1 ? 4 : 3 }, (_, i) => makeTextures(k, 1 + k * 97 + i * 13)));
  return VARIANTS;
}

// Bleach: a pale, glossy, irregular wet patch.
let WET_TEX = null;
function wetTexture() {
  if (WET_TEX) return WET_TEX;
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const g = cv.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grd.addColorStop(0, "rgba(255,255,255,0.9)"); grd.addColorStop(0.7, "rgba(255,255,255,0.55)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * 6.28, r = 50 + Math.sin(a * 5) * 7 + Math.sin(a * 3 + 1) * 5; i ? g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r) : g.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.fill();
  WET_TEX = new THREE.CanvasTexture(cv);
  return WET_TEX;
}

// Fixed forensic textures used by the initial dirt task and later evidence.
// Build each canvas between yields rather than on the first gameplay stain.
export async function prepareBloodAssets(renderer,pause){
 if(!VARIANTS){VARIANTS=[[],[],[],[]];for(let k=0;k<4;k++)for(let i=0;i<(k===1?4:3);i++){const set=makeTextures(k,1+k*97+i*13);VARIANTS[k].push(set);for(const map of Object.values(set))renderer.initTexture(map);await pause();}}
 renderer.initTexture(wetTexture());
}

const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

export class Blood {
  constructor(scene) {
    this.scene = scene;
    this.stains = new Map(); // id -> { mesh, glow, row, born }
    this.marks = new Map();
    this.time = 0;
    this.lens = false;
    // Droplet particles.
    const N = 260;
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshStandardMaterial({ color: 0x6a0605, roughness: 0.2, metalness: 0.1 }), N);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts = [];
    scene.add(this.drops);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
  }

  reset() {
    for (const s of this.stains.values()) { s.mesh.removeFromParent(); s.glow.removeFromParent(); s.outline.removeFromParent(); }
    for (const m of this.marks.values()) m.removeFromParent();
    this.stains.clear(); this.marks.clear(); this.parts = [];
  }

  // rows: [id, x, z, r, rot, k, s, e] or null (unchanged).
  applyStains(rows, instant) {
    if (!rows) return;
    const seen = new Set();
    for (const row of rows) {
      const [id, x, z, r, rot, k, st, e] = row;
      seen.add(id);
      let s = this.stains.get(id);
      if (!s) {
        const v = variants()[k] || variants()[0];
        const tex = v[hash(String(id)) % v.length];
        const mat = new THREE.MeshStandardMaterial({ map: tex.map, transparent: true, depthWrite: false, roughness: k === 3 ? 1 : 0.12, metalness: k === 3 ? 0 : 0.05, polygonOffset: true, polygonOffsetFactor: -2 - (hash(String(id)) % 4), polygonOffsetUnits: -2 });
        const mesh = new THREE.Mesh(PLANE, mat);
        mesh.receiveShadow = true; mesh.renderOrder = 2;
        const glow = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: tex.mask, color: 0x38a8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
        glow.renderOrder = 4;
        const outline = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: tex.outline, color: 0xe9a17e, transparent: true, depthWrite: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
        outline.renderOrder = 3;
        patchTree(mesh); patchTree(glow); patchTree(outline);
        this.scene.add(mesh, glow, outline);
        s = { mesh, glow, outline, born: instant ? -99 : this.time };
        this.stains.set(id, s);
      }
      s.row = row;
      const y = 0.012 + (hash(String(id)) % 7) * 0.0004;
      // Texture +x is the direction of travel; world heading (sin rot, cos rot).
      const sx = r * 2 * (k === 1 ? Math.max(1, e || 1) : k === 2 ? Math.max(1, (e || 1) * 0.7) : 1), sz = r * 2;
      for (const m of [s.mesh, s.glow, s.outline]) { m.position.set(x, m === s.outline ? y + 0.003 : y, z); m.rotation.y = (rot || 0) - Math.PI / 2; m.userData.sx = sx; m.userData.sz = sz; }
    }
    for (const [id, s] of this.stains) if (!seen.has(id) || s.row[6] === 3) { s.mesh.removeFromParent(); s.glow.removeFromParent(); s.outline.removeFromParent(); this.stains.delete(id); }
  }

  // rows: [id, x, z, r, rot] (wet bleach).
  applyMarks(rows) {
    if (!rows) return;
    const seen = new Set();
    for (const [id, x, z, r, rot] of rows) {
      seen.add(id);
      let m = this.marks.get(id);
      if (!m) {
        m = new THREE.Mesh(PLANE, new THREE.MeshStandardMaterial({ color: 0xe6ecef, alphaMap: wetTexture(), transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.02, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
        m.renderOrder = 4;
        patchTree(m);
        this.scene.add(m);
        this.marks.set(id, m);
      }
      m.position.set(x, 0.016, z); m.rotation.y = rot || 0; m.scale.set(r * 2, 1, r * 2);
    }
    for (const [id, m] of this.marks) if (!seen.has(id)) { m.removeFromParent(); this.marks.delete(id); }
  }

  // Per-view: the Lens reveals water-wiped blood; nearby killers see its outline.
  setLens(on, killerAt = null) {
    for (const s of this.stains.values()) {
      const st = s.row[6];
      s.mesh.visible = st === 0;
      s.glow.visible = s.row[5] !== 3 && on && (st === 0 || st === 1);
      s.glow.material.opacity = st === 0 ? 0.25 : 0.9 + Math.sin(this.time * 3 + s.mesh.position.x) * 0.1;
      s.outline.visible = s.row[5] !== 3 && st === 1 && !on && !!killerAt && Math.hypot(s.row[1] - killerAt.x, s.row[2] - killerAt.z) < 5;
    }
  }

  // Blood flung from a wound at (x, y, z) heading roughly along (dx, dz).
  burst(x, y, z, dx, dz, n = 90) {
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    for (let i = 0; i < n; i++) {
      const sp = 1.2 + Math.random() * 3.4, spread = (Math.random() - 0.5) * 1.6;
      const c = Math.cos(spread), s = Math.sin(spread);
      const vx = (dx * c - dz * s) * sp, vz = (dx * s + dz * c) * sp;
      this.parts.push({ x, y: y + (Math.random() - 0.5) * 0.15, z, vx, vy: 0.5 + Math.random() * 2.4, vz, r: 0.006 + Math.random() * 0.014, life: 2 });
    }
    if (this.parts.length > this.drops.instanceMatrix.count) this.parts.splice(0, this.parts.length - this.drops.instanceMatrix.count);
  }

  update(dt) {
    this.time += dt;
    // Fresh pools spread out over a few seconds; drops land instantly.
    for (const s of this.stains.values()) {
      const k = s.row[5];
      const age = this.time - s.born;
      const grow = k === 0 ? 0.25 + 0.75 * (1 - Math.exp(-age / 3.5)) : Math.min(1, 0.6 + age * 4);
      for (const m of [s.mesh, s.glow, s.outline]) m.scale.set(m.userData.sx * grow, 1, m.userData.sz * grow);
    }
    // Droplets: ballistic, stretched along velocity, vanish on landing.
    let n = 0;
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.life -= dt;
      if (p.y <= 0.005 || p.life <= 0) { P.splice(i, 1); continue; }
    }
    for (const p of P) {
      const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
      this.v.set(p.vx / sp, p.vy / sp, p.vz / sp);
      this.q.setFromUnitVectors(UP, this.v);
      this.s.set(p.r, p.r * (1 + Math.min(4, sp * 0.6)), p.r);
      this.m4.compose(this.v.set(p.x, p.y, p.z), this.q, this.s);
      this.drops.setMatrixAt(n++, this.m4);
    }
    this.drops.count = n;
    this.drops.instanceMatrix.needsUpdate = true;
  }
}
const UP = new THREE.Vector3(0, 1, 0);
