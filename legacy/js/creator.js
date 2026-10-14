// Character creator: origin/body/hair/stats tabs + a live 3D preview of the
// procedural rigged Character with simulated, combable hair.
import * as THREE from "three";
import { Character } from "./character.js";
import { speakText, stopSpeech } from "./speech.js";
import { ANCESTRIES, BACKGROUNDS, CLASSES, ABILITIES, ATTRS, ATTR_SHORT, POINT_COST, POINT_BUDGET, mod, HAIR_STYLES, BEARD_STYLES, MORAL_STAGES } from "./data.js";
import { ANCESTRY_LORE, LINEAGE_LORE, CLASS_LORE, BACKGROUND_LORE, CLASS_SKILLS, DISCIPLINES, PRINCIPLE_LORE, PRESSURE_LORE } from "./creator-lore.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const PRINCIPLES = ["Protect the defenceless", "Keep your word", "Freedom above order", "Knowledge must be shared", "Pay every debt", "Family before strangers", "The road belongs to everyone"];
export const PRESSURES = ["A debt you can't repay", "Fear of being forgotten", "A sibling lost on the road", "Pride", "Hunger for coin", "A temper that runs hot", "Distrust of authority"];
const GENDERS = { female: "Female", male: "Male", nonbinary: "Nonbinary" };
const VOICES = { "en-female": "Female", "en-male": "Male" };
const EYE_COLS = ["#5a3a22", "#2f6a8a", "#4a7a3a", "#8a6a2a", "#6a6a7a", "#2a2a2a", "#a03a2a"];
const GEAR_COLS = [null, "#536273", "#76513a", "#7c7046", "#623f5d", "#3a5a4a", "#7a2a2a"];
const TIP_COLS = [null, "#d6b072", "#e8e4f0", "#c0471f", "#6fb7ff", "#9b3a8a", "#1a1a1a"];

export function stageOf(M) { return MORAL_STAGES.find((s) => M >= s.min && M <= s.max) || MORAL_STAGES[3]; }

function defaultState() {
  const anc = "valeborn", cls = "vanguard";
  const A = ANCESTRIES[anc].look;
  return {
    name: "", ancestry: anc, lineage: Object.keys(ANCESTRIES[anc].lineages)[0], cls, background: "road_orphan",
    principle: PRINCIPLES[0], pressure: PRESSURES[0], gender: "female", voice: "en-female", classSkill: CLASS_SKILLS[cls][0],
    attrs: { ...CLASSES[cls].preset }, bonus2: CLASSES[cls].primary[0], bonus1: CLASSES[cls].primary[1] || "vigor",
    look: { sex: 0.4, height: 1, build: A.build, head: A.head, jaw: 0.5, nose: 0.5, eyes: A.eyes, skin: A.skins[1], eyeColor: A.eyeColor || EYE_COLS[0], markings: 0.6, gear: null,
      hair: { style: "swept", color: A.hairs[0] }, beard: { style: "none", color: A.hairs[0] } },
  };
}

export class Creator {
  constructor({ onBegin, onBack }) {
    this.onBegin = onBegin; this.onBack = onBack;
    this.S = defaultState();
    this.groomHistory = [];
    this.buildUI();
    this.preview = null;
    this.running = false;
    this.beginning = false;
  }

  // ---------- public ----------
  open(initial) {
    if (initial) {
      const defaults = defaultState();
      this.S = { ...defaults, ...initial, look: { ...defaults.look, ...(initial.look || {}) },
        gender: initial.gender || (initial.voice === "en-male" ? "male" : "female"),
        voice: initial.voice === "en-male" ? "en-male" : "en-female" };
    }
    $("#creator").classList.remove("hidden");
    $("#creatorMsg").textContent = "";
    this.showTab("origin");
    this.refreshAll();
    try { this.ensurePreview(); } catch (e) { console.error(e); $("#creatorMsg").textContent = "3D preview unavailable on this device."; }
    this.running = true;
    this.loop();
  }
  close() {
    stopSpeech();
    $("#creator").classList.add("hidden");
    this.running = false;
  }

  // ---------- sheet ----------
  finalAttrs() {
    const a = { ...this.S.attrs };
    a[this.S.bonus2] += 2;
    if (this.S.bonus1 !== this.S.bonus2) a[this.S.bonus1] += 1;
    return a;
  }
  spent() { return ATTRS.reduce((s, k) => s + POINT_COST[this.S.attrs[k]], 0); }
  lookFor() {
    const L = this.S.look;
    return { ...L, ancestry: this.S.ancestry, cls: this.S.cls, gear: L.gear || undefined, hair: { ...L.hair, tip: L.hair.tip || undefined }, beard: { ...L.beard } };
  }

  // ---------- UI ----------
  chips(id, items, get, set, opts = {}) {
    const box = $(id);
    box.innerHTML = "";
    for (const [k, label] of items) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label; b.dataset.v = k;
      if (opts.locked?.(k)) { b.classList.add("locked"); b.title = "Planned for a later act"; }
      b.onclick = () => { if (opts.locked?.(k)) { $("#creatorMsg").textContent = `${label} arrives in a later act. Act I offers Vanguard, Trailblazer, Arcanist and Lifekeeper.`; return; } set(k); this.refreshAll(); };
      box.append(b);
    }
    this.marks.push(() => $$("button", box).forEach((b) => b.classList.toggle("on", b.dataset.v === get())));
  }
  swatches(id, colors, get, set) {
    const box = $(id);
    box.innerHTML = "";
    for (const c of colors) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.v = c || "";
      if (c) b.style.background = c; else { b.textContent = "∅"; b.style.background = "#222"; b.title = "Default"; }
      b.onclick = () => { set(c); this.refreshAll(); };
      box.append(b);
    }
    this.marks.push(() => $$("button", box).forEach((b) => b.classList.toggle("on", (b.dataset.v || null) === (get() || null))));
  }
  slider(id, get, set) {
    const el = $(id);
    el.oninput = () => { set(parseFloat(el.value)); this.applyLook(); };
    this.marks.push(() => { el.value = get(); });
  }

  showTab(id) {
    $$("#cTabs button").forEach((b) => { b.classList.toggle("on", b.dataset.t === id); b.setAttribute("aria-selected", String(b.dataset.t === id)); });
    $$("#creator .tab").forEach((t) => t.classList.toggle("hidden", t.dataset.t !== id));
    const steps = ["origin", "calling", "story", "body", "hair", "stats"];
    const next = steps[steps.indexOf(id) + 1];
    $("#cNext").classList.toggle("hidden", !next);
    if (next) $("#cNext").textContent = `Next: ${$("#cTabs button[data-t='" + next + "']").textContent} →`;
    $(".c-side").scrollTop = 0;
  }

  buildUI() {
    this.marks = [];
    const S = () => this.S;
    $("#cName").oninput = (e) => { this.S.name = e.target.value; };
    $$("#cTabs button").forEach((b) => (b.onclick = () => this.showTab(b.dataset.t)));
    $("#cNext").onclick = () => {
      const steps = ["origin", "calling", "story", "body", "hair", "stats"];
      const current = $("#cTabs button.on")?.dataset.t;
      this.showTab(steps[Math.min(steps.length - 1, steps.indexOf(current) + 1)]);
    };
    this.chips("#cAnc", Object.entries(ANCESTRIES).map(([k, a]) => [k, a.name]), () => S().ancestry, (k) => {
      const A = ANCESTRIES[k].look;
      Object.assign(this.S, { ancestry: k, lineage: Object.keys(ANCESTRIES[k].lineages)[0] });
      Object.assign(this.S.look, { skin: A.skins[1] || A.skins[0], build: A.build, head: A.head, eyes: A.eyes, eyeColor: A.eyeColor || EYE_COLS[0] });
      this.S.look.hair.color = A.hairs[0]; this.S.look.beard.color = A.hairs[0];
      this.buildAncestryBits();
    });
    this.chips("#cCls", Object.entries(CLASSES).map(([k, c]) => [k, c.name]), () => S().cls, (k) => {
      const c = CLASSES[k];
      Object.assign(this.S, { cls: k, attrs: { ...c.preset }, bonus2: c.primary[0], bonus1: c.primary[1] || (c.primary[0] === "intellect" ? "finesse" : "vigor"), classSkill: CLASS_SKILLS[k][0] });
    }, { locked: (k) => !CLASSES[k].playable });
    const fill = (id, entries, key) => {
      const el = $(id);
      el.innerHTML = entries.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
      el.onchange = () => { this.S[key] = el.value; this.refreshAll(); };
      this.marks.push(() => { el.value = this.S[key]; });
    };
    fill("#cBg", Object.entries(BACKGROUNDS).map(([k, b]) => [k, b.name]), "background");
    fill("#cPrin", PRINCIPLES.map((p) => [p, p]), "principle");
    fill("#cPress", PRESSURES.map((p) => [p, p]), "pressure");
    $("#cClassSkill").onchange = (e) => { this.S.classSkill = e.target.value; this.refreshAll(); };
    this.chips("#cGender", Object.entries(GENDERS), () => S().gender, (k) => {
      this.S.gender = k;
      if (k !== "nonbinary") this.S.voice = `en-${k}`;
      this.speakSample();
    });
    this.chips("#cVoice", Object.entries(VOICES), () => S().voice, (k) => { this.S.voice = k; this.speakSample(); });

    const L = () => this.S.look;
    this.slider("#cSex", () => L().sex, (v) => (L().sex = v));
    this.slider("#cHeight", () => L().height, (v) => (L().height = v));
    this.slider("#cBuild", () => L().build, (v) => (L().build = v));
    this.slider("#cHead", () => L().head, (v) => (L().head = v));
    this.slider("#cJaw", () => L().jaw, (v) => (L().jaw = v));
    this.slider("#cNose", () => L().nose, (v) => (L().nose = v));
    this.slider("#cEyes", () => L().eyes, (v) => (L().eyes = v));
    this.slider("#cMark", () => L().markings, (v) => (L().markings = v));
    this.swatches("#cEyeCol", EYE_COLS, () => L().eyeColor, (c) => (L().eyeColor = c));
    this.swatches("#cGear", GEAR_COLS, () => L().gear, (c) => (L().gear = c));

    this.chips("#cHairStyle", Object.entries(HAIR_STYLES).map(([k, h]) => [k, h.name]), () => L().hair.style, (k) => {
      const col = L().hair.color, tip = L().hair.tip;
      this.S.look.hair = { style: k, color: col, tip }; // reset sliders to style defaults
    });
    const H = (k, d) => () => L().hair[k] ?? HAIR_STYLES[L().hair.style]?.[k] ?? d;
    const setH = (k) => (v) => (L().hair[k] = v);
    this.slider("#hLength", H("length", 0.15), setH("length"));
    this.slider("#hVolume", H("volume", 0.4), setH("volume"));
    this.slider("#hCurl", H("curl", 0), setH("curl"));
    this.slider("#hFringe", H("fringe", 0.4), setH("fringe"));
    this.slider("#hSweep", H("sweep", 0), setH("sweep"));
    this.slider("#hBounce", () => 1 - (L().hair.stiff ?? HAIR_STYLES[L().hair.style]?.stiff ?? 0.5), (v) => (L().hair.stiff = 1 - v));
    this.slider("#hDensity", H("density", 1), setH("density"));
    this.slider("#hThick", H("thick", 1), setH("thick"));
    this.chips("#cBeard", Object.entries(BEARD_STYLES).map(([k, h]) => [k, h.name]), () => L().beard.style, (k) => { this.S.look.beard = { style: k, color: L().beard.color }; });
    this.slider("#bLength", () => L().beard.length ?? BEARD_STYLES[L().beard.style]?.length ?? 0.05, (v) => (L().beard.length = v));

    $("#cBack").onclick = () => { this.close(); this.onBack?.(); };
    $("#cGo").onclick = () => this.begin();
    this.buildAncestryBits();
    this.buildAttrs();
  }

  buildAncestryBits() {
    const A = ANCESTRIES[this.S.ancestry];
    // lineages
    const lin = $("#cLin");
    lin.innerHTML = "";
    for (const [k, n] of Object.entries(A.lineages)) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = n; b.dataset.v = k;
      b.onclick = () => { this.S.lineage = k; this.refreshAll(); };
      lin.append(b);
    }
    this.swatches("#cSkin", A.look.skins, () => this.S.look.skin, (c) => (this.S.look.skin = c));
    const hairCols = [...new Set([...A.look.hairs, "#2b1d14", "#9b6a3a", "#d6b072", "#e8e8e8", "#7a2a1c"])].slice(0, 9);
    this.swatches("#cHairCol", hairCols, () => this.S.look.hair.color, (c) => { this.S.look.hair.color = c; this.S.look.beard.color = c; });
    this.swatches("#cHairTip", TIP_COLS, () => this.S.look.hair.tip, (c) => (this.S.look.hair.tip = c));
    $("#cMarkRow").classList.toggle("hidden", !A.look.markings);
  }

  buildAttrs() {
    const box = $("#cAttrs");
    box.innerHTML = "";
    for (const k of ATTRS) {
      const row = document.createElement("div");
      row.className = "attr";
      row.innerHTML = `<span>${k[0].toUpperCase() + k.slice(1)}</span><button data-a="-">−</button><span class="v"></span><button data-a="+">+</button><button data-a="b" title="Ancestry bonus">⬆</button><span class="m"></span>`;
      row.querySelector('[data-a="-"]').onclick = () => { if (this.S.attrs[k] > 8) { this.S.attrs[k]--; this.refreshAll(); } };
      row.querySelector('[data-a="+"]').onclick = () => {
        const n = this.S.attrs[k] + 1;
        if (n > 15) return;
        if (this.spent() - POINT_COST[n - 1] + POINT_COST[n] > POINT_BUDGET) { $("#creatorMsg").textContent = "Not enough points."; return; }
        this.S.attrs[k] = n; this.refreshAll();
      };
      row.querySelector('[data-a="b"]').onclick = () => {
        // cycle: none → +2 → +1
        if (this.S.bonus2 === k) { this.S.bonus2 = this.S.bonus1; this.S.bonus1 = k; }
        else if (this.S.bonus1 === k) { this.S.bonus1 = ATTRS.find((a) => a !== this.S.bonus2 && a !== k); }
        else { this.S.bonus1 = this.S.bonus2; this.S.bonus2 = k; }
        this.refreshAll();
      };
      this.marks.push(() => {
        const f = this.finalAttrs()[k];
        row.querySelector(".v").textContent = f;
        row.querySelector(".m").textContent = (mod(f) >= 0 ? "+" : "") + mod(f);
        const bb = row.querySelector('[data-a="b"]');
        bb.classList.toggle("on", this.S.bonus2 === k || this.S.bonus1 === k);
        bb.textContent = this.S.bonus2 === k ? "+2" : this.S.bonus1 === k ? "+1" : "⬆";
      });
      box.append(row);
    }
  }

  refreshAll() {
    for (const m of this.marks) m();
    $("#cName").value = this.S.name;
    const A = ANCESTRIES[this.S.ancestry], C = CLASSES[this.S.cls];
    $$("#cLin button").forEach((b) => b.classList.toggle("on", b.dataset.v === this.S.lineage));
    $("#cAncLore").textContent = ANCESTRY_LORE[this.S.ancestry];
    $("#cLinLore").textContent = LINEAGE_LORE[this.S.lineage] || "";
    $("#cAncTrait").textContent = A.trait;
    $("#cClsNote").innerHTML = `<p>${CLASS_LORE[this.S.cls]}</p><small>HEALTH d${C.die} · ${C.resource.name.toUpperCase()} ${C.resource.max} · PRIMARY ${C.primary.map((p) => ATTR_SHORT[p]).join(" / ")}</small>`;
    $("#cAbilities").innerHTML = C.abilities.map((id) => `<div><b>${ABILITIES[id]?.name || id}</b><span>${ABILITIES[id]?.minLevel ? `Level ${ABILITIES[id].minLevel}` : "Level 1"}</span></div>`).join("");
    const bg = BACKGROUNDS[this.S.background];
    $("#cBgNote").innerHTML = `<p>${BACKGROUND_LORE[this.S.background]}</p><small>TRAINED · ${bg.skills.map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase())).join(" · ")}</small>`;
    $("#cPrinNote").textContent = PRINCIPLE_LORE[this.S.principle];
    $("#cPressNote").textContent = PRESSURE_LORE[this.S.pressure];
    this.refreshTraining();
    $("#cSummary").textContent = `${A.name} · ${C.name} · ${bg.name}`;
    $("#cPts").textContent = `${POINT_BUDGET - this.spent()} pts left`;
    const a = this.finalAttrs();
    const hp = C.die + mod(a.vigor);
    const guard = 10 + C.armour + C.shield + Math.min(mod(a.finesse), C.finCap);
    const def = (k, attrs) => 10 + Math.max(...attrs.map((x) => mod(a[x]))) + (C.prof.includes(k) ? 2 : 0);
    $("#cStats").innerHTML = `<b>Level 1 ${A.name} ${C.name}</b><br>Health <b>${hp}</b> · Guard <b>${guard}</b> · Reflex <b>${def("reflex", ["finesse", "instinct"])}</b> · Fortitude <b>${def("fortitude", ["might", "vigor"])}</b> · Resolve <b>${def("resolve", ["intellect", "presence"])}</b><br>Proficiency +2 · ${C.resource.name} ${C.resource.max}`;
    this.applyLook();
  }

  refreshTraining() {
    const options = CLASS_SKILLS[this.S.cls].filter((skill) => !BACKGROUNDS[this.S.background].skills.includes(skill));
    if (!options.includes(this.S.classSkill)) this.S.classSkill = options[0];
    const select = $("#cClassSkill");
    select.innerHTML = options.map((skill) => `<option value="${skill}">${skill[0].toUpperCase() + skill.slice(1)}</option>`).join("");
    select.value = this.S.classSkill;
    $("#cSkillNote").textContent = "Adds your proficiency bonus to this skill's dialogue checks. Skills already granted by your background are hidden here.";
    const paths = DISCIPLINES[this.S.cls] || [];
    $("#cPaths").innerHTML = paths.map((path) => `<div><b>${path.name}</b><span>${path.description}</span></div>`).join("");
    const trained = [...new Set([...BACKGROUNDS[this.S.background].skills, this.S.classSkill])];
    $("#cSkillSummary").textContent = trained.map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase())).join(" · ");
  }

  speakSample() { speakText("The road remembers.", this.S.voice); }

  async begin() {
    const name = this.S.name.trim();
    if (!name) { $("#cName").focus(); $("#creatorMsg").textContent = "Give your Roadsworn a name."; return; }
    if (this.spent() > POINT_BUDGET) { $("#creatorMsg").textContent = "Too many attribute points spent."; return; }
    if (this.beginning) return;
    this.beginning = true;
    const button = $("#cGo");
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Saving…";
    $("#creatorMsg").textContent = "Saving character…";
    const sheet = {
      name, ancestry: this.S.ancestry, lineage: this.S.lineage, class: this.S.cls, background: this.S.background,
      principle: this.S.principle, pressure: this.S.pressure, gender: this.S.gender, voice: this.S.voice, classSkill: this.S.classSkill,
      level: 1, xp: 0, attrs: this.finalAttrs(), baseAttrs: { ...this.S.attrs }, look: JSON.parse(JSON.stringify(this.lookFor())),
    };
    let continueAfterSave;
    try {
      if (this.preview) {
        clearTimeout(this._t);
        this.preview.char.setLook(sheet.look);
      }
      continueAfterSave = await this.onBegin?.(sheet);
    } catch (error) {
      $("#creatorMsg").textContent = "Save failed: " + (error?.message || "Please try again.");
      this.beginning = false;
      button.disabled = false;
      button.textContent = label;
      return;
    }
    this.beginning = false;
    button.disabled = false;
    button.textContent = label;
    this.close();
    try { continueAfterSave?.(); }
    catch (error) {
      console.error("Could not start the Act I cutscene", error);
      $("#title").classList.remove("hidden");
      $("#loadMsg").textContent = "The character was saved, but the cutscene could not start.";
    }
  }

  // ---------- 3D preview ----------
  ensurePreview() {
    if (this.preview) { this.applyLook(true); return; }
    const host = $("#characterPreview");
    const mobile = matchMedia("(max-width: 700px)").matches;
    const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1 : 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = !mobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    scene.add(new THREE.HemisphereLight(0xe8dcc6, 0x2a221a, 1.3));
    const key = new THREE.DirectionalLight(0xffe2b8, 2.6);
    key.position.set(-2, 4, 3); key.castShadow = !mobile; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1 });
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb0d8, 1.8); rim.position.set(2.5, 2.5, -3); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.008, 6, 80), new THREE.MeshBasicMaterial({ color: 0xb58a4a }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.005; scene.add(ring);

    const char = new Character(this.lookFor(), { hairGuides: mobile ? 56 : 220 });
    char.addTo(scene);
    const P = (this.preview = { renderer, scene, camera, char, floor, ring, mobile, lastFrame: 0, yaw: 0.35, vyaw: 0, face: 0, faceT: 0, wind: new THREE.Vector3(), gust: 0, clock: new THREE.Clock(), comb: false });

    const resize = () => {
      const r = host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(host); resize();

    // drag to spin / comb
    const ray = new THREE.Raycaster();
    const ndc = (e) => { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
    let drag = null;
    host.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button,input")) return;
      host.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, last: null, stroke: [] };
    });
    host.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x; drag.x = e.clientX; drag.y = e.clientY;
      if (!P.comb) { P.vyaw = dx * 0.012; P.yaw += dx * 0.012; return; }
      ray.setFromCamera(ndc(e), camera);
      const n = char.hair.pick(ray.ray);
      if (n && drag.last) {
        const d = n.clone().sub(drag.last);
        if (d.length() > 0.04) {
          d.normalize();
          drag.stroke.push({ p: [drag.last.x, drag.last.y, drag.last.z], d: [d.x, d.y, d.z] });
          drag.last = n;
        }
      } else if (n) drag.last = n;
    });
    const end = () => {
      if (drag?.stroke.length) {
        const h = this.S.look.hair;
        this.groomHistory.push((h.groom || []).length);
        h.groom = [...(h.groom || []), ...drag.stroke].slice(-32);
        this.applyLook();
      }
      drag = null;
    };
    host.addEventListener("pointerup", end);
    host.addEventListener("pointercancel", end);
    host.addEventListener("wheel", (e) => { P.face = Math.max(0, Math.min(1, P.face - e.deltaY * 0.0015)); e.preventDefault(); }, { passive: false });
    $("#pvComb").onclick = () => { P.comb = !P.comb; $("#pvComb").classList.toggle("on", P.comb); host.classList.toggle("comb", P.comb); if (P.comb) { P.face = Math.max(P.face, 0.7); } };
    $("#pvUndo").onclick = () => { const h = this.S.look.hair; if (!h.groom?.length) return; h.groom = h.groom.slice(0, this.groomHistory.pop() ?? 0); this.applyLook(); };
    $("#pvReset").onclick = () => { this.S.look.hair.groom = []; this.groomHistory = []; this.applyLook(); };
    $("#pvFace").onclick = () => { P.face = P.face > 0.5 ? 0 : 1; };
    $("#pvWind").onclick = () => { P.gust = 1.6; };
    const moral = $("#pvMoral");
    moral.oninput = () => { const M = +moral.value; char.setMorality(M); $("#pvMoralName").textContent = stageOf(M).name; };
  }

  applyLook(force) {
    if (!this.preview) return;
    const key = JSON.stringify(this.lookFor());
    if (!force && key === this._lastKey) return;
    this._lastKey = key;
    clearTimeout(this._t);
    // debounce heavy rebuilds while sliders drag
    this._t = setTimeout(() => {
      try { this.preview.char.setLook(this.lookFor()); } catch (e) { console.error(e); $("#creatorMsg").textContent = "Preview error: " + e.message; }
    }, 40);
  }

  loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this.loop());
    const P = this.preview;
    if (!P) return;
    const now = performance.now();
    if (P.mobile && now - P.lastFrame < 1000 / 30) return;
    P.lastFrame = now;
    const dt = Math.min(0.05, P.clock.getDelta());
    P.yaw += P.vyaw * 0; // inertia handled below
    P.vyaw *= 0.92;
    P.yaw += P.vyaw * 0.2;
    P.char.object.rotation.y = P.yaw;
    P.faceT += (P.face - P.faceT) * Math.min(1, dt * 6);
    const h = P.char.height;
    // Keep the full-body view and baseplate at one scale so ancestry and
    // height changes remain visible. Only the explicit Face view follows the head.
    const ty = THREE.MathUtils.lerp(1.05, h * 0.93, P.faceT);
    const dist = THREE.MathUtils.lerp(5.6, 0.95, P.faceT);
    P.camera.position.set(0, ty + 0.05, dist);
    P.camera.lookAt(0, ty, 0);
    P.gust = Math.max(0, P.gust - dt * 0.8);
    const t = performance.now() * 0.001;
    P.wind.set((Math.sin(t * 0.7) * 0.4 + P.gust * 5) * Math.cos(P.yaw), 0, (0.2 + P.gust * 3) * -Math.sin(P.yaw));
    P.char.speed = 0;
    P.char.update(dt, { camera: P.camera, wind: P.wind });
    P.renderer.render(P.scene, P.camera);
  }
}
