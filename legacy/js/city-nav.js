// City-only navigation. Colliders are checked with the same radius as a person,
// so a route that looks clear also remains clear during movement.
export function cityPointClear(world, x, z, radius = .55) {
  const M = world.sites.marrowgate;
  if (Math.abs(x - M.x) > M.r - 1.8 || Math.abs(z - M.z) > M.r - 1.8) return false;
  for (const c of world.col.near(x, z, radius + 1, [])) {
    if (c.disabled) continue;
    if (c.type === "c") { if (Math.hypot(x - c.x, z - c.z) < c.r + radius) return false; }
    else {
      const dx = x - c.x, dz = z - c.z;
      const lx = dx * c.cos + dz * c.sin, lz = -dx * c.sin + dz * c.cos;
      const bx = Math.max(-c.hw, Math.min(c.hw, lx)), bz = Math.max(-c.hd, Math.min(c.hd, lz));
      if (Math.hypot(lx - bx, lz - bz) < radius) return false;
    }
  }
  return true;
}

export function cityLineClear(world, a, b, radius = .55) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(d / .55));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!cityPointClear(world, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, radius)) return false;
  }
  return true;
}

export function cityRoute(world, from, to, radius = .55) {
  if (cityLineClear(world, from, to, radius)) return [{ x: to.x, z: to.z }];
  const M = world.sites.marrowgate, step = 1.5, size = Math.ceil(M.r * 2 / step) + 1;
  const grid = (p) => ({ i: Math.round((p.x - M.x + M.r) / step), j: Math.round((p.z - M.z + M.r) / step) });
  const pos = (i, j) => ({ x: M.x - M.r + i * step, z: M.z - M.r + j * step });
  let start = grid(from);
  const goal = grid(to), key = (i, j) => j * size + i;
  if (!cityPointClear(world, pos(start.i, start.j).x, pos(start.i, start.j).z, radius)) {
    let found = null, distance = Infinity;
    for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
      const i = start.i + di, j = start.j + dj, p = pos(i, j);
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      if (i >= 0 && j >= 0 && i < size && j < size && d < distance && cityPointClear(world, p.x, p.z, radius) && cityLineClear(world, from, p, radius)) { found = { i, j }; distance = d; }
    }
    if (!found) return [];
    start = found;
  }
  const opened = [{ ...start, g: 0, f: 0 }], best = new Map([[key(start.i, start.j), 0]]), prev = new Map();
  let end = null, count = 0;
  while (opened.length && count++ < 7200) {
    let bi = 0;
    for (let n = 1; n < opened.length; n++) if (opened[n].f < opened[bi].f) bi = n;
    const cur = opened.splice(bi, 1)[0], ck = key(cur.i, cur.j);
    if (cur.g !== best.get(ck)) continue;
    const cp = pos(cur.i, cur.j);
    if (Math.abs(cur.i - goal.i) <= 1 && Math.abs(cur.j - goal.j) <= 1 && cityLineClear(world, cp, to, radius)) { end = ck; break; }
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const i = cur.i + di, j = cur.j + dj;
      if (i < 0 || j < 0 || i >= size || j >= size) continue;
      const p = pos(i, j);
      if (!cityPointClear(world, p.x, p.z, radius) || !cityLineClear(world, cp, p, radius)) continue;
      const nk = key(i, j), g = cur.g + Math.hypot(di, dj);
      if (g >= (best.get(nk) ?? Infinity)) continue;
      best.set(nk, g); prev.set(nk, ck);
      opened.push({ i, j, g, f: g + Math.hypot(goal.i - i, goal.j - j) });
    }
  }
  if (end === null) return [];
  const raw = [{ x: to.x, z: to.z }];
  for (let k = end; k !== key(start.i, start.j) && k !== undefined; k = prev.get(k)) raw.push(pos(k % size, Math.floor(k / size)));
  raw.reverse();
  const route = [];
  let last = from;
  for (let a = 0; a < raw.length;) {
    let b = raw.length - 1;
    while (b > a && !cityLineClear(world, last, raw[b], radius)) b--;
    route.push(raw[b]); last = raw[b]; a = b + 1;
  }
  return route;
}
