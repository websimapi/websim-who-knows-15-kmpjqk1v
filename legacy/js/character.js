// Characters: the procedural rig from rig.js + dynamic hair from hair.js +
// a procedural animation state machine + Mercy–Cruelty attachments.
import * as THREE from "three";
import { buildBodyGeometry, buildHead, buildWeapon, makeSkeleton } from "./rig.js";
import { Hair } from "./hair.js";
import { gearTexture } from "./gear-textures.js";
import { buildHelmet } from "./helmet-mesh.js";
import { ANCESTRIES, CLASSES } from "./data.js";
import { groundBody } from "./body-grounding.js";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => t * t * (3 - 2 * t);
// piecewise-linear keys [[t, v], ...] with smoothstep easing
function key(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, va] = keys[i], [tb, vb] = keys[i + 1];
    if (t <= tb) return lerp(va, vb, smooth((t - ta) / (tb - ta)));
  }
  return keys[keys.length - 1][1];
}

const geoCache = new Map();
function bodyKey(l) {
  return JSON.stringify([l.ancestry, l.sex, l.build, l.frame, l.skin, l.gear, l.trim, l.body, l.armorStyle, l.markings, l.markType, l.scaleTint, l.cloth, l.leather, l.shirt]);
}

// Fill in a look from ancestry/class defaults.
export function completeLook(look = {}) {
  const anc = ANCESTRIES[look.ancestry] || ANCESTRIES.valeborn;
  const cls = CLASSES[look.cls] || null;
  const a = anc.look;
  const out = {
    ancestry: look.ancestry || "valeborn",
    sex: look.sex ?? 0.5,
    height: look.height ?? 1,
    build: look.build ?? a.build ?? 1,
    frame: a.frame ?? 1,
    head: look.head ?? a.head ?? 1,
    eyes: look.eyes ?? a.eyes ?? 1,
    face: a.face || {},
    jaw: look.jaw ?? 0.5,
    nose: look.nose ?? 0.5,
    ears: look.ears || a.ears,
    crest: look.crest ?? a.crest ?? false,
    skin: look.skin || a.skins[1] || a.skins[0],
    eyeColor: look.eyeColor || a.eyeColor || "#5a3a22",
    markings: look.markings ?? (a.markings ? 0.6 : 0),
    markType: look.markType || a.markings || null,
    eyeGlow: look.eyeGlow || a.eyeGlow || null,
    body: look.body || cls?.gear?.body || "leather",
    armorStyle: look.armorStyle || null,
    gear: look.gear || cls?.gear?.primary || "#5a6070",
    trim: look.trim || cls?.gear?.trim || "#c9a04a",
    weapon: look.weapon ?? cls?.weapon ?? "none",
    weaponFinish: look.weaponFinish || null,
    shield: look.shield ?? ((cls?.shield || 0) > 0),
    hair: { color: a.hairs[0], ...(look.hair || {}) },
    beard: { style: "none", color: (look.hair && look.hair.color) || a.hairs[0], ...(look.beard || {}) },
    hairTex: a.hairLeaf ? "leaf" : a.hairFeather ? "feather" : "hair",
    ancHeight: a.height ?? 1,
    cloth: look.cloth, leather: look.leather, shirt: look.shirt,
    helmet: look.helmet || null,
    helmetColor: look.helmetColor || "#8999a4",
  };
  return out;
}

export class Character {
  constructor(look, opts = {}) {
    this.opts = { hairGuides: 150, ...opts };
    this.object = new THREE.Group();
    this.body = new THREE.Group();
    this.object.add(this.body);
    this.speed = 0;
    this.swimMode = null;
    this.phase = 0;
    this.time = Math.random() * 10;
    this.action = null;
    this.stance = "normal"; // normal | dead | kneel
    this.stanceT = 1;
    this.blinkT = 2 + Math.random() * 3;
    this.morality = 0;
    this.hairs = [];
    this.lookAt = null;
    this.setLook(look);
  }

  get height() { return 1.75 * this.scale; }

  setLook(look) {
    const L = completeLook(look);
    const prev = this.look;
    this.look = L;
    const bodyChanged = !prev || bodyKey(prev) !== bodyKey(L) || prev.head !== L.head || prev.eyes !== L.eyes || prev.jaw !== L.jaw || prev.nose !== L.nose || prev.ears !== L.ears || prev.eyeColor !== L.eyeColor || prev.weapon !== L.weapon || prev.weaponFinish !== L.weaponFinish || prev.shield !== L.shield || prev.crest !== L.crest || prev.helmet !== L.helmet || prev.helmetColor !== L.helmetColor;
    this.scale = L.height * L.ancHeight;
    this.body.scale.setScalar(this.scale);
    if (bodyChanged) this.buildBody();
    const hairChanged = bodyChanged || JSON.stringify(prev?.hair) !== JSON.stringify(L.hair) || JSON.stringify(prev?.beard) !== JSON.stringify(L.beard) || prev?.hairTex !== L.hairTex;
    if (hairChanged) this.buildHair();
    this.mats[6].color.set(L.hair.color || "#3a2a1c");
    this.setMorality(this.morality, true);
  }

  buildBody() {
    const L = this.look;
    if (this.mesh) {
      for (const effect of [this.shaft, this.aura, this.motes]) {
        effect?.removeFromParent();
        effect?.geometry.dispose();
        effect?.material.dispose();
      }
      // The body geometry is cached, but face/gear attachments are rebuilt
      // when an outfit changes. Release their GPU resources with the old rig.
      const shared = new Set(this.mats || []);
      const disposed = new Set();
      this.mesh.traverse((node) => {
        if (node !== this.mesh) node.geometry?.dispose();
        for (const material of (Array.isArray(node.material) ? node.material : node.material ? [node.material] : [])) {
          if (!shared.has(material) && !disposed.has(material)) { material.dispose(); disposed.add(material); }
        }
      });
      this.body.remove(this.mesh);
      this.mats?.forEach((m) => m.dispose());
    }
    const k = bodyKey(L);
    let built = geoCache.get(k);
    if (!built) { built = buildBodyGeometry(L); geoCache.set(k, built); if (geoCache.size > 60) geoCache.delete(geoCache.keys().next().value); }
    const { geom, defs } = built;
    const { bones, list, skeleton } = makeSkeleton(defs);
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    const metal = new THREE.MeshStandardMaterial({ vertexColors: true, map: gearTexture("steel"), roughness: 0.34, metalness: 0.78 });
    const mail = new THREE.MeshStandardMaterial({ vertexColors: true, map: gearTexture("mail"), roughness: 0.51, metalness: 0.65, side: THREE.DoubleSide });
    const leatherMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: gearTexture("leather"), roughness: 0.9 });
    const clothMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: gearTexture("cloth"), roughness: 0.96, side: THREE.DoubleSide });
    const matteDS = matte.clone(); matteDS.side = THREE.DoubleSide;
    const browMat = new THREE.MeshStandardMaterial({ color: L.hair.color || "#3a2a1c", roughness: 0.9 });
    this.mats = [matte, metal, mail, leatherMat, clothMat, matteDS, browMat];
    const mesh = new THREE.SkinnedMesh(geom, [matte, metal, mail, leatherMat, clothMat]);
    mesh.add(bones.root);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.bones = bones;
    this.boneList = list;
    this._deathLimbPose = null;
    this.rest = {};
    for (const b of list) this.rest[b.name] = b.position.clone();
    this.body.add(mesh);

    // head
    const head = buildHead(L, { matte, matteDS, browMat });
    bones.head.add(head.group);
    this.headInfo = head;
    if (L.helmet) bones.head.add(buildHelmet(L));
    // weapons
    this.weapons = {};
    if (["blade", "longsword", "greatsword", "shortsword", "rapier", "scimitar", "mace", "morningstar", "flail", "dagger", "axe", "greataxe", "warhammer", "wand"].includes(L.weapon)) {
      const w = buildWeapon(L.weapon, { trim: L.trim, finish: L.weaponFinish });
      w.position.set(0, -0.06, 0.0);
      w.rotation.x = 0.9;
      bones["hand.R"].add(w);
      this.weapons.main = w;
    } else if (["staff", "spear", "glaive", "halberd", "trident"].includes(L.weapon)) {
      const w = buildWeapon(L.weapon, { trim: L.trim, finish: L.weaponFinish });
      w.position.set(0, -0.06, 0.0);
      // The forearm is raised in the idle pose. Its local -Y points forward,
      // so the staff head (+Z in weapon space) must point along -Y.
      w.rotation.x = L.weapon === "staff" ? Math.PI / 2 : -Math.PI / 2;
      bones["hand.R"].add(w);
      this.weapons.main = w;
    } else if (["bow", "longbow", "recurve", "crossbow"].includes(L.weapon)) {
      const w = buildWeapon(L.weapon, { finish: L.weaponFinish });
      w.position.set(0, -0.06, 0.01);
      if (L.weapon !== "crossbow") w.rotation.y = Math.PI / 2;
      bones["hand.L"].add(w);
      this.weapons.bow = w;
      // quiver
      const quiverLeather = new THREE.MeshStandardMaterial({ color: 0x72513a, map: gearTexture("leather"), roughness: 0.88 });
      const quiverMetal = new THREE.MeshStandardMaterial({ color: L.trim, map: gearTexture("brass"), metalness: 0.62, roughness: 0.39 });
      const q = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.038, 0.5, 14), quiverLeather);
      q.position.set(0.08, 0.05, -0.15); q.rotation.z = -0.4; q.castShadow = true;
      for (const y of [-0.19, 0.18]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 18), quiverMetal);
        band.rotation.x = Math.PI / 2;
        band.position.y = y;
        q.add(band);
      }
      for (let i = 0; i < 5; i++) {
        const ar = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xc49c66, map: gearTexture("wood"), roughness: 0.79 }));
        ar.position.set(Math.cos(i * 1.3) * 0.024, 0.3, Math.sin(i * 1.3) * 0.024);
        const fletch = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.043, 5), new THREE.MeshStandardMaterial({ color: 0xdcd7c4, roughness: 0.86 }));
        fletch.position.y = 0.075;
        ar.add(fletch);
        q.add(ar);
      }
      bones.upperChest.add(q);
    }
    if (L.shield) {
      const s = buildWeapon("shield", { primary: L.gear, trim: L.trim });
      // The hand closes around the central rear grip, directly behind the
      // boss. Keep the shield close to the knuckles and angle it slightly out
      // from the body; the old long offset made the hand reach for the rim.
      s.position.set(0.02, -0.11, 0.015);
      s.rotation.set(1.5, -Math.PI / 2 + 0.28, 0, "XYZ");
      bones["hand.L"].add(s);
      this.weapons.shield = s;
    }
    this.buildMoralityRig();
  }

  buildHair() {
    for (const h of this.hairs) h.dispose();
    this.hairs = [];
    const L = this.look;
    const head = this.bones.head;
    const colliders = (parent) => {
      const out = [];
      const tmp = new THREE.Vector3();
      for (const [b, r, oy, oz] of [["upperChest", 0.15, 0.03, -0.035], ["shoulder.L", 0.085, 0.02, -0.02], ["shoulder.R", 0.085, 0.02, -0.02]]) {
        const bone = this.bones[b];
        const p = new THREE.Vector3(b === "upperChest" ? 0 : (b.endsWith("L") ? 0.11 : -0.11), oy, oz);
        bone.localToWorld(tmp.copy(p));
        if (parent) parent.worldToLocal(tmp);
        out.push({ c: tmp.clone(), r: r * this.scale });
      }
      return out;
    };
    const mk = (params, kind) => new Hair({ head, ellipsoid: this.headInfo.ellipsoid, deform: this.headInfo.deform, params, kind, guides: this.opts.hairGuides, bodyColliders: colliders, texture: kind === "scalp" ? L.hairTex : "hair" });
    this.hair = mk(L.hair, "scalp");
    this.beard = mk(L.beard, "beard");
    if (this.hair.mesh) this.hair.mesh.visible = !L.helmet;
    if (this.hair.cap) this.hair.cap.visible = !L.helmet;
    this.hairs = [this.hair, this.beard];
    if (this.layer) for (const h of this.hairs) h.attach(this.layer);
  }

  // World-space parent for hair strands (scene). Call after adding to scene.
  addTo(scene) {
    scene.add(this.object);
    this.layer = scene;
    for (const h of this.hairs) h.attach(scene);
  }
  removeFrom() {
    this.object.removeFromParent();
    for (const h of this.hairs) h.mesh?.removeFromParent();
    this.layer = null;
  }

  // ---------- morality ----------
  buildMoralityRig() {
    const { ellipsoid: E, deform } = this.headInfo;
    const head = this.headInfo.group;
    // horns
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x2a1512, roughness: 0.45, metalness: 0.1, emissive: 0x200000 });
    this.horns = new THREE.Group();
    for (const s of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * 0.03, 0.08, -0.02), new THREE.Vector3(s * 0.085, 0.15, -0.09),
        new THREE.Vector3(s * 0.15, 0.17, -0.18), new THREE.Vector3(s * 0.2, 0.12, -0.24), new THREE.Vector3(s * 0.22, 0.06, -0.21),
      ]);
      const TS = 24, RS = 10;
      const g = new THREE.TubeGeometry(curve, TS, 1, RS, false);
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const seg = Math.floor(i / (RS + 1));
        const t = seg / TS;
        const cpt = curve.getPointAt(t);
        const r = 0.024 * Math.pow(1 - t, 0.85) + 0.0015;
        const px = pa.getX(i) - cpt.x, py = pa.getY(i) - cpt.y, pz = pa.getZ(i) - cpt.z;
        // ridged rings
        const ring = 1 + 0.08 * Math.sin(t * 60);
        pa.setXYZ(i, cpt.x + px * r * ring, cpt.y + py * r * ring, cpt.z + pz * r * ring);
      }
      g.computeVertexNormals();
      const horn = new THREE.Mesh(g, hornMat);
      horn.castShadow = true;
      const base = deform(0.36 * s, 0.68, 0.64, new THREE.Vector3());
      horn.position.copy(base);
      this.horns.add(horn);
    }
    head.add(this.horns);
    this.hornMat = hornMat;
    // halo
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.0075, 10, 48), new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.rotation.x = Math.PI / 2 - 0.25;
    this.halo.position.set(0, E.c.y + E.r.y + 0.08, E.c.z - 0.03);
    head.add(this.halo);
    const haloGlow = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.add(haloGlow);
    this.haloGlow = haloGlow;
    // light shaft (sainted)
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 7, 24, 1, true), shaftMat);
    this.shaft.position.y = 4.5;
    this.object.add(this.shaft);
    // aura ring + particles
    const N = 70;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.aura = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.06, color: 0xff4020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.aura.frustumCulled = false;
    this.object.add(this.aura);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    this.motes = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.035, color: 0x111111, transparent: true, opacity: 0, depthWrite: false }));
    this.motes.frustumCulled = false;
    this.object.add(this.motes);
  }

  setMorality(M, force) {
    this.morality = M;
    if (!this.horns) return;
    const L = this.look;
    // horns: Hardening nubs → Dreaded → Monstrous
    let horn = 0;
    if (M <= -16) horn = M > -46 ? lerp(0.025, 0.07, (-16 - M) / 30) : M > -76 ? lerp(0.07, 0.18, (-46 - M) / 30) : lerp(0.18, 0.28, (-76 - M) / 24);
    this.horns.visible = horn > 0 && !L.helmet;
    this.horns.scale.setScalar(Math.max(0.001, horn / 0.28));
    this.horns.children.forEach((h) => (h.scale.setScalar(1)));
    this.hornMat.emissive.setHex(M <= -76 ? 0x501008 : 0x150000);
    // halo
    let halo = 0;
    if (M >= 16) halo = M < 46 ? lerp(0.12, 0.32, (M - 16) / 30) : M < 76 ? lerp(0.45, 0.85, (M - 46) / 30) : 1;
    this.haloOpacity = halo;
    this.halo.visible = halo > 0;
    this.shaftOpacity = M >= 76 ? lerp(0.05, 0.12, (M - 76) / 24) : 0;
    // eyes
    const iris = this.headInfo.irisMat;
    const base = new THREE.Color(L.eyeColor);
    if (M <= -76) { iris.color.set(0xff2a10); iris.emissive.set(0xff2000); iris.emissiveIntensity = 2.2; }
    else if (M <= -46) { iris.color.set(0xb0401a); iris.emissive.set(0xff5a10); iris.emissiveIntensity = 0.9; }
    else if (M <= -16) { iris.color.copy(base.multiplyScalar(0.5)); iris.emissive.set(0); }
    else if (M >= 46) { iris.color.copy(base.lerp(new THREE.Color(0x9fd0ff), 0.6)); iris.emissive.set(0x6fb7ff); iris.emissiveIntensity = M >= 76 ? 0.9 : 0.35; }
    else if (M >= 16) { iris.color.copy(base.lerp(new THREE.Color(0xc8e4ff), 0.3)); iris.emissive.set(0); }
    else { iris.color.copy(base); iris.emissive.set(0); }
    if (L.eyeGlow && M > -46) { iris.emissive.set(L.eyeGlow); iris.emissiveIntensity = 0.7; }
    // skin darkening at the cruel extreme
    const dark = M <= -76 ? lerp(0.85, 0.65, (-76 - M) / 24) : 1;
    this.mats[0].color.setRGB(dark, dark * (M <= -76 ? 0.9 : 1), dark * (M <= -76 ? 0.88 : 1));
    // aura & particles
    this.auraMode = M <= -46 ? "red" : M >= 46 ? "gold" : (this.balanced ? "dust" : null);
    this.aura.material.color.set(M <= -46 ? 0xff3010 : M >= 46 ? 0x9fd0ff : 0xd8c890);
    this.moteMode = M <= -76 ? "flies" : M >= 46 ? "light" : null;
    this.motes.material.color.set(this.moteMode === "flies" ? 0x0a0a0a : 0xbfe4ff);
    this.motes.material.blending = this.moteMode === "light" ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.motes.material.size = this.moteMode === "flies" ? 0.03 : M >= 76 ? 0.07 : 0.045;
  }

  // ---------- actions ----------
  play(name, dur = 0.8) {
    if (this.stance === "dead" && name !== "revive") return;
    if (name === "death" || name === "downed") { this.stance = "dead"; this.stanceT = 0; this.action = null; this._deathLimbPose = null; this._groundLift = undefined; return; }
    if (name === "kneel") { this.stance = "kneel"; this.stanceT = 0; return; }
    if (name === "revive" || name === "stand") { this.stance = "normal"; this.stanceT = 0; return; }
    this.action = { name, t: 0, dur };
  }

  update(dt, ctx = {}) {
    this.time += dt;
    const b = this.bones;
    if (!b) return;
    // reset pose
    for (const bone of this.boneList) { bone.rotation.set(0, 0, 0); bone.position.copy(this.rest[bone.name]); }
    const s = this.scale;
    const spd = this.speed / s;
    const amp = clamp01(spd / 2.6);
    const run = clamp01((spd - 2.8) / 2);
    const stride = lerp(1.35, 2.1, run);
    this.phase += dt * (spd / stride) * Math.PI * 2;
    const ph = this.phase;
    const sn = Math.sin(ph), cs = Math.cos(ph);
    const t = this.time;

    // locomotion
    const A = (0.42 + 0.28 * run) * amp;
    b["upLeg.L"].rotation.x = -sn * A;
    b["upLeg.R"].rotation.x = sn * A;
    b["leg.L"].rotation.x = (0.15 + 0.9 * run) * amp * Math.max(0, cs) + 0.25 * amp * Math.max(0, -sn) + 0.04;
    b["leg.R"].rotation.x = (0.15 + 0.9 * run) * amp * Math.max(0, -cs) + 0.25 * amp * Math.max(0, sn) + 0.04;
    b["foot.L"].rotation.x = -(b["upLeg.L"].rotation.x + b["leg.L"].rotation.x) * 0.55;
    b["foot.R"].rotation.x = -(b["upLeg.R"].rotation.x + b["leg.R"].rotation.x) * 0.55;
    b.hips.position.y = this.rest.hips.y - 0.025 * amp + Math.abs(cs) * 0.03 * amp - 0.01 * run;
    b.hips.rotation.y = sn * 0.1 * amp;
    b.spine.rotation.y = -sn * 0.09 * amp;
    b.spine.rotation.x = 0.04 * amp + 0.14 * run;
    b.chest.rotation.x = Math.sin(t * 1.7) * 0.018;
    b.neck.rotation.x = -0.05 * amp - 0.1 * run;
    b.head.rotation.y = Math.sin(t * 0.37) * 0.12 * (1 - amp);
    b.head.rotation.x = Math.sin(t * 0.29) * 0.04;
    const armSw = (0.42 + 0.35 * run) * amp;
    b["upperArm.L"].rotation.x = sn * armSw;
    b["upperArm.R"].rotation.x = -sn * armSw;
    b["upperArm.L"].rotation.z = -0.13 + Math.sin(t * 1.7) * 0.01;
    b["upperArm.R"].rotation.z = 0.13 - Math.sin(t * 1.7) * 0.01;
    b["foreArm.L"].rotation.x = -0.18 - 0.3 * amp - 0.9 * run - Math.max(0, -sn) * 0.25 * amp;
    b["foreArm.R"].rotation.x = -0.18 - 0.3 * amp - 0.9 * run - Math.max(0, sn) * 0.25 * amp;
    b["fingers.L"].rotation.x = -0.5; b["fingers.R"].rotation.x = this.weapons.main ? -1.3 : -0.5;
    if (this.weapons.bow) b["fingers.L"].rotation.x = -1.3;
    if (this.weapons.shield) {
      b["upperArm.L"].rotation.x = -0.35 + sn * armSw * 0.25;
      b["foreArm.L"].rotation.x = -1.2;
      b["fingers.L"].rotation.x = 1.55;
    }
    if (this.weapons.main && ["staff", "spear", "glaive", "halberd", "trident"].includes(this.look.weapon)) {
      b["upperArm.R"].rotation.x = -0.15 + -sn * armSw * 0.3;
      b["foreArm.R"].rotation.x = this.look.weapon === "staff" ? -1.45 : -0.9;
    }
    if (this.weapons.bow) this.weapons.bow.rotation.x = 0;

    // action overlay
    const a = this.action;
    if (a) {
      a.t += dt;
      const u = clamp01(a.t / a.dur);
      if (a.name === "attack") {
        b["upperArm.R"].rotation.x = key([[0, b["upperArm.R"].rotation.x], [0.38, -2.5], [0.58, -0.4], [1, b["upperArm.R"].rotation.x]], u);
        b["upperArm.R"].rotation.z = key([[0, 0.13], [0.38, -0.55], [0.58, 0.45], [1, 0.13]], u);
        b["foreArm.R"].rotation.x = key([[0, -0.3], [0.38, -1.3], [0.58, -0.15], [1, -0.3]], u);
        b.spine.rotation.y += key([[0, 0], [0.38, 0.45], [0.6, -0.5], [1, 0]], u);
        b.spine.rotation.x += key([[0, 0], [0.5, 0.15], [1, 0]], u);
      } else if (a.name === "cleave") {
        b["upperArm.R"].rotation.x = key([[0, -0.2], [0.35, -1.5], [0.65, -1.3], [1, 0]], u);
        b["upperArm.R"].rotation.z = key([[0, 0.1], [0.35, -1.0], [0.65, 1.0], [1, 0.13]], u);
        b["foreArm.R"].rotation.x = key([[0, -0.3], [0.35, -0.4], [1, -0.3]], u);
        b.spine.rotation.y += key([[0, 0], [0.35, 0.8], [0.7, -0.8], [1, 0]], u);
      } else if (a.name === "bash") {
        b["upperArm.L"].rotation.x = key([[0, -0.35], [0.35, -0.6], [0.55, -1.45], [1, -0.35]], u);
        b["foreArm.L"].rotation.x = key([[0, -1.2], [0.35, -1.6], [0.55, -0.3], [1, -1.2]], u);
        b.spine.rotation.y += key([[0, 0], [0.35, -0.3], [0.55, 0.35], [1, 0]], u);
      } else if (a.name === "shoot") {
        const hold = key([[0, 0], [0.25, 1], [0.85, 1], [1, 0]], u);
        b["upperArm.L"].rotation.x = lerp(b["upperArm.L"].rotation.x, -1.5, hold);
        b["upperArm.L"].rotation.z = lerp(-0.13, -0.15, hold);
        b["foreArm.L"].rotation.x = lerp(-0.3, -0.05, hold);
        b["upperArm.R"].rotation.x = lerp(b["upperArm.R"].rotation.x, -1.45, hold);
        b["upperArm.R"].rotation.z = lerp(0.13, 0.35, hold);
        const draw = this.look.weapon === "crossbow" ? hold * 0.3 : key([[0, 0], [0.3, 0.4], [0.7, 1], [0.72, 0], [1, 0]], u);
        b["foreArm.R"].rotation.x = lerp(-0.3, this.look.weapon === "crossbow" ? -1.0 : -2.3, Math.max(draw, hold * 0.4));
        b.spine.rotation.y += -0.25 * hold;
        b.head.rotation.y += 0.2 * hold;
        if (this.weapons.bow) this.weapons.bow.rotation.x = Math.PI / 2 * hold;
      } else if (a.name === "cast") {
        const k = key([[0, 0], [0.35, 1], [0.6, 1.15], [1, 0]], u);
        for (const [side, sg] of [["L", 1], ["R", -1]]) {
          b[`upperArm.${side}`].rotation.x = lerp(b[`upperArm.${side}`].rotation.x, -1.35, k);
          b[`upperArm.${side}`].rotation.z = lerp(-0.13 * sg, -0.3 * sg, k);
          b[`foreArm.${side}`].rotation.x = lerp(-0.3, -0.5, k);
          b[`fingers.${side}`].rotation.x = lerp(-0.5, 0.2, k);
        }
        b.spine.rotation.x += -0.08 * k;
      } else if (a.name === "heal") {
        const k = key([[0, 0], [0.3, 1], [0.8, 1], [1, 0]], u);
        b["upperArm.L"].rotation.x = lerp(b["upperArm.L"].rotation.x, -1.0, k);
        b["upperArm.R"].rotation.x = lerp(b["upperArm.R"].rotation.x, -1.0, k);
        b["upperArm.L"].rotation.z = lerp(-0.13, 0.5, k);
        b["upperArm.R"].rotation.z = lerp(0.13, -0.5, k);
        b.head.rotation.x += -0.2 * k;
      } else if (a.name === "hit") {
        const k = key([[0, 0], [0.2, 1], [1, 0]], u);
        b.spine.rotation.x -= 0.28 * k;
        b.neck.rotation.x -= 0.2 * k;
        b["upperArm.L"].rotation.z += 0.3 * k; b["upperArm.R"].rotation.z -= 0.3 * k;
      } else if (a.name === "talk") {
        const k = key([[0, 0], [0.2, 1], [0.8, 1], [1, 0]], u);
        b["upperArm.R"].rotation.x = lerp(b["upperArm.R"].rotation.x, -0.6 + Math.sin(a.t * 5) * 0.15, k);
        b["foreArm.R"].rotation.x = lerp(b["foreArm.R"].rotation.x, -1.2, k);
        b.head.rotation.x += Math.sin(a.t * 7) * 0.04 * k;
      } else if (a.name === "wave") {
        const k = key([[0, 0], [0.2, 1], [0.85, 1], [1, 0]], u);
        b["upperArm.R"].rotation.z = lerp(0.13, -2.4, k);
        b["foreArm.R"].rotation.z = Math.sin(a.t * 10) * 0.4 * k;
      }
      if (a.t >= a.dur) this.action = null;
    }

    // stances
    this.stanceT = Math.min(1, this.stanceT + dt / 0.9);
    const st = smooth(this.stanceT);
    if (this.stance === "dead") {
      this.body.rotation.x = lerp(this.body.rotation.x, -Math.PI / 2 * 0.97, st * 0.5 + 0.02);
      this.body.position.y = lerp(this.body.position.y, 0.12 * s, st * 0.5);
      b["leg.L"].rotation.x = 0.4 * st; b["leg.R"].rotation.x = 0.15 * st;
      b["upperArm.L"].rotation.z = 0.6 * st; b["upperArm.R"].rotation.z = -0.9 * st;
      b.neck.rotation.x = -0.4 * st;
      b.head.rotation.x = -0.6 * st;
      b.head.rotation.y = 0.5 * st;
      if (this._deathLimbPose) for (const [name, angle] of Object.entries(this._deathLimbPose)) b[name].rotation.x += angle;
      for (const l of this.headInfo.lids) l.rotation.x = 0.35;
    } else {
      if (!this.swimMode) {
        this.body.rotation.x *= Math.max(0, 1 - dt * 6);
        this.body.position.y *= Math.max(0, 1 - dt * 6);
      }
      if (this.stance === "kneel") {
        b.hips.position.y = lerp(b.hips.position.y, this.rest.hips.y - 0.44, st);
        b["upLeg.L"].rotation.x = lerp(0, -0.15, st); b["upLeg.R"].rotation.x = lerp(0, -0.15, st);
        b["leg.L"].rotation.x = lerp(0, 1.55, st); b["leg.R"].rotation.x = lerp(0, 1.55, st);
        b["foot.L"].rotation.x = -0.4 * st; b["foot.R"].rotation.x = -0.4 * st;
        b["upperArm.L"].rotation.z = lerp(-0.13, 2.5, st); b["upperArm.R"].rotation.z = lerp(0.13, -2.5, st);
        b["foreArm.L"].rotation.x = -0.6 * st; b["foreArm.R"].rotation.x = -0.6 * st;
        b.neck.rotation.x = 0.35 * st;
      }
      // blink
      this.blinkT -= dt;
      const blink = this.blinkT < 0.12 ? 1 : 0;
      if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
      for (const l of this.headInfo.lids) l.rotation.x = blink ? 0.9 : -0.35;
    }

    if (this.swimMode && this.stance === "normal") {
      const moving = this.swimMode !== "tread";
      const rate = this.swimMode === "sprint" ? 9 : moving ? 6 : 3.2;
      const stroke = Math.sin(t * rate), kick = Math.sin(t * rate * 1.25);
      this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, moving ? -0.48 : -0.08, 8, dt);
      this.body.position.y = 0.025 + Math.sin(t * 3.5) * 0.025;
      b.spine.rotation.x = moving ? -0.1 : 0.03;
      b.neck.rotation.x = moving ? 0.18 : 0;
      b.head.rotation.x = moving ? 0.16 : 0.03;
      b["upperArm.L"].rotation.x = -0.85 + stroke * (moving ? 0.95 : 0.35);
      b["upperArm.R"].rotation.x = -0.85 - stroke * (moving ? 0.95 : 0.35);
      b["upperArm.L"].rotation.z = -0.48 - stroke * 0.1;
      b["upperArm.R"].rotation.z = 0.48 - stroke * 0.1;
      b["foreArm.L"].rotation.x = -0.55 - Math.max(0, stroke) * 0.42;
      b["foreArm.R"].rotation.x = -0.55 - Math.max(0, -stroke) * 0.42;
      b["upLeg.L"].rotation.x = kick * (moving ? 0.34 : 0.2);
      b["upLeg.R"].rotation.x = -kick * (moving ? 0.34 : 0.2);
      b["leg.L"].rotation.x = 0.35 + Math.max(0, -kick) * 0.3;
      b["leg.R"].rotation.x = 0.35 + Math.max(0, kick) * 0.3;
      b["foot.L"].rotation.x = -0.25; b["foot.R"].rotation.x = -0.25;
    }

    // look-at (head turns toward a target, world)
    if (this.lookAt && this.stance !== "dead") {
      const p = this.lookAt.clone();
      this.object.worldToLocal(p);
      const yaw = Math.atan2(p.x, p.z);
      b.head.rotation.y = THREE.MathUtils.clamp(yaw, -1, 1) * 0.7;
      b.neck.rotation.y = THREE.MathUtils.clamp(yaw, -1, 1) * 0.3;
    }

    // morality fx
    this.updateFx(dt);

    // hair (world space)
    if (ctx.groundWorld && this.stance === "dead") groundBody(this, ctx.groundWorld, ctx.groundAnchor || this.object.position);
    this.object.updateMatrixWorld(true);
    if (!ctx.skipHair) {
      const sim = ctx.simulateHair !== false;
      const hairGround = this.stance === "dead" && ctx.hairGround ? (x, z) => ctx.hairGround.surfaceHeightAt(x, z) : null;
      for (const h of this.hairs) h.update(dt, ctx.camera, ctx.wind, sim, hairGround);
    }
  }

  updateFx(dt) {
    const t = this.time;
    if (this.halo.visible) {
      const pulse = 0.85 + Math.sin(t * 2) * 0.15;
      this.halo.material.opacity = this.haloOpacity * pulse;
      this.haloGlow.material.opacity = this.haloOpacity * 0.35 * pulse;
    }
    this.shaft.material.opacity = this.shaftOpacity * (0.8 + Math.sin(t * 0.8) * 0.2);
    this.shaft.visible = this.shaftOpacity > 0;
    const ap = this.aura.geometry.attributes.position;
    if (this.auraMode) {
      this.aura.material.opacity = this.auraMode === "dust" ? 0.35 : Math.min(0.9, Math.abs(this.morality) / 90);
      for (let i = 0; i < ap.count; i++) {
        const a = (i / ap.count) * Math.PI * 2 + t * (this.auraMode === "red" ? -0.6 : 0.4);
        const rr = 0.45 + Math.sin(i * 7.3 + t * 2) * 0.08;
        const y = ((i * 0.137 + t * 0.25) % 1) * (this.auraMode === "red" ? 0.5 : 1.2);
        ap.setXYZ(i, Math.cos(a) * rr, y, Math.sin(a) * rr);
      }
      ap.needsUpdate = true;
    } else this.aura.material.opacity = 0;
    const mp = this.motes.geometry.attributes.position;
    if (this.moteMode) {
      this.motes.material.opacity = 0.9;
      const hy = this.height * 0.92;
      for (let i = 0; i < mp.count; i++) {
        const sp = this.moteMode === "flies" ? 3 + (i % 5) : 0.6;
        const a = i * 2.39 + t * sp;
        const rr = this.moteMode === "flies" ? 0.25 + Math.sin(t * 5 + i) * 0.08 : 0.5 + Math.sin(i) * 0.2;
        mp.setXYZ(i, Math.cos(a) * rr, hy + Math.sin(t * (this.moteMode === "flies" ? 6 : 0.9) + i * 1.7) * 0.25 - (this.moteMode === "light" ? (i % 3) * 0.3 : 0), Math.sin(a * 1.3) * rr);
      }
      mp.needsUpdate = true;
    } else this.motes.material.opacity = 0;
  }

  headWorld(out = new THREE.Vector3()) {
    this.bones.head.getWorldPosition(out);
    out.y += 0.12 * this.scale;
    return out;
  }
  handWorld(side = "R", out = new THREE.Vector3()) { return this.bones[`hand.${side}`].getWorldPosition(out); }

  dispose() { this.removeFrom(); for (const h of this.hairs) h.dispose(); }
}

// ---------- simple procedural quadrupeds (rats, hounds) ----------
export class Creature {
  constructor(kind = "rat", opts = {}) {
    this.kind = kind;
    this.object = new THREE.Group();
    this.body = new THREE.Group();
    this.object.add(this.body);
    this.speed = 0; this.phase = 0; this.time = 0; this.action = null; this.stance = "normal"; this.stanceT = 1;
    const S = kind === "rat" ? 0.42 : kind === "stag" ? 1.42 : kind === "boar" ? 1.16 : 1.0;
    this.scale = S;
    const fur = new THREE.MeshStandardMaterial({ color: kind === "rat" ? 0x3d3530 : kind === "boar" ? 0x594332 : kind === "stag" ? 0x665841 : (opts.champion ? 0x2a3a5a : 0x4a4436), roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.8 });
    const eyeM = new THREE.MeshBasicMaterial({ color: kind === "rat" ? 0xb0ff60 : kind === "stag" ? 0xa3d79a : 0xffb030 });
    const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const torso = new THREE.Group(); torso.position.y = 0.55 * S; this.body.add(torso); this.torso = torso;
    const tb = add(torso, new THREE.SphereGeometry(0.3 * S, 16, 12), fur, 0, 0, 0); tb.scale.set(0.8, 0.75, 1.6);
    const chest = add(torso, new THREE.SphereGeometry(0.26 * S, 14, 10), fur, 0, 0.04 * S, 0.3 * S); chest.scale.set(0.9, 1, 1);
    const head = new THREE.Group(); head.position.set(0, 0.12 * S, 0.55 * S); torso.add(head); this.head = head;
    const skull = add(head, new THREE.SphereGeometry(0.15 * S, 12, 10), fur, 0, 0, 0); skull.scale.set(1, 0.9, 1.2);
    this.groundMeshes = [tb, chest, skull];
    const snout = add(head, new THREE.ConeGeometry(0.09 * S, 0.24 * S, 10), fur, 0, -0.03 * S, 0.18 * S); snout.rotation.x = Math.PI / 2;
    add(head, new THREE.SphereGeometry(0.025 * S, 6, 6), dark, 0, -0.03 * S, 0.3 * S);
    for (const s of [1, -1]) {
      add(head, new THREE.SphereGeometry(0.022 * S, 6, 6), eyeM, s * 0.07 * S, 0.04 * S, 0.1 * S);
      const ear = add(head, new THREE.ConeGeometry(0.05 * S, kind === "rat" ? 0.06 * S : 0.14 * S, 6), fur, s * 0.08 * S, 0.13 * S, -0.02 * S);
      ear.rotation.z = -s * 0.3;
    }
    if (kind === "boar") {
      const mane = new THREE.MeshStandardMaterial({ color: 0x30291f, roughness: 1 });
      for (let i = 0; i < 13; i++) {
        const spike = add(torso, new THREE.ConeGeometry(.048 * S, (.19 + i % 3 * .045) * S, 4), mane,
          (i % 2 ? .055 : -.055) * S, (.2 + Math.sin(i / 13 * Math.PI) * .07) * S, (.43 - i * .073) * S);
        spike.rotation.x = -.35;
      }
      add(head, new THREE.SphereGeometry(.12 * S, 10, 8), new THREE.MeshStandardMaterial({ color: 0x826b58, roughness: 1 }), 0, -.065 * S, .3 * S).scale.set(1.2, .6, .48);
      const ivory = new THREE.MeshStandardMaterial({ color: 0xd5c6a2, roughness: .8 });
      for (const side of [-1, 1]) {
        const tusk = add(head, new THREE.ConeGeometry(.048 * S, .21 * S, 7), ivory, side * .13 * S, -.09 * S, .22 * S);
        tusk.rotation.z = side * .42;
      }
    }
    if (kind === "stag") {
      const bib = add(chest, new THREE.SphereGeometry(.19 * S, 10, 8), new THREE.MeshStandardMaterial({ color: 0xaaa087, roughness: 1 }), 0, -.08 * S, .2 * S);
      bib.scale.set(.95, 1.1, .55);
      add(head, new THREE.SphereGeometry(.12 * S, 10, 8), fur, 0, -.07 * S, .23 * S).scale.set(.85, .6, 1.5);
      const antlerMat = new THREE.MeshStandardMaterial({ color: 0x77755c, roughness: .95 });
      const briarMat = new THREE.MeshStandardMaterial({ color: 0x496747, roughness: 1 });
      const antler = (parent, ax, ay, az, bx, by, bz, radius) => {
        const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz), delta = b.clone().sub(a);
        const mesh = add(parent, new THREE.CylinderGeometry(radius * .5 * S, radius * S, delta.length() * S, 5), antlerMat,
          (ax + bx) * .5 * S, (ay + by) * .5 * S, (az + bz) * .5 * S);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      };
      for (const side of [-1, 1]) {
        antler(head, side * .11, .12, -.06, side * .25, .58, -.1, .045);
        antler(head, side * .25, .58, -.1, side * .5, .9, -.17, .038);
        antler(head, side * .5, .9, -.17, side * .7, 1.08, -.24, .027);
        for (let i = 0; i < 3; i++) antler(head, side * (.24 + i * .17), .55 + i * .16, -.1 - i * .05,
          side * (.37 + i * .17), .8 + i * .15, .12 + i * .05, .024);
        for (let i = 0; i < 3; i++) {
          const leaf = add(head, new THREE.IcosahedronGeometry(.09 * S, 0), briarMat,
            side * (.31 + i * .14) * S, (.68 + i * .15) * S, (.03 + i * .02) * S);
          leaf.scale.set(.65, 1.4, .45);
        }
      }
    }
    this.legs = [];
    for (const [x, z, front] of [[1, 1, 1], [-1, 1, 1], [1, -1, 0], [-1, -1, 0]]) {
      const hip = new THREE.Group(); hip.position.set(x * 0.15 * S, -0.05 * S, z * 0.3 * S); torso.add(hip);
      add(hip, new THREE.CylinderGeometry(0.06 * S, 0.045 * S, 0.3 * S, 8), fur, 0, -0.15 * S, 0);
      const knee = new THREE.Group(); knee.position.y = -0.3 * S; hip.add(knee);
      add(knee, new THREE.CylinderGeometry(0.04 * S, 0.03 * S, 0.22 * S, 8), dark, 0, -0.11 * S, 0);
      this.legs.push({ hip, knee, phase: (x > 0 ? 0 : Math.PI) + (front ? 0 : Math.PI / 2) });
    }
    this.tail = [];
    let parent = torso, zz = -0.45 * S;
    for (let i = 0; i < (kind === "rat" || kind === "hound" ? 6 : 2); i++) {
      const seg = new THREE.Group(); seg.position.set(0, i === 0 ? 0.05 * S : 0, i === 0 ? zz : -0.12 * S); parent.add(seg);
      const r = (kind === "rat" ? 0.03 : 0.05) * S * (1 - i * 0.12);
      const m = add(seg, new THREE.CylinderGeometry(r, r * 0.85, 0.13 * S, 6), kind === "rat" ? dark : fur, 0, 0, -0.06 * S); m.rotation.x = Math.PI / 2;
      this.tail.push(seg); parent = seg;
    }
    if (opts.champion) {
      const glow = new THREE.PointLight(0x6fb7ff, 1.5, 4);
      glow.position.y = 1; this.object.add(glow);
    }
  }
  get height() { return 0.8 * this.scale; }
  setMorality() {}
  play(name, dur = 0.6) {
    if (name === "death" || name === "downed") {
      this.stance = "dead"; this.stanceT = 0; this._groundLift = undefined; this._groundLegsSolved = false;
      for (const leg of this.legs) leg.hip.rotation.z = 0;
      return;
    }
    if (this.stance === "dead") return;
    this.action = { name, t: 0, dur };
  }
  addTo(scene) { scene.add(this.object); }
  removeFrom() { this.object.removeFromParent(); }
  dispose() { this.removeFrom(); }
  headWorld(out = new THREE.Vector3()) { return this.head.getWorldPosition(out); }
  handWorld(_s, out = new THREE.Vector3()) { return this.head.getWorldPosition(out); }
  update(dt) {
    this.time += dt;
    const spd = this.speed / this.scale;
    this.phase += dt * spd * 3.2;
    const amp = clamp01(spd / 3);
    for (const l of this.legs) {
      const p = this.phase + l.phase;
      l.hip.rotation.x = Math.sin(p) * 0.7 * amp;
      l.knee.rotation.x = Math.max(0, Math.cos(p)) * 0.8 * amp;
    }
    this.torso.position.y = 0.55 * this.scale + Math.abs(Math.sin(this.phase)) * 0.03 * amp;
    this.tail.forEach((s, i) => { s.rotation.y = Math.sin(this.time * 4 - i * 0.6) * 0.25; s.rotation.x = 0.12; });
    let lunge = 0;
    if (this.action) {
      this.action.t += dt;
      const u = clamp01(this.action.t / this.action.dur);
      if (this.action.name === "attack") lunge = key([[0, 0], [0.4, -0.3], [0.6, 1], [1, 0]], u);
      if (this.action.name === "hit") lunge = -key([[0, 0], [0.2, 0.6], [1, 0]], u);
      if (this.action.t >= this.action.dur) this.action = null;
    }
    this.head.rotation.x = -lunge * 0.4;
    this.torso.position.z = lunge * 0.15 * this.scale;
    this.stanceT = Math.min(1, this.stanceT + dt / 0.6);
    if (this.stance === "dead") { this.body.rotation.z = lerp(0, Math.PI / 2, smooth(this.stanceT)); this.body.position.y = -0.2 * this.scale * smooth(this.stanceT); }
  }
}
