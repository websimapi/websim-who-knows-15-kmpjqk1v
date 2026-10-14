// Meshes for loose props and weapons. Each mesh's origin is the
// centre of its physics sphere (radius r): the bottom sits at y = -r.
import * as THREE from "three";
import { MAT, box, cyl } from "./furniture3d.js";
import { flameTexture, fabricTexture } from "./textures.js";
import { weaponGroup } from "./weapons3d.js";

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
const P = {
  steel: M(0x8f949a, { metalness: 0.9, roughness: 0.3 }), copper: M(0xb06a3a, { metalness: 0.85, roughness: 0.35 }), china: M(0xf3efe6, { roughness: 0.2 }),
  bottle: M(0x1f3a1a, { roughness: 0.08, transparent: true, opacity: 0.85 }), apple: M(0x8a1a14, { roughness: 0.45 }), bread: M(0xb07a3a, { roughness: 0.9 }),
  jar: M(0xc0c8b0, { roughness: 0.1, transparent: true, opacity: 0.6 }), wax: M(0xefe6cc, { roughness: 0.7 }), bucket: M(0x6a6a6e, { metalness: 0.6, roughness: 0.5 }),
  hat: M(0x16161a, { roughness: 0.9 }), book: [M(0x6a1a1e), M(0x1e3a5a), M(0x2e4a22), M(0x5a3a1a)], paper: M(0xe8e0c8, { roughness: 1 }),
  bone: M(0xd8cfb4, { roughness: 0.6 }), lantern: M(0x1a1612, { metalness: 0.6, roughness: 0.4 }), pillow: M(0x7a2a3a, { roughness: 1 }), log: M(0x4a3020, { roughness: 1 }),
  umbrella: M(0x121214, { roughness: 0.8 }), shade: M(0x2a5a3a, { emissive: 0x2a6a3a, emissiveIntensity: 0.4 }), box: M(0x4a2a14, { roughness: 0.5 }),
};
const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd090 });

// A crumpled cloth: a subdivided plane with lumpy height.
function clothGeo(w, d, h) {
  const geo = new THREE.PlaneGeometry(w, d, 12, 10);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, h * (0.5 + 0.5 * Math.sin(x * 37 + z * 11) * Math.cos(z * 29 - x * 7)) * (1 - Math.abs(x) / w));
  }
  geo.computeVertexNormals();
  return geo;
}

// Bloodied / bleach-wet tint for cloth items.
export function tintItem(g, flags) {
  const c = g.userData.inner?.userData.cloth;
  if (!c || g.userData.flags === flags) return;
  g.userData.flags = flags;
  const base = (c.userData.base ??= c.material.color.getHex());
  c.material.color.setHex(flags & 1 ? 0x6a0d0a : flags & 2 ? 0xdcd8cc : base);
  c.material.roughness = flags & 1 ? 0.55 : flags & 2 ? 0.4 : 1;
}

function kindMesh(kind, r) {
  const g = new THREE.Group();
  const b = -r;
  switch (kind) {
    case "pan": cyl(0.12, 0.1, 0.05, P.steel, 0, b, 0, g, 18); box(0.2, 0.02, 0.03, MAT.darkWood, 0.2, b + 0.035, 0, g); break;
    case "pot": cyl(0.11, 0.1, 0.16, P.copper, 0, b, 0, g, 18); for (const s of [-1, 1]) box(0.04, 0.02, 0.02, P.copper, s * 0.13, b + 0.12, 0, g); break;
    case "plate": cyl(0.11, 0.08, 0.018, P.china, 0, b, 0, g, 22); break;
    case "cup": cyl(0.045, 0.035, 0.08, P.china, 0, b, 0, g, 12); { const h = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 10), P.china); h.position.set(0.05, b + 0.045, 0); g.add(h); } break;
    case "glass": cyl(0.035, 0.03, 0.1, MAT.glass, 0, b, 0, g, 12); break;
    case "bottle": cyl(0.06, 0.06, 0.2, P.bottle, 0, b, 0, g, 12); cyl(0.02, 0.05, 0.06, P.bottle, 0, b + 0.2, 0, g, 10); cyl(0.018, 0.018, 0.06, P.bottle, 0, b + 0.26, 0, g, 8); break;
    case "apple": { const a = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), P.apple); a.castShadow = true; g.add(a); cyl(0.003, 0.003, 0.02, MAT.wood, 0, 0.04, 0, g, 4); break; }
    case "bread": { const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), P.bread); m.scale.set(1.4, 0.6, 0.8); m.castShadow = true; g.add(m); break; }
    case "jar": cyl(0.065, 0.065, 0.14, P.jar, 0, b, 0, g, 14); cyl(0.06, 0.06, 0.02, P.steel, 0, b + 0.14, 0, g, 14); break;
    case "candle": cyl(0.05, 0.06, 0.02, MAT.brass, 0, b, 0, g, 12); cyl(0.02, 0.02, 0.16, P.wax, 0, b + 0.02, 0, g, 8); { const f = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), glowMat); f.position.y = b + 0.2; f.scale.y = 1.8; g.add(f); g.userData.flame = f; } break;
    case "bucket": cyl(0.15, 0.12, 0.26, P.bucket, 0, b, 0, g, 16); break;
    case "vase": { const pts = [[0.04, 0], [0.09, 0.06], [0.1, 0.14], [0.05, 0.24], [0.04, 0.28], [0.06, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)); const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), M(0x2a4a7a, { roughness: 0.2 })); m.position.y = b; m.castShadow = true; g.add(m); break; }
    case "hat": cyl(0.15, 0.15, 0.012, P.hat, 0, b, 0, g, 20); cyl(0.085, 0.09, 0.14, P.hat, 0, b, 0, g, 16); break;
    case "teapot": { const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), P.china); m.scale.y = 0.8; m.position.y = b + 0.065; m.castShadow = true; g.add(m); const sp = cyl(0.012, 0.02, 0.09, P.china, 0.09, b + 0.05, 0, g, 8); sp.rotation.z = -0.8; break; }
    case "book": { const c = P.book[Math.floor(Math.random() * 4)]; box(0.2, 0.05, 0.15, c, 0, b, 0, g); box(0.19, 0.042, 0.005, P.paper, 0.005, b + 0.004, 0.073, g); break; }
    case "watering": cyl(0.1, 0.11, 0.18, P.bucket, 0, b, 0, g, 14); { const s = cyl(0.012, 0.02, 0.22, P.bucket, 0.13, b + 0.06, 0, g, 6); s.rotation.z = -0.9; } break;
    case "torch": {
      // Pitch-soaked rag on a wooden stave; flame sprites lit by flag 4.
      cyl(0.022, 0.017, 0.5, MAT.darkWood, 0, b, 0, g, 8);
      cyl(0.04, 0.03, 0.09, P.lantern, 0, b + 0.48, 0, g, 10);
      cyl(0.034, 0.034, 0.05, P.log, 0, b + 0.53, 0, g, 8);
      const fl = new THREE.Group(); fl.position.y = b + 0.6;
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        sp.userData = { ph: i * 0.33, s: 0.2 - i * 0.03 };
        sp.userData.noFow = true;
        fl.add(sp);
      }
      g.add(fl); g.userData.torch = fl;
      break;
    }
    case "lantern": cyl(0.07, 0.08, 0.02, P.lantern, 0, b, 0, g, 8); cyl(0.06, 0.06, 0.16, MAT.glass, 0, b + 0.02, 0, g, 8); cyl(0.02, 0.07, 0.05, P.lantern, 0, b + 0.18, 0, g, 8); { const f = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), glowMat); f.position.y = b + 0.1; g.add(f); } break;
    case "skull": { const s = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), P.bone); s.scale.set(0.85, 0.9, 1); s.position.y = 0.01; s.castShadow = true; g.add(s); box(0.08, 0.05, 0.07, P.bone, 0, b, 0.03, g); for (const x of [-0.03, 0.03]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), MAT.blackMatte); e.position.set(x, 0.01, 0.075); g.add(e); } break; }
    case "ashtray": cyl(0.07, 0.06, 0.03, MAT.glass, 0, b, 0, g, 14); break;
    case "cue": { const c = cyl(0.008, 0.014, 1.4, MAT.lightWood, 0, -0.7, 0, g, 6); g.rotation.z = Math.PI / 2; g.userData.long = true; break; }
    case "inkwell": cyl(0.04, 0.05, 0.06, MAT.glass, 0, b, 0, g, 10); { const q = cyl(0.002, 0.004, 0.2, MAT.cream, 0.01, b + 0.04, 0, g, 4); q.rotation.z = 0.3; } break;
    case "pillow": { const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4, 3, 1, 3), P.pillow); const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, pos.getY(i) * (1 - (x * x + z * z) * 3)); } m.geometry.computeVertexNormals(); m.position.y = -r + 0.07; m.castShadow = true; g.add(m); break; }
    case "log": { const l = cyl(0.09, 0.1, 0.5, P.log, 0, -0.25, 0, g, 8); g.rotation.z = Math.PI / 2; break; }
    case "umbrella": { cyl(0.04, 0.012, 0.9, P.umbrella, 0, b, 0, g, 8); const h = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 10, Math.PI), MAT.darkWood); h.position.y = b + 0.92; g.add(h); break; }
    case "lamp": cyl(0.06, 0.07, 0.02, MAT.brass, 0, b, 0, g, 10); cyl(0.008, 0.008, 0.28, MAT.brass, 0, b, 0, g, 6); { const s = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.1, 14, 1, true), P.shade); s.material.side = THREE.DoubleSide; s.position.y = b + 0.3; g.add(s); } break;
    case "paper": box(0.21, 0.004, 0.3, P.paper, 0, b, 0, g); break;
    case "box": box(0.22, 0.12, 0.16, P.box, 0, b, 0, g); box(0.23, 0.02, 0.17, MAT.brass, 0, b + 0.11, 0, g); break;
    case "rag": { const m = new THREE.Mesh(clothGeo(0.26, 0.2, 0.05), M(0xffffff, { map: fabricTexture("#b8ad94"), roughness: 1, side: THREE.DoubleSide })); m.position.y = b + 0.02; g.add(m); g.userData.cloth = m; box(0.07, 0.006, 0.05, M(0xd7c9a9, { roughness: 1 }), -0.055, b + 0.034, -0.03, g).rotation.y = 0.3; break; }
    case "towel": { const m = new THREE.Mesh(clothGeo(0.3, 0.2, 0.08), M(0xf0ece4, { roughness: 1 })); m.position.y = b + 0.03; g.add(m); g.userData.cloth = m; box(0.3, 0.01, 0.02, M(0x6a8ab0, { roughness: 1 }), 0, b + 0.07, 0.07, g); break; }
    case "bleach": {
      const body = M(0xe9eef2, { roughness: 0.35 }), cap = M(0x2a6ad0, { roughness: 0.4 });
      const m = cyl(0.036, 0.04, 0.115, body, 0, b, 0, g, 20); m.scale.z = 0.74;
      cyl(0.025, 0.034, 0.024, body, 0, b + 0.113, 0, g, 16);
      cyl(0.014, 0.014, 0.019, cap, 0, b + 0.137, 0, g, 12);
      box(0.066, 0.025, 0.036, cap, 0.015, b + 0.153, 0.012, g);
      box(0.016, 0.01, 0.028, MAT.blackMatte, 0.052, b + 0.16, 0.012, g);
      box(0.008, 0.036, 0.015, cap, -0.006, b + 0.116, 0.027, g).rotation.z = -0.18;
      box(0.054, 0.051, 0.003, M(0xf4f7f8, { roughness: 0.65 }), 0, b + 0.039, 0.029, g);
      box(0.054, 0.011, 0.004, cap, 0, b + 0.08, 0.031, g);
      for (const y of [0.046, 0.037, 0.028]) box(0.029, 0.002, 0.005, MAT.steel, 0, b + y, 0.032, g);
      break;
    }
    case "lens": {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 8, 20), MAT.brass); rim.rotation.x = Math.PI / 2; rim.position.y = b + 0.006; g.add(rim);
      const gl = new THREE.Mesh(new THREE.CircleGeometry(0.034, 20), new THREE.MeshStandardMaterial({ color: 0x9ad8ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.45, emissive: 0x2a5aff, emissiveIntensity: 0.6 }));
      gl.rotation.x = -Math.PI / 2; gl.position.y = b + 0.007; g.add(gl);
      const h = box(0.01, 0.008, 0.07, MAT.darkWood, 0, b + 0.002, 0.07, g);
      break;
    }
    case "coin": { const m = cyl(0.016, 0.016, 0.004, M(0xe8c040, { metalness: 1, roughness: 0.22, emissive: 0x3a2800, emissiveIntensity: 0.4 }), 0, b, 0, g, 18); break; }
    case "bandage": {
      const cloth = M(0xe9dfc8, { roughness: 0.95 }), edge = M(0xc8b99c, { roughness: 1 });
      cyl(0.048, 0.048, 0.08, cloth, 0, b, 0, g, 14).rotation.z = Math.PI / 2;
      for (const x of [-0.04, 0.04]) cyl(0.049, 0.049, 0.007, edge, x, b + 0.003, 0, g, 14).rotation.z = Math.PI / 2;
      box(0.07, 0.018, 0.065, cloth, 0.07, b + 0.008, 0, g);
      break;
    }
    default: { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), P.box); g.add(m); }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return g;
}

export function propMesh(p) {
  const holder = new THREE.Group();
  const inner = p.weapon || p.core ? weaponGroup(p.kind, p.r) : kindMesh(p.kind, p.r);
  holder.add(inner);
  holder.userData = { inner, halo: inner.userData.halo, flame: inner.userData.flame, torch: inner.userData.torch };
  return holder;
}
