// Procedural humanoid: a custom skeleton plus a skinned body mesh generated
// from the character's look (frame, height, build, ancestry, gear). Nothing is
// loaded from disk — every vertex, weight and bone is built here.
import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const gauss = (x, w) => Math.exp(-(x * x) / (w * w));
const col = (hex) => new THREE.Color(hex);

// ---------- Skeleton (bind pose, reference height 1.75 m, facing +Z) ----------
// Character's left is +X.
export function skeletonLayout(look) {
  const m = look.sex ?? 0.5; // 0 feminine … 1 masculine frame
  const b = look.build ?? 1;
  const frame = look.frame ?? 1;
  const shX = lerp(0.158, 0.182, m) * lerp(1, b, 0.5) * frame;
  const hipX = lerp(0.094, 0.088, m) * lerp(1, b, 0.4) * frame;
  const arm = (s) => {
    const a = THREE.MathUtils.degToRad(14);
    const dir = V(s * Math.sin(a), -Math.cos(a), 0);
    const sh = V(s * shX, 1.415, -0.01);
    const el = sh.clone().addScaledVector(dir, 0.29);
    const wr = el.clone().addScaledVector(dir, 0.255);
    const kn = wr.clone().addScaledVector(dir, 0.085);
    const tip = wr.clone().addScaledVector(dir, 0.185);
    return { dir, sh, el, wr, kn, tip, cl: V(s * 0.025, 1.415, -0.005) };
  };
  const leg = (s) => ({
    hip: V(s * hipX, 0.9, 0), knee: V(s * hipX * 0.92, 0.5, 0.012), ankle: V(s * hipX * 0.86, 0.085, -0.01),
    ball: V(s * hipX * 0.86, 0.025, 0.13), toe: V(s * hipX * 0.86, 0.02, 0.2),
  });
  return { m, b, frame, shX, hipX, L: arm(1), R: arm(-1), LL: leg(1), LR: leg(-1) };
}

const BONE_DEFS = (S) => {
  const d = [
    ["root", null, V(0, 0, 0)],
    ["hips", "root", V(0, 0.95, 0)],
    ["spine", "hips", V(0, 1.03, 0)],
    ["chest", "spine", V(0, 1.16, 0)],
    ["upperChest", "chest", V(0, 1.29, 0)],
    ["neck", "upperChest", V(0, 1.45, 0.0)],
    ["head", "neck", V(0, 1.535, 0.01)],
  ];
  for (const [k, side] of [["L", S.L], ["R", S.R]]) {
    d.push([`shoulder.${k}`, "upperChest", side.cl]);
    d.push([`upperArm.${k}`, `shoulder.${k}`, side.sh]);
    d.push([`foreArm.${k}`, `upperArm.${k}`, side.el]);
    d.push([`hand.${k}`, `foreArm.${k}`, side.wr]);
    d.push([`fingers.${k}`, `hand.${k}`, side.kn]);
  }
  for (const [k, side] of [["L", S.LL], ["R", S.LR]]) {
    d.push([`upLeg.${k}`, "hips", side.hip]);
    d.push([`leg.${k}`, `upLeg.${k}`, side.knee]);
    d.push([`foot.${k}`, `leg.${k}`, side.ankle]);
    d.push([`toe.${k}`, `foot.${k}`, side.ball]);
  }
  return d;
};

// Bone segments (world bind space) used for automatic distance-based weights.
function segments(S) {
  const s = {
    hips: [V(0, 0.84, 0), V(0, 1.0, 0)], spine: [V(0, 1.0, 0), V(0, 1.15, 0)],
    chest: [V(0, 1.15, 0), V(0, 1.28, 0)], upperChest: [V(0, 1.28, 0), V(0, 1.43, 0)],
    neck: [V(0, 1.43, 0), V(0, 1.56, 0.01)], head: [V(0, 1.56, 0.01), V(0, 1.75, 0.01)],
  };
  for (const [k, a] of [["L", S.L], ["R", S.R]]) {
    s[`shoulder.${k}`] = [a.cl, a.sh];
    s[`upperArm.${k}`] = [a.sh, a.el];
    s[`foreArm.${k}`] = [a.el, a.wr];
    s[`hand.${k}`] = [a.wr, a.kn];
    s[`fingers.${k}`] = [a.kn, a.tip];
  }
  for (const [k, l] of [["L", S.LL], ["R", S.LR]]) {
    s[`upLeg.${k}`] = [l.hip, l.knee];
    s[`leg.${k}`] = [l.knee, l.ankle];
    s[`foot.${k}`] = [l.ankle, l.ball];
    s[`toe.${k}`] = [l.ball, l.toe];
  }
  return s;
}

const _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
function segDist(p, a, b) {
  _ab.subVectors(b, a); _ap.subVectors(p, a);
  const t = clamp01(_ap.dot(_ab) / Math.max(1e-9, _ab.lengthSq()));
  return _ap.addScaledVector(_ab, -t).length();
}

// ---------- Mesh builder ----------
class Builder {
  constructor(segs, boneIndex) {
    this.segs = segs; this.boneIndex = boneIndex;
    this.pos = []; this.col = []; this.uv = []; this.si = []; this.sw = [];
    this.idx = { matte: [], metal: [], mail: [], leather: [], cloth: [] };
  }
  vert(p, c, bones, power = 4, uv = [0, 0]) {
    const ws = [];
    for (const name of bones) {
      const [a, b] = this.segs[name];
      const d = segDist(p, a, b);
      ws.push([this.boneIndex[name], 1 / (Math.pow(d + 0.004, power))]);
    }
    ws.sort((x, y) => y[1] - x[1]);
    const top = ws.slice(0, 4);
    const sum = top.reduce((s, w) => s + w[1], 0);
    for (let i = 0; i < 4; i++) {
      this.si.push(top[i] ? top[i][0] : 0);
      this.sw.push(top[i] ? top[i][1] / sum : 0);
    }
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(uv[0], uv[1]);
    return this.pos.length / 3 - 1;
  }
  // rings: [{c, u, v, rx, ry, e?}] ; S radial segments
  loft(rings, S, opts) {
    const { bones, color, mat = "matte", disp, power } = opts;
    const base = this.pos.length / 3;
    const p = new THREE.Vector3();
    rings.forEach((r, i) => {
      const e = r.e ?? 2;
      for (let j = 0; j < S; j++) {
        const th = (j / S) * Math.PI * 2;
        const cs = Math.cos(th), sn = Math.sin(th);
        const X = Math.sign(cs) * Math.pow(Math.abs(cs), 2 / e);
        const Y = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
        p.copy(r.c).addScaledVector(r.u, r.rx * X).addScaledVector(r.v, r.ry * Y);
        if (disp) disp(p, th, i, r);
        const c = typeof color === "function" ? color(p, th, i) : color;
        this.vert(p.clone(), c, r.bones || bones, power, [j / S, i / Math.max(1, rings.length - 1)]);
      }
    });
    // orientation: outward if cross(t, dθ)
    const t = new THREE.Vector3().subVectors(rings[rings.length - 1].c, rings[0].c);
    const uv = new THREE.Vector3().crossVectors(rings[0].u, rings[0].v);
    const flip = uv.dot(t) > 0;
    const out = this.idx[mat];
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < S; j++) {
        const a = base + i * S + j, b = base + i * S + ((j + 1) % S);
        const c = base + (i + 1) * S + j, d = base + (i + 1) * S + ((j + 1) % S);
        if (!flip) out.push(a, c, b, b, c, d); else out.push(a, b, c, b, d, c);
      }
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    const all = [...this.idx.matte, ...this.idx.metal, ...this.idx.mail, ...this.idx.leather, ...this.idx.cloth];
    g.setIndex(all);
    let offset = 0;
    for (const [i, name] of ["matte", "metal", "mail", "leather", "cloth"].entries()) {
      g.addGroup(offset, this.idx[name].length, i);
      offset += this.idx[name].length;
    }
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// Catmull-Rom style smooth sample of keyed profile [[y, ...vals]]
function sampleKeys(keys, y) {
  if (y <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (y <= b[0]) {
      const t = (y - a[0]) / (b[0] - a[0]);
      const s = t * t * (3 - 2 * t);
      return a.slice(1).map((v, k) => lerp(v, b[k + 1], s));
    }
  }
  return keys[keys.length - 1].slice(1);
}

// Path loft helper: points along a polyline with radius profile
function pathRings(points, radii, S, sideAxis, opts = {}) {
  const rings = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const t = new THREE.Vector3().subVectors(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]).normalize();
    const u = sideAxis.clone().addScaledVector(t, -sideAxis.dot(t)).normalize();
    const v = new THREE.Vector3().crossVectors(t, u).normalize();
    const r = radii[i];
    rings.push({ c: p, u, v, rx: Array.isArray(r) ? r[0] : r, ry: Array.isArray(r) ? r[1] : r, e: opts.e });
  }
  return rings;
}
function chain(pts, per) {
  // subdivide a polyline of control points into `per` samples per span
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < per; k++) out.push(pts[i].clone().lerp(pts[i + 1], k / per));
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

// ---------- Markings ----------
function skinColor(look, p, base) {
  // Low contrast, deterministic pigment variation gives close shots skin detail
  // without a texture atlas or per-character GPU materials.
  const grain = Math.sin(p.x * 173 + p.y * 97 + p.z * 139) * Math.sin(p.y * 131 - p.z * 111);
  const c = base.clone().multiplyScalar(0.973 + grain * 0.024);
  const mk = look.markings ?? 0;
  if (!mk) return c;
  const type = look.markType;
  let k = 0, tint = null;
  if (type === "bark") { k = Math.max(0, Math.sin(p.y * 90 + Math.sin(p.x * 40) * 3) - 0.55) * 1.6; tint = col("#4a3a22"); }
  else if (type === "scales") { const a = Math.sin(p.x * 160 + p.y * 90) * Math.sin(p.y * 150 - p.z * 120); k = a > 0.55 ? 0.55 : 0; tint = col(look.scaleTint || "#3f6b6a"); }
  else if (type === "embers") { const a = Math.abs(Math.sin(p.y * 70 + Math.sin(p.x * 55 + p.z * 30) * 2)); k = a < 0.08 ? 1 : 0; tint = col("#ff7a2a"); }
  else if (type === "veins") { const a = Math.abs(Math.sin(p.y * 50 + Math.sin(p.z * 60) * 2.5)); k = a < 0.05 ? 0.6 : 0; tint = col("#7f9ad0"); }
  else if (type === "bronze") { k = Math.max(0, Math.sin(p.y * 30 + p.x * 20)) * 0.25; tint = col("#d79a4a"); }
  else if (type === "feather") { k = Math.max(0, Math.sin(p.y * 120)) * 0.15; tint = col("#ffffff"); }
  if (tint) c.lerp(tint, clamp01(k * mk));
  return c;
}

// ---------- Body generation ----------
export function buildBodyGeometry(look) {
  const S = skeletonLayout(look);
  const segs = segments(S);
  const defs = BONE_DEFS(S);
  const boneIndex = {};
  defs.forEach(([n], i) => (boneIndex[n] = i));
  const B = new Builder(segs, boneIndex);
  const m = S.m, b = S.b, frame = S.frame;
  const skin = col(look.skin || "#c99a7a");
  const gear = col(look.gear || "#5a6070");
  const trim = col(look.trim || "#c9a04a");
  const leather = col(look.leather || "#4a3424");
  const cloth = col(look.cloth || "#3a3530");
  const shirt = col(look.shirt || "#cfc4ad");
  const body = look.body || "leather";
  const fem = 1 - m;
  const SK = (p) => skinColor(look, p, skin);
  const R = 18; // radial segments

  // Torso profile keys: y, halfWidth, halfDepth, zOffset
  const tk = [
    [0.84, lerp(0.135, 0.125, m), 0.095, -0.005],
    [0.93, lerp(0.168, 0.15, m), 0.112, -0.012],
    [1.04, lerp(0.122, 0.142, m), 0.094, 0],
    [1.16, lerp(0.138, 0.158, m), 0.1, 0.004],
    [1.27, lerp(0.148, 0.176, m), 0.108, 0.008],
    [1.36, lerp(0.158, 0.188, m), 0.098, 0.0],
    [1.42, lerp(0.118, 0.142, m), 0.075, -0.008],
    [1.46, 0.058, 0.054, -0.004],
  ];
  const torsoBones = ["hips", "spine", "chest", "upperChest", "neck", "shoulder.L", "shoulder.R", "upLeg.L", "upLeg.R"];
  const torsoRings = (y0, y1, off, n) => {
    const rings = [];
    for (let i = 0; i <= n; i++) {
      const y = lerp(y0, y1, i / n);
      const [w, d, z] = sampleKeys(tk, y);
      rings.push({ c: V(0, y, z), u: V(1, 0, 0), v: V(0, 0, 1), rx: w * lerp(1, b, 0.8) * frame + off, ry: d * lerp(1, b, 0.6) + off, e: 2.4 });
    }
    return rings;
  };
  const torsoDisp = (off) => (p, th) => {
    const front = Math.max(0, Math.sin(th));
    const back = Math.max(0, -Math.sin(th));
    // bust / pecs
    const bust = fem * 0.05 + m * 0.012;
    p.z += bust * front * gauss(p.y - 1.25, 0.06) * (gauss(Math.abs(p.x) - 0.07, 0.055)) * (off > 0.02 ? 0.6 : 1);
    // glutes
    p.z -= (0.02 + fem * 0.018) * back * gauss(p.y - 0.9, 0.06) * gauss(Math.abs(p.x) - 0.06, 0.07);
    // shoulder blades
    p.z -= 0.01 * back * gauss(p.y - 1.33, 0.05);
  };
  const torsoColor = (c) => (typeof c === "function" ? c : () => c);

  // Skin layer only where it shows (neck/chest top for robes); base torso always built
  B.loft(torsoRings(0.84, 1.47, 0, 22), R, { bones: torsoBones, color: shirt, mat: "cloth", disp: torsoDisp(0) });
  // close crotch
  B.loft([{ c: V(0, 0.84, -0.005), u: V(1, 0, 0), v: V(0, 0, 1), rx: tk[0][1], ry: 0.095, e: 2.4 }, { c: V(0, 0.82, -0.005), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.002, ry: 0.002 }], R, { bones: torsoBones, color: cloth, mat: "cloth" });

  // Neck (skin)
  const nr = lerp(0.045, 0.053, m) * lerp(1, b, 0.5);
  B.loft(pathRings(chain([V(0, 1.38, -0.01), V(0, 1.5, 0.0), V(0, 1.6, 0.015)], 4), Array(9).fill(0).map((_, i) => nr * (1 - i * 0.012)), R, V(1, 0, 0)), R, { bones: ["upperChest", "neck", "head"], color: SK });

  // Arms
  for (const k of ["L", "R"]) {
    const A = S[k];
    const pts = chain([A.sh.clone().add(V(k === "L" ? -0.035 : 0.035, 0.01, 0)), A.sh, A.el, A.wr], 5);
    const rr = pts.map((p, i) => {
      const t = i / (pts.length - 1);
      const r = sampleKeys([[0, 0.05], [0.25, 0.054], [0.45, 0.045], [0.62, 0.039], [0.72, 0.042], [1, 0.028]], t)[0];
      return r * lerp(0.88, 1.05, m) * lerp(1, b, 0.9);
    });
    const armBones = ["upperChest", `shoulder.${k}`, `upperArm.${k}`, `foreArm.${k}`, `hand.${k}`];
    B.loft(pathRings(pts, rr, R, V(0, 0, 1)), R, { bones: armBones, color: SK });
    // Hand: palm then mitten fingers, rounded tip
    const hp = chain([A.wr, A.kn, A.tip, A.tip.clone().addScaledVector(A.dir, 0.012)], 3);
    const hr = hp.map((_, i) => {
      const t = i / (hp.length - 1);
      const w = sampleKeys([[0, 0.024], [0.3, 0.04], [0.55, 0.038], [0.85, 0.03], [1, 0.002]], t)[0];
      const th = sampleKeys([[0, 0.022], [0.3, 0.018], [0.85, 0.012], [1, 0.002]], t)[0];
      return [th * lerp(0.9, 1.05, m), w * lerp(0.9, 1.05, m)];
    });
    B.loft(pathRings(hp, hr, 12, V(1, 0, 0)), 12, { bones: [`foreArm.${k}`, `hand.${k}`, `fingers.${k}`], color: SK, power: 6 });
    // Thumb
    const side = k === "L" ? 1 : -1;
    const tb = A.wr.clone().addScaledVector(A.dir, 0.03).add(V(-side * 0.008, 0, 0.022));
    const tp = [tb, tb.clone().addScaledVector(A.dir, 0.035).add(V(0, 0, 0.022)), tb.clone().addScaledVector(A.dir, 0.06).add(V(0, 0, 0.028)), tb.clone().addScaledVector(A.dir, 0.068).add(V(0, 0, 0.028))];
    B.loft(pathRings(tp, [0.012, 0.011, 0.009, 0.001], 8, V(1, 0, 0)), 8, { bones: [`hand.${k}`], color: SK });
  }

  // Legs (skin under clothes) and feet
  for (const k of ["L", "R"]) {
    const L = S[k === "L" ? "LL" : "LR"];
    const pts = chain([L.hip.clone().add(V(0, 0.04, 0)), L.knee, L.ankle], 7);
    const rr = pts.map((p, i) => {
      const t = i / (pts.length - 1);
      const r = sampleKeys([[0, 0.088], [0.18, 0.083], [0.4, 0.062], [0.5, 0.052], [0.62, 0.058], [0.75, 0.05], [1, 0.036]], t)[0];
      return r * lerp(1.05, 0.98, m) * lerp(1, b, 0.85);
    });
    const legBones = ["hips", `upLeg.${k}`, `leg.${k}`, `foot.${k}`];
    B.loft(pathRings(pts, rr, R, V(1, 0, 0)), R, { bones: legBones, color: cloth, mat: "cloth" });
    // Foot (shoe) loft along Z
    const fx = L.ankle.x;
    const fk = [[-0.06, 0.035, 0.035, 0.05], [-0.03, 0.042, 0.06, 0.06], [0.02, 0.045, 0.05, 0.045], [0.1, 0.048, 0.03, 0.03], [0.17, 0.042, 0.022, 0.024], [0.2, 0.025, 0.014, 0.02], [0.207, 0.003, 0.003, 0.02]];
    const fr = fk.map(([z, w, h, cy]) => ({ c: V(fx, cy, z), u: V(1, 0, 0), v: V(0, 1, 0), rx: w, ry: h, e: 2.6 }));
    B.loft(fr, 14, { bones: [`leg.${k}`, `foot.${k}`, `toe.${k}`], color: leather, mat: "leather", power: 6, disp: (p) => { if (p.y < 0.004) p.y = 0.004; } });
  }

  // ----- Gear layers -----
  const armBand = (k, t0, t1, off, color, mat, flare = 0) => {
    const A = S[k];
    const a = A.sh.clone().lerp(A.wr, t0), z = A.sh.clone().lerp(A.wr, t1);
    const elT = 0.29 / 0.545;
    const ctrl = [a];
    if (t0 < elT && t1 > elT) ctrl.push(A.el);
    ctrl.push(z);
    const pts = chain(ctrl, 4);
    const rr = pts.map((p, i) => {
      const t = lerp(t0, t1, i / (pts.length - 1));
      const r = sampleKeys([[0, 0.054], [0.25, 0.054], [0.45, 0.045], [0.53, 0.039], [0.65, 0.042], [1, 0.029]], t)[0] * lerp(0.88, 1.05, m) * lerp(1, b, 0.9);
      return r + off + flare * Math.pow(i / (pts.length - 1), 2);
    });
    B.loft(pathRings(pts, rr, R, V(0, 0, 1)), R, { bones: ["upperChest", `shoulder.${k}`, `upperArm.${k}`, `foreArm.${k}`, `hand.${k}`], color, mat });
  };
  const legBand = (k, t0, t1, off, color, mat) => {
    const L = S[k === "L" ? "LL" : "LR"];
    const top = L.hip.clone().add(V(0, 0.04, 0));
    const pAt = (t) => (t < 0.5 ? top.clone().lerp(L.knee, t / 0.5) : L.knee.clone().lerp(L.ankle, (t - 0.5) / 0.5));
    const n = 8, pts = [], rr = [];
    for (let i = 0; i <= n; i++) {
      const t = lerp(t0, t1, i / n);
      pts.push(pAt(t));
      rr.push(sampleKeys([[0, 0.088], [0.18, 0.083], [0.4, 0.062], [0.5, 0.052], [0.62, 0.058], [0.75, 0.05], [1, 0.036]], t)[0] * lerp(1.05, 0.98, m) * lerp(1, b, 0.85) + off);
    }
    B.loft(pathRings(pts, rr, R, V(1, 0, 0)), R, { bones: ["hips", `upLeg.${k}`, `leg.${k}`, `foot.${k}`], color, mat });
  };
  const torsoBand = (y0, y1, off, color, mat, n = 8) => B.loft(torsoRings(y0, y1, off, n), R, { bones: torsoBones, color, mat, disp: torsoDisp(off) });
  const skirt = (y0, y1, off, flareTo, color, mat) => {
    const rings = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = lerp(y0, y1, t);
      const [w, d, z] = sampleKeys(tk, Math.max(0.84, y));
      const fl = flareTo * t * t;
      rings.push({ c: V(0, y, z), u: V(1, 0, 0), v: V(0, 0, 1), rx: Math.max(w, 0.15) * lerp(1, b, 0.8) * frame + off + fl, ry: Math.max(d, 0.11) * lerp(1, b, 0.6) + off + fl * 0.85, e: 2.2 });
    }
    B.loft(rings, R + 4, {
      bones: ["hips", "upLeg.L", "upLeg.R", "leg.L", "leg.R"], color, mat, power: 3,
      disp: (p, th, i) => {
        const hem = i / n;
        const fold = Math.cos(th * 10) * 0.006 * hem * hem;
        p.x += Math.cos(th) * fold;
        p.z += Math.sin(th) * fold;
      },
    });
  };

  // Sleeves: shirt on upper arm
  for (const k of ["L", "R"]) armBand(k, 0, 0.5, 0.006, shirt, "cloth");
  // Trousers & boots
  for (const k of ["L", "R"]) {
    legBand(k, 0, 1, 0.007, cloth, "cloth");
    legBand(k, 0.68, 1, 0.016, leather, "leather");
  }
  // belt
  torsoBand(0.93, 0.99, 0.022, leather, "leather", 2);
  const armourOff = body === "plate" ? 0.028 : body === "mail" ? 0.026 : body === "robe" ? 0.014 : 0.016;
  const front = (x, y, lift = 0.003, off = armourOff) => {
    const [w, d, z] = sampleKeys(tk, y);
    const width = w * lerp(1, b, 0.8) * frame + off;
    const depth = d * lerp(1, b, 0.6) + off;
    const nx = Math.max(-0.985, Math.min(0.985, x / width));
    const frontShape = Math.pow(1 - Math.pow(Math.abs(nx), 2.4), 1 / 2.4);
    const bust = fem * 0.05 + m * 0.012;
    const chest = bust * Math.sqrt(1 - Math.pow(Math.abs(nx), 2.4)) * gauss(y - 1.25, 0.06)
      * gauss(Math.abs(x) - 0.07, 0.055) * (off > 0.02 ? 0.6 : 1);
    return V(x, y, z + depth * frontShape + chest + lift);
  };
  const seam = (points, radius, color, mat = "metal") => {
    // Interpolate in pattern space, then project every sample onto the actual
    // superellipse chest. Straight 3D segments used to cut through the mesh.
    const pattern = points.map(([x, y, lift = 0.003]) => V(x, y, lift));
    const curve = new THREE.CatmullRomCurve3(pattern, false, "centripetal");
    const pts = curve.getPoints(Math.max(5, (points.length - 1) * 7)).map(p => front(p.x, p.y, p.z));
    B.loft(pathRings(pts, pts.map(() => radius), 7, V(0, 0, 1)), 7, { bones: torsoBones, color, mat, power: 4 });
  };
  const rivet = (x, y, lift = 0.004, size = 0.006, off = armourOff) => {
    const p = front(x, y, lift, off);
    B.loft(pathRings([p, p.clone().add(V(0, 0, size * 0.6))], [size, 0.001], 8, V(1, 0, 0)), 8, { bones: torsoBones, color: trim, mat: "metal" });
  };
  // Buckle and stitched belt remain separate from the outfit silhouette.
  seam([[-0.026, 0.992, 0.006], [0.026, 0.992, 0.006]], 0.003, trim);
  for (const x of [-0.12, -0.09, 0.09, 0.12]) rivet(x * frame, 0.973, 0.006, 0.004, 0.022);

  if (body === "plate") {
    torsoBand(1.0, 1.43, 0.028, gear, "metal", 10);
    torsoBand(1.39, 1.465, 0.033, gear, "metal", 4);
    torsoBand(1.45, 1.465, 0.038, trim, "metal", 2);
    torsoBand(0.99, 1.02, 0.034, trim, "metal", 1);
    skirt(0.97, 0.7, 0.03, 0.06, gear, "metal");
    for (const k of ["L", "R"]) {
      const A = S[k];
      // pauldron dome
      const s = k === "L" ? 1 : -1;
      const c0 = A.sh.clone().add(V(s * 0.005, 0.03, 0));
      const rings = [];
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 0.55;
        rings.push({ c: c0.clone().add(V(0, Math.cos(a) * 0.09 - 0.06, 0)), u: V(1, 0, 0), v: V(0, 0, 1), rx: Math.sin(a) * 0.1 + 0.002, ry: Math.sin(a) * 0.092 + 0.002 });
      }
      rings.reverse();
      B.loft(rings, R, { bones: [`shoulder.${k}`, `upperArm.${k}`], color: gear, mat: "metal" });
      const rimY = c0.y + Math.cos(Math.PI * 0.55) * 0.09 - 0.06;
      B.loft([
        { c: V(c0.x, rimY - 0.006, c0.z), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.102, ry: 0.094 },
        { c: V(c0.x, rimY + 0.004, c0.z), u: V(1, 0, 0), v: V(0, 0, 1), rx: 0.099, ry: 0.092 },
      ], R, { bones: [`shoulder.${k}`, `upperArm.${k}`], color: trim, mat: "metal" });
      armBand(k, 0.62, 0.98, 0.014, gear, "metal", 0.012);
      legBand(k, 0.55, 0.95, 0.024, gear, "metal");
      legBand(k, 0.44, 0.54, 0.03, trim, "metal");
      armBand(k, 0.13, 0.18, 0.027, trim, "metal");
      armBand(k, 0.72, 0.75, 0.029, trim, "metal");
      // A pair of shallow raised lines follows each tapered greave instead of
      // sitting at a constant width in space beside the animated leg.
      const leg = S[k === "L" ? "LL" : "LR"];
      for (const side of [-1, 1]) {
        const line = [];
        for (let i = 0; i <= 10; i++) {
          const t = lerp(0.57, 0.93, i / 10);
          const center = leg.knee.clone().lerp(leg.ankle, (t - 0.5) / 0.5);
          const radius = sampleKeys([[0.5, 0.052], [0.62, 0.058], [0.75, 0.05], [1, 0.036]], t)[0]
            * lerp(1.05, 0.98, m) * lerp(1, b, 0.85) + 0.024;
          line.push(center.add(V(side * radius * 0.38, 0, radius * 0.94 + 0.002)));
        }
        B.loft(pathRings(line, line.map(() => 0.0019), 6, V(0, 0, 1)), 6,
          { bones: ["hips", `upLeg.${k}`, `leg.${k}`, `foot.${k}`], color: trim, mat: "metal" });
      }
    }
    seam([[0, 1.4, 0.004], [0, 1.24, 0.004], [0, 1.08, 0.004]], 0.004, trim);
    for (const s of [-1, 1]) {
      seam([[s * 0.035, 1.4, 0.003], [s * 0.095, 1.33, 0.003], [s * 0.11, 1.22, 0.003], [s * 0.09, 1.08, 0.003]], 0.0025, trim);
      seam([[s * 0.025, 1.1, 0.004], [s * 0.07, 1.065, 0.004], [s * 0.12, 1.055, 0.004]], 0.0023, trim);
      for (const y of [1.34, 1.22, 1.1]) rivet(s * 0.11, y, 0.004, 0.0045);
    }
  } else if (body === "leather") {
    torsoBand(0.9, 1.44, 0.016, gear, "leather", 10);
    torsoBand(1.4, 1.47, 0.035, trim, "leather", 3); // collar
    skirt(0.97, 0.78, 0.022, 0.03, gear, "leather");
    for (const k of ["L", "R"]) { armBand(k, 0.0, 0.42, 0.012, gear, "leather"); armBand(k, 0.66, 0.97, 0.012, trim, "leather"); }
    for (const s of [-1, 1]) {
      seam([[s * 0.12, 1.37, 0.005], [s * 0.065, 1.2, 0.005], [-s * 0.08, 1.01, 0.005]], 0.008, leather, "leather");
      seam([[s * 0.12, 1.37, 0.009], [s * 0.065, 1.2, 0.009], [-s * 0.08, 1.01, 0.009]], 0.0018, trim, "metal");
      seam([[s * 0.11, 1.12, 0.004], [s * 0.13, 1.08, 0.004], [s * 0.13, 1.035, 0.004]], 0.002, trim, "leather");
      for (const y of [1.33, 1.22, 1.11]) rivet(s * 0.12, y, 0.004, 0.0035);
    }
  } else if (body === "robe") {
    torsoBand(0.92, 1.45, 0.014, gear, "cloth", 10);
    torsoBand(1.4, 1.465, 0.026, gear, "cloth", 3);
    skirt(0.98, 0.12, 0.02, 0.12, gear, "cloth");
    skirt(0.2, 0.12, 0.02 + 0.11, 0.012, trim, "cloth");
    torsoBand(0.95, 1.0, 0.03, trim, "cloth", 2);
    for (const k of ["L", "R"]) armBand(k, 0.0, 0.92, 0.012, gear, "cloth", 0.035);
    seam([[-0.11, 1.42, 0.004], [0, 1.25, 0.004], [0.11, 1.42, 0.004]], 0.0035, trim, "cloth");
    for (const s of [-1, 1]) seam([[s * 0.083, 1.18, 0.004], [s * 0.1, 1.04, 0.004], [s * 0.1, 0.93, 0.004]], 0.0025, trim, "cloth");
    rivet(0, 1.24, 0.006, 0.008);
  } else if (body === "mail") {
    torsoBand(0.9, 1.44, 0.018, col("#8a8f96"), "mail", 10);
    torsoBand(1.4, 1.465, 0.027, gear, "leather", 3);
    skirt(0.97, 0.62, 0.024, 0.05, col("#8a8f96"), "mail");
    // tabard panels approximated as an outer skirt band in gear colour
    torsoBand(1.0, 1.38, 0.026, gear, "cloth", 6);
    skirt(0.97, 0.58, 0.032, 0.05, gear, "cloth");
    for (const k of ["L", "R"]) { armBand(k, 0.0, 0.5, 0.014, col("#8a8f96"), "mail"); armBand(k, 0.68, 0.97, 0.012, leather, "leather"); }
    seam([[0, 1.37, 0.004], [0, 1.16, 0.004], [0, 1.0, 0.004]], 0.0035, trim, "metal");
    for (const s of [-1, 1]) {
      seam([[s * 0.1, 1.38, 0.004], [s * 0.1, 1.19, 0.004], [s * 0.12, 1.01, 0.004]], 0.003, trim, "metal");
      rivet(s * 0.1, 1.29, 0.004);
    }
  }

  if (look.armorStyle === "studded") {
    for (const s of [-1, 1]) for (const y of [1.08, 1.17, 1.26, 1.35]) {
      rivet(s * 0.085, y, 0.006, 0.006);
      rivet(s * 0.13, y, 0.006, 0.005);
    }
  } else if (look.armorStyle === "riveted") {
    for (const s of [-1, 1]) for (const y of [1.04, 1.12, 1.2, 1.28, 1.36]) rivet(s * 0.12, y, 0.006, 0.004);
  } else if (look.armorStyle === "breastplate" || look.armorStyle === "warden") {
    const lift = 0.006;
    for (const s of [-1, 1]) {
      seam([[0, 1.3, lift], [s * 0.06, 1.28, lift], [s * 0.1, 1.17, lift], [0, 1.1, lift]], 0.003, trim);
      for (const y of [1.1, 1.18, 1.3]) rivet(s * 0.1, y, lift, 0.005);
    }
    if (look.armorStyle === "warden") seam([[-0.11, 1.38, lift], [0, 1.43, lift], [0.11, 1.38, lift]], 0.005, trim);
  } else if (look.armorStyle === "scholar") {
    const color = col("#d8d1b8");
    seam([[0, 1.34, 0.006], [-0.04, 1.28, 0.006], [0, 1.22, 0.006], [0.04, 1.28, 0.006], [0, 1.34, 0.006]], 0.0025, color, "cloth");
    seam([[0, 1.22, 0.006], [0, 1.08, 0.006]], 0.002, color, "cloth");
  }

  const geom = B.build();
  return { geom, defs, layout: S };
}

// ---------- Head (rigid, parented to head bone) ----------
// Returns { group, ellipsoid:{c, r}, eyes:{irisMat}, lids } in head-bone space.
export function buildHead(look, mats) {
  const m = look.sex ?? 0.5;
  const hs = look.head ?? 1;
  const face = look.face || {};
  const rx = lerp(0.073, 0.078, m) * hs * (face.width || 1);
  const ry = lerp(0.106, 0.112, m) * hs * (face.length || 1);
  const rz = lerp(0.094, 0.099, m) * hs * (face.depth || 1);
  const c = V(0, 0.105 * hs, 0.012);
  const jaw = look.jaw ?? 0.5, nose = look.nose ?? 0.5;
  const g = new THREE.SphereGeometry(1, 64, 48);
  const pa = g.attributes.position;
  const skin = col(look.skin || "#c99a7a");
  const lip = skin.clone().lerp(col("#9a4a4a"), 0.35);
  const colors = [];
  const deform = (x, y, z, out) => {
    let px = x * rx, py = y * ry, pz = z * rz;
    if (y < 0) {
      const k = -y;
      px *= 1 - (0.3 - jaw * 0.12 - m * 0.06) * k * k / (face.jaw || 1);
      pz *= 1 - 0.12 * k * k * (z < 0 ? 2.2 : 0.6);
    }
    if (z < 0 && y > -0.3) pz *= 1.05;
    if (z > 0) {
      pz *= 1 - 0.1 * x * x;
      const f = Math.pow(z, 4);
      pz += (0.012 + nose * 0.018) * (face.nose || 1) * gauss(x, 0.12) * gauss(y + 0.08, 0.17) * f; // nose
      pz -= 0.006 * gauss(x, 0.08) * gauss(y + 0.02, 0.05) * f * (1 - nose); // bridge
      pz -= 0.009 * gauss(Math.abs(x) - 0.4, 0.15) * gauss(y - 0.1, 0.11) * f; // sockets
      pz += (0.004 + m * 0.006) * (face.brow || 1) * gauss(y - 0.27, 0.07) * (Math.abs(x) < 0.65 ? 1 : 0.3) * f; // brow
      px *= 1 + 0.05 * (face.cheek || 1) * gauss(y + 0.02, 0.12) * z; // cheekbones
      pz += 0.004 * gauss(x, 0.2) * gauss(y + 0.45, 0.06) * f; // lips
      pz += (0.004 + jaw * 0.008) * gauss(x, 0.25) * gauss(y + 0.78, 0.12) * f; // chin
    }
    out.set(px + c.x, py + c.y, pz + c.z);
    return out;
  };
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    deform(x, y, z, tmp);
    pa.setXYZ(i, tmp.x, tmp.y, tmp.z);
    let cc = skinColor(look, tmp, skin);
    if (z > 0.6 && Math.abs(x) < 0.3 && Math.abs(y + 0.45) < 0.06) cc = lip;
    colors.push(cc.r, cc.g, cc.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const group = new THREE.Group();
  const headMesh = new THREE.Mesh(g, mats.matte);
  headMesh.castShadow = true;
  group.add(headMesh);

  // Eyes
  const eyeScale = (look.eyes ?? 1);
  const er = 0.0125 * eyeScale;
  const sclera = look.ancestry === "drakesworn" ? 0xd3bd98 : look.ancestry === "rookfolk" ? 0xe1cda8 : look.ancestry === "hollowed" ? 0xcbd5dc : 0xf2eee6;
  const eyeWhite = new THREE.MeshStandardMaterial({ color: sclera, roughness: 0.25 });
  const irisMat = new THREE.MeshStandardMaterial({ color: col(look.eyeColor || "#5a3a22"), roughness: 0.2, emissive: new THREE.Color(0), emissiveIntensity: 1 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const lidMat = new THREE.MeshStandardMaterial({ color: skin.clone().multiplyScalar(0.92), roughness: 0.7 });
  const lids = [];
  const irises = [];
  for (const s of [1, -1]) {
    const ux = 0.4 * (face.eyeSpread || 1) * s, uy = 0.11;
    const uz = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
    const p = deform(ux, uy, uz, new THREE.Vector3());
    const n = new THREE.Vector3(0, 0, 1);
    p.addScaledVector(n, -er * 0.55);
    const eye = new THREE.Group();
    eye.position.copy(p);
    eye.rotation.y = s * 0.12;
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(er, 16, 12), eyeWhite));
    const iris = new THREE.Mesh(new THREE.CircleGeometry(er * 0.55, 18), irisMat);
    iris.position.z = er * 0.985;
    eye.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(er * 0.24, 12), pupilMat);
    pupil.position.z = er * 0.99 + 0.0004;
    if (look.ancestry === "drakesworn") pupil.scale.set(0.42, 1.3, 1);
    else if (look.ancestry === "gloamling" || look.ancestry === "rookfolk") pupil.scale.set(1.22, 1.22, 1);
    eye.add(pupil);
    irises.push(iris);
    // upper lid (half shell) for blinks
    const lid = new THREE.Mesh(new THREE.SphereGeometry(er * 1.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
    lid.rotation.x = -0.35;
    eye.add(lid);
    lids.push(lid);
    group.add(eye);
    // brow
    const bx = 0.4 * (face.eyeSpread || 1) * s;
    const bp = deform(bx, 0.3, Math.sqrt(1 - bx * bx - 0.09), new THREE.Vector3());
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.032 * hs, 0.0055, 0.008), mats.browMat);
    brow.position.copy(bp).add(V(0, 0, 0.003));
    brow.rotation.z = s * (0.08 + m * 0.05);
    brow.rotation.y = s * 0.25;
    group.add(brow);
  }
  // Ears
  const ears = look.ears || "round";
  if (!look.helmet || ears === "round") for (const s of [1, -1]) {
    const ep = deform(s * 0.98, 0.0, -0.08, new THREE.Vector3());
    const ear = buildEar(ears, s, mats, skin);
    ear.position.copy(ep);
    group.add(ear);
  }
  // Drakesworn crest ridge
  if (look.crest && !look.helmet) {
    for (let i = 0; i < 6; i++) {
      const a = -0.2 + i * 0.32;
      const p = deform(0, Math.cos(a), -Math.sin(a) * 0.95 + 0.2, new THREE.Vector3());
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03 - i * 0.003, 6), mats.matte);
      sp.position.copy(p);
      sp.lookAt(p.clone().sub(c).multiplyScalar(2).add(c));
      sp.rotateX(Math.PI / 2);
      group.add(sp);
    }
  }
  addAncestryFace(group, look, deform, { rx, ry, rz, c, hs, skin });
  return { group, ellipsoid: { c, r: V(rx, ry, rz) }, irisMat, irises, lids, deform };
}

// Features live on the head bone, never on the armour or weapon rig. Raised
// forms and mapped surface lines survive changes of class, gear and animation.
function addAncestryFace(group, look, deform, dims) {
  const { rx, ry, rz, c, hs, skin } = dims;
  const kind = look.ancestry || "valeborn";
  const mat = (color, roughness = 0.78, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const shadow = mat(skin.clone().multiplyScalar(0.56));
  const light = mat(skin.clone().lerp(col("#fff0ce"), 0.24));
  const dark = mat(skin.clone().multiplyScalar(0.67));
  const feature = (geometry, material, p, scale) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(p);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const surf = (x, y, lift = 0.003) => {
    const z = Math.sqrt(Math.max(0.025, 1 - x * x - y * y));
    const p = deform(x, y, z, new THREE.Vector3());
    p.z += lift;
    return p;
  };
  const oval = (x, y, w, h, depth, material, lift = 0.003) =>
    feature(new THREE.SphereGeometry(1, 12, 8), material, surf(x, y, lift), [w * hs, h * hs, depth * hs]);
  const stroke = (points, material, radius = 0.0018) => {
    const path = new THREE.CatmullRomCurve3(points.map(([x, y]) => surf(x, y, radius * 0.7)));
    feature(new THREE.TubeGeometry(path, Math.max(8, points.length * 5), radius * hs, 5, false), material, V(0, 0, 0));
  };
  const both = (fn) => { for (const s of [-1, 1]) fn(s); };

  if (kind === "valeborn") {
    const freckle = mat(skin.clone().multiplyScalar(0.79));
    both((s) => {
      for (let i = 0; i < 6; i++) {
        const x = s * (0.33 + (i % 3) * 0.085);
        const y = -0.1 - Math.floor(i / 3) * 0.065 + ((i % 2) * 0.018);
        oval(x, y, 0.0019, 0.0015, 0.0006, freckle);
      }
    });
  } else if (kind === "bronzeborn") {
    const stone = mat(skin.clone().lerp(col("#a17046"), 0.38), 0.92);
    both((s) => {
      oval(s * 0.4, 0.31, 0.034, 0.009, 0.008, stone);
      stroke([[s * 0.48, -0.3], [s * 0.62, -0.43], [s * 0.42, -0.67]], dark, 0.0022);
      stroke([[s * 0.28, -0.69], [s * 0.37, -0.79], [s * 0.21, -0.83]], light, 0.0014);
    });
    oval(0, -0.83, 0.029, 0.01, 0.006, stone);
  } else if (kind === "thornkin") {
    const bark = mat(skin.clone().lerp(col("#34502a"), 0.62), 0.94);
    const moss = mat("#7e9f56", 0.95);
    both((s) => {
      stroke([[s * 0.15, 0.37], [s * 0.34, 0.31], [s * 0.67, 0.43]], bark, 0.003);
      stroke([[s * 0.64, 0.36], [s * 0.72, 0.08], [s * 0.53, -0.24], [s * 0.57, -0.48]], bark, 0.0024);
      stroke([[s * 0.59, -0.14], [s * 0.41, -0.28], [s * 0.37, -0.49]], dark, 0.0015);
      oval(s * 0.68, 0.35, 0.008, 0.013, 0.003, moss);
    });
  } else if (kind === "saltborn") {
    const pearl = mat(skin.clone().lerp(col("#c9e5df"), 0.38), 0.48);
    const gill = mat(skin.clone().lerp(col("#245c68"), 0.58), 0.7);
    both((s) => {
      for (let i = 0; i < 3; i++) {
        const y = -0.14 - i * 0.105;
        stroke([[s * 0.66, y + 0.05], [s * 0.72, y], [s * 0.65, y - 0.052]], gill, 0.0022);
      }
      for (let i = 0; i < 4; i++) oval(s * (0.31 + i * 0.1), 0.44 - (i % 2) * 0.09, 0.004, 0.006, 0.002, pearl);
      stroke([[s * 0.25, -0.5], [s * 0.38, -0.55], [s * 0.52, -0.54]], pearl, 0.0014);
    });
  } else if (kind === "cindrel") {
    const ash = mat("#2a2221", 0.96);
    const ember = new THREE.MeshStandardMaterial({ color: "#df6938", emissive: "#bd3613", emissiveIntensity: 0.55, roughness: 0.7 });
    both((s) => {
      stroke([[s * 0.56, 0.27], [s * 0.47, 0.03], [s * 0.61, -0.16], [s * 0.44, -0.38]], ash, 0.0032);
      stroke([[s * 0.49, 0.01], [s * 0.62, -0.15], [s * 0.48, -0.34]], ember, 0.00125);
      stroke([[s * 0.19, -0.57], [s * 0.32, -0.68], [s * 0.41, -0.63]], ash, 0.0018);
      if (!look.helmet) {
        const horn = feature(new THREE.ConeGeometry(0.012 * hs, 0.052 * hs, 9), ash, V(s * rx * 0.74, c.y + ry * 0.79, c.z - rz * 0.14));
        horn.rotation.z = -s * 0.3;
      }
    });
  } else if (kind === "gloamling") {
    const shade = mat(skin.clone().lerp(col("#4c435d"), 0.48), 0.96);
    both((s) => {
      oval(s * 0.46, 0.12, 0.025, 0.021, 0.0025, shade, -0.006);
      stroke([[s * 0.22, -0.08], [s * 0.42, -0.18], [s * 0.65, -0.08]], light, 0.0015);
      oval(s * 0.69, -0.33, 0.004, 0.006, 0.002, light);
    });
  } else if (kind === "skyrill") {
    const plume = mat(skin.clone().lerp(col("#e6ddd2"), 0.46));
    both((s) => {
      for (let i = 0; i < 3; i++) {
        const y = -0.08 - i * 0.11;
        stroke([[s * 0.48, y], [s * 0.67, y + 0.09], [s * 0.8, y + 0.12]], plume, 0.0022 - i * 0.0003);
      }
      stroke([[s * 0.17, 0.37], [s * 0.37, 0.31], [s * 0.62, 0.42]], light, 0.0016);
    });
  } else if (kind === "drakesworn") {
    const scale = mat(skin.clone().multiplyScalar(0.74), 0.66);
    const ridge = mat(skin.clone().lerp(col("#d4b38b"), 0.24), 0.62);
    // Broad, forward muzzle with a separate lower jaw changes the profile.
    const muzzle = feature(new THREE.SphereGeometry(1, 22, 14), mat(skin, 0.69), V(0, c.y - ry * 0.38, c.z + rz * 0.91), [rx * 0.69, ry * 0.29, rz * 0.56]);
    muzzle.rotation.x = -0.1;
    feature(new THREE.SphereGeometry(1, 18, 10), scale, V(0, c.y - ry * 0.69, c.z + rz * 1.08), [rx * 0.51, ry * 0.085, rz * 0.36]);
    both((s) => {
      feature(new THREE.SphereGeometry(1, 10, 8), scale, V(s * rx * 0.32, c.y - ry * 0.32, c.z + rz * 1.37), [rx * 0.085, ry * 0.038, rz * 0.025]);
      for (let i = 0; i < 3; i++) oval(s * (0.48 + i * 0.14), 0.23 - i * 0.13, 0.009, 0.012, 0.004, ridge);
      stroke([[s * 0.24, 0.39], [s * 0.49, 0.37], [s * 0.68, 0.25]], scale, 0.004);
      if (!look.helmet) {
        const horn = feature(new THREE.ConeGeometry(0.017 * hs, 0.084 * hs, 10), ridge, V(s * rx * 0.66, c.y + ry * 0.81, c.z - rz * 0.12));
        horn.rotation.z = -s * 0.42;
      }
    });
  } else if (kind === "hollowed") {
    const blue = new THREE.MeshStandardMaterial({ color: "#6d95a9", emissive: "#315675", emissiveIntensity: 0.38, roughness: 0.75 });
    both((s) => {
      stroke([[s * 0.5, 0.29], [s * 0.63, 0.07], [s * 0.56, -0.18], [s * 0.7, -0.35]], dark, 0.0021);
      stroke([[s * 0.56, -0.17], [s * 0.43, -0.32], [s * 0.47, -0.5]], blue, 0.00125);
      oval(s * 0.72, -0.37, 0.004, 0.006, 0.002, blue);
    });
  } else if (kind === "rookfolk") {
    const horn = mat("#514939", 0.61);
    const feather = mat(look.hair?.color || "#24242b", 0.93);
    const beak = feature(new THREE.ConeGeometry(0.024 * hs, 0.074 * hs, 7), horn, V(0, c.y - ry * 0.18, c.z + rz * 1.19));
    beak.rotation.x = Math.PI / 2;
    both((s) => {
      for (let i = 0; i < 3; i++) {
        stroke([[s * 0.55, 0.28 - i * 0.09], [s * 0.73, 0.22 - i * 0.09], [s * 0.82, 0.17 - i * 0.08]], feather, 0.0022);
      }
      oval(s * 0.62, -0.34, 0.006, 0.012, 0.002, feather);
    });
  }
}

function buildEar(type, s, mats, skin) {
  const g = new THREE.Group();
  const mat = mats.matte;
  const shape = (pts, depth = 0.006) => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]);
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 6 });
    const c = [];
    for (let i = 0; i < geo.attributes.position.count; i++) c.push(skin.r, skin.g, skin.b);
    geo.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    const mesh = new THREE.Mesh(geo, mats.matteDS || mat);
    // Face outward; shape +x points backward on both sides (mirrored on the right).
    mesh.rotation.y = s * (Math.PI / 2 - 0.3);
    if (s < 0) mesh.scale.x = -1;
    mesh.castShadow = true;
    return mesh;
  };
  if (type === "pointed") g.add(shape([[0.0, -0.025], [0.02, -0.015], [0.03, 0.02], [0.045, 0.06], [0.012, 0.025], [0.0, 0.02]]));
  else if (type === "tall") g.add(shape([[0.0, -0.03], [0.03, -0.01], [0.05, 0.05], [0.055, 0.1], [0.02, 0.05], [0.0, 0.025]]));
  else if (type === "fin") g.add(shape([[0.0, -0.03], [0.04, -0.03], [0.05, 0.0], [0.045, 0.035], [0.02, 0.03], [0.0, 0.02]], 0.003));
  else if (type === "frill") g.add(shape([[0.0, -0.035], [0.05, -0.045], [0.06, 0.0], [0.05, 0.04], [0.0, 0.025]], 0.003));
  else if (type === "tuft") g.add(shape([[0.0, -0.02], [0.02, -0.012], [0.03, 0.03], [0.038, 0.055], [0.015, 0.025], [0.0, 0.015]]));
  else g.add(shape([[0.0, -0.025], [0.015, -0.02], [0.022, 0.0], [0.018, 0.022], [0.0, 0.025]]));
  g.children[0].geometry.translate(0, 0, 0);
  return g;
}

// Weapon geometry lives in weapon-mesh.js; keep this export for existing callers.
export { buildWeapon } from "./weapon-mesh.js";

export function makeSkeleton(defs) {
  const bones = {};
  const list = [];
  const world = {};
  for (const [name, parent, pos] of defs) {
    const bone = new THREE.Bone();
    bone.name = name;
    world[name] = pos;
    if (parent) {
      bone.position.copy(pos).sub(world[parent]);
      bones[parent].add(bone);
    } else bone.position.copy(pos);
    bones[name] = bone;
    list.push(bone);
  }
  return { bones, list, skeleton: new THREE.Skeleton(list) };
}
