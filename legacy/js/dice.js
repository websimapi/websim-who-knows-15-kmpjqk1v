// Dice rules, floating combat feedback, and the interactive three-dimensional d20.
import * as THREE from "three";

export const rollDie = (s) => 1 + Math.floor(Math.random() * s);

export function parseDice(expr) {
  if (!expr) return { n: 0, s: 0, b: 0 };
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(String(expr).replace(/\s/g, ""));
  if (!m) return { n: 0, s: 0, b: parseInt(expr) || 0 };
  return { n: +m[1], s: +m[2], b: +(m[3] || 0) };
}
export function rollDice(expr, { crit = false, bonus = 0 } = {}) {
  const { n, s, b } = parseDice(expr);
  const rolls = [];
  for (let i = 0; i < n * (crit ? 2 : 1); i++) rolls.push(rollDie(s));
  const total = Math.max(0, rolls.reduce((a, c) => a + c, 0) + b + bonus);
  return { rolls, total, expr, bonus: b + bonus, crit };
}

// d20 + bonus vs dc. adv: +1 advantage, -1 disadvantage.
export function d20Check(bonus, dc, adv = 0, forced) {
  const a = forced ?? rollDie(20), b = rollDie(20);
  const nat = adv > 0 ? Math.max(a, b) : adv < 0 ? Math.min(a, b) : a;
  const total = nat + bonus;
  const crit = nat === 20, fumble = nat === 1;
  const success = crit || (!fumble && total >= dc);
  return { nat, other: adv ? (nat === a ? b : a) : null, adv, bonus, dc, total, success, crit, fumble, margin: total - dc };
}
export const fmtBonus = (b) => (b >= 0 ? "+" : "−") + Math.abs(b);
export function describe(r, label = "") {
  const adv = r.adv > 0 ? ` (adv, ${r.other})` : r.adv < 0 ? ` (dis, ${r.other})` : "";
  return `${label}d20 ${r.nat}${adv} ${fmtBonus(r.bonus)} = ${r.total} vs ${r.dc} — ${r.crit ? "CRITICAL" : r.fumble ? "natural 1" : r.success ? "success" : "fail"}`;
}

// ---------- overlay ----------
export class DiceOverlay {
  constructor(root, project, feed) {
    this.root = root;
    this.feed = feed;
    this.project = project; // (Vector3) → {x, y, visible}
    this.items = [];
    this.feeds = [feed, document.querySelector("#combatDice2")].filter(Boolean).map(el => ({
      el, die: el.querySelector(".combat-die"), rolls: el.querySelector(".combat-rolls"), view: null, items: [],
    }));
  }
  // a floating d20 at a world position (anchor is a function returning a Vector3)
  die(anchor, r, { enemy = false, label = "" } = {}) {
    const el = document.createElement("div");
    el.className = `die ${enemy ? "enemy" : ""} ${r.success ? "hit" : "miss"} ${r.crit ? "crit" : ""} ${r.fumble ? "nat1" : ""}`;
    el.innerHTML = `<div class="face">${r.nat}</div><div class="tot">${label}${fmtBonus(r.bonus)} = ${r.total} ${r.success ? "≥" : "<"} ${r.dc}</div>`;
    this.add(el, anchor, 1.25, 0.25);
  }
  combatRoll(label, r, { enemy = false, successLabel = "HIT", failureLabel = "MISS", side = 1 } = {}) {
    const feed = this.feeds[side === 2 ? 1 : 0] || this.feeds[0];
    if (!feed) return;
    feed.el.classList.remove("hidden");
    if (!feed.view) feed.view = new D20View(feed.die, 70);
    feed.die.classList.toggle("success", r.success);
    feed.die.classList.toggle("failure", !r.success);
    feed.view.reset();
    feed.view.setOutcome(r.success);
    feed.view.animateTo(r.nat, () => {}, 850);
    const el = document.createElement("div");
    el.className = `combat-roll${enemy ? " enemy" : ""}${r.crit ? " crit" : r.success ? " hit" : " miss"}`;
    const name = document.createElement("span");
    name.className = "combat-roll-name";
    name.textContent = label;
    const result = document.createElement("strong");
    result.className = "combat-roll-result";
    result.textContent = `${r.nat} → ${r.total}/${r.dc} ${r.crit ? "CRIT" : r.success ? successLabel : failureLabel}`;
    el.append(name, result);
    feed.rolls.prepend(el);
    feed.items.unshift({ el, life: 3 });
    while (feed.items.length > 2) feed.items.pop().el.remove();
  }
  text(anchor, txt, cls = "") {
    const el = document.createElement("div");
    el.className = "dmg " + cls;
    el.textContent = txt;
    this.add(el, anchor, 1.0, 0);
  }
  add(el, anchor, life, dy) {
    this.root.append(el);
    const jitter = (Math.random() - 0.5) * 30;
    this.items.push({ el, anchor, life, t: 0, dy, jitter });
  }
  update(dt) {
    for (const feed of this.feeds) {
      for (let i = feed.items.length - 1; i >= 0; i--) {
        const item = feed.items[i];
        item.life -= dt;
        if (item.life <= 0) { item.el.remove(); feed.items.splice(i, 1); }
      }
      if (!feed.items.length) feed.el.classList.add("hidden");
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t > it.life) { it.el.remove(); this.items.splice(i, 1); continue; }
      const p = this.project(typeof it.anchor === "function" ? it.anchor() : it.anchor);
      it.el.style.display = p.visible ? "" : "none";
      it.el.style.left = p.x + it.jitter + "px";
      it.el.style.top = p.y - 18 + "px";
    }
  }
  clear() { for (const it of this.items) it.el.remove(); this.items = []; for (const feed of this.feeds) { for (const it of feed.items) it.el.remove(); feed.items = []; feed.el.classList.add("hidden"); } }
  dispose() { this.clear(); for (const feed of this.feeds) feed.view?.dispose(); }
}

// ---------- active d20 ----------
class D20View {
  constructor(host, size = 220) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, .1, 20);
    this.camera.position.set(0, 0, 6.5);
    this.scene.add(new THREE.AmbientLight(0xffe3aa, 2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-3, 5, 7);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xe19349, 2);
    rim.position.set(4, -3, -2);
    this.scene.add(rim);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(size, size, false);
    this.renderer.setClearColor(0x000000, 0);
    host.append(this.renderer.domElement);
    this.die = new THREE.Group();
    this.scene.add(this.die);
    const base = new THREE.IcosahedronGeometry(1.58, 0);
    const geo = base.index ? base.toNonIndexed() : base;
    if (geo !== base) base.dispose();
    const pos = geo.getAttribute("position");
    this.normals = [];
    this.labels = [];
    this.edges = [];
    for (let i = 0; i < 20; i++) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, i * 3);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 1);
      const c = new THREE.Vector3().fromBufferAttribute(pos, i * 3 + 2);
      const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      if (normal.dot(a) < 0) normal.negate();
      this.normals.push(normal);
      const triangle = new THREE.BufferGeometry().setFromPoints([a, b, c]);
      triangle.setIndex([0, 1, 2]);
      triangle.computeVertexNormals();
      const face = new THREE.Mesh(triangle, new THREE.MeshStandardMaterial({ color: i % 2 ? 0x765429 : 0x8e6835, metalness: .42, roughness: .38, side: THREE.DoubleSide }));
      this.die.add(face);
      const border = new THREE.LineSegments(new THREE.EdgesGeometry(triangle), new THREE.LineBasicMaterial({ color: 0xeacb83 }));
      this.die.add(border);
      this.edges.push(border);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff0c2";
      ctx.font = "bold 72px Georgia";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), 64, 68);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const number = new THREE.Mesh(new THREE.PlaneGeometry(.7, .7), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      number.position.copy(a).add(b).add(c).multiplyScalar(1 / 3).addScaledVector(normal, .012);
      number.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      this.die.add(number);
      this.labels.push(number);
    }
    geo.dispose();
    this.render();
  }
  render() { this.renderer.render(this.scene, this.camera); }
  setOutcome(success) {
    for (const edge of this.edges) edge.material.color.setHex(success ? 0xffd45a : 0xff685e);
    this.render();
  }
  reset() {
    this.die.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    this.die.position.y = 0;
    this.render();
  }
  animateTo(n, done, duration = 1650) {
    const start = performance.now();
    const from = this.die.quaternion.clone();
    const target = new THREE.Quaternion().setFromUnitVectors(this.normals[n - 1], new THREE.Vector3(0, 0, 1));
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.labels[n - 1].quaternion).applyQuaternion(target);
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(up.x, up.y));
    target.premultiply(spin);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      if (t < .74) {
        const angle = (duration < 1000 ? 7 : 13) * Math.PI * (t / .74);
        this.die.quaternion.copy(from).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(angle * .71, angle, angle * .43)));
      } else {
        if (!this.settleFrom) this.settleFrom = this.die.quaternion.clone();
        const u = (t - .74) / .26;
        this.die.quaternion.copy(this.settleFrom).slerp(target, 1 - Math.pow(1 - u, 3));
      }
      this.die.position.y = Math.sin(t * Math.PI * 5) * (1 - t) * .13;
      this.render();
      if (t < 1) this.frame = requestAnimationFrame(tick);
      else { this.settleFrom = null; done(); }
    };
    cancelAnimationFrame(this.frame);
    this.settleFrom = null;
    this.frame = requestAnimationFrame(tick);
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.die.traverse((object) => {
      object.geometry?.dispose();
      if (object.material) { object.material.map?.dispose(); object.material.dispose(); }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export class RollHold {
  constructor(el, { getFortune, spendFortune, onPause, sfx }) {
    this.el = el;
    this.getFortune = getFortune; this.spendFortune = spendFortune; this.onPause = onPause; this.sfx = sfx;
    this.active = null;
    this.queue = Promise.resolve();
    this.view = new D20View(el.querySelector(".hold-die"));
    this.onRoll = () => this.active?.roll();
    this.onContinue = () => this.active?.finish();
    this.onReroll = () => this.reroll();
    el.querySelector(".hold-roll").addEventListener("click", this.onRoll);
    el.querySelector(".hold-continue").addEventListener("click", this.onContinue);
    el.querySelector(".hold-reroll").addEventListener("click", this.onReroll);
  }
  run(title, makeRoll, mathFor, hint = "", owner = null, autoRoll = false, options = {}) {
    const next = this.queue.catch(() => {}).then(() => this.present(title, makeRoll, mathFor, hint, owner, autoRoll, options));
    this.queue = next;
    return next;
  }
  present(title, makeRoll, mathFor, hint, owner, autoRoll, options) {
    return new Promise((resolve) => {
      let r = null;
      const previousFocus = document.activeElement;
      const rollButton = this.el.querySelector(".hold-roll");
      const continueButton = this.el.querySelector(".hold-continue");
      const rerollButton = this.el.querySelector(".hold-reroll");
      const outcome = this.el.querySelector(".hold-outcome");
      const math = this.el.querySelector(".hold-math");
      this.el.querySelector(".hold-title").textContent = title;
      this.el.classList.remove("hidden");
      this.el.dataset.phase = "ready";
      this.view.reset();
      outcome.textContent = "";
      math.textContent = hint;
      rollButton.classList.remove("hidden");
      continueButton.classList.add("hidden");
      rerollButton.classList.add("hidden");
      this.onPause(true, owner);
      const finish = () => {
        if (this.active?.phase !== "result") return;
        removeEventListener("keydown", this.active.key);
        this.el.classList.add("hidden");
        this.onPause(false, owner);
        this.active = null;
        if (previousFocus?.isConnected) previousFocus.focus();
        resolve(r);
      };
      this.active = {
        phase: "ready", rerolled: false, allowReroll: options.allowReroll !== false, finish,
        roll: async () => {
          if (this.active?.phase !== "ready") return;
          this.active.phase = "rolling";
          this.el.dataset.phase = "rolling";
          rollButton.classList.add("hidden");
          rerollButton.classList.add("hidden");
          continueButton.classList.add("hidden");
          outcome.textContent = "";
          math.innerHTML = "";
          this.sfx?.("dice");
          try { r = await makeRoll(); }
          catch { r = d20Check(-100, 100); }
          if (!this.active) return;
          this.view.animateTo(r.nat, () => {
            if (!this.active) return;
            this.active.phase = "result";
            this.el.dataset.phase = r.success ? "success" : "failure";
            outcome.textContent = options.resultText?.(r) || (r.error ? "UNAVAILABLE" : r.crit ? "CRITICAL SUCCESS" : r.fumble ? "CRITICAL FAILURE" : r.success ? "SUCCESS" : "FAILURE");
            math.textContent = mathFor(r);
            continueButton.classList.remove("hidden");
            if (options.allowReroll !== false && !r.error && this.getFortune() > 0 && !r.success && !this.active.rerolled) rerollButton.classList.remove("hidden");
            continueButton.focus();
          });
        },
        key: (e) => {
          if (e.code === "KeyF" && this.active?.phase === "result") { e.preventDefault(); this.reroll(); }
          if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); if (this.active?.phase === "ready") this.active.roll(); else if (this.active?.phase === "result") finish(); }
        },
      };
      addEventListener("keydown", this.active.key);
      rollButton.focus();
      if (autoRoll) this.active.roll();
    });
  }
  reroll() {
    const a = this.active;
    if (!a || a.phase !== "result" || !a.allowReroll || a.rerolled || this.getFortune() <= 0) return;
    a.rerolled = true;
    this.spendFortune();
    a.phase = "ready";
    a.roll();
  }
  dispose() {
    this.el.classList.add("hidden");
    this.el.querySelector(".hold-roll").removeEventListener("click", this.onRoll);
    this.el.querySelector(".hold-continue").removeEventListener("click", this.onContinue);
    this.el.querySelector(".hold-reroll").removeEventListener("click", this.onReroll);
    if (this.active) removeEventListener("keydown", this.active.key);
    this.view.dispose();
  }
}
