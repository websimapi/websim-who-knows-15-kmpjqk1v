// Life-size furniture meshes. Every builder returns a group centred on the
// piece's footprint, floor at y = 0, front facing +z, plus interactive parts
// (cabinet doors/drawers, fire anchors, stove burners).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { woodTexture, feltTexture, floorTexture, paintingTexture, fabricTexture } from "./textures.js";

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });
const wood = (tint, o = {}) => M(0xffffff, { map: woodTexture(tint), roughness: 0.55, ...o });
export const MAT = {
  wood: wood("#6a4226"), darkWood: wood("#33200f", { roughness: 0.45 }), lightWood: wood("#a0744a"), oak: wood("#7a5530"),
  brass: M(0xc9a24a, { metalness: 0.9, roughness: 0.32 }), iron: M(0x2b2b2e, { metalness: 0.7, roughness: 0.5 }), steel: M(0xa8acb2, { metalness: 0.9, roughness: 0.25 }),
  white: M(0xe6e0d2, { roughness: 0.5 }), porcelain: M(0xf1ede4, { roughness: 0.18 }), stone: M(0x7d776d, { roughness: 0.92 }), marble: M(0xe9e4da, { roughness: 0.2 }),
  black: M(0x111113, { roughness: 0.25 }), blackMatte: M(0x161414, { roughness: 0.8 }), red: M(0xffffff, { map: fabricTexture("#6c1820"), roughness: 0.9 }), velvet: M(0xffffff, { map: fabricTexture("#4a0f1a"), roughness: 0.95 }),
  green: M(0x24452a, { roughness: 0.95 }), leaf: M(0x2f5a2a, { roughness: 0.8 }), deadLeaf: M(0x4a4a26, { roughness: 0.9 }), terracotta: M(0x8c4a2e),
  cream: M(0xd8ccb0), gold: M(0xd8b04c, { metalness: 0.9, roughness: 0.22 }), leather: M(0x4a2414, { roughness: 0.45 }), wicker: M(0xa98a55, { roughness: 1 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xaac4c8, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.25, depthWrite: false }),
  water: M(0x1f3a40, { roughness: 0.05, metalness: 0.3 }), ash: M(0x2a2725, { roughness: 1 }), cloth: M(0xc8c0ae, { roughness: 1 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), shade: M(0xe8d6a8, { emissive: 0xffc070, emissiveIntensity: 0.6, roughness: 1, side: THREE.DoubleSide }),
  ember: new THREE.MeshBasicMaterial({ color: 0xff5a10 }), burnerOff: M(0x1a1a1a, { metalness: 0.6, roughness: 0.6 }),
  felt: M(0xffffff, { map: feltTexture(), roughness: 1 }), bone: M(0xd8cfb4, { roughness: 0.6 }),
};

export function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  parent?.add(m);
  return m;
}
function cushion(w, h, d, mat, x, y, z, parent, radius = 0.065) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, h * 0.35, d * 0.35)), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, parent, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  parent?.add(m);
  return m;
}
const sphere = (r, mat, x, y, z, parent, s = 12) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, s, Math.ceil(s * 0.7)), mat); m.position.set(x, y, z); m.castShadow = true; parent?.add(m); return m; };
const legs = (g, w, d, h, mat, inset = 0.06, t = 0.06) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(t, h, t, mat, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), g); };

// Hinged cabinet door: pivot at its hinge edge. side -1 hinges on the left.
function cabDoor(g, parts, w, h, x, y, z, side = -1, mat = MAT.darkWood) {
  const pivot = new THREE.Group();
  pivot.position.set(x + side * w / 2, y, z);
  const leaf = box(w - 0.01, h, 0.025, mat, -side * w / 2, 0, 0.0125, pivot);
  box(w * 0.7, h * 0.75, 0.01, MAT.wood, -side * w / 2, h * 0.125, 0.03, pivot);
  sphere(0.018, MAT.brass, -side * (w - 0.06), h * 0.55, 0.05, pivot, 8);
  g.add(pivot);
  parts.cab.push({ obj: pivot, kind: "door", sign: side });
  return leaf;
}
function glassDoor(g, parts, w, h, x, y, z, side) {
  const pivot = new THREE.Group();
  pivot.position.set(x + side * w / 2, y, z);
  const cx = -side * w / 2;
  box(w - 0.035, h - 0.04, 0.009, MAT.glass, cx, 0.02, 0, pivot).castShadow = false;
  for (const sx of [-1, 1]) box(0.034, h, 0.035, MAT.darkWood, cx + sx * (w / 2 - 0.017), 0, 0, pivot);
  for (const yy of [0, h - 0.04]) box(w, 0.04, 0.035, MAT.darkWood, cx, yy, 0, pivot);
  box(0.018, h - 0.08, 0.015, MAT.brass, cx - side * (w / 2 - 0.065), 0.04, 0.03, pivot);
  g.add(pivot);
  parts.cab.push({ obj: pivot, kind: "door", sign: side });
}
function drawer(g, parts, w, h, x, y, z) {
  const d = new THREE.Group();
  d.position.set(x, y, z);
  // The moving drawer includes a real tray, not just its front plate.
  const depth = Math.max(0.26, Math.min(0.43, z * 1.55));
  box(w - 0.045, 0.022, depth, MAT.oak, 0, 0.012, -depth / 2 + 0.015, d);
  for (const s of [-1, 1]) box(0.025, h * 0.65, depth, MAT.oak, s * (w / 2 - 0.037), 0.02, -depth / 2 + 0.015, d);
  box(w - 0.04, h * 0.65, 0.025, MAT.oak, 0, 0.02, -depth + 0.02, d);
  box(w * 0.62, 0.012, depth * 0.48, MAT.cream, -w * 0.08, 0.034, -depth * 0.55, d);
  box(w * 0.57, 0.014, depth * 0.43, MAT.leather, w * 0.04, 0.048, -depth * 0.49, d);
  box(w - 0.02, h - 0.02, 0.03, MAT.darkWood, 0, 0.01, 0.015, d);
  box(0.12, 0.02, 0.02, MAT.brass, 0, h / 2 - 0.01, 0.04, d);
  g.add(d);
  parts.cab.push({ obj: d, kind: "drawer" });
}

// A joinery carcass leaves its entire center empty; a dark backing gives the
// interior depth without sealing it off at the front.
function cabinetShell(g, w, d, h, mat = MAT.darkWood, shelfYs = []) {
  const t = 0.045;
  box(w, t, d, mat, 0, 0, 0, g);
  box(w, t, d, mat, 0, h - t, 0, g);
  box(w, h - 2 * t, t, mat, 0, t, -d / 2 + t / 2, g);
  for (const s of [-1, 1]) box(t, h - 2 * t, d, mat, s * (w / 2 - t / 2), t, 0, g);
  box(w - 2 * t, h - 2 * t, 0.006, MAT.blackMatte, 0, t, -d / 2 + t + 0.005, g).castShadow = false;
  for (const y of shelfYs) {
    if (y <= 0.12 || y >= h - 0.12) continue;
    box(w - 2 * t, 0.038, d - t, mat, 0, y, t / 2, g);
    box(w - 2 * t, 0.022, 0.035, MAT.oak, 0, y + 0.04, d / 2 - 0.03, g);
  }
  return { innerW: w - 2 * t, innerD: d - t };
}

function bottle(g, x, y, z, mat = MAT.green, scale = 1) {
  cyl(0.052 * scale, 0.063 * scale, 0.19 * scale, mat, x, y, z, g, 12);
  cyl(0.023 * scale, 0.026 * scale, 0.075 * scale, mat, x, y + 0.19 * scale, z, g, 10);
  cyl(0.026 * scale, 0.026 * scale, 0.018 * scale, MAT.brass, x, y + 0.265 * scale, z, g, 10);
  box(0.085 * scale, 0.06 * scale, 0.003, MAT.cream, x, y + 0.055 * scale, z + 0.065 * scale, g);
}

function storageDressing(g, w, d, shelfYs, kind) {
  // Keep the center of body-sized storage clear; other pieces get a small
  // group of distinct objects on the rear half of each shelf.
  if (kind === "wardrobe" || kind === "storageChest") return;
  const levels = [0, ...shelfYs.map(y => y + 0.04)].filter(y => y < 1.8);
  for (let row = 0; row < levels.length; row++) {
    const y = levels[row] + 0.05, z = -d * 0.21;
    const count = Math.max(2, Math.min(30, Math.floor((w - 0.18) / 0.3)));
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * Math.min(0.31, (w - 0.16) / count);
      if (kind === "china" || kind === "dresser" || kind === "vanity") {
        if (i % 2) { const plate = cyl(0.084, 0.075, 0.022, MAT.porcelain, x, y, z, g, 18); plate.rotation.x = 0.17; }
        else bottle(g, x, y, z, MAT.glass, 0.75);
      } else if (kind === "pantry" || kind === "counter" || kind === "island") {
        if (i % 2) bottle(g, x, y, z, i % 3 ? MAT.green : MAT.leather, 0.85);
        else { cyl(0.074, 0.074, 0.14, MAT.cream, x, y, z, g, 12); cyl(0.078, 0.078, 0.014, MAT.brass, x, y + 0.14, z, g, 12); }
      } else {
        box(0.09, 0.18 + (i % 3) * 0.05, 0.16, [MAT.leather, MAT.green, MAT.red, MAT.oak][i % 4], x, y, z, g);
        box(0.085, 0.015, 0.17, MAT.brass, x, y + 0.1, z + 0.003, g);
      }
    }
  }
}

function framedStorage(g, parts, w, d, h, chest = false) {
  const timber = chest ? MAT.oak : MAT.darkWood;
  const trim = chest ? MAT.iron : MAT.brass;
  const wall = chest ? 0.055 : 0.065;
  box(w, h - 0.08, wall, timber, 0, 0.04, -d / 2 + wall / 2, g);
  box(w - 2 * wall, h - 0.18, 0.008, MAT.blackMatte, 0, 0.085, -d / 2 + wall + 0.004, g).castShadow = false;
  box(w, wall, d, timber, 0, 0.04, 0, g);
  box(w - 2 * wall, 0.012, d - 2 * wall, chest ? MAT.leather : MAT.oak, 0, 0.1, 0, g);
  for (const side of [-1, 1]) {
    box(wall, h - 0.08, d, timber, side * (w / 2 - wall / 2), 0.04, 0, g);
    box(0.008, h - 0.18, d - 2 * wall, MAT.blackMatte, side * (w / 2 - wall - 0.004), 0.085, 0, g).castShadow = false;
  }
  if (chest) {
    // Full-height coffer walls preserve a deep cavity when the lid lifts.
    box(w, h - 0.11, wall, timber, 0, 0.04, d / 2 - wall / 2, g);
    box(w - 2 * wall, h - 0.22, 0.008, MAT.blackMatte, 0, 0.095, d / 2 - wall - 0.004, g).castShadow = false;
    for (const x of [-w * 0.33, w * 0.33]) {
      box(0.025, h - 0.1, d + 0.012, trim, x, 0.02, 0, g);
      box(0.03, h - 0.11, 0.018, trim, x, 0.04, d / 2 + 0.008, g);
    }
    for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) box(w - 0.12, 0.018, 0.018, MAT.brass, 0, h - 0.12, z, g);
    for (const x of [-w / 2 + 0.21, w / 2 - 0.21]) {
      cushion(0.22, 0.065, d * 0.32, MAT.cloth, x, 0.13, -d * 0.13, g, 0.018);
      box(0.24, 0.014, d * 0.34, MAT.leather, x, 0.2, -d * 0.13, g);
    }
    const lid = new THREE.Group();
    lid.position.set(0, h - 0.095, -d / 2);
    box(w + 0.07, 0.105, d + 0.065, timber, 0, 0, d / 2, lid);
    box(w - 0.08, 0.008, d - 0.06, MAT.leather, 0, -0.008, d / 2, lid);
    for (const x of [-w * 0.34, w * 0.34]) box(0.037, 0.11, d + 0.07, trim, x, 0, d / 2, lid);
    for (const z of [0.09, d - 0.09]) box(w + 0.07, 0.018, 0.035, trim, 0, 0.075, z, lid);
    for (const x of [-w * 0.38, w * 0.38]) box(0.11, 0.025, 0.12, MAT.brass, x, 0.105, d * 0.92, lid);
    g.add(lid); parts.cab.push({ obj: lid, kind: "lid" });
    box(0.16, 0.12, 0.035, MAT.brass, 0, h * 0.52, d / 2 + 0.015, g);
  } else {
    box(w, 0.08, d, timber, 0, h - 0.08, 0, g);
    // Wardrobes used for bodies need one uninterrupted vertical cavity.
    box(w - 0.16, 0.038, d * 0.43, timber, 0, h - 0.58, -d * 0.26, g);
    for (const x of [-w * 0.28, w * 0.27]) cushion(0.24, 0.075, d * 0.27, MAT.cloth, x, h - 0.54, -d * 0.28, g, 0.012);
    box(w - 0.18, 0.025, 0.025, MAT.brass, 0, h - 0.31, -d * 0.12, g);
    for (const x of [-w * 0.26, w * 0.26]) {
      const hook = cyl(0.012, 0.012, 0.08, MAT.brass, x, h - 0.36, -d * 0.12, g, 8);
      hook.rotation.z = 0.25;
    }
    for (let i = 0; i < 2; i++) {
      const x = (i ? 1 : -1) * w / 4;
      cabDoor(g, parts, w / 2 - 0.085, h - 0.2, x, 0.1, d / 2, i ? 1 : -1, timber);
      box(w / 2 - 0.16, 0.035, 0.025, trim, x, h - 0.2, d / 2 + 0.025, g);
    }
    box(w + 0.11, 0.1, d + 0.08, timber, 0, h - 0.1, 0, g);
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) box(0.035, h - 0.16, 0.04, MAT.brass, x, 0.08, d / 2 + 0.015, g);
    legs(g, w, d, 0.07, MAT.oak, 0.1, 0.09);
  }
  for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) for (const z of [-d / 2 + 0.08, d / 2 - 0.08]) sphere(0.018, trim, x, h - 0.07, z, g, 8);
}

function chairMesh(style) {
  const c = new THREE.Group();
  const mats = { dining: [MAT.darkWood, MAT.velvet], stool: [MAT.oak, MAT.oak], gilt: [MAT.gold, MAT.red], wicker: [MAT.wicker, MAT.cloth], leather: [MAT.darkWood, MAT.leather], bench: [MAT.black, MAT.leather] };
  const [fr, seat] = mats[style] || mats.dining;
  if (style === "stool") {
    cyl(0.18, 0.18, 0.05, fr, 0, 0.62, 0, c, 18);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const l = cyl(0.018, 0.022, 0.64, fr, Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13, c, 6); l.rotation.z = Math.cos(a) * 0.08; l.rotation.x = -Math.sin(a) * 0.08; }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 18), MAT.iron); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; c.add(ring);
    return c;
  }
  if (style === "bench") { box(0.75, 0.06, 0.38, seat, 0, 0.44, 0, c); legs(c, 0.75, 0.38, 0.44, fr, 0.05, 0.05); return c; }
  box(0.46, 0.06, 0.46, seat, 0, 0.42, 0, c);
  legs(c, 0.44, 0.44, 0.42, fr, 0.03, 0.04);
  box(0.04, 0.55, 0.04, fr, -0.2, 0.48, -0.2, c); box(0.04, 0.55, 0.04, fr, 0.2, 0.48, -0.2, c);
  box(0.4, 0.38, 0.03, style === "wicker" ? MAT.wicker : seat, 0, 0.58, -0.205, c);
  box(0.44, 0.05, 0.05, fr, 0, 1.0, -0.2, c);
  return c;
}

function fireplace(g, parts, w, d, h) {
  // Stone surround with a deep firebox; front at +z.
  box(w, h, 0.09, MAT.stone, 0, 0, -d / 2 + 0.045, g);
  box(w + 0.2, 0.09, d + 0.12, MAT.marble, 0, h, 0.02, g);
  box(w * 0.18, h, d, MAT.marble, -w / 2 + w * 0.09, 0, 0, g);
  box(w * 0.18, h, d, MAT.marble, w / 2 - w * 0.09, 0, 0, g);
  box(w * 0.64, h * 0.2, d, MAT.marble, 0, h * 0.8, 0, g);
  for (const x of [-w * 0.38, w * 0.38]) for (const y of [0.25, 0.57, 0.9]) box(0.07, 0.025, 0.035, MAT.stone, x, y, d / 2 + 0.012, g);
  const hole = box(w * 0.62, h * 0.78, 0.012, MAT.blackMatte, 0, 0.02, -d / 2 + 0.095, g);
  hole.castShadow = false;
  box(w * 0.66, 0.04, 0.5, MAT.ash, 0, 0, d / 2 - 0.22, g);
  box(w + 0.4, 0.04, 0.6, MAT.marble, 0, 0, d / 2 + 0.25, g); // hearth
  // Andirons + logs.
  for (const s of [-1, 1]) { box(0.03, 0.22, 0.3, MAT.iron, s * 0.35, 0.04, d / 2 - 0.2, g); }
  for (let i = 0; i < 3; i++) { const l = cyl(0.06, 0.07, 0.75, i === 2 ? MAT.ash : MAT.wood, 0, 0.1 + (i === 2 ? 0.1 : 0), d / 2 - 0.22 + (i - 1) * 0.08, g, 8); l.rotation.z = Math.PI / 2; l.position.y = 0.14 + (i === 2 ? 0.1 : 0); }
  for (let i = -4; i <= 4; i++) box(0.012, 0.39, 0.018, MAT.iron, i * w * 0.062, 0.04, d / 2 + 0.025, g);
  box(w * 0.61, 0.025, 0.03, MAT.iron, 0, 0.05, d / 2 + 0.035, g);
  box(w * 0.61, 0.025, 0.03, MAT.iron, 0, 0.4, d / 2 + 0.035, g);
  for (const x of [-w * 0.22, w * 0.22]) sphere(0.035, MAT.brass, x, 0.19, d / 2 + 0.05, g, 10);
  // Screen + tools.
  for (let i = 0; i < 3; i++) box(0.012, 0.6, 0.012, MAT.brass, w / 2 + 0.12, 0.04, d / 2 + 0.05 + i * 0.05, g);
  // Over-mantel mirror / painting.
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, 0.9), M(0xffffff, { map: paintingTexture(Math.floor(Math.random() * 4)), roughness: 0.6 }));
  paint.position.set(0, h + 0.75, -d * 0.15 - d * 0.35 + 0.025); g.add(paint);
  box(w * 0.66, 1.0, 0.04, MAT.gold, 0, h + 0.25, -d * 0.5 + 0.0, g);
  const anchor = new THREE.Group(); anchor.position.set(0, 0.25, d / 2 - 0.22); g.add(anchor);
  parts.fire = anchor;
}

function bookshelf(g, parts, w, d, h, cab) {
  const base = cab ? 0.56 : 0.08;
  const shelves = [];
  for (let y = cab ? 0.52 : 0.51; y < h - 0.12; y += 0.48) shelves.push(y);
  cabinetShell(g, w, d, h, MAT.darkWood, shelves);
  // Individual book blocks stand inside the open bays. Rows vary so the
  // shelves retain some breathing space and do not read as a flat texture.
  for (let y = base + 0.055, row = 0; y + 0.35 < h; y += 0.48, row++) {
    const count = Math.floor((w - 0.16) / 0.14);
    for (let i = 0; i < count; i++) {
      if ((i * 7 + row * 11) % 17 === 0) continue;
      const bw = 0.075 + ((i * 3 + row) % 4) * 0.012;
      const bh = 0.27 + ((i + row * 2) % 5) * 0.018;
      const x = -w / 2 + 0.1 + i * (w - 0.2) / count;
      box(bw, bh, 0.21, [MAT.leather, MAT.red, MAT.green, MAT.oak, MAT.cream][(i + row * 3) % 5], x, y, -0.02, g);
      if (i % 3 === 0) box(bw + 0.002, 0.018, 0.214, MAT.brass, x, y + bh * 0.58, -0.02, g);
    }
  }
  if (cab) {
    box(w - 0.08, 0.47, 0.035, MAT.darkWood, 0, 0.03, -d / 2 + 0.08, g);
    const count = Math.min(4, Math.max(2, Math.floor(w / 1.1)));
    for (let i = 0; i < count; i++) cabDoor(g, parts, w / count - 0.025, 0.44, -w / 2 + (i + 0.5) * w / count, 0.055, d / 2, i % 2 ? 1 : -1);
  }
}

export function buildFurniture(f) {
  const g = new THREE.Group();
  const parts = { cab: [], fire: null, burner: null, glow: [], lamps: [], mirrors: [] };
  const { w, d, h } = f;
  switch (f.type) {
    case "counter": case "island": {
      cabinetShell(g, w, d, h - 0.05, MAT.cream, [0.4]);
      storageDressing(g, w, d, [0.4], f.type);
      box(w + 0.04, 0.05, d + 0.04, MAT.marble, 0, h - 0.05, 0, g);
      const n = Math.floor(w / 0.6);
      for (let i = 0; i < n; i++) cabDoor(g, parts, w / n - 0.02, h - 0.3, -w / 2 + (i + 0.5) * (w / n), 0.12, d / 2, i % 2 ? 1 : -1, MAT.cream);
      if (f.type === "counter") {
        // Sink + tap + hanging rail.
        box(0.7, 0.02, 0.45, MAT.porcelain, w * 0.25, h, 0, g);
        const tap = cyl(0.015, 0.015, 0.3, MAT.brass, w * 0.25, h, -0.25, g); tap.rotation.x = 0.4;
        box(w * 0.8, 0.02, 0.02, MAT.brass, 0, h + 0.75, -d / 2 + 0.05, g);
        for (let i = 0; i < 6; i++) box(0.01, 0.12, 0.01, MAT.iron, -w * 0.35 + i * 0.5, h + 0.63, -d / 2 + 0.05, g);
      }
      break;
    }
    case "stove": {
      box(w, h - 0.04, d, MAT.black, 0, 0, 0, g);
      box(w + 0.02, 0.04, d + 0.02, MAT.iron, 0, h - 0.04, 0, g);
      for (const s of [-1, 1]) { box(w * 0.42, 0.4, 0.03, MAT.iron, s * w * 0.23, 0.2, d / 2, g); box(0.15, 0.02, 0.03, MAT.steel, s * w * 0.23, 0.55, d / 2 + 0.02, g); }
      const burners = new THREE.Group();
      for (const [x, z] of [[-0.4, -0.15], [0.4, -0.15], [-0.4, 0.2], [0.4, 0.2]]) {
        const b = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 20), MAT.burnerOff.clone());
        b.rotation.x = Math.PI / 2; b.position.set(x, h + 0.01, z); burners.add(b);
      }
      g.add(burners);
      for (let i = 0; i < 4; i++) cyl(0.022, 0.022, 0.03, MAT.steel, -0.45 + i * 0.3, h - 0.15, d / 2 + 0.015, g, 10).rotation.x = Math.PI / 2;
      cyl(0.09, 0.09, 1.9, MAT.iron, w / 2 - 0.15, h, -d / 2 + 0.12, g, 10);
      const kettle = sphere(0.11, MAT.steel, -0.4, h + 0.12, -0.15, g); kettle.scale.y = 0.8;
      parts.burner = burners;
      break;
    }
    case "hood": { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.75, 0.6, 4, 1, true), MAT.steel); m.rotation.y = Math.PI / 4; m.scale.z = 0.55; m.position.y = 0.3; m.castShadow = true; g.add(m); box(0.3, 1.2, 0.3, MAT.steel, 0, 0.6, -0.1, g); break; }
    case "wardrobe": case "storageChest": {
      framedStorage(g, parts, w, d, h, f.type === "storageChest");
      break;
    }
    case "pantry": case "dresser": case "china": case "cabinet": case "filing": {
      const glassTop = f.type === "dresser" || f.type === "china";
      const baseH = glassTop ? 0.9 : h;
      const material = f.type === "pantry" ? MAT.oak : MAT.darkWood;
      const shelfYs = f.type === "filing" ? [0.34, 0.68, 1.02] : f.type === "pantry" ? [0.48, 0.96, 1.44, 1.9] : [baseH * 0.47];
      cabinetShell(g, w, d, baseH, material, shelfYs);
      if (f.type !== "filing") storageDressing(g, w, d, shelfYs, f.type);
      if (f.type === "filing") for (let i = 0; i < 4; i++) {
        const rowY = 0.04 + i * ((h - 0.08) / 4);
        drawer(g, parts, w * 0.45, (h - 0.08) / 4 - 0.015, -w / 4, rowY, d / 2);
        drawer(g, parts, w * 0.45, (h - 0.08) / 4 - 0.015, w / 4, rowY, d / 2);
      }
      else { const n = w > 1.2 ? 2 : 1; for (let i = 0; i < n; i++) cabDoor(g, parts, w / n - 0.04, baseH - 0.15, -w / 2 + (i + 0.5) * (w / n), 0.07, d / 2, i ? 1 : -1, f.type === "pantry" ? MAT.oak : MAT.darkWood); }
      if (glassTop) {
        box(w, 0.04, d + 0.04, MAT.darkWood, 0, baseH, 0, g);
        const upper = new THREE.Group(); upper.position.y = baseH; g.add(upper);
        cabinetShell(upper, w - 0.04, d * 0.65, h - baseH, MAT.darkWood, [0.38, 0.8, 1.2]);
        for (const i of [0, 1]) glassDoor(upper, parts, w / 2 - 0.035, h - baseH - 0.08, (i ? 1 : -1) * w / 4, 0.04, d * 0.325, i ? 1 : -1);
        for (let y = baseH + 0.45; y < h - 0.1; y += 0.4) {
          for (let x = -w / 2 + 0.2; x < w / 2 - 0.1; x += 0.28) { const p = cyl(0.085, 0.085, 0.014, MAT.porcelain, x, y + 0.02, -d * 0.12, g, 18); p.rotation.x = 1.1; p.position.y = y + 0.12; }
        }
        box(w + 0.06, 0.08, d * 0.6, MAT.darkWood, 0, h - 0.08, -d * 0.15, g);
      }
      if (f.type === "pantry") for (let y = 0.5; y < h; y += 0.5) box(w - 0.1, 0.02, 0.02, MAT.darkWood, 0, y, d / 2 + 0.03, g);
      for (const x of [-w / 2 + 0.025, w / 2 - 0.025]) box(0.04, baseH - 0.05, 0.045, MAT.brass, x, 0.03, d / 2 + 0.01, g);
      break;
    }
    case "barrel": {
      const r = w / 2, seg = 24;
      const staveMat = MAT.oak.clone(); staveMat.side = THREE.DoubleSide;
      const profile = [new THREE.Vector2(r * 0.9, 0.035), new THREE.Vector2(r * 0.99, h * 0.1), new THREE.Vector2(r * 1.06, h * 0.5), new THREE.Vector2(r, h * 0.88), new THREE.Vector2(r * 0.96, h)];
      const wall = new THREE.Mesh(new THREE.LatheGeometry(profile, seg), staveMat);
      wall.castShadow = wall.receiveShadow = true; g.add(wall);
      cyl(r * 0.89, r * 0.89, 0.045, MAT.darkWood, 0, 0.035, 0, g, seg);
      for (let i = 0; i < seg; i++) {
        const a = i * Math.PI * 2 / seg;
        const slat = box(0.012, h * 0.92, 0.012, i % 3 ? MAT.oak : MAT.lightWood, Math.sin(a) * r * 1.025, 0.04, Math.cos(a) * r * 1.025, g);
        slat.rotation.y = a;
      }
      for (const [yy, rr] of [[0.12, r], [0.36, r * 1.045], [0.66, r * 1.045], [0.9, r]]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.019, 8, 32), MAT.iron);
        hoop.rotation.x = Math.PI / 2; hoop.position.y = h * yy; hoop.castShadow = true; g.add(hoop);
      }
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, 0.022, 8, 32), MAT.iron);
      rim.rotation.x = Math.PI / 2; rim.position.y = h; g.add(rim);
      cushion(r * 0.48, 0.09, r * 0.46, MAT.cloth, -r * 0.22, 0.075, -r * 0.18, g, 0.018);
      if (!f.openBarrel) {
        const lid = new THREE.Group(); lid.position.set(0, h, -r); g.add(lid);
        cyl(r * 0.95, r * 0.95, 0.055, MAT.oak, 0, 0, r, lid, seg);
        for (const x of [-r * 0.42, r * 0.42]) box(0.045, 0.025, r * 1.65, MAT.iron, x, 0.055, r, lid);
        parts.cab.push({ obj: lid, kind: "lid" });
      }
      break;
    }
    case "table": case "teatable": case "sideTable": case "roundStand": {
      const round = f.type !== "table";
      if (round) { cyl(w / 2, w / 2, 0.04, MAT.darkWood, 0, h - 0.04, 0, g, 28); cyl(0.04, 0.06, h - 0.04, MAT.darkWood, 0, 0, 0, g, 10); cyl(w * 0.3, w * 0.3, 0.04, MAT.darkWood, 0, 0, 0, g, 16); if (f.type === "teatable") cyl(w / 2 - 0.05, w / 2 - 0.05, 0.005, MAT.cloth, 0, h, 0, g, 28); }
      else { box(w, 0.06, d, MAT.oak, 0, h - 0.06, 0, g); legs(g, w, d, h - 0.06, MAT.oak, 0.08, 0.08); box(w - 0.2, 0.08, 0.03, MAT.oak, 0, h - 0.16, d / 2 - 0.08, g); }
      break;
    }
    case "piano": {
      const body = new THREE.Shape();
      body.moveTo(-w / 2, -d / 2); body.lineTo(w / 2, -d / 2); body.lineTo(w / 2, d * 0.1); body.bezierCurveTo(w / 2, d / 2, -w * 0.1, d / 2, -w / 2, d / 2); body.closePath();
      const geo = new THREE.ExtrudeGeometry(body, { depth: 0.3, bevelEnabled: false });
      const m = new THREE.Mesh(geo, MAT.black); m.rotation.x = -Math.PI / 2; m.position.y = 0.62; m.castShadow = m.receiveShadow = true; g.add(m);
      const lid = new THREE.Mesh(new THREE.ShapeGeometry(body), MAT.black); lid.rotation.x = -Math.PI / 2; lid.position.y = 0.93; g.add(lid);
      const prop = new THREE.Mesh(new THREE.ShapeGeometry(body), MAT.black); prop.material = MAT.black; prop.rotation.set(-Math.PI / 2 + 0.6, 0, 0); prop.position.set(0, 0.94, -d / 2); prop.scale.set(0.98, 0.98, 1); g.add(prop);
      box(w * 0.9, 0.06, 0.18, MAT.porcelain, 0, 0.82, -d / 2 - 0.05, g);
      for (let i = 0; i < 18; i++) box(0.012, 0.015, 0.1, MAT.black, -w * 0.43 + i * w * 0.05, 0.88, -d / 2 - 0.08, g);
      for (const [x, z] of [[-w / 2 + 0.15, -d / 2 + 0.15], [w / 2 - 0.15, -d / 2 + 0.15], [-0.3, d / 2 - 0.25]]) cyl(0.05, 0.04, 0.62, MAT.black, x, 0, z, g, 10);
      // Sheet music + candelabra.
      box(0.4, 0.28, 0.01, MAT.cream, 0, 0.98, -d / 2 + 0.12, g).rotation.x = -0.25;
      g.rotation.y = Math.PI; // keyboard faces the bench side
      break;
    }
    case "pillar": cyl(0.26, 0.3, h - 0.5, MAT.marble, 0, 0.25, 0, g, 20); box(0.72, 0.25, 0.72, MAT.marble, 0, 0, 0, g); box(0.7, 0.25, 0.7, MAT.marble, 0, h - 0.25, 0, g); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; box(0.03, h - 0.5, 0.03, MAT.cream, Math.cos(a) * 0.27, 0.25, Math.sin(a) * 0.27, g); } break;
    case "chandelier": case "poolLamp": {
      const c = new THREE.Group();
      if (f.type === "poolLamp") {
        box(0.02, 0.9, 0.02, MAT.brass, -0.6, 0, 0, c); box(0.02, 0.9, 0.02, MAT.brass, 0.6, 0, 0, c);
        box(1.5, 0.03, 0.05, MAT.brass, 0, 0, 0, c);
        for (const x of [-0.55, 0, 0.55]) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.22, 16, 1, true), MAT.green.clone()); s.material.side = THREE.DoubleSide; s.position.set(x, -0.12, 0); c.add(s); sphere(0.05, MAT.glow, x, -0.2, 0, c, 8); parts.glow.push({ x, y: 3.6 - 1.15 - 0.2, z: 0, s: 0.6 }); }
        c.position.y = 3.6 - 1.05;
      } else {
        cyl(0.012, 0.012, 1.0, MAT.iron, 0, 0, 0, c, 6);
        for (const [r, y, n] of [[0.65, 0, 10], [0.38, 0.28, 6]]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 8, 36), MAT.brass); ring.rotation.x = Math.PI / 2; ring.position.y = y; c.add(ring);
          for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const cx = Math.cos(a) * r, cz = Math.sin(a) * r; cyl(0.018, 0.018, 0.1, MAT.cream, cx, y, cz, c, 6); sphere(0.03, MAT.glow, cx, y + 0.14, cz, c, 6); }
        }
        for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const p = new THREE.Mesh(new THREE.OctahedronGeometry(0.03), MAT.glass); p.position.set(Math.cos(a) * 0.55, -0.12, Math.sin(a) * 0.55); c.add(p); }
        c.position.y = 3.6 - 1.15;
        parts.glow.push({ x: 0, y: 3.6 - 1.0, z: 0, s: 2.2 });
      }
      g.add(c);
      parts.lamps.push({ x: 0, y: 3.6 - 1.0, z: 0 });
      break;
    }
    case "drinks": case "bar": {
      cabinetShell(g, w, d, h - 0.04, MAT.darkWood, [0.42]);
      storageDressing(g, w, d, [0.42], "bar");
      box(w + 0.06, 0.04, d + 0.06, MAT.marble, 0, h - 0.04, 0, g);
      if (f.type === "bar") { cabDoor(g, parts, w / 2 - 0.05, h - 0.25, -w / 4, 0.1, d / 2, -1); cabDoor(g, parts, w / 2 - 0.05, h - 0.25, w / 4, 0.1, d / 2, 1); box(w, 1.0, 0.25, MAT.darkWood, 0, h + 0.5, -d / 2 + 0.1, g); for (let i = 0; i < 7; i++) cyl(0.035, 0.04, 0.3, i % 2 ? MAT.glass : M(0x3a1a08, { roughness: 0.1 }), -w / 2 + 0.25 + i * 0.33, h + 0.6, -d / 2 + 0.13, g, 10); }
      else for (let i = 0; i < 3; i++) box(w - 0.1, 0.02, d - 0.1, MAT.darkWood, 0, 0.2 + i * 0.25, 0, g);
      break;
    }
    case "gramophone": { box(0.45, 0.25, 0.45, MAT.darkWood, 0, 0.72, 0, g); legs(g, 0.45, 0.45, 0.72, MAT.darkWood, 0.03, 0.04); cyl(0.17, 0.17, 0.01, MAT.black, 0, 0.98, 0, g, 24); const horn = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 24, 1, true), MAT.brass); horn.material = MAT.brass; horn.rotation.x = -Math.PI / 2 - 0.6; horn.position.set(0, 1.32, 0.18); g.add(horn); break; }
    case "settee": case "sofa": {
      const mat = f.type === "sofa" ? MAT.velvet : MAT.red;
      cushion(w, 0.42, d, mat, 0, 0.06, 0, g, 0.1); cushion(w, 0.5, 0.2, mat, 0, 0.45, -d / 2 + 0.1, g, 0.07);
      cushion(0.16, 0.3, d, mat, -w / 2 + 0.08, 0.45, 0, g); cushion(0.16, 0.3, d, mat, w / 2 - 0.08, 0.45, 0, g);
      const n = w > 2.3 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.16 + (i + 0.5) * ((w - 0.32) / n);
        cushion(w / n - 0.25, 0.1, d - 0.3, mat, x, 0.48, 0.05, g);
        const button = sphere(0.022, MAT.gold, x, 0.73, -d / 2 + 0.22, g, 10);
        button.castShadow = false;
      }
      legs(g, w, d, 0.08, MAT.darkWood, 0.08, 0.06);
      break;
    }
    case "armchair": {
      cushion(0.82, 0.38, 0.8, MAT.leather, 0, 0.08, 0, g); cushion(0.82, 0.62, 0.2, MAT.leather, 0, 0.42, -0.32, g);
      cushion(0.15, 0.25, 0.75, MAT.leather, -0.34, 0.45, 0.02, g); cushion(0.15, 0.25, 0.75, MAT.leather, 0.34, 0.45, 0.02, g);
      cushion(0.5, 0.08, 0.55, MAT.leather, 0, 0.45, 0.08, g); legs(g, 0.8, 0.78, 0.08, MAT.darkWood, 0.06, 0.05);
      break;
    }
    case "chair": g.add(chairMesh(f.style)); break;
    case "planter": { box(w, h, d, MAT.terracotta, 0, 0, 0, g); box(w - 0.1, 0.05, d - 0.1, M(0x2a1c12, { roughness: 1 }), 0, h - 0.04, 0, g); for (let i = 0; i < w * 2; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + Math.random() * 0.18, 0), Math.random() < 0.4 ? MAT.deadLeaf : MAT.leaf); s.position.set((Math.random() - 0.5) * (w - 0.3), h + 0.2 + Math.random() * 0.2, (Math.random() - 0.5) * (d - 0.2)); s.scale.y = 0.7; s.castShadow = true; g.add(s); } break; }
    case "palm": { cyl(0.28, 0.2, 0.5, MAT.terracotta, 0, 0, 0, g, 14); const trunk = cyl(0.04, 0.06, h - 0.7, MAT.wood, 0, 0.5, 0, g, 6); trunk.rotation.z = 0.05; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const fr = box(0.9, 0.01, 0.2, Math.random() < 0.3 ? MAT.deadLeaf : MAT.leaf, Math.cos(a) * 0.42, h - 0.25, Math.sin(a) * 0.42, g); fr.rotation.set(0, -a, -0.5); } break; }
    case "fountain": { cyl(w / 2, w / 2 + 0.05, 0.45, MAT.stone, 0, 0, 0, g, 24); cyl(w / 2 - 0.08, w / 2 - 0.08, 0.02, MAT.water, 0, 0.4, 0, g, 24); cyl(0.12, 0.16, 0.9, MAT.stone, 0, 0.4, 0, g, 12); cyl(0.4, 0.15, 0.14, MAT.stone, 0, 1.25, 0, g, 18); const st = sphere(0.14, MAT.stone, 0, 1.55, 0, g, 12); st.scale.y = 1.4; break; }
    case "diningTable": {
      box(w, 0.07, d, MAT.darkWood, 0, h - 0.07, 0, g);
      for (const x of [-w / 2 + 0.6, w / 2 - 0.6]) { cyl(0.08, 0.12, h - 0.07, MAT.darkWood, x, 0, 0, g, 10); box(0.9, 0.08, 0.2, MAT.darkWood, x, 0, 0, g); }
      box(w * 0.85, 0.005, 0.45, M(0xe8e0cc, { roughness: 1 }), 0, h, 0, g); // runner
      break;
    }
    case "sideboard": {
      const inset = new THREE.Group(); inset.position.y = 0.1; g.add(inset);
      cabinetShell(inset, w, d, h - 0.14, MAT.darkWood, [0.38]);
      storageDressing(inset, w, d, [0.38], "sideboard");
      legs(g, w, d, 0.1, MAT.darkWood, 0.06, 0.07);
      box(w + 0.05, 0.04, d + 0.04, MAT.darkWood, 0, h, 0, g);
      for (let i = 0; i < 3; i++) cabDoor(g, parts, w / 3 - 0.04, h - 0.3, -w / 2 + (i + 0.5) * w / 3, 0.16, d / 2, i === 2 ? 1 : -1);
      const mirror = box(w * 0.8, 1.0, 0.04, MAT.gold, 0, h + 0.3, -d / 2 + 0.02, g);
      break;
    }
    case "clock": {
      box(w * 0.75, h - 0.5, d * 0.7, MAT.darkWood, 0, 0.12, 0, g); box(w, 0.12, d, MAT.darkWood, 0, 0, 0, g);
      box(w * 0.9, 0.55, d * 0.85, MAT.darkWood, 0, h - 0.55, 0, g);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 28), MAT.cream); face.position.set(0, h - 0.28, d * 0.43 + 0.001); g.add(face);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; box(0.01, 0.03, 0.005, MAT.black, Math.sin(a) * 0.17, h - 0.28 + Math.cos(a) * 0.17 - 0.015, d * 0.43 + 0.003, g); }
      const pend = new THREE.Group(); pend.position.set(0, h - 0.62, d * 0.36); cyl(0.006, 0.006, 0.7, MAT.brass, 0, -0.7, 0, pend, 6); const bob = cyl(0.08, 0.08, 0.02, MAT.brass, 0, -0.75, 0, pend, 16); bob.rotation.x = Math.PI / 2; g.add(pend);
      box(w * 0.5, h * 0.42, 0.01, MAT.glass, 0, h * 0.25, d * 0.36, g);
      parts.pendulum = pend;
      break;
    }
    case "fireplace": fireplace(g, parts, w, d, h); break;
    case "roundTable": {
      cyl(w / 2, w / 2, 0.08, MAT.darkWood, 0, h - 0.08, 0, g, 48); cyl(0.25, 0.5, h - 0.08, MAT.darkWood, 0, 0, 0, g, 16);
      cyl(w / 2 - 0.15, w / 2 - 0.15, 0.005, MAT.felt, 0, h, 0, g, 48);
      break;
    }
    case "wineRack": {
      cabinetShell(g, w, d, h, MAT.oak, []);
      const bottleMats = [M(0x172d21, { roughness: 0.22 }), M(0x39221c, { roughness: 0.24 }), M(0x4c3b1d, { roughness: 0.28 })];
      for (let y = 0.2, row = 0; y < h - 0.1; y += 0.2, row++) {
        box(w - 0.08, 0.034, d - 0.07, MAT.oak, 0, y - 0.055, 0, g);
        for (let x = -w / 2 + 0.18, i = 0; x < w / 2 - 0.1; x += 0.18, i++) {
          const b = cyl(0.045, 0.052, d * 0.58, bottleMats[(row + i) % 3], x, y, -0.02, g, 10);
          b.rotation.x = Math.PI / 2; b.position.y = y + 0.015;
          const cork = cyl(0.023, 0.023, 0.035, MAT.cream, x, y, d * 0.32, g, 8);
          cork.rotation.x = Math.PI / 2; cork.position.y = y + 0.015;
        }
      }
      break;
    }
    case "crate": {
      box(w, 0.05, d, MAT.oak, 0, 0, 0, g);
      for (const s of [-1, 1]) {
        box(0.048, h, d, MAT.lightWood, s * (w / 2 - 0.024), 0, 0, g);
        box(w, h, 0.048, MAT.lightWood, 0, 0, s * (d / 2 - 0.024), g);
      }
      for (const y of [0.12, h * 0.55, h - 0.13]) {
        box(w + 0.025, 0.044, 0.025, MAT.oak, 0, y, d / 2 + 0.006, g);
        box(w + 0.025, 0.044, 0.025, MAT.oak, 0, y, -d / 2 - 0.006, g);
      }
      cushion(w * 0.5, 0.14, d * 0.42, MAT.cloth, -w * 0.14, 0.06, -d * 0.08, g, 0.02);
      box(w * 0.22, 0.2, d * 0.3, MAT.leather, w * 0.24, 0.06, 0.07, g);
      break;
    }
    case "billiardTable": {
      box(w - 0.3, 0.55, d - 0.3, MAT.darkWood, 0, 0.12, 0, g);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.08, 0.06, 0.62, MAT.darkWood, sx * (w / 2 - 0.25), 0, sz * (d / 2 - 0.25), g, 10);
      const felt = box(w - 0.3, 0.02, d - 0.3, MAT.felt, 0, h - 0.02, 0, g); felt.castShadow = false;
      // Cushions/rails.
      box(w, 0.08, 0.15, MAT.darkWood, 0, h - 0.04, d / 2 - 0.075, g); box(w, 0.08, 0.15, MAT.darkWood, 0, h - 0.04, -d / 2 + 0.075, g);
      box(0.15, 0.08, d, MAT.darkWood, w / 2 - 0.075, h - 0.04, 0, g); box(0.15, 0.08, d, MAT.darkWood, -w / 2 + 0.075, h - 0.04, 0, g);
      for (const [x, z] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]) cyl(0.06, 0.06, 0.03, MAT.black, x * (w / 2 - 0.14), h - 0.005, z * (d / 2 - 0.14), g, 12);
      for (let i = 0; i < 6; i++) sphere(0.012, MAT.porcelain, -w / 2 + 0.4 + i * 0.4, h + 0.04, d / 2 - 0.075, g, 6);
      break;
    }
    case "cueRack": { box(w, h, 0.06, MAT.darkWood, 0, 0.2, -d / 2 + 0.03, g); for (let i = 0; i < 5; i++) { const c = cyl(0.012, 0.018, 1.45, MAT.lightWood, -w / 2 + 0.2 + i * 0.25, 0.1, -d / 2 + 0.1, g, 6); c.rotation.x = 0.04; } break; }
    case "bookshelf": bookshelf(g, parts, w, d, h, f.cab); break;
    case "readingTable": { box(w, 0.05, d, MAT.oak, 0, h - 0.05, 0, g); legs(g, w, d, h - 0.05, MAT.oak, 0.1, 0.07); box(w - 0.6, 0.004, d - 0.3, MAT.green, 0, h, 0, g); cyl(0.08, 0.1, 0.03, MAT.brass, w / 2 - 0.35, h, -0.2, g); cyl(0.012, 0.012, 0.35, MAT.brass, w / 2 - 0.35, h, -0.2, g); const sh = box(0.32, 0.08, 0.14, M(0x1f5a36, { emissive: 0x1f6a36, emissiveIntensity: 0.5, roughness: 0.3 }), w / 2 - 0.35, h + 0.35, -0.13, g); parts.glow.push({ x: w / 2 - 0.35, y: h + 0.32, z: -0.1, s: 0.5 }); break; }
    case "globe": { cyl(0.06, 0.25, h * 0.55, MAT.darkWood, 0, 0, 0, g, 12); cyl(0.3, 0.3, 0.03, MAT.darkWood, 0, h * 0.55, 0, g, 24); const s = sphere(0.28, M(0x6a7a5a, { roughness: 0.5 }), 0, h - 0.3, 0, g, 24); s.rotation.z = 0.4; const r = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.012, 6, 40), MAT.brass); r.position.y = h - 0.3; r.rotation.y = 0.5; g.add(r); break; }
    case "coffeeTable": box(w, 0.05, d, MAT.darkWood, 0, h - 0.05, 0, g); legs(g, w, d, h - 0.05, MAT.darkWood, 0.06, 0.05); box(w - 0.12, 0.02, d - 0.12, MAT.darkWood, 0, 0.12, 0, g); break;
    case "lamp": { cyl(0.15, 0.18, 0.05, MAT.brass, 0, 0, 0, g, 16); cyl(0.015, 0.015, h - 0.35, MAT.brass, 0, 0.05, 0, g, 6); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.3, 18, 1, true), MAT.shade); s.position.y = h - 0.15; g.add(s); parts.glow.push({ x: 0, y: h - 0.2, z: 0, s: 0.8 }); parts.lamps.push({ x: 0, y: h - 0.2, z: 0, small: true }); break; }
    case "rug": { const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M(0xffffff, { map: floorTexture("carpet", f.room === "conference" ? "#2c2a48" : "#5a1a22"), roughness: 1 })); r.rotation.x = -Math.PI / 2; r.position.y = 0.008; r.receiveShadow = true; g.add(r); const fr = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, d + 0.1), M(0xb89a5a, { roughness: 1 })); fr.rotation.x = -Math.PI / 2; fr.position.y = 0.006; fr.receiveShadow = true; g.add(fr); break; }
    case "stairs": {
      // Grand staircase rising along -z towards the back wall, ending in a landing.
      const n = 16, run = (d - 1.6) / n, rise = (h - 0.3) / n;
      for (let i = 0; i < n; i++) { box(w, rise * (i + 1), run + 0.02, MAT.darkWood, 0, 0, d / 2 - (i + 0.5) * run, g); box(w - 0.6, 0.006, run, MAT.velvet, 0, rise * (i + 1), d / 2 - (i + 0.5) * run, g); }
      box(w, h - 0.3, 1.6, MAT.darkWood, 0, 0, -d / 2 + 0.8, g);
      for (const s of [-1, 1]) {
        const len = Math.hypot(d - 1.6, h - 0.3);
        const rail = box(0.08, 0.08, len, MAT.darkWood, s * (w / 2 - 0.05), 0, 0, g);
        rail.rotation.x = Math.atan2(h - 0.3, d - 1.6); rail.position.set(s * (w / 2 - 0.05), (h - 0.3) / 2 + 0.95, 0.8 - 0.0);
        for (let i = 0; i < n; i += 2) box(0.04, 0.9, 0.04, MAT.darkWood, s * (w / 2 - 0.05), rise * (i + 1), d / 2 - (i + 0.5) * run, g);
        cyl(0.09, 0.09, 1.1, MAT.darkWood, s * (w / 2 - 0.05), 0, d / 2 - 0.1, g, 8); sphere(0.1, MAT.darkWood, s * (w / 2 - 0.05), 1.2, d / 2 - 0.1, g, 8);
      }
      break;
    }
    case "statue": { box(0.7, 0.9, 0.7, MAT.marble, 0, 0, 0, g); cyl(0.14, 0.2, 0.7, MAT.marble, 0, 0.9, 0, g, 12); const t = sphere(0.18, MAT.marble, 0, 1.75, 0, g, 14); t.scale.set(1, 1.2, 1); box(0.5, 0.18, 0.2, MAT.marble, 0, 1.45, 0, g); break; }
    case "console": { box(w, 0.05, d, MAT.darkWood, 0, h - 0.05, 0, g); for (const s of [-1, 1]) { const l = cyl(0.03, 0.02, h - 0.05, MAT.gold, s * (w / 2 - 0.1), 0, 0, g, 8); } box(w * 0.6, 0.9, 0.04, MAT.gold, 0, h + 0.5, -d / 2 + 0.02, g); const mir = box(w * 0.55, 0.82, 0.01, M(0x8a9aa0, { metalness: 1, roughness: 0.08 }), 0, h + 0.54, -d / 2 + 0.045, g); break; }
    case "coatStand": { cyl(0.2, 0.22, 0.04, MAT.darkWood, 0, 0, 0, g, 12); cyl(0.025, 0.03, h, MAT.darkWood, 0, 0, 0, g, 8); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; const p = cyl(0.012, 0.012, 0.25, MAT.brass, Math.cos(a) * 0.08, h - 0.2, Math.sin(a) * 0.08, g, 6); p.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8); } const coat = box(0.4, 0.9, 0.18, M(0x1c1c22, { roughness: 1 }), 0.12, h - 1.05, 0, g); break; }
    case "bench": box(w, 0.06, d, MAT.darkWood, 0, h - 0.06, 0, g); box(w - 0.06, 0.06, d - 0.06, MAT.velvet, 0, h, 0, g); legs(g, w, d, h - 0.06, MAT.darkWood, 0.06, 0.05); break;
    case "frontDoor": {
      for (const s of [-1, 1]) { box(w / 2 - 0.02, h, 0.1, MAT.darkWood, s * w / 4, 0, 0, g); for (const y of [0.3, 1.5]) box(w / 2 - 0.25, 0.9, 0.02, MAT.wood, s * w / 4, y, -0.06, g); sphere(0.04, MAT.brass, s * 0.1, 1.1, -0.08, g, 8); }
      box(w + 0.3, 0.2, 0.25, MAT.darkWood, 0, h, 0, g);
      const fan = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 24, 0, Math.PI), MAT.glass); fan.position.set(0, h + 0.2, -0.02); fan.rotation.y = Math.PI; g.add(fan);
      break;
    }
    case "desk": {
      box(w, 0.05, d, MAT.darkWood, 0, h - 0.05, 0, g); box(w - 0.1, 0.005, d - 0.2, MAT.leather, 0, h, 0, g);
      for (const s of [-1, 1]) {
        const pedestal = new THREE.Group(); pedestal.position.x = s * (w / 2 - 0.28); g.add(pedestal);
        cabinetShell(pedestal, 0.55, d - 0.05, h - 0.05, MAT.darkWood, [0.25, 0.48]);
        for (let i = 0; i < 3; i++) drawer(g, parts, 0.5, 0.2, s * (w / 2 - 0.28), 0.08 + i * 0.22, (d - 0.05) / 2);
      }
      box(w - 1.1, 0.5, 0.03, MAT.darkWood, 0, 0.2, -d / 2 + 0.1, g);
      break;
    }
    case "armor": {
      box(0.5, 0.15, 0.4, MAT.stone, 0, 0, 0, g);
      const mat = MAT.steel;
      for (const s of [-1, 1]) { cyl(0.07, 0.06, 0.75, mat, s * 0.1, 0.15, 0, g, 8); }
      const torso = cyl(0.2, 0.15, 0.6, mat, 0, 0.9, 0, g, 10); torso.scale.z = 0.7;
      sphere(0.12, mat, 0, 1.68, 0, g, 10).scale.y = 1.2;
      for (const s of [-1, 1]) { const a = cyl(0.05, 0.045, 0.6, mat, s * 0.26, 0.9, 0, g, 8); a.rotation.z = s * 0.12; }
      if (f.id !== "sword_knight") { cyl(0.015, 0.015, 2.0, MAT.wood, 0.32, 0.1, 0.12, g, 6); box(0.02, 0.25, 0.15, mat, 0.32, 1.85, 0.2, g); }
      break;
    }
    case "bin": {
      // Open wicker-and-tin waste bin.
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2 * 0.8, h, 16, 1, true), MAT.iron);
      outer.material = outer.material.clone(); outer.material.side = THREE.DoubleSide;
      outer.position.y = h / 2; outer.castShadow = outer.receiveShadow = true; g.add(outer);
      cyl(w / 2 * 0.8, w / 2 * 0.8, 0.02, MAT.blackMatte, 0, 0.01, 0, g, 16);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(w / 2, 0.015, 6, 20), MAT.brass); rim.rotation.x = Math.PI / 2; rim.position.y = h; g.add(rim);
      break;
    }
    case "wallShelf": {
      for (const y of [0.05, 0.55]) {
        box(w, 0.055, d, MAT.oak, 0, y, 0, g);
        for (let i = 0; i < Math.floor(w / 0.32); i++) {
          const x = -w / 2 + 0.2 + i * 0.32;
          if (i % 3 === 0) cyl(0.06, 0.06, 0.18, MAT.porcelain, x, y + 0.06, 0, g, 10);
          else box(0.1, 0.24 + (i % 2) * 0.08, 0.17, i % 2 ? MAT.red : MAT.green, x, y + 0.06, 0, g);
        }
      }
      box(w, 0.04, 0.04, MAT.darkWood, 0, 0.98, -d / 2, g);
      break;
    }
    case "easel": {
      for (const s of [-1, 1]) { const l = box(0.065, 1.95, 0.07, MAT.lightWood, s * 0.4, 0, -0.1, g); l.rotation.z = -s * 0.12; }
      const back = box(0.06, 1.9, 0.06, MAT.oak, 0, 0, -0.36, g); back.rotation.x = 0.24;
      box(1.05, 0.07, 0.22, MAT.oak, 0, 0.72, 0.05, g);
      box(0.78, 1.03, 0.055, MAT.cream, 0, 0.83, 0, g);
      const picture = new THREE.Mesh(new THREE.PlaneGeometry(0.71, 0.96), M(0xffffff, { map: paintingTexture(Math.floor(Math.abs(f.x * 10)) % 4), roughness: 0.95 }));
      picture.position.set(0, 1.375, 0.037); g.add(picture);
      box(0.9, 0.05, 0.09, MAT.oak, 0, 1.9, 0, g);
      break;
    }
    case "workbench": {
      box(w, 0.09, d, MAT.lightWood, 0, h - 0.09, 0, g); legs(g, w, d, h - 0.09, MAT.oak, 0.12, 0.1);
      box(w - 0.25, 0.04, d - 0.18, MAT.oak, 0, 0.3, 0, g);
      const cubby = new THREE.Group(); cubby.position.set(-w / 2 + 0.65, 0.06, 0); g.add(cubby);
      cabinetShell(cubby, 0.86, d - 0.08, 0.53, MAT.oak, [0.25]);
      storageDressing(cubby, 0.86, d - 0.08, [0.25], "workbench");
      for (let i = 0; i < 7; i++) {
        const x = -w / 2 + 0.3 + i * 0.42;
        cyl(0.07, 0.07, 0.13, [MAT.red, MAT.green, MAT.gold, MAT.cream][i % 4], x, h, -0.36, g, 10);
        cyl(0.075, 0.075, 0.025, MAT.black, x, h + 0.13, -0.36, g, 10);
      }
      box(0.64, 0.02, 0.45, MAT.cream, 0.35, h, 0.17, g);
      cabDoor(g, parts, 0.85, 0.45, -w / 2 + 0.65, 0.05, d / 2 - 0.02, -1, MAT.oak);
      break;
    }
    case "canvasRack": {
      box(w, 0.1, d, MAT.oak, 0, 0, 0, g);
      for (const s of [-1, 1]) box(0.08, h, d, MAT.darkWood, s * (w / 2 - 0.04), 0, 0, g);
      for (let i = 0; i < 6; i++) {
        const x = -w / 2 + 0.32 + i * 0.48;
        const c = box(0.05, 1.15 + (i % 3) * 0.14, 0.45, MAT.cream, x, 0.13, 0, g);
        c.rotation.y = (i % 2 ? 1 : -1) * 0.12;
        box(0.04, 0.04, 0.5, MAT.oak, x, 0.35, 0, g);
      }
      break;
    }
    case "paintShelf": {
      cabinetShell(g, w, d, h, MAT.oak, [0.5, 1.02]);
      storageDressing(g, w, d, [0.5, 1.02], "paintShelf");
      for (let i = 0; i < 9; i++) cyl(0.07, 0.07, 0.14, [MAT.red, MAT.green, MAT.gold, MAT.cream][i % 4], -w / 2 + 0.24 + i * 0.34, 1.1, d / 2 + 0.03, g, 8);
      cabDoor(g, parts, w / 2 - 0.06, 0.42, -w / 4, 0.05, d / 2 + 0.02, -1, MAT.oak);
      cabDoor(g, parts, w / 2 - 0.06, 0.42, w / 4, 0.05, d / 2 + 0.02, 1, MAT.oak);
      break;
    }
    case "sculpture": {
      box(0.8, 0.9, 0.8, MAT.marble, 0, 0, 0, g);
      box(0.72, 0.08, 0.72, MAT.stone, 0, 0.9, 0, g);
      const bust = sphere(0.33, MAT.cream, 0, 1.49, 0, g, 16); bust.scale.set(0.8, 1.25, 0.68);
      cyl(0.11, 0.19, 0.2, MAT.cream, 0, 1.06, 0, g, 12);
      sphere(0.17, MAT.cream, 0, 1.94, -0.02, g, 14).scale.y = 1.1;
      break;
    }
    case "vanity": {
      cabinetShell(g, w, d, h - 0.07, MAT.white, [0.38]);
      storageDressing(g, w, d, [0.38], "vanity");
      box(w + 0.08, 0.07, d + 0.08, MAT.marble, 0, h - 0.07, 0, g);
      for (const s of [-1, 1]) {
        const basin = cyl(0.31, 0.25, 0.025, MAT.white, s * 0.85, h, 0.03, g, 24);
        cyl(0.22, 0.22, 0.008, MAT.steel, s * 0.85, h + 0.026, 0.03, g, 24);
        cyl(0.025, 0.025, 0.23, MAT.steel, s * 0.85, h + 0.04, -0.24, g, 10);
        box(0.24, 0.025, 0.035, MAT.steel, s * 0.85, h + 0.25, -0.15, g);
        box(1.1, 1.3, 0.07, MAT.brass, s * 0.85, h + 0.3, -d / 2 + 0.01, g);
        const mir = new Reflector(new THREE.PlaneGeometry(1.0, 1.2), {
          clipBias: 0.003,
          textureWidth: 512,
          textureHeight: 512,
          color: 0xffffff,
        });
        mir.position.set(s * 0.85, h + 0.95, -d / 2 + 0.07);
        mir.userData.noMerge = true;
        mir.castShadow = false;
        g.add(mir);
        parts.mirrors.push(mir);
      }
      cabDoor(g, parts, w / 2 - 0.07, h - 0.24, -w / 4, 0.08, d / 2 + 0.01, -1, MAT.white);
      cabDoor(g, parts, w / 2 - 0.07, h - 0.24, w / 4, 0.08, d / 2 + 0.01, 1, MAT.white);
      break;
    }
    case "bathtub": {
      box(w, 0.58, d, MAT.porcelain, 0, 0.08, 0, g);
      box(w - 0.24, 0.02, d - 0.24, MAT.water, 0, 0.59, 0, g);
      for (const s of [-1, 1]) box(w, 0.13, 0.12, MAT.porcelain, 0, 0.59, s * (d / 2 - 0.06), g);
      for (const s of [-1, 1]) box(0.12, 0.13, d, MAT.porcelain, s * (w / 2 - 0.06), 0.59, 0, g);
      cyl(0.026, 0.026, 0.43, MAT.brass, -w / 2 + 0.3, 0.68, -d / 2 + 0.22, g, 10);
      box(0.34, 0.03, 0.04, MAT.brass, -w / 2 + 0.3, 1.08, -d / 2 + 0.08, g);
      break;
    }
    case "toilet": {
      cyl(0.33, 0.31, 0.42, MAT.porcelain, 0, 0, 0.1, g, 24);
      cyl(0.34, 0.34, 0.09, MAT.white, 0, 0.43, 0.1, g, 24);
      box(0.66, 0.65, 0.24, MAT.porcelain, 0, 0.22, -0.38, g);
      box(0.7, 0.07, 0.28, MAT.white, 0, 0.87, -0.38, g);
      sphere(0.035, MAT.steel, 0.25, 0.72, -0.38, g, 8);
      break;
    }
    case "shower": {
      box(w, 0.08, d, MAT.marble, 0, 0, 0, g);
      for (const s of [-1, 1]) { box(0.035, h, 0.035, MAT.steel, s * (w / 2 - 0.02), 0.04, d / 2 - 0.02, g); box(w, h - 0.2, 0.012, MAT.glass, 0, 0.1, s * (d / 2 - 0.02), g); }
      cyl(0.025, 0.025, 1.85, MAT.steel, -w / 2 + 0.22, 0.1, -d / 2 + 0.2, g, 8);
      const head = cyl(0.17, 0.17, 0.035, MAT.steel, -w / 2 + 0.22, 1.95, -d / 2 + 0.2, g, 18); head.rotation.x = Math.PI / 2;
      break;
    }
    case "towelRack": {
      for (const y of [0.28, 0.8, 1.32]) box(w, 0.035, 0.035, MAT.steel, 0, y, 0, g);
      for (const s of [-1, 1]) box(0.035, h, 0.035, MAT.steel, s * w / 2, 0, 0, g);
      box(w * 0.74, 0.58, 0.04, MAT.cloth, 0, 0.7, 0.08, g);
      break;
    }
    case "hamper": {
      const basketMat = MAT.wicker.clone(); basketMat.side = THREE.DoubleSide;
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w * 0.42, h, 20, 1, true), basketMat);
      basket.position.y = h / 2; basket.castShadow = basket.receiveShadow = true; g.add(basket);
      cyl(w * 0.42, w * 0.42, 0.03, MAT.darkWood, 0, 0.01, 0, g, 20);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(w / 2, 0.03, 8, 24), MAT.oak);
      rim.rotation.x = Math.PI / 2; rim.position.y = h; g.add(rim);
      cushion(w * 0.57, 0.13, d * 0.38, MAT.cloth, 0, h * 0.55, 0, g, 0.025);
      break;
    }
    case "bathMat": {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M(0xcfdad6, { roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.01; m.receiveShadow = true; g.add(m); break;
    }
    case "servingCart": {
      for (const y of [0.3, 0.8]) box(w, 0.06, d, MAT.oak, 0, y, 0, g);
      legs(g, w, d, 0.9, MAT.brass, 0.08, 0.035);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wheel = cyl(0.1, 0.1, 0.035, MAT.iron, sx * (w / 2 - 0.08), 0.04, sz * (d / 2 - 0.08), g, 12); wheel.rotation.z = Math.PI / 2; }
      for (const x of [-0.25, 0, 0.25]) cyl(0.055, 0.055, 0.22, MAT.glass, x, 0.86, 0, g, 12);
      break;
    }
    case "arcade": {
      const shell = M(0x183047, { roughness: 0.38, metalness: 0.22 });
      const cyan = M(0x24c8d2, { emissive: 0x0b7a85, emissiveIntensity: 0.55, roughness: 0.28 });
      box(w, h, d, shell, 0, 0, 0, g);
      box(w + 0.04, 0.29, d + 0.035, MAT.black, 0, h - 0.29, 0, g);
      box(w - 0.11, 0.19, 0.013, cyan, 0, h - 0.24, d / 2 + 0.025, g);
      const cn = document.createElement("canvas"); cn.width = 192; cn.height = 160;
      const cx = cn.getContext("2d"); cx.fillStyle = "#07101e"; cx.fillRect(0, 0, 192, 160);
      cx.fillStyle = "#17334b"; for (let i = 0; i < 18; i++) cx.fillRect((i * 47) % 190, (i * 29) % 155, 2, 2);
      cx.fillStyle = "#30d8dc"; cx.font = "bold 18px monospace"; cx.textAlign = "center"; cx.fillText("MIDNIGHT", 96, 30); cx.fillText("ARCADE", 96, 54);
      cx.fillStyle = "#ef80b6"; cx.fillRect(60, 80, 72, 34); cx.fillStyle = "#ffe481"; cx.fillRect(77, 70, 38, 12); cx.fillStyle = "#101b34"; cx.fillRect(82, 89, 9, 9); cx.fillRect(102, 89, 9, 9);
      cx.fillStyle = "#8de6bb"; cx.font = "12px monospace"; cx.fillText("PRESS START", 96, 140);
      const tex = new THREE.CanvasTexture(cn); tex.colorSpace = THREE.SRGBColorSpace;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.16, 0.88), new THREE.MeshBasicMaterial({ map: tex })); screen.position.set(0, 1.12, d / 2 + 0.02); g.add(screen);
      box(w - 0.1, 0.11, 0.34, MAT.black, 0, 0.78, d / 2 + 0.11, g);
      cyl(0.025, 0.025, 0.13, MAT.steel, -0.2, 0.89, d / 2 + 0.16, g, 10); sphere(0.055, MAT.red, -0.2, 1.02, d / 2 + 0.16, g, 10);
      for (const x of [0.12, 0.27]) cyl(0.04, 0.04, 0.025, x > 0.2 ? MAT.gold : cyan, x, 0.9, d / 2 + 0.17, g, 12);
      box(w - 0.08, 0.05, 0.02, cyan, 0, 0.2, d / 2 + 0.015, g);
      parts.glow.push({ x: 0, y: 1.35, z: d / 2 + 0.03, s: 0.7 });
      break;
    }
    case "dartboard": {
      const rings = [MAT.black, MAT.red, MAT.cream, MAT.green, MAT.red];
      for (let i = 0; i < 5; i++) { const c = cyl(0.31 - i * 0.055, 0.31 - i * 0.055, 0.015, rings[i], 0, 0.75, 0.01 + i * 0.017, g, 32); c.rotation.x = Math.PI / 2; }
      break;
    }
    case "conferenceTable": {
      box(w, 0.11, d, MAT.darkWood, 0, h - 0.11, 0, g);
      box(w - 0.18, 0.006, d - 0.16, MAT.leather, 0, h, 0, g);
      for (const x of [-w / 2 + 0.7, w / 2 - 0.7]) box(0.55, h - 0.1, d * 0.7, MAT.oak, x, 0, 0, g);
      for (const x of [-1.5, -0.5, 0.5, 1.5]) { box(0.3, 0.003, 0.23, MAT.cream, x, h + 0.006, 0.18, g); cyl(0.035, 0.035, 0.08, MAT.brass, x, h, -0.34, g, 8); }
      break;
    }
    case "presentationBoard": {
      box(w, h, d, MAT.darkWood, 0, 0, 0, g);
      box(w - 0.12, h - 0.12, 0.025, MAT.green, 0, 0.06, d / 2 + 0.02, g);
      box(w - 0.1, 0.08, 0.2, MAT.oak, 0, 0.04, d / 2 + 0.11, g);
      for (let i = 0; i < 4; i++) box(0.44, 0.025, 0.016, MAT.cream, -w / 2 + 0.45 + i * 0.69, 1.5 - i * 0.24, d / 2 + 0.048, g);
      break;
    }
    case "credence": {
      cabinetShell(g, w, d, h - 0.05, MAT.darkWood, [0.38]);
      storageDressing(g, w, d, [0.38], "credence");
      box(w + 0.05, 0.05, d + 0.05, MAT.marble, 0, h - 0.05, 0, g);
      cabDoor(g, parts, w / 2 - 0.05, h - 0.17, -w / 4, 0.07, d / 2, -1);
      cabDoor(g, parts, w / 2 - 0.05, h - 0.17, w / 4, 0.07, d / 2, 1);
      break;
    }
    case "typewriter": {
      box(w, 0.16, d, MAT.black, 0, 0, 0, g);
      box(w - 0.1, 0.045, 0.18, MAT.steel, 0, 0.14, -d / 2 + 0.12, g);
      box(w - 0.18, 0.22, 0.018, MAT.cream, 0, 0.26, -d / 2 + 0.04, g);
      for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) cyl(0.017, 0.017, 0.012, MAT.cream, -0.24 + i * 0.06, 0.16, 0.01 + row * 0.065, g, 6);
      break;
    }
    default: return null;
  }
  return { group: g, parts };
}
