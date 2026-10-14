// Act I opening cinematic: a rain-soaked night on the Old Road, the medicine
// caravan, the road collapsing into the Sunken Mile, and waking at the edge.
// Runs its own renderer (ACES, soft shadows, bloom), timed shots with camera
// moves and shake, rain, lightning, falling slabs, letterbox and subtitles.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Character } from "./character.js";
import { AudioSys } from "./audio.js";
import { createGrassField } from "./grass.js";
import { characterVoice } from "./speech.js";

const $ = (s) => document.querySelector(s);
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const v3 = (a) => new THREE.Vector3(...a);

const CHASM_Z0 = -7.5, CHASM_Z1 = -2.6; // the stretch of road that falls

function stoneMat(color, rough = 0.92) { return new THREE.MeshStandardMaterial({ color, roughness: rough }); }

function buildSet(scene, lowEnd) {
  const set = { slabs: [], lanterns: [] };
  const mud = stoneMat(0x1d211c, 1);
  const road = stoneMat(0x5b564c, 0.75);
  const rock = stoneMat(0x343537, 0.95);
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.8 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, metalness: 0.6, roughness: 0.45 });
  const canvas = new THREE.MeshStandardMaterial({ color: 0xb8ab8e, roughness: 0.95, side: THREE.DoubleSide });
  const add = (g, m, p, r = [0, 0, 0], parent = scene) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(...p); o.rotation.set(...r);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  // ground either side of the chasm, wet look via low roughness on the road
  add(new THREE.PlaneGeometry(90, 60), mud, [0, -0.05, CHASM_Z1 + 30], [-Math.PI / 2, 0, 0]);
  add(new THREE.PlaneGeometry(90, 60), mud, [0, -0.05, CHASM_Z0 - 30], [-Math.PI / 2, 0, 0]);
  // the chasm: a deep pit with a faint sickly glow at the bottom
  const pitMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 1 });
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(90, 40, 0.5), pitMat, [0, -20, s > 0 ? CHASM_Z1 : CHASM_Z0]);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(90, CHASM_Z1 - CHASM_Z0), new THREE.MeshBasicMaterial({ color: 0x163a2a }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, -26, (CHASM_Z0 + CHASM_Z1) / 2);
  scene.add(glow);
  const deep = new THREE.PointLight(0x5fe0a0, 0, 40, 1.4);
  deep.position.set(0.5, -9, (CHASM_Z0 + CHASM_Z1) / 2);
  scene.add(deep);
  set.deep = deep;
  // road slabs (individual so the collapse can drop them)
  const slabG = new THREE.BoxGeometry(1.62, 0.22, 1.5);
  for (let row = 0; row < 34; row++) {
    const z = 30 - row * 1.55;
    for (let lane = -1; lane <= 1; lane++) {
      const m = add(slabG, road, [lane * 1.66 + Math.sin(row * 3.1 + lane) * 0.06, 0.02 + Math.sin(row * 7 + lane) * 0.02, z], [Math.sin(row + lane) * 0.02, Math.sin(row * 5 + lane) * 0.05, Math.cos(row * 3) * 0.02]);
      if (z < CHASM_Z1 + 0.6 && z > CHASM_Z0 - 0.6) set.slabs.push({ m, vy: 0, delay: Math.abs(lane) * 0.25 + Math.random() * 0.6, spin: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5), (Math.random() - 0.5) * 3) });
    }
  }
  // kerb stones & milestones
  for (let k = 0; k < 14; k++) {
    const z = 28 - k * 4.4;
    if (z < CHASM_Z1 + 0.5 && z > CHASM_Z0 - 0.5) continue;
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, 0.35, 3.8), stoneMat(0x4a463e), [s * 2.8, 0.1, z]);
  }
  add(new THREE.BoxGeometry(0.45, 1.3, 0.3), stoneMat(0x8a8478), [-3.6, 0.6, 6], [0, 0.2, 0.05]);
  const grassCount = lowEnd ? 2700 : 7000;
  const grass = createGrassField(scene, { capacity: grassCount, blades: lowEnd ? 4 : 6, palette: "rain" });
  const blades = [];
  for (let i = 0; i < grassCount; i++) {
    const z = -65 + Math.random() * 101;
    if (z > CHASM_Z0 - .5 && z < CHASM_Z1 + .5) continue;
    const x = (i % 2 ? 1 : -1) * (3.55 + Math.random() * 11.5);
    blades.push({ x, y: -.045, z, scale: .55 + Math.random() * .68,
      rotation: Math.random() * Math.PI * 2, tint: Math.random() * .6 });
  }
  grass.setPositions(blades);
  set.grass = grass;
  // cliffs and boulders
  const rg = new THREE.DodecahedronGeometry(1, 1);
  for (let i = 0; i < 26; i++) {
    const z = 32 - i * 3.6;
    for (const s of [-1, 1]) {
      const r = add(rg, rock, [s * (8 + (i % 3) * 1.4 + Math.sin(i) * 1.2), 1 + (i % 2), z], [i, i * 0.7, i * 0.3]);
      r.scale.set(2.6 + (i % 3), 2.4 + (i % 4) * 1.3, 2.8 + (i % 2));
    }
  }
  // dead trees
  const treeCount = 10;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.29, 1, 9), wood, treeCount);
  const limbs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 1, 1, 6), wood, treeCount * 13);
  const treeDummy = new THREE.Object3D(), treeUp = new THREE.Vector3(0, 1, 0);
  const treeDirection = new THREE.Vector3();
  let limbIndex = 0;
  const treeSegment = (a, b, radius) => {
    treeDirection.subVectors(b, a);
    treeDummy.position.copy(a).addScaledVector(treeDirection, 0.5);
    treeDummy.quaternion.setFromUnitVectors(treeUp, treeDirection.clone().normalize());
    treeDummy.scale.set(radius, treeDirection.length(), radius);
    treeDummy.updateMatrix();
    limbs.setMatrixAt(limbIndex++, treeDummy.matrix);
  };
  for (let i = 0; i < 10; i++) {
    const h = 4 + (i % 3) * 1.5;
    const x = (i % 2 ? 1 : -1) * (5 + (i % 4)), z = 24 - i * 6;
    const lean = Math.sin(i * 4.7) * 0.42;
    treeDummy.position.set(x + lean * .35, h * .35, z);
    treeDummy.rotation.set(0, 0, -lean / h);
    treeDummy.scale.set(1, h * .7, 1);
    treeDummy.updateMatrix(); trunks.setMatrixAt(i, treeDummy.matrix);
    treeSegment(new THREE.Vector3(x + lean * .7, h * .67, z), new THREE.Vector3(x + lean * 1.5, h, z + Math.sin(i * 2.2) * .35), .16);
    for (let j = 0; j < 3; j++) {
      const angle = i * 1.7 + j * 2.15;
      const side = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const base = new THREE.Vector3(x + lean * (.4 + j * .12), h * (.4 + j * .12), z);
      const fork = base.clone().addScaledVector(side, .68 + j * .1).add(new THREE.Vector3(0, .45, 0));
      const tip = fork.clone().addScaledVector(side, .75 + j * .13).add(new THREE.Vector3(0, .35 + j * .1, 0));
      treeSegment(base, fork, .12 - j * .013);
      treeSegment(fork, tip, .075 - j * .008);
      treeSegment(fork, fork.clone().addScaledVector(side, .28).add(new THREE.Vector3(-side.z * .45, .55, side.x * .45)), .035);
    }
    for (let j = 0; j < 3; j++) {
      const angle = i + j * Math.PI * 2 / 3;
      treeSegment(new THREE.Vector3(x, .32, z), new THREE.Vector3(x + Math.cos(angle) * .7, .02, z + Math.sin(angle) * .7), .15);
    }
  }
  trunks.castShadow = limbs.castShadow = true;
  scene.add(trunks, limbs);
  // the caravan wagon
  const wagon = new THREE.Group();
  add(new THREE.BoxGeometry(2.4, 0.5, 4.2), wood, [0, 1.05, 0], [0, 0, 0], wagon);
  add(new THREE.BoxGeometry(2.5, 0.1, 4.3), iron, [0, 0.78, 0], [0, 0, 0], wagon);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.1, 0.6, 4.2), wood, [s * 1.2, 1.5, 0], [0, 0, 0], wagon);
  // canvas cover hoops
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 4.0, 18, 1, true, -Math.PI / 2, Math.PI), canvas);
  cover.rotation.x = Math.PI / 2; cover.rotation.z = 0; cover.position.set(0, 1.55, 0);
  cover.rotation.set(Math.PI / 2, 0, 0);
  cover.castShadow = true;
  wagon.add(cover);
  // crates of medicine
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.7, 0.55, 0.7), new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.85 }), [-0.5 + (i % 2), 1.6, -1.2 + Math.floor(i / 2) * 1.4], [0, i * 0.3, 0], wagon);
  const wheels = [];
  for (const sx of [-1.25, 1.25]) for (const sz of [-1.4, 1.4]) {
    const w = add(new THREE.TorusGeometry(0.55, 0.08, 8, 22), iron, [sx, 0.58, sz], [0, Math.PI / 2, 0], wagon);
    const spokes = add(new THREE.BoxGeometry(0.06, 1.0, 0.06), wood, [0, 0, 0], [0, 0, 0], w);
    spokes.rotation.z = 0; add(new THREE.BoxGeometry(0.06, 1.0, 0.06), wood, [0, 0, 0], [0, 0, Math.PI / 2], w);
    wheels.push(w);
  }
  add(new THREE.BoxGeometry(0.12, 0.12, 2.6), wood, [0, 0.7, 3.2], [0.1, 0, 0], wagon);
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xff8a2a, emissiveIntensity: 4 });
  for (const s of [-1, 1]) {
    const lm = add(new THREE.BoxGeometry(0.18, 0.26, 0.18), lanternMat, [s * 1.3, 2.25, 2.1], [0, 0, 0], wagon);
    const l = new THREE.PointLight(0xff9a48, 9, 14, 1.7);
    l.position.copy(lm.position);
    l.castShadow = s > 0 && !lowEnd;
    if (l.castShadow) { l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.002; }
    wagon.add(l);
    set.lanterns.push(l);
  }
  scene.add(wagon);
  set.wagon = wagon; set.wheels = wheels;
  // a single dropped lantern that will keep burning at the bottom
  const fallen = new THREE.Group();
  fallen.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), lanternMat));
  const fl = new THREE.PointLight(0xff9a48, 0, 18, 1.5);
  fallen.add(fl);
  fallen.visible = false;
  scene.add(fallen);
  set.fallen = fallen; set.fallenLight = fl;
  return set;
}

function buildRain(scene, n) {
  const pos = new Float32Array(n * 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.38 });
  const lines = new THREE.LineSegments(g, m);
  lines.frustumCulled = false;
  scene.add(lines);
  const drops = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 50, y: Math.random() * 22, z: (Math.random() - 0.5) * 50, v: 16 + Math.random() * 8 }));
  return {
    update(dt, c) {
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        d.y -= d.v * dt;
        if (d.y < 0) { d.y = 16 + Math.random() * 6; d.x = c.x + (Math.random() - 0.5) * 50; d.z = c.z + (Math.random() - 0.5) * 50; }
        pos.set([d.x, d.y, d.z, d.x - 0.04, d.y + 0.55, d.z - 0.02], i * 6);
      }
      g.attributes.position.needsUpdate = true;
    },
    dispose() { scene.remove(lines); g.dispose(); m.dispose(); },
  };
}

// ---------- the film ----------
export function startAct1Cutscene({ sheet, saveId, saves, data, onDone }) {
  const screen = $("#cutscene"), stage = $("#cutsceneStage");
  const label = $("#cutsceneLabel"), line = $("#cutsceneLine"), next = $("#cutsceneNext"), hint = $("#cutsceneHint");
  const skip = $("#cutsceneSkip"), flash = $("#cutsceneFlash"), card = $("#cutsceneCard");
  const lowEnd = matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency || 4) <= 4;
  screen.classList.remove("hidden");
  screen.classList.remove("ended");
  card.classList.remove("show");

  const renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowEnd ? 1 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.innerHTML = "";
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1119);
  scene.fog = new THREE.FogExp2(0x101822, 0.035);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 300);
  const moon = new THREE.DirectionalLight(0x8fb0e0, 1.3);
  moon.position.set(-14, 22, 10);
  moon.castShadow = true;
  moon.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  Object.assign(moon.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
  moon.shadow.bias = -0.0005;
  scene.add(moon);
  const hemi = new THREE.HemisphereLight(0x5a6e8e, 0x14110e, 0.55);
  scene.add(hemi);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.75, 0.5, 0.7));
  composer.addPass(new OutputPass());

  const set = buildSet(scene, lowEnd);
  const rain = buildRain(scene, lowEnd ? 900 : 2600);
  const hero = new Character(sheet.look, { hairGuides: lowEnd ? 60 : 180 });
  hero.addTo(scene);
  const heroPos = new THREE.Vector3(1.9, 0, 16);
  let heroYaw = Math.PI;

  let disposed = false;
  const audio = new AudioSys();
  audio.init().then(() => {
    if (disposed) return;
    audio.ambience(true);
    if (!voiceDone) audio.setAmbienceLevel(0.12);
  }).catch(() => {});

  const resize = () => {
    const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener("resize", resize);

  // state driven by shots
  const S = { wagonZ: 20, wagonRoll: 0, wagonDrop: 0, wagonPitch: 0, shake: 0, collapse: -1, heroSpeed: 0, flashT: 0, deep: 0, dawn: 0 };
  const wind = new THREE.Vector3(0.4, 0, -0.2);
  let lightningT = 2.5;

  const camAt = (from, to, lookFrom, lookTo, k, fov0 = 38, fov1 = 38) => {
    const e = ease(k);
    camera.position.lerpVectors(from, to, e);
    camLook.lerpVectors(lookFrom, lookTo, e);
    camera.fov = lerp(fov0, fov1, e);
  };
  const camLook = new THREE.Vector3();

  const playerVoice = characterVoice(sheet);
  const narratorVoice = playerVoice === "en-female" ? "en-male" : "en-female";
  const shots = [
    {
      dur: 7.5, label: "BEFORE DAWN · THE OLD ROAD",
      line: "Rain on the Old Road. The medicine caravan for Brightwell is three days late — and you are its last escort.",
      run(k, dt) {
        S.wagonZ = lerp(22, 12, k); S.heroSpeed = 1.35;
        heroPos.z = S.wagonZ - 1.0;
        camAt(v3([9, 7.5, 30]), v3([5.5, 3.6, 21]), v3([0, 1, 14]), v3([0.6, 1.2, 10]), k, 34, 40);
      },
    },
    {
      dur: 6.5, label: sheet.name.toUpperCase(), voice: playerVoice,
      line: "Brightwell's children are burning with greyfever. Every crate on this cart is a life.",
      run(k) {
        S.wagonZ = lerp(12, 6.5, k); S.heroSpeed = 1.35;
        heroPos.z = S.wagonZ - 1.0;
        const h = hero.height;
        const head = new THREE.Vector3(heroPos.x, h * 0.92, heroPos.z);
        camAt(head.clone().add(v3([1.4, 0.15, -2.8])), head.clone().add(v3([0.8, 0.05, -1.7])), head, head.clone().add(v3([0, 0, 0.2])), k, 30, 26);
      },
    },
    {
      dur: 7.5, label: "THE ROAD GIVES WAY",
      line: "Stone groans. A seam of light races under the wheels — and the Old Road opens like a mouth.",
      enter() { audio.play("hit", { x: 0, y: 0, z: -5 }, { vol: 1.6, rate: 0.45 }); S.flashT = 0.25; },
      run(k, dt, t) {
        S.heroSpeed = k < 0.15 ? 1.2 : 0;
        S.wagonZ = lerp(6.5, -5.0, Math.min(1, k * 2.2));
        if (k < 0.45) heroPos.z = lerp(5.5, -0.6, Math.min(1, k / 0.45));
        S.shake = k < 0.2 ? k * 2 : 0.45 * (1 - k * 0.6);
        if (k > 0.3 && S.collapse < 0) { S.collapse = 0; audio.play("death", { x: 0, y: 0, z: -5 }, { vol: 1.2, rate: 0.6 }); }
        if (k > 0.42 && !S.heroHit) { S.heroHit = true; hero.play("hit", 0.6); heroYaw = 0; }
        if (k > 0.62 && !S.heroDown) { S.heroDown = true; hero.play("downed"); S.flashT = 0.2; }
        camAt(v3([-7, 3.2, 3.5]), v3([-5.2, 2.0, 1.2]), v3([0, 0.8, -3]), v3([0.6, 0.2, -4.5]), k, 36, 42);
      },
    },
    {
      dur: 4.5, label: "", line: "Darkness. The sound of the cart breaking far below. Then nothing.",
      enter() { screen.classList.add("blackout"); audio.play("hit", { x: 0, y: -10, z: -5 }, { vol: 0.8, rate: 0.35 }); },
      run(k) { camAt(v3([2, 6, -1]), v3([1.5, 4, -3]), v3([0.5, -10, -5]), v3([0.5, -14, -5]), k); },
      exit() { screen.classList.remove("blackout"); },
    },
    {
      dur: 8, label: "THE SUNKEN MILE",
      line: "You wake at the edge of the collapse. The caravan is gone. Far below, one lantern is still burning. By dusk, you limp through Marrowgate's south gate.",
      enter() {
        S.collapse = 99; for (const s of set.slabs) s.m.visible = false;
        set.wagon.visible = false;
        set.fallen.visible = true; set.fallen.position.set(0.8, -14, -5); set.fallenLight.intensity = 22;
        heroPos.set(1.2, 0, -0.9); heroYaw = 0.2;
        hero.play("revive"); hero.play("kneel");
        S.deep = 1;
      },
      run(k) {
        S.dawn = k;
        if (k > 0.55 && !S.stood) { S.stood = true; hero.play("stand"); }
        heroYaw = lerp(0.2, Math.PI - 0.3, ease(clamp01((k - 0.6) / 0.4))) ;
        const d = 0;
        camAt(v3([3.8, 0.7 + d, 3.5]), v3([2.2, 1.4, 1.6]), v3([1.2, 0.8, -0.9]), v3([0.6, -3, -5.5]), k, 40, 34);
      },
    },
  ];
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  const closing = { line: "Act one. The Broken Mile.", voice: narratorVoice };
  let idx = -1, shotT = 0, ended = false, typing = null;
  let voiceDone = true, voiceEpoch = 0, stopBrowser = null;

  const voiceFor = (part) => part.voice || narratorVoice;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const stopVoice = () => {
    voiceEpoch++;
    stopBrowser?.();
    stopBrowser = null;
    try { window.speechSynthesis?.cancel(); } catch {}
    voiceDone = true;
    audio.setAmbienceLevel(0.35);
  };
  const speakInBrowser = (part, maxMs) => new Promise((resolve, reject) => {
    if (!window.websim?.textToSpeech) { resolve(); return; }
    let settled = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (stopBrowser === stop) stopBrowser = null;
      error ? reject(error) : resolve();
    };
    const stop = (error) => { try { window.speechSynthesis?.cancel(); } catch {} settle(error); };
    stopBrowser = stop;
    const watchdog = setTimeout(() => stop(new Error("Browser speech timed out")), maxMs);
    try {
      Promise.resolve(window.websim.textToSpeech({ text: part.line, voice: voiceFor(part) })).then(() => settle(), settle);
    } catch (error) { settle(error); }
  });
  const speak = async (part) => {
    stopVoice();
    const epoch = voiceEpoch;
    voiceDone = false;
    audio.setAmbienceLevel(0.12);
    const maxMs = Math.max(16000, part.line.length * 150);
    try {
      await speakInBrowser(part, maxMs);
    } catch (error) {
      console.warn("Cutscene voice unavailable", error);
    } finally {
      if (epoch === voiceEpoch) {
        voiceDone = true;
        audio.setAmbienceLevel(0.35);
      }
    }
  };
  const typeLine = (text) => {
    clearInterval(typing);
    line.textContent = "";
    let i = 0;
    typing = setInterval(() => { line.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typing); }, 22);
  };
  const go = (i) => {
    stopVoice();
    shots[idx]?.exit?.();
    idx = i;
    shotT = 0;
    if (idx >= shots.length) { finish(); return; }
    const s = shots[idx];
    label.textContent = s.label;
    typeLine(s.line);
    speak(s);
    hint.textContent = `${idx + 1} / ${shots.length}`;
    next.textContent = idx === shots.length - 1 ? "Rise" : "Continue";
    s.enter?.();
  };
  const advance = () => { if (!ended) go(idx + 1); };

  let raf = 0, last = performance.now(), t = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (!ended && idx >= 0 && idx < shots.length) {
      const s = shots[idx];
      shotT += dt;
      s.run(Math.min(1, shotT / s.dur), dt, t);
      if (shotT >= s.dur + 1.6 && voiceDone) advance();
    }
    // wagon
    const W = set.wagon;
    if (S.collapse >= 0 && S.collapse < 90) {
      S.collapse += dt;
      for (const sl of set.slabs) {
        if (S.collapse < sl.delay) { sl.m.position.y = Math.sin(t * 40 + sl.delay * 9) * 0.03; continue; }
        sl.vy -= 22 * dt;
        sl.m.position.y += sl.vy * dt;
        sl.m.rotation.x += sl.spin.x * dt; sl.m.rotation.z += sl.spin.z * dt;
      }
      if (S.collapse > 0.5) {
        S.wagonDrop += dt; 
        W.position.y = -0.5 * 18 * S.wagonDrop * S.wagonDrop;
        W.rotation.x = -S.wagonDrop * 1.2;
        W.rotation.z = S.wagonDrop * 0.5;
      }
      set.deep.intensity = Math.min(16, S.collapse * 8);
    }
    W.position.z = S.wagonZ;
    for (const w of set.wheels) w.rotation.x -= S.heroSpeed * dt * 2.2 * (S.collapse < 0 ? 1 : 0);
    set.lanterns.forEach((l, i) => { l.intensity = 8 + Math.sin(t * 9 + i * 2) * 1.2; });
    if (S.deep) set.fallenLight.intensity = 20 + Math.sin(t * 7) * 3;
    // hero
    hero.speed = S.heroSpeed;
    hero.object.position.copy(heroPos);
    hero.object.rotation.y = heroYaw;
    hero.update(dt, { camera, wind, simulateHair: true });
    // lightning
    lightningT -= dt;
    if (lightningT < 0) { lightningT = 4 + Math.random() * 6; S.flashT = 0.18; }
    if (S.flashT > 0) { S.flashT -= dt; hemi.intensity = 0.55 + 3.5 * Math.max(0, S.flashT / 0.18) * (Math.random() > 0.3 ? 1 : 0.2); flash.style.opacity = Math.max(0, S.flashT * 1.6); }
    else { hemi.intensity = lerp(0.55, 0.9, S.dawn); flash.style.opacity = 0; }
    // dawn creeping in on the last shot
    scene.background.setRGB(lerp(0.043, 0.16, S.dawn), lerp(0.067, 0.12, S.dawn), lerp(0.098, 0.14, S.dawn));
    scene.fog.color.copy(scene.background);
    moon.color.setRGB(lerp(0.56, 1.0, S.dawn), lerp(0.69, 0.72, S.dawn), lerp(0.88, 0.5, S.dawn));
    // camera shake
    if (S.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * S.shake * 0.3, (Math.random() - 0.5) * S.shake * 0.3, (Math.random() - 0.5) * S.shake * 0.2));
    camera.updateProjectionMatrix();
    camera.lookAt(camLook);
    rain.update(dt, camera.position);
    wind.set(.72 + Math.sin(t * .45) * .28, 0, -.3 + Math.sin(t * .23) * .19);
    set.grass.animate(t, wind, 1);
    composer.render();
  };

  function finish(skipped = false) {
    if (ended) return;
    ended = true;
    stopVoice();
    clearInterval(typing);
    screen.classList.add("ended");
    card.classList.add("show");
    label.textContent = "";
    line.textContent = "";
    hint.textContent = "";
    const updated = { ...data, progress: { ...data.progress, node: "wake", cutscene: { id: "act1-opening", step: shots.length, complete: true } } };
    saves.save(saveId, updated).catch((e) => console.warn("cutscene save", e));
    const titleVoice = skipped ? Promise.resolve() : speak(closing);
    Promise.all([titleVoice, wait(2600)]).then(() => cleanup(updated));
  }
  function cleanup(updated) {
    disposed = true;
    stopVoice();
    cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
    removeEventListener("keydown", keydown);
    audio.dispose();
    rain.dispose();
    set.grass.dispose();
    hero.dispose();
    scene.traverse((o) => { o.geometry?.dispose?.(); });
    renderer.dispose();
    stage.innerHTML = "";
    screen.classList.add("hidden");
    card.classList.remove("show");
    onDone?.(updated);
  }
  const keydown = (e) => {
    if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); advance(); }
    if (e.code === "Escape") { e.preventDefault(); finish(true); }
  };
  addEventListener("keydown", keydown);
  next.onclick = advance;
  skip.onclick = () => finish(true);
  go(0);
  raf = requestAnimationFrame(frame);
}
