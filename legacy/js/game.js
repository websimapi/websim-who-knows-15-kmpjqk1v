// The playable Act I: renderer + moving day/night sky, seeded overworld with
// Marrowgate, third-person control, combat, NPC dialogue, quests, morality,
// companions, citizens, HUD, saving, the Sunken Mile and the Mire Warden.
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { TIERS, autoTier, autoGrassProfile } from "./quality.js";
import { World, HALF } from "./world.js";
import { Character } from "./character.js";
import { Combat, Actor, playerStats } from "./combat.js";
import { DiceOverlay, RollHold, d20Check, describe } from "./dice.js";
import { Dialogue } from "./dialogue.js";
import { DialogueCache } from "./dialogue-cache.js";
import { QuestJournal } from "./quests.js";
import { Morality } from "./morality.js";
import { AudioSys } from "./audio.js";
import { speakText, stopSpeech } from "./speech.js";
import { Social } from "./social.js";
import { NPCS, QUEST_TEXT, CLASSES, ABILITIES, ANCESTRIES, BACKGROUNDS, XP_TABLE, mod, profBonus } from "./data.js";
import { CITIZEN_NPCS } from "./citizens.js";
import { CAVES } from "./caves.js";
import { HorseSystem } from "./horses.js";
import { WildlifeSystem } from "./wildlife.js";
import { CorpseSystem } from "./corpses.js";
import { FeedingFX } from "./feeding-fx.js";
import { WandSystem } from "./wands.js";
import { GroundItems } from "./ground-items.js";
import { CityInteriors } from "./city-interiors.js";
import { cityLineClear, cityPointClear, cityRoute } from "./city-nav.js";
import { equipmentLook, equipmentBonus, migrateShieldEquipment } from "./equipment.js";
import { ITEMS, STARTER, STARTER_EQUIPMENT } from "./items.js";
import { celestialState, nightFog, smoothstep, LUNAR_DAYS } from "./celestial.js";
import { SWIM_DEPTH, SWIM_RECOVERY, swimCapacity, swimDrain, nearestShore } from "./swimming.js";
import { relocateState } from "./realm-transfer.js";

const $ = (s) => document.querySelector(s);
const V = () => new THREE.Vector3();
const TMP = V(), TMP2 = V();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SKY_COLORS = {
  hemi: new THREE.Color(0xb9d0f0), ground: new THREE.Color(0x65594c),
  moon: new THREE.Color(0xc4d4ed), moonTint: new THREE.Color(0xf0eadb),
  dayFog: new THREE.Color(0xaab9c2), duskFog: new THREE.Color(0xc9876a),
  wetFog: new THREE.Color(0x24333c),
};
const PHASE_NAMES = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"];

const MAIN_ORDER = ["wake", "marrowgate", "brightwell", "gallowmere", "choice", "sunken", "done"];

export class Game {
  constructor({ data, saveId, saves, onQuit, getCoopProfiles, createCoopProfile, importCoopProfile }) {
    this.data = data;
    this.onlineMode = !!data.online;
    this.saveId = saveId;
    this.saves = saves;
    this.onQuit = onQuit;
    this.getCoopProfiles = getCoopProfiles;
    this.createCoopProfile = createCoopProfile;
    this.importCoopProfile = importCoopProfile;
    this.sheet = data.char;
    const s = data.state || {};
    this.state = {
      main: s.main || "wake",
      gold: s.gold ?? 25,
      fortune: s.fortune ?? 1,
      hasMedicine: s.hasMedicine || false,
      cleared: s.cleared || {},
      lit: s.lit || [],
      quests: s.quests || {},
      generatedQuests: s.generatedQuests || {},
      skillBindings: s.skillBindings || {},
      skillBindingsP2: s.skillBindingsP2 || {},
      skills: { ...(s.skills || {}), alchemy: !!(s.skills?.alchemy || s.quests?.alchemy === "done") },
      alchemyFresh: s.alchemyFresh || {},
      alchemySkipFailed: !!s.alchemySkipFailed,
      companions: s.companions || [],
      talked: s.talked || {},
      respawn: s.respawn || null,
      inv: s.inv || null,
      equipment: s.equipment || { hideHelmet: false },
      equipmentInitialized: !!s.equipmentInitialized,
      shieldEquipmentInitialized: !!s.shieldEquipmentInitialized,
      gathered: s.gathered || [],
      groundItems: s.groundItems || [],
      npcMemory: s.npcMemory || {},
      campParley: s.campParley || "open",
      campIntroSeen: !!s.campIntroSeen,
      knowsOrrinPlot: !!s.knowsOrrinPlot,
      caveSupplies: s.caveSupplies || {},
      caveClues: s.caveClues || {},
      caveOutcomes: s.caveOutcomes || {},
      caveParleySeen: s.caveParleySeen || {},
      torchLit: !!s.torchLit,
      horses: s.horses || {},
      pets: s.pets || {},
      day: s.day || 0,
      worldEpochMs: s.worldEpochMs || null,
      hollowLoot: s.hollowLoot || {},
      hollowDungeonChecks: s.hollowDungeonChecks || {},
      hollowSpawned: s.hollowSpawned || {},
      corpses: s.corpses || {},
      wands: s.wands || [],
      equippedWandId: s.equippedWandId || null,
      cityHouses: s.cityHouses || {},
      activeHouse: s.activeHouse || null,
      activeHouse2: s.activeHouse2 || null,
      deadNpcs: s.deadNpcs || {},
      swimStamina: Number.isFinite(s.swimStamina) ? s.swimStamina : null,
    };
    this.morality = new Morality(s.morality || {});
    this.paused = false;
    this.holdPause = false;
    this.menuOpen = false;
    this.keys = new Set();
    this.controllerSlots = new Map();
    this.controllerStates = new Map();
    this.controllerNavAt = new Map();
    this.localPlayer2 = null;
    this.camYaw = Math.PI;
    this.camPitch = 0.42;
    this.camDist = 9;
    this.camPos = V();
    this.camLook = V();
    this.dialogueSpeaker = "npc";
    this.plates = new Map();
    this.citizens = [];
    this.lampLights = [];
    this.saveT = 0;
    this.stepT = 0;
    this.horseDriveSpeed = 0;
    this.horse2DriveSpeed = 0;
    this.inDungeon = false;
    this.gateArmed = true;
    this.gateIntroPlaying = false;
    this.lastRegion = "";
  }

  // ---------- boot ----------
  async start() {
    $("#loading").classList.remove("hidden");
    $("#loadingText").textContent = "Raising Marrowgate…";
    await new Promise((r) => setTimeout(r, 40));
    const tierName = localStorage.getItem("ur.quality") || autoTier();
    this.tier = TIERS[tierName] || TIERS.medium;
    this.grassProfile = autoGrassProfile(this.tier.name);
    this.mobile = matchMedia("(pointer: coarse)").matches;
    document.body.classList.toggle("mobile-game", this.mobile);
    this.moveMode = localStorage.getItem("ur.mobileMove") || "tap";
    this.movePrompt = this.mobile && !localStorage.getItem("ur.mobileMove");

    this.setupRenderer();
    this.setupSky();
    $("#loadingText").textContent = "Laying the old roads…";
    await new Promise((r) => setTimeout(r, 20));
    this.social = new Social(this);
    this.wands = new WandSystem(this);
    let seed = this.data.seed || 1;
    if (this.social.online) {
      $("#loadingText").textContent = "Entering the realm…";
      const j = await this.social.connect();
      seed = j.realm.seed;
      $("#loadingText").textContent = "Laying the old roads…";
    }
    this.world = new World(seed, this.tier, this.scene, this.grassProfile);
    if (this.onlineMode) for (const door of this.world.cityDoors) if (door.property) {
      this.state.cityHouses[door.id] = { unlocked: false, welcomed: false, reported: false };
    }
    this.interiors = new CityInteriors(this);
    for (const house of this.social.housesSnapshot || []) this.interiors.onHouseUpdate(house);
    this.groundItems = new GroundItems(this, this.onlineMode ? this.social.groundSnapshot || [] : this.state.groundItems);
    this.state.lit.forEach((i) => this.world.setShrineLit(i, true));
    this.state.gathered.forEach((id) => this.world.setGathered(id));
    for (const it of this.world.interactables) if (this.state.caveSupplies[it.id]) { it.hidden = true; if (it.mesh) it.mesh.visible = false; }

    this.audio = new AudioSys({ feeding: true });
    this.audio.world = this.world;
    this.audio.init().then(() => this.audio.ambience(true)).catch(() => {});

    this.dice = new DiceOverlay($("#dice"), (v) => this.project(v), $("#combatDice"));
    this.hold = new RollHold($("#hold"), {
      getFortune: () => this.holdOwner === this.localPlayer2 && this.p2SaveId ? this.p2State.fortune ?? 1 : this.state.fortune,
      spendFortune: () => {
        const state = this.holdOwner === this.localPlayer2 && this.p2SaveId ? this.p2State : this.state;
        state.fortune = Math.max(0, (state.fortune ?? 1) - 1);
        this.renderFortune();
      },
      onPause: (p, owner) => {
        this.holdPause = p;
        if (p && owner) this.holdOwner = owner;
        if (!p) this.holdOwner = null;
        document.body.classList.toggle("hold-owner-p2", !!this.localPlayer2 && this.holdOwner === this.localPlayer2);
      },
      sfx: (n) => this.audio.ui(n, 0.5),
    });
    this.combat = new Combat({
      scene: this.scene, world: this.world, dice: this.dice, hold: this.hold, audio: this.audio,
      log: (t, c) => this.log(t, c),
      events: {
        hairGuides: () => (this.tier.name === "high" ? 70 : this.tier.name === "medium" ? 40 : 18),
        onKill: (t, source) => this.onKill(t, source),
        onDowned: (t) => {
          if (!t.player) return;
          t.feedingHollow = t.lastAttacker?.nightHunter && !t.lastAttacker.dead ? t.lastAttacker
            : this.combat.actors.filter(a => a.nightHunter && a.alive && a.pos.distanceTo(t.pos) < 12)
              .sort((a, b) => a.pos.distanceToSquared(t.pos) - b.pos.distanceToSquared(t.pos))[0] || null;
          this.toast("You are down", t.feedingHollow ? "The Hollow is closing in · death checks every 4s" : "Death checks every 4s · companions can help");
        },
        onDefeat: (t) => this.onDefeat(t),
        onSurrender: (t) => this.toast(`${t.name} surrenders`, this.mobile ? "Walk up and tap Spare or Finish" : "Walk up · E to spare · X to finish"),
        onHeal: () => {},
        onParleyBroken: () => this.makeGallowmereHostile(),
        onHollowThrow: (actor) => this.corpses?.throwWeapon(actor),
        isPlayer2: (actor) => !!actor && actor === this.localPlayer2,
        nearestCorpse: (hunter, range) => this.corpses?.nearestEdible(hunter, range),
        devourCorpse: (record, hunter) => this.corpses?.devour(record, hunter),
        prepareHollowPrey: (hunter) => this.wildlife?.offerToHollow(hunter),
      },
    });

    this.spawnPlayer();
    this.wands.restore();
    this.feedingFX = new FeedingFX(this.scene);
    this.torchLight = new THREE.PointLight(0xffa750, 0, 20, 1.8);
    this.scene.add(this.torchLight);
    this.spawnNPCs();
    this.spawnCompanions();
    this.spawnEnemies();
    this.spawnCityGuards();
    this.corpses = new CorpseSystem(this, this.social.corpsesSnapshot || []);
    this.spawnCitizens();
    this.setupDialogue();
    this.horses = new HorseSystem(this, this.social.horsesSnapshot);
    this.wildlife = new WildlifeSystem(this, this.social.petsSnapshot);
    if (!this.onlineMode) this.importCompanions(this.data, "local", false);
    this.setupInput();
    this.setupHUD();
    this.social.setup();

    // start position
    // a fresh Act I begins inside Marrowgate's south gate, safe from the road's rats
    const p = this.data.pos;
    if (!p && this.state.main === "wake") this.state.main = "marrowgate";
    let sp = this.data.arrivalPortal ? this.world.spots.realmPortal : p ? p : this.world.spots.respawn;
    if (this.social.net) sp = this.social.joinPos || this.world.spots.respawn; // realms keep their own position
    this.teleport(sp.x, sp.z);
    if (this.state.activeHouse) {
      const door = this.world.cityDoors.find((d) => d.id === this.state.activeHouse);
      if (door?.property && this.onlineMode) {
        this.teleport(door.pos.x + door.nx * .8, door.pos.z + door.nz * .8);
        this.player._teleport = true;
        this.state.activeHouse = null;
      } else if (door) this.interiors.enter(door, true);
      else this.state.activeHouse = null;
    }
    if (this.world.inDungeon(sp.x, sp.z)) this.setDungeon(true);
    this.updateTorch();
    if (this.data.arrivalPortal) { this.data.arrivalPortal = false; this.toast("Marrowgate", "Arrived through the realm portal"); }
    if (!p && !this.data.onlineOrigin) { this.player.model.play("kneel"); setTimeout(() => this.player.model.play("stand"), 1400); }
    this.snapCamera();

    $("#loading").classList.add("hidden");
    $("#hud").classList.remove("hidden");
    if (this.mobile) $("#touch").classList.remove("hidden");
    $("#pausedTag").textContent = this.mobile ? "PAUSED" : "PAUSED · Space to resume";
    $("#chatIn").placeholder = this.mobile ? "Say something" : "Say something · Enter to send";
    this.setMoveMode(this.moveMode);
    if (this.movePrompt) {
      $("#moveChoice").classList.remove("hidden");
    }
    this.clock = new THREE.Clock();
    this.grassPerf = { last: 0, windowStart: performance.now(), sum: 0, samples: 0, changed: performance.now() };
    this.running = true;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    if (this.social.net) {
      const R = this.social.realm;
      this.toast(R.name, R.owner ? "Your realm · you are the host" : R.host ? `Hosted by @${R.host}` : "Everyone's world");
      this.log(this.mobile ? "Hold a character for actions · tap Pack for items" : "Right-click players, townsfolk or yourself for actions · I opens your pack · Enter to chat", "crit");
    } else if (!p) {
      this.toast("Marrowgate", "Act I · Bitter Medicine");
      this.lastRegion = "Marrowgate";
      setTimeout(() => this.log(this.mobile ? "Tap people and objects to interact · tap plants to collect · drag to look" : "WASD to move · drag to look · 1–4 abilities · E interact · Space pauses · right-click for actions · I pack", "crit"), 1600);
    }
    if (this.movePrompt) {
      speakText("Choose how to move: tap to move, or use the analog stick.");
    }
    this.save();
  }

  setupRenderer() {
    const t = this.tier;
    this.renderScale = 1;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: t.antialias, powerPreference: "high-performance" }));
    r.setPixelRatio(t.pixelRatio);
    r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.72;
    r.shadowMap.enabled = true;
    r.shadowMap.type = t.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    $("#view").innerHTML = "";
    $("#view").append(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2400);
    if (t.bloom) {
      this.safeComposer = !r.extensions.has("EXT_color_buffer_float");
      this.createComposer(this.safeComposer);
    }
    this.onResize = () => {
      r.setSize(innerWidth, innerHeight);
      this.composer?.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      if (this.camera2) this.camera2.updateProjectionMatrix();
    };
    addEventListener("resize", this.onResize);
  }

  createComposer(safe) {
    this.composer?.dispose();
    this.bloom?.dispose();
    this.outputPass?.dispose();
    const type = safe ? THREE.UnsignedByteType : THREE.HalfFloatType;
    const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type, depthBuffer: true });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setPixelRatio(this.tier.pixelRatio * this.renderScale);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.5, 0.92);
    if (safe) {
      for (const rt of [this.bloom.renderTargetBright, ...this.bloom.renderTargetsHorizontal, ...this.bloom.renderTargetsVertical]) {
        rt.texture.type = THREE.UnsignedByteType;
      }
    }
    this.composer.addPass(this.bloom);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
    this.safeComposer = safe;
    // Check the replacement on its first completed frame so a bad target
    // cannot obscure the scene for another full polling interval.
    this._renderHealthTicks = safe && this._renderHealthChecks ? 179 : 0;
  }

  setRenderScale(scale) {
    this.renderScale = Math.round(scale * 100) / 100;
    const ratio = this.tier.pixelRatio * this.renderScale;
    this.renderer.setPixelRatio(ratio);
    this.composer?.setPixelRatio(ratio);
  }

  canvasIsBlack() {
    const gl = this.renderer.getContext();
    const { width, height } = this.renderer.domElement;
    const pixel = new Uint8Array(4);
    for (const [x, y] of [[0.25, 0.6], [0.5, 0.5], [0.75, 0.6]]) {
      gl.readPixels(Math.floor(width * x), Math.floor(height * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (pixel[0] + pixel[1] + pixel[2] > 2) return false;
    }
    return true;
  }

  checkRenderHealth() {
    if (!this.composer || this.inDungeon || this._renderHealthDisabled) return;
    this._renderHealthTicks = (this._renderHealthTicks || 0) + 1;
    if (this._renderHealthTicks < (this._renderHealthChecks ? 180 : 45)) return;
    this._renderHealthTicks = 0;
    this._renderHealthChecks = (this._renderHealthChecks || 0) + 1;
    if (!this.canvasIsBlack()) return;
    // Compare the same scene without postprocessing before changing the pipeline.
    this.renderer.render(this.scene, this.camera);
    if (this.canvasIsBlack()) return;
    if (!this.safeComposer) {
      console.warn("Postprocessing produced black tiles; using compatible bloom targets.");
      this.createComposer(true);
    } else {
      console.warn("Compatible bloom still produced black tiles; using direct HD rendering.");
      this.composer.dispose();
      this.bloom.dispose();
      this.outputPass.dispose();
      this.composer = null;
      this.bloom = null;
      this.outputPass = null;
    }
  }

  setupSky() {
    const sky = (this.sky = new Sky());
    sky.scale.setScalar(2000);
    const u = sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86;
    // Initial sun direction; the continuous celestial clock takes over before the first frame.
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 17), THREE.MathUtils.degToRad(215));
    u.sunPosition.value.copy(this.sunDir);
    this.scene.add(sky);
    // image-based lighting from the sky
    const pm = new THREE.PMREMGenerator(this.renderer);
    const skyScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(1000);
    Object.entries(u).forEach(([k, v]) => { sky2.material.uniforms[k].value = v.value?.clone ? v.value.clone() : v.value; });
    skyScene.add(sky2);
    this.envMap = pm.fromScene(skyScene, 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.32;
    this.fogColor = new THREE.Color(0xaab9c2);
    this.scene.fog = new THREE.Fog(this.fogColor, 80, this.tier.fogFar);

    const sun = (this.sun = new THREE.DirectionalLight(0xffc890, 2.3));
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.tier.shadowMap, this.tier.shadowMap);
    const R = this.tier.shadowRadius / 1.6;
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 260 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    this.scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0xa8c0ee, 0x4a3a2a, 0.45);
    this.scene.add(this.hemi);
    this.moonLight = new THREE.DirectionalLight(0x9db9e8, 0);
    // The Hollow has many small meshes; a second shadow pass caused spikes in night fights.
    this.moonLight.castShadow = false;
    this.moonLight.shadow.mapSize.set(this.tier.shadowMap > 1024 ? 1024 : this.tier.shadowMap, this.tier.shadowMap > 1024 ? 1024 : this.tier.shadowMap);
    Object.assign(this.moonLight.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 260 });
    this.moonLight.shadow.bias = -0.0005;
    this.scene.add(this.moonLight, this.moonLight.target);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(5, 48, 32), new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) }, phase: { value: 1 }, tint: { value: new THREE.Color(0xb8c9e7) } },
      vertexShader: `varying vec3 vNormal; varying vec2 vUv; void main(){ vNormal=normalize(normal); vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 sunDir; uniform float phase; uniform vec3 tint; varying vec3 vNormal; varying vec2 vUv; void main(){ vec3 n=normalize(vNormal); float light=max(dot(n,normalize(sunDir)),0.0); float limb=smoothstep(-.08,.16,n.z); float disc=light*(.38+.62*phase); float maria=sin(vUv.x*29.0+sin(vUv.y*17.0))*sin(vUv.y*23.0+vUv.x*7.0); float grain=sin(vUv.x*193.0)*sin(vUv.y*157.0); vec3 c=tint*(.012+disc*(.96+maria*.055+grain*.012)); gl_FragColor=vec4(c,limb*(.08+.92*phase)); }`,
      transparent: true, depthWrite: false, side: THREE.FrontSide,
    }));
    this.scene.add(this.moon);
    const starGeo = new THREE.BufferGeometry(), starPos = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      const y = Math.random() * 1.7 - .08, a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.max(.01, 1 - y * y));
      starPos[i * 3] = Math.cos(a) * r * 1000; starPos[i * 3 + 1] = y * 1000; starPos[i * 3 + 2] = Math.sin(a) * r * 1000;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xc9d9ff, size: 1.45, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
    this.scene.add(this.stars);
    this.worldEpochMs = this.onlineMode ? Date.UTC(2026, 0, 1) - 360000 : (this.state.worldEpochMs || Date.now() - 360000);
    if (!this.onlineMode) this.state.worldEpochMs = this.worldEpochMs;
    this.daylight = 1;
    this._nightEncounterT = 0;
  }

  updateCelestial(t) {
    const seconds = (Date.now() - this.worldEpochMs) / 1000;
    const sky = celestialState(seconds);
    const { cycle, sun, moon, daylight, darkness, sunlight, illumination, moonlight, lunar } = sky;
    this.sunDir.set(sun.x, sun.y, sun.z);
    this.daylight = daylight;
    const twilight = Math.exp(-Math.pow(sun.y / .15, 2));
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.turbidity.value = 6.4 - daylight * 2.4 + twilight * 2;
    u.rayleigh.value = 1.8 + daylight * .9 + twilight * .4;
    u.mieCoefficient.value = .0045 + twilight * .004;
    u.mieDirectionalG.value = .84;
    this.sun.color.setRGB(1, .7 + daylight * .18, .5 + daylight * .28);
    this.sun.intensity = this.inDungeon ? 0 : sunlight * 2.55;
    this.sun.castShadow = sunlight > .03 && !this.inDungeon;
    this.hemi.color.set(0x142039).lerp(SKY_COLORS.hemi, daylight);
    this.hemi.groundColor.set(0x090d15).lerp(SKY_COLORS.ground, daylight);
    this.hemi.intensity = this.inDungeon ? .1 : .018 + daylight * .41 + twilight * .035 + moonlight * .027;
    const moonDir = this._moonDir ||= new THREE.Vector3();
    moonDir.set(moon.x, moon.y, moon.z);
    const p = this.player.pos;
    this.moon.position.copy(p).addScaledVector(moonDir, 1100);
    this.moon.lookAt(this.camera?.position || p);
    this._moonInverse ||= new THREE.Quaternion();
    this.moon.material.uniforms.sunDir.value.copy(this.sunDir).applyQuaternion(this._moonInverse.copy(this.moon.quaternion).invert());
    this.moon.material.uniforms.phase.value = illumination;
    this.moon.material.uniforms.tint.value.set(0x8ea9d8).lerp(SKY_COLORS.moonTint, illumination);
    this.moon.visible = !this.inDungeon && moonDir.y > -.01;
    this.moonLight.position.copy(p).addScaledVector(moonDir, 90);
    this.moonLight.target.position.copy(p);
    this.moonLight.color.set(0x7e9bc9).lerp(SKY_COLORS.moon, illumination);
    this.moonLight.intensity = this.inDungeon ? 0 : moonlight * .24;
    this.stars.position.copy(p);
    this.stars.material.opacity = this.inDungeon ? 0 : darkness * (1 - moonlight * .28) * (.87 + Math.sin(t * .8) * .02);
    this.scene.environmentIntensity = this.inDungeon ? .035 : .014 + daylight * .27 + moonlight * .02;
    this.fogColor.set(0x0c1622).lerp(SKY_COLORS.dayFog, daylight).lerp(SKY_COLORS.duskFog, twilight * .36);
    this.updateOutdoorFog(seconds, sky, t);
    const moonIndex = Math.floor(lunar * 8) % 8;
    const period = Math.floor(lunar * LUNAR_DAYS) + 1;
    const hours = Math.floor(cycle * 24), minutes = Math.floor((cycle * 24 - hours) * 60);
    const timeLabel = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const night = sun.y < -Math.sin(12 * Math.PI / 180);
    const text = `${timeLabel} · ${night ? "Night" : twilight > .42 ? "Dusk / Dawn" : "Daylight"} · Day ${period}/30 · ${PHASE_NAMES[moonIndex]}`;
    if (this._clockText !== text) { this._clockText = text; const el = $("#worldClock"); if (el) el.textContent = text; }
    return { seconds, cycle, night, lunar, illumination };
  }

  updateOutdoorFog(seconds, sky, time) {
    if (this.inDungeon || !this.player) return;
    const p = this.player.pos, M = this.world.sites.marrowgate, B = this.world.sites.brightwell;
    const marrowEdge = Math.max(Math.abs(p.x - M.x), Math.abs(p.z - M.z)) - M.r;
    const brightwellEdge = Math.hypot(p.x - B.x, p.z - B.z) - B.r;
    const shelter = 1 - smoothstep(-8, 36, Math.min(marrowEdge, brightwellEdge));
    let riverDistance = Infinity;
    for (let i = 1; i < this.world.river.length; i++) {
      const [ax, az] = this.world.river[i - 1], [bx, bz] = this.world.river[i];
      const u = clamp(((p.x - ax) * (bx - ax) + (p.z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2), 0, 1);
      riverDistance = Math.min(riverDistance, Math.hypot(p.x - ax - u * (bx - ax), p.z - az - u * (bz - az)));
    }
    const fen = 1 - smoothstep(75, 150, Math.hypot(p.x - this.world.sites.sunken.x, p.z - this.world.sites.sunken.z));
    const moisture = clamp(.55 * (1 - smoothstep(18, 90, riverDistance)) + .35 * fen + .1 * (1 - smoothstep(5, 18, p.y)), 0, 1);
    const fogAmount = clamp(sky.darkness * nightFog(seconds, this.world.seed) * (1 - shelter * .9) * (.78 + moisture * .38), 0, 1);
    const dayFar = this.tier.fogFar;
    const clearNightFar = Math.min(dayFar, 310);
    const denseFar = clamp(112 - moisture * 44 - fogAmount * 24, 54, 112);
    const targetFar = THREE.MathUtils.lerp(THREE.MathUtils.lerp(dayFar, clearNightFar, sky.darkness), denseFar, fogAmount);
    const targetNear = THREE.MathUtils.lerp(THREE.MathUtils.lerp(80, 58, sky.darkness), 17 + (1 - moisture) * 13, fogAmount);
    const dt = clamp(time - (this._fogLastT ?? time - .016), .001, .08);
    this._fogLastT = time;
    this.scene.fog.near = THREE.MathUtils.damp(this.scene.fog.near, targetNear, 2.8, dt);
    this.scene.fog.far = THREE.MathUtils.damp(this.scene.fog.far, targetFar, 2.8, dt);
    this.scene.fog.color.copy(this.fogColor).lerp(SKY_COLORS.wetFog, fogAmount * .3);
    this.outdoorFogNear = this.scene.fog.near;
    this.outdoorFogFar = this.scene.fog.far;
  }

  setDungeon(on) {
    if (on && this.horses?.mounted) this.horses.dismount();
    this.inDungeon = on;
    const cave = on ? this.world.caveAt(this.player.pos.x) : null;
    const darkColor = cave?.id === "root" ? 0x07100b : cave?.id === "tide" ? 0x061016 : cave?.id === "glass" ? 0x160b08 : 0x07080a;
    this.sky.visible = !on;
    this.scene.environmentIntensity = on ? 0.06 : 0.32;
    this.sun.intensity = on ? 0 : 2.3;
    this.hemi.intensity = on ? 0.16 : 0.45;
    this.scene.fog.color.set(on ? darkColor : this.fogColor);
    this.scene.fog.near = on ? (this.state.torchLit ? 13 : 3) : (this.outdoorFogNear || 80);
    this.scene.fog.far = on ? (this.state.torchLit ? 45 : 17) : (this.outdoorFogFar || this.tier.fogFar);
    this.scene.background = on ? new THREE.Color(darkColor) : null;
    this.audio?.setAmbienceLevel(on ? 0.15 : 0.35);
    this.updateTorch();
  }

  isDeepWilderness(x, z) {
    if (this.world.inCity(x, z) || this.world.inDungeon(x, z)) return false;
    return ["marrowgate", "brightwell", "gallowmere"].every((key) => {
      const s = this.world.sites[key];
      return Math.hypot(x - s.x, z - s.z) > s.r + 105;
    });
  }
  spawnNightHollows(clockInfo) {
    const explorers = [!this.interiors?.active && this.player, !this.interiors2?.active && this.localPlayer2].filter(Boolean);
    if (!explorers.length || this.paused || this.menuOpen || (this.conversationActive() && !this.localPlayer2)) return;
    const focus = explorers.find(p => this.isDeepWilderness(p.pos.x, p.pos.z)) || explorers.find(p => this.world.inDungeon(p.pos.x, p.pos.z)) || explorers[0];
    const stolenIds = [...new Set([...Object.keys(this.state.hollowLoot || {}), ...(this.social.hollowLootIds || [])])];
    const hunterAlive = (id) => this.combat.actors.some((a) => a.spawn === id && a.nightHunter && !a.dead);
    const newHunterId = (base) => `${base}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    for (const id of stolenIds) {
      const stash = this.social.hollowGear?.[id] || this.state.hollowLoot?.[id];
      if (!Number.isFinite(stash?.$x) || !Number.isFinite(stash?.$z) || hunterAlive(id)) continue;
      const x = stash.$x, z = stash.$z;
      const nearby = explorers.find(p => Math.hypot(p.pos.x - x, p.pos.z - z) <= 95 && this.world.inDungeon(p.pos.x, p.pos.z) === this.world.inDungeon(x, z));
      if (!nearby) continue;
      const h = this.combat.spawnEnemy("hollow", new THREE.Vector3(x, this.world.surfaceHeightAt(x, z), z), { spawn: id, level: 5, nightHunter: true });
      this.corpses?.applyHollowGear(h, stash);
      h.home.copy(h.pos); h.aggro = true; h.target = nearby; h.roamRadius = 65;
      this.log("The Hollow carrying your lost gear is nearby.", "fail");
      return;
    }
    if (!clockInfo?.night) return;
    const unplaced = (id) => { const stash = this.social.hollowGear?.[id] || this.state.hollowLoot?.[id]; return !Number.isFinite(stash?.$x) || !Number.isFinite(stash?.$z); };
    if (this.world.inDungeon(focus.pos.x, focus.pos.z)) {
      const cave = this.world.caveAt(focus.pos.x), day = Math.floor(clockInfo.seconds / 1440), checkKey = `${day}-${cave?.id || "deep"}`;
      const base = `hollow-dungeon-${cave?.id || "deep"}`;
      const pendingId = stolenIds.find(id => unplaced(id) && (id === base || id.startsWith(`${base}-`)) && !hunterAlive(id));
      if (pendingId) this.state.hollowDungeonChecks[checkKey] = true;
      if (!pendingId) {
        if (this.state.hollowDungeonChecks[checkKey]) return;
        this.state.hollowDungeonChecks[checkKey] = true;
        if (Math.random() > .035) return;
      }
      const key = pendingId || newHunterId(base);
      const p = focus.pos, angle = Math.random() * Math.PI * 2;
      const x = p.x + Math.cos(angle) * 5, z = p.z + Math.sin(angle) * 5;
      const h = this.combat.spawnEnemy("hollow", new THREE.Vector3(x, this.world.surfaceHeightAt(x, z), z), { spawn: key, level: 4 + Math.floor(Math.random() * 4), nightHunter: true });
      this.corpses?.applyHollowGear(h, this.social.hollowGear?.[key]);
      h.home.copy(h.pos); h.aggro = true; h.target = focus; h.roamRadius = 20;
      this.log("A pale antlered shape unfolds from the cave dark.", "fail");
      return;
    }
    if (!this.isDeepWilderness(focus.pos.x, focus.pos.z)) return;
    const day = Math.floor(clockInfo.seconds / 1440);
    const base = "hollow-wilds";
    const pendingId = stolenIds.find(id => unplaced(id) && (id === base || id.startsWith(`${base}-`)) && !hunterAlive(id));
    const pending = !!pendingId;
    if (!pending && this.combat.actors.some((a) => a.spawn?.startsWith(base) && a.nightHunter && !a.dead)) return;
    if ((!pending && (this.state.hollowSpawned[day] || this._hollowSpawnDay === day)) || this._nightEncounterT > 0) return;
    this._nightEncounterT = 25;
    if (!pending && Math.random() > .12) { this._hollowSpawnDay = day; return; }
    const group = 1;
    let spawned = false;
    for (let i = 0; i < group; i++) {
      const angle = Math.random() * Math.PI * 2, distance = 55 + Math.random() * 24;
      let x = focus.pos.x + Math.cos(angle) * distance, z = focus.pos.z + Math.sin(angle) * distance;
      for (let attempt = 0; attempt < 10 && (!this.isDeepWilderness(x, z) || this.world.heightAt(x, z) < 1 || this.world.slopeAt(x, z) > .45); attempt++) {
        const a = Math.random() * Math.PI * 2, d = 55 + Math.random() * 30;
        x = focus.pos.x + Math.cos(a) * d; z = focus.pos.z + Math.sin(a) * d;
      }
      if (!this.isDeepWilderness(x, z) || this.world.heightAt(x, z) < 1 || this.world.slopeAt(x, z) > .45) continue;
      const level = 4 + Math.floor(Math.random() * 4);
      const key = i === 0 && pendingId ? pendingId : newHunterId(base);
      const h = this.combat.spawnEnemy("hollow", new THREE.Vector3(x, this.world.surfaceHeightAt(x, z), z), { spawn: key, level, nightHunter: true });
      this.corpses?.applyHollowGear(h, this.social.hollowGear?.[key]);
      h.home.copy(h.pos); h.aggro = false; h.target = null; h.roamRadius = 60;
      h.encounterDay = day;
      spawned = true;
      this.log("Something antlered moves beyond the lantern light.", "fail");
      this.audio.ui("horns", .35);
    }
    if (spawned) { this._hollowSpawnDay = day; this.state.hollowSpawned[day] = true; this.save(); }
  }
  updateTorch() {
    if (!this.torchLight) return;
    const lit = this.inDungeon && this.state.torchLit && (this.social?.inv.torch || 0) > 0;
    this.torchLight.intensity = lit ? 30 : 0;
    this.torchLight.distance = lit ? 22 : 0;
    const shade = $("#dungeonShade");
    shade?.classList.toggle("hidden", !this.inDungeon);
    shade?.classList.toggle("torch", !!lit);
    if (this.inDungeon) {
      this.scene.fog.near = lit ? 13 : 3;
      this.scene.fog.far = lit ? 45 : 17;
    }
  }
  toggleTorch() {
    if (!(this.social.inv.torch > 0)) { this.log("Craft a torch from dry wood and lamp oil first.", "fail"); return; }
    this.state.torchLit = !this.state.torchLit;
    this.updateTorch();
    this.social.renderInv();
    this.toast(this.state.torchLit ? "Torch lit" : "Torch out", this.state.torchLit ? "The darkness gives way" : "The dark closes in");
    this.save();
  }

  // ---------- actors ----------
  playerSheetStats(sheet = this.sheet, equipment = this.state.equipment) {
    const st = playerStats(sheet);
    st.guard += equipmentBonus(equipment, "armor", "guard") + equipmentBonus(equipment, "shield", "guard")
      + equipmentBonus(equipment, "helmet", "guard") - (CLASSES[sheet.class]?.shield || 0);
    st.weaponAttack = equipmentBonus(equipment, "weapon", "attack");
    if (this.state.caveOutcomes.glass === "vented") st.guard += 1;
    return st;
  }
  refreshEquipment() {
    if (!this.player) return;
    const stats = this.playerSheetStats();
    this.player.stats.guard = stats.guard;
    this.player.stats.weaponAttack = stats.weaponAttack;
    if (this.localPlayer2) {
      const second = this.playerSheetStats(this.localPlayer2.sheet, this.p2State?.equipment || this.state.equipment);
      this.localPlayer2.stats.guard = second.guard;
      this.localPlayer2.stats.weaponAttack = second.weaponAttack;
      this.localPlayer2.model.setLook(equipmentLook(this.localPlayer2.sheet.look, this.p2State?.equipment || this.state.equipment));
    }
    this.player.model.setLook(equipmentLook(this.sheet.look, this.state.equipment));
    this.social?.renderInv();
  }
  spawnPlayer() {
    const model = new Character(equipmentLook(this.sheet.look, this.state.equipment), { hairGuides: this.tier.name === "high" ? 160 : this.tier.name === "medium" ? 90 : 40 });
    const stats = this.playerSheetStats();
    const a = new Actor({ name: this.sheet.name, team: "party", kind: "player", model, pos: V(), stats, sheet: this.sheet });
    a.player = true;
    a.hp = this.data.hp ?? stats.maxHp;
    a.swimStamina = clamp(this.state.swimStamina ?? swimCapacity(this.sheet.attrs, this.sheet.level), 0, swimCapacity(this.sheet.attrs, this.sheet.level));
    this.player = this.combat.add(a);
    model.setMorality(this.morality.M, true);
  }
  teleport(x, z, p = this.player) {
    if (!p) return;
    p.pos.set(x, this.world.heightAt(x, z), z);
    p.swimming = false; p.model.swimMode = null;
    if (p === this.player) for (const c of this.combat.actors) if (c.companion) c.pos.set(x + (Math.random() - 0.5) * 3, this.world.heightAt(x, z), z - 2);
  }
  spawnNPCs() {
    this.npcs = {};
    for (const [key, card] of Object.entries(NPCS)) {
      if (this.state.companions.includes(key) || this.state.deadNpcs[key]) continue;
      const sp = this.world.spots[card.spot];
      if (!sp) continue;
      const model = new Character({ ancestry: card.ancestry, ...card.look }, { hairGuides: this.tier.name === "low" ? 16 : 40 });
      const a = new Actor({ name: card.name, team: "npc", kind: "npc", model, pos: new THREE.Vector3(sp.x, this.world.heightAt(sp.x, sp.z), sp.z), stats: { maxHp: 20, guard: 12, reflex: 12, fortitude: 12, resolve: 12, abilities: [], speed: 3, resource: { cur: 0 } } });
      for (let n = 0; n < 4; n++) this.world.col.resolve(a.pos, a.radius);
      if (card.city === "marrowgate" && !cityPointClear(this.world, a.pos.x, a.pos.z, a.radius)) {
        let found = false;
        for (let radius = .8; radius <= 5 && !found; radius += .8) for (let i = 0; i < 16; i++) {
          const angle = i * Math.PI / 8, x = sp.x + Math.cos(angle) * radius, z = sp.z + Math.sin(angle) * radius;
          if (cityPointClear(this.world, x, z, a.radius)) { a.pos.x = x; a.pos.z = z; found = true; break; }
        }
      }
      a.pos.y = this.world.heightAt(a.pos.x, a.pos.z);
      a.npc = key;
      a.yaw = sp.face ?? 0;
      if (key === "bram") a.model.play("kneel");
      this.combat.add(a);
      this.npcs[key] = a;
    }
  }
  companionActor(key) {
    const card = NPCS[key];
    const C = CLASSES[card.companion];
    const sheet = { name: card.name, class: card.companion, level: this.sheet.level || 1, attrs: { ...C.preset } };
    const model = new Character({ ancestry: card.ancestry, cls: card.companion, ...card.look, weapon: C.weapon }, { hairGuides: this.tier.name === "low" ? 20 : 60 });
    const a = new Actor({ name: card.name.split(" ")[0], team: "party", kind: "companion", model, pos: this.player.pos.clone().add(new THREE.Vector3(1.5, 0, -1.5)), stats: playerStats(sheet), sheet, companion: key });
    a.slot = this.state.companions.indexOf(key);
    return a;
  }
  spawnCompanions() { for (const k of this.state.companions) this.combat.add(this.companionActor(k)); }
  spawnEnemies() {
    for (const s of this.world.spawns) {
      if (this.state.cleared[s.id]) continue;
      if (s.cave && this.state.caveOutcomes[s.cave]) continue;
      if (s.quest === "wolves" && this.state.quests.wolves !== "open" && this.state.main === "wake") { /* the pack still prowls */ }
      for (let i = 0; i < s.n; i++) {
        const a = (i / Math.max(1, s.n)) * Math.PI * 2;
        const x = s.pos[0] + Math.cos(a) * s.radius, z = s.pos[1] + Math.sin(a) * s.radius;
        const uniq = s.unique ? ["swift", "stoneskin", "ember", "frenzied"][Math.floor(Math.random() * 4)] : null;
        const e = this.combat.spawnEnemy(s.kind, new THREE.Vector3(x, this.world.heightAt(x, z), z), { spawn: s.id, champion: s.champion, unique: uniq });
        e.spawnDef = s;
        if (s.cave && s.boss) { e.caveBoss = s.cave; e.parleyNeutral = true; }
        if (s.roamRadius) {
          this.world.col.resolve(e.pos, e.radius);
          e.pos.y = this.world.surfaceHeightAt(e.pos.x, e.pos.z);
          e.home.copy(e.pos);
        }
        if (s.id.startsWith("gm_")) e.parleyNeutral = this.state.campParley !== "hostile";
        if (s.talkable && i === 0) {
          e.dialogueNpc = "bandit_captain";
          const G = this.world.sites.gallowmere;
          e.pos.set(G.x + G.r - 7, this.world.heightAt(G.x + G.r - 7, G.z + 5), G.z + 5);
          e.home.copy(e.pos);
          e.model.object.position.copy(e.pos);
        }
      }
    }
    if (this.state.caveOutcomes.root === "tamed") this.addRootAlly();
  }
  spawnCityGuards() {
    for (const [city, count] of [["marrowgate", 8], ["brightwell", 5]]) {
      const site = this.world.sites[city];
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count;
        const radius = city === "marrowgate" ? site.r - 8 : site.r * .65;
        const spot = { x: site.x + Math.cos(angle) * radius, z: site.z + Math.sin(angle) * radius };
        for (let n = 0; n < 5; n++) this.world.col.resolve(spot, .55);
        if (city === "marrowgate" && !cityPointClear(this.world, spot.x, spot.z, .55)) continue;
        const guard = this.combat.spawnEnemy("city_guard", new THREE.Vector3(spot.x, this.world.heightAt(spot.x, spot.z), spot.z), { level: 4 });
        guard.team = "guard"; guard.defender = true; guard.cityGuard = false;
        guard.name = `${site.name} guard`;
        guard.home.copy(guard.pos);
        guard.stats.maxHp = Math.max(guard.stats.maxHp, 34); guard.hp = guard.stats.maxHp;
      }
    }
  }
  addRootAlly(existing = null) {
    const ally = existing || this.combat.spawnEnemy("root_matriarch", this.player.pos.clone().add(new THREE.Vector3(2, 0, 2)), {});
    ally.team = "party"; ally.parleyNeutral = false; ally.aggro = false; ally.target = null;
    ally.caveBoss = null; ally.boss = false; ally.companion = "root_ally"; ally.slot = 3;
    ally.name = "Rootbound Matriarch"; ally.stats.abilities = ["maul"];
    this.renderParty?.();
    return ally;
  }
  spawnCitizens() {
    const n = this.tier.name === "high" ? 16 : this.tier.name === "medium" ? 11 : 6;
    const walks = this.world.cityWalks || [];
    const ancs = ["valeborn", "valeborn", "bronzeborn", "saltborn", "thornkin", "cindrel", "rookfolk", "gloamling"].filter((a) => ANCESTRIES[a]);
    const garb = [["#6a5a3a", "#9a8a6a"], ["#4a5a6a", "#b8a070"], ["#7a3a2a", "#d9c1a7"], ["#5d6b3a", "#8a5a32"], ["#3a2a4a", "#d6b56a"], ["#8a7a5a", "#3a2a20"]];
    const hairs = ["crop", "swept", "ponytail", "bun", "long", "curls", "wild", "bob"];
    for (let i = 0; i < n && walks.length; i++) {
      const npc = `citizen_${i}`;
      if (this.state.deadNpcs[npc]) continue;
      const card = CITIZEN_NPCS[npc];
      const anc = card.ancestry || ancs[i % ancs.length];
      const A = ANCESTRIES[anc].look;
      const [gear, trim] = garb[i % garb.length];
      const look = { ancestry: anc, sex: card.voice === "en-female" ? .2 : .8, body: Math.random() < 0.7 ? "robe" : "leather", gear, trim, weapon: "none", shield: false, skin: A.skins[Math.floor(Math.random() * A.skins.length)], height: 0.94 + Math.random() * 0.1, hair: { style: hairs[i % hairs.length], color: A.hairs[Math.floor(Math.random() * A.hairs.length)] } };
      let model;
      try { model = new Character(look, { hairGuides: 12 }); } catch { continue; }
      const path = walks[i % walks.length];
      const k = Math.floor(Math.random() * path.length);
      const c = { npc, name: card.name, model, path, k, dir: Math.random() < 0.5 ? 1 : -1, pos: path[k].clone(), yaw: 0, speed: 1.1 + Math.random() * 0.5, pauseT: 0 };
      for (let n = 0; n < 4; n++) this.world.col.resolve(c.pos, .55);
      if (!cityPointClear(this.world, c.pos.x, c.pos.z, .55)) continue;
      c.route = []; c.routeFor = -1; c.stuckT = 0;
      model.addTo(this.scene);
      const actor = new Actor({ name: card.name, team: "npc", kind: "npc", model, pos: c.pos,
        stats: { maxHp: 16, guard: 10, reflex: 11, fortitude: 10, resolve: 10, abilities: [], speed: c.speed, resource: { cur: 0 } } });
      actor.pos = c.pos; actor.npc = npc; actor.citizen = c;
      c.actor = actor;
      this.combat.add(actor);
      this.citizens.push(c);
    }
  }

  // ---------- dialogue ----------
  conversationActive() {
    return !!(this.dialogue?.open || this.interiors?.dialogOpen || this.interiors2?.dialogOpen || this.caveParleyOpen || this.gateIntroPlaying || this.wands?.active);
  }
  beginConversation(actor = this.player) {
    this.conversationActor = actor;
    if (!this.onlineMode && this.dialogue?.cache) {
      const world = actor === this.localPlayer2 && this.p2SaveId ? this.p2SaveId : this.saveId;
      if (this.dialogue.cache.world !== world) { this.dialogue.cache.world = world; this.dialogue.cache.hot.clear(); }
    }
    this.conversationListener = null;
    this.updateConversationView();
  }
  endConversation() {
    this.conversationActor = null;
    this.conversationListener = null;
    this.updateConversationView();
  }
  updateConversationView() {
    document.body.classList.toggle("conversation-listening", !!this.conversationListener);
    document.body.classList.toggle("conversation-owner-p2", this.conversationActor === this.localPlayer2 && !!this.localPlayer2);
    $("#listenHint")?.classList.toggle("hidden", !this.conversationListener);
  }
  canListen(actor) {
    return this.localPlayer2 && this.conversationActive() && this.conversationActor && actor !== this.conversationActor
      && actor.pos.distanceTo(this.conversationActor.pos) <= 8;
  }
  setupDialogue() {
    this.journal = new QuestJournal(this);
    this.dialogue = new Dialogue({
      audio: this.audio,
      cache: new DialogueCache(this.onlineMode ? "online" : "local", this.saveId),
      engine: {
        context: (key) => this.npcContext(key),
        keyboardOwns: () => !this.localPlayer2 || this.conversationActor !== this.localPlayer2,
        allowedTags: (key) => this.allowedTags(key),
        sideOption: (tag, key) => this.journal.option(tag, key, this.conversationActor || this.player),
        onTag: (key, tag, ok, details) => this.onTag(key, tag, ok, details),
        openShop: (key) => {
          const actor = this.conversationActor || this.player;
          this.dialogue.close();
          this.social.openShop(NPCS[key]?.name || "Merchant", actor);
        },
        onReply: () => { this.dialogueSpeaker = "player"; },
        onNpcTurn: () => { this.dialogueSpeaker = "npc"; },
        checkBonus: (check) => this.dialogueCheckBonus(check),
        rollCheck: async (check, bonus) => {
          const label = check.abilities.join(" + ") + " · " + check.skill;
          const r = await this.hold.run(label, () => check.skill === "alchemy" && this.social.net ? this.social.rollAlchemy() : d20Check(bonus, check.dc), (roll) =>
            `d20 ${roll.nat} ${bonus >= 0 ? "+" : ""}${bonus} = ${roll.total} vs DC ${check.dc}`,
            `d20 ${bonus >= 0 ? "+" : ""}${bonus} · DC ${check.dc}`, this.conversationActor || this.player);
          this.dice.die(() => (this.conversationActor || this.player).chest(TMP), r, { label: check.skill.slice(0, 3) + " " });
          this.log(`${label}: ${describe(r)}`, r.success ? "crit" : "fail");
          return r;
        },
        loadMemory: (key) => this.loadNpcMemory(key),
        saveMemory: (key, memory) => this.saveNpcMemory(key, memory),
        onClose: (key) => {
          const speaker = this.conversationActor || this.player;
          this.endConversation();
          this.dialogueSpeaker = "npc";
          if (this.talking?.npc?.startsWith("citizen_")) this.talking.pauseT = 2;
          if (this.talking) this.talking.talkTo = null;
          this.talking = null;
          for (const n of Object.values(this.npcs)) n.talkTo = null;
          if (key === "bandit_captain" && this.state.campParley === "open") {
            const out = this.world.spots.gm_out;
            if (speaker === this.player) this.resetPlayerMovement();
            this.teleport(out.x, out.z, speaker);
            if (speaker === this.player) this.snapCamera(); else this.updateLocalCamera(0, true);
            this.gateArmed = false;
            this.log("Rafe's sentries escort you outside the breach until you choose a side.");
            this.save();
          }
        },
      },
    });
  }
  dialogueCheckBonus(check, actor = this.conversationActor) {
    const sheet = actor?.sheet || this.sheet;
    const attributes = { Strength: "might", Dexterity: "finesse", Constitution: "vigor", Intelligence: "intellect", Wisdom: "instinct", Charisma: "presence" };
    const scores = check.abilities.map((name) => mod(sheet.attrs[attributes[name]] ?? 10));
    const abilityBonus = Math.floor(scores.reduce((sum, n) => sum + n, 0) / scores.length);
    const trained = BACKGROUNDS[sheet.background]?.skills?.includes(check.skill) || sheet.classSkill === check.skill;
    return abilityBonus + (trained ? profBonus(sheet.level || 1) : 0) + (check.skill === "alchemy" ? this.alchemyBuff(actor) : 0);
  }
  alchemyBuff(actor = this.conversationActor) { const sheet = actor?.sheet || this.sheet; return ["lifekeeper", "arcanist"].includes(sheet.class) || sheet.ancestry === "thornkin" ? 2 : 0; }
  alchemyIngredients() { return ["moonleaf", "dusk_mushroom", "wild_berries"]; }
  hasAlchemyIngredients(fresh = false, actor = this.player) {
    const state = this.social.actorState(actor);
    return this.alchemyIngredients().every((key) => (state.inv[key] || 0) > 0 && (!fresh || (state.alchemyFresh?.[key] || 0) > 0));
  }
  finishAlchemy(skip = false, actor = this.conversationActor || this.player) {
    const state = this.social.actorState(actor), inv = state.inv;
    if (state.quests?.alchemy !== "open" || !this.hasAlchemyIngredients(!skip, actor)) return false;
    if (!this.social.canBrew(actor)) { this.log("Your pack is too heavy for the finished draught.", "fail"); return false; }
    if (this.social.net) { this.social.net.send({ type: "alchemy_complete", skip }); return true; }
    for (const key of this.alchemyIngredients()) { inv[key]--; if (!inv[key]) delete inv[key]; }
    inv.healing_draught = (inv.healing_draught || 0) + 1;
    state.quests.alchemy = "done";
    state.skills ||= {}; state.skills.alchemy = true;
    this.gainXP(100, actor);
    this.toast("Alchemy learned", "Mira helps you brew a healing draught");
    this.social.renderInv(); this.social.renderSheet(); this.renderQuest(); this.save();
    return true;
  }
  async loadNpcMemory(key) {
    const state = this.social.actorState(this.conversationActor || this.player);
    state.npcMemory ||= {};
    const local = state.npcMemory[key];
    if (!this.onlineMode) return local;
    try {
      const path = `/api/npc-memory/${key}/Memory.json?character=${encodeURIComponent(this.saveId)}`;
      const response = await fetch(path);
      if (response.ok) {
        const remote = (await response.json()).memory;
        const latest = memory => Math.max(0, ...(memory?.events || []).map(event => Number(event.at) || 0));
        return latest(local) > latest(remote) ? local : remote || local;
      }
    } catch (error) { console.warn("NPC memory read failed", error); }
    return local;
  }
  saveNpcMemory(key, memory) {
    const state = this.social.actorState(this.conversationActor || this.player);
    state.npcMemory ||= {};
    state.npcMemory[key] = memory;
    if (this.onlineMode) {
      const path = `/api/npc-memory/${key}/Memory.json?character=${encodeURIComponent(this.saveId)}`;
      this._npcMemoryQueue = (this._npcMemoryQueue || Promise.resolve()).catch(() => {}).then(async () => {
        const response = await fetch(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ memory }) });
        if (!response.ok) throw new Error(`NPC memory write failed: ${response.status}`);
      });
      this._npcMemoryQueue.catch((error) => console.warn(error));
    }
    this.save();
  }
  npcContext(key) {
    const card = NPCS[key] || CITIZEN_NPCS[key];
    const actor = this.conversationActor || this.player, sheet = actor.sheet || this.sheet, profile = this.social.actorState(actor);
    const morality = actor === this.localPlayer2 && this.p2SaveId ? this.morality2 : this.morality;
    const ancestry = ANCESTRIES[sheet.ancestry];
    const playerClass = CLASSES[sheet.class];
    const background = BACKGROUNDS[sheet.background];
    const quest = QUEST_TEXT.bitter_medicine.steps[this.state.main];
    return {
      player: {
        name: sheet.name,
        ancestry: ancestry?.name,
        lineage: ancestry?.lineages?.[sheet.lineage],
        ancestryTrait: ancestry?.trait,
        class: playerClass?.name,
        abilities: playerClass?.abilities?.map((id) => ABILITIES[id]?.name).filter(Boolean) || [],
        level: sheet.level,
        background: background?.name,
        trainedSkills: [...new Set([...(background?.skills || []), sheet.classSkill].filter(Boolean))],
        principle: sheet.principle,
        pressure: sheet.pressure,
        health: actor.hp < actor.stats.maxHp * .4 ? "badly wounded" : actor.hp < actor.stats.maxHp * .8 ? "wounded" : "healthy",
      },
      quest,
      questState: this.state.main,
      campParley: this.state.campParley,
      plotEvidence: this.state.knowsOrrinPlot
        ? "Evidence links Factor Orrin to the caravan seizure and his plan to discard the crew" : null,
      sideQuests: this.state.quests,
      questAwareness: this.journal.awareness(key, actor),
      alchemy: this.social.actorState(actor).quests?.alchemy || "locked",
      location: this.world.regionAt(actor.pos.x, actor.pos.z),
      day: this.state.day,
      carryingMedicine: this.state.hasMedicine,
      gold: this.social.actorState(actor).gold,
      companions: this.state.companions.map((k) => NPCS[k].name),
      sharedAncestry: sheet.ancestry === card.ancestry,
      ...morality.reaction(card.city || "marrowgate", false),
      metBefore: !!profile.talked?.[key],
    };
  }
  allowedTags(key) {
    const card = NPCS[key] || CITIZEN_NPCS[key], S = this.state, done = (this.conversationActor === this.localPlayer2 && this.p2SaveId ? this.morality2 : this.morality).done;
    const actor = this.conversationActor || this.player, alchemy = this.social.actorState(actor);
    return [...card.tags, ...this.journal.tags(key, actor)].filter((t) => {
      if (t === "alchemy:start") return !alchemy.quests?.alchemy;
      if (t === "alchemy:skip") return alchemy.quests?.alchemy === "open" && !alchemy.alchemySkipFailed && this.alchemyBuff() > 0 && this.hasAlchemyIngredients(false, actor);
      if (t === "alchemy:complete") return alchemy.quests?.alchemy === "open" && this.hasAlchemyIngredients(true, actor);
      if (t === "parley:turncoat") return ["open", "passed"].includes(S.campParley) && S.knowsOrrinPlot && !S.hasMedicine;
      if (t.startsWith("parley:")) return S.campParley === "open";
      if (t === "advance:marrowgate") return S.main === "marrowgate";
      if (t === "advance:brightwell") return S.main === "brightwell";
      if (t === "return_medicine" || t === "split_medicine") return S.hasMedicine && S.main === "choice" && (t === "return_medicine" ? key === "maud" : true);
      if (t === "sell_medicine") return S.hasMedicine && S.main === "choice";
      if (t === "recruit") return !S.companions.includes(key) && S.companions.length < 3 && !(key === "bram");
      if (t === "forgive_debt" || t === "collect_debt") return S.quests.ferryman !== "done";
      if (t === "quest:folio") return !S.quests.folio;
      if (t.startsWith("deed:")) return !done[t.slice(5) + ":" + key];
      return true;
    });
  }
  deed(key, target, actor = this.conversationActor || this.player) {
    const morality = actor === this.localPlayer2 && this.p2SaveId ? this.morality2 : this.morality;
    const r = morality.apply(key, target, this.state.day);
    if (r && r.dm) {
      this.log(`${r.name} (${r.dm > 0 ? "+" : ""}${r.dm} Mercy)`, "moral");
      this.audio.ui(r.dm > 0 ? "halo" : "horns", 0.5);
      if (r.stageChanged) this.toast(r.stageChanged, "Your appearance changes");
      actor.model.setMorality(morality.M);
      if (actor === this.player) this.renderMorality();
    }
    return r;
  }
  async onTag(key, tag, ok, details = {}) {
    const S = this.state;
    const actor = this.conversationActor || this.player;
    const morality = actor === this.localPlayer2 && this.p2SaveId ? this.morality2 : this.morality;
    const purse = this.social.actorState(actor);
    purse.talked ||= {};
    purse.talked[key] = true;
    let note = "";
    if (tag.startsWith("side:")) {
      note = await this.journal.act(key, tag, actor);
      this.renderQuest(); this.save();
      return note;
    }
    switch (tag) {
      case "alchemy:start":
        purse.quests ||= {};
        if (!purse.quests.alchemy) { purse.quests.alchemy = "open"; purse.alchemyFresh = {}; purse.alchemySkipFailed = false; this.social.net?.send({ type: "alchemy_start" }); this.renderQuest(); this.log("Quest: The First Draught", "crit"); }
        note = "Mira asks for moonleaf, a dusk mushroom, and wild berries gathered after this lesson begins.";
        break;
      case "alchemy:skip":
        if (!this.alchemyBuff() || !this.hasAlchemyIngredients(false, actor)) { note = "Mira asks you to gather the ingredients yourself."; break; }
        if (ok) { if (this.finishAlchemy(true)) note = "Mira accepts your knowledge, brews the draught with you, and teaches you Alchemy."; }
        else { purse.alchemySkipFailed = true; note = "Mira asks you to gather a fresh set of each ingredient before she teaches you."; }
        break;
      case "alchemy:complete":
        note = this.finishAlchemy(false) ? "Together you brew a healing draught. Mira teaches you Alchemy and grants access to the table." : "Mira still needs fresh moonleaf, a dusk mushroom, and wild berries.";
        break;
      case "talk":
        if (key === "bandit_captain" && ok && details.roll && ["insight", "investigation"].includes(details.checkId)) {
          S.knowsOrrinPlot = true;
          note = "Rafe's answers reveal that Orrin hired the crew and now plans to discard them.";
          this.log("Clue: Factor Orrin hired Gallowmere and intends to discard Rafe's crew.", "crit");
        }
        break;
      case "advance:marrowgate":
        this.setMain("brightwell");
        note = "Ilse tells you the caravan was bound for Brightwell, east along the river road.";
        break;
      case "advance:brightwell":
        this.setMain("gallowmere");
        note = "Maud says brigands were seen hauling crates west to the ruined Gallowmere Watch.";
        break;
      case "return_medicine":
        S.hasMedicine = false; this.deed("return_medicine", "maud"); morality.addRep("brightwell", 30); morality.addRep("compact", -20);
        if (S.campParley === "allied") this.makeGallowmereHostile("Rafe hears you gave away the medicine promised to his crew.");
        this.setMain("sunken"); this.gainXP(300, actor); note = "The medicine is handed out. Brightwell will remember."; break;
      case "sell_medicine":
        S.hasMedicine = false; purse.gold += 300; this.deed("sell_medicine", "orrin"); morality.addRep("brightwell", -40); morality.addRep("compact", 25);
        if (S.campParley === "allied") morality.addRep("gallowmere", 15);
        this.setMain("sunken"); this.gainXP(300, actor);
        note = S.campParley === "allied" ? "Orrin counts out three hundred gold. Rafe's crew receives its promised cut from the Compact." : "Orrin counts out three hundred gold."; break;
      case "split_medicine":
        S.hasMedicine = false; purse.gold += 120; morality.addRep("brightwell", 5); morality.addRep("compact", 5);
        if (S.campParley === "allied") morality.addRep("gallowmere", -15);
        this.setMain("sunken"); this.gainXP(300, actor); note = "Half the crates go each way."; break;
      case "deed:threaten": if (ok) note = "They flinch and talk."; this.deed("threaten", key); break;
      case "deed:give_supplies": this.deed("give_supplies", key); note = "You hand over your provisions."; break;
      case "deed:heal_civilian": this.deed("heal_civilian", key); note = "You help Tobin with the patients."; break;
      case "deed:spare": this.deed("spare", key); note = "Bram runs into the dusk."; this.removeNPC(key); return "__close";
      case "deed:kill_surrendered": this.deed("kill_surrendered", key); this.removeNPC(key, true, actor); return "__close";
      case "deed:expose_lie": if (ok) { this.deed("expose_lie", key); S.knowsOrrinPlot = true; note = "Bram confirms: Factor Orrin paid for the caravan to vanish."; } else note = "He clams up."; break;
      case "forgive_debt": this.deed("forgive_debt", key); S.quests.ferryman = "done"; this.gainXP(100, actor); note = "Coll's debt is forgiven."; break;
      case "collect_debt": this.deed("collect_debt", key); S.quests.ferryman = "done"; purse.gold += 40; this.gainXP(100, actor); note = "Coll pays forty gold he can't spare."; break;
      case "quest:folio": S.quests.folio = "open"; this.world.interactables.find((i) => i.id === "folio").hidden = false; note = "Hesper sketches where the cartographer's cache should be."; this.log("Quest: The Cartographer's Lost Folio", "crit"); break;
      case "rest": case "heal":
        for (const a of this.combat.actors) if (a.team === "party") { a.hp = a.stats.maxHp; a.downed = false; }
        this.log("You rest. Health restored.", "crit"); note = "You rest and recover."; break;
      case "recruit":
        if (!ok) { note = "They aren't convinced yet."; break; }
        this.recruit(key); return "__close";
      case "parley:persuade": case "parley:intimidate": case "parley:deceive":
        if (ok) {
          S.campParley = "passed";
          this.player.target = null;
          this.toast("Gallowmere passage", "Rafe orders his crew to stand aside");
          note = "Rafe orders the crew to stand aside. The medicine crates can be taken without a fight.";
        } else if (tag === "parley:intimidate") {
          this.breakCampParley();
          return "__close";
        } else note = "Rafe doubts your approach; that argument will not sway him again today.";
        break;
      case "parley:join":
        if (ok) {
          S.campParley = "allied";
          this.deed("join_brigands", "gallowmere");
          morality.addRep("gallowmere", 35);
          morality.addRep("compact", 10);
          this.gainXP(120, actor);
          this.toast("Gallowmere ally", "The crew will let you carry the medicine");
          note = "Rafe gives you a share in the caravan scheme. His garrison stands down; the crates are yours to deliver or betray.";
        } else note = "Rafe doubts that you would share the profits. He keeps his crew on guard.";
        break;
      case "parley:turncoat":
        if (ok) {
          S.campParley = "rebel";
          morality.addRep("gallowmere", 30);
          morality.addRep("compact", -25);
          this.gainXP(120, actor);
          this.toast("Gallowmere turns", "Rafe defies the Compact");
          note = "Rafe sees Orrin's betrayal in your evidence and orders the medicine released. His crew will turn on the Compact.";
        } else note = "Rafe wants more than your word before risking his crew against Orrin.";
        break;
      case "fight":
        this.breakCampParley();
        return "__close";
    }
    this.renderQuest();
    this.save();
    return note;
  }
  breakCampParley() {
    const leader = this.combat.actors.find((a) => a.dialogueNpc === "bandit_captain" && a.alive);
    if (leader) this.combat.engage(this.player, leader);
    else this.makeGallowmereHostile();
  }
  makeGallowmereHostile(note = "Gallowmere's garrison turns against you.") {
    if (this.state.campParley === "hostile") return;
    if (this.state.campParley === "allied") this.morality.addRep("gallowmere", -50);
    this.state.campParley = "hostile";
    for (const actor of this.combat.actors) if (actor.spawn?.startsWith("gm_") && actor.alive) actor.parleyNeutral = false;
    this.log(note, "fail");
    this.save();
  }
  removeNPC(key, killed, source = this.player) {
    const a = this.npcs[key];
    if (!a) return;
    if (killed) {
      a.hp = 0;
      this.combat.kill(a, source);
    } else {
      this.combat.remove(a);
      delete this.npcs[key];
    }
  }
  recruit(key) {
    const S = this.state;
    if (S.companions.includes(key)) return;
    S.companions.push(key);
    const old = this.npcs[key];
    const pos = old?.pos.clone();
    if (old) { this.combat.remove(old); delete this.npcs[key]; }
    const a = this.companionActor(key);
    if (pos) a.pos.copy(pos);
    this.combat.add(a);
    this.toast(`${NPCS[key].name} joins you`, CLASSES[NPCS[key].companion].name);
    this.renderParty();
    this.save();
  }
  setMain(step) {
    if (MAIN_ORDER.indexOf(step) <= MAIN_ORDER.indexOf(this.state.main)) return;
    this.state.main = step;
    this.toast("Bitter Medicine", QUEST_TEXT.bitter_medicine.steps[step]);
    this.audio.ui("spell", 0.4);
    this.renderQuest();
    this.save();
  }

  // ---------- events ----------
  onKill(t, source) {
    if (t.team === "npc") {
      if (t.npc) { this.state.deadNpcs[t.npc] = true; delete this.npcs[t.npc]; }
      if (t.citizen) this.citizens = this.citizens.filter(c => c !== t.citizen);
      const body = this.corpses?.create(t);
      if (body) body.look = t.model.look;
      this.save();
      return;
    }
    if (t.team === "guard") { this.corpses?.create(t); this.save(); return; }
    if (t.team !== "enemy") return;
    if (this.wildlife?.onHostileDefeated(t)) { this.corpses?.create(t); this.save(); return; }
    const interior = t === this.interiors?.hostile ? this.interiors : t === this.interiors2?.hostile ? this.interiors2 : null;
    if (interior?.active) {
      interior.record(interior.active).residentDead = true;
      this.corpses?.create(t);
      this.toast("Householder falls", "The house is quiet now");
      this.save();
      return;
    }
    const playerKill = source?.team === "party";
    if (playerKill) this.gainXP(t.stats.xp || 20, source === this.localPlayer2 ? source : this.player);
    this.corpses?.create(t);
    this.toast(`${t.name} falls`, "Search the body for loot");
    if (t.nightHunter) { this.save(); return; }
    if (t.cityGuard) { this.save(); return; }
    const sp = t.spawn;
    if (sp && !this.combat.actors.some((a) => a.spawn === sp && a.team === "enemy" && !a.dead && !a.surrendered)) {
      this.state.cleared[sp] = true;
      if (sp === "wolves") { this.state.quests.wolves = "done"; this.toast("Wolves at the Well", "The well is safe"); if (playerKill) this.gainXP(150, source === this.localPlayer2 ? source : this.player); }
      if (sp === "warden" && playerKill) this.actComplete();
      if (sp?.startsWith("cave_boss_")) {
        const cave = sp.slice("cave_boss_".length);
        this.state.caveOutcomes[cave] = "slain";
        this.toast("Guardian defeated", "The reliquary seal opens");
      }
      this.save();
    }
  }
  gainXP(n, actor = this.player) {
    const independent = actor === this.localPlayer2 && !!this.p2SaveId;
    const s = independent ? actor.sheet : this.sheet;
    s.xp = (s.xp || 0) + n;
    while ((s.level || 1) < 5 && s.xp >= XP_TABLE[(s.level || 1) + 1]) {
      s.level = (s.level || 1) + 1;
      const st = this.playerSheetStats(s, independent ? this.p2State.equipment : this.state.equipment);
      if (independent) { actor.stats = st; actor.hp = st.maxHp; this.wands?.syncEquip(); }
      else { this.player.stats = st; this.wands?.syncEquip(); this.player.hp = st.maxHp; }
      if (this.localPlayer2 && !this.p2SaveId) {
        this.localPlayer2.sheet.level = s.level;
        this.localPlayer2.stats = this.playerSheetStats();
        this.localPlayer2.hp = this.localPlayer2.stats.maxHp;
      }
      for (const c of this.combat.actors) if (c.companion) { c.sheet.level = s.level; c.stats = playerStats(c.sheet); c.hp = c.stats.maxHp; }
      this.toast(`Level ${s.level}`, "Health restored · new abilities may unlock");
      this.audio.ui("halo", 0.6);
      if (!independent) this.buildHotbar();
      if (this.localPlayer2) this.buildP2Hotbar();
    }
  }
  onDefeat(t, serverHandled = false) {
    if (t === this.localPlayer2) {
      this.horses?.dismount(t);
      t.fullyDefeated = true;
      setTimeout(() => {
        if (this.localPlayer2 !== t) return;
        t.pos.copy(this.player.pos).add(new THREE.Vector3(2, 0, 0));
        t.pos.y = this.world.heightAt(t.pos.x, t.pos.z);
        t.hp = t.stats.maxHp; t.downed = false; t.dead = false; t.deathChecks = null; t.fullyDefeated = false;
        t.model.play("revive");
      }, 2200);
      return;
    }
    if (!t.player) { t.downed = false; t.hp = 1; t.model.play("revive"); return; }
    if (t.fullyDefeated) return;
    t.fullyDefeated = true;
    this.horses?.dismount();
    const hunter = t.feedingHollow?.alive ? t.feedingHollow : null;
    if (!serverHandled) this.corpses?.createPlayerRemains(t, hunter);
    if (this.interiors?.active) this.interiors.leave(true);
    this.resetPlayerMovement();
    const byGuards = this.social.onDefeat();
    this.toast("You fall", hunter ? "The Hollow carries your gear. Hunt it down." : byGuards ? "The guards take you to the gate. Your gear remains on your body." : "Return to your body to reclaim your gear.");
    setTimeout(() => {
      const r = this.state.respawn || this.world.spots.respawn;
      this.resetPlayerMovement();
      if (this.inDungeon) this.setDungeon(false);
      this.teleport(r.x, r.z);
      for (const a of this.combat.actors) if (a.team === "party") { a.hp = a.stats.maxHp; a.downed = false; a.dead = false; a.deathChecks = null; a.feedingHollow = null; a.fullyDefeated = false; a.lastAttacker = null; a.model.play("revive"); }
      for (const a of this.combat.actors) if (a.team === "enemy") { a.aggro = false; a.target = null; if (!a.dead) a.hp = a.stats.maxHp; }
      this.snapCamera();
      this.save();
    }, 2200);
  }
  resetPlayerMovement() {
    if (this.player) {
      this.player.autoMove = null;
      this.player.target = null;
      this.player.moving = 0;
    }
    this.tapTarget = null;
    this.pendingInteract = null;
    this.stickV = { x: 0, y: 0 };
    for (const key of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"])
      this.keys.delete(key);
  }
  actComplete() {
    this.setMain("done");
    $("#actEnd").classList.remove("hidden");
    $("#actEndText").textContent = this.morality.M >= 16 ? "The road remembers your mercy." : this.morality.M <= -16 ? "The road remembers what you took." : "The road remembers.";
    this.paused = true;
  }

  // ---------- interaction ----------
  maybeGallowmereEntry() {
    if (this.state.campParley !== "open" || this.gateIntroPlaying || this.dialogue.open || this.caveParleyOpen
      || this.combat.inCombat || this.menuOpen || this.paused) return;
    const site = this.world.sites.gallowmere;
    const distance = Math.hypot(this.player.pos.x - site.x, this.player.pos.z - site.z);
    if (distance > site.r + 20) { this.gateArmed = true; return; }
    if (!this.gateArmed || distance > site.r + 16) return;
    const captain = this.combat.actors.find((actor) => actor.dialogueNpc === "bandit_captain" && actor.alive && actor.parleyNeutral);
    if (!captain) return;
    this.gateArmed = false;
    this.resetPlayerMovement();
    this.beginConversation(this.player);
    this.talking = captain;
    this.dialogueSpeaker = "npc";
    if (this.state.campIntroSeen) { this.beginGallowmereDialogue(captain); return; }
    this.state.campIntroSeen = true;
    this.gateIntroPlaying = true;
    $("#gateCutscene").classList.remove("hidden");
    this.audio.ui("horns", .55);
    this.save();
    this.gateIntroTimer = setTimeout(() => {
      this.gateIntroPlaying = false;
      $("#gateCutscene").classList.add("hidden");
      if (this.running && this.state.campParley === "open" && captain.alive) this.beginGallowmereDialogue(captain);
      else this.endConversation();
    }, 1850);
  }
  beginGallowmereDialogue(captain) {
    if (!captain.alive || !captain.parleyNeutral) return;
    this.talking = captain;
    captain.talkTo = this.player.pos;
    this.combat.face(this.player, captain.pos);
    this.combat.face(captain, this.player.pos);
    this.dialogue.start("bandit_captain");
  }
  maybeCaveParley() {
    if (!this.inDungeon || this.caveParleyOpen || this.combat.inCombat || this.dialogue.open) return;
    const boss = this.combat.actors.find((a) => a.caveBoss && a.parleyNeutral && a.alive &&
      !this.state.caveParleySeen[a.caveBoss] && a.pos.distanceTo(this.player.pos) < 8);
    if (boss) this.openCaveParley(boss);
  }
  openCaveParley(boss, actor = this.player) {
    const id = boss.caveBoss;
    if (!id || !boss.alive || !boss.parleyNeutral) return;
    this.caveParleyOpen = true;
    this.beginConversation(actor);
    this.state.caveParleySeen[id] = true;
    this.talking = boss;
    const lines = {
      root: "The great hound lowers her head over a nest of scarred roots. ‘They chained my young beneath the road. Will you break another thing to reach me?’",
      tide: "Water sheets from the keeper's shoulders. ‘I ferried every name on that slate. Who will carry them when I go?’",
      glass: "The smith raises a black glass hammer. ‘My furnace kept the valley warm. The Compact ordered it sealed with me inside.’",
    };
    $("#caveName").textContent = boss.name;
    $("#caveLine").textContent = lines[id];
    const choices = {
      root: [
        ["Offer to free the young · Instinct DC 13", "tame", !this.state.caveClues.root],
        ["Draw your weapon", "fight", false], ["Back away", "leave", false],
      ],
      tide: [
        ["Read the lost names aloud · Presence DC 13", "release", !this.state.caveClues.tide],
        ["Break the keeper's oath by force", "fight", false], ["Withdraw", "leave", false],
      ],
      glass: [
        ["Open the cooling vent · Intellect DC 14", "vent", !this.state.caveClues.glass],
        ["End the forge in battle", "fight", false], ["Step away", "leave", false],
      ],
    }[id];
    const box = $("#caveChoices"); box.replaceChildren();
    for (const [label, action, disabled] of choices) {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = label; button.disabled = disabled;
      button.onclick = () => this.resolveCaveParley(boss, action);
      box.append(button);
    }
    $("#caveParley").classList.remove("hidden");
  }
  async resolveCaveParley(boss, action) {
    if (!this.caveParleyOpen || !boss.alive) return;
    const id = boss.caveBoss, speaker = this.conversationActor || this.player;
    this.caveParleyOpen = false;
    this.endConversation();
    $("#caveParley").classList.add("hidden");
    this.talking = null;
    if (action === "leave") { this.save(); return; }
    if (action === "fight") { this.startCaveFight(boss, speaker); this.save(); return; }
    const key = id === "root" ? "instinct" : id === "tide" ? "presence" : "intellect";
    const dc = id === "glass" ? 14 : 13;
    const bonus = mod(speaker.sheet.attrs[key]) + profBonus(speaker.sheet.level || 1);
    const roll = await this.hold.run(`${boss.name} · ${key}`, () => d20Check(bonus, dc),
      (r) => describe(r), `d20 ${bonus >= 0 ? "+" : ""}${bonus} · DC ${dc}`, speaker);
    this.dice.die(() => speaker.chest(TMP), roll, { label: key.slice(0, 3) + " " });
    this.log(`${boss.name}: ${describe(roll)}`, roll.success ? "crit" : "fail");
    if (!roll.success) {
      this.log(`${boss.name} rejects the offer. The chamber erupts into battle.`, "fail");
      this.startCaveFight(boss, speaker); this.save(); return;
    }
    this.state.caveOutcomes[id] = action === "tame" ? "tamed" : action === "release" ? "freed" : "vented";
    this.state.cleared[boss.spawn] = true;
    if (action === "tame") {
      this.addRootAlly(boss);
      this.log("The matriarch joins your road to guard the young you freed.", "crit");
    } else {
      this.combat.remove(boss);
      if (action === "release") {
        this.state.fortune = Math.min(5, this.state.fortune + 1);
        this.renderFortune();
        this.log("The drowned names are spoken. The keeper is free. +1 Fortune.", "crit");
      } else {
        this.player.stats.guard += 1;
        this.log("The forge cools. The smith leaves you an emberglass ward. +1 Guard.", "crit");
      }
    }
    this.gainXP(boss.stats.xp);
    this.toast("A different ending", "The reliquary seal opens");
    this.save();
  }
  startCaveFight(boss, actor = this.player) {
    boss.parleyNeutral = false;
    boss.aggro = true;
    boss.target = actor;
    this.combat.engage(boss, actor);
  }
  nearestInteract(actor = this.player) {
    const p = actor.pos;
    const interior = actor === this.localPlayer2 ? this.interiors2 : this.interiors;
    if (this.horses?.mountedFor(actor)) {
      const horse = this.horses.horses.get(this.horses.mountedFor(actor));
      if (horse) return { type: "horse", horse, label: `Dismount ${horse.name || "horse"}` };
    }
    let best = null, bd = 2.8;
    if (interior?.active) {
      return interior.nearest(p);
    }
    for (const n of Object.values(this.npcs)) {
      const d = n.pos.distanceTo(p);
      if (d < bd) { bd = d; best = { type: "npc", key: n.npc, label: `Talk to ${NPCS[n.npc].name}`, actor: n }; }
    }
    for (const citizen of this.citizens) if (citizen.actor?.alive) {
      const d = citizen.pos.distanceTo(p);
      if (d < bd) { bd = d; best = { type: "citizen", key: citizen.npc, actor: citizen, label: `Talk to ${citizen.name}` }; }
    }
    for (const a of this.combat.actors) if (a.dialogueNpc && a.parleyNeutral && a.alive) {
      const d = a.pos.distanceTo(p);
      if (d < bd) { bd = d; best = { type: "npc", key: a.dialogueNpc, label: `Talk to ${NPCS[a.dialogueNpc].name}`, actor: a }; }
    }
    for (const a of this.combat.actors) if (a.caveBoss && a.parleyNeutral && a.alive) {
      const d = a.pos.distanceTo(p);
      if (d < bd) { bd = d; best = { type: "cave_boss", actor: a, label: `Speak to ${a.name}` }; }
    }
    for (const a of this.combat.actors) if (a.team === "enemy" && a.surrendered && !a.dead) {
      const d = a.pos.distanceTo(p);
      if (d < bd) { bd = d; best = { type: "surrender", label: this.mobile ? `Spare ${a.name}` : `Spare ${a.name}  ·  X finish`, actor: a }; }
    }
    for (const it of this.world.interactables) {
      if (it.hidden || it.kind === "house_exit") continue;
      const d = it.pos.distanceTo(p);
      if (d < bd + 0.4) { bd = d; best = { type: "it", it, label: this.itLabel(it, actor) }; }
    }
    const horse = this.horses?.nearest(bd, actor);
    if (horse) best = { type: "horse", horse, label: horse.name ? `Approach ${horse.name}` : horse.tamed ? "Approach tamed horse" : "Approach wild horse" };
    const pet = this.wildlife?.nearest(bd, actor);
    if (pet) best = { type: "pet", pet, label: `Approach ${pet.owner === this.wildlife.ownerFor(actor) ? "your " : ""}${pet.kind}` };
    const corpse = this.corpses?.nearest(p, bd);
    if (corpse) best = corpse;
    return best;
  }
  itLabel(it, actor = this.player) {
    if (it.kind === "city_door") return (actor === this.localPlayer2 ? this.interiors2 : this.interiors)?.label(it);
    if (it.kind === "house_exit") return "Leave building";
    if (it.kind === "house_chest") return "Open house chest";
    if (it.kind === "house_decor") return "Arrange furnishings";
    if (it.kind === "house_bolt") {
      const interior = it.slot === 2 ? this.interiors2 : this.interiors;
      return interior?.active && interior.record(interior.active).unbarredUntil > Date.now() ? "Bar house door" : "Unbar house door";
    }
    if (it.kind === "estate_agent") return "Speak to estate agent";
    if (it.kind === "shrine") return this.world.shrines[+it.id.slice(6)]?.lit ? "Rest at the Wayshrine" : "Light the Wayshrine";
    if (it.kind === "crates") return this.state.hasMedicine || MAIN_ORDER.indexOf(this.state.main) > 3 ? "Empty crates" : "Take the medicine crates";
    if (it.kind === "sign") return it.label;
    if (it.kind === "villager") return "Tend the sick villager";
    if (it.kind === "notice") return "Read the notice board";
    if (it.kind === "cave_chest") return this.state.caveOutcomes[it.cave] ? it.label : "Sealed reliquary · face the guardian";
    if (it.kind === "sunken_chest") return this.state.cleared.warden ? it.label : "Sealed reliquary · face the Mire Warden";
    if (it.kind === "alchemy_table") return this.state.skills.alchemy ? "Brew healing draught" : "Alchemy table · ask Mira for permission";
    return it.label;
  }
  interactionPosition(t) { return t.type === "it" ? t.it.pos : t.type === "horse" ? t.horse.pos : t.type === "pet" ? t.pet.pos : t.actor.pos; }
  interactionValid(t) {
    if (!t) return false;
    if (t.type === "it") return !t.it.hidden;
    if (t.type === "horse") return this.horses.horses.get(t.horse.id) === t.horse && t.horse.deadUntil < Date.now();
    if (t.type === "pet") return this.wildlife?.pets.get(t.pet.id) === t.pet && !t.pet.dead;
    if (t.type === "corpse") return this.corpses?.actors.get(t.id) === t.actor && t.actor.dead;
    if (t.type === "cave_boss") return t.actor.caveBoss && t.actor.alive && t.actor.parleyNeutral;
    if (t.type === "npc") return (this.npcs[t.key] === t.actor || (t.actor.companion === t.key && this.combat.actors.includes(t.actor))
      || (t.actor.dialogueNpc === t.key && t.actor.parleyNeutral && this.combat.actors.includes(t.actor))) && !t.actor.dead;
    if (t.type === "citizen") return t.actor.npc === t.key && this.citizens.includes(t.actor);
    return t.type === "surrender" && t.actor.surrendered && !t.actor.dead;
  }
  interact(finish = false, target = null, actor = this.player) {
    const conversation = this.conversationActive();
    if ((conversation && (!this.localPlayer2 || this.conversationActor === actor || this.conversationListener === actor)) || this.paused
      || this.horses?.viewer === actor || this.wildlife?.viewer === actor || this.social?.sheetActor === actor
      || (this.holdPause && (!this.localPlayer2 || !this.holdOwner || this.holdOwner === actor))
      || (!$("#corpsePanel").classList.contains("hidden") && (!this.localPlayer2 || this.corpses.viewer === actor))) return;
    if (target && (!this.interactionValid(target) || this.interactionPosition(target).distanceTo(actor.pos) > 3.2)) return;
    const t = target || this.nearestInteract(actor);
    if (!t) return;
    if (conversation && ["npc", "citizen", "cave_boss"].includes(t.type)) return;
    if (actor === this.player) this.pendingInteract = null;
    if (t.type === "horse") { if (t.horse.id === this.horses.mountedFor(actor)) this.horses.dismount(actor); else this.horses.open(t.horse, actor); return; }
    if (t.type === "pet") { this.wildlife.open(t.pet, actor); return; }
    if (t.type === "corpse") { this.corpses.open(t.id, actor); return; }
    if (t.type === "surrender") {
      const e = t.actor;
      if (finish) { this.deed("kill_surrendered", e.id, actor); e.surrendered = false; e.hp = 0; this.combat.kill(e, actor); }
      else { this.deed("spare", e.id, actor); e.dead = true; e.fade = 0.01; this.log(`${e.name} flees into the dusk.`, "moral"); }
      return;
    }
    if (finish) return;
    if (t.type === "cave_boss") { this.openCaveParley(t.actor, actor); return; }
    if (t.type === "npc") {
      const a = t.actor;
      if (t.key === "carver") { this.combat.face(actor, a.pos); this.combat.face(a, actor.pos); this.wands.open(actor); return; }
      this.dialogueSpeaker = "npc";
      this.beginConversation(actor);
      this.talking = a;
      a.talkTo = actor.pos;
      this.combat.face(actor, a.pos);
      this.combat.face(a, actor.pos);
      a.model.object.rotation.y = a.yaw;
      actor.model.object.rotation.y = actor.yaw;
      this.dialogue.start(t.key);
      return;
    }
    if (t.type === "citizen") {
      const citizen = t.actor;
      this.dialogueSpeaker = "npc";
      this.beginConversation(actor);
      this.talking = citizen;
      citizen.pauseT = Infinity;
      this.combat.face(actor, citizen.pos);
      actor.model.object.rotation.y = actor.yaw;
      this.dialogue.start(t.key);
      return;
    }
    const it = t.it;
    switch (it.kind) {
      case "city_door": (actor === this.localPlayer2 ? this.interiors2 : this.interiors)?.useDoor(it, actor); break;
      case "house_exit": (actor === this.localPlayer2 ? this.interiors2 : this.interiors)?.leave(); break;
      case "house_chest": (actor === this.localPlayer2 ? this.interiors2 : this.interiors)?.openChest(); break;
      case "house_decor": (actor === this.localPlayer2 ? this.interiors2 : this.interiors)?.openDecor(); break;
      case "house_bolt": (actor === this.localPlayer2 ? this.interiors2 : this.interiors)?.useBolt(); break;
      case "estate_agent": (actor === this.localPlayer2 ? this.interiors2 : this.interiors)?.openAgent(); break;
      case "ground_item": this.groundItems.pick(it.id, actor); break;
      case "alchemy_table":
        if (!this.social.actorState(actor).skills?.alchemy) { this.log("Mira must teach you Alchemy before you use her table.", "fail"); break; }
        if (!this.hasAlchemyIngredients(false, actor)) { this.log("A healing draught needs moonleaf, a dusk mushroom, and wild berries.", "fail"); break; }
        this.social.craftHealingDraught(actor);
        break;
      case "shrine": {
        const i = +it.id.slice(6);
        if (!this.world.shrines[i].lit) {
          this.world.setShrineLit(i, true);
          this.state.lit.push(i);
          this.audio.ui("halo", 0.6);
          this.toast("Wayshrine lit", `${this.state.lit.length} of 4`);
          this.gainXP(50, actor);
          if (this.state.lit.length === 4) { this.state.fortune = Math.min(5, this.state.fortune + 1); this.toast("A Light for the Shrine", "All shrines burn · +1 Fortune"); this.renderFortune(); }
        }
        this.state.respawn = { x: it.pos.x, z: it.pos.z };
        for (const a of this.combat.actors) if (a.team === "party") a.hp = a.stats.maxHp;
        this.log("You rest by the shrine. Health restored; you will return here if you fall.");
        this.save();
        break;
      }
      case "crates":
        if (this.state.hasMedicine || MAIN_ORDER.indexOf(this.state.main) > 3) { this.log("The crates are empty now."); break; }
        if ((!(["passed", "allied", "rebel"].includes(this.state.campParley)) && this.combat.actors.some((a) => a.spawn?.startsWith("gm_") && a.alive && !a.surrendered && a.pos.distanceTo(actor.pos) < 30))
          || this.combat.actors.some((a) => a.hostile && a.pos.distanceTo(actor.pos) < 18)) {
          this.log("Not with brigands still standing guard.", "fail"); break;
        }
        this.state.hasMedicine = true;
        this.setMain("choice");
        this.gainXP(150, actor);
        break;
      case "portal":
        if (it.cave) {
          const cave = CAVES.find((c) => c.id === it.cave);
          const point = it.id.startsWith("cave_enter_") ? cave.inside : cave.out;
          this.teleport(point.x, point.z, actor);
          if (actor === this.player) this.setDungeon(it.id.startsWith("cave_enter_"));
          if (this.inDungeon) this.toast(cave.name, cave.line);
        } else if (it.id === "dungeon_enter") {
          if (MAIN_ORDER.indexOf(this.state.main) < 5 && !confirm("The Sunken Mile is dangerous. Bitter Medicine isn't resolved yet. Descend anyway?")) break;
          const s = this.world.spots.dungeon_in; this.teleport(s.x, s.z, actor); if (actor === this.player) this.setDungeon(true); this.toast("The Sunken Mile", "The road's broken heart");
        } else { const s = this.world.spots.sunken_out; this.teleport(s.x, s.z, actor); if (actor === this.player) this.setDungeon(false); }
        if (actor === this.player) this.snapCamera(); else this.updateLocalCamera(0, true);
        break;
      case "cave_supply":
        if (this.state.caveSupplies[it.id]) break;
        if (!this.social.caveSupply(it.id, it.item, actor)) break;
        this.state.caveSupplies[it.id] = true; it.hidden = true; if (it.mesh) it.mesh.visible = false;
        this.save();
        break;
      case "cave_clue":
        if (this.state.caveClues[it.cave]) { this.log("You have already studied this clue."); break; }
        this.state.caveClues[it.cave] = true;
        this.gainXP(70, actor);
        this.log(({ root: "The matriarch's young were trapped by old iron. She guards them, not a treasure.", tide: "Names in the ledger bind the keeper to his drowning toll.", glass: "A vent beneath the forge can cool its heart without breaking it." })[it.cave], "crit");
        this.toast("Clue found", "A new way through the guardian's story");
        this.save();
        break;
      case "cave_chest": {
        if (!this.state.caveOutcomes[it.cave]) { this.log("The reliquary's seal holds while its guardian remains.", "fail"); break; }
        if (this.state.cleared[it.id]) { this.log("The reliquary is empty."); break; }
        const cave = CAVES.find((c) => c.id === it.cave);
        if (!this.social.caveReward(cave.id, cave.reward, actor)) break;
        this.state.cleared[it.id] = true;
        this.gainXP(150, actor);
        this.toast("Relic claimed", cave.name);
        this.save();
        break;
      }
      case "sunken_chest":
        if (!this.state.cleared.warden) { this.log("The Mire Warden still holds the reliquary shut.", "fail"); break; }
        if (this.state.cleared.sunken_chest) { this.log("The reliquary is empty."); break; }
        if (!this.social.caveReward("sunken", "warden_seal", actor)) break;
        this.state.cleared.sunken_chest = true;
        this.gainXP(150, actor);
        this.toast("Warden's seal", "The old road's oath is yours");
        this.save();
        break;
      case "villager": this.deed("heal_civilian", it.id, actor); this.log("You ease the villager's fever for a while."); break;
      case "cache":
        if (this.state.quests.folio === "done") break;
        this.state.quests.folio = "done"; it.hidden = true; this.gainXP(200, actor); this.social.earn(30, null, actor);
        this.toast("The Cartographer's Lost Folio", "The Sunken Mile's entrance is marked");
        break;
      case "notice": {
        const q = Object.entries(this.state.quests).map(([k, v]) => `${QUEST_TEXT[k]?.name}: ${v}`).join(" · ");
        this.log("NOTICE: Greyfever in Brightwell — medicine caravan lost. Wolves seen by the Brightwell well. Ferryman Coll owes the Compact.", "crit");
        if (!this.state.quests.wolves) { this.state.quests.wolves = "open"; this.log("Quest: Wolves at the Well", "crit"); }
        if (!this.state.quests.ferryman) this.state.quests.ferryman = "open";
        if (q) this.log(q);
        break;
      }
      case "sign": this.toast(it.label, this.world.regionAt(it.pos.x, it.pos.z)); break;
      case "stable": this.horses.openStable(it.city, actor); break;
      case "gather":
        if (!this.social.canCarry(it.item, actor)) { this.log("Your pack is too heavy.", "fail"); break; }
        this.world.setGathered(it.id);
        this.state.gathered.push(it.id);
        const gatherState = this.social.actorState(actor);
        if (gatherState.quests?.alchemy === "open" && this.alchemyIngredients().includes(it.item)) {
          gatherState.alchemyFresh ||= {};
          gatherState.alchemyFresh[it.item] = (gatherState.alchemyFresh[it.item] || 0) + 1;
        }
        this.social.gather(it.item, it.id, actor);
        this.audio.ui("step", 0.2);
        this.save();
        break;
    }
  }

  // ---------- input ----------
  importCompanions(data, owner, sameWorld) {
    const portal = this.world.spots.realmPortal;
    const horses = [...(data.migratedHorses || []), ...(owner === "local:2" ? Object.values(data.state?.horses || {}).filter(h => h.owner === "local" || h.owner === "local:2") : [])];
    const pets = [...(data.migratedPets || []), ...(owner === "local:2" ? Object.values(data.state?.pets || {}).filter(p => p.owner === "local" || p.owner === "local:2") : [])];
    for (const [i, horse] of horses.entries()) {
      const existing = this.horses.horses.get(horse.id);
      const id = sameWorld && (!existing || existing.owner === owner) ? horse.id : "h" + Math.floor(1000000000 + Math.random() * 1000000000);
      const x = sameWorld ? horse.x : portal.x - 2 + (i % 4) * 1.8;
      const z = sameWorld ? horse.z : portal.z + 2 + Math.floor(i / 4) * 2;
      this.horses.upsert({ ...horse, id, x, z, home_x: x, home_z: z, owner, owner_user_id: owner,
        ownerName: owner === "local" ? this.sheet.name : data.char.name, owner_name: owner === "local" ? this.sheet.name : data.char.name, rider: null });
    }
    for (const [i, pet] of pets.entries()) {
      const existing = this.wildlife.pets.get(pet.id);
      const id = sameWorld && (!existing || existing.owner === owner) ? pet.id : "p_marrowgate_" + Math.floor(Math.random() * 1000000000);
      const x = sameWorld ? pet.x : portal.x + (i % 4) * 1.5;
      const z = sameWorld ? pet.z : portal.z + 3 + Math.floor(i / 4) * 1.5;
      this.wildlife.upsert({ ...pet, id, x, z, homeX: x, homeZ: z, owner,
        ownerName: owner === "local" ? this.sheet.name : data.char.name });
    }
    if (horses.length) this.state.horses = this.horses.serialize();
    if (pets.length) this.state.pets = this.wildlife.serialize();
    delete data.migratedHorses; delete data.migratedPets;
  }
  joinController(index) {
    if (this.controllerSlots.has(index) || this.pendingCoop === index) return;
    if ([...this.controllerSlots.values()].includes(1)) {
      if (this.localPlayer2 || this.onlineMode || this.pendingCoop != null) return;
      this.openCoopChoice(index);
      return;
    }
    this.controllerSlots.set(index, 1);
    this.log("Controller 1 joined. A attacks nearby foes · X/Y use assigned skills · RB opens skills.", "crit");
    this.updateControllerStatus();
  }
  async openCoopChoice(index) {
    this.pendingCoop = index;
    this.coopWasPaused = this.paused;
    this.paused = true;
    $("#coopJoin").classList.remove("hidden");
    const box = $("#coopChoices");
    box.replaceChildren();
    $("#coopMessage").textContent = "Loading profiles…";
    const add = (name, detail, action) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "coop-choice";
      button.textContent = name;
      const small = document.createElement("small"); small.textContent = detail;
      button.append(small); button.onclick = action; box.append(button);
    };
    add("Clone player 1", "Shared character and pack", () => this.finishCoopJoin(index, { clone: true }));
    add("Create new character", "A separate local profile", () => {
      $("#coopJoin").classList.add("hidden");
      this.createCoopProfile?.(this, index);
    });
    $("#coopCancel").onclick = () => this.cancelCoopJoin();
    box.querySelector("button")?.focus();
    try {
      const profiles = await this.getCoopProfiles?.(this) || [];
      if (this.pendingCoop !== index) return;
      for (const profile of profiles) add(profile.name, profile.detail, () => this.finishCoopJoin(index, profile));
      $("#coopMessage").textContent = "";
    } catch (error) { $("#coopMessage").textContent = error.message || "Profiles unavailable"; }
  }
  cancelCoopJoin() {
    this.pendingCoop = null;
    this.paused = this.coopWasPaused;
    $("#coopJoin").classList.add("hidden");
    this.updateControllerStatus();
  }
  async finishCoopJoin(index, choice) {
    if (this.pendingCoop !== index || this.coopJoining) return;
    this.coopJoining = true;
    const msg = $("#coopMessage");
    try {
      if (choice.source === "online") {
        msg.textContent = "Bringing profile into this world…";
        choice = await this.importCoopProfile(this, choice);
      }
      if (this.pendingCoop !== index) return;
      const clone = !!choice.clone;
      const data = choice.data || null;
      const sheet = clone ? { ...this.sheet, name: "Player 2", attrs: { ...this.sheet.attrs } } : structuredClone(data.char);
      this.p2SaveId = clone ? null : choice.id;
      this.p2ProfileData = clone ? null : structuredClone(data);
      this.p2Store = clone ? null : choice.store || this.saves;
      this.p2State = clone ? this.state : structuredClone(data.state || {});
      this.morality2 = clone ? this.morality : new Morality(this.p2State.morality || {});
      if (!clone) {
        this.p2State.inv ||= { ...STARTER };
        this.p2State.equipment ||= { ...(STARTER_EQUIPMENT[sheet.class] || {}) };
        this.p2State.gold ??= 25;
        this.p2State.fortune ??= 1;
        for (const key of Object.values(this.p2State.equipment)) if (ITEMS[key] && !this.p2State.inv[key]) this.p2State.inv[key] = 1;
        migrateShieldEquipment(this.p2State, sheet.class);
        for (const wand of this.p2State.wands || []) this.wands?.register(wand, sheet);
      }
      const look = clone ? { ...equipmentLook(sheet.look, this.state.equipment), gear: "#46647b" }
        : equipmentLook(sheet.look, this.p2State.equipment);
      const model = new Character(look, { hairGuides: this.tier.name === "low" ? 28 : 55 });
      model.setMorality(this.morality2.M, true);
      const saved = clone ? this.state.localCoop : data;
      const sameWorld = clone || (data.seed === this.world.seed && !data.arrivalPortal);
      if (!clone && !sameWorld) this.p2State = relocateState(this.p2State);
      if (!this.onlineMode && !clone && sameWorld) for (const [id, record] of Object.entries(this.p2State.cityHouses || {})) {
        if (record.ownerSlot === 2 && record.characterId === this.p2SaveId && !this.state.cityHouses[id]?.characterId) this.state.cityHouses[id] = structuredClone(record);
      }
      const entrance = this.interiors?.active?.pos;
      const origin = sameWorld && saved?.pos && Number.isFinite(saved.pos.x) && Number.isFinite(saved.pos.z)
        ? saved.pos : !clone ? this.world.spots.realmPortal : null;
      const pos = origin ? new THREE.Vector3(origin.x, 0, origin.z)
        : entrance ? entrance.clone().add(new THREE.Vector3(2, 0, 1)) : this.player.pos.clone().add(new THREE.Vector3(2, 0, 1));
      for (let n = 0; n < 4; n++) this.world.col.resolve(pos, .42);
      pos.y = this.world.heightAt(pos.x, pos.z);
      const actor = new Actor({ name: sheet.name, team: "party", kind: "player", model, pos, stats: this.playerSheetStats(sheet, this.p2State.equipment), sheet });
      actor.player = true;
      actor.swimStamina = clamp((clone ? saved?.swimStamina : data.state?.swimStamina) ?? swimCapacity(sheet.attrs, sheet.level), 0, swimCapacity(sheet.attrs, sheet.level));
      if (saved) { actor.hp = clamp(saved.hp ?? actor.hp, 1, actor.stats.maxHp); actor.res = clamp(saved.res ?? actor.res, 0, actor.stats.resource.max || 0); }
      this.localPlayer2 = this.combat.add(actor);
      if (!clone) {
        this.importCompanions(this.p2ProfileData, "local:2", sameWorld);
        delete this.p2State.horses; delete this.p2State.pets;
      }
      this.wands?.syncEquip();
      this.camera2 = new THREE.PerspectiveCamera(55, 1, 0.1, 2400);
      this.cam2Yaw = this.camYaw;
      this.cam2Pitch = this.camPitch;
      this.cam2Dist = this.camDist;
      this.cam2Pos = pos.clone().add(new THREE.Vector3(0, 5, 9));
      this.cam2Look = pos.clone().add(new THREE.Vector3(0, 1.5, 0));
      this.interiors2 = new CityInteriors(this, 2);
      for (const house of this.social.housesSnapshot || []) this.interiors2.onHouseUpdate(house);
      if (this.state.activeHouse2) {
        const door = this.world.cityDoors.find(d => d.id === this.state.activeHouse2);
        if (door?.property && this.onlineMode) {
          this.teleport(door.pos.x + door.nx * .8, door.pos.z + door.nz * .8, this.localPlayer2);
          this.state.activeHouse2 = null;
        } else if (door) this.interiors2.enter(door, true);
        else this.state.activeHouse2 = null;
      }
      document.body.classList.add("split-game");
      $("#p2hud").classList.remove("hidden");
      $("#p2hud > b").textContent = sheet.name;
      this.buildP2Hotbar();
      this.renderParty();
      this.controllerSlots.set(index, 2);
      this.pendingCoop = null;
      this.paused = this.coopWasPaused;
      $("#coopJoin").classList.add("hidden");
      this.log(`${sheet.name} joined. Split screen active.`, "crit");
      this.updateControllerStatus();
      this.save();
    } catch (error) { msg.textContent = error.message || "Could not load profile"; }
    finally { this.coopJoining = false; }
  }
  leaveController(index) {
    if (this.pendingCoop === index) { this.cancelCoopJoin(); return; }
    const slot = this.controllerSlots.get(index);
    if (!slot) return;
    this.controllerSlots.delete(index);
    this.controllerStates.delete(index);
    if (slot === 2 && this.localPlayer2) {
      this.closeSkillWheel(this.localPlayer2);
      if (this.horses?.mounted2) this.horses.dismount(this.localPlayer2);
      if (this.horses?.viewer === this.localPlayer2) this.horses.close();
      if (this.wildlife?.viewer === this.localPlayer2) this.wildlife.close();
      if (this.social?.sheetActor === this.localPlayer2) this.social.toggleSheet(false);
      this.rememberLocalPlayer2();
      if (this.p2SaveId) this.savePlayer2().catch((error) => console.warn("Player 2 save failed", error));
      if (this.corpses?.viewer === this.localPlayer2) this.corpses.close();
      if (this.conversationActor === this.localPlayer2) {
        this.dialogue?.close();
        if (this.wands?.active) this.wands.close();
        if (this.caveParleyOpen) { this.caveParleyOpen = false; $("#caveParley").classList.add("hidden"); this.talking = null; }
        this.interiors2?.closePanel(); this.endConversation();
      }
      else if (this.conversationListener === this.localPlayer2) { this.conversationListener = null; this.updateConversationView(); }
      this.interiors2?.destroy(); this.interiors2 = null;
      for (const actor of this.combat.actors) if (actor.target === this.localPlayer2) actor.target = null;
      this.combat.remove(this.localPlayer2);
      this.localPlayer2 = null;
      this.p2SaveId = null; this.p2ProfileData = null; this.p2State = null; this.p2Store = null; this.morality2 = null;
      this.camera2 = null;
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      document.body.classList.remove("split-game", "corpse-owner-p2", "conversation-owner-p2", "hold-owner-p2");
      $("#p2hud").classList.add("hidden");
      $("#p2prompt").classList.add("hidden");
      this.renderParty();
    }
    // The remaining controller becomes Player 1 after a disconnect.
    if (slot === 1) {
      const second = [...this.controllerSlots].find(([, value]) => value === 2);
      if (second) { this.leaveController(second[0]); this.controllerSlots.set(second[0], 1); }
    }
    this.updateControllerStatus();
  }
  updateControllerStatus() {
    const status = $("#padStatus");
    if (!status) return;
    const count = this.controllerSlots.size;
    const waiting = (this.availableControllers || 0) > count;
    status.classList.toggle("hidden", !count && !waiting);
    status.textContent = count === 2 ? "P1 + P2 · A attack/act · X/Y skills · RB assign"
      : count && waiting && !this.onlineMode ? "P2: press A or Start to join split screen"
      : count ? "A attack/act · X/Y skills · RB assign · RT attack"
      : waiting ? "Controller detected · press A or Start to play" : "";
  }
  rememberLocalPlayer2() {
    const p = this.localPlayer2;
    if (!p) return;
    if (this.p2SaveId) {
      this.p2State.morality = this.morality2?.toJSON() || this.p2State.morality;
      this.p2State.horses = Object.fromEntries([...this.horses.horses.values()].filter(h => h.owner === "local:2")
        .map(h => [h.id, { id: h.id, x: h.x, z: h.z, home_x: h.home_x, home_z: h.home_z, coat: h.coat, pattern: h.pattern,
          look: h.look, tamed: h.tamed, name: h.name, owner: "local:2", ownerName: h.ownerName, bond: h.bond, hp: h.hp, deadUntil: h.deadUntil }]));
      this.p2State.pets = Object.fromEntries([...this.wildlife.pets.values()].filter(pet => pet.owner === "local:2")
        .map(pet => [pet.id, { id: pet.id, kind: pet.kind, x: pet.x, z: pet.z, homeX: pet.homeX, homeZ: pet.homeZ,
          hp: pet.hp, owner: "local:2", ownerName: pet.ownerName, dead: pet.dead, shooUntil: pet.shooUntil }]));
      this.p2ProfileData = { ...this.p2ProfileData, char: p.sheet, seed: this.world.seed, scene: "world", arrivalPortal: false,
        pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, hp: p.hp, res: p.res,
        state: { ...this.p2State, swimStamina: p.swimStamina } };
    } else this.state.localCoop = { pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, hp: p.hp, res: p.res, swimStamina: p.swimStamina };
  }
  async savePlayer2() {
    if (!this.p2SaveId || !this.p2Store || !this.p2ProfileData) return;
    this.rememberLocalPlayer2();
    const id = this.p2SaveId, data = structuredClone(this.p2ProfileData);
    this._p2SaveQueue = (this._p2SaveQueue || Promise.resolve()).catch(() => {}).then(() => this.p2Store.save(id, data));
    await this._p2SaveQueue;
  }
  controllerOverlay(pad, actor, forced = null) {
    const overlay = (forced ? [forced] : ["#pause", "#hold", "#dialogue", "#housePanel", "#horsePanel", "#petPanel", "#corpsePanel", "#caveParley", "#actEnd", "#moveChoice", "#wandScene", "#characterSheet", "#inv", "#shop", "#trade", "#ask", "#pi"])
      .map(s => $(s)).find(el => {
        if (!el || el.classList.contains("hidden")) return false;
        if (!this.localPlayer2) return true;
        if (el.id === "corpsePanel") return this.corpses.viewer === actor;
        if (el.id === "horsePanel") return this.horses.viewer === actor;
        if (el.id === "petPanel") return this.wildlife.viewer === actor;
        if (el.id === "shop" && this.social.shopActor) return this.social.shopActor === actor;
        if (el.id === "hold" && this.holdOwner) return this.holdOwner === actor;
        if ((el.id === "characterSheet" || el.id === "inv") && this.social.sheetActor) return this.social.sheetActor === actor;
        return true;
      });
    if (!overlay) return false;
    const controls = [...overlay.querySelectorAll("button:not(:disabled), [role=button], input:not([type=hidden])")]
      .filter(el => el.getClientRects().length && !el.closest(".hidden"));
    if (pad.pressed[1]) {
      if (overlay.id === "pause") this.toggleMenu();
      else if (overlay.id === "dialogue") this.dialogue.close();
      else if (overlay.id === "housePanel") (actor === this.localPlayer2 ? this.interiors2 : this.interiors)?.closePanel();
      else if (overlay.id === "shop" && this.social.shopGoldEditor) overlay.querySelector("[data-gold-cancel]")?.click();
      else if (overlay.id === "inv") this.social.toggleInv(false);
      else if (overlay.id === "characterSheet") this.social.toggleSheet(false);
      else overlay.querySelector("[aria-label*=Close], [aria-label*=Leave]")?.click();
      return true;
    }
    if (overlay.id === "characterSheet" && pad.pressed[8]) {
      this.social.toggleSheet(false, actor);
      return true;
    }
    if (overlay.id === "hold") {
      if (pad.pressed[3]) this.hold.reroll();
      if (pad.pressed[0]) {
        if (this.hold.active?.phase === "ready") this.hold.active.roll();
        else if (this.hold.active?.phase === "result") this.hold.active.finish();
      }
      return true;
    }
    const nav = pad.pressed[13] || pad.pressed[15] || pad.axes[1] > .7 ? 1
      : pad.pressed[12] || pad.pressed[14] || pad.axes[1] < -.7 ? -1 : 0;
    if (nav && performance.now() - (this.controllerNavAt.get(pad.index) || 0) > 170 && controls.length) {
      const current = controls.indexOf(document.activeElement);
      controls[(current + nav + controls.length) % controls.length].focus();
      this.controllerNavAt.set(pad.index, performance.now());
    }
    if (pad.pressed[0]) {
      const preferred = overlay.id === "pause" ? overlay.querySelector("#resume")
        : overlay.id === "actEnd" ? overlay.querySelector("#actEndGo")
        : overlay.id === "moveChoice" ? overlay.querySelector('[data-move="analog"]')
        : overlay.id === "wandScene" ? overlay.querySelector("#wandChoices button") : null;
      const target = controls.includes(document.activeElement) ? document.activeElement : preferred || controls[0];
      target?.click();
    }
    return true;
  }
  skillBindingsFor(actor = this.player) {
    // A cloned split-screen hero shares inventory with Player 1, but still
    // needs independent controller assignments.
    if (actor === this.localPlayer2 && !this.p2SaveId) return this.state.skillBindingsP2 ||= {};
    return this.social.actorState(actor).skillBindings ||= {};
  }
  skillForButton(button, actor = this.player) {
    const abilities = actor?.stats?.abilities || [];
    const saved = this.skillBindingsFor(actor)[button];
    return abilities.includes(saved) ? saved : abilities[button === "X" ? 1 : 2] || abilities[0];
  }
  assignSkill(button, key, actor = this.player) {
    if (!["X", "Y"].includes(button) || !actor?.stats?.abilities?.includes(key)) return;
    const bindings = this.skillBindingsFor(actor);
    if (bindings[button] === key) return;
    bindings[button] = key;
    this.renderSkillWheelBindings(actor);
    this.refreshHotbarBindings();
    this.log(`${actor.name}: ${button} → ${ABILITIES[key].name}`, "crit");
    this.save();
  }
  useAssignedSkill(button, actor = this.player) {
    this.useAbility(this.skillForButton(button, actor), actor);
  }
  attackOrInteract(actor = this.player) {
    const foe = this.combat.nearestFoe(actor, 3.4);
    if (foe?.hostile) { actor.target = foe; this.useSlot(0, actor); }
    else this.interact(false, null, actor);
  }
  refreshHotbarBindings() {
    const update = (slots, actor, second = false) => {
      if (!actor) return;
      const x = this.skillForButton("X", actor), y = this.skillForButton("Y", actor);
      for (const [i, slot] of (slots || []).entries()) {
        const kbd = slot.d.querySelector("kbd");
        if (!kbd) continue;
        const labels = [slot.k === x ? "X" : "", slot.k === y ? "Y" : ""].filter(Boolean);
        kbd.textContent = second ? `${["A/RT", "→", "↑", "←"][i] || i + 1}${labels.length ? " · " + labels.join("/") : ""}`
          : `${i + 1}${labels.length ? " · " + labels.join("/") : ""}`;
      }
    };
    update(this.slots, this.player);
    update(this.slots2, this.localPlayer2, true);
  }
  renderSkillWheelBindings(actor) {
    const slot = actor === this.localPlayer2 ? 2 : 1;
    const el = $("#skillWheel" + slot);
    if (!el) return;
    const x = this.skillForButton("X", actor), y = this.skillForButton("Y", actor);
    for (const button of el.querySelectorAll("button[data-skill]")) {
      const labels = [button.dataset.skill === x ? "X" : "", button.dataset.skill === y ? "Y" : ""].filter(Boolean);
      button.querySelector(".wheel-bind").textContent = labels.join(" / ");
    }
  }
  openSkillWheel(actor, slot) {
    if (!actor?.stats?.abilities?.length || this.paused || this.menuOpen || this.social?.sheetActor === actor
      || (this.conversationActive() && (!this.localPlayer2 || this.conversationActor === actor || this.conversationListener === actor))) return;
    if (actor === this.player) { this.keys.clear(); this.tapTarget = null; this.pendingInteract = null; }
    actor.autoMove = null;
    this.skillWheelOpen ||= {};
    this.skillWheelSelection ||= {};
    this.skillWheelOpen[slot] = true;
    const el = $("#skillWheel" + slot);
    el.replaceChildren();
    el.classList.remove("hidden");
    const core = document.createElement("div");
    core.className = "wheel-core";
    core.textContent = "A/ENTER CAST · X/Y ASSIGN · RB/Q CLOSE";
    el.append(core);
    const keys = actor.stats.abilities;
    this.skillWheelSelection[slot] = Math.min(this.skillWheelSelection[slot] || 0, keys.length - 1);
    keys.forEach((key, i) => {
      const ab = ABILITIES[key];
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.skill = key;
      const angle = 2 * Math.PI * i / keys.length - Math.PI / 2;
      button.style.left = `${50 + 31 * Math.cos(angle)}%`;
      button.style.top = `${50 + 31 * Math.sin(angle)}%`;
      button.innerHTML = `<b>${ab.icon || "✦"}</b><small class="wheel-bind"></small>`;
      button.append(document.createTextNode(ab.name));
      button.onclick = () => { this.closeSkillWheel(actor); this.useSlot(i, actor); };
      button.onpointerenter = () => this.selectSkillWheel(slot, i);
      button.onfocus = () => this.selectSkillWheel(slot, i);
      el.append(button);
    });
    this.renderSkillWheelBindings(actor);
    this.selectSkillWheel(slot, this.skillWheelSelection[slot]);
  }
  selectSkillWheel(slot, index) {
    const buttons = [...$("#skillWheel" + slot).querySelectorAll("button")];
    if (!buttons.length) return;
    this.skillWheelSelection[slot] = (index + buttons.length) % buttons.length;
    buttons.forEach((button, i) => button.classList.toggle("selected", i === this.skillWheelSelection[slot]));
  }
  closeSkillWheel(actor) {
    const slot = actor === this.localPlayer2 ? 2 : 1;
    if (this.skillWheelOpen) this.skillWheelOpen[slot] = false;
    $("#skillWheel" + slot)?.classList.add("hidden");
  }
  controlSkillWheel(pad, actor, slot) {
    if (pad.pressed[5] || pad.pressed[1]) { this.closeSkillWheel(actor); return; }
    const count = actor?.stats?.abilities?.length || 0;
    if (!count) { this.closeSkillWheel(actor); return; }
    const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
    if (Math.hypot(x, y) > .55) {
      const angle = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
      this.selectSkillWheel(slot, Math.round(angle / (Math.PI * 2) * count) % count);
    } else {
      const step = pad.pressed[15] || pad.pressed[13] ? 1 : pad.pressed[14] || pad.pressed[12] ? -1 : 0;
      if (step && performance.now() - (this.controllerNavAt.get(pad.index) || 0) > 170) {
        this.selectSkillWheel(slot, (this.skillWheelSelection[slot] || 0) + step);
        this.controllerNavAt.set(pad.index, performance.now());
      }
    }
    const selected = actor.stats.abilities[this.skillWheelSelection[slot] || 0];
    if (pad.pressed[2]) this.assignSkill("X", selected, actor);
    if (pad.pressed[3]) this.assignSkill("Y", selected, actor);
    if (pad.pressed[0]) {
      const index = this.skillWheelSelection[slot] || 0;
      this.closeSkillWheel(actor);
      this.useSlot(index, actor);
    }
  }
  handleGamepads(states) {
    if (document.hidden) { this.controllerStates.clear(); return; }
    const supported = states.filter(p => p.buttons.length >= 2);
    const available = new Set(supported.map(p => p.index));
    if (this.availableControllers !== supported.length) { this.availableControllers = supported.length; this.updateControllerStatus(); }
    for (const index of [...this.controllerSlots.keys()]) if (!available.has(index)) this.leaveController(index);
    this.controllerStates.clear();
    for (const pad of supported) {
      if (this.pendingCoop === pad.index) {
        if (!$("#coopJoin").classList.contains("hidden")) this.controllerOverlay(pad, this.player, "#coopJoin");
        continue;
      }
      if (!this.controllerSlots.has(pad.index)) {
        if (pad.pressed[9] || pad.pressed[0]) this.joinController(pad.index);
        continue;
      }
      this.controllerStates.set(pad.index, pad);
      if (pad.pressed.some(Boolean)) this.lastControllerIndex = pad.index;
      const slot = this.controllerSlots.get(pad.index);
      const actor = slot === 2 ? this.localPlayer2 : this.player;
      if (pad.pressed[9]) { this.closeSkillWheel(actor); this.toggleMenu(actor); pad.inUI = true; continue; }
      if (this.skillWheelOpen?.[slot]) { this.controlSkillWheel(pad, actor, slot); pad.inUI = true; continue; }
      const otherConversation = this.conversationActive() && actor && this.conversationActor !== actor;
      if (otherConversation && this.corpses.viewer === actor && this.controllerOverlay(pad, actor, "#corpsePanel")) { pad.inUI = true; continue; }
      if (otherConversation) {
        if (this.conversationListener === actor) {
          if (pad.pressed[1]) { this.conversationListener = null; this.updateConversationView(); }
          pad.inUI = true;
          continue;
        }
        if (pad.pressed[0] && this.canListen(actor)) {
          this.conversationListener = actor; this.updateConversationView();
          pad.inUI = true;
          continue;
        }
      }
      if (!otherConversation && this.controllerOverlay(pad, actor)) { pad.inUI = true; continue; }
      if (this.paused || this.menuOpen || (this.gateIntroPlaying && !otherConversation) || (actor === this.player ? this.interiors?.busy : this.interiors2?.busy)) continue;
      if (!actor) continue;
      const yawKey = slot === 2 ? "cam2Yaw" : "camYaw";
      const pitchKey = slot === 2 ? "cam2Pitch" : "camPitch";
      this[yawKey] -= pad.axes[2] * 0.055;
      this[pitchKey] = clamp(this[pitchKey] + pad.axes[3] * 0.035, 0.08, (slot === 2 ? this.interiors2?.active : this.interiors?.active) ? .46 : 1.25);
      if (pad.pressed[4]) this.cycleTarget(actor);
      if (pad.pressed[5]) { this.openSkillWheel(actor, slot); pad.inUI = true; continue; }
      if (pad.pressed[7] || pad.pressed[13]) this.useSlot(0, actor);
      if (pad.pressed[2]) this.useAssignedSkill("X", actor);
      if (pad.pressed[3]) this.useAssignedSkill("Y", actor);
      if (pad.pressed[15]) this.useSlot(1, actor);
      if (pad.pressed[12]) this.useSlot(2, actor);
      if (pad.pressed[14]) this.useSlot(3, actor);
      if (pad.pressed[0]) this.attackOrInteract(actor);
      if (pad.pressed[1] && !this.conversationActive()) {
        if (this.horses?.mountedFor(actor)) this.horses.dismount(actor);
      }
      if (pad.pressed[8]) {
        this.social.toggleSheet(undefined, actor);
        if (this.social.sheetActor === actor) $("#characterSheet .sheet-grid .item, #characterSheet .sheet-slot button, #characterSheet .sheet-close")?.focus();
      }
    }
  }
  setupInput() {
    const el = this.renderer.domElement;
    this.onKey = (e) => {
      if (e.type === "keyup") { this.keys.delete(e.code); return; }
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (this.skillWheelOpen?.[1]) {
        const count = this.player.stats.abilities.length;
        if (["Escape", "KeyQ"].includes(e.code)) this.closeSkillWheel(this.player);
        else if (["ArrowRight", "ArrowDown"].includes(e.code)) this.selectSkillWheel(1, (this.skillWheelSelection[1] || 0) + 1);
        else if (["ArrowLeft", "ArrowUp"].includes(e.code)) this.selectSkillWheel(1, (this.skillWheelSelection[1] || 0) - 1);
        else if (e.code === "KeyX" || e.code === "KeyY") this.assignSkill(e.code === "KeyX" ? "X" : "Y", this.player.stats.abilities[this.skillWheelSelection[1] || 0], this.player);
        else if (["Enter", "Space"].includes(e.code)) { const index = this.skillWheelSelection[1] || 0; this.closeSkillWheel(this.player); this.useSlot(index, this.player); }
        if (count) { e.preventDefault(); this.keys.delete(e.code); }
        return;
      }
      this.keys.add(e.code);
      if (this.wands.active && (!this.localPlayer2 || this.conversationActor === this.player)) { if (e.code === "Escape") this.wands.close(); return; }
      if (this.hold.active || this.gateIntroPlaying) return;
      if (this.interiors?.busy) return;
      if (!$("#horsePanel").classList.contains("hidden")) { if (e.code === "Escape") this.horses.close(); return; }
      if (!$("#petPanel").classList.contains("hidden")) { if (e.code === "Escape") this.wildlife.close(); else if (/^Digit[1-5]$/.test(e.code)) $("#petActions").querySelectorAll("button")[Number(e.code.slice(5))-1]?.click(); return; }
      if (!$("#corpsePanel").classList.contains("hidden")) { if (e.code === "Escape") this.corpses.close(); return; }
      if (this.dialogue?.open && (!this.localPlayer2 || this.conversationActor === this.player)) return;
      if (this.interiors?.dialogOpen) return;
      if (this.caveParleyOpen) return;
      if (e.code === "Escape" && this.social.piOpen) { this.social.closePi(); return; }
      if (e.code === "Escape" && !$("#characterSheet").classList.contains("hidden")) { this.social.toggleSheet(false); return; }
      if (e.code === "Escape" && !$("#inv").classList.contains("hidden")) { this.social.toggleInv(false); return; }
      if (e.code === "Escape") { this.toggleMenu(); return; }
      if (this.menuOpen || !$("#actEnd").classList.contains("hidden")) return;
      if (e.code === "KeyI") { this.social.toggleInv(); return; }
      if (e.code === "KeyC") { this.social.toggleSheet(); return; }
      if (e.code === "KeyQ") { this.keys.clear(); this.openSkillWheel(this.player, 1); return; }
      if (e.code === "Enter" && this.social.net) { e.preventDefault(); this.social.focusChat(); return; }
      if (e.code === "Space" && this.social.net) { e.preventDefault(); return; } // a shared realm never pauses
      if (e.code === "Space") { e.preventDefault(); this.paused = !this.paused; $("#pausedTag").classList.toggle("hidden", !this.paused); }
      if (e.code === "KeyE" || (e.code === "KeyF" && !this.hold.active)) this.interact();
      if (e.code === "KeyX") {
        if (this.nearestInteract(this.player)?.type === "surrender") this.interact(true);
        else this.useAssignedSkill("X", this.player);
      }
      if (e.code === "KeyY") this.useAssignedSkill("Y", this.player);
      if (e.code === "Tab") { e.preventDefault(); this.cycleTarget(); }
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 }[e.code];
      if (n !== undefined) this.useSlot(n);
    };
    addEventListener("keydown", this.onKey);
    addEventListener("keyup", this.onKey);
    let drag = null;
    el.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: 0, id: e.pointerId, touch: e.pointerType === "touch" };
      el.setPointerCapture(e.pointerId);
      // long-press on touch opens the pie menu (right-click on desktop)
      if (e.pointerType === "touch") {
        const d = drag;
        clearTimeout(this._lp);
        this._lp = setTimeout(() => { if (drag === d && d.moved < 18) { d.moved = 999; this.social.contextAt(d.x, d.y); } }, 550);
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      if (drag.moved === 999) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY));
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.touch && drag.moved < 18) return;
      this.camYaw -= dx * 0.006;
      this.camPitch = clamp(this.camPitch + dy * 0.004, 0.08, this.interiors?.active ? .46 : 1.25);
    });
    el.addEventListener("pointerup", (e) => {
      clearTimeout(this._lp);
      if (drag && drag.id === e.pointerId && drag.moved < (drag.touch ? 18 : 8)) {
        if (e.button === 2) this.social.contextAt(e.clientX, e.clientY);
        else this.clickAt(e.clientX, e.clientY);
      }
      drag = null;
    });
    el.addEventListener("pointercancel", () => { clearTimeout(this._lp); drag = null; });
    el.addEventListener("wheel", (e) => { this.camDist = clamp(this.camDist + e.deltaY * 0.01, this.interiors?.active ? 1.15 : 3.5, this.interiors?.active ? 1.9 : 22); }, { passive: true });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    // touch stick
    const stick = $("#stick"), knob = stick.firstElementChild;
    this.stickV = { x: 0, y: 0 };
    let sid = null;
    const sm = (e) => {
      const r = stick.getBoundingClientRect();
      let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      this.stickV = { x, y };
      knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
    };
    stick.addEventListener("pointerdown", (e) => { e.preventDefault(); sid = e.pointerId; stick.setPointerCapture(sid); sm(e); e.stopPropagation(); });
    stick.addEventListener("pointermove", (e) => { if (e.pointerId === sid) { e.preventDefault(); sm(e); } });
    const se = (e) => { if (e && sid !== null && e.pointerId !== sid) return; sid = null; this.stickV = { x: 0, y: 0 }; knob.style.transform = ""; };
    stick.addEventListener("pointerup", se); stick.addEventListener("pointercancel", se);
    stick.addEventListener("lostpointercapture", se);
    $("#moveChoice").querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => {
      this.moveMode = b.dataset.move;
      localStorage.setItem("ur.mobileMove", this.moveMode);
      this.movePrompt = false;
      $("#moveChoice").classList.add("hidden");
      this.setMoveMode(this.moveMode);
      stopSpeech();
    }));
    $("#tAct").onclick = () => this.useSlot(0);
    $("#tUse").onclick = () => this.interact();
    $("#prompt").onclick = (e) => {
      if (e.target.closest('[data-finish]')) this.interact(true);
      else if (e.currentTarget.dataset.action === "attack") this.attackOrInteract(this.player);
      else this.interact();
    };
    $("#menuBtn").onclick = () => this.toggleMenu();
  }
  pickInteractAt(x, y) {
    let best = null, bestPx = 52;
    const consider = (t, pos, lift = .5) => {
      if (pos.distanceTo(this.player.pos) > 28) return;
      const point = this.project(TMP.copy(pos).setY(pos.y + lift));
      if (!point.visible) return;
      const px = Math.hypot(point.x - x, point.y - y);
      if (px < bestPx) { bestPx = px; best = t; }
    };
    for (const n of Object.values(this.npcs)) {
      if (n.dead || !n.model.object.visible) continue;
      consider({ type: "npc", key: n.npc, actor: n }, n.pos, 1);
    }
    for (const a of this.combat.actors) if (a.dialogueNpc && a.parleyNeutral && a.alive && a.model.object.visible) {
      consider({ type: "npc", key: a.dialogueNpc, actor: a }, a.pos, 1);
    }
    for (const a of this.combat.actors) if (a.caveBoss && a.parleyNeutral && a.alive && a.model.object.visible)
      consider({ type: "cave_boss", actor: a }, a.pos, 1);
    for (const n of this.combat.actors) if (n.companion && !n.dead && n.model.object.visible) {
      consider({ type: "npc", key: n.companion, actor: n }, n.pos, 1);
    }
    for (const citizen of this.citizens) if (citizen.model.object.visible) {
      consider({ type: "citizen", key: citizen.npc, actor: citizen }, citizen.pos, 1);
    }
    for (const a of this.combat.actors) if (a.team === "enemy" && a.surrendered && !a.dead && a.model.object.visible) {
      consider({ type: "surrender", actor: a }, a.pos, 1);
    }
    for (const [id, actor] of this.corpses?.actors || []) if (actor.model.object.visible)
      consider({ type: "corpse", id, actor }, actor.pos, .35);
    for (const it of this.world.interactables) {
      if (it.hidden) continue;
      consider({ type: "it", it }, it.pos, it.kind === "gather" ? .35 : .7);
    }
    for (const horse of this.horses?.horses.values() || []) if (horse.model.root.visible && horse.deadUntil < Date.now())
      consider({ type: "horse", horse }, horse.pos, 1.5);
    for (const pet of this.wildlife?.pets.values() || []) if (pet.model.root.visible && !pet.dead)
      consider({ type: "pet", pet }, pet.pos, pet.kind === "bat" ? 1.5 : .7);
    return best ? { target: best, distance: bestPx } : null;
  }
  clickAt(x, y) {
    if (this.localPlayer2 && !this.conversationListener && (innerWidth < 700 ? y >= innerHeight / 2 : x >= innerWidth / 2)) return;
    if (this.dialogue.open || this.interiors?.dialogOpen || this.wands.active || this.caveParleyOpen || this.paused || this.menuOpen || this.movePrompt || this.holdPause
      || !$("#horsePanel").classList.contains("hidden") || !$("#petPanel").classList.contains("hidden") || !$("#corpsePanel").classList.contains("hidden")) return;
    const remote = this.social?.pickAt(x, y);
    if (remote?.type === "player" && this.social.canAttackRemote(remote.r) && remote.r.pos.distanceTo(this.player.pos) <= 30) {
      this.social.attackRemote(remote.r);
      return;
    }
    let best = null, bd = 46;
    for (const a of this.combat.actors) {
      if (a.player || (a.dead && !a.corpseId) || !a.model.object.visible) continue;
      const p = this.project(a.dead ? TMP.copy(a.pos).setY(a.pos.y + .35) : a.chest(TMP));
      if (!p.visible) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = a; }
    }
    if (this.mobile) {
      const picked = this.pickInteractAt(x, y);
      const actorTarget = best?.dead && best.corpseId ? { type: "corpse", id: best.corpseId, actor: best } : best?.npc || best?.companion || (best?.dialogueNpc && best.parleyNeutral)
        ? { type: "npc", key: best.npc || best.companion || best.dialogueNpc, actor: best }
        : best?.surrendered ? { type: "surrender", actor: best } : null;
      const target = actorTarget && (!picked || bd < picked.distance) ? actorTarget
        : picked && (!best || picked.distance <= bd) ? picked.target : null;
      if (target) {
        const pos = this.interactionPosition(target);
        if (pos.distanceTo(this.player.pos) <= 3.2) this.interact(false, target);
        else {
          this.player.autoMove = null;
          this.tapTarget = null;
          this.pendingInteract = { target, expires: performance.now() + 10000 };
        }
        return;
      }
      this.pendingInteract = null;
    }
    if (!this.mobile && !best) {
      const picked = this.pickInteractAt(x, y)?.target;
      if (["citizen", "horse", "pet", "corpse"].includes(picked?.type) || (picked?.type === "it" && picked.it.kind === "stable")) {
        if (this.interactionPosition(picked).distanceTo(this.player.pos) > 3.2) return;
        this.interact(false, picked);
        return;
      }
    }
    if (!best) {
      if (this.mobile && this.moveMode === "tap") {
        this.player.autoMove = null;
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), this.camera);
        const point = this.world.rayGround(ray.ray.origin, ray.ray.direction);
        if (point && point.distanceTo(this.player.pos) < 100) this.tapTarget = point;
      }
      return;
    }
    if (best.dead && best.corpseId) { if (best.pos.distanceTo(this.player.pos) <= 3.2) this.interact(false, { type: "corpse", id: best.corpseId, actor: best }); return; }
    if (best.caveBoss && best.parleyNeutral && best.pos.distanceTo(this.player.pos) < 3.2) this.interact(false, { type: "cave_boss", actor: best });
    else if (best.dialogueNpc && best.parleyNeutral && best.pos.distanceTo(this.player.pos) < 3.2) this.interact(false, { type: "npc", key: best.dialogueNpc, actor: best });
    else if (best.team === "enemy") { this.player.target = best; if (!best.surrendered) this.useSlot(0); }
    else if (best.npc && best.pos.distanceTo(this.player.pos) < 3.2) this.interact();
    else if (best.companion && best.pos.distanceTo(this.player.pos) < 3.2) this.interact(false, { type: "npc", key: best.companion, actor: best });
    else if (this.mobile && this.moveMode === "tap") { this.player.autoMove = null; this.tapTarget = best.pos.clone(); }
  }
  setMoveMode(mode) {
    $("#stick")?.classList.toggle("hidden", !this.mobile || mode !== "analog");
    if (mode !== "analog") this.stickV = { x: 0, y: 0 };
  }
  cycleTarget(actor = this.player) {
    const foes = this.combat.actors.filter((a) => a.hostile && a.pos.distanceTo(actor.pos) < 30).sort((a, b) => a.pos.distanceTo(actor.pos) - b.pos.distanceTo(actor.pos));
    if (!foes.length) return;
    const i = foes.indexOf(actor.target);
    actor.target = foes[(i + 1) % foes.length];
  }
  useSlot(n, actor = this.player) {
    this.useAbility(actor?.stats?.abilities?.[n], actor);
  }
  useAbility(key, actor = this.player) {
    if (this.paused || (this.conversationActive() && (!this.localPlayer2 || this.conversationActor === actor || this.conversationListener === actor))
      || (this.holdPause && (!this.localPlayer2 || !this.holdOwner || this.holdOwner === actor)) || this.horses?.viewer === actor || this.wildlife?.viewer === actor || this.social?.sheetActor === actor) return;
    const p = actor;
    if (actor === this.player) { this.tapTarget = null; this.pendingInteract = null; }
    if (!key || !p?.stats?.abilities?.includes(key)) return;
    if (key === "shield_bash" && !this.social.actorState(actor).equipment?.shield) {
      this.log("Equip a shield to use Shield Bash.", "fail");
      return;
    }
    const ab = ABILITIES[key];
    let t = p.target && p.target.alive && !p.target.dead && p.target.team === "enemy" && !p.target.surrendered ? p.target : null;
    if (ab.kind === "heal") t = p;
    if (!t && !ab.self && ab.kind !== "heal") { t = this.combat.nearestFoe(p, Math.max(ab.range + 6, 14)); p.target = t; }
    if (!t && !ab.self && ab.kind !== "heal") { this.log("No target in reach."); return; }
    if (!ab.self && ab.kind !== "heal" && !this.combat.inRange(p, key, t)) {
      p.autoMove = { key, t };
      return;
    }
    if (!this.combat.use(p, key, t, true)) {
      if (!this.combat.canUse(p, key) && ab.cost && p.res < ab.cost) this.log(`Not enough ${p.stats.resource.name} for ${ab.name}.`);
    }
  }
  toggleMenu(actor = this.player) {
    this.menuOpen = !this.menuOpen;
    $("#pause").classList.toggle("hidden", !this.menuOpen);
    if (this.menuOpen) {
      this.closeSkillWheel(this.player);
      if (this.localPlayer2) this.closeSkillWheel(this.localPlayer2);
      const s = actor?.sheet || this.sheet, st = actor?.stats || this.player.stats;
      const state = actor === this.localPlayer2 && this.p2SaveId ? this.p2State : this.state;
      const morality = actor === this.localPlayer2 && this.p2SaveId ? this.morality2 : this.morality;
      $("#sheet").innerHTML = `<b>${s.name}</b> · Level ${s.level} ${ANCESTRIES[s.ancestry]?.name || ""} ${CLASSES[s.class]?.name}<br>
        Health <b>${Math.ceil(actor?.hp ?? this.player.hp)}/${st.maxHp}</b> · Guard <b>${st.guard}</b> · Reflex <b>${st.reflex}</b> · Fortitude <b>${st.fortitude}</b> · Resolve <b>${st.resolve}</b><br>
        XP <b>${s.xp}</b> · Gold <b>${state.gold}</b> · Fortune <b>${state.fortune}</b><br>
        ${morality.stage.name} (${morality.M}) · Renown: ${morality.title}<br>
        <small>${QUEST_TEXT.bitter_medicine.steps[this.state.main]}</small>`;
      $("#pauseInfo").textContent = "";
    }
  }

  // ---------- HUD ----------
  setupHUD() {
    this.buildHotbar();
    $("#p2packBtn").onclick = () => { if (this.localPlayer2) this.social.toggleInv(undefined, this.localPlayer2); };
    $("#p2sheetBtn").onclick = () => { if (this.localPlayer2) this.social.toggleSheet(undefined, this.localPlayer2); };
    this.renderQuest();
    this.renderMorality();
    this.renderFortune();
    this.renderParty();
    $("#resume").onclick = () => this.toggleMenu();
    $("#saveNow").onclick = async () => { await this.save(); $("#pauseInfo").textContent = "Saved."; };
    $("#quit").onclick = async () => { await this.save(); await this._npcMemoryQueue?.catch((error) => console.warn(error)); this.destroy(); this.onQuit?.(); };
    $("#actEndGo").onclick = () => { $("#actEnd").classList.add("hidden"); this.paused = false; };
  }
  buildHotbar() {
    const hb = $("#hotbar");
    hb.innerHTML = "";
    this.slots = this.player.stats.abilities.map((k, i) => {
      const ab = ABILITIES[k];
      const d = document.createElement("div");
      d.className = "slot";
      d.title = ab.name;
      d.innerHTML = `${this.mobile ? "" : `<kbd>${i + 1}</kbd>`}${ab.cost ? `<span class="cost">${ab.cost}</span>` : ""}${ab.icon || "•"}<div class="cd" style="transform:scaleY(0)"></div><span class="nm">${ab.name}</span>`;
      d.onclick = () => this.useSlot(i);
      hb.append(d);
      return { d, k, cd: d.querySelector(".cd") };
    });
    this.refreshHotbarBindings();
  }
  buildP2Hotbar() {
    const hb = $("#p2hotbar"), actor = this.localPlayer2;
    hb.replaceChildren(); this.slots2 = [];
    if (!actor) return;
    for (const [i, key] of actor.stats.abilities.slice(0, 4).entries()) {
      const ab = ABILITIES[key];
      if (!ab) continue;
      const slot = document.createElement("button");
      slot.type = "button"; slot.className = "slot"; slot.title = ab.name;
      slot.innerHTML = `<kbd>${["RT", "X", "Y", "←"][i]}</kbd>${ab.cost ? `<span class="cost">${ab.cost}</span>` : ""}${ab.icon || "•"}<div class="cd"></div><span class="nm">${ab.name}</span>`;
      slot.onclick = () => this.useSlot(i, actor);
      hb.append(slot); this.slots2.push({ d: slot, k: key, cd: slot.querySelector(".cd") });
    }
    this.refreshHotbarBindings();
  }
  renderQuest() {
    const S = this.state;
    const side = Object.entries(S.quests).filter(([k, v]) => v === "open" && QUEST_TEXT[k]).map(([k]) => `<div style="opacity:.7;font-size:.8rem">· ${QUEST_TEXT[k].name}</div>`).join("")
      + (this.journal?.open() || []).map(q => `<div style="opacity:.7;font-size:.8rem">· ${String(q.title).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c])}</div>`).join("");
    $("#quest").innerHTML = `<small>Bitter Medicine</small>${QUEST_TEXT.bitter_medicine.steps[S.main]}${side}`;
  }
  renderMorality() {
    const M = this.morality.M;
    $(".m-mark").style.left = ((M + 100) / 2) + "%";
    $(".m-label").textContent = this.morality.stage.name;
  }
  renderFortune() { $("#fortune").innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < this.state.fortune ? "full" : ""}"></i>`).join(""); }
  renderParty() {
    const list = this.combat.actors.filter((a) => a.team === "party");
    const pets = [...(this.wildlife?.pets.values() || [])].filter(p => (p.owner === this.wildlife.userId || (this.localPlayer2 && p.owner === "local:2")) && !p.dead);
    $("#party").innerHTML = list.map((a) => `<div class="pm"><div class="dot" style="background:${a.model.look?.gear || "#555"}"></div>${a.name} <span class="lvl">${a.sheet?.level || 1}</span><div class="ph"><i data-id="${a.id}"></i></div></div>`).join("")
      + pets.slice(0,4).map(p => `<div class="pm"><div class="dot" style="background:#92ba82"></div>${p.kind[0].toUpperCase()+p.kind.slice(1)} <span class="lvl">pet</span><div class="ph"><i data-pet="${p.id}"></i></div></div>`).join("")
      + (pets.length > 4 ? `<div class="pm other">+${pets.length-4} pets</div>` : "");
  }
  updateHUD() {
    const p = this.player, st = p.stats;
    const hp = $("#bars .hp");
    hp.querySelector(".fill").style.width = (p.hp / st.maxHp) * 100 + "%";
    hp.querySelector("span").textContent = `${Math.ceil(p.hp)} / ${st.maxHp}`;
    const R = st.resource;
    const res = $("#bars .res");
    res.querySelector(".fill").style.width = R.max ? (p.res / R.max) * 100 + "%" : "0";
    res.querySelector(".fill").style.background = R.color || "";
    res.querySelector("span").textContent = R.max ? `${R.name} ${Math.floor(p.res)} / ${R.max}` : "";
    const swim = $("#bars .swim");
    swim.classList.toggle("hidden", !p.swimming);
    if (p.swimming) {
      const max = swimCapacity(p.sheet.attrs, p.sheet.level);
      swim.querySelector(".fill").style.width = (p.swimStamina / max) * 100 + "%";
      const action = p.model.swimMode === "tread" ? "Treading" : p.model.swimMode === "sprint" ? "Sprint swim" : "Swimming";
      swim.querySelector("span").textContent = `${action} · ${Math.ceil(p.swimStamina)} / ${max}`;
      swim.classList.toggle("low", p.swimStamina < max * 0.25);
    }
    const L = this.sheet.level || 1, x0 = XP_TABLE[L] || 0, x1 = XP_TABLE[L + 1] || x0 + 1;
    $("#bars .xp .fill").style.width = clamp(((this.sheet.xp - x0) / (x1 - x0)) * 100, 0, 100) + "%";
    for (const s of this.slots) {
      const ab = ABILITIES[s.k];
      const cd = p.cd[s.k] || 0;
      s.cd.style.transform = `scaleY(${ab.cooldown ? cd / ab.cooldown : 0})`;
      s.d.classList.toggle("locked", !!ab.cost && p.res < ab.cost);
      s.d.classList.toggle("on", p.cast?.key === s.k);
    }
    for (const a of this.combat.actors) if (a.team === "party") { const i = $(`#party i[data-id="${a.id}"]`); if (i) i.style.width = (a.hp / a.stats.maxHp) * 100 + "%"; }
    if (this.localPlayer2) {
      const p2 = this.localPlayer2;
      const hp2 = $("#p2hud .p2-hp");
      hp2.querySelector(".fill").style.width = clamp(p2.hp / p2.stats.maxHp * 100, 0, 100) + "%";
      hp2.querySelector("span").textContent = `${Math.ceil(Math.max(0, p2.hp))} / ${p2.stats.maxHp}`;
      const res2 = $("#p2hud .p2-res"), resource2 = p2.stats.resource;
      res2.querySelector(".fill").style.width = resource2.max ? clamp(p2.res / resource2.max * 100, 0, 100) + "%" : "0%";
      res2.querySelector(".fill").style.background = resource2.color || "";
      res2.querySelector("span").textContent = resource2.max ? `${resource2.name} ${Math.floor(p2.res)} / ${resource2.max}` : "";
      const p2swim = $("#p2hud .p2-swim");
      p2swim.classList.toggle("hidden", !p2.swimming);
      if (p2.swimming) {
        const max = swimCapacity(p2.sheet.attrs, p2.sheet.level);
        p2swim.querySelector(".fill").style.width = (p2.swimStamina / max) * 100 + "%";
        const action = p2.model.swimMode === "tread" ? "Treading" : p2.model.swimMode === "sprint" ? "Sprint swim" : "Swimming";
        p2swim.querySelector("span").textContent = `${action} · ${Math.ceil(p2.swimStamina)} / ${max}`;
      }
      for (const slot of this.slots2 || []) {
        const ab = ABILITIES[slot.k], cd = p2.cd[slot.k] || 0;
        slot.cd.style.transform = `scaleY(${ab.cooldown ? cd / ab.cooldown : 0})`;
        slot.d.classList.toggle("locked", !!ab.cost && p2.res < ab.cost);
        slot.d.classList.toggle("on", p2.cast?.key === slot.k);
      }
      const nearbyFoe = this.combat.nearestFoe(p2, 3.4);
      const action = this.canListen(p2) ? { label: "Listen in" } : this.conversationListener === p2 ? { label: "Stop listening" }
        : nearbyFoe?.hostile ? { label: `Attack ${nearbyFoe.name}` } : this.nearestInteract(p2);
      const prompt = $("#p2prompt");
      prompt.textContent = action ? `${this.conversationListener === p2 ? "B" : "A"} · ${action.label}` : "";
      prompt.classList.toggle("hidden", !action);
    }
    for (const pet of this.wildlife?.pets.values() || []) if (pet.owner === this.wildlife.userId || (this.localPlayer2 && pet.owner === "local:2")) { const i = $(`#party i[data-pet="${pet.id}"]`); if (i) i.style.width = (pet.hp / (pet.kind === "dog" ? 18 : pet.kind === "cat" ? 10 : pet.kind === "bat" ? 8 : 6)) * 100 + "%"; }
    // prompt
    const listen = this.canListen(this.player);
    const blocked = this.conversationActive() && (!this.localPlayer2 || this.conversationActor === this.player || this.conversationListener === this.player);
    const nearbyFoe = this.controllerSlots.size ? this.combat.nearestFoe(this.player, 3.4) : null;
    const t = listen || blocked || this.horses?.viewer === this.player || this.wildlife?.viewer === this.player || (!$("#corpsePanel").classList.contains("hidden") && this.corpses.viewer === this.player) ? null
      : nearbyFoe?.hostile ? { type: "attack", label: `Attack ${nearbyFoe.name}` } : this.nearestInteract();
    const pr = $("#prompt");
    pr.dataset.action = t?.type || "";
    if (t || listen) {
      const html = listen ? `<kbd>A</kbd>Listen in` : t.type === "attack" ? `<kbd>A</kbd>${t.label}` : this.mobile
        ? t.type === "surrender"
          ? `<button type="button">Spare ${t.actor.name}</button><button type="button" data-finish="true">Finish</button>`
          : t.label
        : `<kbd>E</kbd>${t.label}`;
      if (pr._html !== html) { pr.innerHTML = html; pr._html = html; }
      pr.classList.remove("hidden");
    } else pr.classList.add("hidden");
    // region / compass
    const reg = this.world.regionAt(p.pos.x, p.pos.z);
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const heading = dirs[(Math.round(((Math.PI - this.camYaw) / (Math.PI * 2)) * 8) % 8 + 8) % 8];
    $("#compass").textContent = `${reg.toUpperCase()} · ${heading} · ${this.state.gold}g`;
    if (reg !== this.lastRegion) {
      if (this.lastRegion) this.toast(reg, this.inDungeon ? "" : reg === "Marrowgate" ? "City of the Old Road" : "");
      this.lastRegion = reg;
      if (reg === "Marrowgate") this.setMain("marrowgate");
    }
  }
  updatePlates() {
    const seen = new Set();
    const cam = this.camera.position;
    for (const a of this.combat.actors) {
      if (a.player || (a.dead && a.team !== "npc")) continue;
      const d = a.pos.distanceTo(cam);
      if (d > (a.npc ? 26 : 34) || !a.model.object.visible) continue;
      const p = this.project(TMP.copy(a.pos).setY(a.pos.y + (a.model.height || 1.6) + 0.35));
      if (!p.visible) continue;
      seen.add(a.id);
      let el = this.plates.get(a.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "nameplate " + (a.npc ? "npc" : a.companion ? "" : a.boss ? "boss" : a.champion || a.unique ? "champion" : "enemy");
        $("#dice").append(el);
        this.plates.set(a.id, el);
      }
      const isT = this.player.target === a;
      const html = a.npc ? `${NPCS[a.npc].name}<div class="intent" style="color:#d9c9a0">${NPCS[a.npc].role}</div>`
        : `${isT ? "◆ " : ""}${a.name}${a.surrendered ? " (yields)" : ""}${a.team === "enemy" ? `<i><b style="width:${(a.hp / a.stats.maxHp) * 100}%"></b></i>` : ""}${a.intent ? `<div class="intent">${a.intent}</div>` : ""}`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      el.style.left = p.x + "px"; el.style.top = p.y + "px";
    }
    for (const [id, el] of this.plates) if (!seen.has(id)) { el.remove(); this.plates.delete(id); }
  }
  log(t, c = "") {
    const d = document.createElement("div");
    d.textContent = t;
    if (c) d.className = c;
    const L = $("#log");
    L.append(d);
    while (L.children.length > 9) L.firstChild.remove();
  }
  toast(title, sub = "") {
    const t = $("#toast");
    t.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ""}`;
    t.classList.add("show");
    const spoken = [title, sub].filter(Boolean).join(". ");
    speakText(spoken);
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove("show"), 2800);
  }
  project(v) {
    const split = !!(this.localPlayer2 && this.camera2 && !this.conversationListener);
    const second = this.conversationListener ? this.conversationActor === this.localPlayer2
      : split && v.distanceToSquared(this.localPlayer2.pos) < v.distanceToSquared(this.player.pos);
    TMP2.copy(v).project(second ? this.camera2 : this.camera);
    let x = (TMP2.x * .5 + .5) * innerWidth, y = (-TMP2.y * .5 + .5) * innerHeight;
    if (split) {
      if (innerWidth < 700) y = (second ? .5 : 0) * innerHeight + y * .5;
      else x = (second ? .5 : 0) * innerWidth + x * .5;
    }
    return { x, y, visible: TMP2.z < 1 && TMP2.z > -1 };
  }

  // ---------- per-frame ----------
  padForSlot(slot) {
    const entry = [...this.controllerSlots].find(([, value]) => value === slot);
    const pad = entry ? this.controllerStates.get(entry[0]) : null;
    return pad?.inUI ? null : pad;
  }
  updateSwimming(p, dt) {
    if (!p) return;
    const max = swimCapacity(p.sheet?.attrs || this.sheet.attrs, p.sheet?.level || this.sheet.level);
    p.swimStamina = clamp(p.swimStamina ?? max, 0, max);
    const deep = this.world.waterDepthAt(p.pos.x, p.pos.z) >= SWIM_DEPTH;
    if (!p.alive || p.riding || !deep) {
      p.swimming = false;
      p.model.swimMode = null;
      if (p.alive && !deep) p.swimStamina = Math.min(max, p.swimStamina + SWIM_RECOVERY * dt);
      return;
    }
    p.swimming = true;
    const mode = p.moving > 0.05 ? (p.swimSprint ? "sprint" : "swim") : "tread";
    p.model.swimMode = mode;
    p.pos.y = Math.max(this.world.surfaceHeightAt(p.pos.x, p.pos.z), this.world.waterSurface - 1.05);
    p.swimStamina = Math.max(0, p.swimStamina - swimDrain(mode) * dt);
    if (p.swimStamina === 0) this.washAshore(p);
  }
  washAshore(p) {
    const fromX = p.pos.x, fromZ = p.pos.z;
    const shore = nearestShore(this.world, fromX, fromZ, HALF - 1) || this.world.spots.respawn;
    const distance = shore.distance ?? Math.hypot(shore.x - fromX, shore.z - fromZ);
    const damage = Math.min(Math.max(0, p.hp - 1), Math.ceil(2 + distance * 0.55));
    p.pos.set(shore.x, this.world.surfaceHeightAt(shore.x, shore.z), shore.z);
    this.world.col.resolve(p.pos, p.radius);
    if (this.world.waterDepthAt(p.pos.x, p.pos.z) >= SWIM_DEPTH) p.pos.set(shore.x, 0, shore.z);
    p.pos.y = this.world.surfaceHeightAt(p.pos.x, p.pos.z);
    p._teleport = true;
    p.hp -= damage;
    p.swimming = false; p.model.swimMode = null; p.moving = 0; p.autoMove = null;
    if (p === this.player) { this.tapTarget = null; this.pendingInteract = null; }
    this.toast("Washed ashore", damage
      ? `${p.name} loses ${damage} health after ${Math.round(distance)}m in the water`
      : `${p.name} survives with one health`);
    this.save();
  }
  movePlayer(dt) {
    const p = this.player;
    if (!p.alive || p.cast) { if (p.cast) p.moving = 0; return; }
    let f = 0, s = 0;
    const K = this.keys;
    if (K.has("KeyW") || K.has("ArrowUp")) f += 1;
    if (K.has("KeyS") || K.has("ArrowDown")) f -= 1;
    if (K.has("KeyA") || K.has("ArrowLeft")) s -= 1;
    if (K.has("KeyD") || K.has("ArrowRight")) s += 1;
    if (this.stickV.x || this.stickV.y) { f = -this.stickV.y; s = this.stickV.x; }
    const pad = this.padForSlot(1);
    if (pad && Math.hypot(pad.axes[0], pad.axes[1]) > .03) { f = -pad.axes[1]; s = pad.axes[0]; }
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    // camera-relative: forward (fx, fz), right (−fz, fx)
    const dx = fx * f - fz * s, dz = fz * f + fx * s;
    const mag = Math.min(1, Math.hypot(f, s));
    const riding = !!this.horses?.mounted;
    p.riding = riding;
    p.swimSprint = !riding && mag > 0.05 && (K.has("ShiftLeft") || K.has("ShiftRight") || !!pad?.buttons[10] || !!pad?.buttons[6] || (this.mobile && mag > .82));
    if (!riding) this.horseDriveSpeed = 0;
    else this.horseDriveSpeed = THREE.MathUtils.damp(this.horseDriveSpeed,
      K.has("ShiftLeft") || K.has("ShiftRight") || !!pad?.buttons[10] || !!pad?.buttons[6] || (this.mobile && mag > .82) ? 11 : 6.8, 3.2, dt);
    const swimming = !riding && this.world.waterDepthAt(p.pos.x, p.pos.z) >= SWIM_DEPTH;
    const travelSpeed = riding ? this.horseDriveSpeed : p.stats.speed * (swimming ? 0.5 : 1);
    if (mag > 0.05) {
      this.tapTarget = null;
      this.pendingInteract = null;
      p.autoMove = null;
      const sprint = p.swimSprint ? 1.45 : 1;
      this.combat.move(p, dx, dz, travelSpeed * mag * sprint * (this.combat.inCombat ? 0.85 : 1), dt);
      this.stepT -= dt * mag * sprint;
      if (this.stepT < 0 && !riding && !swimming) { this.stepT = 0.36; this.audio.play("step", p.pos, { vol: 0.18 }); }
    } else if (p.autoMove) {
      const { key, t } = p.autoMove;
      if (!t.alive || t.dead) { p.autoMove = null; p.moving = 0; return; }
      if (this.combat.inRange(p, key, t)) { p.autoMove = null; p.moving = 0; this.combat.use(p, key, t, true); }
      else this.combat.move(p, t.pos.x - p.pos.x, t.pos.z - p.pos.z, travelSpeed, dt);
    } else if (this.pendingInteract) {
      const { target, expires } = this.pendingInteract;
      if (!this.interactionValid(target) || performance.now() > expires) {
        this.pendingInteract = null;
        p.moving = 0;
      } else {
        const pos = this.interactionPosition(target);
        const distance = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);
        if (distance < 2.4) {
          this.pendingInteract = null;
          p.moving = 0;
          this.interact(false, target);
        } else this.combat.move(p, pos.x - p.pos.x, pos.z - p.pos.z, travelSpeed * (this.combat.inCombat ? .85 : 1), dt);
      }
    } else if (this.tapTarget && this.mobile && this.moveMode === "tap") {
      const target = this.tapTarget;
      const dx = target.x - p.pos.x, dz = target.z - p.pos.z;
      if (Math.hypot(dx, dz) < 0.65) { this.tapTarget = null; p.moving = 0; }
      else this.combat.move(p, dx, dz, travelSpeed * (this.combat.inCombat ? 0.85 : 1), dt);
    } else p.moving = 0;
  }
  moveLocalPlayer2(dt) {
    const p = this.localPlayer2, pad = this.padForSlot(2);
    if (!p || !pad || !p.alive || p.cast) { if (p) p.moving = 0; return; }
    const f = -pad.axes[1], s = pad.axes[0], mag = Math.min(1, Math.hypot(f, s));
    const riding = !!this.horses?.mounted2;
    p.riding = riding;
    const sprint = !!(pad.buttons[10] || pad.buttons[6]);
    p.swimSprint = !riding && mag > .03 && sprint;
    this.horse2DriveSpeed = riding ? THREE.MathUtils.damp(this.horse2DriveSpeed, sprint ? 11 : 6.8, 3.2, dt) : 0;
    const travelSpeed = riding ? this.horse2DriveSpeed : p.stats.speed * (this.world.waterDepthAt(p.pos.x, p.pos.z) >= SWIM_DEPTH ? .5 : 1);
    if (mag > .03) {
      p.autoMove = null;
      const fx = -Math.sin(this.cam2Yaw), fz = -Math.cos(this.cam2Yaw);
      const dx = fx * f - fz * s, dz = fz * f + fx * s;
      this.combat.move(p, dx, dz, travelSpeed * mag * (p.swimSprint ? 1.45 : 1) * (this.combat.inCombat ? .85 : 1), dt);
    } else if (p.autoMove) {
      const { key, t } = p.autoMove;
      if (!t.alive || t.dead) p.autoMove = null;
      else if (this.combat.inRange(p, key, t)) { p.autoMove = null; this.combat.use(p, key, t, true); }
      else this.combat.move(p, t.pos.x - p.pos.x, t.pos.z - p.pos.z, travelSpeed, dt);
    } else p.moving = 0;
  }
  updateLocalCamera(dt, snap = false) {
    const p = this.localPlayer2;
    if (!p || !this.camera2) return;
    const look = p.pos.clone().add(new THREE.Vector3(0, 1.5 + (this.horses?.mounted2 ? 1.45 : 0), 0));
    const off = new THREE.Vector3(Math.sin(this.cam2Yaw) * Math.cos(this.cam2Pitch), Math.sin(this.cam2Pitch), Math.cos(this.cam2Yaw) * Math.cos(this.cam2Pitch)).multiplyScalar(this.cam2Dist);
    const want = look.clone().add(off);
    const inDialogue = this.conversationActor === p && this.conversationActive() && this.talking && !this.talking.dead;
    if (inDialogue) {
      const npc = this.talking.pos;
      const toward = new THREE.Vector3(p.pos.x - npc.x, 0, p.pos.z - npc.z).normalize();
      if (toward.lengthSq() < .01) toward.set(0, 0, 1);
      const side = new THREE.Vector3(-toward.z, 0, toward.x);
      if (this.dialogueSpeaker === "player") {
        want.copy(p.pos).addScaledVector(toward, -1.75).addScaledVector(side, -1.1);
        want.y = p.pos.y + 1.62; look.copy(p.pos).add(new THREE.Vector3(0, 1.47, 0));
      } else {
        want.copy(npc).addScaledVector(toward, 1.6).addScaledVector(side, .36);
        want.y = npc.y + 1.6; look.copy(npc).add(new THREE.Vector3(0, 1.48, 0));
      }
    } else if (!this.world.los(look, want, .9)) {
      for (let k = .85; k > .2; k -= .15) {
        const point = look.clone().addScaledVector(off, k);
        if (this.world.los(look, point, .9) || k < .3) { want.copy(point); break; }
      }
    }
    want.y = Math.max(want.y, this.world.heightAt(want.x, want.z) + .6);
    const ease = snap ? 1 : 1 - Math.exp(-dt * (inDialogue ? 4.5 : 9));
    this.cam2Pos.lerp(want, ease);
    this.cam2Look.lerp(look, snap ? 1 : 1 - Math.exp(-dt * 14));
    const fov = inDialogue ? 42 : 55;
    if (Math.abs(this.camera2.fov - fov) > .02) { this.camera2.fov = THREE.MathUtils.damp(this.camera2.fov, fov, 5, dt); this.camera2.updateProjectionMatrix(); }
    this.camera2.position.copy(this.cam2Pos);
    this.camera2.lookAt(this.cam2Look);
  }
  renderViews() {
    if (this.localPlayer2 && this.camera2 && this.conversationListener) {
      const camera = this.conversationActor === this.localPlayer2 ? this.camera2 : this.camera;
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      this.renderer.setViewport(0, 0, innerWidth, innerHeight);
      this.renderer.render(this.scene, camera);
      return;
    }
    if (!this.localPlayer2 || !this.camera2) {
      if (this.composer) { this.composer.render(); this.checkRenderHealth(); }
      else this.renderer.render(this.scene, this.camera);
      return;
    }
    const r = this.renderer, w = innerWidth, h = innerHeight, vertical = w < 700;
    const views = vertical
      ? [{ x: 0, y: Math.floor(h / 2), w, h: h - Math.floor(h / 2), camera: this.camera }, { x: 0, y: 0, w, h: Math.floor(h / 2), camera: this.camera2 }]
      : [{ x: 0, y: 0, w: Math.floor(w / 2), h, camera: this.camera }, { x: Math.floor(w / 2), y: 0, w: w - Math.floor(w / 2), h, camera: this.camera2 }];
    r.setScissorTest(true);
    for (const view of views) {
      view.camera.aspect = view.w / view.h;
      view.camera.updateProjectionMatrix();
      r.setViewport(view.x, view.y, view.w, view.h);
      r.setScissor(view.x, view.y, view.w, view.h);
      r.clear(true, true, true);
      r.render(this.scene, view.camera);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
  }
  updateCitizens(dt) {
    const cam = this.camera.position;
    for (const c of this.citizens) {
      const near = Math.min(c.pos.distanceTo(cam), this.camera2 ? c.pos.distanceTo(this.camera2.position) : Infinity) < 80;
      c.model.object.visible = near;
      if (!near) { // advance cheaply when out of view
        c.pauseT -= dt;
        continue;
      }
      if (c.pauseT > 0) { c.pauseT -= dt; c.model.speed = 0; }
      else {
        const tgt = c.path[c.k];
        const arrived = Math.hypot(tgt.x - c.pos.x, tgt.z - c.pos.z) < .6;
        if (arrived) {
          c.k = (c.k + c.dir + c.path.length) % c.path.length;
          c.routeFor = -1; c.route = []; c.model.speed = 0;
          if (Math.random() < .2) c.pauseT = 1.5 + Math.random() * 4;
        } else if (c.routeFor !== c.k || !c.route.length || c.stuckT > 1.2) {
          c.route = cityRoute(this.world, c.pos, tgt, .55);
          c.routeFor = c.k; c.stuckT = 0;
        }
        if (arrived) { c.model.speed = 0; }
        else if (!c.route.length) { c.model.speed = 0; c.pauseT = Math.max(c.pauseT, 1); c.k = (c.k + c.dir + c.path.length) % c.path.length; c.routeFor = -1; }
        else {
          const waypoint = c.route[0];
          const dx = waypoint.x - c.pos.x, dz = waypoint.z - c.pos.z, d = Math.hypot(dx, dz);
          if (d < .45) { c.route.shift(); c.model.speed = 0; }
          else {
            const sp = c.speed;
            const step = Math.min(d, sp * dt), ox = c.pos.x, oz = c.pos.z;
            const nx = c.pos.x + dx / Math.max(d, .001) * step, nz = c.pos.z + dz / Math.max(d, .001) * step;
            if (cityPointClear(this.world, nx, nz, .55) && cityLineClear(this.world, c.pos, { x: nx, z: nz }, .55)) {
              c.pos.x = nx; c.pos.z = nz;
            }
            const moved = Math.hypot(c.pos.x - ox, c.pos.z - oz);
            c.model.speed = moved / Math.max(dt, .001);
            c.stuckT = moved < .003 ? c.stuckT + dt : 0;
            if (moved > .003) {
              const ty = Math.atan2(c.pos.x - ox, c.pos.z - oz);
              let dy = ty - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
              c.yaw += dy * Math.min(1, dt * 6);
            }
          }
        }
      }
      c.pos.y = this.world.heightAt(c.pos.x, c.pos.z);
      c.model.object.position.copy(c.pos);
      c.model.object.rotation.y = c.yaw;
      c.model.lookAt = c.pos.distanceTo(this.player.pos) < 4 ? this.player.eye(TMP) : null;
      c.model.update(dt, { camera: this.camera, wind: this.wind, simulateHair: false });
    }
  }
  updateLampPool() {
    // a small pool of real lights follows the player through the city lamps
    const lamps = this.world.cityLamps || [];
    const n = this.tier.name === "high" ? 8 : this.tier.name === "medium" ? 5 : 2;
    if (!this.lampLights.length) {
      for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffa850, 0, 16, 1.6); this.scene.add(l); this.lampLights.push(l); }
      if (this.world.forgePos) { this.forge = new THREE.PointLight(0xff6a1a, 18, 10, 1.6); this.forge.position.copy(this.world.forgePos); this.scene.add(this.forge); }
    }
    const p = this.player.pos;
    const sorted = lamps.map((v) => [v, v.distanceToSquared(p)]).sort((a, b) => a[1] - b[1]);
    this.lampLights.forEach((l, i) => {
      const s = sorted[i];
      if (!s || s[1] > 60 * 60) { l.intensity = 0; return; }
      l.position.copy(s[0]);
      l.intensity = 9 * (0.04 + (1 - this.daylight) * .96);
    });
  }
  updateCamera(dt, snap = false) {
    const p = this.player;
    const look = TMP.copy(p.pos).setY(p.pos.y + 1.5);
    if (this.horses?.mounted) look.y += 1.45;
    const dist = this.camDist;
    const off = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch)).multiplyScalar(dist);
    const want = look.clone().add(off);
    const petFocus = this.wildlife?.active && !this.wildlife.active.dead ? this.wildlife.active : null;
    const inDialogue = ((this.dialogue.open || this.interiors?.dialogOpen || this.caveParleyOpen || this.gateIntroPlaying || this.wands.active) && (!this.localPlayer2 || this.conversationActor === p) && this.talking && !this.talking.dead) || petFocus;
    if (petFocus) {
      const animal=petFocus.pos;
      const towardPlayer=new THREE.Vector3(p.pos.x-animal.x,0,p.pos.z-animal.z).normalize();
      if (towardPlayer.lengthSq()<.01) towardPlayer.set(0,0,1);
      const side=new THREE.Vector3(-towardPlayer.z,0,towardPlayer.x);
      const eyeY=petFocus.kind==="bat" ? 1.65 : petFocus.kind==="dog" ? .84 : petFocus.kind==="cat" ? .62 : .42;
      want.copy(animal).addScaledVector(towardPlayer,petFocus.kind==="bat" ? 2.45 : 1.9).addScaledVector(side,.45);
      want.y=animal.y+eyeY+.35;
      look.copy(animal).add(new THREE.Vector3(0,eyeY,0));
    } else if (inDialogue) {
      const npc = this.talking.pos;
      const towardPlayer = new THREE.Vector3(p.pos.x - npc.x, 0, p.pos.z - npc.z).normalize();
      if (towardPlayer.lengthSq() < .01) towardPlayer.set(0, 0, 1);
      const side = new THREE.Vector3(-towardPlayer.z, 0, towardPlayer.x);
      if (this.dialogueSpeaker === "player") {
        want.copy(p.pos).addScaledVector(towardPlayer, -1.75).addScaledVector(side, -1.1);
        want.y = p.pos.y + 1.62 + (this.horses?.mounted ? 1.45 : 0);
        look.copy(p.pos).add(new THREE.Vector3(0, 1.47 + (this.horses?.mounted ? 1.45 : 0), 0));
      } else {
        want.copy(npc).addScaledVector(towardPlayer, 1.6).addScaledVector(side, .36);
        want.y = npc.y + 1.6;
        look.copy(npc).add(new THREE.Vector3(0, 1.48, 0));
      }
    } else if (!this.world.los(look, want, 0.9)) {
      // pull the exploration camera in against walls and terrain
      for (let k = 0.85; k > 0.2; k -= 0.15) { const w2 = look.clone().addScaledVector(off, k); if (this.world.los(look, w2, 0.9)) { want.copy(w2); break; } if (k < 0.3) want.copy(w2); }
    }
    want.y = Math.max(want.y, this.world.heightAt(want.x, want.z) + 0.6);
    const playerCloseup = this.dialogue.open && this.dialogueSpeaker === "player";
    const k = snap ? 1 : 1 - Math.exp(-dt * (playerCloseup ? 2.8 : inDialogue ? 4.5 : 9));
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, snap ? 1 : 1 - Math.exp(-dt * (playerCloseup ? 8 : 14)));
    const fov = inDialogue ? 42 : 55;
    if (Math.abs(this.camera.fov - fov) > .02) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 5, dt);
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // sun + shadows follow the player
    const lightFocus = this.interiors?.active && this.localPlayer2 && !this.interiors2?.active ? this.localPlayer2 : p;
    this.sun.position.copy(lightFocus.pos).addScaledVector(this.sunDir, 120);
    this.sun.target.position.copy(lightFocus.pos);
  }
  snapCamera() { this.updateCamera(0, true); }

  tuneGrass(now) {
    const perf = this.grassPerf;
    const frameMs = perf.last ? now - perf.last : 0;
    perf.last = now;
    if (document.hidden || this.inDungeon || this.paused || this.menuOpen || this.movePrompt) {
      perf.windowStart = now; perf.sum = perf.samples = 0;
      return;
    }
    if (frameMs >= 8 && frameMs < 250) { perf.sum += frameMs; perf.samples++; }
    if (now - perf.windowStart < 6000 || perf.samples < 30) return;
    const average = perf.sum / perf.samples;
    perf.windowStart = now; perf.sum = perf.samples = 0;
    const levels = ["low", "medium", "high"];
    const current = levels.indexOf(this.grassProfile);
    const ceiling = levels.indexOf(this.tier.name);
    let next = current;
    const sinceChange = now - perf.changed;
    const minScale = this.tier.name === "high" ? .75 : .8;
    if (average > 29 && current > 0) next--;
    else if (average > 27 && this.renderScale > minScale && sinceChange > 12000) {
      this.setRenderScale(Math.max(minScale, this.renderScale - .1));
      perf.changed = now;
    } else if (average < 17 && sinceChange > 24000) {
      if (this.renderScale < 1) {
        this.setRenderScale(Math.min(1, this.renderScale + .1));
        perf.changed = now;
      } else if (current < ceiling) next++;
    }
    if (next !== current) {
      this.grassProfile = levels[next];
      this.world.setGrassProfile(this.grassProfile);
      perf.changed = now;
    }
  }

  loop() {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    this.tuneGrass(performance.now());
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.wind = this.wind || new THREE.Vector3();
    const gust = .65 + .3 * Math.sin(t * .37) + .18 * Math.sin(t * 1.13);
    this.wind.set((.55 + Math.sin(t * .16) * .2) * gust, 0, (.25 + Math.cos(t * .12) * .25) * gust);
    const independentScene = !!this.localPlayer2;
    const sim = !this.paused && (!this.holdPause || (independentScene && !!this.holdOwner)) && !this.menuOpen && (independentScene || !this.dialogue.open) && (independentScene || !this.interiors?.dialogOpen) && (independentScene || !this.interiors?.busy) && (independentScene || !this.interiors2?.dialogOpen) && (independentScene || !this.wands.active) && (independentScene || !this.caveParleyOpen) && (independentScene || !this.gateIntroPlaying) && !this.movePrompt
      && (independentScene || !this.wildlife?.active) && (independentScene || $("#horsePanel").classList.contains("hidden")) && (independentScene || $("#petPanel").classList.contains("hidden")) && (independentScene || $("#corpsePanel").classList.contains("hidden"));
    const celestial = this.updateCelestial(t);
    this._nightEncounterT = Math.max(0, this._nightEncounterT - dt);
    if (sim) {
      if (this.conversationActor !== this.player && this.conversationListener !== this.player && this.corpses.viewer !== this.player && !this.interiors?.busy && this.holdOwner !== this.player && this.wildlife?.viewer !== this.player && this.horses?.viewer !== this.player && this.social?.sheetActor !== this.player) this.movePlayer(dt);
      if (this.conversationActor !== this.localPlayer2 && this.conversationListener !== this.localPlayer2 && this.corpses.viewer !== this.localPlayer2 && !this.interiors2?.busy && this.holdOwner !== this.localPlayer2 && this.wildlife?.viewer !== this.localPlayer2 && this.horses?.viewer !== this.localPlayer2 && this.social?.sheetActor !== this.localPlayer2) this.moveLocalPlayer2(dt);
      if (this.conversationActor !== this.player) this.updateSwimming(this.player, dt);
      if (this.conversationActor !== this.localPlayer2) this.updateSwimming(this.localPlayer2, dt);
      this.combat.update(dt, this.player, { camera: this.camera, secondCamera: this.camera2, localPlayers: [this.player, this.localPlayer2], wind: this.wind, viewDist: this.inDungeon ? 70 : 160, hairDist: 22 });
      this.maybeGallowmereEntry();
      this.maybeCaveParley();
      this.spawnNightHollows(celestial);
      this.corpses?.update(dt, celestial);
      this.morality.tick(dt);
      if (this.p2SaveId) this.morality2?.tick(dt);
      // dungeon edge
      const inD = this.world.inDungeon(this.player.pos.x, this.player.pos.z);
      if (inD !== this.inDungeon) this.setDungeon(inD);
      this.saveT += dt;
      if (this.saveT > 45 && !this.combat.inCombat) { this.saveT = 0; this.save(); }
    } else if (this.holdPause && this.player.downed && this.player.feedingHollow?.alive) {
      // Death-check prompts pause combat, but the Hollow keeps feeding in view.
      const hunter = this.player.feedingHollow;
      this.combat.enemyAI(hunter, dt, this.player);
      hunter.model.object.position.copy(hunter.pos);
      hunter.model.object.rotation.y = hunter.yaw;
      hunter.model.speed = hunter.moving || 0;
      hunter.model.update(dt, { camera: this.camera, wind: this.wind, simulateHair: false });
      this.player.model.update(dt, { camera: this.camera, wind: this.wind, simulateHair: false,
        groundWorld: this.world, groundAnchor: this.player.pos, hairGround: this.world });
    } else if ((this.dialogue.open || this.interiors?.dialogOpen || this.gateIntroPlaying || this.caveParleyOpen || this.wands.active) && this.talking) {
      // keep models alive while talking
      this.player.model.update(dt * 0.6, { camera: this.camera, wind: this.wind });
      if (this.talking !== this.interiors?.resident && !this.talking.npc?.startsWith("citizen_")) this.talking.model.update(dt * 0.6, { camera: this.camera, wind: this.wind });
    }
    const feedingPlayer = [this.player, this.localPlayer2].find(p => p?.downed && p.feedingHollow?.alive && p.feedingHollow.feeding === "consume");
    const corpseFeeder = this.combat.actors.find(a => a.kind === "hollow" && a.alive && a.feedingRecord && a.feedT > 0);
    const feeding = !this.paused && !this.menuOpen && !document.hidden && !!(feedingPlayer || corpseFeeder);
    if (feeding) {
      this.feedingBloodPoint ||= new THREE.Vector3();
      const body = corpseFeeder && this.corpses.records[corpseFeeder.feedingRecord];
      if (body) this.feedingBloodPoint.set(body.x, 0, body.z);
      else this.feedingBloodPoint.copy(this.combat.feedingPoint);
      this.feedingBloodPoint.y = this.world.surfaceHeightAt(this.feedingBloodPoint.x, this.feedingBloodPoint.z);
    }
    this.feedingFX?.update(dt, feeding ? this.feedingBloodPoint : this.player.pos, feeding);
    if (feeding && !this.feedingSound) this.feedingSound = this.audio.play("title-eating", this.feedingBloodPoint, { vol: .75, loop: true });
    else if (!feeding && this.feedingSound) { this.feedingSound.stop(); this.feedingSound = null; }
    this.horses?.update(dt);
    this.wildlife?.update(dt);
    if (!this.paused && !this.menuOpen && (!this.interiors?.active || this.interiors.inPlace || (this.localPlayer2 && !this.interiors2?.active))) this.updateCitizens(dt);
    this.interiors?.update(dt);
    this.interiors2?.update(dt);
    this.social.update(dt);
    if (Math.floor(t * 2) !== this._lampTick) { this._lampTick = Math.floor(t * 2); this.updateLampPool(); }
    if (this.forge) this.forge.intensity = 14 + Math.sin(t * 13) * 3 + Math.sin(t * 7.3) * 2;
    if (this.world.windowMat) this.world.windowMat.emissiveIntensity = 0.04 + (1 - this.daylight) * (0.4 + Math.sin(t * 0.7) * 0.03);
    if (this.inDungeon) {
      for (const light of this.world.lights) light.intensity = light.userData.baseIntensity * (0.91 + Math.sin(t*8 + light.position.x)*.07 + Math.sin(t*13 + light.position.z)*.025);
      if (this.torchLight.intensity > 0) this.torchLight.intensity = 29 + Math.sin(t*11)*2 + Math.sin(t*17)*.7;
    }
    this.updateCamera(dt);
    this.updateLocalCamera(dt);
    const outdoorFocus = this.interiors?.active && this.localPlayer2 && !this.interiors2?.active ? this.localPlayer2 : this.player;
    this.world.updateGrass(outdoorFocus.pos.x, outdoorFocus.pos.z, t, this.wind);
    this.world.updateFoliage(dt, t, this.wind, outdoorFocus.pos.x, outdoorFocus.pos.z);
    this.audio.update(this.camera, this.player.pos);
    if (this.torchLight) { this.torchLight.position.copy(this.player.pos); this.torchLight.position.y += 1.6; }
    this.dice.update(dt);
    // HUD queries and layout writes do not need the GPU's frame rate.
    if (t - (this._hudTick || 0) >= .05) { this._hudTick = t; this.updateHUD(); }
    if (t - (this._platesTick || 0) >= .033) { this._platesTick = t; this.updatePlates(); }
    this.renderViews();
  }

  // ---------- save ----------
  snapshot() {
    this.rememberLocalPlayer2();
    const p = this.player.pos;
    const state = { ...this.state, morality: this.morality.toJSON() };
    state.swimStamina = this.player.swimStamina;
    if (this.onlineMode) { delete state.hollowLoot; delete state.worldEpochMs; delete state.corpses; delete state.wands; }
    if (!this.onlineMode && this.horses) state.horses = this.horses.serialize();
    if (!this.onlineMode && this.wildlife) state.pets = this.wildlife.serialize();
    if (this.onlineMode) delete state.horses;
    if (this.onlineMode) delete state.pets;
    if (this.onlineMode) state.npcMemory = Object.fromEntries(Object.entries(this.state.npcMemory)
      .map(([key, memory]) => [key, { ...memory, events: memory.events?.slice(-2) || [] }]));
    return {
      ...this.data,
      version: 2,
      scene: "world",
      online: undefined,
      char: this.sheet,
      pos: { x: p.x, y: p.y, z: p.z },
      hp: this.player.hp,
      state,
      progress: { ...(this.data.progress || {}), act: 1, quest: "bitter_medicine", node: this.state.main, cutscene: { id: "act1-opening", step: 2, complete: true } },
    };
  }
  async save() {
    try {
      this.data = this.snapshot();
      const snapshot = this.data;
      this._saveQueue = (this._saveQueue || Promise.resolve()).catch(() => {}).then(() => this.saves.save(this.saveId, snapshot));
      await this._saveQueue;
      if (this.p2SaveId) await this.savePlayer2();
      else await this._p2SaveQueue;
    }
    catch (e) { console.warn("save failed", e); this.log("Save failed: " + (e.message || e), "fail"); }
  }
  destroy() {
    this.running = false;
    this.closeSkillWheel(this.player);
    if (this.localPlayer2) this.closeSkillWheel(this.localPlayer2);
    this.corpses?.close();
    this.interiors?.destroy();
    this.interiors2?.destroy();
    this.feedingSound?.stop();
    this.feedingFX?.dispose();
    this.groundItems?.destroy();
    this.horses?.destroy();
    this.wildlife?.destroy();
    if (this.wands) { this.wands.busy = false; this.wands.close(); }
    clearTimeout(this.gateIntroTimer);
    $("#gateCutscene")?.classList.add("hidden");
    stopSpeech();
    this.social?.destroy();
    this.controllerSlots.clear();
    this.controllerStates.clear();
    this.pendingCoop = null;
    $("#coopJoin")?.classList.add("hidden");
    document.body.classList.remove("split-game", "conversation-listening", "conversation-owner-p2", "hold-owner-p2");
    $("#padStatus")?.classList.add("hidden");
    $("#p2hud")?.classList.add("hidden");
    $("#p2prompt")?.classList.add("hidden");
    removeEventListener("keydown", this.onKey);
    removeEventListener("keyup", this.onKey);
    removeEventListener("resize", this.onResize);
    this.audio?.dispose();
    this.composer?.dispose();
    this.bloom?.dispose();
    this.outputPass?.dispose();
    for (const el of this.plates.values()) el.remove();
    this.dice?.dispose();
    this.hold?.dispose();
    $("#hud").classList.add("hidden");
    $("#pause").classList.add("hidden");
    $("#touch").classList.add("hidden");
    document.body.classList.remove("mobile-game");
    this.renderer?.dispose();
    $("#view").innerHTML = "";
  }
}
