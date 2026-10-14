import * as THREE from "three";
import { gearTexture } from "./gear-textures.js";

export function buildHelmet(look) {
  const kind = look.helmet;
  if (!kind) return null;
  const f = look.face || {};
  const h = look.head || 1;
  const x = 0.086 * h * (f.width || 1);
  const y = 0.112 * h * (f.length || 1);
  const z = 0.109 * h * (f.depth || 1);
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: look.helmetColor || "#8999a4", map: gearTexture("steel"), metalness: 0.76, roughness: 0.38, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: look.trim || "#c9a04a", map: gearTexture("brass"), metalness: 0.7, roughness: 0.4 });
  const leather = new THREE.MeshStandardMaterial({ color: look.helmetColor || "#76573c", map: gearTexture("leather"), roughness: 0.91, side: THREE.DoubleSide });
  const mail = new THREE.MeshStandardMaterial({ color: look.helmetColor || "#8b9095", map: gearTexture("mail"), metalness: 0.62, roughness: 0.5, side: THREE.DoubleSide });
  const hood = kind === "leather_hood";
  const coif = kind === "mail_coif";
  const material = hood ? leather : coif ? mail : metal;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, hood || coif ? 2.1 : 1.74), material);
  shell.scale.set(x * 1.05, y * 1.03, z * 1.04);
  shell.position.set(0, 0.105 * h, 0.009);
  shell.castShadow = true;
  g.add(shell);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 7, 36), hood ? leather : trim);
  band.scale.set(x * 1.09, z * 1.09, 0.008);
  band.rotation.x = Math.PI / 2;
  band.position.set(0, 0.105 * h - y * (hood || coif ? 0.51 : 0.15), 0.009);
  band.castShadow = true;
  g.add(band);
  const rivet = (sx, sy, sz, size = 0.008) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size * h, 10, 7), trim);
    m.position.set(sx * x, 0.105 * h + sy * y, 0.009 + sz * z);
    m.castShadow = true;
    g.add(m);
  };
  if (hood) {
    // Folded brim and stitched edge, kept above the eyes.
    for (const s of [-1, 1]) {
      const seam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * x * 0.82, 0.105 * h + y * 0.25, z * 0.54),
        new THREE.Vector3(s * x * 0.59, 0.105 * h + y * 0.53, z * 0.82),
        new THREE.Vector3(0, 0.105 * h + y * 0.7, z * 0.78),
      ]), 12, 0.0025, 5, false), trim);
      g.add(seam);
    }
  } else if (coif) {
    for (const s of [-1, 1]) rivet(s * 0.74, -0.45, 0.48, 0.006);
  } else {
    // Raised brow and an articulated nasal guard make a readable helmet face.
    const brow = new THREE.Mesh(new THREE.BoxGeometry(x * 1.7, 0.012 * h, 0.018 * h), metal);
    brow.position.set(0, 0.105 * h + y * 0.05, z * 0.83);
    brow.castShadow = true;
    g.add(brow);
    const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.015 * h, 0.058 * h, 0.013 * h), metal);
    nasal.position.set(0, 0.105 * h - y * 0.25, z * 1.01);
    nasal.castShadow = true;
    g.add(nasal);
    for (const s of [-1, 1]) {
      rivet(s * 0.77, 0.02, 0.66);
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.018 * h, 0.057 * h, 0.032 * h), metal);
      cheek.position.set(s * x * 0.85, 0.105 * h - y * 0.53, z * 0.34);
      cheek.rotation.z = s * 0.25;
      cheek.castShadow = true;
      g.add(cheek);
    }
    if (kind === "warden_sallet" || kind === "crest_helm") {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.014 * h, y * 0.95, 0.022 * h), trim);
      ridge.rotation.x = -0.48;
      ridge.position.set(0, 0.105 * h + y * 0.8, -z * 0.05);
      g.add(ridge);
    }
    if (kind === "crest_helm") {
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.027 * h, 0.105 * h, 10), trim);
      crest.position.set(0, 0.105 * h + y * 1.22, -z * 0.12);
      crest.castShadow = true;
      g.add(crest);
    }
  }
  return g;
}
