import * as THREE from "three";
import { mulberry32 } from "./rng.js";

// Small ballistic droplets, ground impacts, and persistent flattened stains.
export function createBloodPhysics(scene, low) {
  const random = mulberry32(6712), count = low ? 40 : 80, stainCount = low ? 80 : 160;
  const mat = new THREE.MeshStandardMaterial({ color: 0x650d16, roughness: .24, metalness: .12 });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), mat, count);
  const stains = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 9), mat, stainCount);
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage); stains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  drops.frustumCulled = stains.frustumCulled = false;
  drops.castShadow = false; stains.receiveShadow = true;
  scene.add(drops, stains);
  const dummy = new THREE.Object3D(), ground = -.016;
  dummy.scale.setScalar(0); dummy.updateMatrix();
  for (let i = 0; i < count; i++) drops.setMatrixAt(i, dummy.matrix);
  for (let i = 0; i < stainCount; i++) stains.setMatrixAt(i, dummy.matrix);
  const particles = Array.from({ length: count }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), radius: .025, bounced: false }));
  let next = 0, stain = 0, emission = 0;
  function splash(p) {
    dummy.position.set(p.p.x, ground, p.p.z); dummy.rotation.set(-Math.PI / 2, 0, random() * 6.28);
    const radius = p.radius * (1.8 + random() * 1.8);
    dummy.scale.set(radius * 1.4, radius, 1); dummy.updateMatrix(); stains.setMatrixAt(stain, dummy.matrix);
    stain = (stain + 1) % stainCount; stains.instanceMatrix.needsUpdate = true;
  }
  return {
    update(dt, origin, rate, pull = 0) {
      if (dt <= 0) return;
      emission += dt * rate;
      while (emission >= 1) {
        emission--;
        const p = particles[next]; next = (next + 1) % count;
        p.p.copy(origin); p.p.x += (random() - .5) * .1; p.p.z += (random() - .5) * .08;
        p.v.set((random() - .5) * (.4 + pull), .1 + random() * .25 + pull * .65, (random() - .5) * (.4 + pull));
        p.radius = .017 + random() * .019; p.life = 3; p.bounced = false;
      }
      dummy.rotation.set(0, 0, 0);
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        if (p.life > 0) {
          p.life -= dt;
          p.v.y -= 9.81 * dt; p.v.x *= Math.exp(-dt * .2); p.v.z *= Math.exp(-dt * .2);
          p.p.addScaledVector(p.v, dt);
          if (p.p.y <= ground + p.radius) {
            p.p.y = ground + p.radius;
            splash(p);
            if (!p.bounced && Math.abs(p.v.y) > 1.3) {
              p.bounced = true; p.v.y = Math.abs(p.v.y) * .16; p.v.x *= .5; p.v.z *= .5; p.radius *= .5;
            } else p.life = 0;
          }
        }
        dummy.position.copy(p.p); dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(p.life > 0 ? p.radius : 0);
        if (p.life > 0) dummy.scale.y *= 1 + Math.min(.8, Math.abs(p.v.y) * .1);
        dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
    },
  };
}
