import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const PARTS = ["base", "mane", "tail", "muzzle", "hoof", "eye", "marking"];
export const HORSE_PATTERNS = ["none", "blaze", "star", "socks", "pinto", "appaloosa"];
let sourcePromise;

export function horseLook(coat, pattern, overrides = {}) {
  const base = /^#[0-9a-f]{6}$/i.test(coat || "") ? coat : "#9a7e65";
  const shade = (amount) => `#${new THREE.Color(base).multiplyScalar(amount).getHexString()}`;
  const defaults = { base, mane: shade(.38), tail: shade(.38), muzzle: shade(.74), hoof: "#2d2521", eye: "#171312", marking: "#eadcc2", pattern: HORSE_PATTERNS.includes(pattern) ? pattern : "none" };
  for (const part of PARTS) if (/^#[0-9a-f]{6}$/i.test(overrides?.[part] || "")) defaults[part] = overrides[part];
  if (HORSE_PATTERNS.includes(overrides?.pattern)) defaults.pattern = overrides.pattern;
  return defaults;
}

function source() {
  if (!sourcePromise) sourcePromise = new GLTFLoader().loadAsync("./uploads/horse.glb");
  return sourcePromise;
}

function partFor(name = "") {
  const value = name.toLowerCase();
  if (/eye|pupil/.test(value)) return "eye";
  if (/hoof|hooves|foot|toe|shoe/.test(value)) return "hoof";
  if (/snout|muzzle|nose/.test(value)) return "muzzle";
  if (/tail/.test(value)) return "tail";
  if (/mane|main|hair|braid/.test(value)) return "mane";
  return "base";
}

function patternApplies(pattern, nx, ny, nz, head, hoof) {
  if (pattern === "blaze") return head && Math.abs(nx - .5) < .2 && ny > .45;
  if (pattern === "star") return head && ny > .68 && Math.abs(nx - .5) < .3;
  if (pattern === "socks") return hoof || (ny < .25 && (nx < .28 || nx > .72));
  if (pattern === "pinto") return ny > .18 && Math.sin(nx * 17.1 + nz * 11.7) > .55;
  if (pattern === "appaloosa") return ny > .24 && Math.sin(nx * 31.7 + nz * 23.1 + ny * 17.3) > .86;
  return false;
}

function paintPattern(mesh, look) {
  const geometry = mesh.geometry, position = geometry.attributes.position;
  if (!position) return;
  const bounds = new THREE.Box3().setFromBufferAttribute(position);
  const size = bounds.getSize(new THREE.Vector3());
  const colors = new Float32Array(position.count * 3);
  const base = new THREE.Color(look.base), marking = new THREE.Color(look.marking);
  const skinIndex = geometry.attributes.skinIndex, skinWeight = geometry.attributes.skinWeight;
  const bones = mesh.skeleton?.bones || [];
  for (let i = 0; i < position.count; i++) {
    const nx = THREE.MathUtils.clamp((position.getX(i) - bounds.min.x) / Math.max(size.x, .001), 0, 1);
    const ny = THREE.MathUtils.clamp((position.getY(i) - bounds.min.y) / Math.max(size.y, .001), 0, 1);
    const nz = THREE.MathUtils.clamp((position.getZ(i) - bounds.min.z) / Math.max(size.z, .001), 0, 1);
    let boneName = "", strongest = 0;
    if (skinIndex && skinWeight) for (let slot = 0; slot < skinIndex.itemSize; slot++) {
      const weight = skinWeight.getComponent(i, slot);
      if (weight > strongest) { strongest = weight; boneName = bones[skinIndex.getComponent(i, slot)]?.name?.toLowerCase() || ""; }
    }
    const head = /head|muzzle|snout|nose|jaw|face|neck/.test(boneName) || (ny > .38 && Math.max(nx, nz) > .72);
    const hoof = /hoof|foot|toe|ankle|fetlock/.test(boneName) || ny < .11;
    const color = patternApplies(look.pattern, nx, ny, nz, head, hoof) ? marking : base;
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function prepareClip(root, clip) {
  const roots = new Set();
  root.traverse((node) => { if (node.isBone && !node.parent?.isBone) roots.add(node.name); });
  const copy = clip.clone();
  copy.tracks = copy.tracks.filter((track) => {
    const cut = track.name.lastIndexOf(".");
    if (cut < 0) return true;
    const name = track.name.slice(0, cut), property = track.name.slice(cut + 1);
    return !((property === "position" || property === "scale") && [...roots].some((rootName) => name === rootName || name.endsWith(`|${rootName}`) || name.endsWith(`/${rootName}`)));
  });
  return copy;
}

export function createHorseModel() {
  const root = new THREE.Group();
  const state = { root, saddle: null, mixer: null, actions: {}, current: null, speed: 0, phase: 0, destroyed: false, appearance: null };
  source().then((gltf) => {
    if (state.destroyed) return;
    const rig = cloneSkeleton(gltf.scene);
    rig.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry = child.geometry.clone();
      child.castShadow = true; child.receiveShadow = true;
      const originals = Array.isArray(child.material) ? child.material : [child.material];
      const materials = originals.map((sourceMaterial) => {
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .87, metalness: 0, side: sourceMaterial.side, transparent: sourceMaterial.transparent, opacity: sourceMaterial.opacity, alphaTest: sourceMaterial.alphaTest });
        material.name = sourceMaterial.name;
        return material;
      });
      child.material = Array.isArray(child.material) ? materials : materials[0];
    });
    root.add(rig);
    // The skinned world box can be tiny before its bones have been posed,
    // which made this asset expand to several times the rider's height.
    // The supplied horse has stable mesh-space positions (about 2.03m high).
    const bounds = new THREE.Box3();
    rig.traverse((child) => {
      if (child.isMesh && child.geometry?.attributes?.position)
        bounds.union(new THREE.Box3().setFromBufferAttribute(child.geometry.attributes.position));
    });
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 2.1 / Math.max(size.y, .001);
    rig.scale.setScalar(scale);
    rig.position.set(-(bounds.min.x + bounds.max.x) * .5 * scale, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) * .5 * scale);
    state.rig = rig;
    state.mixer = new THREE.AnimationMixer(rig);
    for (const clip of gltf.animations) if (["Idle", "Walk", "Trot", "Run"].includes(clip.name)) {
      state.actions[clip.name] = state.mixer.clipAction(prepareClip(rig, clip));
    }
    if (state.actions.Idle) { state.current = "Idle"; state.actions.Idle.play(); }
    const tack = new THREE.MeshStandardMaterial({ color: "#463124", roughness: .95 });
    const saddle = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), tack);
    pad.scale.set(.42, .075, .29); pad.position.set(0, 1.46, -.08); saddle.add(pad);
    const girth = new THREE.Mesh(new THREE.TorusGeometry(.45, .035, 5, 18, Math.PI), tack);
    girth.rotation.z = Math.PI / 2; girth.position.set(0, 1.18, -.08); saddle.add(girth);
    root.add(saddle); state.saddle = saddle; saddle.visible = !!state.tamed;
    if (state.appearance) state.setAppearance(state.appearance);
  }).catch((error) => console.error("Horse asset could not load", error));
  state.setAppearance = (look) => {
    state.appearance = look;
    if (!state.rig) return;
    const key = JSON.stringify(look);
    if (key === state.appearanceKey) return;
    state.appearanceKey = key;
    state.rig.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const body = materials.some((material) => partFor(material.name) === "base");
      if (body && look.pattern !== "none") paintPattern(child, look);
      for (const material of materials) {
        const part = partFor(material.name);
        const patterned = part === "base" && look.pattern !== "none";
        material.vertexColors = patterned;
        material.color.set(patterned ? "#ffffff" : look[part]);
        material.needsUpdate = true;
      }
    });
  };
  state.updateGait = (speed, dt) => {
    if (!state.mixer) return;
    const gait = speed < .55 ? "Idle" : speed < 5 ? "Walk" : speed < 8.5 ? "Trot" : "Run";
    if (gait !== state.current && state.actions[gait]) {
      state.actions[gait].reset().play().crossFadeFrom(state.actions[state.current], .15, false);
      state.current = gait;
    }
    if (state.actions[gait]) state.actions[gait].timeScale = gait === "Idle" ? 1 : THREE.MathUtils.clamp(speed / (gait === "Walk" ? 3.5 : gait === "Trot" ? 6.5 : 10), .65, 1.5);
    state.mixer.update(dt);
  };
  state.dispose = () => {
    state.destroyed = true;
    state.mixer?.stopAllAction();
    root.traverse((object) => {
      object.geometry?.dispose();
      const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
      for (const material of materials) material.dispose();
    });
  };
  return state;
}
