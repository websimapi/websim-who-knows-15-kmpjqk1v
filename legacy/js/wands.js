// Marrowgate's wand table: carving choices, d20 result, one cached spell per wand.
import { ABILITIES } from "./data.js";
import { itemImage } from "./item-art.js";

const $ = (s) => document.querySelector(s);
const WOODS = { walnut: "#8b5a35", oak: "#c6a269", mahogany: "#a1583e", ash: "#d2bd91", ebony: "#3a2c2d" };
const TOOLS = ["gouge", "chisel", "scrape", "brand", "polish"];
const QUESTIONS = [
  { line: "The grain is open. What should the wand protect or pursue?", choices: ["The people beside me", "The truth hidden on the road", "My own freedom", "The balance of living things"] },
  { line: "And when danger reaches you, what does your magic do first?", choices: ["Strike before it can move", "Bind it in place", "Turn its strength aside", "Let it feel what it has done"] },
  { line: "Last: describe the shape your spell should take. Speak plainly; the wood is listening.", choices: ["A narrow, relentless thread", "A circling burst of light", "A crooked arc through the air", "A bloom that opens at impact"] },
];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const allowed = (cls) => cls === "arcanist" || cls === "lifekeeper";

export class WandSystem {
  constructor(game) {
    this.g = game;
    this.el = $("#wandScene");
    this.closeButton = $("#wandClose");
    this.closeButton.onclick = () => this.close();
    this.canvas = $("#wandCanvas");
    this.canvas.addEventListener("pointerdown", e => this.stroke(e));
    this.canvas.addEventListener("pointermove", e => { if (e.buttons === 1 && !this._drawing) this.stroke(e); });
    this.canvas.addEventListener("pointerup", () => { this._drawing = false; });
    this.canvas.addEventListener("pointerleave", () => { this._drawing = false; });
    this.reset();
  }
  reset() { this.path = { wood: "walnut", strokes: [], answers: [] }; this.tool = "gouge"; this.stage = "entry"; this.roll = null; this.busy = false; this._drawing = false; }
  get active() { return !this.el.classList.contains("hidden"); }
  get wands() { return this.g.state.wands || (this.g.state.wands = []); }
  restore() {
    for (const wand of this.wands) this.register(wand);
    if (!this.wands.some(w => w.id === this.g.state.equippedWandId)) this.g.state.equippedWandId = null;
    if (this.g.state.equippedWandId) this.g.state.equipment.wand = this.g.state.equippedWandId;
    else delete this.g.state.equipment.wand;
    this.syncEquip();
    this.g.refreshEquipment();
  }
  register(wand, sheet = this.g.sheet) {
    if (!wand?.id || !wand.spell?.id || !wand.stats) return;
    const s = wand.spell, p = wand.stats;
    const die = Math.min(10, 4 + Math.floor(p.power / 5) * 2);
    const dice = `${Math.max(1, Math.floor((p.power + 3) / 9))}d${die}`;
    const spell = { name: s.name, icon: { fire:"✦", force:"✧", radiant:"☼", verdant:"❦", shadow:"◈", frost:"❄" }[s.element] || "✧", kind: "spell", attr: sheet.class === "lifekeeper" ? "instinct" : "intellect",
      dmg: dice, type: s.element, range: Math.min(32, p.reach), windup: Math.max(.19, .55 - p.focus * .018), recover: .52, cost: sheet.class === "lifekeeper" ? 12 : 2,
      cooldown: Math.max(2, 6 - Math.floor(p.focus / 4)), projectile: "wand", wandColor: s.color, wandForm: s.form, wandMotion: s.motion,
      status: s.effect === "slow" ? { slowed: 2 + p.level * .3 } : s.effect === "pin" ? { pinned: 1 + p.level * .25 } : undefined,
      interrupt: s.effect === "sunder" };
    ABILITIES[s.id] = spell;
  }
  syncEquip() {
    if (!this.g.player?.stats) return;
    const base = this.g.player.stats.abilities.filter(k => !k.startsWith("wand_"));
    const wand = this.wands.find(w => w.id === this.g.state.equippedWandId);
    this.g.player.stats.abilities = wand ? [...base, wand.spell.id] : base;
    if (this.g.localPlayer2) {
      if (!this.g.p2SaveId) this.g.localPlayer2.stats.abilities = [...this.g.player.stats.abilities];
      else {
        const secondBase = this.g.localPlayer2.stats.abilities.filter(k => !k.startsWith("wand_"));
        const secondWand = this.g.p2State.wands?.find(w => w.id === this.g.p2State.equippedWandId);
        this.g.localPlayer2.stats.abilities = secondWand ? [...secondBase, secondWand.spell.id] : secondBase;
      }
    }
    this.g.buildHotbar?.();
  }
  equip(id, actor = this.actor || this.g.player) {
    const state = this.g.social.actorState(actor), sheet = actor.sheet || this.g.sheet;
    if (!allowed(sheet.class) || !(state.wands || []).some(w => w.id === id)) return;
    state.equippedWandId = id;
    state.equipment.wand = id;
    this.syncEquip(); this.g.refreshEquipment(); if (actor === this.g.localPlayer2) this.g.buildP2Hotbar?.(); this.g.social.net?.send({ type: "wand_equip", id }); this.g.save();
    this.g.toast("Wand equipped", `${state.wands.find(w => w.id === id).spell.name} · slot ${actor.stats.abilities.length}`);
  }
  unequip() { this.g.state.equippedWandId = null; delete this.g.state.equipment.wand; this.syncEquip(); this.g.refreshEquipment(); this.g.social.net?.send({ type: "wand_equip", id: null }); this.g.save(); }
  open(actor = this.g.player) {
    if (!this.busy) this.reset(); this.g.keys.clear(); this.el.classList.remove("hidden");
    this.actor = actor;
    this.g.beginConversation(actor);
    this.g.talking = this.g.npcs.carver;
    this.g.dialogueSpeaker = "npc";
    const cameraKey = actor === this.g.localPlayer2 ? "cam2Dist" : "camDist";
    this.previousCamDist = this.g[cameraKey];
    this.g[cameraKey] = Math.min(this.g[cameraKey], 5);
    this.render();
  }
  close() { this.el.classList.add("hidden"); this.g.talking = null; const cameraKey = this.actor === this.g.localPlayer2 ? "cam2Dist" : "camDist"; if (this.previousCamDist) this.g[cameraKey] = this.previousCamDist; this.g.endConversation(); this.actor = null; this.g.social?.renderInv(); }
  button(text, fn, selected = false, disabled = false) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.classList.toggle("on", selected); b.disabled = disabled; b.onclick = fn; return b;
  }
  render() {
    const line = $("#wandLine"), choices = $("#wandChoices"), work = $("#wandWork"), status = $("#wandStatus");
    const sheet = this.actor?.sheet || this.g.sheet, inv = this.g.social.actorInv(this.actor || this.g.player);
    choices.replaceChildren(); status.textContent = ""; work.classList.add("hidden");
    if (this.stage === "entry") {
      if (!allowed(sheet.class)) {
        line.textContent = "I can teach a hand to carve, but only an Arcanist or Lifekeeper can wake the grain. This table is closed to your calling.";
        choices.append(this.button("Leave the table", () => this.close())); return;
      }
      if (!(inv.carving_stick > 0)) {
        line.textContent = "Bring me a straight stick gathered beyond Marrowgate's walls. Wood bought with gold has forgotten the road.";
        choices.append(this.button("Leave the table", () => this.close())); return;
      }
      line.textContent = "Set your road stick on the table. Choose its wood, then carve at least three marks. The stick is the whole cost.";
      choices.append(this.button("Begin carving · 1 stick", () => { this.stage = "carve"; this.render(); }));
      return;
    }
    if (this.stage === "carve") {
      work.classList.remove("hidden");
      line.textContent = "The grain follows your hand. Drag across the wood with a tool; each cut will remain in this wand.";
      const woods = $("#wandWoods"), tools = $("#wandTools"); woods.replaceChildren(); tools.replaceChildren();
      for (const wood of Object.keys(WOODS)) woods.append(this.button(wood[0].toUpperCase() + wood.slice(1), () => { this.path.wood = wood; this.render(); }, wood === this.path.wood));
      for (const tool of TOOLS) tools.append(this.button(tool[0].toUpperCase() + tool.slice(1), () => { this.tool = tool; this.render(); }, tool === this.tool));
      this.draw();
      choices.append(this.button("Finish carving", () => { this.roll = 1 + Math.floor(Math.random() * 20); this.g.audio.ui("dice", .5); this.stage = "roll"; this.render(); }, false, this.path.strokes.length < 3));
      return;
    }
    if (this.stage === "roll") {
      line.textContent = `The d20 settles on ${this.roll}. At level ${sheet.level || 1}, this will shape the wand's power, focus, and reach. Now tell me what magic it should carry.`;
      choices.append(this.button("Speak with Elian", () => { this.stage = "question"; this.render(); })); return;
    }
    if (this.stage === "question") {
      const q = QUESTIONS[this.path.answers.length];
      const previous = this.path.answers.at(-1);
      line.textContent = previous ? `“${previous},” Elian repeats, following that choice deeper into the grain. ${q.line}` : q.line;
      for (const answer of q.choices) choices.append(this.button(answer, () => this.answer(answer)));
      const input = document.createElement("input"); input.maxLength = 120; input.placeholder = "Or answer in your own words…"; input.setAttribute("aria-label", "Your answer to the wizard");
      const submit = this.button("Say it", () => { if (input.value.trim()) this.answer(input.value.trim()); });
      input.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); submit.click(); } };
      choices.append(input, submit); return;
    }
    if (this.stage === "making") { line.textContent = "Elian listens to the last answer and draws the spell from the grain…"; status.textContent = "Binding the spell"; return; }
    if (this.stage === "done") {
      const w = this.latest; line.textContent = `“${w.spell.name}.” ${w.spell.description}`;
      status.textContent = `d20 ${w.stats.roll} · Level ${w.stats.level} · Power ${w.stats.power} · Focus ${w.stats.focus} · Reach ${w.stats.reach}`;
      choices.append(this.button("Equip wand", () => { this.equip(w.id); this.close(); }), this.button("Keep in pack", () => this.close()));
    }
  }
  answer(value) { this.path.answers.push(value); if (this.path.answers.length === 3) this.create(); else this.render(); }
  stroke(e) {
    if (this.stage !== "carve" || this.path.strokes.length >= 40) return;
    const box = this.canvas.getBoundingClientRect(), x = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
    this.path.strokes.push({ tool: this.tool, x: Math.round(x * 1000) / 1000 }); this._drawing = true;
    this.draw();
    const finish = $("#wandChoices button"); if (finish) finish.disabled = this.path.strokes.length < 3;
  }
  draw() {
    const c = this.canvas, ctx = c.getContext("2d"), w = c.width, h = c.height; ctx.clearRect(0,0,w,h);
    const grad = ctx.createLinearGradient(0,0,0,h); grad.addColorStop(0,"#332118"); grad.addColorStop(1,"#211711"); ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
    ctx.shadowColor = "#080606"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 9;
    ctx.strokeStyle = WOODS[this.path.wood]; ctx.lineCap = "round"; ctx.lineWidth = 31; ctx.beginPath(); ctx.moveTo(45,91); ctx.bezierCurveTo(190,84,370,96,515,87); ctx.stroke();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "#ffffff27"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(50,82); ctx.bezierCurveTo(190,75,370,87,515,78); ctx.stroke();
    this.path.strokes.forEach((s,i) => { const x = 48+s.x*464, y = 89+Math.sin(i*2.4)*7; ctx.strokeStyle = s.tool === "brand" ? "#21110d" : s.tool === "polish" ? "#f0dbb0" : "#3c281d"; ctx.lineWidth = s.tool === "chisel" ? 5 : s.tool === "scrape" ? 2 : 3; ctx.beginPath(); ctx.moveTo(x-5,y-7); ctx.lineTo(x+5,y+7); ctx.stroke(); });
    $("#wandProgress").textContent = `${this.path.strokes.length} marks · ${this.tool} · ${this.path.strokes.length < 3 ? `${3-this.path.strokes.length} more to finish` : "ready to finish"}`;
  }
  async create() {
    this.stage = "making"; this.busy = true; this.render();
    if (this.g.social.net) { this.g.social.net.send({ type: "carve_wand", path: this.path, roll: this.roll }); return; }
    try {
      const sheet = this.actor?.sheet || this.g.sheet, inv = this.g.social.actorInv(this.actor || this.g.player);
      const r = await fetch("/api/wand-local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: this.path, roll: this.roll, level: sheet.level || 1, cls: sheet.class }) });
      const body = await r.json(); if (!r.ok || !body.wand) throw new Error(body.error || "The spell could not be bound.");
      if (!(inv.carving_stick > 0)) throw new Error("Your stick is gone.");
      inv.carving_stick--; if (!inv.carving_stick) delete inv.carving_stick;
      this.finish(body.wand);
    } catch (e) { this.busy = false; this.stage = "question"; this.path.answers.pop(); this.render(); $("#wandStatus").textContent = e.message || "Try again."; }
  }
  onResult(m) {
    if (m.error) { this.busy = false; this.stage = "question"; this.path.answers.pop(); this.render(); $("#wandStatus").textContent = m.error; return; }
    if (m.wand) this.finish(m.wand);
  }
  finish(wand) {
    const actor = this.actor || this.g.player, state = this.g.social.actorState(actor);
    state.wands ||= [];
    if (!state.wands.some(w => w.id === wand.id)) state.wands.push(wand);
    this.register(wand, actor.sheet || this.g.sheet); this.latest = wand; this.busy = false; this.stage = "done"; this.render();
    if (!this.active) this.g.toast("Wand ready", wand.spell.name);
    this.g.social.renderInv(); this.g.social.renderSheet(); this.g.save(); this.g.audio.ui("halo", .5);
  }
  packHTML() {
    if (!this.wands.length) return "";
    return `<div class="sp-sub">Wands</div><div class="rows">${this.wands.map(w => `<button class="row" data-wand="${esc(w.id)}" title="${esc(w.spell.description)} · d20 ${w.stats.roll}, level ${w.stats.level}, power ${w.stats.power}, focus ${w.stats.focus}, reach ${w.stats.reach}">${itemImage("road_staff")}${esc(w.name)} · ${esc(w.spell.name)} <small>Power ${w.stats.power}</small><i>${this.g.state.equippedWandId === w.id ? "Equipped" : "Equip"}</i></button>`).join("")}</div>`;
  }
  wirePack(el) { el.querySelectorAll("[data-wand]").forEach(b => b.onclick = () => this.g.state.equippedWandId === b.dataset.wand ? this.unequip() : this.equip(b.dataset.wand)); }
}
