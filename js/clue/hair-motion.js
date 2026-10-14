// Short-groom guide dynamics, inspired by Hair Salon's pinned-root Verlet solver.
// Meters, fixed 120 Hz, damped inertia, bend resistance, segment constraints,
// and ellipsoid scalp collision. Only Tomas owns these 24 guide chains.
import * as THREE from 'three';
const STEP = 1 / 120;
export class HairMotion {
  constructor(model, bones) {
    this.model = model; this.head = bones.Head; this.guides = [];
    this.acc = 0; this.ready = false;
    this.invHead = new THREE.Matrix4(); this.headWorld = new THREE.Matrix4();
    this.v = new THREE.Vector3(); this.local = new THREE.Vector3();
    this.q = new THREE.Quaternion(); this.parentQ = new THREE.Quaternion();
    model.updateMatrixWorld(true);
    for (let i = 0; i < 24; i++) {
      const a = bones[`HairGuide${String(i).padStart(2, '0')}_0`];
      const b = bones[`HairGuide${String(i).padStart(2, '0')}_1`];
      if (!a || !b) continue;
      const tip = new THREE.Vector3(0, b.userData.tailLength || 1, 0);
      const p = [a.getWorldPosition(new THREE.Vector3()), b.getWorldPosition(new THREE.Vector3()), b.localToWorld(tip.clone())];
      this.head.updateWorldMatrix(true, false);
      const inverse = this.head.matrixWorld.clone().invert();
      this.guides.push({ a, b, tip, p, prev: p.map(v => v.clone()),
        rest: p.map(v => v.clone().applyMatrix4(inverse)),
        len: [p[0].distanceTo(p[1]), p[1].distanceTo(p[2])],
        qa: a.quaternion.clone(), qb: b.quaternion.clone(),
        axisA: b.position.clone().normalize(), axisB: tip.clone().normalize() });
    }
    // Metadata is measured in the Head bone's rest coordinate space.
    this.center = new THREE.Vector3(...(this.head?.userData.scalpCenter || [0, 0, 8.8]));
    this.radii = new THREE.Vector3(...(this.head?.userData.scalpRadii || [9.625, 11.825, 11.55]));
  }
  reset() {
    if (!this.head) return;
    this.model.updateMatrixWorld(true);
    this.headWorld.copy(this.head.matrixWorld);
    for (const g of this.guides) for (let i = 0; i < 3; i++) {
      g.p[i].copy(g.rest[i]).applyMatrix4(this.headWorld); g.prev[i].copy(g.p[i]);
    }
    this.acc = 0; this.ready = true;
  }
  collide(point) {
    this.local.copy(point).applyMatrix4(this.invHead).sub(this.center);
    const rho = Math.hypot(this.local.x / this.radii.x, this.local.y / this.radii.y, this.local.z / this.radii.z);
    if (rho < 1.005 && rho > 0.001) {
      this.local.multiplyScalar(1.005 / rho).add(this.center).applyMatrix4(this.headWorld);
      point.copy(this.local);
    }
  }
  update(dt, snap = false) {
    if (!this.head || !this.guides.length) return;
    // First person head hiding scales the bone to almost zero. Freeze the groom
    // instead of feeding that singular transform into the collision solver.
    if (this.head.scale.x < 0.1) { this.ready = false; return; }
    for (const g of this.guides) { g.a.quaternion.copy(g.qa); g.b.quaternion.copy(g.qb); }
    this.model.updateMatrixWorld(true);
    if (!this.ready || snap || dt > 0.15) this.reset();
    this.headWorld.copy(this.head.matrixWorld); this.invHead.copy(this.headWorld).invert();
    const first = this.guides[0];
    if (first && first.p[0].distanceTo(this.v.copy(first.rest[0]).applyMatrix4(this.headWorld)) > 0.3) this.reset();
    this.acc = Math.min(this.acc + Math.max(0, dt), STEP * 8);
    while (this.acc >= STEP) {
      for (const g of this.guides) {
        g.p[0].copy(g.rest[0]).applyMatrix4(this.headWorld);
        g.prev[0].copy(g.p[0]);
        for (let i = 1; i < 3; i++) {
          this.v.copy(g.p[i]).sub(g.prev[i]).multiplyScalar(0.90);
          g.prev[i].copy(g.p[i]); g.p[i].add(this.v);
          g.p[i].y -= 9.81 * STEP * STEP;
          // A short styled groom resists bending more strongly near the root.
          this.v.copy(g.rest[i]).applyMatrix4(this.headWorld);
          g.p[i].lerp(this.v, i === 1 ? 0.28 : 0.18);
        }
        for (let iteration = 0; iteration < 4; iteration++) {
          for (let i = 1; i < 3; i++) {
            this.v.copy(g.p[i]).sub(g.p[i - 1]);
            const distance = this.v.length();
            if (distance > 1e-6) g.p[i].copy(g.p[i - 1]).add(this.v.multiplyScalar(g.len[i - 1] / distance));
            this.collide(g.p[i]);
          }
        }
        // Bound tip travel to keep fast turns/collapse from flipping short locks.
        for (let i = 1; i < 3; i++) {
          this.v.copy(g.rest[i]).applyMatrix4(this.headWorld);
          this.local.copy(g.p[i]).sub(this.v).clampLength(0, 0.012 * i);
          g.p[i].copy(this.v).add(this.local);
        }
      }
      this.acc -= STEP;
    }
    for (const g of this.guides) {
      for (const [bone, from, to, axis, restQ] of [[g.a, 0, 1, g.axisA, g.qa], [g.b, 1, 2, g.axisB, g.qb]]) {
        bone.parent.updateWorldMatrix(true, false); bone.parent.getWorldQuaternion(this.parentQ).invert();
        this.v.copy(g.p[to]).sub(g.p[from]).normalize().applyQuaternion(this.parentQ);
        this.local.copy(axis).applyQuaternion(restQ).normalize();
        this.q.setFromUnitVectors(this.local, this.v);
        bone.quaternion.copy(this.q).multiply(restQ);
        bone.updateWorldMatrix(false, true);
      }
    }
  }
}
