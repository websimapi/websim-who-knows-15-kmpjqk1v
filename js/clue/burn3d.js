// Burning props and the ash they leave behind.
import * as THREE from "three";
import { HOT_BY_ID } from "./burning.js";

const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const coreMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const smokeMat = new THREE.MeshBasicMaterial({ color: 0x777066, transparent: true, opacity: 0.25, depthWrite: false });
const ashMat = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 1 });
const ashLight = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 1 });
const flameGeo = new THREE.ConeGeometry(0.07, 0.24, 7, 1, true);
const puffGeo = new THREE.SphereGeometry(0.05, 6, 5);

// flags & 8: in a hot spot (smouldering) · flags & 16: alight · progress 0..1.
export function burnVisual(g, flags, progress, time) {
  const on = flags & 8, lit = flags & 16;
  let fx = g.userData.burnFx;
  if (!on) { if (fx) { fx.visible = false; g.userData.inner.scale.setScalar(1); } return; }
  if (!fx) {
    fx = new THREE.Group();
    const f = new THREE.Mesh(flameGeo, flameMat), c = new THREE.Mesh(flameGeo, coreMat);
    f.position.y = 0.1; c.scale.setScalar(0.55); c.position.y = 0.06;
    const puffs = [0, 1, 2].map((i) => { const m = new THREE.Mesh(puffGeo, smokeMat); fx.add(m); return m; });
    fx.add(f, c); fx.userData = { f, c, puffs };
    g.add(fx); g.userData.burnFx = fx;
  }
  fx.visible = true;
  const { f, c, puffs } = fx.userData;
  f.visible = c.visible = !!lit;
  const flick = 0.85 + Math.sin(time * 23 + g.id) * 0.1 + Math.sin(time * 37) * 0.06;
  const size = lit ? Math.max(0.35, 1.3 - progress) : 0;
  f.scale.set(size, size * flick * 1.4, size); c.scale.set(size * 0.55, size * flick * 0.9, size * 0.55);
  puffs.forEach((m, i) => { const u = (time * 0.6 + i / 3) % 1; m.position.set(Math.sin(i * 2.1 + time) * 0.04, 0.12 + u * 0.55, Math.cos(i * 1.7) * 0.03); m.scale.setScalar(0.6 + u * 1.6); m.visible = true; });
  // The object shrinks and chars as it burns away.
  g.userData.inner.scale.setScalar(lit ? Math.max(0.15, 1 - progress * 0.85) : 1);
}

// A small grey heap in each grate (or on the stovetop) that holds ash.
export class AshPiles {
  constructor(scene) { this.scene = scene; this.piles = new Map(); }
  update(list = []) {
    const want = new Map(list);
    for (const [id, n] of want) {
      const s = HOT_BY_ID[id];
      if (!s) continue;
      let pile = this.piles.get(id);
      if (!pile) {
        pile = new THREE.Group(); pile.position.set(s.x, id === "stove" ? 0.94 : 0.02, s.z);
        this.scene.add(pile); this.piles.set(id, pile);
      }
      if (pile.userData.n === n) continue;
      pile.userData.n = n;
      pile.clear();
      for (let i = 0; i < Math.min(8, 2 + n * 2); i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 7, 5), i % 3 ? ashMat : ashLight);
        m.scale.y = 0.35; m.position.set((Math.random() - 0.5) * 0.35, 0.01, (Math.random() - 0.5) * 0.25);
        pile.add(m);
      }
    }
    for (const [id, pile] of this.piles) if (!want.has(id)) { this.scene.remove(pile); this.piles.delete(id); }
  }
}
