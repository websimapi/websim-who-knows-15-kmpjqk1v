// The tunnels under the house: rough stone corridors, a low vaulted ceiling,
// ladders up to the trapdoors, iron sconces and pools of black water. Also
// the trapdoors in the four corner rooms upstairs. Lit only by torches.
import * as THREE from "three";
import { COLS, ROWS, CELL, DROW, DH, WATER, regionAt, underground } from "./data.js";
import { WALLS, HATCH_POS, toWorld } from "./nav.js";
import { SCONCES } from "./data.js";
import { sconcePos } from "./tunnels.js";
import { floorTexture, stoneWallTexture } from "./textures.js";
import { MAT, box, cyl } from "./furniture3d.js";

export const TUN_H = 2.7;
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, envMapIntensity: 0, ...o });

function merged(pos, nor, uv, idx, mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}
class Quads {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  add(pts, n, uvs) { const b = this.pos.length / 3; for (let i = 0; i < 4; i++) { this.pos.push(...pts[i]); this.nor.push(...n); this.uv.push(...uvs[i]); } this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  mesh(mat) { return merged(this.pos, this.nor, this.uv, this.idx, mat); }
}

export function buildDungeon() {
  const root = new THREE.Group();
  const floor = new Quads(), ceil = new Quads(), wall = new Quads();
  for (let r = DROW; r < DROW + DH; r++) for (let c = 0; c < COLS; c++) {
    if (!regionAt(c, r)) continue;
    const a = toWorld(c, r), b = toWorld(c + 1, r + 1), s = 1 / 2.2;
    floor.add([[a.x, 0, b.z], [b.x, 0, b.z], [b.x, 0, a.z], [a.x, 0, a.z]], [0, 1, 0], [[a.x * s, -b.z * s], [b.x * s, -b.z * s], [b.x * s, -a.z * s], [a.x * s, -a.z * s]]);
    ceil.add([[a.x, TUN_H, a.z], [b.x, TUN_H, a.z], [b.x, TUN_H, b.z], [a.x, TUN_H, b.z]], [0, -1, 0], [[a.x * s, a.z * s], [b.x * s, a.z * s], [b.x * s, b.z * s], [a.x * s, b.z * s]]);
  }
  const zMin = toWorld(0, DROW).z - 0.1;
  for (const w of WALLS) {
    if (w.z1 < zMin) continue;
    const horiz = Math.abs(w.z1 - w.z2) < 1e-4;
    const mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
    // Face toward the open side.
    let nx = 0, nz = 0;
    const open = (x, z) => !!regionAt(Math.floor(x / CELL + COLS / 2), Math.floor(z / CELL + ROWS / 2));
    if (horiz) nz = open(mx, mz + 0.2) ? 1 : -1; else nx = open(mx + 0.2, mz) ? 1 : -1;
    const u0 = (horiz ? w.x1 : w.z1) / 1.8, u1 = (horiz ? w.x2 : w.z2) / 1.8, v1 = TUN_H / 1.8;
    const p = [[w.x1, 0, w.z1], [w.x2, 0, w.z2], [w.x2, TUN_H, w.z2], [w.x1, TUN_H, w.z1]];
    const flip = horiz ? nz < 0 : nx > 0;
    if (flip) wall.add([p[1], p[0], p[3], p[2]], [nx, 0, nz], [[u1, 0], [u0, 0], [u0, v1], [u1, v1]]);
    else wall.add(p, [nx, 0, nz], [[u0, 0], [u1, 0], [u1, v1], [u0, v1]]);
  }
  const stone = stoneWallTexture().clone(); stone.needsUpdate = true;
  root.add(floor.mesh(M(0x8a8278, { map: floorTexture("slate", "#3b3530") })));
  root.add(ceil.mesh(M(0x4a4440, { map: stone })));
  root.add(wall.mesh(M(0xa09a90, { map: stone })));

  // Wooden ladders up to each trapdoor, with a crack of light around the hatch above.
  const wood = M(0x5a3a22, { roughness: 0.8 });
  for (const h of Object.values(HATCH_POS)) {
    const g = new THREE.Group();
    for (const sx of [-0.24, 0.24]) box(0.06, TUN_H, 0.06, wood, sx, 0, 0, g);
    for (let y = 0.3; y < TUN_H; y += 0.34) box(0.48, 0.04, 0.05, wood, 0, y, 0, g);
    const hatch = box(0.9, 0.04, 0.9, M(0x2a1a10), 0, TUN_H - 0.05, 0, g);
    hatch.castShadow = false;
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ color: 0x6a5530, transparent: true, opacity: 0.55 }));
    crack.rotation.x = Math.PI / 2; crack.position.y = TUN_H - 0.01; g.add(crack);
    g.position.set(h.bx, 0, h.bz);
    root.add(g);
  }
  // Iron sconces where the torches hang.
  for (const s of SCONCES) {
    const p = sconcePos(s);
    const g = new THREE.Group();
    box(0.12, 0.2, 0.05, MAT.iron, 0, -0.1, 0, g);
    const arm = box(0.04, 0.04, 0.2, MAT.iron, 0, -0.04, 0.1, g);
    arm.castShadow = false;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), MAT.iron); ring.rotation.x = Math.PI / 2; ring.position.set(0, -0.02, 0.17); g.add(ring);
    g.position.set(p.x - Math.sin(p.yaw) * 0.16, p.y - 0.25, p.z - Math.cos(p.yaw) * 0.16);
    g.rotation.y = p.yaw;
    root.add(g);
  }
  // Pools of black water.
  const waterMat = M(0x0c1a1e, { roughness: 0.04, metalness: 0.4, envMapIntensity: 0 });
  for (const w of WATER) {
    if (!underground(w.z)) continue;
    const m = new THREE.Mesh(new THREE.CircleGeometry(w.r, 28), waterMat);
    m.rotation.x = -Math.PI / 2; m.position.set(w.x, 0.02, w.z); m.scale.set(1, 0.8 + (w.r % 0.3), 1);
    m.receiveShadow = true;
    root.add(m);
    const rim = new THREE.Mesh(new THREE.RingGeometry(w.r * 0.98, w.r * 1.12, 28), M(0x2a2622, { roughness: 1 }));
    rim.rotation.x = -Math.PI / 2; rim.position.set(w.x, 0.015, w.z); rim.scale.copy(m.scale);
    root.add(rim);
  }
  // Odds and ends: bones and old barrels in the crypt.
  const bone = MAT.bone;
  const crypt = toWorld(9, DROW + 5);
  for (let i = 0; i < 6; i++) { const b = cyl(0.025, 0.025, 0.35, bone, crypt.x + 1 + Math.random() * 10, 0.02, crypt.z + 0.4 + Math.random() * 0.6, root, 6); b.rotation.z = Math.PI / 2; b.rotation.y = Math.random() * 3; }
  for (const [dx, dz] of [[0.6, 7.9], [12.6, 0.6], [12.6, 7.9]]) cyl(0.32, 0.3, 0.85, M(0x4a3020), crypt.x + dx, 0, crypt.z + dz, root, 12);
  return { root };
}

// Trapdoors set into the floors of the four corner rooms.
export function buildTrapdoors() {
  const root = new THREE.Group();
  const wood = M(0x3a2414, { roughness: 0.7, envMapIntensity: 0.1 });
  for (const h of Object.values(HATCH_POS)) {
    const g = new THREE.Group();
    box(1.0, 0.03, 1.0, M(0x1a120c), 0, 0, 0, g);
    for (let i = -2; i <= 2; i++) box(0.18, 0.035, 0.92, wood, i * 0.19, 0.005, 0, g);
    for (const z of [-0.3, 0.3]) box(0.95, 0.04, 0.06, MAT.iron, 0, 0.01, z, g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14), MAT.brass); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.05, 0.38); g.add(ring);
    g.position.set(h.tx, 0, h.tz);
    root.add(g);
  }
  return { root };
}
