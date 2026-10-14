// The grounds at night: dead trees, a graveyard, an iron fence, drifting
// ground fog, a bruised dusk sky with a low moon and distant hills.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { COLS, ROWS, CELL } from "./data.js";
import { glowTexture } from "./textures.js";

const W = COLS * CELL, D = ROWS * CELL;
const GROUND_Y = -0.45;
const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, ...o });

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  return t;
}

function groundTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#1c1a14"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? "40,44,26" : "34,26,18"},${0.3 + rnd() * 0.4})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 8 + rnd() * 40, 6 + rnd() * 26, rnd() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? "70,66,44" : "10,8,6"},${rnd() * 0.5})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 3); }
    for (let i = 0; i < 600; i++) { g.strokeStyle = `rgba(80,74,48,${rnd() * 0.5})`; g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y - 4 - rnd() * 8); g.stroke(); }
  }, 60);
}
function barkTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = "#1e1914"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? "60,52,42" : "5,4,3"},${0.4 + rnd() * 0.5})`; g.lineWidth = 1 + rnd() * 3; g.beginPath(); const x = rnd() * w; g.moveTo(x, 0); g.bezierCurveTo(x + (rnd() - 0.5) * 20, h * 0.3, x + (rnd() - 0.5) * 20, h * 0.6, x + (rnd() - 0.5) * 10, h); g.stroke(); }
  });
}

// A gnarled leafless tree as one merged geometry.
function treeGeometry(seed) {
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  const branch = (pos, dir, len, rad, depth) => {
    const segs = 3;
    let p = pos.clone(), d = dir.clone();
    for (let s = 0; s < segs; s++) {
      const l = len / segs;
      const r0 = rad * (1 - s / segs * 0.45), r1 = rad * (1 - (s + 1) / segs * 0.45);
      const geo = new THREE.CylinderGeometry(r1, r0, l, depth > 1 ? 7 : 4, 1, true);
      geo.translate(0, l / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize());
      geo.applyQuaternion(q);
      geo.translate(p.x, p.y, p.z);
      parts.push(geo);
      p = p.clone().addScaledVector(d, l);
      d = d.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.7, (rnd() - 0.6) * 0.3, (rnd() - 0.5) * 0.7)).normalize();
    }
    if (depth <= 0 || rad < 0.02) return;
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const nd = d.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.6, rnd() * 0.5 - 0.05, (rnd() - 0.5) * 1.6)).normalize();
      branch(p, nd, len * (0.55 + rnd() * 0.25), rad * 0.55, depth - 1);
    }
  };
  for (let i = 0; i < seed; i++) rnd();
  branch(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3((rnd() - 0.5) * 0.25, 1, (rnd() - 0.5) * 0.25), 3.2 + rnd() * 2, 0.32 + rnd() * 0.12, 4);
  // Roots.
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + rnd(); const g = new THREE.CylinderGeometry(0.02, 0.16, 1.2, 5, 1, true); g.translate(0, 0.6, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a)).normalize())); parts.push(g); }
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()), false);
  merged.computeVertexNormals();
  return merged;
}

function tombGeometry(kind) {
  if (kind === 0) { const s = new THREE.Shape(); s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.7); s.absarc(0, 0.7, 0.3, 0, Math.PI, false); s.lineTo(-0.3, 0); const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }); g.translate(0, 0, -0.06); return g; }
  if (kind === 1) { const a = new THREE.BoxGeometry(0.12, 1.2, 0.12); a.translate(0, 0.6, 0); const b = new THREE.BoxGeometry(0.6, 0.12, 0.12); b.translate(0, 0.85, 0); return mergeGeometries([a, b]); }
  const g = new THREE.BoxGeometry(0.5, 0.9, 0.18); g.translate(0, 0.45, 0); return g;
}

export function buildLandscape(scene, { moonDir = new THREE.Vector3(-30, 28, 22) } = {}) {
  const root = new THREE.Group();
  // Ground.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), M(0xffffff, { map: groundTexture(), roughness: 0.7, metalness: 0.1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y; ground.receiveShadow = true;
  root.add(ground);
  // Gravel drive from the porch to the gate.
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 60), M(0x3a3630, { roughness: 1 }));
  drive.rotation.x = -Math.PI / 2; drive.position.set(-1.1, GROUND_Y + 0.01, D / 2 + 31); drive.receiveShadow = true;
  root.add(drive);

  // Rain falls across the grounds but never through the mansion rooms.
  const rainCount = 3200, rainData = [], rainPositions = new Float32Array(rainCount * 6);
  for (let i = 0; i < rainCount; i++) {
    let x, z;
    do { x = (rnd() - 0.5) * 190; z = (rnd() - 0.5) * 190; }
    while (Math.abs(x) < W / 2 + 2.5 && Math.abs(z) < D / 2 + 2.5);
    rainData.push({ x, z, phase: rnd() * 18, speed: 12 + rnd() * 8, length: 0.45 + rnd() * 0.55 });
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0xa9bfd1, transparent: true, opacity: 0.34, depthWrite: false, fog: true }));
  rain.frustumCulled = false;
  root.add(rain);

  // Trees: a few variants, instanced around the house.
  const bark = M(0xffffff, { map: barkTexture(), roughness: 1 });
  const variants = [0, 7, 19, 33].map((s) => treeGeometry(s));
  const spots = variants.map(() => []);
  const clear = (x, z) => Math.abs(x) < W / 2 + 7 && Math.abs(z) < D / 2 + 7 || (Math.abs(x + 1.1) < 5 && z > D / 2);
  let tries = 0;
  while (spots.flat().length < 110 && tries++ < 3000) {
    const a = rnd() * Math.PI * 2, r = 36 + Math.pow(rnd(), 0.7) * 110;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (clear(x, z)) continue;
    spots[Math.floor(rnd() * variants.length)].push([x, z, 0.7 + rnd() * 0.9, rnd() * 6.3]);
  }
  // A few twisted ones right outside the windows.
  for (const [x, z] of [[-W / 2 - 9, -10], [-W / 2 - 11, 12], [W / 2 + 10, -16], [W / 2 + 9, 14], [-14, -D / 2 - 10], [12, -D / 2 - 9], [-18, D / 2 + 12], [16, D / 2 + 11]]) spots[Math.floor(rnd() * variants.length)].push([x, z, 1.1 + rnd() * 0.5, rnd() * 6.3]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  variants.forEach((geo, i) => {
    const list = spots[i];
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(geo, bark, list.length);
    list.forEach(([x, z, s, r], k) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r); sc.setScalar(s * 1.6); pos.set(x, GROUND_Y, z); inst.setMatrixAt(k, m4.compose(pos, q, sc)); });
    inst.castShadow = true; inst.receiveShadow = true;
    root.add(inst);
  });

  // Graveyard beside the house.
  const stone = M(0x5a5850, { roughness: 0.95 });
  const tombs = [0, 1, 2].map((k) => ({ geo: tombGeometry(k), list: [] }));
  for (let i = 0; i < 40; i++) {
    const x = W / 2 + 12 + (i % 8) * 2.6 + (rnd() - 0.5) * 0.8, z = -12 + Math.floor(i / 8) * 3.2 + (rnd() - 0.5) * 0.8;
    tombs[Math.floor(rnd() * 3)].list.push([x, z, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.25]);
  }
  for (const t of tombs) {
    const inst = new THREE.InstancedMesh(t.geo, stone, t.list.length);
    t.list.forEach(([x, z, r, tilt], k) => { q.setFromEuler(new THREE.Euler(tilt, Math.PI / 2 + r, tilt * 0.5)); sc.setScalar(1); pos.set(x, GROUND_Y - 0.05, z); inst.setMatrixAt(k, m4.compose(pos, q, sc)); });
    inst.castShadow = true; inst.receiveShadow = true;
    root.add(inst);
  }
  // A mausoleum.
  const maus = new THREE.Group();
  const mstone = M(0x4e4c46, { roughness: 1 });
  const mb = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, 4), mstone); mb.position.y = 1.75; maus.add(mb);
  const mr = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.6, 4), mstone); mr.rotation.y = Math.PI / 4; mr.position.y = 4.3; mr.scale.z = 0.8; maus.add(mr);
  for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 3.4, 10), mstone); c.position.set(s * 1.4, 1.7, 2.2); maus.add(c); }
  const mdoor = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), M(0x0a0a0c)); mdoor.position.set(0, 1.2, 2.01); maus.add(mdoor);
  maus.position.set(W / 2 + 34, GROUND_Y, -4); maus.rotation.y = -Math.PI / 2;
  maus.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  root.add(maus);

  // Wrought-iron fence around the grounds with a gate on the drive.
  const iron = M(0x111112, { metalness: 0.7, roughness: 0.5 });
  const bars = [];
  const FX = W / 2 + 26, FZ = D / 2 + 22;
  const fenceLine = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(len / 0.35);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      if (Math.abs(x + 1.1) < 2.6 && z > D / 2 + 10) continue; // gate gap
      const b = new THREE.CylinderGeometry(0.018, 0.018, 1.9, 4); b.translate(x, GROUND_Y + 0.95, z); bars.push(b);
      const tip = new THREE.ConeGeometry(0.04, 0.16, 4); tip.translate(x, GROUND_Y + 1.98, z); bars.push(tip);
    }
    for (const y of [0.2, 1.6]) { const r = new THREE.BoxGeometry(Math.abs(x2 - x1) + 0.04, 0.04, Math.abs(z2 - z1) + 0.04); r.translate((x1 + x2) / 2, GROUND_Y + y, (z1 + z2) / 2); bars.push(r); }
  };
  fenceLine(-FX, -FZ, FX, -FZ); fenceLine(-FX, FZ, FX, FZ); fenceLine(-FX, -FZ, -FX, FZ); fenceLine(FX, -FZ, FX, FZ);
  const fence = new THREE.Mesh(mergeGeometries(bars.map((g) => g.index ? g.toNonIndexed() : g)), iron);
  fence.castShadow = true;
  root.add(fence);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.8, 0.6), stone); p.position.set(-1.1 + s * 2.9, GROUND_Y + 1.4, FZ); p.castShadow = true; root.add(p); }

  // Distant hills.
  const hills = new THREE.Group();
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x07070c, fog: false });
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2;
    const h = new THREE.Mesh(new THREE.SphereGeometry(40 + rnd() * 40, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    h.position.set(Math.cos(a) * 260, GROUND_Y - 8, Math.sin(a) * 260); h.scale.y = 0.25 + rnd() * 0.3;
    hills.add(h);
  }
  root.add(hills);

  // Sky dome: bruised dusk gradient + stars.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { moon: { value: moonDir.clone().normalize() } },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `varying vec3 vP; uniform vec3 moon;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vP);
        float y = clamp(d.y, -0.2, 1.0);
        vec3 top = vec3(0.012, 0.014, 0.035), mid = vec3(0.05, 0.04, 0.09), hor = vec3(0.16, 0.08, 0.10);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, y));
        c = mix(c, top, smoothstep(0.18, 0.7, y));
        float m = max(dot(d, moon), 0.0);
        c += vec3(0.35, 0.4, 0.55) * pow(m, 60.0) * 0.6 + vec3(0.08, 0.09, 0.14) * pow(m, 6.0);
        vec3 g = floor(d * 300.0);
        float s = step(0.9965, h(g)) * smoothstep(0.05, 0.3, y);
        c += vec3(0.8, 0.85, 1.0) * s * (0.4 + 0.6 * h(g + 1.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.userData.noFow = true;
  root.add(sky);
  // The moon.
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xe8eeff, fog: false, depthWrite: false, transparent: true }));
  moonSprite.position.copy(moonDir.clone().normalize().multiplyScalar(380)); moonSprite.scale.setScalar(70);
  root.add(moonSprite);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xf2f0e6, fog: false }));
  disc.position.copy(moonDir.clone().normalize().multiplyScalar(375)); disc.lookAt(0, 0, 0);
  disc.userData.noFow = true;
  root.add(disc);

  // Low ground fog: big soft sprites drifting around the house.
  const fogTex = canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(200,210,230,.5)"); r.addColorStop(1, "rgba(200,210,230,0)"); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  fogTex.wrapS = fogTex.wrapT = THREE.ClampToEdgeWrapping; fogTex.repeat.set(1, 1);
  const mists = [];
  for (let i = 0; i < 60; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTex, color: 0x6a7488, transparent: true, opacity: 0.22, depthWrite: false }));
    let x, z;
    do { x = (rnd() - 0.5) * 150; z = (rnd() - 0.5) * 150; } while (Math.abs(x) < W / 2 + 3 && Math.abs(z) < D / 2 + 3);
    sp.position.set(x, GROUND_Y + 0.8, z); sp.scale.set(14 + rnd() * 10, 3 + rnd() * 2, 1);
    sp.userData = { x, z, ph: rnd() * 10, sp: 0.2 + rnd() * 0.4 };
    root.add(sp); mists.push(sp);
  }

  scene.add(root);
  let atmosphere = true, lastRainTime = -1;
  return {
    root,
    setAtmosphere(on) {
      atmosphere = !!on;
      rain.visible = atmosphere;
      for (const mist of mists) mist.visible = atmosphere;
      if (atmosphere) lastRainTime = -1;
    },
    update(t) {
      if (!atmosphere || t - lastRainTime < 1 / 30) return;
      lastRainTime = t;
      for (let i = 0; i < rainCount; i++) {
        const drop = rainData[i], y = GROUND_Y + ((drop.phase - t * drop.speed) % 18 + 18) % 18;
        const j = i * 6;
        rainPositions[j] = drop.x + (18 - (y - GROUND_Y)) * 0.04;
        rainPositions[j + 1] = y;
        rainPositions[j + 2] = drop.z + (18 - (y - GROUND_Y)) * 0.015;
        rainPositions[j + 3] = rainPositions[j] - drop.length * 0.2;
        rainPositions[j + 4] = Math.max(GROUND_Y, y - drop.length);
        rainPositions[j + 5] = rainPositions[j + 2] - drop.length * 0.08;
      }
      rainGeometry.attributes.position.needsUpdate = true;
      for (const m of mists) { m.position.x = m.userData.x + Math.sin(t * 0.05 * m.userData.sp + m.userData.ph) * 6; m.position.z = m.userData.z + Math.cos(t * 0.04 * m.userData.sp + m.userData.ph) * 6; }
    },
  };
}
export { GROUND_Y };
