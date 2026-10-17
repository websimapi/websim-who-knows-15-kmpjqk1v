// Suspect avatars: the X Bot rig dressed in each suspect's colour, with
// idle/walk/run blending, additive gestures, a seated pose, a translucent
// ghost form, and a separate posed corpse left where someone died.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { HairMotion } from "./hair-motion.js";
import { LipMotion } from "./lip-motion.js";
import { BlinkMotion } from "./blink-motion.js";
import {installHairAppearance} from './hair-appearance.js';
import { Haircuts } from "./haircuts.js";

const variantPromises=new Map();let baseKitPromise;
const HUMAN_FILES={blue:'tomas-voss',violet:'leonie-vesper',white:'elian-frost',green:'sera-moss',red:'mara-vale',yellow:'ivo-quill',copper:'nessa-calder',teal:'basil-reed',butler:'mr-grimsby'};
function prepareKit(gltf, authored = false) {
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  for (const n of ["agree", "headShake"]) if (clips[n]) {
    const c = clips[n].clone(); THREE.AnimationUtils.makeClipAdditive(c); clips[n + "_add"] = c;
  }
  const skinGroups=new Map();
  gltf.scene.traverse(o => {
    if(o.isSkinnedMesh){if(!skinGroups.has(o.skeleton))skinGroups.set(o.skeleton,skinGroups.size);o.userData.avatarSkinGroup=skinGroups.get(o.skeleton);}
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = !o.isSkinnedMesh;
      o.userData.preserveMaterials = authored;
      o.userData.fineDetail = authored && /Hair_Strands|Hair_Locks|Bun_Fibers|Eyebrows|Eye_|_Eyes|Freckles/.test(o.name);
      o.castShadow = !o.userData.fineDetail;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      if (authored) materials.forEach(m => { m.shadowSide = THREE.FrontSide; });
    }
  });
  return { scene: gltf.scene, clips, authored };
}
export async function loadHumanVariant(kit,id){
  if(!HUMAN_FILES[id])return null;
  if(!variantPromises.has(id))variantPromises.set(id,new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('./models/'+HUMAN_FILES[id]+'.glb').then(gltf=>prepareKit(gltf,true)).catch(error=>{console.warn('Human model could not load: '+id,error);return null;}));
  const variant=await variantPromises.get(id);if(variant)kit.variants[id]=variant;return variant;
}
export async function loadKit(only=null) {
  baseKitPromise ||= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('./models/xbot.glb').then(gltf=>{const kit=prepareKit(gltf);kit.variants={};return kit;});
  const kit=await baseKitPromise;
  await Promise.all((only??Object.keys(HUMAN_FILES)).map(id=>loadHumanVariant(kit,id)));
  return kit;
}

// SkeletonUtils clones a Skeleton for every SkinnedMesh. Mesh pieces which
// originally shared a glTF skin must share their cloned skeleton as well.
function cloneCharacter(scene){
  const model=SkeletonUtils.clone(scene),skins=new Map();
  model.traverse(o=>{if(!o.isSkinnedMesh)return;const group=o.userData.avatarSkinGroup;
    if(group===undefined)return;
    if(skins.has(group))o.skeleton=skins.get(group);else skins.set(group,o.skeleton);
  });return model;
}
function suspectKit(kit, suspect) { return kit.variants?.[suspect.id] || kit; }

function dress(model, color, ghost = false) {
  const base = new THREE.Color(color), mats = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    if (!o.userData.originalMaterials) {
      const source = Array.isArray(o.material) ? o.material : [o.material];
      o.userData.originalMaterials = source.map(m => m.clone());
      o.userData.materialArray = Array.isArray(o.material);
    }
    const materials = o.userData.originalMaterials.map(original => {
      const joints = /Joints/i.test(original.name);
      let material;
      if (ghost) material = new THREE.MeshStandardMaterial({ color: 0xbfd4ff,
        emissive: base.clone().lerp(new THREE.Color(0x9fc0ff), 0.6), emissiveIntensity: 0.55,
        transparent: true, opacity: joints ? 0.18 : 0.32, depthWrite: false, roughness: 1 });
      else if (o.userData.preserveMaterials) material = original.clone();
      else material = new THREE.MeshStandardMaterial({ color: joints ? base.clone().multiplyScalar(0.3) : base,
        roughness: joints ? 0.4 : 0.62, metalness: joints ? 0.4 : 0.05 });
      mats.push(material); return material;
    });
    const previous = Array.isArray(o.material) ? o.material : [o.material];
    o.material = o.userData.materialArray ? materials : materials[0];
    previous.forEach(m => m.dispose());
    o.castShadow = !ghost && !o.userData.fineDetail; o.userData.noFow = ghost;
  });
  return mats;
}

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _ax = new THREE.Vector3();
// Rotate a bone about the avatar's own right (x) axis, in model space.
function bendBone(root, bone, angle) {
  if (!bone) return;
  root.getWorldQuaternion(_rq);
  _ax.set(1, 0, 0).applyQuaternion(_rq);
  _q.setFromAxisAngle(_ax, angle);
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_pq);
  const local = _pq.clone().invert().multiply(_q).multiply(_pq);
  bone.quaternion.premultiply(local);
  bone.updateWorldMatrix(false, true);
}

export class Avatar {
  constructor(kit, suspect, {humanForm=true}={}) {
    document.body.dataset.avatarInstances=String(Number(document.body.dataset.avatarInstances||0)+1);
    kit = humanForm ? suspectKit(kit, suspect) : kit;
    this.humanForm=humanForm&&!!kit.authored;
    this.id = suspect.id;
    this.color = suspect.color;
    this.root = new THREE.Group();
    this.model = cloneCharacter(kit.scene);
    this.model.scale.setScalar(0.98);
    this.root.add(this.model);
    this.bones = {};
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name.replace("mixamorig", "").replace(":", "")] = o; });
    this.mats = dress(this.model, suspect.color);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.acts = {};
    for (const n of ["idle", "walk", "run"]) {
      const a = this.mixer.clipAction(kit.clips[n]);
      a.play(); a.setEffectiveWeight(n === "idle" ? 1 : 0);
      this.acts[n] = a;
    }
    for (const n of ["agree", "headShake"]) {
      const clip = kit.clips[n + "_add"];
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.blendMode = THREE.AdditiveAnimationBlendMode;
      a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false;
      this.acts[n] = a;
    }
    this.hairMotion = kit.authored ? new HairMotion(this.model, this.bones) : null;
    if(kit.authored)installHairAppearance(this.model);
    this.haircuts = kit.authored ? new Haircuts(this.model,this.hairMotion) : null;
    this.lips = kit.authored ? new LipMotion(this.model,this.id) : null;
    this.blink = kit.authored ? new BlinkMotion(this.model) : null;
    this.speed = 0;
    this.ghost = false;
    this.seat = null;
    this.pitch = 0;
    this.lastGesture = null;
    this.t = Math.random() * 10;
  }
  dispose(){
    this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);
    this.haircuts?.texture.dispose();
    for(const clip of this.haircuts?.clippings||[]){clip.line.geometry.dispose();clip.line.material.dispose();}
    this.model.traverse(o=>{if(o.isMesh){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();for(const m of o.userData.originalMaterials||[])m.dispose();}});
    const skeletons=new Set();this.model.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose();
    this.root.removeFromParent();
  }
  gesture(name) {
    const a = this.acts[name];
    if (!a) return;
    a.reset(); a.setEffectiveWeight(1); a.play();
  }
  setGhost(on) {
    if (on === this.ghost) return;
    this.ghost = on;
    this.mats = dress(this.model, this.color, on);
    this.hairMotion?.refreshMaterials();
    if(!on&&this.humanForm)installHairAppearance(this.model);
    this.haircuts?.refresh();
  }
  // Hide/show the head (first-person viewers would see inside it).
  hideHead(on) {
    const h = this.bones.Head;
    if (!h) return;
    h.scale.setScalar(on ? 0.001 : 1);
    h.updateMatrixWorld(true);
    // Mirror captures render between two first-person passes. Upload the new
    // bone pose now so the reflection includes the head in that same frame.
    const seen=new Set();this.model.traverse((o) => { if (o.isSkinnedMesh&&!seen.has(o.skeleton)){seen.add(o.skeleton);o.skeleton.update();} });
  }
  headWorld(out = new THREE.Vector3()) { const h = this.bones.Head; if (h) h.getWorldPosition(out); else out.copy(this.root.position).setY(1.6); return out; }

  // Layered cutscene poses are applied after the mixer, so the next ordinary
  // update restores the walking rig without leaving an arm or head displaced.
  poseKill(role, weapon, u) {
    const b = this.bones;
    const smooth = (a, z, t) => { const v = THREE.MathUtils.clamp((t - a) / (z - a), 0, 1); return v * v * (3 - 2 * v); };
    const wind = smooth(0.08, 0.37, u), blow = smooth(0.42, 0.58, u), release = smooth(0.76, 0.95, u);
    const heavy = ["hammer", "flashlight", "broken_pipe"].includes(weapon);
    const blade = ["knife", "kitchen_knife"].includes(weapon);
    const sword = weapon === "two_handed_sword";
    const gun = weapon === "pistol";
    const rope = weapon === "rope";
    if (role === "killer") {
      const rightLift = gun ? -1.25 : rope ? -1.45 : blade ? -0.38 - 1.1 * blow : sword ? -1.6 - 0.55 * wind + 1.15 * blow : -0.7 - 1.6 * wind + 1.15 * blow;
      const leftLift = gun ? -1.15 : rope ? -1.4 : sword ? -1.35 - 0.5 * wind + 0.85 * blow : weapon === "broken_pipe" ? -0.9 - 1.25 * wind + 1.0 * blow : -0.15;
      if (b.RightArm) { b.RightArm.rotation.x += rightLift * (1 - release * 0.7); b.RightArm.rotation.z -= (gun || rope ? 0.18 : 0.24) * (1 - release * 0.7); }
      if (b.RightForeArm) b.RightForeArm.rotation.x -= gun ? 0.15 : rope ? 0.4 : blade ? 0.75 - 0.4 * blow : 0.28;
      if (b.LeftArm) { b.LeftArm.rotation.x += leftLift * (1 - release * 0.7); b.LeftArm.rotation.z += (gun || rope || sword || weapon === "broken_pipe" ? 0.35 : 0.04) * (1 - release * 0.7); }
      if (b.LeftForeArm) b.LeftForeArm.rotation.x -= gun ? 0.35 : rope ? 0.55 : sword || weapon === "broken_pipe" ? 0.4 : 0;
      if (b.Spine2) { b.Spine2.rotation.y += (heavy || sword ? 0.22 : blade ? 0.14 : 0) * (wind - blow); b.Spine2.rotation.x += (heavy || sword ? -0.13 : blade ? -0.09 : 0) * blow; }
      if (b.Head) b.Head.rotation.x += gun ? -0.06 : -0.1 * wind;
      if (gun && b.RightHand) b.RightHand.rotation.x -= 0.18 * blow; // recoil
    } else {
      const fear = smooth(0.17, 0.36, u);
      if (b.LeftArm) { b.LeftArm.rotation.x -= 0.75 * fear; b.LeftArm.rotation.z += 0.35 * fear; }
      if (b.RightArm) { b.RightArm.rotation.x -= 0.6 * fear; b.RightArm.rotation.z -= 0.3 * fear; }
      if (b.Head) b.Head.rotation.y += 0.18 * fear;
      this.model.rotation.x = -0.17 * blow;
      this.model.position.z = -0.1 * blow;
    }
    this.root.updateMatrixWorld(true);
  }

  poseCarry(right, left, joined = false) {
    const b = this.bones;
    if (right && b.RightArm) { b.RightArm.rotation.x -= joined ? 0.72 : 0.42; b.RightArm.rotation.z -= joined ? 0.22 : 0.12; }
    if (left && b.LeftArm) { b.LeftArm.rotation.x -= joined ? 0.7 : 0.42; b.LeftArm.rotation.z += joined ? 0.43 : 0.12; }
    if (right && b.RightForeArm) b.RightForeArm.rotation.x -= joined ? 0.36 : 0.22;
    if (left && b.LeftForeArm) b.LeftForeArm.rotation.x -= joined ? 0.38 : 0.22;
    this.root.updateMatrixWorld(true);
  }
  poseThrow() {
    const b = this.bones;
    if (b.RightArm) { b.RightArm.rotation.x -= 1.25; b.RightArm.rotation.z -= .2; }
    if (b.RightForeArm) b.RightForeArm.rotation.x -= .55;
    if (b.Spine2) b.Spine2.rotation.y += .12;
    this.root.updateMatrixWorld(true);
  }
  poseWork(kind) {
    const b=this.bones, t=this.t*11;
    if (kind==='defrag') {
      if (b.RightArm) b.RightArm.rotation.x-=.7;
      if (b.LeftArm) b.LeftArm.rotation.x-=.7;
      if (b.RightForeArm) b.RightForeArm.rotation.x-=.28+Math.sin(t)*.12;
      if (b.LeftForeArm) b.LeftForeArm.rotation.x-=.28-Math.sin(t)*.12;
    } else if (kind==='bathroom' || kind==='grime') {
      if (b.RightArm) { b.RightArm.rotation.x-=.95+Math.sin(t)*.13; b.RightArm.rotation.z-=.22+Math.cos(t)*.1; }
      if (b.RightForeArm) b.RightForeArm.rotation.x-=.42;
      if (b.Spine2) b.Spine2.rotation.x+=.1;
    } else if (kind==='lettuce') {
      if (b.RightArm) b.RightArm.rotation.x-=.55+Math.max(0,Math.sin(t))*.65;
      if (b.RightForeArm) b.RightForeArm.rotation.x-=.45;
    } else if (kind==='music') {
      if (b.RightArm) { b.RightArm.rotation.x-=.72+Math.sin(t)*.16; b.RightArm.rotation.z-=.18+Math.cos(t)*.16; }
      if (b.RightForeArm) b.RightForeArm.rotation.x-=.45;
    } else {
      if (b.RightArm) b.RightArm.rotation.x-=.8+Math.sin(t)*.12;
      if (b.RightForeArm) b.RightForeArm.rotation.x-=.32;
    }
    this.root.updateMatrixWorld(true);
  }

  update(dt, { x, z, yaw, mv, alive, anim, seat, seatH, pitch = 0, ko = false, conversing = false, listenYaw = 0, listenPitch = 0, wind, deferHair=false }, snap = false) {
    this.t += dt;
    this.setGhost(!alive);
    const k = snap ? 1 : 1 - Math.exp(-dt * 14);
    this.root.position.x += (x - this.root.position.x) * k;
    this.root.position.z += (z - this.root.position.z) * k;
    let dy = yaw - this.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * (snap ? 1 : Math.min(1, dt * 12));
    this.speed += (mv - this.speed) * Math.min(1, dt * 8);
    const s = seat ? 0 : this.speed;
    const walkW = THREE.MathUtils.clamp(s / 1.6, 0, 1) * (1 - THREE.MathUtils.clamp((s - 2.6) / 1.2, 0, 1));
    const runW = THREE.MathUtils.clamp((s - 2.6) / 1.2, 0, 1);
    this.acts.idle.setEffectiveWeight(1 - Math.max(walkW, runW));
    this.acts.walk.setEffectiveWeight(walkW);
    this.acts.run.setEffectiveWeight(runW);
    this.acts.walk.timeScale = THREE.MathUtils.clamp(s / 1.9, 0.6, 1.6);
    this.acts.run.timeScale = THREE.MathUtils.clamp(s / 3.6, 0.8, 1.3);
    if (anim && anim !== this.lastGesture && (anim === 'agree' || anim === 'headShake')) this.gesture(anim);
    this.lastGesture = anim || null;
    this.mixer.update(dt);
    this.blink?.update(dt, { alive, ko, conversing });
    this.lips?.update(dt,alive&&!ko);
    // Ghosts float; seated people fold their legs onto the seat.
    let y = 0, back = 0;
    if (this.ghost) y = 0.12 + Math.sin(this.t * 1.7) * 0.07;
    if (seat) {
      this.root.updateMatrixWorld(true);
      bendBone(this.root, this.bones.LeftUpLeg, -1.5); bendBone(this.root, this.bones.RightUpLeg, -1.5);
      bendBone(this.root, this.bones.LeftLeg, 1.55); bendBone(this.root, this.bones.RightLeg, 1.55);
      y = (seatH ?? 0.46) + 0.08 - 0.94;
      back = -0.12;
    }
    this.pitch += (pitch - this.pitch) * Math.min(1, dt * 10);
    if (Math.abs(this.pitch) > 0.02 && !this.ghost) { this.root.updateMatrixWorld(true); bendBone(this.root, this.bones.Neck, -this.pitch * 0.5); bendBone(this.root, this.bones.Spine2, -this.pitch * 0.25); }
    this.listenYaw = THREE.MathUtils.damp(this.listenYaw || 0, conversing ? listenYaw : 0, 9, dt);
    this.listenPitch = THREE.MathUtils.damp(this.listenPitch || 0, conversing ? listenPitch : 0, 9, dt);
    if (this.bones.Neck && !this.ghost && !ko) {
      this.bones.Neck.rotateY(this.listenYaw * .45);
      this.bones.Head?.rotateY(this.listenYaw * .55);
      if (Math.abs(this.listenPitch) > .005) {
        this.root.updateMatrixWorld(true);
        bendBone(this.root, this.bones.Head, -this.listenPitch);
      }
    }
    // Knocked out: topple backwards onto the floor and lie still.
    this.koT = THREE.MathUtils.clamp((this.koT || 0) + (ko ? dt / 0.6 : -dt / 0.9), 0, 1);
    if (snap) this.koT = ko ? 1 : 0;
    const e = this.koT * this.koT * (3 - 2 * this.koT);
    this.model.rotation.set(-Math.PI / 2 * e, 0, 0.3 * e);
    this.model.position.set(0, y * (1 - e) + 0.11 * e, back * (1 - e) + 0.85 * e);
    this.root.updateMatrixWorld(true);
    if (wind !== undefined) this.hairMotion?.setWind(wind);
    if(!deferHair)this.updateHair(dt,snap);
  }
  updateHair(dt,snap=false){this.root.updateMatrixWorld(true);this.hairMotion?.update(dt,snap);this.haircuts?.update(dt);}
  get down() { return (this.koT || 0) > 0.5; }
}

// A body, posed on the floor where the murder happened.
export class Corpse {
  constructor(kit, suspect, {humanForm=true}={}) {
    kit = humanForm ? suspectKit(kit, suspect) : kit;
    this.root = new THREE.Group();
    this.model = cloneCharacter(kit.scene);
    this.model.scale.setScalar(0.98);
    const mixer = new THREE.AnimationMixer(this.model);
    const a = mixer.clipAction(kit.clips.idle); a.play(); mixer.update(0.1);
    const bones = {};
    this.model.traverse((o) => { if (o.isBone) bones[o.name.replace("mixamorig", "").replace(":", "")] = o; });
    dress(this.model,suspect.color);
    this.hairMotion=kit.authored?new HairMotion(this.model,bones):null;
    if(kit.authored)installHairAppearance(this.model);
    this.haircuts=kit.authored?new Haircuts(this.model,this.hairMotion):null;
    this.model.updateMatrixWorld(true);
    // Sprawled: one knee bent, arms out.
    bendBone(this.model, bones.LeftUpLeg, -0.5); bendBone(this.model, bones.LeftLeg, 0.9);
    const zr = (b, ang) => { if (b) { b.rotateZ(ang); b.updateMatrixWorld(true); } };
    zr(bones.LeftArm, 0.9); zr(bones.RightArm, -0.6); zr(bones.LeftForeArm, 0.4);
    bendBone(this.model, bones.Head, 0.3);
    this.model.rotation.set(-Math.PI / 2, 0, 0.25);
    this.model.position.set(0, 0.11, 0.85);
    this.root.add(this.model);
    this.fall = 0;
    this.tick(0);
  }
  // Collapse: pitch from standing to sprawled, with a little bounce.
  tick(dt, instant = false) {
    if (this.fall >= 1 && !instant) return;
    this.fall = instant ? 1 : Math.min(1, this.fall + dt / 0.7);
    const u = this.fall, e = u < 1 ? u * u * (3 - 2 * u) : 1;
    const bounce = u > 0.8 ? Math.sin((u - 0.8) / 0.2 * Math.PI) * 0.06 : 0;
    this.model.rotation.set(-Math.PI / 2 * e + bounce, 0, 0.25 * e);
    this.model.position.set(0, 0.11 * e, 0.85 * e);
  }
}

// Chalk outline left once a body has been taken away.
export function chalkOutline() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 6; g.lineJoin = "round";
  g.beginPath();
  g.moveTo(128, 20); g.arc(128, 38, 18, -Math.PI / 2, Math.PI * 1.5);
  g.moveTo(112, 60); g.lineTo(60, 80); g.lineTo(40, 120); g.moveTo(144, 60); g.lineTo(200, 70); g.lineTo(222, 40);
  g.moveTo(112, 60); g.lineTo(108, 150); g.lineTo(80, 236); g.moveTo(144, 60); g.lineTo(148, 150); g.lineTo(186, 230);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.015;
  return m;
}
