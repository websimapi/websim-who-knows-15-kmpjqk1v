// Equipment meshes. Every held weapon has its grip at the origin and its
// working end toward +Z, matching the existing hand-bone attachment contract.
import * as THREE from "three";
import { gearTexture } from "./gear-textures.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function bladeGeometry(profile, thickness) {
  // Four-sided diamond sections share every ring. The terminal ring belongs
  // to the same mesh, so the point cannot separate from the blade.
  const p = [], uv = [], ix = [];
  const end = profile.at(-1)[0] - profile[0][0];
  profile.forEach(([z, w, offset = 0], i) => {
    const t = thickness * (0.55 + 0.45 * w / Math.max(profile[0][1], 0.001));
    for (const [x, y] of [[0, t], [w, 0], [0, -t], [-w, 0]]) {
      p.push(offset + x, y, z);
      uv.push((x / Math.max(w, 0.001) + 1) * 0.5, (z - profile[0][0]) / end);
    }
    if (i) for (let j = 0; j < 4; j++) {
      const a = (i - 1) * 4 + j, b = (i - 1) * 4 + (j + 1) % 4;
      const c = i * 4 + j, d = i * 4 + (j + 1) % 4;
      ix.push(a, c, b, b, c, d);
    }
  });
  ix.push(0, 1, 2, 0, 2, 3);
  const n = (profile.length - 1) * 4;
  ix.push(n, n + 2, n + 1, n, n + 3, n + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

function prism(points, depth = 0.035) {
  const sh = new THREE.Shape();
  sh.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, z]) => sh.lineTo(x, z));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.004, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(Math.PI / 2);
  g.translate(0, depth / 2, 0);
  return g;
}

export function buildWeapon(kind, colors = {}) {
  const g = new THREE.Group();
  const worn = colors.finish === "worn" || colors.finish === "rusted";
  const steel = new THREE.MeshStandardMaterial({ color: worn ? "#a1a49d" : "#d5e1e5", map: gearTexture("steel"), metalness: worn ? 0.48 : 0.82, roughness: worn ? 0.53 : 0.28 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: colors.finish === "rusted" ? "#75503c" : "#65717b", map: gearTexture("steel"), metalness: 0.66, roughness: 0.44 });
  const brass = new THREE.MeshStandardMaterial({ color: colors.trim || "#caa769", map: gearTexture("brass"), metalness: 0.7, roughness: 0.32 });
  const wood = new THREE.MeshStandardMaterial({ color: "#9b7252", map: gearTexture("wood"), roughness: 0.83 });
  const leather = new THREE.MeshStandardMaterial({ color: "#4d3025", map: gearTexture("leather"), roughness: 0.9 });
  const pale = new THREE.MeshStandardMaterial({ color: "#e7dcc8", roughness: 0.66 });
  const gem = new THREE.MeshStandardMaterial({ color: "#67b9cf", emissive: "#276e91", emissiveIntensity: 0.55, metalness: 0.15, roughness: 0.16 });
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  const shaft = (z0, z1, radius = 0.016, material = wood) => {
    const m = add(new THREE.CylinderGeometry(radius * 0.9, radius, z1 - z0, 12, 1), material, 0, 0, (z0 + z1) / 2);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  const ring = (z, radius, tube = 0.004, material = brass) => add(new THREE.TorusGeometry(radius, tube, 6, 20), material, 0, 0, z);
  const tube = (pts, radius, material) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V(...p))), Math.max(12, pts.length * 2), radius, 7, false), material);
  const grip = (z0, z1, radius = 0.015) => {
    shaft(z0, z1, radius, wood);
    const wraps = Math.max(4, Math.round((z1 - z0) / 0.028));
    const spiral = [];
    for (let i = 0; i <= wraps * 8; i++) {
      const t = i / (wraps * 8), a = t * wraps * Math.PI * 2;
      spiral.push([Math.cos(a) * (radius + 0.001), Math.sin(a) * (radius + 0.001), z0 + (z1 - z0) * t]);
    }
    tube(spiral, 0.0018, leather);
    ring(z0 + 0.006, radius + 0.003);
    ring(z1 - 0.006, radius + 0.003);
  };
  const stud = (x, y, z, r = 0.012, material = brass) => add(new THREE.SphereGeometry(r, 10, 8), material, x, y, z);

  const swords = {
    blade: [0.68, 0.039, 0, 0.014], longsword: [0.82, 0.043, 0, 0.016],
    greatsword: [1.05, 0.065, 0, 0.023], shortsword: [0.47, 0.034, 0, 0.012],
    rapier: [0.85, 0.019, 0, 0.009], scimitar: [0.72, 0.048, 0.14, 0.013],
    dagger: [0.3, 0.027, 0, 0.01],
  };
  if (swords[kind]) {
    const [len, width, curve, thick] = swords[kind];
    const base = kind === "dagger" ? 0.075 : 0.105;
    const profile = [[base, width * 0.72, 0], [base + len * 0.12, width, curve * 0.04], [base + len * 0.64, width * (kind === "rapier" ? 0.72 : 0.82), curve * 0.52], [base + len * 0.87, width * 0.54, curve * 0.86], [base + len, 0.0006, curve]];
    add(bladeGeometry(profile, thick), steel);
    // Central fuller and edge bevel are readable in silhouette and close-up.
    if (kind !== "rapier") tube([[0, thick + 0.001, base + 0.045], [curve * 0.13, thick + 0.001, base + len * 0.28], [curve * 0.52, thick * 0.7, base + len * 0.64]], 0.0023, darkSteel);
    const guardW = kind === "greatsword" ? 0.13 : kind === "rapier" ? 0.115 : kind === "dagger" ? 0.05 : 0.085;
    tube([[-guardW, 0, base - 0.006], [-guardW * 0.7, 0.003, base + 0.018], [0, 0, base - 0.005], [guardW * 0.7, 0.003, base + 0.018], [guardW, 0, base - 0.006]], 0.007, brass);
    stud(-guardW, 0, base - 0.006, 0.011);
    stud(guardW, 0, base - 0.006, 0.011);
    grip(kind === "greatsword" ? -0.21 : -0.115, base - 0.018, kind === "greatsword" ? 0.02 : 0.015);
    stud(0, 0, kind === "greatsword" ? -0.23 : -0.13, kind === "greatsword" ? 0.029 : 0.023);
    if (kind === "rapier") {
      tube([[-0.045, 0, base], [-0.066, 0.036, 0.03], [0, 0.047, -0.055], [0.066, 0.036, 0.03], [0.045, 0, base]], 0.004, brass);
      ring(0.075, 0.02, 0.003, brass);
    }
  } else if (["spear", "glaive", "halberd", "trident"].includes(kind)) {
    const long = kind === "spear" ? 1.42 : 1.58;
    shaft(-0.54, long - 0.13, 0.016);
    grip(-0.2, 0.16, 0.018);
    ring(long - 0.23, 0.024, 0.006);
    ring(-0.51, 0.019, 0.005, darkSteel);
    if (kind === "spear" || kind === "trident") {
      add(bladeGeometry([[long - 0.24, 0.018], [long - 0.12, 0.041], [long + 0.07, 0.0005]], 0.013), steel);
      if (kind === "trident") for (const s of [-1, 1]) {
        tube([[s * 0.017, 0, long - 0.28], [s * 0.1, 0, long - 0.12], [s * 0.11, 0, long + 0.02]], 0.009, steel);
        add(new THREE.ConeGeometry(0.012, 0.08, 7), steel, s * 0.11, 0, long + 0.06).rotation.x = Math.PI / 2;
      }
    } else {
      const shape = kind === "glaive" ? [[-0.014, long - 0.29], [0.065, long - 0.23], [0.11, long - 0.03], [0.04, long + 0.15], [0.002, long + 0.16], [-0.018, long + 0.05]]
        : [[-0.012, long - 0.31], [0.055, long - 0.27], [0.15, long - 0.19], [0.1, long + 0.02], [0.015, long + 0.13], [-0.018, long + 0.02]];
      add(prism(shape, 0.024), steel);
      if (kind === "halberd") {
        add(new THREE.ConeGeometry(0.023, 0.19, 8), steel, 0, 0, long + 0.1).rotation.x = Math.PI / 2;
        add(new THREE.ConeGeometry(0.018, 0.17, 8), darkSteel, -0.075, 0, long - 0.18).rotation.z = -Math.PI / 2;
      }
    }
  } else if (["axe", "greataxe", "warhammer", "mace", "morningstar", "flail"].includes(kind)) {
    const heavy = kind === "greataxe";
    const top = heavy ? 0.82 : kind === "flail" ? 0.5 : 0.58;
    shaft(-0.18, top, heavy ? 0.022 : 0.018);
    grip(-0.15, 0.15, heavy ? 0.023 : 0.019);
    ring(top - 0.11, heavy ? 0.03 : 0.024, 0.006);
    stud(0, 0, -0.19, 0.026);
    if (kind === "axe" || heavy) {
      const w = heavy ? 0.23 : 0.17;
      add(prism([[0.006, top - 0.16], [w * 0.52, top - 0.14], [w, top - 0.26], [w * 0.85, top], [w, top + 0.23], [w * 0.48, top + 0.13], [0.006, top + 0.13]], heavy ? 0.05 : 0.036), steel);
      if (heavy) add(prism([[-0.006, top - 0.15], [-w * 0.5, top - 0.12], [-w * 0.9, top - 0.2], [-w * 0.8, top], [-w * 0.9, top + 0.2], [-w * 0.45, top + 0.12], [-0.006, top + 0.13]], 0.05), steel);
      ring(top, 0.032, 0.008, darkSteel);
      for (const s of [-1, 1]) stud(0, s * 0.025, top, 0.012);
    } else if (kind === "warhammer") {
      add(new THREE.BoxGeometry(0.3, 0.075, 0.11, 2, 2, 2), darkSteel, 0, 0, top);
      add(new THREE.BoxGeometry(0.055, 0.08, 0.13), steel, 0.135, 0, top);
      add(new THREE.ConeGeometry(0.05, 0.14, 8), steel, -0.18, 0, top).rotation.z = -Math.PI / 2;
      for (const s of [-1, 1]) stud(0, s * 0.046, top, 0.016);
    } else if (kind === "flail") {
      for (let i = 0; i < 5; i++) {
        const z = top + i * 0.055;
        const link = add(new THREE.TorusGeometry(0.025, 0.005, 6, 12), darkSteel, Math.sin(i * 0.7) * 0.01, 0, z);
        link.rotation.y = i % 2 ? Math.PI / 2 : 0;
      }
      stud(0.014, 0, top + 0.36, 0.078, darkSteel);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const spike = add(new THREE.ConeGeometry(0.014, 0.055, 6), steel, 0.014 + Math.cos(a) * 0.072, Math.sin(a) * 0.072, top + 0.36);
        spike.rotation.z = -Math.PI / 2 + a;
      }
    } else {
      const r = kind === "morningstar" ? 0.076 : 0.07;
      add(new THREE.IcosahedronGeometry(r, 1), darkSteel, 0, 0, top);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const spike = add(new THREE.ConeGeometry(kind === "morningstar" ? 0.016 : 0.021, kind === "morningstar" ? 0.085 : 0.058, 7), steel, Math.cos(a) * r, Math.sin(a) * r, top);
        spike.rotation.z = -Math.PI / 2 + a;
      }
      stud(0, 0, top + r, 0.019, brass);
    }
  } else if (kind === "staff" || kind === "wand") {
    const length = kind === "staff" ? 1.55 : 0.47;
    const low = kind === "staff" ? -0.55 : -0.14;
    tube([[0, 0, low], [0.008, 0, length * 0.2], [-0.008, 0.006, length * 0.63], [0, 0, length]], kind === "staff" ? 0.022 : 0.011, wood);
    grip(kind === "staff" ? -0.08 : -0.12, kind === "staff" ? 0.25 : 0.1, kind === "staff" ? 0.022 : 0.012);
    for (const z of [length - 0.22, length - 0.16, length - 0.08]) ring(z, kind === "staff" ? 0.025 : 0.014, 0.005);
    const crystal = add(new THREE.OctahedronGeometry(kind === "staff" ? 0.075 : 0.031, 1), gem, 0, 0, length + (kind === "staff" ? 0.055 : 0.02));
    crystal.scale.z = 1.4;
    g.userData.glow = crystal;
    if (kind === "staff") for (const s of [-1, 1]) tube([[0, 0, length - 0.16], [s * 0.07, 0, length - 0.04], [s * 0.04, 0, length + 0.1]], 0.008, brass);
  } else if (["bow", "longbow", "recurve", "crossbow"].includes(kind)) {
    if (kind === "crossbow") {
      shaft(-0.2, 0.63, 0.033, wood);
      grip(-0.16, 0.13, 0.03);
      tube([[-0.36, 0, 0.46], [-0.21, 0.03, 0.38], [0, 0.025, 0.33], [0.21, 0.03, 0.38], [0.36, 0, 0.46]], 0.014, wood);
      tube([[-0.36, 0, 0.46], [0, 0, 0.33], [0.36, 0, 0.46]], 0.0025, pale);
      add(new THREE.BoxGeometry(0.06, 0.028, 0.35), darkSteel, 0, 0.046, 0.38);
      stud(0, 0.063, 0.6, 0.018, brass);
    } else {
      const span = kind === "longbow" ? 0.86 : 0.7;
      const bend = kind === "recurve" ? 0.18 : 0.1;
      const curve = [[0, -span, -bend * 0.6], [0, -span * 0.7, bend], [0, 0, 0], [0, span * 0.7, bend], [0, span, -bend * 0.6]];
      tube(curve, kind === "longbow" ? 0.016 : 0.019, wood);
      tube([[0, -span, -bend * 0.6], [0, 0, -0.08], [0, span, -bend * 0.6]], 0.0024, pale);
      shaft(-0.12, 0.12, 0.028, leather);
      for (const s of [-1, 1]) {
        stud(0, s * span, -bend * 0.6, 0.015, brass);
        const binding = add(new THREE.TorusGeometry(0.021, 0.004, 6, 14), brass, 0, s * span * 0.79, bend * 0.45);
        binding.rotation.x = Math.PI / 2;
      }
    }
  } else if (kind === "shield") {
    const face = new THREE.MeshStandardMaterial({ color: colors.primary || "#657787", map: gearTexture("steel"), metalness: 0.58, roughness: 0.39 });
    add(new THREE.CylinderGeometry(0.27, 0.27, 0.043, 32), wood, 0, 0, 0).rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.247, 0.247, 0.048, 32), face, 0.006, 0, 0).rotation.z = Math.PI / 2;
    const rim = add(new THREE.TorusGeometry(0.26, 0.013, 7, 36), brass, 0.034, 0, 0);
    rim.rotation.y = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      stud(0.037, Math.sin(a) * 0.224, Math.cos(a) * 0.224, 0.008, brass);
    }
    const boss = add(new THREE.SphereGeometry(0.085, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), brass, 0.05, 0, 0);
    boss.rotation.z = -Math.PI / 2;
    tube([[0.045, -0.18, 0], [0.055, 0, 0], [0.045, 0.18, 0]], 0.008, pale);
    // The visible grip sits behind the boss. The hand wraps around this bar;
    // its two mounts join the back of the wooden disc.
    tube([[-0.025, -0.09, 0], [-0.06, -0.09, 0], [-0.06, 0.09, 0], [-0.025, 0.09, 0]], 0.008, brass);
    tube([[-0.062, -0.07, 0], [-0.062, 0, 0], [-0.062, 0.07, 0]], 0.014, leather);
  }
  return g;
}
