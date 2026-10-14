import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Character } from "./character.js";
import { mulberry32 } from "./rng.js";
import { TelevisionShader, createStaticNoise } from "./title-static.js";
import { createBloodPhysics } from "./title-blood.js";
import { createGrassField } from "./grass.js";
import { makePursuer } from "./title-monster.js";
import { makeTitleSkeleton } from "./title-skeleton.js";
import { barkTextures, mudTextures, stoneTextures } from "./title-textures.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const SONG = "./uploads/Bone_Throne_Ritual_-_Catacombs_of_the_Hollow_King_-_Treblo.ogg";
const EATING_SOUND = "./sfx/title-eating.wav";
const STRIKE_SOUND = "./sfx/title-bone-strike.wav";
const SONG_DURATION = 284.9553;
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const mix = THREE.MathUtils.lerp;
const lightningTimes = [7.2, 19.1, 29.4, 42.2, 54.6, 63.8, 79.3, 98.1, 113.5];

// The movie and damage to the picture use the media clock. Buffering never
// lets the story outrun the music, and the file is never looped or restarted.

function material(color, roughness = .88) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}
function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

function makeForest(scene, low) {
  const random = mulberry32(92418);
  const textures = [];
  const textured = (set, color, roughness, rx, ry, bumpScale = 1.5) => {
    set.map.repeat.set(rx, ry); set.bumpMap.repeat.set(rx, ry); textures.push(set.map, set.bumpMap);
    return new THREE.MeshStandardMaterial({ color, roughness, map: set.map, bumpMap: set.bumpMap, bumpScale });
  };
  const bark = textured(barkTextures(), 0x6a6e6a, .92, 2, 5, 3), stone = textured(stoneTextures(), 0x9a9e9c, .7, 1, 1, 2);
  const iron = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: .38, metalness: .7 });
  const earth = textured(mudTextures(), 0x7a7f7a, .7, 26, 64, 1.2);
  const floor = mesh(new THREE.PlaneGeometry(90, 220, 1, 1), earth, scene, 0, -.06, -65);
  floor.rotation.x = -Math.PI / 2;
  // The wet path: darker, glossier mud that catches the moon and lightning.
  const path = mesh(new THREE.PlaneGeometry(4.5, 195), textured(mudTextures(), 0x8c8a8c, .4, 2, 85, .7), scene, 0, -.047, -62);
  path.rotation.x = -Math.PI / 2;
  const dummy = new THREE.Object3D();
  const treeCount = low ? 85 : 145;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .4, 1, 12, 3), bark, treeCount);
  // One draw call for the crooked leaders, forked limbs, fine twigs and roots.
  const branches = new THREE.InstancedMesh(new THREE.CylinderGeometry(.58, 1, 1, 7), bark, treeCount * 16);
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  let branchIndex = 0;
  const segment = (from, to, radius) => {
    direction.subVectors(to, from);
    dummy.position.copy(from).addScaledVector(direction, .5);
    dummy.quaternion.setFromUnitVectors(up, direction.clone().normalize());
    dummy.scale.set(radius, direction.length(), radius);
    dummy.updateMatrix();
    branches.setMatrixAt(branchIndex++, dummy.matrix);
  };
  for (let i = 0; i < treeCount; i++) {
    const x = (i % 2 ? 1 : -1) * (3.9 + random() * 22), z = -120 + random() * 160;
    const h = 7 + random() * 9;
    const leanX = (random() - .5) * .65, leanZ = (random() - .5) * .55;
    dummy.position.set(x + leanX * .35, h * .36, z + leanZ * .35);
    dummy.rotation.set(leanZ / h, 0, -leanX / h);
    dummy.scale.set(.75 + random() * .8, h * .72, .8 + random() * .5);
    dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    const crown = new THREE.Vector3(x + leanX, h * .69, z + leanZ);
    segment(crown, new THREE.Vector3(x + leanX * 1.5 + (random() - .5) * .8, h, z + leanZ * 1.5 + (random() - .5) * .8), .19);
    for (let j = 0; j < 3; j++) {
      const height = h * (.43 + j * .15), angle = random() * .8 + j * 2.1 + (i % 3) * .6;
      const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const base = new THREE.Vector3(x + leanX * height / h, height, z + leanZ * height / h);
      const elbow = base.clone().addScaledVector(outward, 1.1 + random() * .7).add(new THREE.Vector3(0, .7 + random() * .55, 0));
      const tip = elbow.clone().addScaledVector(outward, .9 + random() * 1.1).add(new THREE.Vector3(0, .55 + random() * .9, 0));
      segment(base, elbow, .17 - j * .022);
      segment(elbow, tip, .105 - j * .012);
      const side = new THREE.Vector3(-outward.z, 0, outward.x);
      segment(elbow, elbow.clone().addScaledVector(outward, .55).addScaledVector(side, .55 + random() * .45).add(new THREE.Vector3(0, .6 + random() * .5, 0)), .046);
      segment(tip, tip.clone().addScaledVector(outward, .38).addScaledVector(side, -(random() * .8 + .3)).add(new THREE.Vector3(0, .5 + random() * .6, 0)), .032);
    }
    for (let j = 0; j < 3; j++) {
      const angle = j * Math.PI * 2 / 3 + i * .7;
      segment(new THREE.Vector3(x, .38, z), new THREE.Vector3(x + Math.cos(angle) * (1 + random() * .35), .025, z + Math.sin(angle) * (1 + random() * .35)), .19);
    }
  }
  trunks.castShadow = branches.castShadow = true; scene.add(trunks, branches);

  // Crooked graves, broken iron fencing, wet stones and collapsed masonry.
  for (let i = 0; i < 38; i++) {
    const x = (i % 2 ? 1 : -1) * (3.1 + random() * 5), z = -105 + random() * 129;
    const grave = new THREE.Group(); scene.add(grave); grave.position.set(x, 0, z);
    grave.rotation.set((random() - .5) * .17, random() * 1.2 - .6, (random() - .5) * .2);
    mesh(new THREE.BoxGeometry(.68, .85, .2, 4, 4, 1), stone, grave, 0, .42, 0);
    const top = mesh(new THREE.CylinderGeometry(.34, .34, .2, 28, 1, false, 0, Math.PI), stone, grave, 0, .84, 0);
    mesh(new THREE.BoxGeometry(.8, .1, .32), stone, grave, 0, .03, 0);
    top.rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(.05, .35, .018), iron, grave, 0, .54, .111);
    mesh(new THREE.BoxGeometry(.24, .05, .018), iron, grave, 0, .61, .111);
  }
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), stone, 160);
  for (let i = 0; i < 160; i++) {
    dummy.position.set((random() - .5) * 24, -.04, -115 + random() * 142);
    dummy.rotation.set(random(), random() * 6, random());
    const s = .06 + random() * .3; dummy.scale.set(s * 1.5, s * .55, s); dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
  }
  stones.receiveShadow = true; scene.add(stones);
  for (let side of [-1, 1]) {
    for (let i = 0; i < 25; i++) {
      const z = -12 + i * 1.1;
      const post = mesh(new THREE.CylinderGeometry(.03, .04, 1.6, 8), iron, scene, side * 5, .8, z);
      post.rotation.z = Math.sin(i * 7) * .12;
      mesh(new THREE.ConeGeometry(.07, .23, 4), iron, scene, side * 5, 1.72, z);
    }
    mesh(new THREE.BoxGeometry(.045, .045, 27), iron, scene, side * 5, 1.05, 1);
    mesh(new THREE.BoxGeometry(.045, .045, 27), iron, scene, side * 5, .5, 1);
    mesh(new THREE.BoxGeometry(1.1, 5.5, 1.5), stone, scene, side * 3.8, 2.75, 20);
  }
  const arch = mesh(new THREE.TorusGeometry(3.8, .42, 16, 64, Math.PI), stone, scene, 0, 5.2, 20);
  arch.rotation.z = 0;
  const log = mesh(new THREE.CylinderGeometry(.13, .22, 3.4, 16, 3), bark, scene, -.1, .14, .75);
  log.rotation.z = Math.PI / 2; log.rotation.y = -.25;

  const grassCount = low ? 2800 : 7200;
  const grass = createGrassField(scene, { capacity: grassCount, blades: low ? 4 : 6, palette: "rain" });
  const grassPositions = [];
  for (let i = 0; i < grassCount; i++) {
    const x = (i % 2 ? 1 : -1) * (3.1 + random() * 13);
    grassPositions.push({ x, y: -.055, z: -125 + random() * 160,
      scale: .55 + random() * .7, rotation: random() * Math.PI * 2, tint: random() * .65 });
  }
  grass.setPositions(grassPositions);

  const mistCanvas = document.createElement("canvas"); mistCanvas.width = mistCanvas.height = 128;
  const ctx = mistCanvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, "rgba(150,174,189,.3)"); gradient.addColorStop(.4, "rgba(120,149,171,.12)"); gradient.addColorStop(1, "rgba(100,130,150,0)");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  const fogTexture = new THREE.CanvasTexture(mistCanvas);
  const fog = [];
  for (let i = 0; i < 22; i++) {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTexture, transparent: true, depthWrite: false, opacity: .45 }));
    f.scale.set(15 + random() * 10, 2.8 + random() * 2, 1); f.position.set((random() - .5) * 25, f.scale.y * .5 + random() * .6, -110 + i * 6.5); // kept above the ground so it never clips into a hard line
    f.userData.x = f.position.x; f.userData.phase = random() * 6.28; fog.push(f); scene.add(f);
  }
  return { fog, fogTexture, grass, textures };
}

// Two-link reaching keeps the hands attached while moving from the body to
// the underside of the hood. Targets are in the creature's body coordinates.
function reachArm({ arm, elbow, side }, target, weight) {
  const upperLength = 1.02, lowerLength = .83;
  const delta = target.clone().sub(arm.position);
  const distance = THREE.MathUtils.clamp(delta.length(), .2, upperLength + lowerLength - .01);
  const direction = delta.clone().normalize();
  const along = (distance * distance + upperLength * upperLength - lowerLength * lowerLength) / (2 * distance);
  const bend = new THREE.Vector3(side * .7, 0, -1);
  bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  const upper = direction.multiplyScalar(along).addScaledVector(bend, Math.sqrt(Math.max(0, upperLength * upperLength - along * along)));
  const down = new THREE.Vector3(0, -1, 0);
  const upperRotation = new THREE.Quaternion().setFromUnitVectors(down, upper.clone().normalize());
  const lower = delta.sub(upper).normalize().applyQuaternion(upperRotation.clone().invert());
  const lowerRotation = new THREE.Quaternion().setFromUnitVectors(down, lower);
  arm.quaternion.slerp(upperRotation, weight); elbow.quaternion.slerp(lowerRotation, weight);
}

function makeBlood(scene) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const a = i / 48 * Math.PI * 2, r = 1 + Math.sin(a * 5) * .1 + Math.cos(a * 9) * .06;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const blood = mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x4f080d, roughness: .22, metalness: .12, side: THREE.DoubleSide }), scene, .25, -.018, 5.2);
  blood.rotation.x = -Math.PI / 2; blood.castShadow = false; blood.visible = false;
  return blood;
}

export function startTitleCinematic(title) {
  const low = matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency || 4) <= 4;
  const stage = document.createElement("div"); stage.className = "title-film-stage"; stage.setAttribute("aria-hidden", "true");
  const soundButton = document.createElement("button"); soundButton.className = "title-film-sound"; soundButton.textContent = "♪  Play title music";
  soundButton.setAttribute("aria-label", "Play title music and cinematic");
  title.prepend(stage); title.append(soundButton); title.classList.add("title-film");
  const music = new Audio(SONG); music.preload = "auto"; music.loop = false; music.volume = .85;
  const eatingSound = new Audio(EATING_SOUND); eatingSound.preload = "auto"; eatingSound.loop = true; eatingSound.volume = .72;
  const strikeSound = new Audio(STRIKE_SOUND); strikeSound.preload = "auto"; strikeSound.volume = .95;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: low ? "low-power" : "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.25 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25; renderer.shadowMap.enabled = !low; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101722); scene.fog = new THREE.FogExp2(0x101722, .045);
  const camera = new THREE.PerspectiveCamera(48, 1, .08, 115);
  const hemi = new THREE.HemisphereLight(0x9dafc8, 0x232521, 1.15); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xa8c9ec, 2.3); moon.position.set(-10, 15, 10); scene.add(moon, moon.target);
  moon.castShadow = !low; moon.shadow.mapSize.setScalar(low ? 2048 : 4096); moon.shadow.camera.left = moon.shadow.camera.bottom = -34; moon.shadow.camera.right = moon.shadow.camera.top = 34;
  moon.shadow.camera.far = 70; moon.shadow.radius = 3; moon.shadow.bias = -.0005; moon.shadow.normalBias = .025;
  const fill = new THREE.PointLight(0xaecbd8, 16, 16, 2); scene.add(fill);
  const flash = new THREE.DirectionalLight(0xe0edff, 0); flash.position.set(6, 18, -3); scene.add(flash);
  // A cold light raking across the creature's back so its spine and ribs read.
  const stalkerLight = new THREE.SpotLight(0xb4c8dc, 30, 9, .7, .6, 1.6); scene.add(stalkerLight, stalkerLight.target);
  const forest = makeForest(scene, low);
  const heroine = new Character({ sex: .05, height: 1.02, build: .92, skin: "#bc9c87", body: "leather", gear: "#7c3040", trim: "#52493c", weapon: "none", shield: false, hair: { style: "ponytail", color: "#3d2a21", tip: "#634433", length: .5, volume: .35, density: 1.2 }, beard: { style: "none" } }, { hairGuides: low ? 80 : 170 });
  heroine.addTo(scene);
  const skeleton = makeTitleSkeleton(scene);
  const monster = makePursuer(scene, low), blood = makeBlood(scene);
  // The feeding shot reuses the Hollow's hand prop. Its usual blue emissive
  // spell material blooms to white during lightning flashes.
  for (const { piece } of monster.arms) {
    piece.material.dispose();
    piece.material = new THREE.MeshBasicMaterial({ color: 0x790b16, toneMapped: false });
  }
  const bloodPhysics = createBloodPhysics(scene, low), bloodOrigin = new THREE.Vector3();
  const wound = mesh(new THREE.SphereGeometry(.16, 9, 6), material(0x59111b, .35), scene, .15, .28, 5.2);
  wound.scale.set(.9, .13, 1.2); wound.visible = false;
  const boltPoints = [];
  const boltPath = [[-4, 25, 0], [-5.2, 21, 0], [-4.4, 20.2, 0], [-6.2, 16.8, 0], [-5.3, 17.2, 0], [-7.8, 12, 0]];
  for (let i = 0; i < boltPath.length - 1; i++) boltPoints.push(...boltPath[i], ...boltPath[i + 1]);
  boltPoints.push(-5.2, 21, 0, -8, 19.3, 0, -8, 19.3, 0, -9.2, 16.7, 0);
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute("position", new THREE.Float32BufferAttribute(boltPoints, 3));
  const bolt = new THREE.LineSegments(boltGeo, new THREE.LineBasicMaterial({ color: 0xdceeff, fog: false, toneMapped: false }));
  scene.add(bolt);
  const rainCount = low ? 350 : 800, rainPositions = new Float32Array(rainCount * 6);
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9baec8, transparent: true, opacity: .24, depthWrite: false }));
  rain.frustumCulled = false; scene.add(rain);
  const random = mulberry32(871);
  const drops = Array.from({ length: rainCount }, () => [random() * 28 - 14, random() * 15, random() * 34 - 17]);
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .35, .5, .82); composer.addPass(bloom);
  const television = new ShaderPass(TelevisionShader); composer.addPass(television); const output = new OutputPass(); composer.addPass(output);
  const snow = createStaticNoise(); snow.update(0); television.uniforms.tNoise.value = snow.texture;
  const wind = new THREE.Vector3(.8, 0, .3), look = new THREE.Vector3();
  let stopped = false, started = false, finished = false, playPending = false, pageAway = false, eatingRequested = false, impactPlayed = false, raf = 0, last = performance.now(), ambienceTime = 0, lastBloodTime = 0;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h); composer.setSize(w, h); camera.aspect = w / h;
    // Keep the action in the visible space beside (or above) the menu.
    camera.setViewOffset(w, h, w > 720 ? -w * .17 : 0, w > 720 ? 0 : h * .18, w, h);
    camera.updateProjectionMatrix(); television.uniforms.resolution.value.set(w, h);
  }

  function pose(t, dt) {
    const running = t < 30, falling = ease((t - 30) / 1.7), killed = ease((t - 60.65) / .8);
    const crawlCycles = Math.max(0, (t - 34) / 5.25);
    const crawlStep = Math.floor(crawlCycles) + ease(crawlCycles % 1);
    const crawlProgress = clamp(crawlStep / 4.9);
    const crawl = ease((t - 33.2) / 1.3) * (1 - ease((t - 59.7) / .8));
    const phase = crawlCycles * Math.PI * 2;
    const pullL = ease((Math.sin(phase) + 1) * .5), pullR = ease((1 - Math.sin(phase)) * .5);
    const recoil = ease((t - 31.1) / .16) * (1 - ease((t - 31.55) / .8));
    const snag = ease((t - 29.95) / .25) * (1 - ease((t - 30.7) / .6));
    const flail = ease((t - 30) / .35);
    const z = running ? -90 + t * 3 : 1.9 * falling + 2.4 * crawlProgress;
    heroine.object.position.set(running ? Math.sin(t * .8) * .22 : mix(Math.sin(24) * .22, 0, falling) + Math.sin(t * 1.3) * .035 * crawl * (1 - killed), 0, z);
    heroine.object.rotation.y = running ? Math.sin(t * .8) * .045 : mix(Math.sin(24) * .045, -.07, falling);
    heroine.speed = running && started ? 4.8 : 0;
    heroine.update(t < 70 ? dt : 0, { skipHair: true });
    const b = heroine.bones;
    if (!running) {
      // The log catches her stride; the upper body pitches down, rebounds,
      // then repeated hand plants and knee pushes drag her away in short bursts.
      heroine.body.rotation.x = 1.5 * falling - .09 * recoil + .04 * crawl * Math.sin(phase);
      heroine.body.rotation.z = .08 * recoil + .11 * crawl * Math.sin(phase) + .18 * killed;
      heroine.body.position.y = .105 * falling + .055 * recoil + .025 * crawl * (.5 + .5 * Math.cos(phase));
      b.spine.rotation.x = -.2 * crawl + .035 * crawl * Math.sin(phase);
      b.chest.rotation.x = -.08 * crawl;
      b["upperArm.L"].rotation.x = mix(b["upperArm.L"].rotation.x, mix(mix(-1.15, -2.3, falling), -2.55 + .75 * pullL, crawl), flail);
      b["upperArm.R"].rotation.x = mix(b["upperArm.R"].rotation.x, mix(mix(-.8, -2.2, falling), -2.55 + .75 * pullR, crawl), flail);
      b["upperArm.L"].rotation.x = mix(b["upperArm.L"].rotation.x, -.2, killed);
      b["upperArm.R"].rotation.x = mix(b["upperArm.R"].rotation.x, .1, killed);
      b["upperArm.L"].rotation.z = mix(b["upperArm.L"].rotation.z, -.52 * (1 - killed), flail);
      b["upperArm.R"].rotation.z = mix(b["upperArm.R"].rotation.z, .5 * (1 - killed), flail);
      b["foreArm.L"].rotation.x = mix(b["foreArm.L"].rotation.x, mix(mix(-.55, 1.02, falling), .65 + .65 * pullL, crawl) * (1 - killed), flail);
      b["foreArm.R"].rotation.x = mix(b["foreArm.R"].rotation.x, mix(mix(-.7, 1.02, falling), .65 + .65 * pullR, crawl) * (1 - killed), flail);
      b["upLeg.L"].rotation.x = (-.6 * falling + .35 * pullR * crawl - .7 * snag) * (1 - killed);
      b["upLeg.R"].rotation.x = (-.45 * falling + .35 * pullL * crawl) * (1 - killed);
      b["leg.L"].rotation.x = (mix(1.2 * falling, .6 + .45 * pullL, crawl) + .45 * snag) * (1 - killed) + .48 * killed;
      b["leg.R"].rotation.x = mix(.95 * falling, .55 + .45 * pullR, crawl) * (1 - killed) + .2 * killed;
      b["foot.L"].rotation.x = -.35 * (1 - killed); b["foot.R"].rotation.x = -.3 * (1 - killed);
      b.head.rotation.y = mix(b.head.rotation.y, mix(-.55 + .18 * crawl * Math.sin(phase * .5), .6, killed), flail);
      b.head.rotation.x = -.12 * crawl * (1 - killed);
      b.neck.rotation.x = -.28 * (1 - killed) - .07 * crawl;
      if (killed > .8) for (const lid of heroine.headInfo.lids) lid.rotation.x = .9;
    } else if (started) {
      b.head.rotation.y = -.5 * ease(Math.sin(t * .65) * 2 - .1);
    }
    // The static hides the replacement; the same ground position holds the shot.
    const eaten = t >= 181;
    heroine.object.visible = !eaten;
    for (const h of heroine.hairs) if (h.mesh) h.mesh.visible = !eaten;
    skeleton.root.visible = eaten;
    if (eaten) {
      skeleton.root.position.copy(heroine.object.position);
      skeleton.root.rotation.y = heroine.object.rotation.y;
      skeleton.body.position.set(0, .1, 0);
      // Keep the same forward fall: the skull faces the mud and the spine stays visible above it.
      skeleton.body.rotation.set(heroine.body.rotation.x, 0, heroine.body.rotation.z);
      skeleton.body.scale.setScalar(heroine.scale);
    }
    monster.root.visible = t > 33;
    const departure = ease((t - 180) / 14);
    const feeding = ease((t - 65) / 5) * (1 - departure);
    const cycle = Math.max(0, t - 70) % 6.4 / 6.4;
    const liftFood = ease((cycle - .18) / .24) * (1 - ease((cycle - .76) / .22));
    const chew = Math.sin(t * 9) * .018 * liftFood;
    const approach = ease((t - 33) / 27);
    const rootZ = mix(-18, 3.35, approach) + feeding * .75 + departure * 55;
    const gait = rootZ / 1.25 * Math.PI * 2;
    const walking = Math.max((1 - ease((t - 58) / 2)) * (1 - feeding), ease((t - 180) / 1.5) * (1 - ease((t - 210) / 3)));
    // Lift each foot in sequence as it clears the fallen log at z = .75.
    const leadLift = t < 60 ? Math.sin(Math.PI * clamp((rootZ + .65) / 1.65)) : 0;
    const trailLift = t < 60 ? Math.sin(Math.PI * clamp((rootZ - .05) / 1.65)) : 0;
    monster.root.position.set(mix(-.3, -.45, feeding) + (trailLift - leadLift) * .055,
      Math.abs(Math.sin(gait)) * .05 * walking + Math.max(leadLift, trailLift) * .08, rootZ);
    monster.root.rotation.y = 0;
    const attackLean = .22 + Math.sin(t * 1.7) * .03 + .43 * ease((t - 60) / .75) * (1 - ease((t - 62) / 2));
    const lean = mix(attackLean, 1.05 + Math.sin(cycle * Math.PI * 2) * .04 + chew, feeding);
    // Bend at the hips: the pelvis sinks into a crouch while the legs stay planted.
    const hipY = 1.3 - .7 * feeding;
    monster.body.rotation.x = lean;
    monster.body.position.set(0, hipY - 1.3 * Math.cos(lean), -1.3 * Math.sin(lean));
    for (const { hip, knee, side } of monster.legs) {
      hip.visible = feeding < .2;
      const step = Math.sin(gait + (side > 0 ? 0 : Math.PI));
      const lift = side > 0 ? leadLift : trailLift;
      hip.position.y = 1.3 + lift * .12;
      hip.rotation.x = -step * .32 * walking - lift * .72;
      knee.rotation.x = Math.max(0, Math.cos(gait + (side > 0 ? 0 : Math.PI))) * .45 * walking + lift * 1.2;
    }
    // Sudden, wrong little twitches of the head.
    const tick = Math.floor(t * 2.6), twitch = Math.sin(tick * 91.7) > .55 ? Math.sin(tick * 37.3) : 0;
    monster.head.rotation.set(feeding * (.1 + chew * 2) - .25 * (1 - feeding), 0, twitch * .28 * (1 - feeding));
    monster.head.position.y = 2.75 - feeding * .05 + chew;
    monster.jaw.rotation.x = .5 + Math.abs(chew) * 12 + .25 * ease((t - 59.5) / .6) * (1 - ease((t - 62) / 1));
    monster.knees.visible = feeding > .2;
    monster.cloak.rotation.z = Math.sin(t * 1.3) * .02;
    monster.cloak.rotation.x = Math.sin(t * .9) * .03 - .04 * walking;
    for (const { arm, elbow, side } of monster.arms) {
      arm.rotation.x = -lean * .75 + Math.sin(gait + (side > 0 ? Math.PI : 0)) * .22 * walking + Math.sin(t * 2.7 + side) * .05; arm.rotation.z = side * .12; elbow.rotation.x = -.3;
      if (side === 1 && t >= 59) {
        const lift = ease((t - 59) / 1.5), strike = ease((t - 60.5) / .25), release = ease((t - 62) / 2);
        arm.rotation.x = mix(-2.8 * lift + strike * 1.7, -.18, release);
        elbow.rotation.x = mix(-.6 * lift, -.15, strike);
      }
    }
    monster.root.updateMatrixWorld(true);
    if (feeding > 0) {
      const mouth = monster.head.localToWorld(new THREE.Vector3(.03, -.14, .27));
      for (const limb of monster.arms) {
        const target = limb.side === 1
          ? new THREE.Vector3(.18, .29, 5.28).lerp(mouth, liftFood)
          : new THREE.Vector3(-.8, .13, 5.12);
        reachArm(limb, monster.body.worldToLocal(target), feeding);
        limb.piece.visible = limb.side === 1 && feeding > .95 && cycle > .18 && cycle < .79;
        limb.piece.scale.y = 1.3 * (1 - .65 * ease((cycle - .48) / .28));
      }
    }
    monster.root.updateMatrixWorld(true);
    blood.visible = t > 61.2;
    wound.visible = blood.visible;
    const spread = ease((t - 61.2) / 47);
    blood.scale.set(.06 + spread * .85 + feeding * .12, .025 + spread * .58 + feeding * .08, 1);
    const bloodDt = Math.max(0, Math.min(.05, t - lastBloodTime)); lastBloodTime = t;
    if (blood.visible && !finished) {
      const right = monster.arms.find((limb) => limb.side === 1);
      bloodOrigin.set(.23, .35, 5.28);
      if (right.piece.visible) right.hand.getWorldPosition(bloodOrigin);
      bloodPhysics.update(bloodDt, bloodOrigin, t < 180 ? (right.piece.visible ? 13 : 5) : 0, t < 180 && right.piece.visible && cycle < .43 ? .8 : 0);
    }

    if (t < 30) {
      // A low tracking shot slowly closes in as she reaches the fallen branch.
      const close = ease(t / 30);
      camera.position.set(mix(3.7, 2.3, close) + Math.sin(t * .18) * .25, mix(1.45, 1.05, close), z - mix(6.4, 4.8, close));
      look.set(0, 1.12, z + .65);
    } else if (t < 34) {
      const u = ease((t - 30) / 4);
      camera.position.set(mix(2.3, 4.5, u), mix(1.05, 1.7, u), mix(-4.8, -5.3, u)); look.set(0, mix(1.12, .45, u), z + .8);
      camera.position.x += Math.sin(t * 28) * .07 * recoil;
      camera.position.y += Math.sin(t * 24) * .04 * recoil;
    } else if (t < 67) {
      // Stay behind the pursuer; no reverse shot or facial reveal.
      const u = ease((t - 34) / 26);
      camera.position.set(mix(4.5, 2.6, u), mix(1.7, 2.5, u), mix(-22, -2.8, u)); look.set(0, .8, z + .5);
    } else {
      const u = ease((t - 67) / 16);
      camera.position.set(mix(2.6, 2.4, u), mix(2.5, 2.7, u), mix(-2.8, -.6, u));
      look.set(0, .45, 5.1);
      // Hold on the body while the creature recedes into the woods.
    }
    if (started && t < 30) { camera.position.y += Math.sin(t * 10) * .022; camera.position.x += Math.sin(t * 7) * .012; }
    camera.lookAt(look);
    moon.position.set(-9, 14, z + 7); moon.target.position.set(0, 0, z); fill.position.set(2, 3, z - 2);
    const mp = monster.root.position;
    stalkerLight.position.set(mp.x + 1.6, 3.6, mp.z - 2.4); stalkerLight.target.position.set(mp.x, 1.6, mp.z + .4);
    stalkerLight.intensity = monster.root.visible ? 30 : 0;
    heroine.object.updateMatrixWorld(true);
    if (t < 70) for (const h of heroine.hairs) h.update(dt, camera, wind, true, .015);
  }

  function render(now) {
    if (stopped) return;
    raf = requestAnimationFrame(render);
    if (now - last < 1000 / (finished ? 18 : low ? 30 : 60) - 2) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now; ambienceTime += dt;
    const duration = Number.isFinite(music.duration) ? music.duration : SONG_DURATION;
    const t = finished ? duration : music.currentTime;
    pose(t, dt);
    if (started && !impactPlayed && t >= 60.7 && t < 62) {
      impactPlayed = true;
      strikeSound.play().catch(() => {});
    }
    wind.set(.8 + Math.sin(ambienceTime * .32) * .28, 0, .3 + Math.sin(ambienceTime * .19) * .18);
    forest.grass.animate(ambienceTime, wind, 1);
    for (const f of forest.fog) f.position.x = f.userData.x + Math.sin(ambienceTime * .07 + f.userData.phase) * 2;
    for (let i = 0; i < rainCount; i++) {
      const d = drops[i], y = ((d[1] - ambienceTime * 12) % 15 + 15) % 15;
      const x = d[0] + heroine.object.position.x, z = d[2] + heroine.object.position.z;
      rainPositions.set([x, y, z, x + .055, y + .45, z + .02], i * 6);
    }
    rainGeo.attributes.position.needsUpdate = true;
    let flashAmount = 0, exposure = 1;
    for (const at of lightningTimes) {
      const age = t - at;
      if (age >= 0 && age < .12) flashAmount = Math.sin(age / .12 * Math.PI);
      if (age >= .12 && age < .55) exposure = 0;
      else if (age >= .55 && age < 2.65) exposure = Math.min(exposure, ease((age - .55) / 2.1));
    }
    flash.intensity = flashAmount * 11;
    bolt.visible = flashAmount > .1; bolt.position.z = heroine.object.position.z + 24;
    if (t >= 120) snow.update(ambienceTime);
    // Picture damage swells toward the three-minute mark, then unwinds while
    // the creature rises and walks away, leaving the title scene clear.
    television.uniforms.damage.value = ease((t - 120) / 60) * (1 - ease((t - 180) / 14));
    television.uniforms.exposure.value = exposure; television.uniforms.time.value = ambienceTime;
    // A brief full-screen burst conceals the body-to-skeleton cut at 3:01.
    television.uniforms.signalLoss.value = ease((t - 178.8) / 1.2) * (1 - ease((t - 181.2) / 1.4));
    const wantsEatingSound = started && !finished && !document.hidden && !pageAway && t >= 70 && t < 180;
    if (wantsEatingSound && eatingSound.paused && !eatingRequested) {
      eatingRequested = true;
      eatingSound.play().catch(() => { eatingRequested = false; });
    } else if (!wantsEatingSound) {
      eatingSound.pause(); eatingRequested = false;
      if (t >= 180) eatingSound.currentTime = 0;
    }
    composer.render();
  }

  async function playMusic() {
    if (stopped || finished || started || playPending || document.hidden || pageAway || title.classList.contains("hidden")) return;
    playPending = true;
    try {
      await music.play();
      if (stopped) { music.pause(); return; }
      started = true; soundButton.classList.add("hidden");
      // play() can resolve after the page has become hidden.
      if (document.hidden || pageAway) music.pause();
    } catch (error) {
      if (!stopped) {
        soundButton.classList.remove("hidden");
        if (error.name !== "NotAllowedError") { soundButton.textContent = "Retry title music"; console.warn("Title music could not play", error); }
      }
    } finally { playPending = false; }
  }
  function gesture(event) {
    if (event.target.closest?.("#newChar, .cont, #cBack")) return;
    if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
    playMusic();
  }
  function onEnded() {
    if (stopped) return;
    finished = true;
    soundButton.classList.add("hidden");
  }
  function visibility() {
    if (document.hidden || pageAway) {
      music.pause(); eatingSound.pause(); strikeSound.pause(); eatingRequested = false;
      cancelAnimationFrame(raf); raf = 0;
    }
    else if (!stopped) {
      last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(render);
      if (started && !finished) music.play().catch(() => {
        if (!stopped && !document.hidden && !pageAway) { started = false; soundButton.classList.remove("hidden"); }
      });
      else if (!started && !finished) playMusic();
    }
  }
  function pageHide() { pageAway = true; visibility(); }
  function pageShow() { pageAway = false; visibility(); }
  function stop() {
    if (stopped) return;
    stopped = true; music.pause(); music.removeAttribute("src"); music.load(); eatingSound.pause(); eatingSound.removeAttribute("src"); eatingSound.load(); strikeSound.pause(); strikeSound.removeAttribute("src"); strikeSound.load(); cancelAnimationFrame(raf);
    observer.disconnect(); removeEventListener("resize", resize); document.removeEventListener("visibilitychange", visibility);
    removeEventListener("pagehide", pageHide); removeEventListener("pageshow", pageShow);
    title.removeEventListener("pointerdown", gesture); title.removeEventListener("keydown", gesture); soundButton.removeEventListener("click", playMusic);
    music.removeEventListener("ended", onEnded);
    const sharedBody = heroine.mesh.geometry;
    const geometries = new Set(), materials = new Set();
    scene.traverse((o) => { if (o.geometry && o.geometry !== sharedBody) geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) materials.add(m); });
    heroine.dispose();
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); forest.fogTexture.dispose(); snow.dispose();
    television.dispose(); bloom.dispose(); output.dispose(); forest.textures.forEach((x) => x.dispose()); monster.textures.forEach((x) => x.dispose()); composer.dispose(); renderer.dispose();
    stage.remove(); soundButton.remove(); title.classList.remove("title-film");
  }
  const observer = new MutationObserver(() => { if (title.classList.contains("hidden")) stop(); });
  observer.observe(title, { attributes: true, attributeFilter: ["class"] });
  title.addEventListener("pointerdown", gesture); title.addEventListener("keydown", gesture); soundButton.addEventListener("click", playMusic);
  music.addEventListener("ended", onEnded); document.addEventListener("visibilitychange", visibility);
  addEventListener("pagehide", pageHide); addEventListener("pageshow", pageShow); addEventListener("resize", resize);
  resize(); raf = requestAnimationFrame(render);
  // Best effort for browsers that already permit media; otherwise the title's
  // first tap (or the music button) unlocks the same one-shot media timeline.
  playMusic();
  return { stop };
}
