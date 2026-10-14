import * as THREE from "three";

// A pooled ground stain and a few small droplets: two draw calls while feeding.
export class FeedingFX {
  constructor(scene) {
    this.root = new THREE.Group(); scene.add(this.root); this.root.visible = false;
    this.stainMaterial = new THREE.MeshBasicMaterial({ color: 0x710e19, transparent: true, opacity: .5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const stainGeometry = new THREE.CircleGeometry(1, 24);
    const rim = stainGeometry.attributes.position;
    for (let i = 1; i < rim.count; i++) {
      const r = 1 + Math.sin(i * 2.4) * .08 + Math.sin(i * 5.7) * .055;
      rim.setXY(i, rim.getX(i) * r, rim.getY(i) * r);
    }
    stainGeometry.computeVertexNormals();
    this.stain = new THREE.Mesh(stainGeometry, this.stainMaterial);
    this.stain.rotation.x = -Math.PI / 2; this.stain.position.y = .022;
    this.root.add(this.stain);
    this.dropMaterial = new THREE.MeshBasicMaterial({ color: 0xa21620 });
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), this.dropMaterial, 10);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.frustumCulled = false;
    this.root.add(this.drops);
    this.particles = Array.from({ length: 10 }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
    this.dummy = new THREE.Object3D();
    this.next = 0; this.emit = 0; this.age = 0; this.linger = 0; this.active = false;
    this.dummy.scale.setScalar(0); this.dummy.updateMatrix();
    for (let i = 0; i < 10; i++) this.drops.setMatrixAt(i, this.dummy.matrix);
    this.drops.instanceMatrix.needsUpdate = true;
  }
  update(dt, position, feeding) {
    if (feeding) {
      if (!this.active) { this.age = 0; this.emit = 0; }
      this.active = true; this.linger = 2.4; this.root.visible = true;
      this.root.position.copy(position);
      this.age += dt;
      this.emit += dt * 7;
      while (this.emit >= 1) {
        this.emit--;
        const p = this.particles[this.next]; this.next = (this.next + 1) % this.particles.length;
        p.life = .35 + Math.random() * .3;
        p.x = (Math.random() - .5) * .3; p.y = .28 + Math.random() * .16; p.z = (Math.random() - .5) * .3;
        p.vx = (Math.random() - .5) * .9; p.vy = .5 + Math.random() * .7; p.vz = (Math.random() - .5) * .9;
      }
    } else {
      this.active = false;
      this.linger = Math.max(0, this.linger - dt);
      if (!this.linger) { this.root.visible = false; return; }
    }
    const fade = feeding ? 1 : this.linger / 2.4;
    this.stainMaterial.opacity = .5 * fade;
    const spread = Math.min(1.08, .36 + this.age * .09);
    this.stain.scale.set(spread * 1.18, spread * .83, 1);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.life -= dt; p.vy -= 5.5 * dt;
        p.x += p.vx * dt; p.y = Math.max(.025, p.y + p.vy * dt); p.z += p.vz * dt;
        if (p.y <= .025) p.life = 0;
      }
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(p.life > 0 ? .025 : 0);
      this.dummy.updateMatrix(); this.drops.setMatrixAt(i, this.dummy.matrix);
    }
    this.drops.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.root.removeFromParent();
    this.stain.geometry.dispose(); this.stainMaterial.dispose();
    this.drops.geometry.dispose(); this.dropMaterial.dispose();
  }
}
