import * as THREE from "three";

// During the fall, these small joint contacts stop fast-moving limbs crossing
// the ground. At rest the torso and skull meshes support the body's weight;
// limbs bend independently instead of holding the whole actor in the air.
const HUMAN_CONTACTS = [
  ["hips", .09], ["spine", .11], ["chest", .12], ["upperChest", .11],
  ["neck", .06], ["head", .09],
  ["shoulder.L", .07], ["shoulder.R", .07],
  ["upperArm.L", .07], ["upperArm.R", .07],
  ["foreArm.L", .06], ["foreArm.R", .06],
  ["hand.L", .045], ["hand.R", .045],
  ["upLeg.L", .10], ["upLeg.R", .10],
  ["leg.L", .075], ["leg.R", .075],
  ["foot.L", .04], ["foot.R", .04],
  ["toe.L", .025], ["toe.R", .025],
];
const CORE_BONES = new Set(["root", "hips", "spine", "chest", "upperChest", "neck", "head"]);
const LIMBS = [
  ["upperArm.L", "L", ["upperArm.L", "foreArm.L", "hand.L", "fingers.L"]],
  ["upperArm.R", "R", ["upperArm.R", "foreArm.R", "hand.R", "fingers.R"]],
  ["upLeg.L", "L", ["upLeg.L", "leg.L", "foot.L", "toe.L"]],
  ["upLeg.R", "R", ["upLeg.R", "leg.R", "foot.R", "toe.R"]],
];
const point = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const normal = new THREE.Vector3();
const yawRotation = new THREE.Quaternion();
const skinSamples = new WeakMap();
const headSamples = new WeakMap();

export function orientBodyToTerrain(model, world, anchor, yaw) {
  const reach = Math.max(.45, Math.min(1.2, (model.height || 1.7) * .32));
  const dx = (world.surfaceHeightAt(anchor.x + reach, anchor.z) - world.surfaceHeightAt(anchor.x - reach, anchor.z)) / (2 * reach);
  const dz = (world.surfaceHeightAt(anchor.x, anchor.z + reach) - world.surfaceHeightAt(anchor.x, anchor.z - reach)) / (2 * reach);
  const slope = Math.hypot(dx, dz);
  const limit = slope > .45 ? .45 / slope : 1;
  normal.set(-dx * limit, 1, -dz * limit).normalize();
  model.object.quaternion.setFromUnitVectors(up, normal).multiply(yawRotation.setFromAxisAngle(up, yaw));
}

function meshContacts(model) {
  const roots = model.groundMeshes?.length ? model.groundMeshes : (model._defaultGroundRoots ||= [model.object]);
  if (model._groundContacts && model._groundContactRoots === roots) return model._groundContacts;
  const contacts = [];
  for (const root of roots) root.traverse(node => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;
    if (model.groundBonePattern && !node.isSkinnedMesh) return;
    const positions = node.geometry.attributes.position;
    const skinIndex = node.geometry.attributes.skinIndex, skinWeight = node.geometry.attributes.skinWeight;
    // Sample real vertices rather than box corners, which make round bodies
    // hover. Include the lowest point and the four horizontal extremes.
    const picks = new Set();
    const extremes = [Infinity, -Infinity, Infinity, -Infinity, Infinity];
    const extremeIndices = [0, 0, 0, 0, 0];
    const candidates = [];
    for (let i = 0; i < positions.count; i++) {
      if (model.groundBonePattern && skinIndex && skinWeight) {
        let slot = 0;
        for (let j = 1; j < 4; j++) if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, slot)) slot = j;
        const name = node.skeleton.bones[skinIndex.getComponent(i, slot)]?.name || "";
        if (!model.groundBonePattern.test(name)) continue;
      }
      candidates.push(i);
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      if (x < extremes[0]) { extremes[0] = x; extremeIndices[0] = i; }
      if (x > extremes[1]) { extremes[1] = x; extremeIndices[1] = i; }
      if (z < extremes[2]) { extremes[2] = z; extremeIndices[2] = i; }
      if (z > extremes[3]) { extremes[3] = z; extremeIndices[3] = i; }
      if (y < extremes[4]) { extremes[4] = y; extremeIndices[4] = i; }
    }
    if (!candidates.length) return;
    for (const index of extremeIndices) picks.add(index);
    for (const index of sampleIndices(positions, candidates, node.isSkinnedMesh ? 110 : 40)) picks.add(index);
    if (node.isSkinnedMesh) contacts.push({ node, indices: [...picks] });
    else contacts.push({ node, points: [...picks].map(i => new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i))) });
  });
  model._groundContactRoots = roots;
  model._groundContacts = contacts;
  return contacts;
}

function sampleIndices(positions, candidates, count) {
  const samples = [];
  const stride = Math.max(1, Math.ceil(candidates.length / count));
  for (let i = 0; i < candidates.length; i += stride) samples.push(candidates[i]);
  return samples;
}

function skinnedContacts(mesh) {
  const geometry = mesh.geometry;
  if (skinSamples.has(geometry)) return skinSamples.get(geometry);
  const positions = geometry.attributes.position;
  const skinIndex = geometry.attributes.skinIndex, skinWeight = geometry.attributes.skinWeight;
  const all = [], core = [], limbs = { "upperArm.L": [], "upperArm.R": [], "upLeg.L": [], "upLeg.R": [] };
  for (let i = 0; i < positions.count; i++) {
    all.push(i);
    if (!skinIndex || !skinWeight) { core.push(i); continue; }
    let slot = 0;
    for (let j = 1; j < 4; j++) if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, slot)) slot = j;
    const name = mesh.skeleton.bones[skinIndex.getComponent(i, slot)]?.name || "";
    if (CORE_BONES.has(name)) core.push(i);
    else for (const [joint, side] of LIMBS) {
      if (name.endsWith(`.${side}`) && (joint.startsWith("upperArm") ? /Arm|hand|fingers/.test(name) : /Leg|leg|foot|toe/.test(name))) {
        limbs[joint].push(i); break;
      }
    }
  }
  const samples = { all: sampleIndices(positions, all, 100), core: sampleIndices(positions, core.length ? core : all, 150), limbs: {} };
  for (const joint of Object.keys(limbs)) samples.limbs[joint] = sampleIndices(positions, limbs[joint], 24);
  skinSamples.set(geometry, samples);
  return samples;
}

function humanLift(model, world, settled) {
  let lift = -Infinity;
  const mesh = model.mesh;
  if (mesh?.getVertexPosition) {
    const indices = skinnedContacts(mesh)[settled ? "core" : "all"];
    for (const index of indices) {
      mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
      lift = Math.max(lift, world.surfaceHeightAt(point.x, point.z) + .006 - point.y);
    }
  }
  const skull = model.headInfo?.group?.children?.[0];
  if (skull?.isMesh) {
    let indices = headSamples.get(skull.geometry);
    if (!indices) {
      const count = skull.geometry.attributes.position.count;
      indices = sampleIndices(skull.geometry.attributes.position, Array.from({ length: count }, (_, i) => i), 140);
      headSamples.set(skull.geometry, indices);
    }
    for (const index of indices) {
      skull.getVertexPosition(index, point).applyMatrix4(skull.matrixWorld);
      lift = Math.max(lift, world.surfaceHeightAt(point.x, point.z) + .006 - point.y);
    }
  }
  if (!settled) for (const [name, radius] of HUMAN_CONTACTS) {
    const bone = model.bones[name];
    if (!bone) continue;
    bone.getWorldPosition(point);
    lift = Math.max(lift, world.surfaceHeightAt(point.x, point.z) + radius * model.scale - point.y);
  }
  return lift;
}

function limbClearance(model, world, joint, names) {
  const mesh = model.mesh;
  let minimum = Infinity;
  for (const index of skinnedContacts(mesh).limbs[joint] || []) {
    mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
    minimum = Math.min(minimum, point.y - world.surfaceHeightAt(point.x, point.z));
  }
  // The small meshes at the hands and toes are separate from the skinned body.
  const tip = model.bones[names[names.length - 1]];
  tip.getWorldPosition(point);
  minimum = Math.min(minimum, point.y - world.surfaceHeightAt(point.x, point.z) - .025 * model.scale);
  return minimum;
}

function settleHumanLimbs(model, world) {
  if (model._deathLimbPose) return;
  const pose = {};
  for (const [joint, , names] of LIMBS) {
    const bone = model.bones[joint];
    const base = bone.rotation.x;
    let best = 0, bestScore = Infinity;
    for (const delta of [0, -.2, .2, -.4, .4, -.6, .6, -.8, .8, -1, 1]) {
      bone.rotation.x = base + delta;
      bone.updateWorldMatrix(true, true);
      const clearance = limbClearance(model, world, joint, names);
      const score = clearance < .004 ? 10 + (.004 - clearance) * 30 + Math.abs(delta) : Math.abs(delta) + Math.abs(clearance - .014) * .15;
      if (score < bestScore) { bestScore = score; best = delta; }
    }
    bone.rotation.x = base + best;
    bone.updateWorldMatrix(true, true);
    pose[joint] = best;
  }
  model._deathLimbPose = pose;
}

function contactClearance(contacts, world) {
  let minimum = Infinity;
  for (const contact of contacts) {
    if (contact.indices) for (const index of contact.indices) {
      contact.node.getVertexPosition(index, point).applyMatrix4(contact.node.matrixWorld);
      minimum = Math.min(minimum, point.y - world.surfaceHeightAt(point.x, point.z));
    }
    else for (const local of contact.points) {
      point.copy(local).applyMatrix4(contact.node.matrixWorld);
      minimum = Math.min(minimum, point.y - world.surfaceHeightAt(point.x, point.z));
    }
  }
  return minimum;
}

function settleCreatureLegs(model, world) {
  if (model._groundLegsSolved) return;
  for (const leg of model.legs) {
    const contacts = meshContacts({ object: leg.hip });
    const base = leg.hip.rotation.z;
    let best = 0, bestScore = Infinity;
    for (const delta of [0, -.25, .25, -.5, .5, -.75, .75, -1, 1]) {
      leg.hip.rotation.z = base + delta;
      leg.hip.updateWorldMatrix(true, true);
      const clearance = contactClearance(contacts, world);
      const score = clearance < .004 ? 10 + (.004 - clearance) * 30 + Math.abs(delta) : Math.abs(delta) + Math.abs(clearance - .014) * .15;
      if (score < bestScore) { bestScore = score; best = delta; }
    }
    leg.hip.rotation.z = base + best;
    leg.hip.updateWorldMatrix(true, true);
  }
  model._groundLegsSolved = true;
}

function settleRigidHair(model, world) {
  if (model._rigidHairSettled || !model.hairMeshes?.length || model.pose !== "death" || Math.abs(model.object.rotation.z - 1.38) > .02) return;
  for (const hair of model.hairMeshes) {
    const geometry = hair.geometry, positions = geometry.attributes.position;
    let changed = false;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(hair.matrixWorld);
      const floor = world.surfaceHeightAt(point.x, point.z) + .012;
      if (point.y >= floor) continue;
      point.y = floor;
      hair.worldToLocal(point);
      positions.setXYZ(i, point.x, point.y, point.z);
      changed = true;
    }
    if (changed) { positions.needsUpdate = true; geometry.computeVertexNormals(); }
  }
  model._rigidHairSettled = true;
}

export function groundBody(model, world, anchor) {
  if (!model?.object || !world) return;
  const root = model.object;
  root.position.y = world.surfaceHeightAt(anchor.x, anchor.z);
  root.updateMatrixWorld(true);
  let lift = -Infinity;
  if (model.bones) {
    const settled = model.stanceT >= 1 && Math.abs(model.body.rotation.x + Math.PI * .485) < .09;
    lift = humanLift(model, world, settled);
    if (Number.isFinite(lift)) {
      root.position.y += lift;
      root.updateMatrixWorld(true);
    }
    if (settled) {
      settleHumanLimbs(model, world);
      const correction = humanLift(model, world, true);
      if (correction > 0) lift += correction;
    }
  } else {
    lift = .006 - contactClearance(meshContacts(model), world);
    if (Number.isFinite(lift) && model.legs && model.stance === "dead" && model.stanceT >= 1) {
      root.position.y += lift;
      root.updateMatrixWorld(true);
      settleCreatureLegs(model, world);
    }
  }
  if (Number.isFinite(lift)) {
    root.position.y = world.surfaceHeightAt(anchor.x, anchor.z) + lift;
    model._groundLift = lift;
  }
  root.updateMatrixWorld(true);
  settleRigidHair(model, world);
}
