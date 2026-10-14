// Rigid-body props (spheres against walls, door leaves, furniture boxes,
// floor and ceiling; pushed by walkers) and a small billiards simulation.
// Pure logic, world metres.
import { WALL_H } from "./data.js";
import { WALLS, DOOR_LIST, leafSeg } from "./nav.js";
import { SOLIDS, POOL } from "./layout.js";

const G = 9.8;

function segPush(b, w, r) {
  const vx = w.x2 - w.x1, vz = w.z2 - w.z1, l = vx * vx + vz * vz;
  const t = l ? Math.max(0, Math.min(1, ((b.x - w.x1) * vx + (b.z - w.z1) * vz) / l)) : 0;
  const px = w.x1 + vx * t, pz = w.z1 + vz * t;
  const dx = b.x - px, dz = b.z - pz, d = Math.hypot(dx, dz);
  if (d >= r || d < 1e-6) return null;
  const nx = dx / d, nz = dz / d;
  b.x = px + nx * r; b.z = pz + nz * r;
  return { nx, nz };
}
function reflect(b, nx, ny, nz, bounce = 0.35, fric = 0.75) {
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return 0;
  b.vx -= (1 + bounce) * vn * nx; b.vy -= (1 + bounce) * vn * ny; b.vz -= (1 + bounce) * vn * nz;
  // tangential friction
  b.vx *= fric; b.vz *= fric; if (Math.abs(ny) < 0.5) b.vy *= fric;
  return -vn;
}

export class Props {
  constructor(list) {
    this.list = list; // [{id, kind, x,y,z, r, ...}]
    this.byId = new Map(list.map((p) => [p.id, p]));
    for (const p of list) Object.assign(p, { vx: 0, vy: 0, vz: 0, yaw: p.yaw ?? Math.random() * 6.28, tilt: 0, roll: 0, sleep: false, holder: null, ghost: null, moved: true });
  }
  // impacts: [{prop, speed, hitChar?}]
  step(dt, doors, walkers) {
    const out = [];
    const sub = 3, h = dt / sub;
    for (const p of this.list) {
      if (p.holder || p.hidden || p.stash) { p.sleep = false; continue; }
      if (p.sleep) {
        // Walkers nudge sleeping props they step into.
        for (const w of walkers) if (Math.abs(w.x - p.x) < 0.5 && Math.abs(w.z - p.z) < 0.5 && p.y < 0.5 && (w.mv || 0) > 0.4) {
          const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
          if (d < 0.3 + p.r) { p.sleep = false; p.vx += dx / (d || 1) * 1.4; p.vz += dz / (d || 1) * 1.4; p.vy += 0.6; }
        }
        if (p.sleep) continue;
      }
      for (let s = 0; s < sub; s++) {
        p.vy -= G * h;
        p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
        let impact = 0, grounded = false;
        // floor / ceiling
        if (p.y < p.r) { p.y = p.r; impact = Math.max(impact, reflect(p, 0, 1, 0)); grounded = true; }
        if (p.y > WALL_H - p.r) { p.y = WALL_H - p.r; reflect(p, 0, -1, 0); }
        // walls
        for (const w of WALLS) {
          if (p.x < w.x1 - 0.4 || p.x > w.x2 + 0.4 || p.z < w.z1 - 0.4 || p.z > w.z2 + 0.4) continue;
          const n = segPush(p, w, p.r + 0.07);
          if (n) impact = Math.max(impact, reflect(p, n.nx, 0, n.nz, 0.4));
        }
        if (p.y < 2.5) for (const d of DOOR_LIST) {
          if (Math.abs(p.x - d.mid.x) > 1.8 || Math.abs(p.z - d.mid.z) > 1.8) continue;
          const n = segPush(p, leafSeg(d, doors[d.id] ?? 0), p.r + 0.03);
          if (n) impact = Math.max(impact, reflect(p, n.nx, 0, n.nz, 0.3));
        }
        // furniture boxes (sphere vs AABB)
        for (const b of SOLIDS) {
          if (p.x < b.x1 - p.r || p.x > b.x2 + p.r || p.z < b.z1 - p.r || p.z > b.z2 + p.r || p.y > b.y2 + p.r || p.y < b.y1 - p.r) continue;
          const cx = Math.max(b.x1, Math.min(b.x2, p.x)), cy = Math.max(b.y1, Math.min(b.y2, p.y)), cz = Math.max(b.z1, Math.min(b.z2, p.z));
          let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz, d = Math.hypot(dx, dy, dz);
          if (d >= p.r) continue;
          if (d < 1e-6) { dy = 1; dx = dz = 0; d = 1; p.y = b.y2 + p.r; }
          else { p.x = cx + dx / d * p.r; p.y = cy + dy / d * p.r; p.z = cz + dz / d * p.r; }
          const ny = dy / d;
          impact = Math.max(impact, reflect(p, dx / d, ny, dz / d, 0.3));
          if (ny > 0.7) grounded = true;
        }
        // walkers (thrown props hit people)
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        for (const w of walkers) {
          if (w.ghost || w.id === p.thrower) continue;
          if (p.y > 1.85 || p.y < 0) continue;
          const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
          if (d < 0.3 + p.r && d > 1e-4) {
            p.x = w.x + dx / d * (0.3 + p.r); p.z = w.z + dz / d * (0.3 + p.r);
            reflect(p, dx / d, 0, dz / d, 0.25);
            if (sp > 2.2 && p.thrownAt && !p.hitDone) { p.hitDone = true; out.push({ prop: p, hitChar: w.id, speed: sp }); }
          }
        }
        if (grounded) { p.vx *= Math.pow(0.05, h); p.vz *= Math.pow(0.05, h); }
        if (impact > 1.4) out.push({ prop: p, speed: impact });
        if (sp > 0.3) { p.yaw += (p.vx - p.vz) * h * 3; p.roll += sp * h * 4; }
        if (grounded && sp < 0.08) { p.vx = p.vy = p.vz = 0; p.sleep = true; p.roll = 0; p.thrownAt = 0; p.thrower = null; break; }
      }
      p.moved = true;
    }
    return out;
  }
  wake(p) { p.sleep = false; p.moved = true; }
}

// ---------- billiards ----------
export const BALL_R = 0.055;
const POCKET_R = 0.105;
export class Pool {
  constructor() { this.rack(); this.shots = 0; }
  rack() {
    const cx = POOL.x, cz = POOL.z;
    this.balls = [{ n: 0, x: cx, z: cz, vx: 0, vz: 0, in: false }];
    this.moving = false;
  }
  pockets() {
    const { x, z, w, d } = POOL;
    return [[x - w / 2, z - d / 2], [x, z - d / 2 - 0.01], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x, z + d / 2 + 0.01], [x + w / 2, z + d / 2]];
  }
  // Strike the cue ball along (dx,dz) with speed v.
  shoot(dx, dz, v = 3.2) {
    const c = this.balls[0];
    if (this.moving) return false;
    if (c.in) { c.in = false; c.x = POOL.x; c.z = POOL.z; }
    const l = Math.hypot(dx, dz) || 1;
    c.vx = dx / l * v; c.vz = dz / l * v;
    this.moving = true; this.shots++;
    return true;
  }
  // returns {clacks, sunk}
  step(dt) {
    if (!this.moving) return null;
    let clacks = 0, sunk = 0;
    const sub = 8, h = dt / sub, minX = POOL.x - POOL.w / 2 + BALL_R, maxX = POOL.x + POOL.w / 2 - BALL_R, minZ = POOL.z - POOL.d / 2 + BALL_R, maxZ = POOL.z + POOL.d / 2 - BALL_R;
    const pk = this.pockets();
    for (let s = 0; s < sub; s++) {
      for (const b of this.balls) {
        if (b.in) continue;
        b.x += b.vx * h; b.z += b.vz * h;
        const f = Math.pow(0.55, h); b.vx *= f; b.vz *= f;
        if (Math.hypot(b.vx, b.vz) < 0.02) b.vx = b.vz = 0;
        for (const [px, pz] of pk) if (Math.hypot(b.x - px, b.z - pz) < POCKET_R) { b.in = true; b.vx = b.vz = 0; sunk++; }
        if (b.in) continue;
        if (b.x < minX) { b.x = minX; b.vx = Math.abs(b.vx) * 0.8; } if (b.x > maxX) { b.x = maxX; b.vx = -Math.abs(b.vx) * 0.8; }
        if (b.z < minZ) { b.z = minZ; b.vz = Math.abs(b.vz) * 0.8; } if (b.z > maxZ) { b.z = maxZ; b.vz = -Math.abs(b.vz) * 0.8; }
      }
      for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i], b = this.balls[j];
        if (a.in || b.in) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= BALL_R * 2 || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, ov = BALL_R * 2 - d;
        a.x -= nx * ov / 2; a.z -= nz * ov / 2; b.x += nx * ov / 2; b.z += nz * ov / 2;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0) { a.vx += rv * nx * 0.96; a.vz += rv * nz * 0.96; b.vx -= rv * nx * 0.96; b.vz -= rv * nz * 0.96; if (-rv > 0.2) clacks++; }
      }
    }
    this.moving = this.balls.some((b) => !b.in && (b.vx || b.vz));
    return { clacks, sunk };
  }
  state() { return this.balls.map((b) => [Math.round(b.x * 1000) / 1000, Math.round(b.z * 1000) / 1000, b.in ? 1 : 0]); }
}
