// Procedural woodland trees. Opaque bark and cutout foliage share one atlas so
// each species remains a single instanced draw call per terrain chunk.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeAtlas(needles) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext("2d");
  const rnd = random(needles ? 991 : 319);

  // A muted bark texture; its vertical grain follows the cylinders' UVs.
  c.fillStyle = "#776656";
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * 256, y = rnd() * 256;
    const light = 52 + Math.floor(rnd() * 75);
    c.fillStyle = `rgba(${light},${Math.floor(light * .81)},${Math.floor(light * .65)},${.17 + rnd() * .48})`;
    c.fillRect(x, y, .6 + rnd() * 3.2, 5 + rnd() * 42);
  }
  for (let i = 0; i < 90; i++) {
    c.strokeStyle = `rgba(36,30,24,${.13 + rnd() * .18})`;
    c.lineWidth = .5 + rnd() * 1.5;
    const x = rnd() * 256, y = rnd() * 256;
    c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + rnd() * 8, y + 10, x - rnd() * 8, y + 28, x + rnd() * 5, y + 58); c.stroke();
  }

  // The second half is transparent. Each card shows a cluster with an uneven,
  // leaf-shaped edge instead of an opaque polygon or a single green blob.
  c.save();
  c.translate(256, 0);
  if (needles) {
    for (let stem = 0; stem < 9; stem++) {
      const angle = -1.05 + stem * .27 + (rnd() - .5) * .2;
      const length = 88 + rnd() * 62;
      const x0 = 128 + (rnd() - .5) * 26, y0 = 222 + (rnd() - .5) * 18;
      const x1 = x0 + Math.sin(angle) * length, y1 = y0 - Math.cos(angle) * length;
      c.strokeStyle = "rgba(61,54,38,.9)"; c.lineWidth = 1.7;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      for (let n = 2; n < 35; n++) {
        const t = n / 36, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        const reach = (1 - t * .65) * (8 + rnd() * 11);
        for (const side of [-1, 1]) {
          const green = Math.floor(88 + rnd() * 55);
          c.strokeStyle = `rgba(${Math.floor(green * .47)},${green},${Math.floor(green * .64)},.96)`;
          c.lineWidth = .9 + rnd() * .8;
          c.beginPath(); c.moveTo(x, y);
          c.lineTo(x + side * reach, y - 3 - rnd() * 11); c.stroke();
        }
      }
    }
  } else {
    for (let twig = 0; twig < 16; twig++) {
      const x = 128 + (rnd() - .5) * 120;
      const y = 214 - rnd() * 115;
      c.strokeStyle = "rgba(61,64,37,.66)"; c.lineWidth = .8 + rnd() * .9;
      c.beginPath(); c.moveTo(126, 235); c.quadraticCurveTo(x + (rnd() - .5) * 35, y + 28, x, y); c.stroke();
    }
    for (let i = 0; i < 210; i++) {
      const a = rnd() * Math.PI * 2, radius = Math.sqrt(rnd());
      const x = 128 + Math.cos(a) * radius * 107;
      const y = 128 + Math.sin(a) * radius * 93;
      const size = 3 + rnd() * 5.8;
      const green = Math.floor(105 + rnd() * 62);
      c.save(); c.translate(x, y); c.rotate((rnd() - .5) * 2.6);
      c.fillStyle = `rgba(${Math.floor(green * .66)},${green},${Math.floor(green * .43)},.98)`;
      c.beginPath(); c.ellipse(0, 0, size * .63, size * (1.55 + rnd() * .45), 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "rgba(218,223,142,.22)"; c.lineWidth = .65;
      c.beginPath(); c.moveTo(0, -size); c.lineTo(0, size); c.stroke();
      c.restore();
    }
  }
  c.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const UP = new THREE.Vector3(0, 1, 0);
function prepare(geometry, color, foliage = false) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, foliage ? .505 + uv.getX(i) * .49 : .005 + uv.getX(i) * .49);
  const tint = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function limb(parts, a, b, r0, r1, color = "#ffffff") {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), r0 > .09 ? 7 : 5, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
  g.translate((a.x + b.x) * .5, (a.y + b.y) * .5, (a.z + b.z) * .5);
  parts.push(prepare(g, color));
}

function card(parts, center, width, height, yaw, tilt, color) {
  const g = new THREE.PlaneGeometry(width, height);
  g.rotateZ(tilt * .35); g.rotateX(tilt); g.rotateY(yaw);
  g.translate(center.x, center.y, center.z);
  // Crown-facing normals help crossed cutout cards shade like a volume.
  const p = g.attributes.position, n = g.attributes.normal;
  const crown = new THREE.Vector3(0, 5.2, 0), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(crown).normalize();
    v.y += .42; v.normalize(); n.setXYZ(i, v.x, v.y, v.z);
  }
  parts.push(prepare(g, color, true));
}

function broadGeometry(seed, far) {
  const rnd = random(seed), parts = [];
  const trunk = [new THREE.Vector3(0, -.18, 0), new THREE.Vector3(.08, 1.1, -.03), new THREE.Vector3(.16, 2.7, .06), new THREE.Vector3(.22, 4.15, .12), new THREE.Vector3(.29, 5.8, .1)];
  for (let i = 0; i < 4; i++) limb(parts, trunk[i], trunk[i + 1], [.46, .31, .21, .115][i], [.31, .21, .115, .055][i]);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI * .5 + .26;
    limb(parts, new THREE.Vector3(0, .18, 0), new THREE.Vector3(Math.cos(a) * .65, .04, Math.sin(a) * .65), .17, .025);
  }
  const limbs = far ? 7 : 9;
  for (let i = 0; i < limbs; i++) {
    const a = i * 2.39996 + .35 + (rnd() - .5) * .4;
    const h = 2.25 + (i % 5) * .43 + rnd() * .36;
    const reach = 1.5 + rnd() * 1.25;
    const start = new THREE.Vector3(.08 + h * .025, h, .06);
    const elbow = new THREE.Vector3(start.x + Math.cos(a) * reach * .52, h + .65 + rnd() * .4, start.z + Math.sin(a) * reach * .52);
    const end = new THREE.Vector3(start.x + Math.cos(a) * reach, h + 1.25 + rnd() * .85, start.z + Math.sin(a) * reach);
    limb(parts, start, elbow, .14 - i * .005, .075);
    limb(parts, elbow, end, .075, .018);
    const twigs = far ? 2 : 4;
    for (let j = 0; j < twigs; j++) {
      const spread = (j - (twigs - 1) * .5) * .65 + (rnd() - .5) * .2;
      const tip = end.clone().add(new THREE.Vector3(Math.cos(a + spread) * (.38 + rnd() * .55), -.15 + rnd() * .88, Math.sin(a + spread) * (.38 + rnd() * .55)));
      if (!far) limb(parts, end, tip, .028, .008);
      const leafColor = ["#d3dbb5", "#b9cf9d", "#e0d9a9", "#adc593"][Math.floor(rnd() * 4)];
      card(parts, tip, far ? 1.65 : 1.35 + rnd() * .45, far ? 1.45 : 1.15 + rnd() * .38, a + j * 1.1, (rnd() - .5) * .9, leafColor);
      if (!far && j % 2 === 0) card(parts, tip.clone().add(new THREE.Vector3(0, .14, 0)), 1.1, 1.25, a + j * 1.1 + Math.PI * .48, (rnd() - .5) * .6, leafColor);
    }
  }
  for (let i = 0; i < (far ? 4 : 8); i++) {
    const a = i * 2.39996, y = 5.65 + (i % 3) * .47;
    card(parts, new THREE.Vector3(.28 + Math.cos(a) * .78, y, .1 + Math.sin(a) * .78), far ? 1.5 : 1.25, far ? 1.45 : 1.2, a, .1, "#c4d2a5");
  }
  const merged = mergeGeometries(parts);
  parts.forEach(g => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}

function pineGeometry(seed, far) {
  const rnd = random(seed), parts = [];
  const height = 8.8;
  const trunk = [new THREE.Vector3(0, -.16, 0), new THREE.Vector3(.05, 1.5, .03), new THREE.Vector3(.1, 4.2, -.04), new THREE.Vector3(.12, 6.7, .06), new THREE.Vector3(.16, height, .05)];
  for (let i = 0; i < 4; i++) limb(parts, trunk[i], trunk[i + 1], [.37, .28, .16, .09][i], [.28, .16, .09, .018][i], "#d2c6ae");
  const whorls = far ? 9 : 13;
  for (let w = 0; w < whorls; w++) {
    const t = w / whorls, y = 1.28 + t * 7.1;
    const reach = (1 - t) * 2.65 + .23;
    const count = far ? 5 : 6;
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2 + w * .58 + (rnd() - .5) * .2;
      const base = new THREE.Vector3(.04, y, 0);
      const tip = new THREE.Vector3(Math.cos(a) * reach, y - reach * .23, Math.sin(a) * reach);
      if (!far) limb(parts, base, tip, .042 * (1 - t) + .012, .006, "#b7ad98");
      const mid = base.clone().lerp(tip, .58);
      const tint = ["#b6c6a8", "#c7d0ae", "#a4b99c"][Math.floor(rnd() * 3)];
      card(parts, mid, reach * .9 + .42, .82 + reach * .3, a + Math.PI * .5, -.54, tint);
      if (!far && i % 2 === 0) card(parts, mid.clone().add(new THREE.Vector3(0, -.12, 0)), reach * .75 + .35, .65 + reach * .25, a, -.35, tint);
    }
  }
  card(parts, new THREE.Vector3(.15, height - .26, .05), .83, 1.15, 0, 0, "#c8d4ba");
  card(parts, new THREE.Vector3(.15, height - .26, .05), .83, 1.15, Math.PI * .5, 0, "#c8d4ba");
  const merged = mergeGeometries(parts);
  parts.forEach(g => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}

export function createTreeAssets() {
  const broadMap = makeAtlas(false), pineMap = makeAtlas(true);
  const material = map => new THREE.MeshStandardMaterial({ map, vertexColors: true, alphaTest: .38, side: THREE.DoubleSide, roughness: .94 });
  return {
    broad: { near: broadGeometry(41, false), far: broadGeometry(41, true), material: material(broadMap), map: broadMap },
    pine: { near: pineGeometry(83, false), far: pineGeometry(83, true), material: material(pineMap), map: pineMap },
  };
}
