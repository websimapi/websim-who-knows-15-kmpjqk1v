// A small recycled pool of leaves around the camera. Trees themselves sway on
// the GPU, so the CPU only moves the handful of leaves that can be seen.
import * as THREE from "three";

export class LeafFall {
  constructor(parent, trees, quality) {
    this.trees = trees;
    this.capacity = quality === "high" ? 120 : quality === "medium" ? 70 : 32;
    const shape = new THREE.Shape();
    shape.moveTo(0, -.65); shape.bezierCurveTo(-.55, -.1, -.45, .3, 0, .8);
    shape.bezierCurveTo(.45, .3, .55, -.1, 0, -.65);
    const geometry = new THREE.ShapeGeometry(shape, 3);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1, transparent: true, opacity: .87, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
    this.near = [];
    this.active = [];
    this.scanT = 0;
    this.spawnT = 0;
    this.dummy = new THREE.Object3D();
    this.palette = [0x78954d, 0x9c9951, 0x997a3c, 0xb3a668, 0x587d3f].map(v => new THREE.Color(v));
    this.mesh.setColorAt(0, this.palette[0]);
  }

  update(dt, time, wind, x, z, heightAt) {
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 1.1;
      this.near = this.trees.filter(t => (t[0] - x) ** 2 + (t[2] - z) ** 2 < 48 ** 2);
    }
    if (this.near.length) {
      this.spawnT = Math.min(2, this.spawnT + dt * (this.capacity / 12));
      while (this.spawnT >= 1 && this.active.length < this.capacity) {
        this.spawnT--;
        const t = this.near[Math.floor(Math.random() * this.near.length)];
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 3.1 * t[3];
        this.active.push({ x: t[0] + Math.cos(a) * r, y: t[1] + (4.6 + Math.random() * 2.8) * t[3], z: t[2] + Math.sin(a) * r,
          drift: .25 + Math.random() * .5, fall: .5 + Math.random() * .45, phase: Math.random() * 6.28,
          spin: (Math.random() * 2 - 1) * 2, size: (.11 + Math.random() * .11) * t[3], tint: Math.floor(Math.random() * this.palette.length) });
      }
    } else this.spawnT = 0;
    let count = 0;
    for (const leaf of this.active) {
      leaf.x += (wind.x * leaf.drift + Math.sin(time * 2.3 + leaf.phase) * .18) * dt;
      leaf.z += (wind.z * leaf.drift + Math.cos(time * 1.8 + leaf.phase) * .15) * dt;
      leaf.y -= leaf.fall * dt;
      leaf.phase += leaf.spin * dt;
      if (leaf.y <= heightAt(leaf.x, leaf.z) + .04 || Math.hypot(leaf.x - x, leaf.z - z) > 65) continue;
      const d = this.dummy;
      d.position.set(leaf.x, leaf.y, leaf.z);
      d.rotation.set(Math.sin(leaf.phase) * .8, leaf.phase, Math.cos(leaf.phase * .7) * 1.1);
      d.scale.setScalar(leaf.size);
      d.updateMatrix();
      this.mesh.setMatrixAt(count, d.matrix);
      this.mesh.setColorAt(count, this.palette[leaf.tint]);
      this.active[count++] = leaf;
    }
    this.active.length = count;
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
