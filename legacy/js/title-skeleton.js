import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export function makeTitleSkeleton(scene) {
  const ivory = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: .82 });
  const oldBone = new THREE.MeshStandardMaterial({ color: 0xa99b7f, roughness: .91 });
  const hollow = new THREE.MeshStandardMaterial({ color: 0x171511, roughness: 1 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body); scene.add(root); root.visible = false;

  function part(geometry, material, parent, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function ball(parent, x, y, z, sx, sy, sz, material = ivory) {
    return part(new THREE.SphereGeometry(1, 12, 10), material, parent, x, y, z).scale.set(sx, sy, sz);
  }
  function shaft(parent, a, b, radius, material = ivory, endRadius = radius * .75) {
    const direction = b.clone().sub(a);
    const bone = part(new THREE.CylinderGeometry(endRadius, radius, direction.length(), 9, 2), material, parent);
    bone.position.copy(a).addScaledVector(direction, .5);
    bone.quaternion.setFromUnitVectors(UP, direction.normalize());
    return bone;
  }
  function arc(parent, points, radius, material = ivory) {
    return part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 14, radius, 6, false), material, parent);
  }

  // Skull: cranial vault, cheek arches, deep sockets, nasal cavity and separate jaw.
  const skull = new THREE.Group(); skull.position.set(0, 1.59, 0); body.add(skull);
  ball(skull, 0, .035, -.015, .135, .16, .138);
  ball(skull, 0, -.092, .063, .098, .063, .07, oldBone);
  for (const side of [-1, 1]) {
    const x = side * .056;
    ball(skull, x, -.012, .119, .041, .047, .013, hollow);
    part(new THREE.TorusGeometry(.047, .009, 7, 22), ivory, skull, x, -.012, .126);
    arc(skull, [V(side * .115, -.035, .038), V(side * .13, -.067, .096), V(side * .08, -.096, .135)], .012);
    ball(skull, side * .115, -.09, .064, .025, .043, .03, ivory);
  }
  ball(skull, 0, -.064, .143, .017, .028, .007, hollow);
  arc(skull, [V(-.087, -.139, .08), V(-.078, -.181, .127), V(0, -.192, .15), V(.078, -.181, .127), V(.087, -.139, .08)], .013, ivory);
  for (let i = -4; i <= 4; i++) {
    const x = i * .018;
    part(new THREE.BoxGeometry(.014, .023, .015), ivory, skull, x, -.134, .133);
    part(new THREE.BoxGeometry(.013, .02, .013), oldBone, skull, x, -.176, .146);
  }

  // Vertebrae, sternum and curved ribs leave visible space through the chest.
  for (let i = 0; i < 17; i++) {
    const y = .91 + i * .032;
    ball(body, 0, y, -.075, .032 - i * .0004, .018, .033, i % 3 === 0 ? oldBone : ivory);
    shaft(body, V(0, y, -.09), V(0, y, -.135), .009, oldBone);
  }
  shaft(body, V(0, 1.105, .151), V(0, 1.375, .128), .018, ivory, .014);
  for (let i = 0; i < 10; i++) {
    const y = 1.015 + i * .038;
    const width = [.13, .16, .19, .215, .225, .22, .205, .185, .16, .13][i];
    for (const side of [-1, 1]) {
      const outer = side * width;
      arc(body, [V(0, y, -.08), V(side * width * .62, y + .015, -.105), V(outer, y - .006, -.015), V(outer * .91, y - .034, .085), V(side * (i < 2 ? .11 : .042), y - .043, .14)], .009 + (i > 7 ? .001 : .003), i % 3 === 0 ? oldBone : ivory);
    }
  }
  for (const side of [-1, 1]) {
    arc(body, [V(side * .02, 1.43, .07), V(side * .095, 1.455, .082), V(side * .19, 1.395, .025)], .017);
    ball(body, side * .205, 1.37, -.025, .07, .09, .04, oldBone);
  }

  // Pelvic ring and sacrum.
  ball(body, 0, .92, -.047, .065, .115, .055, oldBone);
  for (const side of [-1, 1]) {
    arc(body, [V(side * .018, .94, -.07), V(side * .095, 1.005, -.065), V(side * .19, .995, -.015), V(side * .175, .89, .055), V(side * .075, .845, .112), V(0, .83, .095)], .027, ivory);
    ball(body, side * .13, .9, -.005, .078, .059, .048, oldBone);
  }

  // Individual arm and leg bones, joints, hands and toes.
  for (const side of [-1, 1]) {
    const shoulder = V(side * .205, 1.37, -.005), elbow = V(side * .36, 1.07, .015);
    const wrist = V(side * .43, .79, .064);
    ball(body, shoulder.x, shoulder.y, shoulder.z, .044, .044, .045);
    shaft(body, shoulder, elbow, .032, ivory, .026);
    ball(body, elbow.x, elbow.y, elbow.z, .031, .032, .03, oldBone);
    shaft(body, V(elbow.x - side * .013, elbow.y, elbow.z - .015), V(wrist.x - side * .012, wrist.y, wrist.z - .014), .017);
    shaft(body, V(elbow.x + side * .013, elbow.y, elbow.z + .015), V(wrist.x + side * .012, wrist.y, wrist.z + .013), .013, oldBone);
    ball(body, wrist.x, wrist.y, wrist.z, .034, .024, .027);
    for (let finger = 0; finger < 4; finger++) {
      const spread = (finger - 1.5) * .017;
      const knuckle = V(wrist.x + side * spread, .735, wrist.z + .025);
      shaft(body, V(wrist.x + side * spread * .5, .785, wrist.z), knuckle, .008, ivory, .007);
      shaft(body, knuckle, V(knuckle.x + side * spread * .25, .68 + Math.abs(finger - 1.5) * .007, knuckle.z + .016), .006, oldBone, .004);
    }
    const hip = V(side * .125, .86, -.01), knee = V(side * .115, .485, .03);
    const ankle = V(side * .115, .085, -.012);
    ball(body, hip.x, hip.y, hip.z, .047, .047, .045);
    shaft(body, hip, knee, .046, ivory, .035);
    ball(body, knee.x, knee.y, knee.z, .043, .039, .04, oldBone);
    ball(body, knee.x, knee.y, knee.z + .035, .033, .026, .018);
    shaft(body, V(knee.x - side * .018, knee.y, knee.z), V(ankle.x - side * .018, ankle.y, ankle.z), .029);
    shaft(body, V(knee.x + side * .022, knee.y, knee.z - .018), V(ankle.x + side * .025, ankle.y, ankle.z - .018), .014, oldBone);
    ball(body, ankle.x, ankle.y, ankle.z, .034, .027, .033);
    for (let toe = 0; toe < 4; toe++) {
      const x = ankle.x + side * (toe - 1.5) * .025;
      shaft(body, V(ankle.x, .055, .035), V(x, .045, .145), .012, ivory, .009);
      shaft(body, V(x, .045, .145), V(x + side * .005, .035, .195 - toe * .006), .006, oldBone, .004);
    }
  }

  return { root, body };
}
