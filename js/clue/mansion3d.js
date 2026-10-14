// The mansion itself: floors, wallpapered walls with real door openings and
// moonlit windows, ceilings, hinged door leaves, furniture, fires, lights and
// the roof. Static shell geometry is merged per material for speed.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GRID, ROOMS, COLS, ROWS, CELL, WALL_H, roomAtWorld } from "./data.js";
import { FURNITURE, SOLIDS, POOL } from "./layout.js";
import { WALLS, DOOR_LIST, DOOR_W, DOOR_H, toWorld } from "./nav.js";
import { BALL_R } from "./physics.js";
import { floorTexture, wallTexture, plasterTexture, stoneWallTexture, herringboneTexture, runnerTexture, glowTexture, flameTexture, paintingTexture, windowRainTexture, doorPlaqueTexture } from "./textures.js";
import { buildFurniture, MAT, box, cyl } from "./furniture3d.js";
import { skullBallTexture } from './tasks3d.js';

const W = COLS * CELL, D = ROWS * CELL;
const INNER = 0.08, OUTER = 0.38;
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });

// Wall covering per region.
const WALLPAPER = {
  ".": ["damask", "#33403d"], K: ["tile", "#c9c2b0"], B: ["panel", "#6b4e3f"], C: ["tile", "#adc7c0"], D: ["damask", "#5a1c22"],
  X: ["brick", "#4a3e36"], I: ["stripe", "#193f4c"], L: ["panel", "#3a2416"], O: ["damask", "#4a1a26"], H: ["panel", "#514638"], S: ["stripe", "#5a4426"],
};

// Collects quads per material key, merged into one mesh each at the end.
class Batch {
  constructor() { this.g = new Map(); }
  get(key) { if (!this.g.has(key)) this.g.set(key, { pos: [], nor: [], uv: [], idx: [] }); return this.g.get(key); }
  quad(key, pts, n, uvs) {
    const b = this.get(key), base = b.pos.length / 3;
    for (let i = 0; i < 4; i++) { b.pos.push(...pts[i]); b.nor.push(...n); b.uv.push(...uvs[i]); }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Vertical face on the line p→q (world xz), facing n, from y0 to y1.
  wall(key, px, pz, qx, qz, y0, y1, nx, nz, uScale = 1 / 1.6) {
    const rx = nz, rz = -nx;
    if ((qx - px) * rx + (qz - pz) * rz < 0) [px, pz, qx, qz] = [qx, qz, px, pz];
    const u0 = (px * rx + pz * rz) * uScale, u1 = (qx * rx + qz * rz) * uScale;
    const v0 = y0 / WALL_H, v1 = y1 / WALL_H;
    this.quad(key, [[px, y0, pz], [qx, y0, qz], [qx, y1, qz], [px, y1, pz]], [nx, 0, nz], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
  // Horizontal rectangle at height y, facing up (+1) or down (-1).
  flat(key, x1, z1, x2, z2, y, up, s = 1 / 3) {
    const uv = [[x1 * s, -z1 * s], [x2 * s, -z1 * s], [x2 * s, -z2 * s], [x1 * s, -z2 * s]];
    if (up > 0) this.quad(key, [[x1, y, z2], [x2, y, z2], [x2, y, z1], [x1, y, z1]], [0, 1, 0], [uv[3], uv[2], uv[1], uv[0]]);
    else this.quad(key, [[x1, y, z1], [x2, y, z1], [x2, y, z2], [x1, y, z2]], [0, -1, 0], uv);
  }
  build(mats, root, opts = {}) {
    const out = {};
    for (const [key, b] of this.g) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats(key));
      mesh.castShadow = opts.cast?.(key) ?? true;
      mesh.receiveShadow = true;
      root.add(mesh);
      out[key] = mesh;
    }
    return out;
  }
}

function regionKey(x, z) {
  const c = Math.floor(x / CELL + COLS / 2), r = Math.floor(z / CELL + ROWS / 2);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
  return GRID[r][c];
}

// Fold the fixed pieces of each furnishing into a few meshes. Doors, drawers,
// burners and pendulums keep their own objects so their animations still work.
function mergeFixedFurniture(holder, parts) {
  const moving = new Set([...parts.cab.map((p) => p.obj), parts.burner, parts.pendulum].filter(Boolean));
  const groups = new Map(), inverse = holder.matrixWorld.clone().invert();
  const visit = (node, animated = false) => {
    animated ||= moving.has(node);
    if (node.isMesh && !animated && !node.userData.noMerge && !node.material?.transparent && !Array.isArray(node.material)) {
      const signature = Object.entries(node.geometry.attributes).map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}`).sort().join("|");
      const key = `${node.material.uuid}|${signature}|${node.castShadow}|${node.receiveShadow}`;
      const group = groups.get(key) || [];
      group.push(node); groups.set(key, group);
    }
    for (const child of node.children) visit(child, animated);
  };
  visit(holder);
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const copies = meshes.map((mesh) => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      return geometry;
    });
    const merged = mergeGeometries(copies, false);
    copies.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const combined = new THREE.Mesh(merged, meshes[0].material);
    combined.castShadow = meshes[0].castShadow;
    combined.receiveShadow = meshes[0].receiveShadow;
    for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    holder.add(combined);
  }
}

export function buildMansion(quality = {}) {
  const root = new THREE.Group();
  const batch = new Batch();
  const tall = SOLIDS.filter((s) => s.y2 > 1.3);
  const nearTall = (x, z, r = 0.9) => tall.some((s) => x > s.x1 - r && x < s.x2 + r && z > s.z1 - r && z < s.z2 + r);
  const front = FURNITURE.find((f) => f.type === "frontDoor");

  // ---------- floors + ceilings ----------
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = GRID[r][c], a = toWorld(c, r), b = toWorld(c + 1, r + 1);
    batch.flat(`floor|${ch}`, a.x, a.z, b.x, b.z, 0, 1, ch === "." ? 1 / 2.2 : 1 / 3.2);
    batch.flat("ceiling", a.x, a.z, b.x, b.z, WALL_H, -1, 1 / 4);
  }

  // ---------- walls ----------
  const windows = [];
  const bathVanity = FURNITURE.find((f) => f.id === "bath_vanity");
  let wi = 0;
  // Wall faces are offset from the collision line. At inside corners those
  // offsets can leave a visible slit unless the faces overlap at the join.
  // Only extend an end when a perpendicular wall meets it; doorway ends stay open.
  const joinPad = (w, x, z, horiz, off) => {
    let pad = 0;
    for (const other of WALLS) {
      if (other === w) continue;
      const otherHoriz = Math.abs(other.z1 - other.z2) < 1e-4;
      if (otherHoriz === horiz) continue;
      const touches = horiz
        ? Math.abs(other.x1 - x) < 1e-4 && z >= other.z1 - 1e-4 && z <= other.z2 + 1e-4
        : Math.abs(other.z1 - z) < 1e-4 && x >= other.x1 - 1e-4 && x <= other.x2 + 1e-4;
      if (touches) pad = Math.max(pad, off, other.outer ? OUTER : INNER);
    }
    return pad ? pad + 0.025 : 0;
  };
  for (const w of WALLS) {
    const horiz = Math.abs(w.z1 - w.z2) < 1e-4;
    const len = horiz ? w.x2 - w.x1 : w.z2 - w.z1;
    const mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
    for (const s of [-1, 1]) {
      const nx = horiz ? 0 : s, nz = horiz ? s : 0;
      const reg = regionKey(mx + nx * 0.5, mz + nz * 0.5);
      const off = reg ? INNER : OUTER;
      const key = reg ? `wall|${reg}` : "exterior";
      const aPad = joinPad(w, w.x1, w.z1, horiz, off), bPad = joinPad(w, w.x2, w.z2, horiz, off);
      const px = w.x1 - (horiz ? aPad : 0) + nx * off, pz = w.z1 - (horiz ? 0 : aPad) + nz * off;
      const qx = w.x2 + (horiz ? bPad : 0) + nx * off, qz = w.z2 + (horiz ? 0 : bPad) + nz * off;
      // Outer walls get a window in every other square (not behind tall furniture).
      let win = false;
      if (w.outer && !w.jamb && len > 2) {
        const inSide = reg ? s : -s;
        const ix = mx + (horiz ? 0 : inSide) * 0.6, iz = mz + (horiz ? inSide : 0) * 0.6;
        const idx = Math.round((horiz ? mx : mz) / CELL - 0.5);
        const behindMirror = regionKey(ix, iz) === "C" && bathVanity &&
          Math.abs(mx - bathVanity.x) < bathVanity.w / 2 + 0.6 &&
          Math.abs(mz - bathVanity.z) < 1.2;
        win = Math.abs(idx) % 2 === 1 && !behindMirror && !nearTall(ix, iz) && !(front && Math.hypot(front.x - mx, front.z - mz) < 3);
        if (win && s === 1) windows.push({ x: mx, z: mz, horiz, inSide, reg: regionKey(ix, iz) });
      }
      if (!win) { batch.wall(key, px, pz, qx, qz, 0, WALL_H, nx, nz, reg ? 1 / 1.6 : 1 / 4); continue; }
      const ww = 1.15, sill = 0.85, head = 2.85;
      const ex = horiz ? 1 : 0, ez = horiz ? 0 : 1;
      const ax = mx - ex * ww / 2 + nx * off, az = mz - ez * ww / 2 + nz * off;
      const bx = mx + ex * ww / 2 + nx * off, bz = mz + ez * ww / 2 + nz * off;
      const us = reg ? 1 / 1.6 : 1 / 4;
      batch.wall(key, px, pz, ax, az, 0, WALL_H, nx, nz, us);
      batch.wall(key, bx, bz, qx, qz, 0, WALL_H, nx, nz, us);
      batch.wall(key, ax, az, bx, bz, 0, sill, nx, nz, us);
      batch.wall(key, ax, az, bx, bz, head, WALL_H, nx, nz, us);
    }
  }
  // Window reveals, glass, frames, curtains.
  const rainGlass = new THREE.MeshPhysicalMaterial({ color: 0xc2d9f1, map: windowRainTexture(), roughness: 0.12, metalness: 0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  for (const win of windows) {
    const { x, z, horiz, inSide } = win;
    const ex = horiz ? 1 : 0, ez = horiz ? 0 : 1, nx = horiz ? 0 : inSide, nz = horiz ? inSide : 0;
    const ww = 1.15, sill = 0.85, head = 2.85;
    const i0 = INNER, o0 = OUTER;
    const at = (along, depth) => [x + ex * along + nx * depth, z + ez * along + nz * depth];
    // Side reveals.
    for (const sgn of [-1, 1]) {
      const [ax, az] = at(sgn * ww / 2, i0), [bx, bz] = at(sgn * ww / 2, -o0);
      batch.wall("reveal", ax, az, bx, bz, sill, head, -ex * sgn, -ez * sgn, 1 / 1.2);
    }
    const [sx1, sz1] = at(-ww / 2, i0 + 0.06), [sx2, sz2] = at(ww / 2, -o0);
    batch.flat("sill", Math.min(sx1, sx2), Math.min(sz1, sz2), Math.max(sx1, sx2), Math.max(sz1, sz2), sill, 1, 1);
    batch.flat("reveal", Math.min(sx1, sx2), Math.min(sz1, sz2), Math.max(sx1, sx2), Math.max(sz1, sz2), head, -1, 1);
    const g = new THREE.Group();
    g.position.set(x - nx * 0.12, 0, z - nz * 0.12);
    g.rotation.y = horiz ? (inSide > 0 ? 0 : Math.PI) : (inSide > 0 ? Math.PI / 2 : -Math.PI / 2);
    // Local frame: x along wall, +z into the room.
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, head - sill), rainGlass);
    glass.position.set(0, (sill + head) / 2, 0); glass.userData.noFow = true; g.add(glass);
    const frame = MAT.darkWood;
    box(ww, 0.06, 0.08, frame, 0, sill, 0, g); box(ww, 0.06, 0.08, frame, 0, head - 0.06, 0, g);
    box(0.05, head - sill, 0.06, frame, 0, sill, 0, g);
    for (const y of [sill + 0.65, sill + 1.3]) box(ww, 0.035, 0.05, frame, 0, y, 0, g);
    for (const s of [-1, 1]) box(0.06, head - sill, 0.08, frame, s * (ww / 2 - 0.03), sill, 0, g);
    // Curtains.
    const curtain = MAT.velvet;
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, WALL_H - 0.4, 8, 1, false, 0, Math.PI), curtain);
      c.position.set(s * (ww / 2 + 0.12), (WALL_H - 0.4) / 2 + 0.05, 0.12 + 0.1); c.rotation.y = Math.PI; c.scale.z = 0.5; c.castShadow = true; g.add(c);
    }
    box(ww + 0.9, 0.04, 0.04, MAT.brass, 0, WALL_H - 0.33, 0.24, g);
    root.add(g);
    g.updateMatrixWorld(true);
    mergeFixedFurniture(g, { cab: [] });
  }

  // ---------- door openings: lintels, casings, leaves ----------
  const doors = [];
  for (const d of DOOR_LIST) {
    const { mid, e, n } = d;
    for (const s of [-1, 1]) {
      const nx = n.x * s, nz = n.z * s;
      const reg = regionKey(mid.x + nx * 0.5, mid.z + nz * 0.5) || ".";
      const ax = mid.x - e.x * DOOR_W / 2 + nx * INNER, az = mid.z - e.z * DOOR_W / 2 + nz * INNER;
      const bx = mid.x + e.x * DOOR_W / 2 + nx * INNER, bz = mid.z + e.z * DOOR_W / 2 + nz * INNER;
      batch.wall(`wall|${reg}`, ax, az, bx, bz, DOOR_H, WALL_H, nx, nz);
    }
    const g = new THREE.Group();
    g.position.set(mid.x, 0, mid.z);
    g.rotation.y = Math.atan2(n.x, n.z); // local +z = n (into the room), local x = along the wall
    const cas = MAT.darkWood;
    for (const s of [-1, 1]) {
      box(0.12, DOOR_H + 0.06, INNER * 2 + 0.06, cas, s * (DOOR_W / 2 + 0.05), 0, 0, g);
      box(0.18, 0.2, INNER * 2 + 0.08, cas, s * (DOOR_W / 2 + 0.05), 0, 0, g); // plinth blocks
    }
    box(DOOR_W + 0.34, 0.14, INNER * 2 + 0.08, cas, 0, DOOR_H, 0, g);
    box(DOOR_W + 0.44, 0.05, INNER * 2 + 0.12, cas, 0, DOOR_H + 0.14, 0, g);
    box(DOOR_W, 0.02, INNER * 2, MAT.darkWood, 0, 0, 0, g); // threshold
    root.add(g);
    // The leaf, hinged at d.hinge.
    const pivot = new THREE.Group();
    pivot.position.set(d.hinge.x, 0, d.hinge.z);
    const leaf = new THREE.Group();
    box(DOOR_W - 0.03, DOOR_H - 0.03, 0.05, MAT.darkWood, DOOR_W / 2, 0.01, 0, leaf);
    for (const sz of [-1, 1]) {
      for (const [y, h] of [[0.15, 0.85], [1.15, 1.1]]) for (const x of [0.33, 0.97]) box(0.46, h, 0.012, MAT.wood, x, y, sz * 0.03, leaf);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), MAT.brass); knob.position.set(DOOR_W - 0.1, 1.0, sz * 0.06); leaf.add(knob);
      box(0.05, 0.18, 0.01, MAT.brass, DOOR_W - 0.1, 0.92, sz * 0.032, leaf);
    }
    // The door's local +z points to one wall side. Mount the name only on
    // the opposite side from the room, so it reads from the hallway.
    const hallSide = -(n.z * e.x - n.x * e.z);
    box(1.02, 0.25, 0.025, MAT.brass, DOOR_W / 2, 1.715, hallSide * 0.056, leaf);
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96, 0.19),
      new THREE.MeshStandardMaterial({ map: doorPlaqueTexture(ROOMS[GRID[d.cells[0][1]][d.cells[0][0]]].name), roughness: 0.5, metalness: 0.15, emissive: 0x35250e, emissiveIntensity: 0.12 }),
    );
    plaque.position.set(DOOR_W / 2, 1.84, hallSide * 0.071);
    plaque.rotation.y = hallSide < 0 ? Math.PI : 0;
    leaf.add(plaque);
    pivot.add(leaf);
    root.add(pivot);
    g.updateMatrixWorld(true);
    pivot.updateMatrixWorld(true);
    mergeFixedFurniture(g, { cab: [] });
    mergeFixedFurniture(leaf, { cab: [] });
    doors.push({ d, pivot, open: -1 });
  }

  // ---------- quoins / foundation / cornice ----------
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.95, WALL_H + 0.9, 0.95, M(0x4a4640, { roughness: 0.95 }), sx * (W / 2), -0.45, sz * (D / 2), root);
  const plinth = M(0x3a3632, { roughness: 1 });
  box(W + 0.9, 0.75, 0.25, plinth, 0, -0.45, -D / 2 - OUTER - 0.1, root); box(W + 0.9, 0.75, 0.25, plinth, 0, -0.45, D / 2 + OUTER + 0.1, root);
  box(0.25, 0.75, D + 0.9, plinth, -W / 2 - OUTER - 0.1, -0.45, 0, root); box(0.25, 0.75, D + 0.9, plinth, W / 2 + OUTER + 0.1, -0.45, 0, root);
  const cornice = M(0x55504a, { roughness: 0.9 });
  box(W + 1.4, 0.35, D + 1.4, cornice, 0, WALL_H + 0.01, 0, root).castShadow = false;
  // Porch steps at the front door.
  if (front) for (let i = 0; i < 3; i++) box(4.2 - i * 0.4, 0.15, 0.45 + (2 - i) * 0.42, M(0x6a655d, { roughness: 1 }), front.x, -0.45 + i * 0.15, D / 2 + OUTER + 0.25 + (2 - i) * 0.21, root);

  if (front) {
    const outDoor = buildFurniture({ type: "frontDoor", w: 2.2, h: 2.8, d: 0.2 });
    outDoor.group.position.set(front.x, 0, D / 2 + OUTER + 0.06); outDoor.group.rotation.y = Math.PI;
    root.add(outDoor.group);
    for (const s of [-1, 1]) { cyl(0.18, 0.2, 3.2, MAT.stone, front.x + s * 1.6, -0.45, D / 2 + OUTER + 1.2, root, 12); }
    box(4, 0.25, 1.6, MAT.stone, front.x, 2.75, D / 2 + OUTER + 0.7, root);
    const lamp = new THREE.PointLight(0xffa850, 4, 12, 2); lamp.position.set(front.x + 1.4, 2.4, D / 2 + OUTER + 0.4); root.add(lamp);
  }

  // ---------- roof (outside only) ----------
  const roof = new THREE.Group();
  const slate = M(0x25252b, { roughness: 0.7, metalness: 0.1 });
  const hip = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1, true), slate);
  hip.rotation.y = Math.PI / 4; hip.scale.set((W + 2) * 0.72, 9, (D + 2) * 0.72); hip.position.y = WALL_H + 0.35 + 4.5;
  roof.add(hip);
  for (const f of FURNITURE.filter((f) => f.fire)) { box(1.4, 6.5, 0.9, M(0x3a2a24, { roughness: 1 }), f.x, WALL_H + 0.3, f.z, roof); box(1.6, 0.25, 1.1, M(0x2a2420), f.x, WALL_H + 6.8, f.z, roof); }
  // A turret over the bathroom corner.
  const tur = cyl(2.2, 2.2, 7, M(0x3c3934, { roughness: 1 }), W / 2 - 2.2, WALL_H, -D / 2 + 2.2, roof, 18);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.7, 6, 18), slate); spire.position.set(W / 2 - 2.2, WALL_H + 10, -D / 2 + 2.2); roof.add(spire);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const wm = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.2), new THREE.MeshBasicMaterial({ color: i % 3 ? 0x101418 : 0xffb050 })); wm.position.set(W / 2 - 2.2 + Math.cos(a) * 2.22, WALL_H + 4.5, -D / 2 + 2.2 + Math.sin(a) * 2.22); wm.rotation.y = -a + Math.PI / 2; roof.add(wm); }
  roof.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  root.add(roof);

  // ---------- materials for merged shell ----------
  const mats = new Map();
  const matFor = (key) => {
    if (mats.has(key)) return mats.get(key);
    let m;
    const [kind, ch] = key.split("|");
    if (kind === "floor") {
      const room = ROOMS[ch];
      if (ch === ".") m = M(0xffffff, { map: herringboneTexture("#5a3b22"), roughness: 0.32 });
      else m = M(0xffffff, { map: floorTexture(room.floor, room.tint), roughness: room.floor === "marble" || room.floor === "checker" ? 0.18 : room.floor === "parquet" ? 0.28 : room.floor === "carpet" ? 1 : 0.42 });
      m.userData.floorSheen = ch === "." || room?.floor !== "carpet";
    } else if (kind === "wall") { const [style, base] = WALLPAPER[ch] || WALLPAPER["."]; m = M(0xffffff, { map: wallTexture(style, base), roughness: style === "panel" ? 0.55 : 0.85 }); }
    else if (kind === "ceiling") m = M(0x8f877a, { map: plasterTexture(), roughness: 1 });
    else if (kind === "exterior") m = M(0xffffff, { map: stoneWallTexture(), roughness: 0.95 });
    else if (kind === "reveal") m = M(0x8a8478, { map: plasterTexture(), roughness: 1 });
    else if (kind === "sill") m = MAT.marble;
    m.side = kind === "ceiling" ? THREE.FrontSide : THREE.FrontSide;
    m.shadowSide = THREE.DoubleSide;
    mats.set(key, m);
    return m;
  };
  const shell = batch.build(matFor, root);
  const ceilings = [shell.ceiling].filter(Boolean);

  // ---------- hallway runners ----------
  const runner = M(0xffffff, { map: runnerTexture(), roughness: 1 });
  for (const [u1, v1, u2, v2] of [[0.6, 7.2, 23.4, 7.8], [8.6, 15.2, 16.4, 15.8], [16.2, 7.8, 16.8, 18.6], [8.6, 7.8, 9.2, 15.2], [7.2, 15.8, 7.8, 24.4], [16.2, 20.2, 23.4, 20.8]]) {
    const a = toWorld(u1, v1), b = toWorld(u2, v2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(b.x - a.x), Math.abs(b.z - a.z)), runner.clone());
    const along = Math.abs(b.z - a.z) > Math.abs(b.x - a.x);
    m.material.map = runner.map.clone(); m.material.map.needsUpdate = true; m.material.map.wrapT = THREE.RepeatWrapping;
    m.material.map.repeat.set(1, (along ? Math.abs(b.z - a.z) : Math.abs(b.x - a.x)) / 2.2);
    if (!along) { m.material.map.rotation = Math.PI / 2; m.material.map.center.set(0.5, 0.5); m.material.map.repeat.set(1, Math.abs(b.x - a.x) / 2.2); }
    m.rotation.x = -Math.PI / 2; m.position.set((a.x + b.x) / 2, 0.006, (a.z + b.z) / 2); m.receiveShadow = true;
    root.add(m);
  }

  // ---------- furniture ----------
  const cabs = {}, fires = {}, glows = [], pendulums = [], pushHolders = {}, mirrors = [];
  let burner = null;
  for (const f of FURNITURE) {
    const built = buildFurniture(f);
    if (!built) continue;
    const holder = new THREE.Group();
    holder.add(built.group);
    holder.position.set(f.x, f.y || 0, f.z);
    holder.rotation.y = f.rot || 0;
    root.add(holder);
    if (f.push) pushHolders[f.id] = holder;
    holder.updateMatrixWorld(true);
    const P = built.parts;
    if (f.cab && P.cab.length) cabs[f.id] = { parts: P.cab, t: 0 };
    if (P.fire) { const p = new THREE.Vector3(); P.fire.getWorldPosition(p); fires[f.fire] = { pos: p, room: f.room }; }
    if (P.burner) burner = P.burner;
    if (P.pendulum) pendulums.push(P.pendulum);
    mirrors.push(...P.mirrors);
    for (const gl of P.glow) { const p = built.group.localToWorld(new THREE.Vector3(gl.x, gl.y, gl.z)); glows.push({ x: p.x, y: p.y, z: p.z, s: gl.s, room: f.room }); }
    mergeFixedFurniture(holder, P);
  }

  // ---------- paintings ----------
  const paintMats = [0, 1, 2, 3].map((i) => M(0xffffff, { map: paintingTexture(i), roughness: 0.55 }));
  let pi = 0;
  for (const w of WALLS) {
    if (w.jamb) continue;
    const horiz = Math.abs(w.z1 - w.z2) < 1e-4;
    const mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
    for (const s of [-1, 1]) {
      const nx = horiz ? 0 : s, nz = horiz ? s : 0;
      const reg = regionKey(mx + nx * 0.5, mz + nz * 0.5);
      if (!reg || reg === "K" || reg === "X") continue;
      const every = reg === "B" ? 2 : reg === "C" ? 9 : 5;
      if ((++pi) % every) continue;
      if (nearTall(mx + nx * 0.4, mz + nz * 0.4, 0.4) || DOOR_LIST.some((d) => Math.hypot(d.mid.x - mx, d.mid.z - mz) < 2.3) || windows.some((v) => Math.hypot(v.x - mx, v.z - mz) < 1.8)) continue;
      const g = new THREE.Group();
      g.position.set(mx + nx * (INNER + 0.03), 1.85, mz + nz * (INNER + 0.03));
      g.rotation.y = Math.atan2(nx, nz);
      const pw = 0.8 + (pi % 3) * 0.2, ph = 1.0 + (pi % 2) * 0.2;
      box(pw + 0.14, ph + 0.14, 0.05, MAT.gold, 0, -(ph + 0.14) / 2, 0, g);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), paintMats[pi % 4]); pic.position.z = 0.03; g.add(pic);
      g.rotation.z = (Math.random() - 0.5) * 0.04;
      root.add(g);
    }
  }

  // ---------- lights ----------
  const lights = [];
  const regions = {};
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) (regions[GRID[r][c]] ||= []).push([c, r]);
  const addLight = (x, y, z, color, intensity, room, dist = 16) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    l.userData = { base: intensity, room, phase: Math.random() * 10 };
    root.add(l);
    lights.push(l);
    return l;
  };
  for (const [ch, cells] of Object.entries(regions)) {
    if (ch === ".") continue;
    const room = ROOMS[ch];
    const chand = FURNITURE.filter((f) => f.room === room.id && (f.type === "chandelier" || f.type === "poolLamp"));
    const area = cells.length * CELL * CELL;
    const pts = chand.length ? chand.map((f) => ({ x: f.x, z: f.z })) : [cells.reduce((a, [c, r]) => { const p = toWorld(c + 0.5, r + 0.5); a.x += p.x / cells.length; a.z += p.z / cells.length; return a; }, { x: 0, z: 0 })];
    const each = (room.id === "cellar" ? 10 : 9 + area * 0.08) / pts.length;
    for (const p of pts) {
      addLight(p.x, WALL_H - 0.9, p.z, room.light, each, room.id, 22);
      if (!chand.length) glows.push({ x: p.x, y: WALL_H - 0.5, z: p.z, s: 1.2, room: room.id, pendant: true });
    }
  }
  // Hallway lanterns.
  const hall = regions["."].map(([c, r]) => toWorld(c + 0.5, r + 0.5));
  const picks = [hall[0]];
  while (picks.length < 7) { let best = null, bd = -1; for (const p of hall) { const d = Math.min(...picks.map((q) => Math.hypot(p.x - q.x, p.z - q.z))); if (d > bd) { bd = d; best = p; } } picks.push(best); }
  for (const p of picks) { addLight(p.x, WALL_H - 0.7, p.z, 0xffc98a, 5, "hallway", 14); glows.push({ x: p.x, y: WALL_H - 0.6, z: p.z, s: 0.9, room: "hallway", pendant: true }); }
  // Hanging lanterns / pendants for rooms without a chandelier.
  const lanternMat = M(0x1a1612, { metalness: 0.6, roughness: 0.4 });
  for (const gl of glows.filter((g) => g.pendant)) {
    const g = new THREE.Group();
    cyl(0.01, 0.01, WALL_H - gl.y - 0.15, MAT.iron, 0, 0.15, 0, g, 4);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 6, 1, true), lanternMat); cage.material.side = THREE.DoubleSide; g.add(cage);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), MAT.glow); g.add(bulb);
    g.position.set(gl.x, gl.y, gl.z);
    root.add(g);
  }
  // Fires.
  const flameTex = flameTexture();
  for (const [id, f] of Object.entries(fires)) {
    f.light = new THREE.PointLight(0xff7a2a, 0, 10, 2);
    f.light.position.set(f.pos.x, f.pos.y + 0.45, f.pos.z);
    root.add(f.light);
    f.flames = [];
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.position.set(f.pos.x + (Math.random() - 0.5) * 0.25, f.pos.y + 0.15, f.pos.z + (Math.random() - 0.5) * 0.25);
      sp.userData = { base: sp.position.clone(), ph: Math.random() * 10, s: 0.35 + Math.random() * 0.25 };
      sp.visible = false;
      root.add(sp);
      f.flames.push(sp);
    }
    f.lit = false;
  }
  // Stove light.
  const stove = FURNITURE.find((f) => f.stove);
  const stoveLight = new THREE.PointLight(0x5a8cff, 0, 3, 2);
  if (stove) { stoveLight.position.set(stove.x + Math.sin(stove.rot) * 0.2, 1.15, stove.z + Math.cos(stove.rot) * 0.2); root.add(stoveLight); }

  // Glow sprites (fake bloom around light sources).
  const glowTex = glowTexture();
  const glowSprites = glows.map((gl) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc888, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    sp.position.set(gl.x, gl.y, gl.z); sp.scale.setScalar(gl.s); sp.userData = gl;
    root.add(sp);
    return sp;
  });

  // ---------- pool balls ----------
  const BALL_COLORS = [0xffffff];
  const ballGeo = new THREE.SphereGeometry(BALL_R, 14, 10);
  const balls = BALL_COLORS.map((c) => { const m = new THREE.Mesh(ballGeo, M(c, { map: skullBallTexture(), roughness: 0.25 })); m.castShadow = true; m.position.set(POOL.x, POOL.y + BALL_R, POOL.z); root.add(m); return m; });

  // ---------- global lights ----------
  const hemi = new THREE.HemisphereLight(0x5a6a8a, 0x1a120c, 0.35);
  root.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb4ff, 1.6);
  moon.position.set(-30, 28, 22);
  moon.target.position.set(0, 0, 0);
  root.add(moon.target);
  moon.castShadow = !!quality.moonShadow;
  const sm = quality.shadowMap || 2048;
  moon.shadow.mapSize.set(sm, sm);
  const sc = moon.shadow.camera;
  sc.left = -W / 2 - 4; sc.right = W / 2 + 4; sc.top = D / 2 + 4; sc.bottom = -D / 2 - 4; sc.near = 1; sc.far = 120;
  moon.shadow.bias = -0.0015; moon.shadow.normalBias = 0.05;
  root.add(moon);
  // Moving key light: casts soft shadows in whichever room the viewer is in.
  const key = new THREE.SpotLight(0xffd9a8, 0, 18, 1.25, 0.9, 2);
  key.castShadow = (quality.keyShadow ?? 1024) > 0;
  key.shadow.mapSize.set(Math.max(1, quality.keyShadow ?? 1024), Math.max(1, quality.keyShadow ?? 1024));
  key.shadow.bias = -0.0008; key.shadow.normalBias = 0.03;
  key.shadow.camera.near = 0.3; key.shadow.camera.far = 18;
  root.add(key); root.add(key.target);

  return { root, ceilings, roof, doors, cabs, pushHolders, fires, burner, stoveLight, balls, lights, glowSprites, pendulums, moon, hemi, key, windows, mirrors };
}
