// Pure navigation + collision: wall segments from the grid, real doorways
// (jambs + swinging leaves), furniture boxes, a fine-grid A* and 2D
// line-of-sight. All world metres.
import { GRID, DOORS, HATCHES, DROW, DH, COLS, ROWS, CELL, ROOMS, regionAt, worldToCell, cellToWorld, roomAtWorld } from "./data.js";
import { SOLIDS, ROOM_BOUNDS } from "./layout.js";

export const toWorld = (u, v) => ({ x: (u - COLS / 2) * CELL, z: (v - ROWS / 2) * CELL });
const key = (c, r) => r * COLS + c;
const doorEdge = new Map();
DOORS.forEach(([c1, r1, c2, r2], i) => { doorEdge.set(`${c1},${r1}|${c2},${r2}`, i); doorEdge.set(`${c2},${r2}|${c1},${r1}`, i); });
export const doorBetween = (c1, r1, c2, r2) => doorEdge.get(`${c1},${r1}|${c2},${r2}`);
export function canStep(c1, r1, c2, r2) {
  const a = regionAt(c1, r1), b = regionAt(c2, r2);
  if (!a || !b) return false;
  return a === b || doorBetween(c1, r1, c2, r2) !== undefined;
}

// ---------- doors ----------
export const DOOR_W = 1.3;          // clear opening
export const DOOR_H = 2.45;
export const DOOR_SWING = 1.66;     // ~95°
export const DOOR_LIST = DOORS.map(([c1, r1, c2, r2], i) => {
  const vertEdge = r1 === r2; // neighbours left/right -> edge is vertical (runs along z)
  let a, b;
  if (vertEdge) { const u = Math.max(c1, c2); a = toWorld(u, r1); b = toWorld(u, r1 + 1); }
  else { const v = Math.max(r1, r2); a = toWorld(c1, v); b = toWorld(c1 + 1, v); }
  const room = cellToWorld(c1, r1), mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const e = vertEdge ? { x: 0, z: 1 } : { x: 1, z: 0 };
  const n = vertEdge ? { x: Math.sign(room.x - mid.x), z: 0 } : { x: 0, z: Math.sign(room.z - mid.z) };
  const hinge = { x: mid.x - e.x * DOOR_W / 2, z: mid.z - e.z * DOOR_W / 2 };
  const roomId = ROOMS[GRID[r1][c1]].id;
  return { id: i, a, b, mid, e, n, hinge, vertEdge, room: roomId, cells: [[c1, r1], [c2, r2]] };
});
// Keep a frightened guest's whole body inside their refuge, including when
// an open door leaves their centre just inside the room's grid cell.
export function roomExitBlocked(room, fromX, fromZ, toX, toZ, radius = 0.28) {
  if (roomAtWorld(toX, toZ) !== room) return true;
  for (const d of DOOR_LIST) {
    if (d.room !== room) continue;
    const along = (toX - d.mid.x) * d.e.x + (toZ - d.mid.z) * d.e.z;
    if (Math.abs(along) > DOOR_W / 2 + radius) continue;
    const before = (fromX - d.mid.x) * d.n.x + (fromZ - d.mid.z) * d.n.z;
    const after = (toX - d.mid.x) * d.n.x + (toZ - d.mid.z) * d.n.z;
    if (after < radius + 0.06 && after < before - 1e-4) return true;
  }
  return false;
}
export function leafSeg(d, open) {
  const t = open * DOOR_SWING, c = Math.cos(t), s = Math.sin(t);
  const dx = d.e.x * c + d.n.x * s, dz = d.e.z * c + d.n.z * s;
  return { x1: d.hinge.x, z1: d.hinge.z, x2: d.hinge.x + dx * DOOR_W, z2: d.hinge.z + dz * DOOR_W, door: d.id };
}

// ---------- walls ----------
export const WALLS = [];
{
  const push = (u1, v1, u2, v2, outer) => {
    const a = toWorld(u1, v1), b = toWorld(u2, v2);
    WALLS.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z, outer });
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (c === COLS - 1) push(c + 1, r, c + 1, r + 1, true);
    else if (!canStep(c, r, c + 1, r)) push(c + 1, r, c + 1, r + 1, false);
    if (c === 0) push(0, r, 0, r + 1, true);
    if (r === ROWS - 1) push(c, r + 1, c + 1, r + 1, true);
    else if (!canStep(c, r, c, r + 1)) push(c, r + 1, c + 1, r + 1, false);
    if (r === 0) push(c, 0, c + 1, 0, true);
  }
  // Tunnels: every rock face is an outer wall (ghosts can't pass either).
  for (let r = DROW; r < DROW + DH; r++) for (let c = 0; c < COLS; c++) {
    if (!regionAt(c, r)) continue;
    if (!regionAt(c + 1, r)) push(c + 1, r, c + 1, r + 1, true);
    if (!regionAt(c - 1, r)) push(c, r, c, r + 1, true);
    if (!regionAt(c, r + 1)) push(c, r + 1, c + 1, r + 1, true);
    if (!regionAt(c, r - 1)) push(c, r, c + 1, r, true);
  }
  // Jambs either side of every opening.
  for (const d of DOOR_LIST) {
    const len = CELL, side = (len - DOOR_W) / 2;
    WALLS.push({ x1: d.a.x, z1: d.a.z, x2: d.a.x + d.e.x * side, z2: d.a.z + d.e.z * side, outer: false, jamb: d.id });
    WALLS.push({ x1: d.b.x - d.e.x * side, z1: d.b.z - d.e.z * side, x2: d.b.x, z2: d.b.z, outer: false, jamb: d.id });
  }
  for (const w of WALLS) { if (w.x1 > w.x2 || w.z1 > w.z2) { [w.x1, w.x2] = [w.x2, w.x1]; [w.z1, w.z2] = [w.z2, w.z1]; } }
}
// Merge collinear touching pieces (fewer meshes, faster line of sight).
export const WALL_RUNS = (() => {
  const runs = [];
  const eq = (a, b) => Math.abs(a - b) < 1e-4;
  const horiz = WALLS.filter((w) => eq(w.z1, w.z2)).sort((a, b) => a.z1 - b.z1 || a.x1 - b.x1);
  const vert = WALLS.filter((w) => eq(w.x1, w.x2)).sort((a, b) => a.x1 - b.x1 || a.z1 - b.z1);
  for (const w of horiz) {
    const l = runs[runs.length - 1];
    if (l && l.h && eq(l.z1, w.z1) && eq(l.x2, w.x1) && l.outer === w.outer) l.x2 = w.x2;
    else runs.push({ ...w, h: true });
  }
  for (const w of vert) {
    const l = runs[runs.length - 1];
    if (l && !l.h && eq(l.x1, w.x1) && eq(l.z2, w.z1) && l.outer === w.outer) l.z2 = w.z2;
    else runs.push({ ...w, h: false });
  }
  return runs;
})();

// ---------- collision ----------
function pushSeg(p, w, rad) {
  const vx = w.x2 - w.x1, vz = w.z2 - w.z1, l = vx * vx + vz * vz;
  const t = l ? Math.max(0, Math.min(1, ((p.x - w.x1) * vx + (p.z - w.z1) * vz) / l)) : 0;
  const px = w.x1 + vx * t, pz = w.z1 + vz * t;
  const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz);
  if (d >= rad) return false;
  if (d < 1e-5) { const nx = -vz, nz = vx, nl = Math.hypot(nx, nz) || 1; p.x = px + nx / nl * rad; p.z = pz + nz / nl * rad; }
  else { p.x = px + dx / d * rad; p.z = pz + dz / d * rad; }
  return true;
}
// Push a circle out of walls, door leaves and furniture.
// doors: array of open amounts (0..1). opts.ghost skips everything but the outer shell.
export function collide(x, z, rad = 0.3, doors = null, opts = {}) {
  const p = { x, z };
  for (let iter = 0; iter < 3; iter++) {
    for (const w of opts.ghost ? WALL_RUNS.filter((r) => r.outer) : WALLS) {
      if (p.x < w.x1 - rad - 0.1 || p.x > w.x2 + rad + 0.1 || p.z < w.z1 - rad - 0.1 || p.z > w.z2 + rad + 0.1) continue;
      pushSeg(p, w, rad + 0.06);
    }
    if (opts.ghost) continue;
    if (doors) for (const d of DOOR_LIST) {
      if (Math.abs(p.x - d.mid.x) > 2.5 || Math.abs(p.z - d.mid.z) > 2.5) continue;
      const o = opts.locked?.has(d.id) ? 0 : doors[d.id] ?? 0;
      if (opts.ignoreOpenDoors && o >= 0.7) continue;
      pushSeg(p, leafSeg(d, o), rad + 0.03);
    }
    if (opts.noFurniture) continue;
    for (const b of SOLIDS) {
      if (b.y1 > 1.2 || b.y2 < 0.3 || (b.push && opts.pushables === false)) continue;
      const px = Math.max(b.x1, Math.min(b.x2, p.x)), pz = Math.max(b.z1, Math.min(b.z2, p.z));
      const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz);
      if (d < rad) {
        if (d < 1e-5) {
          const o = [[b.x1 - rad - p.x, 0], [b.x2 + rad - p.x, 0], [0, b.z1 - rad - p.z], [0, b.z2 + rad - p.z]];
          o.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
          p.x += o[0][0]; p.z += o[0][1];
        } else { p.x = px + dx / d * rad; p.z = pz + dz / d * rad; }
      }
    }
  }
  return p;
}

// ---------- line of sight ----------
function cross(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((cx - ax) * d2z - (cz - az) * d2x) / den, u = ((cx - ax) * d1z - (cz - az) * d1x) / den;
  return t > 0.001 && t < 0.999 && u >= -0.001 && u <= 1.001;
}
// Is the straight line a→b free of walls and (mostly) closed doors?
export function losClear(ax, az, bx, bz, doors) {
  const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
  for (const w of WALL_RUNS) {
    if (w.x2 < minX || w.x1 > maxX || w.z2 < minZ || w.z1 > maxZ) continue;
    if (cross(ax, az, bx, bz, w.x1, w.z1, w.x2, w.z2)) return false;
  }
  if (doors) for (const d of DOOR_LIST) {
    const l = leafSeg(d, doors[d.id] ?? 0);
    if (Math.max(l.x1, l.x2) < minX || Math.min(l.x1, l.x2) > maxX || Math.max(l.z1, l.z2) < minZ || Math.min(l.z1, l.z2) > maxZ) continue;
    if (cross(ax, az, bx, bz, l.x1, l.z1, l.x2, l.z2)) return false;
  }
  return true;
}

// Doors barricaded by pushed furniture: pathfinding treats them as walls.
export const BLOCKED_DOORS = new Set();

// ---------- fine navigation grid (2 nodes per square) ----------
export const NS = 2;
const FC = COLS * NS, FR = (DROW + DH) * NS, FCELL = CELL / NS;
const fkey = (c, r) => r * FC + c;
const fineToWorld = (c, r) => ({ x: (c + 0.5) * FCELL - COLS * CELL / 2, z: (r + 0.5) * FCELL - ROWS * CELL / 2 });
const worldToFine = (x, z) => ({ c: Math.floor((x + COLS * CELL / 2) / FCELL), r: Math.floor((z + ROWS * CELL / 2) / FCELL) });
const fRegion = (c, r) => (c < 0 || r < 0 || c >= FC || r >= FR) ? null : regionAt(Math.floor(c / NS), Math.floor(r / NS));
const fblocked = new Uint8Array(FC * FR);
for (let r = 0; r < FR; r++) for (let c = 0; c < FC; c++) {
  if (!fRegion(c, r)) continue;
  const p = fineToWorld(c, r);
  const resolved = collide(p.x, p.z, 0.28, null, { pushables: false });
  if (Math.hypot(resolved.x - p.x, resolved.z - p.z) > 0.06) { fblocked[fkey(c, r)] = 1; continue; }
  for (const b of SOLIDS) {
    if (b.y1 > 1.2 || b.push) continue;
    if (p.x > b.x1 - 0.32 && p.x < b.x2 + 0.32 && p.z > b.z1 - 0.32 && p.z < b.z2 + 0.32) { fblocked[fkey(c, r)] = 1; break; }
  }
}
const rawOpen = (c, r) => !!fRegion(c, r) && !fblocked[fkey(c, r)];
let connected = null;
const fOpen = (c, r) => rawOpen(c, r) && (!connected || !!connected[fkey(c, r)]);
// Door id crossed stepping between orthogonal fine nodes, -1 if same region, null if blocked.
function fStep(c1, r1, c2, r2) {
  const A = [Math.floor(c1 / NS), Math.floor(r1 / NS)], B = [Math.floor(c2 / NS), Math.floor(r2 / NS)];
  if (A[0] === B[0] && A[1] === B[1]) return -1;
  const a = regionAt(...A), b = regionAt(...B);
  if (!a || !b) return null;
  if (a === b) return -1;
  const d = doorBetween(A[0], A[1], B[0], B[1]);
  return d === undefined || BLOCKED_DOORS.has(d) ? null : d;
}
// Trapdoor ladders: the mansion hatch node links to the tunnel ladder node.
const passageLinks = new Map();
const LADDERS = [];
export const HATCH_POS = {};
for (const h of HATCHES) {
  const a = { c: h.top[0] * NS + 1, r: h.top[1] * NS + 1, hatch: h.id, down: true }, b = { c: h.bottom[0] * NS + 1, r: h.bottom[1] * NS + 1, hatch: h.id, down: false };
  passageLinks.set(fkey(a.c, a.r), b); passageLinks.set(fkey(b.c, b.r), a);
  LADDERS.push([a, b]);
  const tw = fineToWorld(a.c, a.r), bw = fineToWorld(b.c, b.r);
  HATCH_POS[h.id] = { ...h, tx: tw.x, tz: tw.z, bx: bw.x, bz: bw.z };
}
// Furniture can enclose a few fine nodes. Keep only the component linked to
// the hallway so random destinations and target snapping are truly reachable.
{
  const seen = new Uint8Array(FC * FR), queue = [];
  let seed = -1;
  for (let r = 0; r < FR && seed < 0; r++) for (let c = 0; c < FC; c++) {
    if (fRegion(c, r) === "." && rawOpen(c, r)) { seed = fkey(c, r); break; }
  }
  if (seed >= 0) {
    seen[seed] = 1; queue.push(seed);
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head], c = k % FC, r = (k / FC) | 0;
      const add = (nc, nr) => { if (!rawOpen(nc, nr)) return; const nk = fkey(nc, nr); if (!seen[nk]) { seen[nk] = 1; queue.push(nk); } };
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (fStep(c, r, c + dc, r + dr) !== null) add(c + dc, r + dr);
      for (const [dc, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (fStep(c, r, c + dc, r) === -1 && fStep(c, r, c, r + dr) === -1 && fStep(c + dc, r, c + dc, r + dr) === -1 && fStep(c, r + dr, c + dc, r + dr) === -1 && rawOpen(c + dc, r) && rawOpen(c, r + dr)) add(c + dc, r + dr);
      }
      const link = passageLinks.get(k); if (link) add(link.c, link.r);
    }
    connected = seen;
  }
}
// Nearest hatch end to a point (within r), with which end you're standing at.
export function hatchNear(x, z, r = 1.3) {
  let best = null, bd = r;
  for (const h of Object.values(HATCH_POS)) {
    const dt = Math.hypot(h.tx - x, h.tz - z), db = Math.hypot(h.bx - x, h.bz - z);
    if (dt < bd) { bd = dt; best = { h, top: true }; }
    if (db < bd) { bd = db; best = { h, top: false }; }
  }
  return best;
}

class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

function nearestFine(x, z, allowed = () => true) {
  const s = worldToFine(x, z);
  if (fOpen(s.c, s.r) && allowed(s.c, s.r)) return s;
  let best = null, bd = Infinity;
  for (let d = 1; d < 9 && !best; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
    if (!fOpen(s.c + dc, s.r + dr) || !allowed(s.c + dc, s.r + dr)) continue;
    const p = fineToWorld(s.c + dc, s.r + dr), dd = Math.hypot(p.x - x, p.z - z);
    if (dd < bd) { bd = dd; best = { c: s.c + dc, r: s.r + dr }; }
  }
  return best;
}

// Path of waypoints {x,z,door?,passage?}. Door waypoints sit in the opening.
export function findPath(fromX, fromZ, toX, toZ, avoidRooms = []) {
  const avoid = new Set(avoidRooms);
  if (avoid.has(roomAtWorld(fromX, fromZ)) || avoid.has(roomAtWorld(toX, toZ))) return null;
  const allowed = (c, r) => !avoid.has(ROOMS[fRegion(c, r)]?.id);
  const s = nearestFine(fromX, fromZ, allowed), g = nearestFine(toX, toZ, allowed);
  if (!s || !g) return null;
  // Interaction points can sit inside furniture. End at the closest walkable
  // fine node instead of repeatedly pushing an NPC into that obstacle.
  const end = collide(toX, toZ, 0.28);
  if (Math.hypot(end.x - toX, end.z - toZ) > 0.2 || !fOpen(...Object.values(worldToFine(toX, toZ)))) {
    const safe = fineToWorld(g.c, g.r);
    toX = safe.x; toZ = safe.z;
  }
  const start = fkey(s.c, s.r), goal = fkey(g.c, g.r);
  const open = new Heap(), came = new Map(), gs = new Map([[start, 0]]), via = new Map();
  open.push([0, start]);
  // Admissible across layers: straight line, or via the best ladder.
  const gDown = g.r >= DROW * NS;
  const heur = (c, r) => {
    if ((r >= DROW * NS) === gDown) return Math.hypot(c - g.c, r - g.r);
    let m = Infinity;
    for (const [a, b] of LADDERS) { const [p, q] = gDown ? [a, b] : [b, a]; m = Math.min(m, Math.hypot(c - p.c, r - p.r) + 6 + Math.hypot(q.c - g.c, q.r - g.r)); }
    return m;
  };
  let guard = 0;
  while (open.size && guard++ < 16000) {
    const [, cur] = open.pop();
    if (cur === goal) break;
    const c = cur % FC, r = (cur / FC) | 0, gc = gs.get(cur);
    const tryN = (nc, nr, cost, info) => {
      const nk = fkey(nc, nr), ng = gc + cost;
      if (ng < (gs.get(nk) ?? Infinity)) { gs.set(nk, ng); came.set(nk, cur); via.set(nk, info); open.push([ng + heur(nc, nr), nk]); }
    };
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (!fOpen(nc, nr) || !allowed(nc, nr)) continue;
      const st = fStep(c, r, nc, nr);
      if (st === null) continue;
      tryN(nc, nr, st >= 0 ? 1.3 : 1, st >= 0 ? { door: st } : null);
    }
    for (const [dc, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (!fOpen(nc, nr) || !fOpen(c + dc, r) || !fOpen(c, r + dr) || !allowed(nc, nr) || !allowed(c + dc, r) || !allowed(c, r + dr)) continue;
      if (fStep(c, r, c + dc, r) !== -1 || fStep(c + dc, r, nc, nr) !== -1 || fStep(c, r, c, r + dr) !== -1 || fStep(c, r + dr, nc, nr) !== -1) continue;
      tryN(nc, nr, 1.414, null);
    }
    const link = passageLinks.get(cur);
    if (link && allowed(link.c, link.r)) tryN(link.c, link.r, 6, { passage: true, hatch: link.hatch });
  }
  if (!came.has(goal) && start !== goal) return null;
  const nodes = [];
  for (let k = goal; k !== undefined && k !== start; k = came.get(k)) nodes.push(k);
  nodes.reverse();
  const pts = [];
  for (const k of nodes) {
    const c = k % FC, r = (k / FC) | 0, w = fineToWorld(c, r), info = via.get(k);
    if (info?.door !== undefined) {
      const d = DOOR_LIST[info.door];
      pts.push({ x: d.mid.x - d.n.x * 0.5 * Math.sign(dot(w, d)), z: d.mid.z - d.n.z * 0.5 * Math.sign(dot(w, d)), pin: true });
      pts.push({ x: d.mid.x, z: d.mid.z, door: info.door, pin: true });
      pts.push({ x: d.mid.x + d.n.x * 0.6 * Math.sign(dot(w, d)), z: d.mid.z + d.n.z * 0.6 * Math.sign(dot(w, d)), pin: true });
    }
    pts.push({ x: w.x, z: w.z, passage: !!info?.passage, hatch: info?.hatch, pin: !!info?.passage });
  }
  if (pts.length) { pts[pts.length - 1].x = toX; pts[pts.length - 1].z = toZ; }
  return smooth(fromX, fromZ, pts);
}
const dot = (w, d) => (w.x - d.mid.x) * d.n.x + (w.z - d.mid.z) * d.n.z || 1;

// Straight walk test on the fine grid (same region only, no blocked nodes).
export function clearLine(x1, z1, x2, z2) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.2));
  const reg = fRegion(...Object.values(worldToFine(x1, z1)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    const q = worldToFine(x, z), fixed = collide(x, z, 0.28);
    if (!fOpen(q.c, q.r) || fRegion(q.c, q.r) !== reg || Math.hypot(fixed.x - x, fixed.z - z) > 0.06) return false;
  }
  return true;
}
function smooth(x, z, pts) {
  const out = [];
  let cx = x, cz = z, i = 0;
  while (i < pts.length) {
    if (pts[i].pin) { out.push(pts[i]); cx = pts[i].x; cz = pts[i].z; i++; continue; }
    let j = i;
    while (j + 1 < pts.length && !pts[j + 1].pin && clearLine(cx, cz, pts[j + 1].x, pts[j + 1].z)) j++;
    out.push(pts[j]); cx = pts[j].x; cz = pts[j].z; i = j + 1;
  }
  return out;
}

// Random walkable point inside a room (or the hallway).
export function randomPointIn(roomId, rnd = Math.random) {
  const ch = Object.keys(ROOMS).find((k) => ROOMS[k].id === roomId) || ".";
  const cells = [];
  for (let r = 0; r < FR; r++) for (let c = 0; c < FC; c++) if (fRegion(c, r) === ch && fOpen(c, r)) cells.push([c, r]);
  const [c, r] = cells[Math.floor(rnd() * cells.length)];
  const w = fineToWorld(c, r);
  return { x: w.x + (rnd() - 0.5) * 0.4, z: w.z + (rnd() - 0.5) * 0.4 };
}
export function roomCenter(roomId) {
  const b = ROOM_BOUNDS[roomId];
  const a = toWorld(b[0], b[1]), c = toWorld(b[2], b[3]);
  return { x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 };
}
// Nearest room (not hallway/cellar) by walking distance estimate.
export function nearestRoomPoint(x, z, exclude = ["cellar", "tunnels"]) {
  let best = null, bd = Infinity;
  for (const d of DOOR_LIST) {
    if (exclude.includes(d.room)) continue;
    const dd = Math.hypot(d.mid.x - x, d.mid.z - z);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best ? { room: best.room, door: best.id, x: best.mid.x + best.n.x * 2.2, z: best.mid.z + best.n.z * 2.2 } : null;
}
export const passageAt = () => null;
