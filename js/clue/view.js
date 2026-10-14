// Renderer: one scene, one or two first/third-person cameras (split screen),
// per-view line-of-sight fog of war, a key shadow light that follows each
// viewer, flickering lights, ghosts, corpses, props and WebXR.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SUSPECTS, SUSPECT_BY_ID, BUTLER, WEAPONS, WEAPON_BY_ID, COLS, ROWS, CELL, WALL_H, EYE, roomAtWorld, underground } from "./data.js";
import { TABLE, PROPS, PROP_RADIUS, SEATS, POOL, local, PUSHABLES, placePushable } from "./layout.js";
import { losClear, DOOR_LIST, DOOR_SWING } from "./nav.js";
import { buildMansion } from "./mansion3d.js";
import { buildDungeon, buildTrapdoors } from "./dungeon3d.js";
import { buildLandscape } from "./landscape.js";
import { propMesh, tintItem } from "./props3d.js";
import { Blood } from "./blood3d.js";
import { loadKit, Avatar, Corpse, chalkOutline } from "./avatars.js";
import { computeVis, uploadVis, visAt, patchTree, FOW_UNIFORMS } from "./fow.js";
import { sfx, setUnderground, setExteriorRain } from "./audio.js";
import { loadGraphics, resolveGraphics } from "./graphics.js";
import { buildTaskObjects } from './tasks3d.js';
import { butlerTools } from './butler3d.js';
import { BALL_R } from './physics.js';
import { burnVisual, AshPiles } from './burn3d.js';

const SEAT_BY_ID = Object.fromEntries(SEATS.map((s) => [s.id, s]));
const W = COLS * CELL, D = ROWS * CELL;
const tmp = new THREE.Vector3();

const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x020203 });

// Keep the first-person camera at the original v12 eye placement for both
// gameplay and spectating.
function firstPersonPose(eye, yaw, pitch, outPos, outLook) {
  const fx = Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = Math.cos(yaw) * Math.cos(pitch);
  outPos.set(eye.x + Math.sin(yaw) * 0.14, eye.y, eye.z + Math.cos(yaw) * 0.14);
  outLook.set(outPos.x + fx, outPos.y + fy, outPos.z + fz);
}

export class View {
  constructor(el) {
    this.el = el;
    this.graphics = loadGraphics();
    this.q = resolveGraphics(this.graphics);
    this.pixelRatio = this.q.ratio;
    this.scaleTime = 0;
    this.scaleFrames = 0;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }));
    r.setPixelRatio(this.pixelRatio);
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = this.q.keyShadow > 0 || this.q.moonShadow;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.25;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.autoClear = false;
    r.xr.enabled = true;
    el.append(r.domElement);
    this.overlay = document.createElement("div");
    this.overlay.className = "overlay";
    el.append(this.overlay);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07070c);
    this.scene.fog = new THREE.FogExp2(0x0c0b14, 0.014);
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.avatars = new Map();
    this.corpses = new Map();
    this.chalk = new Map();
    this.cleared = new Set();
    this.props = new Map();
    this.bubbles = new Map();
    this.views = [];
    this.time = 0;
    this.titleStart = 0;
    this.flicker = false;
    this.blackout = 0;
    this.lightningT = 12 + Math.random() * 20;
    this.flash = 0;
    this.xrRig = new THREE.Group();
    this.xrCam = new THREE.PerspectiveCamera(70, 1, 0.05, 500);
    this.xrRig.add(this.xrCam);
    this.scene.add(this.xrRig);
    addEventListener("resize", () => this.renderer.setSize(innerWidth, innerHeight));
  }

  applyGraphics(settings) {
    this.graphics = { ...settings };
    this.q = resolveGraphics(settings);
    this.pixelRatio = this.q.ratio;
    this.scaleTime = this.scaleFrames = 0;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = this.q.keyShadow > 0 || this.q.moonShadow;
    if (this.mansion) {
      for (const [light, size] of [[this.mansion.key, this.q.keyShadow], [this.mansion.moon, this.q.shadowMap]]) {
        if (light.shadow.mapSize.x === size) continue;
        light.shadow.map?.dispose();
        light.shadow.map = null;
        light.shadow.mapSize.set(Math.max(1, size), Math.max(1, size));
      }
      this.mansion.key.castShadow = this.q.keyShadow > 0;
    }
    this.land?.setAtmosphere(settings.atmosphere);
    const seen = new Set();
    this.scene.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        for (const map of [m.map, m.normalMap, m.roughnessMap]) {
          if (!map || seen.has(map)) continue;
          seen.add(map);
          const next = Math.min(this.q.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
          if (map.anisotropy !== next) { map.anisotropy = next; map.needsUpdate = true; }
        }
      }
    });
  }

  adaptResolution(dt) {
    if (!this.graphics.adaptive || document.hidden || dt <= 0 || dt >= 0.09) return;
    this.scaleTime += dt;
    this.scaleFrames++;
    if (this.scaleTime < 2) return;
    const average = this.scaleTime / this.scaleFrames;
    const floor = Math.min(this.q.ratio, Math.max(0.65, this.q.ratio * 0.62));
    const next = average > 1 / 43 ? Math.max(floor, this.pixelRatio - 0.1)
      : average < 1 / 57 ? Math.min(this.q.ratio, this.pixelRatio + 0.05) : this.pixelRatio;
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
    }
    this.scaleTime = this.scaleFrames = 0;
  }

  async init() {
    const m = buildMansion(this.q);
    this.mansion = m;
    this.scene.add(m.root);
    // The first-person camera hides its avatar's head. Restore it only while
    // a mirror captures the scene so the player sees their complete reflection.
    for (const mirror of m.mirrors) {
      const capture = mirror.onBeforeRender;
      mirror.onBeforeRender = (...args) => {
        const viewer = this.mirrorViewer;
        const mirrorGrime = this.taskObjects?.mirrorGrime;
        const grimeVisible = mirrorGrime?.visible;
        this.mirrorCaptureDepth = (this.mirrorCaptureDepth || 0) + 1;
        if (this.mirrorCaptureDepth === 1) viewer?.ownHidden?.hideHead(false);
        if (mirrorGrime) mirrorGrime.visible = false;
        try { capture.call(mirror, ...args); }
        finally {
          if (mirrorGrime) mirrorGrime.visible = grimeVisible;
          this.mirrorCaptureDepth--;
          if (this.mirrorCaptureDepth === 0) viewer?.ownHidden?.hideHead(true);
        }
      };
    }
    this.taskObjects = buildTaskObjects(); this.scene.add(this.taskObjects.root);
    this.ashPiles = new AshPiles(this.scene);
    this.land = buildLandscape(this.scene, { moonDir: m.moon.position.clone() });
    this.kit = await loadKit();
    for (const s of SUSPECTS) {
      const a = new Avatar(this.kit, s);
      this.scene.add(a.root);
      this.avatars.set(s.id, a);
    }
    this.butlerAv = new Avatar(this.kit, BUTLER);
    this.butlerTools = butlerTools(this.butlerAv.root);
    this.butlerAv.root.visible = false;
    this.scene.add(this.butlerAv.root);
    const list = [...PROPS, ...WEAPONS.map((w) => ({ id: w.id, kind: w.id, core: w.core, weapon: true, r: PROP_RADIUS[w.id] }))];
    for (const p of list) {
      const g = propMesh(p);
      g.position.set(p.x ?? 0, -10, p.z ?? 0);
      g.userData.p = p;
      this.scene.add(g);
      this.props.set(p.id, g);
    }
    this.blood = new Blood(this.scene);
    // Lower env reflections everywhere; patch every world material for fog of war.
    this.scene.traverse((o) => { if (o.material && !Array.isArray(o.material) && o.material.isMeshStandardMaterial) o.material.envMapIntensity = o.material.userData.floorSheen ? 0.5 : o.material.metalness > 0.5 ? 0.6 : 0.12; });
    patchTree(this.scene);
    // The tunnels (no env reflections down there) and the trapdoors upstairs.
    this.dungeon = buildDungeon();
    this.trapdoors = buildTrapdoors();
    for (const r of [this.dungeon.root, this.trapdoors.root]) { patchTree(r); this.scene.add(r); }
    // One warm point light per torch, moved to wherever the flame is.
    this.torchLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xff9440, 0, 10, 1.6); l.castShadow = false; this.scene.add(l); return l; });
    this.applyGraphics(this.graphics);
    this.patchedCount = 0;
  }

  // ---------- views ----------
  // list: [{ follow: charId }]
  setViews(list) {
    for (const v of this.views) v.layer.remove();
    this.views = list.map((cfg, i) => {
      const cam = new THREE.PerspectiveCamera(70, 1, 0.06, 500);
      const layer = document.createElement("div");
      layer.className = "vp";
      this.overlay.append(layer);
      return { ...cfg, i, cam, layer, pos: new THREE.Vector3(0, 30, 20), look: new THREE.Vector3(), bubbles: new Map(), mode: "follow", fp: true, yaw: 0, pitch: 0, snap: true, fow: {}, tpDist: 3 };
    });
  }
  restartTitleCamera() { this.titleStart = this.time; }
  rects() {
    const w = innerWidth, h = innerHeight;
    if (this.views.length < 2) return [{ x: 0, y: 0, w, h }];
    const vertical = w < h * 1.1;
    return vertical
      ? [{ x: 0, y: Math.floor(h / 2), w, h: h - Math.floor(h / 2) }, { x: 0, y: 0, w, h: Math.floor(h / 2) }]
      : [{ x: 0, y: 0, w: Math.floor(w / 2), h }, { x: Math.floor(w / 2), y: 0, w: w - Math.floor(w / 2), h }];
  }

  bubble(id, text, dur = 3.5) { this.bubbles.set(id, { text, until: this.time + dur, born: this.time }); }
  clearBodies(keep = []) {
    const kept = new Set(keep);
    for (const [id, c] of this.corpses) {
      if (kept.has(id)) continue;
      c.root.removeFromParent();
      if (!this.chalk.has(id)) { const ch = chalkOutline(); ch.position.copy(c.root.position); ch.position.y = 0.015; ch.rotation.z = c.root.rotation.y; patchTree(ch); this.scene.add(ch); this.chalk.set(id, ch); }
      this.cleared.add(id);
    }
    for (const id of this.corpses.keys()) if (!kept.has(id)) this.corpses.delete(id);
  }
  resetWorld() {
    for (const timer of this.killFxTimers || []) clearTimeout(timer);
    this.killFxTimers = [];
    this.clearKillStage();
    for (const c of this.corpses.values()) c.root.removeFromParent();
    this.corpses.clear();
    for (const c of this.chalk.values()) c.removeFromParent();
    this.chalk.clear();
    this.cleared.clear();
    this.blood?.reset();
    this.cut = null;
    this.flicker = false; this.blackout = 0;
  }
  setFlicker(on) { this.flicker = on; if (!on) this.blackout = 0; }

  // Apply a snapshot (match.snapshot() shape).
  apply(snap, dt, snapAll = false) {
    this.snap = snap;
    this.time += dt;
    this.taskObjects?.update(snap.taskScene, snap.painting);
    this.rows = new Map(snap.chars.map((r) => [r[0], r]));
    const cut = this.cutStage && this.time - this.cutStage.t0 < this.cutStage.dur ? this.cutStage : null;
    for (const row of snap.chars) {
      const [id, x, z, yaw, mv, alive, , anim, , seat, , , pitch] = row;
      const a = this.avatars.get(id);
      if (!a) continue;
      const s = seat ? SEAT_BY_ID[seat] : null;
      const acting = !!cut && (id === cut.killer || id === cut.victim);
      const cx = acting ? id === cut.killer ? cut.kx : cut.x : x;
      const cz = acting ? id === cut.killer ? cut.kz : cut.z : z;
      const partnerRow = row[19] && this.rows.get(row[19]);
      const partner = row[19] === 'butler' && snap.butler ? { x: snap.butler[0], z: snap.butler[1], seat: false }
        : partnerRow ? { x: partnerRow[1], z: partnerRow[2], seat: !!partnerRow[9] } : null;
      const conversing = !acting && !!row[6] && !!partner && !!alive && !row[16] && Math.hypot(partner.x - x, partner.z - z) > .05;
      const conversationYaw = conversing ? Math.atan2(partner.x - x, partner.z - z) : yaw;
      const bodyYaw = s ? s.yaw : conversing ? conversationYaw : yaw;
      const listenYaw = conversing && s ? Math.max(-1.15, Math.min(1.15, Math.atan2(Math.sin(conversationYaw - bodyYaw), Math.cos(conversationYaw - bodyYaw)))) : 0;
      const listenPitch = conversing ? Math.max(-.28, Math.min(.28, Math.atan2((partner.seat ? 1.15 : 1.62) - (s ? 1.15 : 1.62), Math.max(.3, Math.hypot(partner.x - x, partner.z - z))))) : 0;
      const face = !acting ? yaw : id === cut.killer ? Math.atan2(cut.x - cut.kx, cut.z - cut.kz) : Math.atan2(cut.kx - cut.x, cut.kz - cut.z);
      a.update(dt, { x: acting ? cx : s ? s.x : x, z: acting ? cz : s ? s.z : z, yaw: acting ? face : bodyYaw,
        mv: acting ? 0 : row[16] ? 0 : mv, alive: acting ? true : !!alive, anim: acting ? 0 : row[16] ? 0 : anim,
        seat: acting ? false : !!s, seatH: s?.h, pitch: acting ? 0 : row[16] ? 0 : pitch || 0, ko: acting ? false : !!row[16], conversing, listenYaw, listenPitch }, snapAll || !!acting);
      if (!acting && alive && !row[16]) a.poseCarry(!!row[10], !!row[13], !!row[10] && row[10] === row[13]);
      if (!acting && anim === 'dart' && alive && !row[16]) a.poseThrow();
      else if (!acting && alive && !row[16] && ['bathroom','defrag','lettuce','paint','books','papers','clock','music'].includes(anim)) a.poseWork(anim);
    }
    const bt = snap.butler;
    if (this.butlerAv) {
      if (bt) { this.butlerAv.update(dt, { x: bt[0], z: bt[1], yaw: bt[2], mv: bt[3], alive: true, anim: bt[6], seat: false }, snapAll || !this.butlerSeen); this.butlerTools(bt[4]); }
      this.butlerSeen = !!bt;
    }
    // Props: rows only include moving/held ones except periodic full lists.
    this.carried = new Set(snap.chars.flatMap((r) => [r[10], r[13]]).filter(Boolean));
    if (snap.ashes) this.ashPiles.update(snap.ashes);
    for (const [id, x, y, z, yaw, roll, hidden, , , flags, burnt] of snap.props || []) {
      let g = this.props.get(id);
      if (!g && typeof id === "string" && id.startsWith("i_")) g = this.addItemMesh(id);
      if (!g) continue;
      tintItem(g, flags || 0);
      burnVisual(g, flags || 0, burnt || 0, this.time);
      if (g.userData.torch) g.userData.lit = !!((flags || 0) & 4);
      g.userData.target = { x, y, z, yaw, roll, hidden: !!hidden };
      if (!g.userData.placed || snapAll) { g.position.set(x, y, z); g.userData.placed = true; }
    }
    for (const [id, g] of this.props) {
      const t = g.userData.target;
      if (!t) continue;
      const k = 1 - Math.exp(-dt * 20);
      g.position.x += (t.x - g.position.x) * k; g.position.y += (t.y - g.position.y) * k; g.position.z += (t.z - g.position.z) * k;
      g.rotation.set(0, t.yaw, 0); g.userData.inner.rotation.x = t.roll || 0;
      g.visible = !t.hidden;
      if (g.userData.torch) {
        // Torches lie flat on the floor, stand upright in a hand or sconce.
        const held = this.carried?.has(id) || t.y > 0.5;
        g.userData.inner.rotation.x = held ? 0 : Math.PI / 2;
        g.userData.inner.position.y = held ? 0 : 0.02;
      }
    }
    // Held things follow skinned hands, including cleaning tools and task props.
    const xAxis = new THREE.Vector3(1, 0, 0);
    for (const row of snap.chars) {
      const a = this.avatars.get(row[0]);
      if (!a || !row[5]) continue;
      for (const [slot, id] of [[0, row[10]], [1, row[13]]]) {
        if (!id || (slot === 1 && id === row[10])) continue;
        const g = this.props.get(id), hand = a.bones[slot ? "LeftHand" : "RightHand"];
        if (!g || !hand || !g.visible) continue;
        const p = hand.getWorldPosition(new THREE.Vector3());
        if (!WEAPON_BY_ID[id]) {
          if (['rag','bleach','towel'].includes(g.userData.p?.kind)) {
            g.position.copy(p).add(new THREE.Vector3(0,-.025,.025));
            g.rotation.set(0,a.root.rotation.y,0);
          }
          continue;
        }
        const yaw = a.root.rotation.y;
        const lift = id === "two_handed_sword" ? 0.65 : id === "broken_pipe" || id === "hammer" || id === "flashlight" ? 0.5 : id === "pistol" ? 0.12 : 0.2;
        const direction = new THREE.Vector3(Math.sin(yaw), lift, Math.cos(yaw)).normalize();
        g.quaternion.setFromUnitVectors(xAxis, direction);
        const gripX = { knife: -0.16, kitchen_knife: -0.16, broken_pipe: -0.16, pistol: -0.15, hammer: -0.17, flashlight: -0.08, two_handed_sword: -0.36, rope: 0 }[id] ?? -0.1;
        g.position.copy(p).sub(new THREE.Vector3(gripX, -(PROP_RADIUS[id] || 0.15) + 0.04, 0).applyQuaternion(g.quaternion));
      }
    }
    this.updateTorches(dt);
    // Doors.
    const m = this.mansion;
    if (snap.doors) m.doors.forEach((d, i) => {
      const o = snap.doors[i] ?? 0;
      if (o === d.open) return;
      d.open = o;
      const t = o * DOOR_SWING, c = Math.cos(t), s = Math.sin(t);
      const dx = d.d.e.x * c + d.d.n.x * s, dz = d.d.e.z * c + d.d.n.z * s;
      d.pivot.rotation.y = Math.atan2(-dz, dx);
    });
    // Fires, stove, cabinets, pool.
    if (snap.fires) { const lit = new Set(snap.fires); for (const [id, f] of Object.entries(m.fires)) f.lit = lit.has(id); }
    if (snap.stove !== undefined) this.stoveOn = !!snap.stove;
    if (snap.push) PUSHABLES.forEach((f, i) => {
      if (snap.push[i] === undefined) return;
      const v = snap.push[i];
      if (v !== f.push.t && (Math.abs(f.push.t - v) > 0.015 || v === 0 || v === 1)) placePushable(f, v);
      m.pushHolders?.[f.id]?.position.set(f.x, f.y || 0, f.z);
    });
    if (snap.cabs) { const open = new Set(snap.cabs); for (const [id, c] of Object.entries(m.cabs)) c.open = open.has(id); }
    if (snap.pool) snap.pool.forEach(([x, z, inn], i) => { const b = m.balls[i]; if (!b) return; b.visible = !inn; b.userData.tx = x; b.userData.tz = z; if (!b.userData.set) { b.position.x = x; b.position.z = z; b.userData.set = true; } });
    for (const b of m.balls) if (b.userData.set) {
      const nx = b.position.x + (b.userData.tx - b.position.x) * Math.min(1, dt * 20), nz = b.position.z + (b.userData.tz - b.position.z) * Math.min(1, dt * 20);
      const d = Math.hypot(nx - b.position.x, nz - b.position.z);
      if (d > 1e-5) { tmp.set(nz - b.position.z, 0, -(nx - b.position.x)).normalize(); b.rotateOnWorldAxis(tmp, d / BALL_R); }
      b.position.x = nx; b.position.z = nz; b.position.y = POOL.y + BALL_R;
    }
    // Bodies.
    for (const [victim, x, z, found, , yaw, , hidden] of snap.bodies || []) {
      if (this.cleared.has(victim)) continue;
      const old = this.corpses.get(victim);
      if (old) {
        old.hidden = !!hidden;
        // Dragged bodies slide along behind the killer.
        const k = Math.min(1, dt * 8), r = old.root;
        if (Math.hypot(x - r.position.x, z - r.position.z) > 4) { r.position.x = x; r.position.z = z; }
        else { r.position.x += (x - r.position.x) * k; r.position.z += (z - r.position.z) * k; }
        r.rotation.y += Math.atan2(Math.sin((yaw || 0) - r.rotation.y), Math.cos((yaw || 0) - r.rotation.y)) * k;
        continue;
      }
      const c = new Corpse(this.kit, SUSPECT_BY_ID[victim]);
      c.hidden = !!hidden;
      c.root.position.set(x, 0, z); c.root.rotation.y = yaw || 0;
      if (victim !== cut?.victim && (found || snapAll || this.time < 1)) c.tick(0, true);
      patchTree(c.root);
      this.scene.add(c.root);
      this.corpses.set(victim, c);
    }
    for (const [id, c] of this.corpses) if (id !== cut?.victim || (this.time - cut.t0) / cut.dur >= 0.54) c.tick(dt);
    this.blood.applyStains(snap.stains, snapAll || !this.bloodSeen);
    this.blood.applyMarks(snap.marks);
    if (snap.stains) this.bloodSeen = true;
    this.animateWorld(dt);
  }

  updateTorches(dt) {
    let li = 0;
    const t = this.time;
    for (const g of this.props.values()) {
      const fl = g.userData.torch;
      if (!fl) continue;
      const on = !!g.userData.lit && g.visible;
      fl.visible = on;
      if (!on) continue;
      fl.children.forEach((sp, i) => {
        const u = sp.userData, ph = (t * 1.8 + u.ph) % 1;
        sp.position.set(Math.sin(t * 5 + i) * 0.012, ph * 0.09, Math.cos(t * 4 + i) * 0.012);
        sp.scale.set(u.s * (1 - ph * 0.5), u.s * 1.8 * (1 - ph * 0.3), 1);
        sp.material.opacity = 1 - ph * 0.8;
      });
      const l = this.torchLights[li++];
      if (!l) continue;
      fl.getWorldPosition(l.position);
      l.position.y += 0.12;
      l.intensity = 5.5 * (0.85 + Math.sin(t * 11 + li) * 0.08 + Math.random() * 0.07);
    }
    for (; li < this.torchLights.length; li++) this.torchLights[li].intensity = 0;
  }

  addItemMesh(id) {
    const kind = id.slice(2).replace(/x?\d+$/, "");
    const p = { id, kind, r: PROP_RADIUS[kind] || 0.05 };
    const g = propMesh(p);
    g.position.set(0, -10, 0);
    g.userData.p = p;
    patchTree(g);
    this.scene.add(g);
    this.props.set(id, g);
    return g;
  }

  // Attack cutscene for one view: the killer is a faceless silhouette.
  startCut(i, msg) {
    const v = this.views[i];
    if (!v || this.renderer.xr.isPresenting) return;
    v.cut = { ...msg, t0: this.time, dur: 3.8 };
    if (this.cutStage?.victim === msg.victim) return;
    this.clearKillStage();
    const prop = msg.weapon === "rope" ? null : propMesh({ kind: msg.weapon, weapon: true, r: PROP_RADIUS[msg.weapon] || 0.15 });
    if (prop) { prop.userData.halo?.removeFromParent(); patchTree(prop); this.scene.add(prop); }
    const cord = msg.weapon === "rope" ? [0, 1].map(() => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), new THREE.MeshStandardMaterial({ color: 0xb6a078, roughness: 1 }));
      mesh.castShadow = true; this.scene.add(mesh); return mesh;
    }) : null;
    this.cutStage = { ...msg, t0: this.time, dur: 3.8, prop, cord };
  }
  cutActive(i) { const v = this.views[i]; return !!(v?.cut && this.time - v.cut.t0 < v.cut.dur); }
  clearKillStage() {
    if (!this.cutStage) return;
    this.cutStage.prop?.traverse((o) => o.geometry?.dispose());
    this.cutStage.prop?.removeFromParent();
    this.cutStage.cord?.forEach((mesh) => { mesh.geometry.dispose(); mesh.material.dispose(); mesh.removeFromParent(); });
    this.cutStage = null;
  }
  animateKillStage() {
    const c = this.cutStage;
    if (!c) return;
    const u = (this.time - c.t0) / c.dur;
    if (u >= 1) { this.clearKillStage(); return; }
    const killer = this.avatars.get(c.killer), victim = this.avatars.get(c.victim);
    if (!killer || !victim) return;
    killer.poseKill("killer", c.weapon, u);
    if (u < 0.54) victim.poseKill("victim", c.weapon, u);
    const right = killer.bones.RightHand?.getWorldPosition(new THREE.Vector3()) || killer.root.position.clone().add(new THREE.Vector3(0.3, 1.1, 0.3));
    const left = killer.bones.LeftHand?.getWorldPosition(new THREE.Vector3()) || killer.root.position.clone().add(new THREE.Vector3(-0.3, 1.1, 0.3));
    if (c.cord) {
      const neck = victim.headWorld(new THREE.Vector3()).add(new THREE.Vector3(0, -0.19, 0));
      const forward = new THREE.Vector3(c.x - c.kx, 0, c.z - c.kz);
      if (forward.lengthSq() < 0.001) forward.set(0, 0, 1); else forward.normalize();
      const side = new THREE.Vector3(forward.z, 0, -forward.x).multiplyScalar(0.13);
      for (let i = 0; i < 2; i++) {
        const a = i ? left : right, b = neck.clone().addScaledVector(side, i ? -1 : 1);
        const mesh = c.cord[i], delta = b.sub(a);
        mesh.position.copy(a).addScaledVector(delta, 0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
        mesh.scale.y = delta.length();
        mesh.visible = u < 0.62;
      }
      return;
    }
    if (!c.prop) return;
    const forward = new THREE.Vector3(c.x - c.kx, 0, c.z - c.kz);
    if (forward.lengthSq() < 0.001) forward.set(0, 0, 1); else forward.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const stab = c.weapon === "knife" || c.weapon === "kitchen_knife";
    const gun = c.weapon === "pistol";
    const sword = c.weapon === "two_handed_sword";
    const swing = !stab && !gun;
    const progress = THREE.MathUtils.smoothstep(u, 0.39, 0.58);
    const aim = forward.clone().addScaledVector(up, gun ? 0.02 + (u > 0.53 ? 0.12 * (1 - progress) : 0) : stab ? 0.14 + 0.42 * (1 - progress) : sword ? 0.8 - 1.35 * progress : 1.0 - 1.6 * progress);
    if (sword) aim.addScaledVector(new THREE.Vector3(forward.z, 0, -forward.x), 0.58 - 1.16 * progress);
    aim.normalize();
    c.prop.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), aim);
    if (swing) c.prop.rotateX(sword ? -0.35 : 0.2);
    const gripX = { knife: -0.16, kitchen_knife: -0.16, broken_pipe: -0.16, pistol: -0.15, hammer: -0.17, flashlight: -0.08, two_handed_sword: -0.36 }[c.weapon] ?? -0.1;
    const grip = new THREE.Vector3(gripX, -(PROP_RADIUS[c.weapon] || 0.15) + 0.04, 0).applyQuaternion(c.prop.quaternion);
    c.prop.position.copy(right).sub(grip);
    if (u > 0.76) {
      const drop = THREE.MathUtils.smoothstep(u, 0.76, 0.95);
      const landed = this.props.get(c.weapon)?.userData.target;
      if (landed) {
        c.prop.position.lerp(new THREE.Vector3(landed.x, landed.y, landed.z), drop);
        c.prop.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, landed.yaw || 0, landed.roll || 0)), drop);
      }
    }
    c.prop.visible = true;
  }
  silhouette(id, on) {
    const a = this.avatars.get(id);
    if (!a) return;
    a.root.traverse((o) => {
      if (!o.isMesh) return;
      if (on) { if (!o.userData.realMat) { o.userData.realMat = o.material; o.material = SHADOW_MAT; } }
      else if (o.userData.realMat) { o.material = o.userData.realMat; o.userData.realMat = null; }
    });
  }

  // The killing blow: a spray of droplets from the victim along the swing.
  onKill(msg) {
    const dx = msg.x - (msg.kx ?? msg.x - 1), dz = msg.z - (msg.kz ?? msg.z);
    this.killFxTimers ||= [];
    this.killFxTimers.push(setTimeout(() => this.blood.burst(msg.x, 1.25, msg.z, dx, dz, 110), 2050));
    this.killFxTimers.push(setTimeout(() => this.blood.burst(msg.x, 0.9, msg.z, dx, dz, 50), 2350));
  }

  animateWorld(dt) {
    const m = this.mansion, t = this.time;
    for (const [, c] of Object.entries(m.cabs)) {
      c.t += ((c.open ? 1 : 0) - c.t) * Math.min(1, dt * 6);
      for (const p of c.parts) { if (p.kind === "door") p.obj.rotation.y = p.sign * c.t * 1.75; else if (p.kind === "lid") p.obj.rotation.x = -c.t * 1.48; else p.obj.position.z = (p.obj.userData.z0 ??= p.obj.position.z) + c.t * 0.32; }
    }
    for (const f of Object.values(m.fires)) {
      const flick = 0.75 + Math.sin(t * 13 + f.pos.x) * 0.12 + Math.sin(t * 7.3) * 0.1 + Math.random() * 0.08;
      f.light.intensity = f.lit ? 9 * flick : 0;
      for (const sp of f.flames) {
        sp.visible = f.lit;
        if (!f.lit) continue;
        const u = sp.userData, ph = (t * 1.6 + u.ph) % 1;
        sp.position.set(u.base.x + Math.sin(t * 3 + u.ph) * 0.04, u.base.y + ph * 0.25, u.base.z + Math.cos(t * 2.4 + u.ph) * 0.04);
        sp.scale.set(u.s * (1 - ph * 0.6), u.s * 1.7 * (1 - ph * 0.4), 1);
        sp.material.opacity = 1 - ph;
      }
    }
    if (m.burner) for (const b of m.burner.children) { b.material.emissive?.setHex(this.stoveOn ? 0x3a6cff : 0); b.material.emissiveIntensity = this.stoveOn ? 1.6 + Math.random() * 0.4 : 0; }
    m.stoveLight.intensity = this.stoveOn ? 1.5 + Math.random() * 0.3 : 0;
    for (const p of m.pendulums) p.rotation.z = Math.sin(t * Math.PI) * 0.16;
    // Lights: flicker during the dark phase, blackout as the deed is done, lightning outside.
    this.blackout = Math.max(0, this.blackout - dt);
    for (const l of m.lights) {
      const u = l.userData;
      let k = 1;
      if (this.flicker) { const n = Math.sin(t * 23 + u.phase) * Math.sin(t * 7.7 + u.phase * 2) + Math.sin(t * 41 + u.phase * 3) * 0.4; k = n > 0.55 ? 0.05 : 0.45 + n * 0.3; }
      if (this.blackout > 0) k = this.blackout > 0.9 ? 0 : 0.2 * (1 - this.blackout / 0.9) + 0.1;
      l.intensity = u.base * k;
      u.k = k;
    }
    for (const sp of m.glowSprites) { const gl = sp.userData; const k = this.flicker || this.blackout > 0 ? (m.lights.find((l) => l.userData.room === gl.room)?.userData.k ?? 1) : 1; sp.material.opacity = 0.5 * k + Math.random() * 0.03; }
    this.lightningT -= dt;
    if (this.lightningT <= 0) { this.lightningT = 18 + Math.random() * 30; this.flash = 1; if (this.views[0]?.mode !== "title" || Math.random() < 0.5) setTimeout(() => sfx("thunder", 0.5), 600 + Math.random() * 1500); }
    this.flash = Math.max(0, this.flash - dt * 2.4);
    const fl = this.flash > 0 ? (Math.sin(this.flash * 40) > 0 ? this.flash : this.flash * 0.3) : 0;
    m.moon.intensity = 1.6 + fl * 8;
    m.hemi.intensity = 0.35 + fl * 1.5;
    this.land?.update(t);
    this.blood?.update(dt);
  }

  charPos(id) {
    const row = this.rows?.get(id);
    if (!row) return null;
    const s = row[9] ? SEAT_BY_ID[row[9]] : null;
    return { x: s ? s.x : row[1], z: s ? s.z : row[2], yaw: row[3], room: row[8], alive: !!row[5], seat: s, carry: row[10] };
  }
  highlight(viewIndex, propId) { const v = this.views[viewIndex]; if (v) v.hl = propId; }
  // Eye position for a viewer.
  eyeOf(id) {
    const a = this.avatars.get(id), p = this.charPos(id);
    if (!a || !p) return null;
    const y = p.seat ? p.seat.h + 0.72 : p.alive ? EYE : EYE + a.model.position.y;
    return new THREE.Vector3(a.root.position.x, y, a.root.position.z);
  }

  // ---------- render ----------
  render(dt) {
    const r = this.renderer;
    if (r.xr.isPresenting) { this.renderXR(dt); return; }
    this.animateKillStage();
    const rects = this.rects();
    r.setScissorTest(true);
    r.setViewport(0, 0, innerWidth, innerHeight);
    r.setScissor(0, 0, innerWidth, innerHeight);
    r.setClearColor(0x050403);
    r.clear();
    this.views.forEach((v, i) => {
      const rect = rects[i] || rects[0];
      this.updateCamera(v, dt, rect);
      if (this.taskObjects) { this.taskObjects.local = v.taskWork; this.taskObjects.update(this.snap?.taskScene, this.snap?.painting); }
      this.prepareView(v);
      this.mirrorViewer = v;
      r.setViewport(rect.x, rect.y, rect.w, rect.h);
      r.setScissor(rect.x, rect.y, rect.w, rect.h);
      r.render(this.scene, v.cam);
      this.mirrorViewer = null;
      this.afterView(v);
      Object.assign(v.layer.style, { left: `${rect.x}px`, top: `${innerHeight - rect.y - rect.h}px`, width: `${rect.w}px`, height: `${rect.h}px` });
      this.updateLabels(v, rect);
    });
    r.setScissorTest(false);
    this.adaptResolution(dt);
  }

  renderXR() {
    const v = this.views[0];
    if (!v) return;
    v.mode = v.mode === "title" ? "follow" : v.mode;
    const p = this.charPos(v.follow);
    if (p) { this.xrRig.position.set(this.avatars.get(v.follow).root.position.x - (v.xrHead?.x || 0), p.seat ? -0.45 : 0, this.avatars.get(v.follow).root.position.z - (v.xrHead?.z || 0)); }
    this.xrRig.rotation.y = v.xrYaw || 0;
    v.cam = this.xrCam;
    this.prepareView(v, true);
    this.mirrorViewer = v;
    this.renderer.render(this.scene, this.xrCam);
    this.mirrorViewer = null;
    this.afterView(v);
  }

  // Fog of war, visibility, key light and ceilings for one viewer.
  prepareView(v, xr = false) {
    const m = this.mansion;
    const me = this.charPos(v.follow);
    const living = !!me?.alive;
    const indoor = v.mode === "follow" || v.mode === "task" || v.mode === "convo" || (v.mode === "title" && !v.titleOrbit);
    m.moon.castShadow = this.q.moonShadow && v.mode === "title" && !!v.titleOrbit;
    // Only the nearest lamps enter an indoor shader. Distant room lights add
    // fragment work even when their attenuation makes them invisible.
    const lightOrigin = xr ? this.xrRig.position : v.cam.position;
    const lamps = indoor
      ? new Set([...m.lights].sort((a, b) => a.position.distanceToSquared(lightOrigin) - b.position.distanceToSquared(lightOrigin)).slice(0, 8))
      : null;
    for (const lamp of m.lights) lamp.visible = !lamps || lamps.has(lamp);
    const useFow = indoor && living && me;
    let vis = null;
    if (useFow) {
      const a = this.avatars.get(v.follow).root.position;
      vis = computeVis(v.fow, a.x, a.z, this.snap?.doors || DOOR_LIST.map(() => 0));
    }
    uploadVis(vis);
    FOW_UNIFORMS.fowOn.value = vis ? 1 : 0;
    v.vis = vis;
    // Who can be seen.
    const viewerGhost = me && !me.alive;
    for (const [id, a] of this.avatars) {
      const p = this.charPos(id);
      if (!p) { a.root.visible = false; continue; }
      let show = true;
      if (!p.alive) show = viewerGhost || v.mode === "title" || this.snap?.ph === "over";
      if (show && vis && id !== v.follow) show = visAt(vis, a.root.position.x, a.root.position.z) > 0.5;
      if (v.mode === "table" && !p.alive) show = false;
      a.root.visible = show;
    }
    if (this.butlerAv) this.butlerAv.root.visible = !!this.snap?.butler && v.mode !== "table" && (!vis || visAt(vis, this.butlerAv.root.position.x, this.butlerAv.root.position.z) > 0.5);
    const cut = v.cut && this.time - v.cut.t0 < v.cut.dur ? v.cut : null;
    const cutU = cut ? (this.time - cut.t0) / cut.dur : 1;
    for (const [id, c] of this.corpses) c.root.visible = !(cut && id === cut.victim && cutU < 0.54) && !c.hidden && (!vis || visAt(vis, c.root.position.x, c.root.position.z) > 0.5);
    if (cut) {
      const a = this.avatars.get(cut.victim); if (a) a.root.visible = cutU < 0.54;
      const prop = this.props.get(cut.weapon); if (prop) { v.cutProp = prop; v.cutPropVisible = prop.visible; prop.visible = false; }
    }
    // Attack cutscene: hide the killer's identity from everyone but themselves.
    v.cutSil = null;
    if (v.cut && this.time - v.cut.t0 < v.cut.dur && v.follow !== v.cut.killer && !xr) { this.silhouette(v.cut.killer, true); v.cutSil = v.cut.killer; const a = this.avatars.get(v.cut.killer); if (a) a.root.visible = true; }
    // Water-wiped blood appears through the Lens, or as a nearby killer's outline.
    const row = this.rows?.get(v.follow);
    const isLens = (id) => typeof id === "string" && id.startsWith("i_lens");
    this.blood.setLens(!!row && !!row[5] && (isLens(row[10]) || isLens(row[13])), living && v.role === "killer" ? me : null);
    // Props carried by a ghost are visible to everyone; pocketed ones never.
    for (const [id, g] of this.props) if (g.userData.halo) g.userData.halo.material.opacity = v.hl === id ? 0.7 : 0.25;
    // First person: hide my own head.
    v.ownHidden = ((v.fp && indoor && v.mode !== "convo" && !cut) || xr) ? this.avatars.get(v.follow) : null;
    v.ownHidden?.hideHead(true);
    // Ceilings / roof.
    const top = v.mode === "overview";
    for (const c of m.ceilings) c.visible = !top && (v.mode !== "title" || !v.titleOrbit);
    m.roof.visible = v.mode === "title" && v.titleOrbit;
    // Key shadow light over the viewer (their room's main light), or off.
    const k = m.key;
    let src = null;
    const pos = me && !top && (v.mode !== "title" || !v.titleOrbit) ? this.avatars.get(v.follow).root.position : v.mode === "table" ? new THREE.Vector3(TABLE.x, 0, TABLE.z) : null;
    if (pos) {
      const room = roomAtWorld(pos.x, pos.z);
      let best = Infinity;
      for (const l of m.lights) { if (l.userData.room !== room) continue; const d = Math.hypot(l.position.x - pos.x, l.position.z - pos.z); if (d < best) { best = d; src = l; } }
      if (!src) for (const l of m.lights) { const d = Math.hypot(l.position.x - pos.x, l.position.z - pos.z); if (d < best && d < 9) { best = d; src = l; } }
    }
    if (src) {
      k.position.set(src.position.x, WALL_H - 0.15, src.position.z);
      k.target.position.set(src.position.x, 0, src.position.z);
      k.target.updateMatrixWorld();
      k.color.copy(src.color);
      k.intensity = src.intensity * 2.4;
      src.userData.saved = src.intensity;
      src.intensity *= 0.35;
      v.keySrc = src;
    } else k.intensity = 0;
    // Underground: no moonlight, no sky — only the torches.
    const eye = me ? this.avatars.get(v.follow).root.position : null;
    v.under = !!(eye && underground(eye.z) && (v.mode !== "title" || !v.titleOrbit) && v.mode !== "table" && v.mode !== "overview");
    if (v.under) {
      v.saveMoon = m.moon.intensity; v.saveHemi = m.hemi.intensity;
      m.moon.intensity = 0; m.hemi.intensity = 0.025;
      k.intensity = 0;
    }
    if (v.i === 0 && !xr) { setUnderground(v.under); setExteriorRain(v.mode === "title" && v.titleOrbit); }
    else if (xr) { setUnderground(v.under); setExteriorRain(false); }
  }
  afterView(v) {
    if (v.under) { this.mansion.moon.intensity = v.saveMoon; this.mansion.hemi.intensity = v.saveHemi; v.under = false; }
    if (v.cutSil) { this.silhouette(v.cutSil, false); v.cutSil = null; }
    if (v.cutProp) { v.cutProp.visible = v.cutPropVisible; v.cutProp = null; }
    v.ownHidden?.hideHead(false);
    if (v.keySrc) { v.keySrc.intensity = v.keySrc.userData.saved; v.keySrc = null; }
  }

  updateCamera(v, dt, rect) {
    const cam = v.cam;
    cam.aspect = rect.w / rect.h;
    const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
    let fov = 70, lerp = 0, cutFov = false;
    const narrow = cam.aspect < 1;
    // Choose the title subject first, then use the exact same first-person
    // camera path as a playable character. The avatar's rendered turn and
    // pitch are smoother than the NPC's decision snapshots.
    if (v.mode === "title") {
      const elapsed = Math.max(0, this.time - this.titleStart);
      const living = (this.snap?.chars || []).filter((row) => row[5] && this.avatars.has(row[0]));
      v.titleIntro = elapsed < 12 || !living.length;
      v.titleOrbit = false;
      if (v.titleIntro) {
        v.follow = null;
        v.titleFocus = null;
      } else {
        const focus = living[Math.floor((elapsed - 12) / 30) % living.length];
        v.follow = focus[0];
        v.fp = true;
        const actor = this.avatars.get(v.follow);
        const yaw = actor.root.rotation.y, pitch = actor.pitch;
        if (v.titleFocus !== v.follow) {
          v.titleFocus = v.follow;
          v.snap = true;
          cutFov = true;
        }
        // The avatar already smooths its turn and look pitch. Match its
        // rendered direction exactly so the camera stays aligned with it.
        v.yaw = yaw; v.pitch = pitch;
      }
    }
    if (v.mode === "title" && v.titleIntro) {
      const at = local("lounge", 11.2, 3.6), focus = local("lounge", 2.3, 6.6);
      const drift = this.time * 0.22;
      wantPos.set(at.x + Math.sin(drift) * 0.55, 1.62 + Math.sin(drift * 0.7) * 0.08, at.z + Math.cos(drift) * 0.3);
      wantLook.set(focus.x, 1.12, focus.z);
      fov = narrow ? 72 : 58; lerp = 1.8;
    } else if (v.mode === "overview") {
      const f = v.focus || { x: 0, z: 0 };
      const t = this.time * 0.05;
      wantLook.set(f.x, 0, f.z);
      wantPos.set(f.x + Math.sin(t) * 6, 14, f.z + Math.cos(t) * 6 + 4);
      fov = narrow ? 70 : 55; lerp = 2;
    } else if (v.mode === "table") {
      const t = this.time * 0.08;
      wantLook.set(TABLE.x, 0.9, TABLE.z);
      wantPos.set(TABLE.x + Math.sin(t) * 4.2, 2.9, TABLE.z + Math.cos(t) * 4.2);
      fov = narrow ? 75 : 60; lerp = 2;
    } else if (v.mode === 'task' && v.taskFocus) {
      const task = v.taskFocus;
      wantLook.set(task.x, task.y, task.z);
      if (task.id === 'pool') { wantPos.set(task.x, task.y+2.25, task.z+1.35); wantLook.set(task.x,task.y,task.z); }
      else if (task.id === 'darts') wantPos.set(task.x + 2.05, task.y + .04, task.z);
      else if (task.id === 'bathroom') { wantPos.set(task.x, 1.55, task.z + 1.9); wantLook.set(task.x, 1.12, task.z - .15); }
      else if (task.id === 'defrag') { wantPos.set(task.x-.12, 1.13, task.z + .94); wantLook.set(task.x, 1.0, task.z + .25); }
      else if (task.id === 'clock') wantPos.set(task.x + 1.3, task.y, task.z);
      else if (task.id === 'paint') { wantPos.set(task.x + .4, task.y + .15, task.z + 1.55); wantLook.set(task.x, task.y, task.z); }
      else { const [dx,dz] = task.stand || [0,1]; wantPos.set(task.x + dx*.8, task.y + .95, task.z + dz*.8); }
      fov = task.id === 'defrag' ? 35 : task.id === 'bathroom' ? 64 : 55;
      lerp = 8;
    } else {
      const a = this.avatars.get(v.follow);
      const eye = this.eyeOf(v.follow);
      if (a && eye) {
        if (v.mode === "convo" && v.pair) {
          const oid = v.pair[0] === v.follow ? v.pair[1] : v.pair[0];
          const other = oid === "butler" ? this.butlerAv : this.avatars.get(oid);
          if (other) {
            const selfShot = !!v.convoSelf;
            const speaker = selfShot ? a : other, listener = selfShot ? other : a;
            const s = speaker.root.position, o = listener.root.position;
            const dx = o.x - s.x, dz = o.z - s.z, len = Math.hypot(dx, dz) || 1;
            const fx = dx / len, fz = dz / len;
            const dist = Math.min(1.35, Math.max(0.65, len * 0.58));
            let side = selfShot ? -1 : 1;
            const shotAt = (sign) => new THREE.Vector3(s.x + fx * dist - fz * sign * 0.66, 1.62, s.z + fz * dist + fx * sign * 0.66);
            let pos = shotAt(side);
            if (!losClear(s.x, s.z, pos.x, pos.z, this.snap?.doors)) { side *= -1; pos = shotAt(side); }
            if (!losClear(s.x, s.z, pos.x, pos.z, this.snap?.doors)) pos.set(s.x + fx * 0.68, 1.6, s.z + fz * 0.68);
            wantPos.copy(pos);
            wantLook.set(s.x, this.charPos(speaker.id)?.seat ? 1.27 : 1.55, s.z);
            if (v.convoShot !== selfShot || v.convoPartner !== oid) { v.snap = true; v.convoShot = selfShot; v.convoPartner = oid; }
            fov = narrow ? 63 : 50;
            lerp = 7;
          }
        } else {
          const yaw = v.yaw, pitch = v.pitch;
          const fx = Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = Math.cos(yaw) * Math.cos(pitch);
          if (v.fp) {
            firstPersonPose(eye, yaw, pitch, wantPos, wantLook);
            lerp = 0;
          } else {
            // Over-the-shoulder, pulled in by walls.
            const back = 3.0, up = 0.7;
            let d = back;
            const sx = Math.cos(yaw) * -0.45, sz = -Math.sin(yaw) * -0.45;
            for (; d > 0.4; d -= 0.2) {
              const cx = eye.x - fx * d + sx, cz = eye.z - fz * d + sz;
              if (losClear(eye.x, eye.z, cx, cz, this.snap?.doors) && Math.abs(cx) < W / 2 - 0.2 && Math.abs(cz) < D / 2 - 0.2) break;
            }
            v.tpDist += (d - v.tpDist) * Math.min(1, dt * (d < v.tpDist ? 20 : 4));
            d = v.tpDist;
            wantPos.set(eye.x - fx * d + sx, Math.min(WALL_H - 0.25, eye.y + up - fy * d * 0.6), eye.z - fz * d + sz);
            wantLook.set(eye.x + fx * 4 + sx, eye.y + fy * 4 + 0.1, eye.z + fz * 4 + sz);
            lerp = 0;
          }
          fov = narrow ? 80 : 72;
        }
      }
    }
    // Three beats: establish the pair, move in on the weapon, then settle on
    // the fall. The camera tremor happens at impact instead of at the start.
    const cut = v.cut;
    if (cut && this.time - cut.t0 < cut.dur && !this.renderer.xr.isPresenting) {
      const u = (this.time - cut.t0) / cut.dur;
      const mx = (cut.x + cut.kx) / 2, mz = (cut.z + cut.kz) / 2;
      let ax = cut.x - cut.kx, az = cut.z - cut.kz;
      const l = Math.hypot(ax, az);
      if (l < 0.03) { ax = 0; az = 1; } else { ax /= l; az /= l; }
      const side = (cut.victim.charCodeAt(0) % 2 ? 1 : -1);
      const push = THREE.MathUtils.smoothstep(u, 0.06, 0.52);
      const fall = THREE.MathUtils.smoothstep(u, 0.56, 0.9);
      const dist = 2.85 - push * 0.72 + fall * 0.34, swing = side * (0.82 - push * 0.27 - fall * 0.16);
      const px = -az * Math.cos(swing) + ax * Math.sin(swing), pz = ax * Math.cos(swing) + az * Math.sin(swing);
      const shake = Math.max(0, 1 - Math.abs(u - 0.54) / 0.055) * 0.055;
      wantPos.set(mx + px * dist + (Math.random() - 0.5) * shake, 1.6 - push * 0.12 - fall * 0.19 + (Math.random() - 0.5) * shake, mz + pz * dist);
      wantLook.set(mx + ax * 0.13 * push, 1.43 - fall * 0.69, mz + az * 0.13 * push);
      fov = (narrow ? 63 : 55) - push * 7 + fall * 6; lerp = 0;
      if (u > 0.97) v.snap = true;
    } else if (cut) { v.cut = null; v.snap = true; }
    const k = v.snap || !lerp ? 1 : 1 - Math.exp(-dt * lerp);
    v.pos.lerp(wantPos, k);
    v.look.lerp(wantLook, k);
    v.snap = false;
    if (cutFov) cam.fov = fov;
    else if (Math.abs(cam.fov - fov) > 0.05) cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    cam.position.copy(v.pos);
    cam.lookAt(v.look);
    cam.near = v.mode === "title" && v.titleOrbit ? 0.5 : 0.06;
    cam.updateProjectionMatrix();
  }

  updateLabels(v, rect) {
    const viewer = this.charPos(v.follow);
    const p3 = new THREE.Vector3();
    const bt = this.snap?.butler;
    const rows = bt ? [...(this.snap?.chars || []), ["butler", bt[0], bt[1], 0, 0, 1, 0, 0, bt[7]]] : this.snap?.chars || [];
    for (const row of rows) {
      const [id, x, z, , , alive, , , room] = row;
      const a = id === "butler" ? this.butlerAv : this.avatars.get(id);
      const b = this.bubbles.get(id);
      let el = v.bubbles.get(id);
      const pos = this.charPos(id);
      p3.set(a.root.position.x, pos?.seat ? 1.7 : 2.05, a.root.position.z).project(v.cam);
      const on = p3.z < 1 && Math.abs(p3.x) < 1.1 && Math.abs(p3.y) < 1.1 && a.root.visible;
      const sx = (p3.x * 0.5 + 0.5) * rect.w, sy = (-p3.y * 0.5 + 0.5) * rect.h;
      // Audible in the same room (or close in the hallway).
      const audible = v.mode === "title" || v.mode === "table" || (viewer && ((room === viewer.room && (room !== "hallway" || Math.hypot(x - viewer.x, z - viewer.z) < 8)) || Math.hypot(x - viewer.x, z - viewer.z) < 5)) || !viewer?.alive;
      const show = b && b.until > this.time && on && audible && id !== v.follow && !(v.mode === "convo" && v.pair?.includes(id)) && alive;
      if (show) {
        if (!el) { el = document.createElement("div"); el.className = "bubble"; el.style.setProperty("--c", SUSPECT_BY_ID[id].color); v.layer.append(el); v.bubbles.set(id, el); }
        if (el.dataset.t !== b.text) { el.dataset.t = b.text; el.textContent = b.text; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
        el.style.display = "";
        el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
      } else if (el) el.style.display = "none";
    }
    if (!bt) { const el = v.bubbles.get("butler"); if (el) el.style.display = "none"; }
  }

  screenPos(viewIndex, x, y, z) {
    const v = this.views[viewIndex];
    const rect = this.rects()[viewIndex] || this.rects()[0];
    const p = new THREE.Vector3(x, y, z).project(v.cam);
    return { x: (p.x * 0.5 + 0.5) * rect.w, y: (-p.y * 0.5 + 0.5) * rect.h,
      visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 0.84 && Math.abs(p.y) < 0.84 };
  }
  // Is a world point visible to a view (fog of war)?
  visible(viewIndex, x, z) { const v = this.views[viewIndex]; return !v?.vis || visAt(v.vis, x, z) > 0.5; }
}
