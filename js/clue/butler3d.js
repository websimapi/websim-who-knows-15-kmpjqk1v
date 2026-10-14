// What the butler carries on his rounds: a mop, a bin bag, or fresh supplies.
import * as THREE from "three";

export function butlerTools(root) {
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  const add = (g, geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };

  const mop = new THREE.Group();
  const stick = add(mop, new THREE.CylinderGeometry(0.018, 0.018, 1.45, 8), mat(0x8a6a44), 0, 0.72, 0);
  stick.rotation.x = 0.35;
  const head = add(mop, new THREE.CylinderGeometry(0.11, 0.16, 0.16, 10), mat(0xd9d2bf, { roughness: 1 }), 0, 0.06, 0.24);
  head.rotation.x = 0.35;
  mop.position.set(0.32, 0, 0.35);

  const bag = new THREE.Group();
  const sack = add(bag, new THREE.SphereGeometry(0.2, 12, 10), mat(0x141414, { roughness: 0.35 }), 0, 0.42, 0);
  sack.scale.set(1, 1.25, 0.9);
  add(bag, new THREE.ConeGeometry(0.06, 0.14, 8), mat(0x141414, { roughness: 0.35 }), 0, 0.72, 0);
  bag.position.set(0.34, 0, 0.08);

  const supplies = new THREE.Group();
  add(supplies, new THREE.BoxGeometry(0.36, 0.16, 0.24), mat(0x9b7b4f), 0, 0.85, 0);
  add(supplies, new THREE.BoxGeometry(0.14, 0.08, 0.2), mat(0xf2efe6), -0.08, 0.97, 0);
  add(supplies, new THREE.CylinderGeometry(0.04, 0.045, 0.2, 10), mat(0xf4f4f0), 0.1, 1.02, 0);
  add(supplies, new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6), mat(0x2f6fb5), 0.1, 1.14, 0);
  supplies.position.set(0, 0, 0.38);

  const tools = [null, mop, bag, supplies];
  for (const t of tools) if (t) { t.visible = false; root.add(t); }
  let shown = 0;
  return (code) => {
    if (code === shown) return;
    shown = code;
    tools.forEach((t, i) => { if (t) t.visible = i === code; });
  };
}
