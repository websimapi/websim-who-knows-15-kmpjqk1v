// Dynamic strand hair. Guide strands are rooted on the scalp (or jaw for
// beards), styled into a rest shape in head space, then simulated every frame
// with Verlet integration + follow-the-leader length constraints, shape
// memory, gravity, wind and collisions against the head and shoulders.
// Each guide renders a small clump of camera-facing, alpha-tested ribbons.
import * as THREE from "three";
import { HAIR_STYLES, BEARD_STYLES } from "./data.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
// The sculpted skull (rig.js buildHead) is ~5% deeper behind the ears than
// its ellipsoid; roots and collisions use the fuller back so strands sit on it.
const BACK = 1.06;

// ---------- strand textures ----------
const texCache = {};
function strandTexture(kind = "hair") {
  if (texCache[kind]) return texCache[kind];
  const w = 64, h = 256;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  g.clearRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (kind === "leaf") {
    g.strokeStyle = "rgba(255,255,255,1)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    for (let y = 10; y < h; y += 26) {
      for (const s of [-1, 1]) {
        g.fillStyle = `rgba(255,255,255,${0.85 + rnd() * 0.15})`;
        g.beginPath();
        g.ellipse(w / 2 + s * 14, y + 8, 13, 6, s * 0.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (kind === "feather") {
    g.strokeStyle = "white"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.lineWidth = 1.4;
    for (let y = 4; y < h; y += 3) {
      const span = (w / 2 - 2) * Math.sin((y / h) * Math.PI * 0.9 + 0.2);
      g.strokeStyle = `rgba(255,255,255,${0.7 + rnd() * 0.3})`;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + s * span, y + 9); g.stroke(); }
    }
  } else {
    for (let i = 0; i < 46; i++) {
      const x = 3 + rnd() * (w - 6);
      const a = 0.55 + rnd() * 0.45;
      const lw = 1 + rnd() * 2.2;
      const end = h * (0.75 + rnd() * 0.25);
      const grad = g.createLinearGradient(0, 0, 0, end);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(0.8, `rgba(255,255,255,${a})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.strokeStyle = grad; g.lineWidth = lw;
      g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + (rnd() - 0.5) * 8, end * 0.33, x + (rnd() - 0.5) * 8, end * 0.66, x + (rnd() - 0.5) * 6, end);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache[kind] = t;
  return t;
}

// ---------- scalp / jaw masks (unit direction on the head ellipsoid) ----------
function scalpMask(n, style) {
  if (style.crest) return n.y > 0.1 && Math.abs(n.x) < 0.2;
  if (n.y < -0.48) return false;
  if (n.z > 0.28 && n.y < 0.5) return false; // face + forehead
  if (n.z > -0.3 && n.y < 0.08 && Math.abs(n.x) > 0.5) return false; // ears / temples
  if (n.z > 0.0 && n.y < 0.32) return false;
  return true;
}
function beardMask(n) {
  if (n.y > -0.05 || n.y < -0.97) return false;
  if (n.z < 0.0) return false;
  if (n.z > 0.55 && n.y > -0.2 && Math.abs(n.x) > 0.22) return false; // upper cheeks
  if (Math.abs(n.x) < 0.3 && n.y < -0.36 && n.y > -0.52 && n.z > 0.7) return false; // lips
  if (Math.abs(n.x) > 0.93) return false;
  return true;
}

export function resolveHairParams(p = {}, kind = "scalp") {
  const table = kind === "beard" ? BEARD_STYLES : HAIR_STYLES;
  const styleKey = table[p.style] ? p.style : kind === "beard" ? "none" : "swept";
  const st = table[styleKey];
  return {
    style: styleKey,
    length: p.length ?? st.length ?? 0.15,
    volume: p.volume ?? st.volume ?? 0.4,
    curl: p.curl ?? st.curl ?? 0,
    fringe: p.fringe ?? st.fringe ?? 0.4,
    stiff: p.stiff ?? st.stiff ?? 0.5,
    sweep: p.sweep ?? st.sweep ?? 0,
    density: p.density ?? 1,
    thick: p.thick ?? 1,
    color: p.color || "#3a2a1c",
    tip: p.tip || p.color || "#3a2a1c",
    groom: Array.isArray(p.groom) ? p.groom.slice(-32) : [],
    tie: st.tie, crest: st.crest, bald: styleKey === "bald" || styleKey === "none",
  };
}

export class Hair {
  // opts: { head: Bone, ellipsoid:{c,r}, params, kind, guides, bodyColliders(): [{c,r}], texture }
  constructor(opts) {
    this.opts = opts;
    this.kind = opts.kind || "scalp";
    this.head = opts.head;
    this.ell = opts.ellipsoid;
    this.mesh = null;
    this.cap = null;
    this.mat = null;
    this._m = new THREE.Matrix4();
    this._mi = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._root = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._hairCam = new THREE.Vector3();
    this._hairCenter = new THREE.Vector3();
    this._hairTangent = new THREE.Vector3();
    this._hairSide = new THREE.Vector3();
    this._hairToCam = new THREE.Vector3();
    this._hairNormal = new THREE.Vector3();
    this._hairPoint = new THREE.Vector3();
    this._hairOffset = new THREE.Vector3();
    this.lastRoot = new THREE.Vector3(1e9, 0, 0);
    this.enabled = true;
    this.setParams(opts.params);
  }

  setParams(params) {
    this.params = resolveHairParams(params, this.kind);
    this.build();
  }

  dispose() {
    if (this.mesh) { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }
    if (this.cap) {
      this.cap.removeFromParent();
      const materials = new Set();
      this.cap.traverse((node) => {
        node.geometry?.dispose();
        if (node.material) materials.add(node.material);
      });
      materials.forEach(material => material.dispose());
    }
    this.mesh = this.cap = null;
  }

  // ---------- rest shape ----------
  build() {
    const parent = this.mesh?.parent;
    this.dispose();
    const P = this.params;
    if (P.bald || P.length < 0.004) { this.guides = []; return; }
    const { c, r } = this.ell;
    const isBeard = this.kind === "beard";
    const quality = this.opts.guides ?? 160;
    const count = Math.round(quality * (isBeard ? 0.55 : 1) * (0.6 + P.density * 0.4) * (P.crest ? 0.5 : 1));
    const inflate = 1.03 + P.volume * 0.14;
    const style = { crest: P.crest };

    // Spread roots over the whole allowed scalp. Stopping as soon as the
    // target count was reached used to fill only the crown, leaving the sides
    // and back bare and making every preset look like a spiky topknot.
    const roots = [];
    const N = count * 9;
    for (let i = 0; i < N; i++) {
      const y = 1 - (i + 0.5) / N * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = i * 2.399963;
      const n = V(Math.cos(th) * rad, y, Math.sin(th) * rad);
      const ok = isBeard ? beardMask(n) : scalpMask(n, style);
      if (ok) roots.push(n);
    }
    const picked = Array.from({ length: Math.min(count, roots.length) }, (_, i) =>
      roots[Math.floor((i + 0.5) * roots.length / Math.min(count, roots.length))]);

    const surf = (n, k = 1) => V(c.x + n.x * r.x * k, c.y + n.y * r.y * k, c.z + n.z * r.z * k * (n.z < 0 ? BACK : 1));
    const pushOut = (p, k) => {
      const rz = r.z * (p.z < c.z ? BACK : 1);
      const ex = (p.x - c.x) / (r.x * k), ey = (p.y - c.y) / (r.y * k), ez = (p.z - c.z) / (rz * k);
      const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (d < 1) { p.set(c.x + (ex / d) * r.x * k, c.y + (ey / d) * r.y * k, c.z + (ez / d) * rz * k); }
      // shoulders / upper back (head space; head bone ≈ 0.12 m above shoulders)
      for (const [sx, sy, sz, sr] of [[0.15, -0.2, -0.02, 0.1], [-0.15, -0.2, -0.02, 0.1], [0, -0.28, -0.03, 0.16]]) {
        const dx = p.x - sx, dy = p.y - sy, dz = p.z - sz;
        const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dd < sr) { const s = sr / dd; p.set(sx + dx * s, sy + dy * s, sz + dz * s); }
      }
    };
    const groomAt = (n) => {
      const g = V(0, 0, 0);
      for (const s of P.groom) {
        const dx = n.x - s.p[0], dy = n.y - s.p[1], dz = n.z - s.p[2];
        const w = Math.exp(-(dx * dx + dy * dy + dz * dz) / 0.09);
        g.x += s.d[0] * w * 1.6; g.y += s.d[1] * w * 1.6; g.z += s.d[2] * w * 1.6;
      }
      return g;
    };

    const ties = [];
    if (P.tie === "pony") ties.push(V(0, c.y + r.y * 0.1, c.z - r.z * 1.04 * BACK));
    if (P.tie === "twin") { ties.push(V(r.x * 0.9, c.y - r.y * 0.25, c.z - r.z * 0.3)); ties.push(V(-r.x * 0.9, c.y - r.y * 0.25, c.z - r.z * 0.3)); }
    if (P.tie === "bun") ties.push(V(0, c.y + r.y * 0.62, c.z - r.z * 0.78 * BACK));

    this.guides = [];
    let gi = 0;
    for (const n of picked) {
      gi++;
      const root = surf(n, 0.985);
      const pts = [root];
      const pin = [1];
      const isFringe = !isBeard && n.z > 0.14 && n.y > 0.48 && !P.tie;
      let len = P.length * (0.88 + ((gi * 37) % 23) / 23 * 0.24);
      if (P.style === "layered") len *= 0.68 + 0.48 * clamp01((n.y + 0.4) / 1.4);
      if (P.style === "bob") len *= 0.88 + 0.25 * clamp01(n.y + 0.2);
      if (P.style === "sidepart" && isFringe) len *= n.x < -0.03 ? 0.65 : 1.15;
      if (isFringe) len = Math.min(len, 0.018 + P.fringe * 0.062);
      if (isBeard) len *= 0.6 + 0.4 * clamp01(-n.y * 1.4); // longer at chin
      const groom = groomAt(n);

      if (ties.length && !isBeard) {
        // --- gathered styles: root → tie along the scalp, then a tail ---
        const T = ties.length === 2 ? ties[n.x >= 0 ? 0 : 1] : ties[0];
        const KA = 4;
        for (let i = 1; i <= KA; i++) {
          const q = root.clone().lerp(T, i / KA);
          pushOut(q, 1.04);
          pts.push(q); pin.push(1);
        }
        const tailK = P.tie === "bun" ? 9 : Math.max(5, Math.min(14, Math.round(P.length / 0.035)));
        const ang = Math.atan2(n.y, n.x) + gi * 0.7;
        const spread = (P.tie === "twin" ? 0.009 : 0.014) * (0.5 + P.volume);
        for (let i = 1; i <= tailK; i++) {
          const t = i / tailK;
          let q;
          if (P.tie === "bun") {
            const a = ang + t * Math.PI * 3.2;
            const rr = 0.04 * (1 - t * 0.55);
            q = T.clone().add(V(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, -0.03 * (1 - t) - 0.015 + Math.sin(a) * 0.01));
            pin.push(1);
          } else {
            const side = P.tie === "twin" ? Math.sign(T.x) : 0;
            const down = V(side * 0.15, -1, P.tie === "twin" ? 0.35 : -0.25).normalize();
            const startDir = P.tie === "twin" ? V(side * 0.6, -0.4, 0.2).normalize() : V(0, -0.15, -1).normalize();
            const dir = startDir.lerp(down, smooth(clamp01(t * 2.2))).normalize();
            const prev = pts[pts.length - 1];
            q = prev.clone().addScaledVector(dir, len / tailK);
            // keep the strand bundled around the tail axis
            const br = spread * (1 - t * 0.35);
            const braid = P.tie === "twin" ? Math.sin(t * 26 + (gi % 3) * 2.1) * 0.006 : 0;
            q.x += Math.cos(ang) * br * 0.3 + braid;
            q.z += Math.sin(ang) * br * 0.3;
            pushOut(q, 1.08);
            pin.push(i <= 1 ? 0.8 : 0);
          }
          pts.push(q);
        }
      } else {
        // --- free-flowing styles ---
        const K = Math.max(3, Math.min(16, Math.round(len / (P.curl > 0.3 ? 0.014 : 0.022))));
        const seg = len / K;
        const naturalLift = clamp01(P.stiff * 0.75 + P.volume * 0.25);
        const lift = P.crest ? 0.93 : isBeard ? naturalLift * 0.65
          : P.style === "crop" ? 0.22 : P.style === "sidepart" ? 0.34
          : P.style === "swept" ? 0.39 : P.style === "wild" ? 0.67
          : P.style === "curls" ? 0.57 : naturalLift * 0.55;
        let flow;
        if (isBeard) flow = V(0, -1, 0.35);
        else if (isFringe) flow = V(n.x * 0.28 + P.sweep * 0.72, -0.74, 0.48);
        else if (P.crest) flow = V(P.sweep * 0.3, 0.2, -0.6);
        else if (P.style === "sidepart") flow = V(0.55 + n.x * 0.28, -0.7, n.y > 0.55 ? -0.5 : -0.1);
        else flow = V(P.sweep * Math.max(0, n.y) * 0.8 + n.x * 0.13,
          n.y > 0.62 ? -0.48 : -1, -0.55 * Math.max(0, n.y) - 0.1);
        flow.add(groom).normalize();
        let p = root.clone();
        const curlR = P.curl * 0.028 * (isBeard ? 0.5 : 1);
        const curlW = (Math.PI * 2) / (0.07 - P.curl * 0.028);
        // Nearby guides bend into the same lock rather than forming static.
        const phase = Math.atan2(n.z, n.x) * 3 + n.y * 4;
        const b1 = new THREE.Vector3(), b2 = new THREE.Vector3();
        const center = [];
        for (let i = 1; i <= K; i++) {
          const t = i / K;
          const bend = P.crest ? 0.15 * t : smooth(clamp01(t * (1.2 + (1 - P.stiff) * 1.6)));
          const dir = n.clone().multiplyScalar((lift * (1 - bend)) + 0.04).addScaledVector(flow, bend * (1 - lift * 0.5) + 0.05).normalize();
          p = p.clone().addScaledVector(dir, seg);
          pushOut(p, inflate);
          center.push(p);
        }
        for (let i = 0; i < center.length; i++) {
          const q = center[i].clone();
          if (curlR > 0) {
            const prev = i ? center[i - 1] : root;
            const tng = q.clone().sub(prev).normalize();
            b1.crossVectors(tng, n).normalize();
            b2.crossVectors(tng, b1).normalize();
            const s = (i + 1) * seg;
            const amp = curlR * Math.min(1, s / 0.03);
            q.addScaledVector(b1, Math.cos(phase + s * curlW) * amp).addScaledVector(b2, Math.sin(phase + s * curlW) * amp);
          }
          pts.push(q);
          pin.push(0);
        }
      }
      const segLen = [0];
      for (let i = 1; i < pts.length; i++) segLen.push(pts[i].distanceTo(pts[i - 1]));
      this.guides.push({ rest: pts, pin, segLen, n, p: pts.map((q) => q.clone()), prev: pts.map((q) => q.clone()), init: false });
    }

    // ---------- render geometry ----------
    const C = Math.max(1, Math.round(1 + P.density * 2)); // ribbons per guide
    this.C = C;
    let vcount = 0;
    for (const g of this.guides) vcount += g.rest.length * 2 * C;
    const pos = new Float32Array(vcount * 3);
    const nor = new Float32Array(vcount * 3);
    const colr = new Float32Array(vcount * 3);
    const uv = new Float32Array(vcount * 2);
    const idx = [];
    const rootC = new THREE.Color(P.color).multiplyScalar(0.82);
    const tipC = new THREE.Color(P.tip);
    let v = 0;
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const g of this.guides) {
      g.children = [];
      const K = g.rest.length;
      for (let ci = 0; ci < C; ci++) {
        const off = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.012 + P.volume * 0.012);
        off.addScaledVector(g.n, -off.dot(g.n));
        const shade = 0.82 + rnd() * 0.3;
        g.children.push({ off, v0: v });
        for (let i = 0; i < K; i++) {
          const t = i / (K - 1);
          const cc = rootC.clone().lerp(tipC, Math.pow(t, 0.8)).multiplyScalar(shade);
          for (let s = 0; s < 2; s++) {
            colr.set([cc.r, cc.g, cc.b], v * 3);
            uv.set([s, t], v * 2);
            v++;
          }
          if (i < K - 1) {
            const a = g.children[ci].v0 + i * 2;
            idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(colr, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const texKind = this.opts.texture || "hair";
    if (!this.mat) {
      this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: strandTexture(texKind), alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.48, metalness: 0.05 });
      this.depthMat = new THREE.MeshDepthMaterial({ map: strandTexture(texKind), alphaTest: 0.38, side: THREE.DoubleSide });
    }
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = this.depthMat;
    this.width = (isBeard ? 0.009 : 0.016) * P.thick * (texKind === "hair" ? 1 : 1.5);
    if (parent) parent.add(this.mesh);

    // scalp cap: hair-coloured shell under the roots so no skin shows through.
    // It follows the sculpted skull (deform) rather than the bare ellipsoid,
    // otherwise the fuller back of the head pokes straight through it.
    const sg = new THREE.SphereGeometry(1, 48, 34).toNonIndexed();
    const sp = sg.attributes.position;
    const keep = [];
    const capC = new THREE.Color(P.color).multiplyScalar(isBeard ? 0.9 : 0.8);
    const deform = this.opts.deform;
    const capPt = new THREE.Vector3();
    const capAt = (x, y, z) => {
      if (deform) deform(x, y, z, capPt);
      else capPt.set(c.x + x * r.x, c.y + y * r.y, c.z + z * r.z);
      // push out a few millimetres along the radial direction
      const dx = capPt.x - c.x, dy = capPt.y - c.y, dz = capPt.z - c.z;
      const l = Math.hypot(dx, dy, dz) || 1, k = (l + 0.0022) / l;
      return [c.x + dx * k, c.y + dy * k, c.z + dz * k];
    };
    for (let i = 0; i < sp.count; i += 3) {
      let ok = true;
      for (let k = 0; k < 3; k++) {
        const n = V(sp.getX(i + k), sp.getY(i + k), sp.getZ(i + k));
        if (!(isBeard ? beardMask(n) : scalpMask(n, style))) ok = false;
      }
      if (ok) for (let k = 0; k < 3; k++) keep.push(...capAt(sp.getX(i + k), sp.getY(i + k), sp.getZ(i + k)));
    }
    if (keep.length) {
      const cg = new THREE.BufferGeometry();
      cg.setAttribute("position", new THREE.Float32BufferAttribute(keep, 3));
      cg.computeVertexNormals();
      this.cap = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: capC, roughness: 0.9, transparent: isBeard, opacity: isBeard ? 0.55 : 1 }));
      this.head.add(this.cap);
      // a leather tie where gathered styles are bound
      if (!isBeard && ties.length && P.tie !== "bun") {
        const band = new THREE.MeshStandardMaterial({ color: 0x2a1d16, roughness: 0.7 });
        for (const T of ties) {
          const tie = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0045, 6, 16), band);
          tie.position.copy(T);
          if (P.tie === "pony") tie.position.z -= 0.012;
          else { tie.position.x += Math.sign(T.x) * 0.01; tie.rotation.y = Math.PI / 2; }
          tie.castShadow = true;
          this.cap.add(tie);
        }
      }
    }
  }

  // Place hair into a scene-space parent (world coordinates).
  attach(parent) { if (this.mesh) parent.add(this.mesh); this._parent = parent; }

  // ---------- simulation ----------
  update(dt, camera, wind, simulate = true, groundY = null) {
    if (!this.mesh || !this.guides.length) return;
    dt = Math.min(dt, 1 / 30);
    const P = this.params;
    this.head.updateWorldMatrix(true, false);
    const M = this._m.copy(this.head.matrixWorld);
    if (this.mesh.parent && this.mesh.parent !== this.head) {
      // hair positions live in the mesh parent's space
      this._mi.copy(this.mesh.parent.matrixWorld).invert();
      M.premultiply(this._mi);
    }
    const root0 = this._root.setFromMatrixPosition(M);
    const teleport = root0.distanceTo(this.lastRoot) > 1.5;
    this.lastRoot.copy(root0);
    const q = this._q.setFromRotationMatrix(M);
    const groundAt = typeof groundY === "function" ? groundY : groundY === null ? null : () => groundY;
    const keepAboveGround = (p, previous = null) => {
      if (!groundAt) return;
      const floor = groundAt(p.x, p.z) + .012;
      if (p.y < floor) { p.y = floor; if (previous) previous.y = floor; }
    };
    // Non-simulated hair still follows the animated head and faces the camera.
    // It has no Verlet state to advance, so avoid collision setup and copying
    // every point into a second previous-position array on every frame.
    if (!simulate) {
      for (const g of this.guides) {
        for (let i = 0; i < g.rest.length; i++) {
          g.p[i].copy(g.rest[i]).applyMatrix4(M);
          keepAboveGround(g.p[i]);
        }
        g.init = false;
      }
      this.writeGeometry(camera, M, groundAt);
      return;
    }
    const scale = this._scale.setFromMatrixScale(M).x;
    const grav = -9.8 * dt * dt;
    const damp = Math.pow(0.86, dt * 60);
    const kRelBase = (1 - Math.pow(1 - (0.06 + P.stiff * 0.42), dt * 60)) * (groundAt ? .45 : 1);
    const wx = (wind?.x || 0) * dt * dt, wz = (wind?.z || 0) * dt * dt;
    const colls = this.opts.bodyColliders ? this.opts.bodyColliders(this.mesh.parent) : [];
    const { c, r } = this.ell;
    const inflate = 1.02 + P.volume * 0.1;
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), d = new THREE.Vector3(), loc = new THREE.Vector3();
    const Minv = new THREE.Matrix4().copy(M).invert();
    const flutterTime = performance.now() * 0.003;

    for (const g of this.guides) {
      const K = g.rest.length;
      const restW = (i, out) => out.copy(g.rest[i]).applyMatrix4(M);
      if (!g.init || teleport) {
        for (let i = 0; i < K; i++) { restW(i, g.p[i]); g.prev[i].copy(g.p[i]); }
        g.init = true;
      }
      restW(0, g.p[0]);
      keepAboveGround(g.p[0]);
      for (let i = 1; i < K; i++) {
        const p = g.p[i], pp = g.prev[i];
        if (g.pin[i] >= 1) { restW(i, p); keepAboveGround(p); pp.copy(p); continue; }
        // verlet
        const vx = (p.x - pp.x) * damp, vy = (p.y - pp.y) * damp, vz = (p.z - pp.z) * damp;
        pp.copy(p);
        const flutter = 0.6 + 0.4 * Math.sin(flutterTime + i + g.n.x * 9);
        p.x += vx + wx * flutter; p.y += vy + grav; p.z += vz + wz * flutter;
        // shape memory relative to parent point
        t1.copy(g.rest[i]).sub(g.rest[i - 1]).applyQuaternion(q).multiplyScalar(scale).add(g.p[i - 1]);
        const t = i / (K - 1);
        // gathered tails hang from the tie and answer to gravity, not the styled rest shape
        const kr = kRelBase * (1 - t * 0.55) * (P.tie && P.tie !== "bun" ? 0.3 : 1) + g.pin[i] * 0.5;
        p.lerp(t1, Math.min(1, kr));
        // weak global memory keeps silhouettes styled
        restW(i, t2);
        p.lerp(t2, (P.stiff * P.stiff * (groundAt ? .025 : .08) + g.pin[i] * 0.3) * (1 - t * 0.7));
        // collisions: head ellipsoid in head space
        loc.copy(p).applyMatrix4(Minv);
        const rz = r.z * (loc.z < c.z ? BACK : 1);
        const ex = (loc.x - c.x) / (r.x * inflate), ey = (loc.y - c.y) / (r.y * inflate), ez = (loc.z - c.z) / (rz * inflate);
        const dd = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (dd < 1) { loc.set(c.x + (ex / dd) * r.x * inflate, c.y + (ey / dd) * r.y * inflate, c.z + (ez / dd) * rz * inflate); p.copy(loc.applyMatrix4(M)); }
        for (const s of colls) {
          d.subVectors(p, s.c);
          const l = d.length();
          if (l < s.r && l > 1e-6) p.copy(s.c).addScaledVector(d, s.r / l);
        }
        // follow-the-leader length constraint
        d.subVectors(p, g.p[i - 1]);
        const L = d.length() || 1e-6;
        const target = g.segLen[i] * scale;
        const corrX = d.x * (target / L - 1), corrY = d.y * (target / L - 1), corrZ = d.z * (target / L - 1);
        p.x += corrX; p.y += corrY; p.z += corrZ;
        pp.x += corrX * 0.85; pp.y += corrY * 0.85; pp.z += corrZ * 0.85;
        // Loose strands yield to the local terrain after the shape and length
        // constraints, so those constraints cannot pull them through it.
        keepAboveGround(p, pp);
      }
    }
    this.writeGeometry(camera, M, groundAt);
  }

  writeGeometry(camera, M, groundAt = null) {
    const geo = this.mesh.geometry;
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    const cam = this._hairCam.set(0, 0, 0);
    if (camera) {
      camera.getWorldPosition(cam);
      if (this.mesh.parent) this.mesh.parent.worldToLocal(cam);
    }
    const hc = this._hairCenter.copy(this.ell.c).applyMatrix4(M);
    const tng = this._hairTangent, side = this._hairSide, toCam = this._hairToCam;
    const n = this._hairNormal, pt = this._hairPoint, off = this._hairOffset;
    const scale = this._scale.setFromMatrixScale(M).x;
    const W = this.width * scale;
    for (const g of this.guides) {
      const K = g.p.length;
      for (const ch of g.children) {
        off.copy(ch.off).applyQuaternion(this._q).multiplyScalar(scale);
        let v = ch.v0;
        for (let i = 0; i < K; i++) {
          const t = i / (K - 1);
          const a = g.p[Math.max(0, i - 1)], b = g.p[Math.min(K - 1, i + 1)];
          tng.subVectors(b, a).normalize();
          pt.copy(g.p[i]).addScaledVector(off, (0.35 + t * 0.65) * (1 - t * 0.45));
          toCam.subVectors(cam, pt).normalize();
          side.crossVectors(tng, toCam).normalize();
          const w = W * (1 - t * 0.6) * 0.5;
          n.subVectors(pt, hc).normalize().multiplyScalar(0.65).addScaledVector(toCam, 0.35).normalize();
          for (let s = 0; s < 2; s++) {
            const sg = s ? w : -w;
            const x = pt.x + side.x * sg, y = pt.y + side.y * sg, z = pt.z + side.z * sg;
            pos[v * 3] = x; pos[v * 3 + 1] = groundAt ? Math.max(y, groundAt(x, z) + .004) : y; pos[v * 3 + 2] = z;
            nor[v * 3] = n.x; nor[v * 3 + 1] = n.y; nor[v * 3 + 2] = n.z;
            v++;
          }
        }
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }

  // Ray (world) → unit direction on the head ellipsoid, for combing.
  pick(ray) {
    this.head.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(this.head.matrixWorld).invert();
    const o = ray.origin.clone().applyMatrix4(inv);
    const dpt = ray.origin.clone().add(ray.direction).applyMatrix4(inv);
    const dir = dpt.sub(o).normalize();
    const { c, r } = this.ell;
    const k = 1.15 + this.params.volume * 0.2;
    // scale to unit sphere space
    const O = V((o.x - c.x) / (r.x * k), (o.y - c.y) / (r.y * k), (o.z - c.z) / (r.z * k));
    const D = V(dir.x / (r.x * k), dir.y / (r.y * k), dir.z / (r.z * k));
    const a = D.dot(D), b = 2 * O.dot(D), cc = O.dot(O) - 1;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0) return null;
    return O.addScaledVector(D, t).normalize();
  }
  // Convert a world-space drag direction into head space
  toHeadDir(worldDir) {
    const q = new THREE.Quaternion();
    this.head.getWorldQuaternion(q);
    return worldDir.clone().applyQuaternion(q.invert()).normalize();
  }
}
