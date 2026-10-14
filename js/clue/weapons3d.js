// Shared, close-up quality weapon models for the world and the casebook.
// Coordinates are in metres; the lowest point of each model is near -r.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { glowTexture } from "./textures.js";

const mat = (color, metalness = 0, roughness = .55, extra = {}) =>
  new THREE.MeshPhysicalMaterial({ color, metalness, roughness, ...extra });
const iron = mat(0x646d72, .84, .44);
const steel = mat(0xb7c2c6, .93, .27);
const edge = mat(0xe6edf0, .96, .19);
const gunmetal = mat(0x292e34, .86, .42);
const black = mat(0x171a1d, .48, .7);
const brass = mat(0xb99958, .85, .32);
const darkBrass = mat(0x655032, .75, .53);
const walnut = mat(0x744a2f, .08, .67);
const woodLight = mat(0x9a6e42, .05, .75);
const leather = mat(0x452c20, .03, .81);
const rubber = mat(0x222324, .08, .92);
const ropeFiber = mat(0xb6a078, 0, 1);
const ropeShade = mat(0x776245, 0, 1);
const rust = mat(0x754b35, .3, .91);
const glass = mat(0xb7d4db, .2, .12, { transparent: true, opacity: .84, clearcoat: 1, clearcoatRoughness: .08 });
const reflector = mat(0xdbe2dc, .95, .13);
const whiteMark = mat(0xd4cec1, .04, .75);
steel.side = edge.side = THREE.DoubleSide;

function surfaceTexture(kind) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = kind === "wood" ? "#e0cba9" : "#b0b0b0";
  ctx.fillRect(0, 0, 256, 256);
  let seed = kind === "wood" ? 31991 : 271828;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < (kind === "wood" ? 470 : 850); i++) {
    const y = random() * 256, x = random() * 256;
    ctx.strokeStyle = kind === "wood" ? `rgba(58,31,17,${.025 + random() * .17})` : `rgba(55,55,55,${.02 + random() * .12})`;
    ctx.lineWidth = kind === "wood" ? .3 + random() * 1.2 : .15 + random() * .6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (kind === "wood") ctx.bezierCurveTo(x + 15, y + random() * 6 - 3, x + 65, y + random() * 6 - 3, x + 100 + random() * 120, y + random() * 5 - 2.5);
    else ctx.lineTo(x + 12 + random() * 95, y + random() * .5);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  if (kind === "wood") texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
walnut.map = woodLight.map = surfaceTexture("wood");
iron.roughnessMap = steel.roughnessMap = gunmetal.roughnessMap = surfaceTexture("steel");
walnut.needsUpdate = woodLight.needsUpdate = iron.needsUpdate = steel.needsUpdate = gunmetal.needsUpdate = true;

function add(g, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function block(g, w, h, d, material, x, y, z = 0, radius = .003) {
  return add(g, new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 4, h / 4, d / 4)), material, x, y, z);
}
function cylinder(g, radiusTop, radiusBottom, length, material, x, y, z = 0, sides = 20, axis = "x") {
  const m = add(g, new THREE.CylinderGeometry(radiusTop, radiusBottom, length, sides, 1), material, x, y, z);
  if (axis === "x") m.rotation.z = -Math.PI / 2;
  else if (axis === "z") m.rotation.x = Math.PI / 2;
  return m;
}
function torus(g, radius, thickness, material, x, y, z = 0, axis = "x", arc = Math.PI * 2) {
  const m = add(g, new THREE.TorusGeometry(radius, thickness, 8, 32, arc), material, x, y, z);
  if (axis === "x") m.rotation.y = Math.PI / 2;
  else if (axis === "y") m.rotation.x = Math.PI / 2;
  return m;
}
function line(g, points, radius, material, segments = 32) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return add(g, new THREE.TubeGeometry(curve, segments, radius, 6, false), material);
}
function blade(g, outline, y, depth = .012) {
  const shape = new THREE.Shape();
  outline.forEach(([x, z], i) => i ? shape.lineTo(x, z) : shape.moveTo(x, z));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .003, bevelThickness: .002 });
  geo.rotateX(Math.PI / 2);
  return add(g, geo, steel, 0, y, 0);
}
function pins(g, xs, y, z, material = brass) {
  for (const x of xs) cylinder(g, .006, .006, .003, material, x, y, z, 12, "z");
}
function gripScales(g, x, length, halfWidth, y, material) {
  block(g, length, .013, halfWidth * 2, gunmetal, x, y, 0, .004);
  for (const side of [-1, 1]) {
    block(g, length - .019, .014, halfWidth * .78, material, x, y + .009, side * halfWidth * .57, .005);
    pins(g, [x - length * .28, x + length * .26], y + .018, side * halfWidth * .57, steel);
  }
}
function twist(g, points, radius, color = ropeFiber, turns = 20) {
  const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const samples = 210;
  // Three small helical fibres around a thicker, dark central cord.
  add(g, new THREE.TubeGeometry(path, samples, radius * .62, 5, false), ropeShade);
  for (let strand = 0; strand < 3; strand++) {
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples, p = path.getPoint(t), tangent = path.getTangent(t);
      const a = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
      if (a.lengthSq() < .1) a.set(1, 0, 0);
      const b = tangent.clone().cross(a).normalize();
      const phi = Math.PI * 2 * (turns * t + strand / 3);
      p.addScaledVector(a, Math.cos(phi) * radius * .58).addScaledVector(b, Math.sin(phi) * radius * .58);
      pts.push(p);
    }
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), samples, radius * .37, 5, false), color);
  }
}

function flashlight(g, r) {
  const y = -r + .057;
  cylinder(g, .045, .045, .31, gunmetal, -.035, y);
  cylinder(g, .052, .046, .093, iron, .163, y);
  cylinder(g, .055, .055, .014, black, .216, y);
  cylinder(g, .052, .052, .005, reflector, .227, y);
  cylinder(g, .046, .046, .004, glass, .232, y);
  torus(g, .049, .004, brass, .222, y);
  cylinder(g, .049, .049, .025, rubber, -.206, y);
  cylinder(g, .022, .022, .008, brass, -.222, y);
  cylinder(g, .015, .015, .009, rubber, -.228, y);
  for (let i = 0; i < 15; i++) torus(g, .0456, .0012, i % 3 ? iron : brass, -.152 + i * .012, y);
  for (const x of [.106, .143, .181]) torus(g, .0505 + (x - .106) * .05, .0015, black, x, y);
  block(g, .065, .008, .031, black, -.015, y + .048, 0);
  cylinder(g, .014, .014, .006, brass, -.015, y + .055, 0, 16, "y");
  cylinder(g, .01, .01, .007, rubber, -.015, y + .06, 0, 16, "y");
  for (let i = 0; i < 3; i++) block(g, .012, .001, .003, whiteMark, -.068 + i * .016, y + .0458, .012);
}

function combatKnife(g, r) {
  const y = -r + .031;
  blade(g, [[-.045,-.033],[.16,-.033],[.28,-.018],[.34,0],[.21,.039],[.08,.042],[-.045,.036]], y);
  // The inset panel and narrow bright edge make the blade read as ground steel.
  blade(g, [[.018,-.028],[.17,-.028],[.285,-.012],[.15,.006],[.018,.007]], y + .003, .0015);
  line(g, [[.02,y+.008,.018],[.17,y+.008,.018],[.25,y+.008,.010]], .002, iron, 14);
  block(g, .025, .034, .102, brass, -.048, y + .004, 0, .007);
  block(g, .176, .027, .061, black, -.15, y, 0, .009);
  for (let i = 0; i < 9; i++) {
    const x = -.219 + i * .017;
    block(g, .004, .002, .063, i % 2 ? iron : rubber, x, y + .015, 0, .001);
  }
  pins(g, [-.19, -.115], y + .017, .019, steel);
  torus(g, .016, .004, brass, -.24, y, 0, "z");
}

function kitchenKnife(g, r) {
  const y = -r + .029;
  blade(g, [[-.055,-.046],[.185,-.046],[.285,-.028],[.342,.002],[.31,.056],[.155,.085],[-.055,.081]], y);
  blade(g, [[-.045,-.042],[.186,-.042],[.285,-.025],[.332,.001],[.12,.015],[-.045,.015]], y + .004, .0015);
  block(g, .025, .029, .125, brass, -.059, y + .002, .012, .004);
  gripScales(g, -.165, .195, .032, y, walnut);
  line(g, [[-.245,y+.018,.006],[-.208,y+.018,.022],[-.167,y+.018,.026]], .0015, darkBrass, 12);
}

function pipeWall(g, r) {
  const y = -r + .046, len = .67, outer = .045, inner = .031, sides = 18;
  const positions = [], colors = [], indices = [];
  const rings = 14;
  for (let i = 0; i <= rings; i++) {
    for (let layer = 0; layer < 2; layer++) {
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2, rad = layer ? inner : outer;
        const jag = i === rings ? (Math.sin(j * 7.9) * .013 + Math.cos(j * 3.7) * .01) : 0;
        const dent = (i === 7 || i === 8) && j >= 2 && j <= 5 ? -.008 : 0;
        const x = -.335 + len * i / rings + jag;
        positions.push(x, y + (rad + dent) * Math.cos(a), (rad + dent) * Math.sin(a));
        const stain = Math.sin(i * 7.3 + j * 2.8) * Math.cos(i * 2.9 - j * 1.3);
        const c = new THREE.Color(stain > .24 ? 0x79533e : stain < -.4 ? 0x869095 : 0x606b70);
        colors.push(c.r, c.g, c.b);
      }
    }
  }
  const stride = sides + 1, ringStride = stride * 2;
  for (let i = 0; i < rings; i++) for (let layer = 0; layer < 2; layer++) for (let j = 0; j < sides; j++) {
    const a = i * ringStride + layer * stride + j, b = a + ringStride;
    if (layer) indices.push(a, a + 1, b, a + 1, b + 1, b);
    else indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  for (let end of [0, rings]) for (let j = 0; j < sides; j++) {
    const a = end * ringStride + j, b = a + stride;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  add(g, geo, mat(0xffffff, .82, .62, { vertexColors: true, side: THREE.DoubleSide }));
  for (const x of [-.245, -.226, -.207]) torus(g, .046, .0014, iron, x, y);
  cylinder(g, .055, .055, .052, rust, -.12, y);
  cylinder(g, .053, .053, .043, iron, -.12, y);
  for (const x of [-.147, -.094]) torus(g, .055, .003, rust, x, y);
  line(g, [[-.32,y+.043,.005],[-.18,y+.046,.005],[-.08,y+.055,.004]], .0017, rust, 22);
  line(g, [[.08,y-.039,.006],[.2,y-.041,.005],[.31,y-.031,.01]], .0018, rust, 22);
}

function pistol(g, r) {
  const k = new THREE.Group();
  g.add(k);
  k.rotation.x = Math.PI * 0.41;
  k.position.y = -r + .105;
  const y = 0;
  // Stepped slide, lower receiver and exposed barrel make a clear semi-auto profile.
  block(k, .368, .062, .077, gunmetal, .034, y + .03, 0, .007);
  block(k, .288, .022, .069, iron, .003, y + .071, 0, .003);
  block(k, .315, .046, .06, black, .013, y - .02, 0, .008);
  block(k, .141, .018, .073, gunmetal, .118, y - .049, 0, .005);
  block(k, .086, .006, .071, brass, -.045, y + .063, 0, .002);
  for (const z of [-.039, .039]) {
    block(k, .082, .003, .002, brass, -.06, y + .005, z);
    for (let i = 0; i < 6; i++) {
      const serr = block(k, .004, .038, .002, iron, -.111 + i * .012, y + .032, z);
      serr.rotation.z = -.2;
    }
  }
  block(k, .081, .007, .002, steel, .012, y + .083, .039);
  block(k, .043, .027, .002, black, .012, y + .055, .041);
  cylinder(k, .025, .025, .011, steel, .226, y + .028, 0);
  cylinder(k, .014, .014, .013, black, .233, y + .028, 0);
  block(k, .016, .019, .025, black, .166, y + .077, 0);
  block(k, .022, .022, .031, black, -.11, y + .079, 0);
  for (const z of [-.033, .033]) block(k, .019, .004, .013, whiteMark, -.11, y + .091, z);
  // The slanted magazine grip and separate inset stippled scales.
  const grip = block(k, .102, .178, .069, gunmetal, -.098, y - .141, 0, .013);
  grip.rotation.z = -.18;
  for (const z of [-.036, .036]) {
    const scale = block(k, .081, .138, .004, rubber, -.102, y - .142, z, .003);
    scale.rotation.z = -.18;
    for (let row = 0; row < 7; row++) for (let col = 0; col < 3; col++) {
      const dot = add(k, new THREE.SphereGeometry(.0017, 5, 4), iron, -.134 + col * .025 - row * .004, y - .2 + row * .016, z + Math.sign(z) * .003);
      dot.scale.y = .75;
    }
  }
  block(k, .11, .015, .075, black, -.126, y - .235, 0, .004);
  block(k, .058, .014, .076, iron, -.118, y - .235, 0, .003);
  // Open trigger guard: an arc, rather than a solid box.
  line(k, [[-.042,y-.048,.002],[-.032,y-.091,.002],[0,y-.113,.002],[.054,y-.099,.002],[.083,y-.054,.002]], .005, gunmetal, 28);
  line(k, [[-.013,y-.048,.006],[.001,y-.072,.006],[.003,y-.088,.006]], .004, brass, 12);
  cylinder(k, .008, .008, .002, brass, -.174, y - .014, .041, 14, "z");
}

function hammer(g, r) {
  const y = -r + .046;
  // The handle runs along X; the head is a forged claw across Z.
  cylinder(g, .026, .035, .45, woodLight, -.032, y, 0, 14);
  cylinder(g, .041, .035, .105, leather, -.19, y, 0, 16);
  for (let i = 0; i < 10; i++) torus(g, .0414, .0011, darkBrass, -.24 + i * .009, y);
  cylinder(g, .032, .032, .038, brass, .184, y);
  cylinder(g, .05, .05, .142, iron, .21, y, 0, 16, "z");
  cylinder(g, .047, .051, .038, steel, .21, y, .087, 20, "z");
  cylinder(g, .048, .048, .006, edge, .21, y, .108, 20, "z");
  for (const x of [.18, .24]) {
    line(g, [[x,y,-.052],[x-.011,y+.006,-.086],[x-.02,y+.015,-.116],[x-.027,y+.023,-.146]], .012, iron, 18);
  }
  block(g, .059, .004, .007, black, .21, y + .048, -.001);
  pins(g, [-.03, .055], y + .026, .009, darkBrass);
}

function rope(g, r) {
  const y = -r + .025;
  // One continuous spiral coil, then a slack tail with a visible stopper knot.
  const coil = [];
  for (let i = 0; i <= 170; i++) {
    const t = i / 170, a = t * Math.PI * 5.2;
    const rad = .022 + t * .087;
    coil.push([Math.cos(a) * rad, y + t * .018, Math.sin(a) * rad]);
  }
  twist(g, coil, .011, ropeFiber, 23);
  twist(g, [[-.1,y+.018,-.012],[-.17,y+.035,-.025],[-.24,y+.038,-.045],[-.30,y+.024,-.057]], .01, ropeFiber, 10);
  twist(g, [[.098,y+.021,-.018],[.14,y+.025,-.053],[.18,y+.026,-.076],[.221,y+.024,-.075]], .01, ropeFiber, 9);
  // A lashing around the coiled bundle.
  line(g, [[-.027,y+.028,-.094],[0,y+.036,-.098],[.042,y+.032,-.087]], .005, leather, 16);
  for (const x of [-.3, .221]) {
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 2 * i / 5;
      line(g, [[x,y+.025,-.06],[x + Math.cos(a)*.023,y+.025 + Math.sin(a)*.016,-.06]], .0019, ropeShade, 5);
    }
  }
}

function sword(g, r) {
  const y = -r + .037;
  // Long diamond-ground blade, built in strips so its ridge catches light.
  const stations = [[-.12,.064],[-.05,.071],[.14,.069],[.53,.064],[.76,.049],[.89,.029],[1.01,0]];
  for (let i = 0; i < stations.length - 1; i++) {
    const [x0,w0] = stations[i], [x1,w1] = stations[i+1];
    for (const side of [-1,1]) {
      const verts = new Float32Array([
        x0,y+.007,side*w0, x1,y+.007,side*w1, x0,y+.024,0,
        x1,y+.007,side*w1, x1,y+.024,0, x0,y+.024,0,
        x0,y-.007,side*w0, x0,y-.022,0, x1,y-.007,side*w1,
        x1,y-.007,side*w1, x0,y-.022,0, x1,y-.022,0,
      ]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(verts,3)); geo.computeVertexNormals();
      add(g,geo,side === -1 ? edge : steel);
    }
  }
  block(g, .09, .035, .073, iron, -.10, y, 0, .008);
  for (const side of [-1,1]) {
    line(g, [[-.065,y+.027,side*.012],[.17,y+.028,side*.009],[.51,y+.026,side*.006]], .002, brass, 34);
  }
  // Quillons curl forward at their tips; a central jewel sits in the guard.
  block(g, .048, .033, .32, brass, -.15, y, 0, .008);
  for (const side of [-1,1]) {
    line(g, [[-.15,y+.006,side*.13],[-.174,y+.008,side*.18],[-.193,y+.016,side*.21]], .011, darkBrass, 16);
    add(g,new THREE.SphereGeometry(.013,12,8),brass,-.196,y+.015,side*.214);
  }
  block(g, .36, .049, .044, leather, -.355, y, 0, .014);
  cylinder(g, .027, .027, .365, black, -.353, y);
  for (let i = 0; i < 19; i++) {
    const x = -.525 + i * .019;
    const wrap = torus(g, .029, .0024, i % 4 === 0 ? brass : leather, x, y);
    wrap.rotation.z = .11;
  }
  cylinder(g, .036, .036, .019, brass, -.539, y);
  add(g,new THREE.SphereGeometry(.052,16,12),darkBrass,-.591,y,0).scale.set(.6,1,.85);
  add(g,new THREE.OctahedronGeometry(.022,0),mat(0x6d2735,.25,.28),-.15,y+.023,0);
  for (const x of [.14,.20,.26]) block(g,.018,.0016,.0025,darkBrass,x,y+.025,0,.0007);
}

export function weaponGroup(id, r) {
  const g = new THREE.Group();
  switch (id) {
    case "flashlight": flashlight(g,r); break;
    case "knife": combatKnife(g,r); break;
    case "kitchen_knife": kitchenKnife(g,r); break;
    case "broken_pipe": pipeWall(g,r); break;
    case "pistol": pistol(g,r); break;
    case "hammer": hammer(g,r); break;
    case "rope": rope(g,r); break;
    case "two_handed_sword": sword(g,r); break;
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffcf7a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .25 }));
  halo.scale.setScalar(.55);
  g.add(halo);
  g.userData.halo = halo;
  return g;
}
