import * as THREE from "three";
import { mulberry32 } from "./rng.js";

// The Hollow: a gaunt, antlered thing that walks the Broken Mile. It is built
// to be read from behind (the camera never shows its face): a bowed spine of
// vertebrae, ribs and shoulder blades under wet corpse skin, a torn shroud,
// stringy hair, and arms long enough to drag its fingers through the mud.

const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));
const lerp = THREE.MathUtils.lerp;

function skinTextures(random) {
  const size = 512;
  const color = document.createElement("canvas"), bump = document.createElement("canvas");
  color.width = color.height = bump.width = bump.height = size;
  const c = color.getContext("2d"), b = bump.getContext("2d");
  c.fillStyle = "#8a8f82"; c.fillRect(0, 0, size, size);
  b.fillStyle = "#808080"; b.fillRect(0, 0, size, size);
  // mottled, bloodless blotches
  for (let i = 0; i < 900; i++) {
    const x = random() * size, y = random() * size, r = 4 + random() * 38;
    const tones = ["rgba(70,78,70,.10)", "rgba(110,98,108,.09)", "rgba(150,152,138,.08)", "rgba(60,64,78,.10)", "rgba(96,70,72,.07)"];
    c.fillStyle = tones[Math.floor(random() * tones.length)];
    c.beginPath(); c.ellipse(x, y, r, r * (.4 + random() * .8), random() * 3, 0, Math.PI * 2); c.fill();
  }
  // wrinkles and pores in the bump map
  for (let i = 0; i < 5000; i++) {
    const v = Math.floor(random() * 255);
    b.fillStyle = `rgba(${v},${v},${v},.22)`;
    b.fillRect(random() * size, random() * size, 1 + random() * 2.5, 1 + random() * 2.5);
  }
  for (let i = 0; i < 260; i++) {
    const x = random() * size, y = random() * size;
    b.strokeStyle = `rgba(30,30,30,${.15 + random() * .2})`; b.lineWidth = .6 + random();
    b.beginPath(); b.moveTo(x, y); b.quadraticCurveTo(x + (random() - .5) * 30, y + (random() - .5) * 8, x + (random() - .5) * 40, y + (random() - .5) * 10); b.stroke();
  }
  // veins: wandering dark lines, raised in the bump map
  for (let i = 0; i < 70; i++) {
    let x = random() * size, y = random() * size, a = random() * 6.28;
    const steps = 20 + random() * 60, width = .6 + random() * 1.8;
    c.strokeStyle = `rgba(52,48,78,${.25 + random() * .3})`; c.lineWidth = width;
    b.strokeStyle = "rgba(200,200,200,.5)"; b.lineWidth = width;
    c.beginPath(); b.beginPath(); c.moveTo(x, y); b.moveTo(x, y);
    for (let s = 0; s < steps; s++) {
      a += (random() - .5) * .9; x += Math.cos(a) * 4; y += Math.sin(a) * 4;
      c.lineTo(x, y); b.lineTo(x, y);
    }
    c.stroke(); b.stroke();
  }
  const map = new THREE.CanvasTexture(color); map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bump);
  for (const t of [map, bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, bumpMap };
}

function shroudTexture(random) {
  const w = 512, h = 512;
  const alpha = document.createElement("canvas"), color = document.createElement("canvas");
  alpha.width = color.width = w; alpha.height = color.height = h;
  const a = alpha.getContext("2d"), c = color.getContext("2d");
  a.fillStyle = "#fff"; a.fillRect(0, 0, w, h);
  a.fillStyle = "#000";
  // ragged hem: long tears up from the bottom edge
  let x = 0;
  while (x < w) {
    const width = 6 + random() * 26, depth = 20 + random() * (random() < .25 ? 300 : 120);
    a.beginPath(); a.moveTo(x, h + 2);
    a.lineTo(x + width * (.3 + random() * .4), h - depth);
    a.lineTo(x + width, h + 2); a.fill();
    x += width * (.6 + random() * 1.1);
  }
  // ragged rips: jagged, vertically stretched slits rather than round holes
  for (let i = 0; i < 22; i++) {
    const hx = random() * w, hy = h * (.3 + random() * .65), rw = 2 + random() * 9, rh = 8 + random() * 45;
    a.beginPath();
    for (let k = 0; k < 9; k++) {
      const t = k / 9 * Math.PI * 2, j = .55 + random() * .7;
      a.lineTo(hx + Math.cos(t) * rw * j, hy + Math.sin(t) * rh * j);
    }
    a.fill();
  }
  // torn open down the back (u = .5) so the spine shows between the rags
  a.beginPath(); a.moveTo(w * .5 - 10, 0);
  for (let y = 0; y <= h; y += 16) a.lineTo(w * .5 - 10 - (y / h) * 70 - random() * 12, y);
  for (let y = h; y >= 0; y -= 16) a.lineTo(w * .5 + 10 + (y / h) * 70 + random() * 12, y);
  a.fill();
  c.fillStyle = "#1a1c1b"; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) {
    c.fillStyle = random() < .5 ? "rgba(40,36,30,.14)" : "rgba(8,9,10,.18)";
    c.fillRect(random() * w, random() * h, 1 + random() * 3, 10 + random() * 120);
  }
  for (let i = 0; i < 18; i++) { // old blood and mud soaking up from the hem
    c.fillStyle = random() < .5 ? "rgba(60,14,16,.25)" : "rgba(48,40,30,.3)";
    c.beginPath(); c.ellipse(random() * w, h - random() * 160, 10 + random() * 40, 20 + random() * 70, 0, 0, Math.PI * 2); c.fill();
  }
  const alphaMap = new THREE.CanvasTexture(alpha), map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  return { alphaMap, map };
}

function add(geometry, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m);
  return m;
}

// A tapered limb segment between two points in the parent's space.
const up = new THREE.Vector3(0, 1, 0);
function segment(a, b, r1, r2, mat, parent, radial = 14) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
  const geo = new THREE.CylinderGeometry(r2, r1, len, radial, 6);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { // knuckled, sinewy swelling near each end
    const y = pos.getY(i) / len + .5, k = 1 + .22 * gauss(y - .06, .06) + .12 * gauss(y - .95, .05) - .08 * gauss(y - .5, .2);
    pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const m = add(geo, mat, parent);
  m.position.copy(a).addScaledVector(dir, .5);
  m.quaternion.setFromUnitVectors(up, dir.normalize());
  return m;
}

function torsoGeometry() {
  const radial = 72, rows = 90, y0 = 1.26, y1 = 2.56;
  const geo = new THREE.CylinderGeometry(1, 1, 1, radial, rows, true);
  const pos = geo.attributes.position;
  const prof = (v, table) => {
    for (let i = 1; i < table.length; i++) if (v <= table[i][0]) {
      const [va, a] = table[i - 1], [vb, b] = table[i], t = (v - va) / (vb - va);
      return lerp(a, b, t * t * (3 - 2 * t));
    }
    return table[table.length - 1][1];
  };
  const RX = [[0, .17], [.18, .15], [.34, .12], [.6, .21], [.8, .27], [.9, .29], [.96, .2], [1, .07]];
  const RZ = [[0, .12], [.18, .1], [.34, .08], [.6, .15], [.8, .15], [.9, .13], [.96, .1], [1, .06]];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), v = pos.getY(i) + .5, y = lerp(y0, y1, v);
    const ang = Math.atan2(z, x), cx = Math.cos(ang), back = Math.max(0, -Math.sin(ang)), front = Math.max(0, Math.sin(ang));
    let rx = prof(v, RX), rz = prof(v, RZ);
    // vertebrae: a knotted ridge down the bowed back
    const knot = Math.pow(Math.abs(Math.sin(y * Math.PI / .072)), 2.5);
    let push = (.012 + .03 * knot) * gauss(cx, .07) * Math.pow(back, 6) * (v > .05 && v < .97 ? 1 : 0);
    // gutter either side of the spine
    push -= .012 * gauss(Math.abs(cx) - .16, .06) * back * (v > .3 && v < .9 ? 1 : 0);
    // ribs straining through the skin
    if (v > .36 && v < .86) {
      const rib = Math.pow(Math.max(0, Math.sin((y - Math.abs(cx) * .05 * back) * Math.PI * 2 / .085)), 3);
      push += (rib * .016 - .006) * (1 - gauss(cx, .12) * back) * (1 - .7 * gauss(cx, .2) * front);
    }
    // shoulder blades
    for (const s of [-1, 1]) push += .04 * gauss(cx - s * .45, .14) * back * gauss(v - .79, .07);
    // sunken belly and a sharp sternum
    push -= .035 * front * gauss(v - .3, .1);
    push += .01 * gauss(cx, .06) * front * (v > .55 && v < .9 ? 1 : 0);
    // a hunched, bowed spine
    const zc = -.07 * Math.sin(v * Math.PI * .95) - .02;
    const r = 1 + push / Math.max(.05, Math.hypot(rx * cx, rz * Math.sin(ang)));
    pos.setXYZ(i, Math.cos(ang) * rx * r, y, zc + Math.sin(ang) * rz * r);
  }
  geo.computeVertexNormals();
  return geo;
}

function skullGeometry() {
  const geo = new THREE.SphereGeometry(.15, 48, 36), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = new THREE.Vector3(x, y, z).normalize();
    // long, swept-back cranium and a narrow muzzle
    if (n.z < 0) { z *= 1.55; y += -n.z * .04; }
    if (n.z > 0) { x *= 1 - .45 * n.z * Math.max(0, -n.y + .3); z *= 1.1; }
    if (n.y < 0) x *= 1 - .3 * -n.y;
    // cheek hollows and a ridged brow
    z -= .02 * gauss(Math.abs(n.x) - .6, .15) * gauss(n.y + .1, .2) * Math.max(0, n.z);
    y += .012 * gauss(n.y - .3, .1) * Math.max(0, n.z);
    // sagittal crest
    y += .018 * gauss(n.x, .06) * Math.max(0, n.y);
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function antler(start, dir, length, radius, depth, mat, parent, random) {
  const end = start.clone().addScaledVector(dir, length);
  segment(start, end, radius, radius * .62, mat, parent, 8);
  if (depth <= 0) {
    const tip = add(new THREE.ConeGeometry(radius * .62, length * .45, 8), mat, parent);
    const d = dir.clone();
    tip.position.copy(end).addScaledVector(d, length * .22);
    tip.quaternion.setFromUnitVectors(up, d);
    return;
  }
  const bend = () => dir.clone().add(new THREE.Vector3((random() - .5) * .9, random() * .5 + .1, (random() - .5) * .9)).normalize();
  antler(end, bend(), length * (.7 + random() * .2), radius * .62, depth - 1, mat, parent, random);
  if (random() < .85) antler(end, bend(), length * (.5 + random() * .25), radius * .5, depth - 1, mat, parent, random);
}

export function makePursuer(scene, low = false) {
  const random = mulberry32(6613);
  const root = new THREE.Group(); scene.add(root);
  const { map, bumpMap } = skinTextures(random);
  const skin = new THREE.MeshStandardMaterial({ color: 0xb5b8ac, map, bumpMap, bumpScale: 2.2, roughness: .46, metalness: 0 });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0x9c9482, map, bumpMap, bumpScale: 3, roughness: .62 });
  const clawMat = new THREE.MeshStandardMaterial({ color: 0x0d0b0a, roughness: .25, metalness: .2 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0b, roughness: .35 });
  const shroud = shroudTexture(random);
  const cloth = new THREE.MeshStandardMaterial({ color: 0x8d8f8c, map: shroud.map, alphaMap: shroud.alphaMap, alphaTest: .5, side: THREE.DoubleSide, roughness: .8 });
  const depthCloth = new THREE.MeshDepthMaterial({ alphaMap: shroud.alphaMap, alphaTest: .5, side: THREE.DoubleSide });
  const textures = [map, bumpMap, shroud.map, shroud.alphaMap];

  const body = new THREE.Group(); root.add(body);
  const torsoMesh = add(torsoGeometry(), skin, body);
  add(new THREE.SphereGeometry(.16, 24, 16), skin, body, 0, 1.3, -.02).scale.set(1.1, .7, .85);
  // collarbones and a knotted neck jutting forward
  for (const s of [-1, 1]) segment(new THREE.Vector3(s * .04, 2.49, .07), new THREE.Vector3(s * .3, 2.46, -.02), .022, .016, boneMat, body, 8);
  const neckPts = [[0, 2.5, -.03], [0, 2.6, .0], [0, 2.68, .05], [0, 2.74, .09]].map((p) => new THREE.Vector3(...p));
  for (let i = 0; i < neckPts.length - 1; i++) segment(neckPts[i], neckPts[i + 1], .06 - i * .006, .055 - i * .006, skin, body, 16);
  for (let i = 0; i < 5; i++) add(new THREE.SphereGeometry(.026, 12, 8), skin, body, 0, 2.48 + i * .06, -.07 + i * .03).scale.set(1, .7, 1);

  // Torn shroud hangs from the shoulders, exposing the spine between its rags.
  const shroudGeo = new THREE.CylinderGeometry(.3, .62, 1.75, 64, 30, true, Math.PI - 2.1, 4.2);
  const sp = shroudGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i), a = Math.atan2(sp.getX(i), sp.getZ(i)), drop = (.875 - y) / 1.75;
    const fold = 1 + (.07 * Math.sin(a * 11) + .04 * Math.sin(a * 23 + 1)) * drop;
    // part the cloth over the spine so the vertebrae show
    const parted = 1 + .25 * gauss(a - Math.PI, .35) * (1 - drop);
    sp.setX(i, sp.getX(i) * fold * parted); sp.setZ(i, sp.getZ(i) * fold * parted);
    sp.setY(i, y + .05 * Math.sin(a * 7) * drop);
  }
  shroudGeo.computeVertexNormals();
  const cloak = add(shroudGeo, cloth, body, 0, 1.55, -.04);
  cloak.customDepthMaterial = depthCloth;

  // Head: long eyeless skull, open jaw, a crown of bone, wet black hair.
  const head = new THREE.Group(); head.position.set(0, 2.75, .08); body.add(head);
  const skull = add(skullGeometry(), skin, head, 0, .05, .02);
  skull.rotation.x = .25;
  const jaw = new THREE.Group(); jaw.position.set(0, -.02, .02); jaw.rotation.x = .5; head.add(jaw);
  add(new THREE.SphereGeometry(.1, 24, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin, jaw, 0, 0, .08).scale.set(.75, .9, 1.7);
  for (let i = 0; i < 14; i++) {
    const a = (i / 13 - .5) * 2.4, tooth = add(new THREE.ConeGeometry(.007, .045 + random() * .03, 5), boneMat, head);
    tooth.position.set(Math.sin(a) * .055, -.035, .06 + Math.cos(a) * .12); tooth.rotation.x = Math.PI;
  }
  const glow = new THREE.MeshBasicMaterial({ color: 0xd8f1ff, toneMapped: false, fog: false });
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }), head, s * .055, .07, .14).scale.set(1, .7, .6);
    add(new THREE.SphereGeometry(.007, 8, 6), glow, head, s * .055, .07, .155);
  }
  for (const s of [-1, 1]) antler(new THREE.Vector3(s * .07, .17, -.03), new THREE.Vector3(s * .55, 1, -.35).normalize(), .26, .022, low ? 2 : 3, boneMat, head, random);
  const strands = low ? 22 : 48;
  const hairMeshes = [];
  for (let i = 0; i < strands; i++) {
    const a = (random() - .5) * 2.6, start = new THREE.Vector3(Math.sin(a) * .1, .14 + random() * .04, -.08 - Math.cos(a) * .12);
    const len = .45 + random() * .7, pts = [start];
    for (let k = 1; k <= 5; k++) {
      const p = pts[k - 1].clone();
      p.y -= len / 5; p.z -= .05 * (1 - k / 5) + (random() - .5) * .03; p.x += Math.sin(a) * .02 + (random() - .5) * .03;
      pts.push(p);
    }
    const tube = add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, .005 + random() * .005, 4), hairMat, head);
    tube.receiveShadow = false;
    hairMeshes.push(tube);
  }

  // Arms: far too long, all knuckle and tendon. Lengths match reachArm().
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .33, 2.4, -.02); body.add(arm);
    add(new THREE.SphereGeometry(.085, 18, 12), skin, arm).scale.set(1.1, 1, 1);
    segment(new THREE.Vector3(), new THREE.Vector3(0, -1.02, 0), .068, .045, skin, arm, 18);
    const elbow = new THREE.Group(); elbow.position.y = -1.02; arm.add(elbow);
    add(new THREE.SphereGeometry(.055, 14, 10), boneMat, elbow, 0, 0, -.015).scale.set(.9, 1, 1.2);
    segment(new THREE.Vector3(), new THREE.Vector3(0, -.8, 0), .048, .03, skin, elbow, 16);
    const hand = new THREE.Group(); hand.position.y = -.83; elbow.add(hand);
    add(new THREE.SphereGeometry(.05, 16, 12), skin, hand, 0, -.04, 0).scale.set(1.1, 1.4, .55);
    for (let f = 0; f < 5; f++) {
      const thumb = f === 4;
      let joint = new THREE.Group();
      joint.position.set(thumb ? -side * .05 : (f - 1.5) * .024, thumb ? -.02 : -.1, thumb ? .02 : 0);
      joint.rotation.set(-.2, 0, thumb ? -side * .6 : (f - 1.5) * .06); hand.add(joint);
      const lengths = thumb ? [.07, .06] : [.11, .09, .07];
      lengths.forEach((l, k) => {
        const r = .011 - k * .002;
        segment(new THREE.Vector3(), new THREE.Vector3(0, -l, 0), r, r * .8, skin, joint, 8);
        const next = new THREE.Group(); next.position.y = -l; next.rotation.x = -.28; joint.add(next); joint = next;
      });
      const claw = add(new THREE.ConeGeometry(.009, .085, 6), clawMat, joint, 0, -.035, .006);
      claw.rotation.x = Math.PI - .25;
    }
    const piece = add(new THREE.DodecahedronGeometry(.095, 1), new THREE.MeshStandardMaterial({ color: 0x9ac9ff, emissive: 0x3467ad, emissiveIntensity: 2.5, roughness: .2 }), hand, 0, -.16, .07);
    piece.scale.set(.65, 1.3, .45); piece.visible = false;
    arms.push({ arm, elbow, side, hand, piece });
  }

  // Digitigrade legs, planted under the root so the body can lean over them.
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * .14, 1.3, 0); root.add(hip);
    segment(new THREE.Vector3(), new THREE.Vector3(side * .02, -.56, .2), .075, .045, skin, hip, 16);
    const knee = new THREE.Group(); knee.position.set(side * .02, -.56, .2); hip.add(knee);
    add(new THREE.SphereGeometry(.05, 12, 10), boneMat, knee);
    segment(new THREE.Vector3(), new THREE.Vector3(0, -.58, -.3), .045, .028, skin, knee, 14);
    const ankle = new THREE.Group(); ankle.position.set(0, -.58, -.3); knee.add(ankle);
    segment(new THREE.Vector3(), new THREE.Vector3(0, -.15, .12), .03, .024, skin, ankle, 10);
    for (let t = 0; t < 3; t++) {
      const toe = new THREE.Vector3((t - 1) * .035, -.16, .26);
      segment(new THREE.Vector3(0, -.15, .12), toe, .016, .01, skin, ankle, 8);
      const claw = add(new THREE.ConeGeometry(.008, .05, 6), clawMat, ankle);
      claw.position.copy(toe).add(new THREE.Vector3(0, -.005, .02)); claw.rotation.x = Math.PI / 2 + .3;
    }
    legs.push({ hip, knee, side });
  }

  // Folded legs shown while it crouches over its kill.
  const knees = new THREE.Group(); root.add(knees); knees.visible = false;
  for (const side of [-1, 1]) {
    const hipP = new THREE.Vector3(side * .16, .6, 0), kneeP = new THREE.Vector3(side * .34, .08, .55), ankleP = new THREE.Vector3(side * .3, .1, -.22);
    segment(hipP, kneeP, .075, .045, skin, knees, 14);
    add(new THREE.SphereGeometry(.052, 12, 10), boneMat, knees).position.copy(kneeP);
    segment(kneeP, ankleP, .045, .028, skin, knees, 12);
    segment(ankleP, ankleP.clone().add(new THREE.Vector3(0, -.08, -.2)), .028, .014, skin, knees, 8);
  }
  let pose = "stalk", age = 0, actionTime = 0, actionDuration = 1;
  const damp = (from, to, dt, rate = 11) => THREE.MathUtils.damp(from, to, rate, dt);
  const model = {
    root, body, arms, legs, cloak, head, jaw, knees, textures,
    groundMeshes: [torsoMesh, skull],
    hairMeshes,
    object: root, height: 3.35, speed: 0,
    get pose() { return pose; },
    addTo() {},
    play(name, duration = 0.8) {
      if (pose === "death" && name !== "death") return;
      pose = name === "cast" ? "magic" : name;
      actionTime = 0;
      actionDuration = Math.max(.25, duration);
    },
    equipWeapon(key) {
      if (this.heldWeapon) { this.heldWeapon.removeFromParent(); this.heldWeapon.geometry.dispose(); this.heldWeapon.material.dispose(); this.heldWeapon = null; }
      if (!key) return;
      const spear = key === "hunting_spear", axe = key === "rusted_axe";
      const mesh = new THREE.Mesh(spear ? new THREE.CylinderGeometry(.025,.04,1.85,7) : axe ? new THREE.BoxGeometry(.16,.9,.08) : new THREE.BoxGeometry(.09,1.1,.06),
        new THREE.MeshStandardMaterial({ color: spear ? 0x98795a : 0x99a6a3, metalness: spear ? .15 : .75, roughness: .44 }));
      mesh.position.set(.08,-.38,.1); mesh.rotation.z = -.28;
      arms[0].hand.add(mesh); this.heldWeapon = mesh;
    },
    update(dt) {
      age += dt;
      if (!["death", "consume"].includes(pose)) {
        actionTime += dt;
        if (actionTime >= actionDuration && pose !== "stalk" && pose !== "walk") pose = "stalk";
      }
      const walking = pose !== "death" && pose !== "consume" && this.speed > .12;
      const stride = walking ? Math.sin(age * (3.2 + this.speed * 2.5)) * Math.min(.48, this.speed * .26) : 0;
      const progress = Math.min(1, actionTime / actionDuration);
      const attack = pose === "attack" ? Math.sin(progress * Math.PI) : 0;
      const special = pose === "special" ? Math.sin(progress * Math.PI) : 0;
      const magic = pose === "magic" ? Math.sin(progress * Math.PI) : 0;
      const hit = pose === "hit" ? Math.sin(progress * Math.PI) : 0;
      const eating = pose === "consume";
      const dead = pose === "death";
      root.rotation.z = damp(root.rotation.z, dead ? 1.38 : 0, dt, dead ? 5 : 8);
      body.position.y = damp(body.position.y, eating ? -.65 : dead ? -.55 : walking ? Math.abs(stride) * .065 : 0, dt);
      body.rotation.x = damp(body.rotation.x, eating ? .52 + Math.sin(age * 4.4) * .045 : dead ? .25 : -.12 + stride * .15 + attack * .4 + special * .7 - hit * .25, dt);
      body.rotation.z = damp(body.rotation.z, dead ? 0 : (walking ? Math.sin(age * 4) * .035 : Math.sin(age) * .015) + hit * .22, dt);
      head.rotation.x = damp(head.rotation.x, dead ? .08 : eating ? .55 + Math.sin(age * 4.4) * .16 : magic ? -.25 : .08 + Math.sin(age * .8) * .025, dt);
      jaw.rotation.x = damp(jaw.rotation.x, dead ? .5 : eating ? .38 + Math.abs(Math.sin(age * 6.5)) * .48 : magic ? .8 : .5 + Math.sin(age * 1.7) * .04, dt);
      cloak.rotation.z = dead ? 0 : Math.sin(age * .7) * .035;
      for (const { arm, elbow, side } of arms) {
        const swing = walking ? stride * side * .9 : Math.sin(age * 1.45 + side) * .045;
        arm.rotation.x = damp(arm.rotation.x, eating ? -1.2 + Math.sin(age * 4.4 + side) * .16 : dead ? .7 : .12 + swing - attack * (side < 0 ? 1.7 : .55) - special * 1.35 - magic * 1.5 + hit * .7, dt);
        arm.rotation.z = damp(arm.rotation.z, side * (magic ? .75 : special ? .35 : .035), dt);
        elbow.rotation.x = damp(elbow.rotation.x, eating ? -.55 + Math.sin(age * 4.4 + side) * .09 : magic ? -.8 : attack ? -.5 : -.12, dt);
      }
      for (const { hip, knee, side } of legs) {
        hip.visible = !eating;
        hip.rotation.x = damp(hip.rotation.x, dead ? .65 : stride * (side < 0 ? 1 : -1), dt);
        knee.rotation.x = damp(knee.rotation.x, dead ? -.8 : Math.max(0, stride * (side < 0 ? 1 : -1)) * 1.5, dt);
      }
      knees.visible = eating;
      for (const { piece } of arms) piece.visible = magic > .12;
    },
    dispose() {
      root.removeFromParent();
      root.traverse((o) => { o.geometry?.dispose?.(); if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.()); else o.material?.dispose?.(); });
      textures.forEach((t) => t.dispose());
    },
  };
  return model;
}
