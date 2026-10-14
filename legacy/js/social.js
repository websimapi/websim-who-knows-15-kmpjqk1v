// Social layer shared by every mode: inventory, gold, NPC shops, theft with
// city guards, the right-click pie menu, and — in online realms — other
// players, chat, trading and player-to-player theft (server-checked).
import * as THREE from "three";
import { Character } from "./character.js";
import { Net } from "./net.js";
import { ITEMS, STARTER, STARTER_EQUIPMENT, LOOTABLE, SHOP, buyPrice, sellPrice, shopExchange, stealOdds, inventoryWeight, carryCapacity, fitCount } from "./items.js";
import { cityLineClear, cityPointClear } from "./city-nav.js";
import { NPCS, CLASSES, BACKGROUNDS } from "./data.js";
import { poseRider } from "./horses.js";
import { EQUIPMENT_SLOTS, cleanEquipment, equipmentLook, migrateShieldEquipment } from "./equipment.js";
import { animalHandlingBonus, WILDLIFE } from "../server.js";
import { itemImage } from "./item-art.js";
import { SheetPreview } from "./sheet-preview.js";
import { SWIM_DEPTH } from "./swimming.js";

const $ = (s) => document.querySelector(s);
const TMP = new THREE.Vector3();
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pct = (x) => Math.round(x * 100) + "%";
const skullVisible = (until) => Number(until) > Date.now();
function makeHostileGlow(model) {
  const material = new THREE.MeshBasicMaterial({ color: 0xff3a32, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(.72, .88, 32), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .035;
  model.object.add(mesh);
  return mesh;
}
const itemChip = (k, n, extra = "") => {
  const it = ITEMS[k];
  return `<div class="item-cell"><button class="item" data-k="${k}" title="${esc(it.name)} — ${esc(it.desc)}" ${extra}>${itemImage(k)}${n > 1 ? `<b>${n}</b>` : ""}</button><button class="item-drop" data-drop="${k}" title="Place ${esc(it.name)} on the ground" aria-label="Place ${esc(it.name)} on the ground">↓</button></div>`;
};

export class Social {
  constructor(game) {
    this.g = game;
    this.online = game.data.online || null; // { realm, password }
    this.net = null;
    this.remotes = new Map(); // id → { o, model, pos, yaw, info, downed }
    this.plates = new Map();
    this.guards = [];
    this.guardT = 0;
    this.trade = null;
    this.hostile = false;
    this.skullUntil = 0;
    this.skullGuardT = 0;
    this.selfGlow = null;
    this.selfSkull = null;
    const s = game.state;
    if (!s.inv) s.inv = { ...STARTER };
    if (!this.online && !s.equipmentInitialized) {
      const starter = STARTER_EQUIPMENT[game.sheet.class] || {};
      for (const key of Object.values(starter)) if (!s.inv[key]) s.inv[key] = 1;
      s.equipment = { ...starter, ...(s.equipment || {}) };
      s.equipmentInitialized = true;
    }
    if (!this.online) migrateShieldEquipment(s, game.sheet.class);
    s.equipment = cleanEquipment(s.equipment, s.inv);
    this.bounty = Number(s.bounty) || 0;
  }
  get inv() { return this.g.state.inv; }
  get gold() { return this.g.state.gold; }
  actorState(actor = this.g.player) { return actor === this.g.localPlayer2 && this.g.p2SaveId ? this.g.p2State : this.g.state; }
  actorInv(actor = this.g.player) { return this.actorState(actor).inv; }
  canCarry(k, actor = this.g.player) { return !!fitCount(this.actorInv(actor), actor.sheet || this.g.sheet, k); }
  canBrew(actor = this.g.player) { return inventoryWeight(this.actorInv(actor)) - .12 - .2 - .15 + ITEMS.healing_draught.weight <= carryCapacity(actor.sheet || this.g.sheet) + 1e-6; }

  // ---------- online connection (called before the world is built) ----------
  async connect() {
    const g = this.g;
    this.net = new Net();
    const sh = g.sheet;
    const joined = await this.net.connect({
      realm: this.online.realm, password: this.online.password,
      char: { id: g.saveId, name: sh.name, look: sh.look, ancestry: sh.ancestry, cls: sh.class, level: sh.level || 1, background: sh.background, attrs: sh.attrs },
      pos: g.data.pos || { x: 0, y: 0, z: 0 },
    });
    this.realm = joined.realm;
    g.data.lastRealm = joined.realm.id;
    this.userId = joined.userId;
    this.hostile = !!joined.hostile;
    this.skullUntil = joined.skullUntil || 0;
    this.horsesSnapshot = joined.horses || [];
    this.petsSnapshot = joined.pets || [];
    this.hollowLootIds = joined.hollowLootIds || [];
    this.hollowGear = joined.hollowGear || {};
    this.groundSnapshot = joined.groundItems || [];
    this.housesSnapshot = joined.houses || [];
    this.corpsesSnapshot = joined.corpses || [];
    this.applyInv(joined);
    if (joined.alchemy && joined.alchemy !== "locked") g.state.quests.alchemy = joined.alchemy;
    g.state.skills.alchemy = joined.alchemy === "done";
    g.state.alchemyFresh = joined.alchemyFresh || {};
    g.state.wands = joined.wands || [];
    this.joinPos = joined.pos;
    const n = this.net;
    n.on("joined", (o) => this.addRemote(o));
    n.on("update", (o) => {
      const remote = this.remotes.get(o.info.id);
      if (!remote) { this.addRemote(o); return; }
      remote.info = o.info;
      remote.o = o;
      remote.model.setLook(equipmentLook(o.info.look || {}, o.info.equipment));
    });
    n.on("left", (o) => { this.dropRemote(o.info.id); g.log(`${o.info.name} left the realm.`); });
    n.on("rejoined", (m) => { this.applyInv(m); g.state.quests.alchemy = m.alchemy === "locked" ? undefined : m.alchemy; g.state.skills.alchemy = m.alchemy === "done"; g.state.alchemyFresh = m.alchemyFresh || {}; g.renderQuest(); for (const id of [...(g.groundItems?.entries.keys() || [])]) g.groundItems.remove(id); for (const item of m.groundItems || []) g.groundItems?.add(item); g.state.wands = m.wands || []; g.wands?.restore(); this.userId = m.userId; this.hostile = !!m.hostile; this.skullUntil = m.skullUntil || 0; this.horsesSnapshot = m.horses || []; this.petsSnapshot = m.pets || []; this.hollowLootIds = m.hollowLootIds || []; this.hollowGear = m.hollowGear || {}; this.housesSnapshot = m.houses || []; this.resetHouses(); for (const house of this.housesSnapshot) { g.interiors?.onHouseUpdate(house); g.interiors2?.onHouseUpdate(house); } for (const horse of this.horsesSnapshot) g.horses?.onUpdate(horse); for (const pet of this.petsSnapshot) g.wildlife?.onUpdate(pet); for (const corpse of m.corpses || []) g.corpses?.onUpdate(corpse); this.renderSheet(); });
    n.on("wand_result", m => g.wands?.onResult(m));
    n.on("corpse_snapshot", m => { for (const corpse of m.corpses || []) { if (g.corpses) g.corpses.onUpdate(corpse); else this.corpsesSnapshot.push(corpse); } });
    n.on("corpse_update", m => { if (g.corpses) g.corpses.onUpdate(m.corpse); else this.corpsesSnapshot.push(m.corpse); });
    n.on("corpse_result", m => { if (m.reason) g.log(m.reason, "fail"); });
    n.on("hollow_update", m => {
      if (m.hasLoot && !this.hollowLootIds.includes(m.hollow)) this.hollowLootIds.push(m.hollow);
      if (!m.hasLoot) this.hollowLootIds = this.hollowLootIds.filter(id => id !== m.hollow);
      if (m.gear) this.hollowGear[m.hollow] = m.gear; else if (!m.hasLoot) delete this.hollowGear[m.hollow];
      for (const actor of g.combat?.actors || []) if (actor.kind === "hollow" && actor.spawn === m.hollow) g.corpses?.applyHollowGear(actor, m.gear || this.hollowGear[m.hollow] || {});
    });
    n.on("horse_update", (m) => {
      const index = this.horsesSnapshot.findIndex((horse) => horse.id === m.horse.id);
      if (index >= 0) this.horsesSnapshot[index] = m.horse;
      else this.horsesSnapshot.push(m.horse);
      g.horses?.onUpdate(m.horse);
    });
    n.on("horse_result", (m) => g.horses?.onResult(m));
    n.on("pet_update", (m) => { if (g.wildlife) g.wildlife.onUpdate(m.pet); else { const i = this.petsSnapshot.findIndex(p => p.id === m.pet.id); if (i >= 0) this.petsSnapshot[i] = m.pet; else this.petsSnapshot.push(m.pet); } });
    n.on("pet_result", (m) => g.wildlife?.onResult(m));
    n.on("horse_stolen", (m) => g.toast("Horse stolen", `${m.thief} took ${m.name}`));
    n.on("event", (o, e) => { const r = this.remotes.get(o.info.id); if (r && e.kind === "anim") r.model.play(e.name); });
    n.on("closed", (reason) => { this.shopPending = false; this.shopRender?.(); g.toast("Disconnected", reason || "The realm closed the connection"); });
    n.on("chat", (m) => this.chatLine(m.name, m.text, m.from === n.id));
    n.on("inv", (m) => this.onInv(m));
    n.on("quest_result", (m) => g.journal?.pendingTurnin?.(m));
    n.on("shop_result", (m) => {
      this.shopPending = false;
      if (m.error) g.log(m.error, "fail");
      else { this.shopOffer = { buying: {}, selling: {}, gold: 0 }; g.toast("Barter complete", "Your offer was accepted"); }
      this.shopRender?.();
    });
    n.on("ground_item", (m) => {
      if (m.op === "add") { if (g.groundItems) g.groundItems.add(m.item); else this.groundSnapshot.push(m.item); }
      if (m.op === "remove") g.groundItems?.remove(m.id);
    });
    n.on("alchemy_result", (m) => {
      if (m.reason) { g.log(m.reason, "fail"); return; }
      if (m.started) { g.state.quests.alchemy = "open"; g.renderQuest(); }
      if (m.learned) { g.state.quests.alchemy = "done"; g.state.skills.alchemy = true; g.gainXP(100); g.toast("Alchemy learned", "Mira helps you brew a healing draught"); g.renderQuest(); this.renderSheet(); g.save(); }
    });
    n.on("alchemy_roll", (m) => { this.alchemyRollPending?.(m.roll || null); this.alchemyRollPending = null; });
    n.on("city_lockpick", (m) => { this.cityLockPending?.(m); this.cityLockPending = null; });
    n.on("house_update", (m) => { const i = this.housesSnapshot.findIndex(h => h.id === m.house.id); if (i < 0) this.housesSnapshot.push(m.house); else this.housesSnapshot[i] = m.house; g.interiors?.onHouseUpdate(m.house); g.interiors2?.onHouseUpdate(m.house); });
    n.on("house_result", (m) => { const pending = this.housePending?.get(m.request); if (pending) { this.housePending.delete(m.request); pending(m); } });
    n.on("house_actor", (m) => { if (m.slot === 2 && g.p2SaveId === m.characterId) { g.p2State.inv = { ...m.inv }; g.p2State.gold = m.gold; this.renderInv(); this.renderSheet(); g.save(); } });
    n.on("house_knock", (m) => { const door = g.world?.cityDoors.find(d => d.id === m.door); g.toast("Someone is at your door", `${m.name} knocks at ${door?.label || "your home"}`); });
    n.on("wand_looted", (m) => { if (!m.wand?.id) return; if (!g.state.wands.some(w => w.id === m.wand.id)) g.state.wands.push(m.wand); g.wands?.register(m.wand); this.renderInv(); this.renderSheet(); g.save(); });
    n.on("pvp_state", (m) => { this.hostile = !!m.hostile; this.skullUntil = m.skullUntil || 0; this.renderSheet(); });
    n.on("pvp_hit", (m) => {
      if (m.to === n.id) { g.player.hp = Math.max(0, m.hp); g.player.model.play("hit", .35); }
      const remote = this.remotes.get(m.to);
      if (remote && m.hit) remote.model.play("hit", .35);
      if (m.from === n.id || m.to === n.id) g.log(m.hit ? `${m.attacker} hits ${m.victim} for ${m.damage}.` : `${m.attacker} misses ${m.victim}.`, m.to === n.id ? "fail" : "");
    });
    n.on("player_death", (m) => { g.state.wands = []; g.state.equippedWandId = null; delete g.state.equipment.wand; g.wands?.syncEquip(); g.refreshEquipment(); if (!g.player.fullyDefeated) g.onDefeat(g.player, true); if (m.killer) g.toast("Slain by " + m.killer, "Return to your body to recover your gear"); });
    n.on("pvp_kill", (m) => { if (m.killer === n.id) g.toast("Skulled", "Your skull lasts seven minutes after your last hit"); });
    n.on("trade_req", (m) => this.tradeAsk(m));
    n.on("trade_wait", (m) => g.log(`Trade request sent to ${m.with}…`));
    n.on("trade_open", (m) => this.tradeOpen(m));
    n.on("trade_update", (m) => this.tradeRender(m));
    n.on("trade_closed", (m) => this.tradeClosed(m.reason));
    n.on("steal_result", (m) => this.onStealResult(m));
    n.on("steal_attempt", (m) => { g.toast("Thief!", `${m.name} tried to pick your pocket`); g.audio.ui("hit", 0.5); });
    n.on("caught", (m) => this.onCaught(m));
    for (const o of n.others.values()) this.addRemote(o);
    return joined;
  }
  applyInv(m) {
    this.g.state.inv = { ...(m.inv || {}) };
    this.g.state.equipment = cleanEquipment(m.equipment || this.g.state.equipment, this.g.state.inv);
    if (this.net) this.g.state.equippedWandId = this.g.state.equipment.wand || null;
    this.g.state.gold = m.gold ?? this.g.state.gold;
    this.bounty = m.bounty || 0;
    this.g.refreshEquipment();
    this.g.wands?.syncEquip();
    this.renderInv(); this.renderSheet();
    this.g.updateTorch?.();
  }
  onInv(m) {
    const g = this.g;
    this.applyInv(m);
    this.shopRender?.();
    if (m.used) this.applyUse(m.used);
    if (m.looted) g.log(`Looted: ${ITEMS[m.looted].name}`);
    if (m.gathered) g.log(`Gathered: ${ITEMS[m.gathered].name}`);
    if (m.robbed) {
      const r = m.robbed, what = r.item ? ITEMS[r.item].name : `${r.gold} gold`;
      if (r.by) g.toast("Robbed!", `You caught ${r.by} lifting your ${what}`);
      else g.log(`Your pack feels lighter… (${what} missing)`, "fail");
    }
    if (m.traded) g.toast("Trade complete", `with ${m.traded}`);
    if (m.crafted) { g.log("Crafted a road torch.", "crit"); g.save(); }
    if (m.brewed) { g.log("Brewed a healing draught.", "crit"); g.save(); }
    if (m.fined) g.log(`The guards fine you ${m.fined} gold.`, "fail");
    g.journal?.refresh();
  }

  // ---------- inventory ----------
  use(k, actor = this.sheetActor || this.g.player) {
    const inv = this.actorInv(actor);
    if (!(inv[k] > 0) || !ITEMS[k].heal) return;
    if (this.net) { this.net.send({ type: "use", key: k }); return; }
    inv[k]--; if (!inv[k]) delete inv[k];
    this.applyUse(k, actor);
    this.renderInv(); this.g.save();
  }
  applyUse(k, actor = this.g.player) {
    const p = actor, it = ITEMS[k];
    if (!it.heal || p.dead) return;
    p.hp = Math.min(p.stats.maxHp, p.hp + it.heal);
    if (p.downed && p.hp > 0) { p.downed = false; p.deathChecks = null; p.model.play("revive"); }
    this.g.log(`${it.name}: +${it.heal} health`, "crit");
    this.g.audio.ui("halo", 0.35);
  }
  // kill/quest rewards go through here so online realms keep the server as the bank
  earn(gold, item, actor = this.g.player) {
    gold = Math.round(gold || 0);
    if (this.net) { this.net.send({ type: "loot", gold, item }); return; }
    const state = this.actorState(actor), inv = state.inv;
    state.gold += gold;
    if (item && fitCount(inv,actor.sheet || this.g.sheet,item)) { inv[item] = (inv[item] || 0) + 1; this.g.log(`Looted: ${ITEMS[item].name}`); }
    else if (item) this.g.log("Your pack is full. The item remains behind.", "fail");
    this.renderInv();
  }
  gather(item, id, actor = this.g.player) {
    const inv = this.actorInv(actor);
    if (!fitCount(inv,actor.sheet || this.g.sheet,item)) { this.g.log("Your pack is too heavy.","fail"); return; }
    if (this.net) { this.net.send({ type: "gather", item, id }); return; }
    inv[item] = (inv[item] || 0) + 1;
    this.g.log(`Gathered: ${ITEMS[item].name}`);
    this.renderInv();
    this.g.journal?.refresh(actor);
  }
  rollLoot(kind) { const ordinary = LOOTABLE.filter((k) => !["root_heart", "tide_pearl", "emberglass_core", "warden_seal"].includes(k)); return Math.random() < (kind === "gloam_rat" ? 0.15 : 0.35) ? ordinary[Math.floor(Math.random() * ordinary.length)] : null; }
  caveSupply(id, item, actor = this.g.player) {
    if (!this.canCarry(item, actor)) { this.g.log("Your pack is too heavy.","fail"); return false; }
    if (this.net) this.net.send({ type: "cave_supply", id });
    else { const inv = this.actorInv(actor); inv[item] = (inv[item] || 0) + 1; this.g.log(`Gathered: ${ITEMS[item].name}`); this.renderInv(); }
    return true;
  }
  caveReward(cave, item, actor = this.g.player) {
    if (!this.canCarry(item, actor)) { this.g.log("Your pack is too heavy for this relic.","fail"); return false; }
    if (this.net) this.net.send({ type: "cave_reward", cave });
    else this.earn(24, item, actor);
    return true;
  }
  craftTorch(actor = this.sheetActor || this.g.player) {
    const inv = this.actorInv(actor);
    if ((inv.drywood || 0) < 1 || (inv.lantern_oil || 0) < 1) return;
    if (this.net) { this.net.send({ type: "craft_torch" }); return; }
    for (const k of ["drywood", "lantern_oil"]) { inv[k]--; if (!inv[k]) delete inv[k]; }
    inv.torch = (inv.torch || 0) + 1;
    this.g.log("Crafted a road torch.", "crit"); this.g.save(); this.renderInv();
  }
  craftHealingDraught(actor = this.g.player) {
    const state = this.actorState(actor), inv = state.inv;
    if (!state.skills?.alchemy || !this.g.hasAlchemyIngredients(false, actor)) return;
    if (!this.canBrew(actor)) { this.g.log("Your pack is too heavy for the draught.", "fail"); return; }
    if (this.net) { this.net.send({ type: "alchemy_craft" }); return; }
    for (const key of this.g.alchemyIngredients()) { inv[key]--; if (!inv[key]) delete inv[key]; }
    inv.healing_draught = (inv.healing_draught || 0) + 1;
    this.g.log("Brewed a healing draught.", "crit"); this.g.save(); this.renderInv(); this.renderSheet();
  }
  rollAlchemy() {
    if (!this.net) return Promise.resolve(null);
    return new Promise((resolve) => {
      const failed = { nat: 1, bonus: 0, dc: 12, total: 1, success: false, fumble: true, crit: false, margin: -11, adv: 0 };
      const timer = setTimeout(() => { if (this.alchemyRollPending === done) { this.alchemyRollPending = null; resolve(failed); } }, 6000);
      const done = (roll) => { clearTimeout(timer); resolve(roll || failed); };
      this.alchemyRollPending = done;
      this.net.send({ type: "alchemy_roll" });
    });
  }
  rollCityLock(door, reroll = false) {
    if (!this.net) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { if (this.cityLockPending === done) { this.cityLockPending = null; resolve({ reason: "The watch did not answer the lockpick attempt." }); } }, 6000);
      const done = (message) => { clearTimeout(timer); resolve(message); };
      this.cityLockPending = done;
      this.net.send({ type: "city_lockpick", door: door.id, reroll });
    });
  }

  houseAction(op, door, actor = this.g.player, extra = {}) {
    if (!this.net) return Promise.resolve(null);
    const slot = actor === this.g.localPlayer2 ? 2 : 1;
    const request = crypto.randomUUID();
    this.housePending ||= new Map();
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.housePending.delete(request); resolve({ reason: "The estate office did not answer." }); }, 7000);
      this.housePending.set(request, message => { clearTimeout(timer); resolve(message); });
      this.net.send({ type: "house_action", op, door: door.id, request, slot,
        characterId: slot === 2 ? (this.g.p2SaveId || `${this.g.saveId}:coop`) : this.g.saveId,
        actorPos: slot === 2 ? { x: actor.pos.x, z: actor.pos.z } : null, ...extra });
    });
  }
  resetHouses() {
    for (const door of this.g.world?.cityDoors || []) if (door.property) {
      Object.assign(this.g.state.cityHouses[door.id] ||= {}, { ownerUserId: null, ownerSlot: null,
        characterId: null, ownerName: null, lootTaken: false, decor: [], unbarredUntil: 0 });
      door.leaf.children[0].material.color.setHex(0x6c452c);
      door.setSignName(null);
    }
  }

  toggleInv(force, actor = this.g.player) {
    this.toggleSheet(force, actor);
  }
  toggleSheet(force, actor = this.g.player) {
    const el = $("#characterSheet");
    const show = force ?? (el.classList.contains("hidden") || this.sheetActor !== actor);
    $("#inv").classList.add("hidden");
    el.classList.toggle("hidden", !show);
    this.sheetActor = show ? actor : null;
    if (show) this.sheetView = "character";
    document.body.classList.toggle("sheet-owner-p2", show && actor === this.g.localPlayer2);
    if (show) this.renderSheet();
  }
  setEquipment(slot, key) {
    const actor = this.sheetActor || this.g.player;
    const state = this.actorState(actor), inv = state.inv;
    if (!EQUIPMENT_SLOTS.includes(slot)) return;
    if (key && (ITEMS[key]?.slot !== slot || !(inv[key] > 0))) return;
    if (key) state.equipment[slot] = key;
    else delete state.equipment[slot];
    this.g.refreshEquipment();
    if (this.net) this.net.send({ type: "equip", slot, key });
    else this.g.save();
  }
  setHelmetHidden(hidden) {
    this.actorState(this.sheetActor || this.g.player).equipment.hideHelmet = !!hidden;
    this.g.refreshEquipment();
    if (this.net) this.net.send({ type: "helmet_visibility", hidden: !!hidden });
    else this.g.save();
  }
  renderSheet() {
    const el = $("#characterSheet");
    if (!el || el.classList.contains("hidden")) return;
    if (this.sheetView === "journal") { this.renderJournal(); return; }
    const focused = el.contains(document.activeElement) ? document.activeElement : null;
    const focusIndex = focused ? [...el.querySelectorAll("button")].indexOf(focused) : -1;
    const focusKey = focused?.dataset.k;
    const focusSlot = focused?.dataset.unequip;
    const focusItem = focused?.dataset.itemKey;
    const packScroll = el.querySelector(".sheet-pack-scroll")?.scrollTop || 0;
    const g = this.g, actor = this.sheetActor || g.player, sheet = actor.sheet || g.sheet, state = this.actorState(actor), inv = state.inv, e = state.equipment, st = actor.stats;
    const slots = EQUIPMENT_SLOTS.map(slot => {
      const key = e[slot], item = ITEMS[key];
      return `<div class="sheet-slot"><span class="sheet-slot-art">${item ? itemImage(key) : '<span aria-hidden="true">◇</span>'}</span><span class="sheet-slot-copy"><small>${slot}</small><b>${item ? esc(item.name) : "Empty"}</b></span>${item ? `<button type="button" data-unequip="${slot}" data-item-key="${key}" aria-label="Unequip ${esc(item.name)}">×</button>` : ""}</div>`;
    }).join("");
    const wand = state.wands?.find(w => w.id === state.equippedWandId);
    const p2Wands = actor === g.localPlayer2 && g.p2SaveId
      ? (state.wands || []).map(w => `<button type="button" class="item" data-p2-wand="${esc(w.id)}">${itemImage("road_staff")} ${esc(w.name)}${w.id === state.equippedWandId ? " · Equipped" : ""}</button>`).join("") : "";
    const entries = Object.entries(inv).map(([key, count]) => [key, count - (e[ITEMS[key]?.slot] === key ? 1 : 0)]).filter(([key, count]) => ITEMS[key] && count > 0);
    const attributes = ["might", "finesse", "vigor", "intellect", "instinct", "presence"].map(key => `<div><small>${key}</small><b>${Number(sheet.attrs?.[key]) || 10}</b></div>`).join("");
    const handling = animalHandlingBonus(sheet.attrs,sheet.background,sheet.level || 1);
    const training = [...new Set([...(BACKGROUNDS[sheet.background]?.skills || []), sheet.classSkill].filter(Boolean))];
    const load = inventoryWeight(inv), capacity = carryCapacity(sheet);
    el.innerHTML = `<div class="sheet-head"><div><small>CHARACTER</small><h2>${esc(actor.name)}</h2><span>Level ${sheet.level || 1} ${esc(CLASSES[sheet.class]?.name || "Wayfarer")} · XP ${sheet.xp || 0}</span></div><button type="button" class="sheet-close" data-close aria-label="Close character sheet">✕</button></div>
      <nav class="sheet-tabs" aria-label="Character pages"><button type="button" class="active" aria-current="page" data-sheet-tab="character">Character Sheet</button><button type="button" data-sheet-tab="journal">Quest Log</button></nav>
      <div class="sheet-layout">
        <section class="sheet-pack" aria-label="Inventory"><div class="sheet-section-head"><h3>${g.localPlayer2 && !g.p2SaveId ? "Party Pack" : "Inventory"}</h3><span>${state.gold ?? 0} gold</span></div><div class="sheet-load"><span>Carry weight</span><b>${load.toFixed(1)} / ${capacity.toFixed(1)} kg</b></div><div class="sheet-load-track"><i style="width:${Math.min(100, 100 * load / Math.max(1, capacity))}%"></i></div>
          <div class="sheet-pack-scroll"><div class="sheet-grid">${entries.map(([key, count]) => itemChip(key, count)).join("") || '<div class="empty">Your pack is empty</div>'}</div>${actor === g.localPlayer2 && g.p2SaveId ? p2Wands : g.wands?.packHTML() || ""}<div class="sheet-pack-actions">${inv.torch && (actor !== g.localPlayer2 || !g.p2SaveId) ? `<button type="button" data-torch>${state.torchLit ? "Put out torch" : "Light torch"}</button>` : ""}<button type="button" data-craft title="Dry wood + lamp oil" ${inv.drywood && inv.lantern_oil ? "" : "disabled"}>Craft torch</button></div></div></section>
        <section class="sheet-person" aria-label="Character view"><div id="sheetModel" class="sheet-model" aria-label="3D character model"></div><div class="sheet-vitals"><div><small>Health</small><b>${Math.ceil(actor.hp || 0)} <em>/ ${st?.maxHp || 0}</em></b></div><div><small>Guard</small><b>${st?.guard || 0}</b></div><div><small>Attack</small><b>${st?.weaponAttack ? `+${st.weaponAttack}` : "—"}</b></div></div><div class="sheet-attributes">${attributes}</div><div class="sheet-secondary">Reflex ${st?.reflex || 0} · Fortitude ${st?.fortitude || 0} · Resolve ${st?.resolve || 0}<br>Animal Handling ${handling >= 0 ? "+" : ""}${handling} · Alchemy +${["lifekeeper", "arcanist"].includes(sheet.class) || sheet.ancestry === "thornkin" ? 2 : 0}${state.quests?.alchemy === "done" ? " · Learned" : ""}${training.length ? `<br>Trained · ${esc(training.join(", "))}` : ""}</div></section>
        <section class="sheet-gear" aria-label="Equipment"><div class="sheet-section-head"><h3>Equipment</h3></div><div class="sheet-slots">${slots}<div class="sheet-slot"><span class="sheet-slot-art">${wand ? itemImage("road_staff") : '<span aria-hidden="true">◇</span>'}</span><span class="sheet-slot-copy"><small>Wand</small><b>${wand ? esc(wand.name) : "Empty"}</b></span>${wand && (actor !== g.localPlayer2 || !g.p2SaveId) ? `<button type="button" data-wand="${esc(wand.id)}" aria-label="Unequip ${esc(wand.name)}">×</button>` : ""}</div></div>${e.helmet ? `<button class="sheet-helmet" type="button" data-helmet>${e.hideHelmet ? "Show helmet" : "Hide helmet"}</button>` : ""}${this.net ? `<div class="sheet-pvp"><button type="button" data-hostile aria-pressed="${this.hostile}">${this.hostile ? "Hostile: On" : "Go Hostile"}</button><span>${skullVisible(this.skullUntil) ? `☠ Skulled · ${Math.ceil((this.skullUntil - Date.now()) / 60000)} min` : this.hostile ? "You can attack other players and be attacked." : "Player attacks are off."}</span></div>` : ""}</section>
      </div>`;
    el.querySelector(".sheet-pack-scroll").scrollTop = packScroll;
    el.querySelector("[data-close]").onclick = () => this.toggleSheet(false);
    el.querySelector('[data-sheet-tab="journal"]').onclick = () => { this.sheetView = "journal"; this.sheetPreview?.destroy(); this.sheetPreview = null; this.renderJournal(); el.querySelector('[data-sheet-tab="journal"]')?.focus(); };
    el.querySelectorAll("[data-unequip]").forEach(b => b.onclick = () => this.setEquipment(b.dataset.unequip, null));
    el.querySelectorAll(".sheet-grid .item").forEach(b => b.onclick = () => { const key = b.dataset.k; if (ITEMS[key]?.slot) this.setEquipment(ITEMS[key].slot, key); else if (key === "torch") { if (actor !== g.localPlayer2 || !g.p2SaveId) g.toggleTorch(); } else this.use(key, actor); });
    el.querySelectorAll("[data-drop]").forEach(b => b.onclick = () => this.dropItem(b.dataset.drop, actor));
    el.querySelectorAll("[data-p2-wand]").forEach(b => b.onclick = () => {
      state.equippedWandId = state.equippedWandId === b.dataset.p2Wand ? null : b.dataset.p2Wand;
      if (state.equippedWandId) state.equipment.wand = state.equippedWandId;
      else delete state.equipment.wand;
      g.wands?.syncEquip(); g.refreshEquipment(); g.buildP2Hotbar(); g.save();
    });
    el.querySelector("[data-craft]").onclick = () => this.craftTorch(actor);
    el.querySelector("[data-torch]")?.addEventListener("click", () => g.toggleTorch());
    el.querySelector("[data-helmet]")?.addEventListener("click", () => this.setHelmetHidden(!e.hideHelmet));
    el.querySelector("[data-hostile]")?.addEventListener("click", () => this.setHostile(!this.hostile));
    if (focused) {
      const next = focusKey ? el.querySelector(`.sheet-grid .item[data-k="${focusKey}"]`)
          || el.querySelector(`[data-unequip="${ITEMS[focusKey]?.slot}"]`)
        : focusSlot ? el.querySelector(`[data-unequip="${focusSlot}"]`)
          || el.querySelector(`.sheet-grid .item[data-k="${focusItem}"]`) : null;
      (next || [...el.querySelectorAll("button")][Math.max(0, focusIndex)] || el.querySelector(".sheet-close"))?.focus();
    }
    if (actor !== g.localPlayer2 || !g.p2SaveId) g.wands?.wirePack(el);
    try { if (this.sheetPreview?.actor !== actor) { this.sheetPreview?.destroy(); this.sheetPreview = new SheetPreview(g, actor); } this.sheetPreview.mount(el.querySelector("#sheetModel")); }
    catch (error) { console.warn("Character sheet preview unavailable", error); }
  }
  renderJournal() {
    const el = $("#characterSheet");
    if (!el || el.classList.contains("hidden") || this.sheetView !== "journal") return;
    const actor = this.sheetActor || this.g.player;
    const scroll = el.querySelector(".journal-scroll")?.scrollTop || 0;
    el.innerHTML = `<div class="sheet-head"><div><small>JOURNAL</small><h2>Quest Log</h2><span>${esc(actor.name)}</span></div><button type="button" class="sheet-close" data-close aria-label="Close quest log">✕</button></div>
      <nav class="sheet-tabs" aria-label="Character pages"><button type="button" data-sheet-tab="character">Character Sheet</button><button type="button" class="active" aria-current="page" data-sheet-tab="journal">Quest Log</button></nav>${this.g.journal?.render(actor) || ""}`;
    el.querySelector("[data-close]").onclick = () => this.toggleSheet(false);
    el.querySelector('[data-sheet-tab="character"]').onclick = () => { this.sheetView = "character"; this.renderSheet(); el.querySelector('[data-sheet-tab="character"]')?.focus(); };
    el.querySelector(".journal-scroll").scrollTop = scroll;
  }
  setHostile(enabled) { if (!this.net) return; this.net.send({ type: "hostile", enabled: !!enabled }); }
  canAttackRemote(r) { return !!this.net && !!r && (this.hostile || r.info.hostile || skullVisible(r.info.skullUntil)) && !r.downed && r.hp > 0; }
  attackRemote(r) {
    if (!this.canAttackRemote(r) || this.g.player.fullyDefeated || this.g.player.downed) return;
    this.g.combat.face(this.g.player, r.pos);
    this.g.player.model.play("attack", .5);
    this.net.send({ type: "pvp_attack", to: r.info.id });
  }
  renderInv() {
    const el = $("#inv");
    const current = this.g.state.equipment;
    const valid = cleanEquipment(current, this.inv);
    if (JSON.stringify(current) !== JSON.stringify(valid)) {
      this.g.state.equipment = valid;
      if (this.g.player) {
        const stats = this.g.playerSheetStats();
        this.g.player.stats.guard = stats.guard;
        this.g.player.stats.weaponAttack = stats.weaponAttack;
        this.g.player.model.setLook(equipmentLook(this.g.sheet.look, valid));
      }
    }
    this.renderSheet();
    this.g.journal?.refresh();
    if (this.g.localPlayer2 && this.g.p2SaveId) this.g.journal?.refresh(this.g.localPlayer2);
    if (!el || el.classList.contains("hidden")) return;
    const entries = Object.entries(this.inv).filter(([k, n]) => ITEMS[k] && n > 0);
    el.innerHTML = `<div class="sp-head"><b>Pack</b><span>${this.gold} gold${this.bounty ? ` · <em class="wanted">Bounty ${this.bounty}</em>` : ""}</span><button class="x" data-close>✕</button></div>
      <div class="sp-sub">Load ${inventoryWeight(this.inv).toFixed(1)} / ${carryCapacity(this.g.sheet).toFixed(1)} kg</div>
      <div class="grid">${entries.map(([k, n]) => itemChip(k, n)).join("") || '<div class="empty">Empty</div>'}</div>
      ${this.g.wands?.packHTML() || ""}<div class="sp-note">${this.inv.torch ? `<button type="button" data-torch>${this.g.state.torchLit ? "Put out torch" : "Light torch"}</button>` : ""}<button type="button" data-craft ${this.inv.drywood && this.inv.lantern_oil ? "" : "disabled"}>Craft torch · dry wood + lamp oil</button></div>`;
    el.querySelector("[data-close]").onclick = () => this.toggleInv(false);
    el.querySelectorAll(".item").forEach((b) => (b.onclick = () => b.dataset.k === "torch" ? this.g.toggleTorch() : ITEMS[b.dataset.k]?.slot ? this.toggleSheet(true) : this.use(b.dataset.k)));
    el.querySelectorAll("[data-drop]").forEach((b) => (b.onclick = () => this.dropItem(b.dataset.drop)));
    el.querySelector("[data-craft]").onclick = () => this.craftTorch();
    this.g.wands?.wirePack(el);
    if (el.querySelector("[data-torch]")) el.querySelector("[data-torch]").onclick = () => this.g.toggleTorch();
  }
  dropItem(key, actor = this.sheetActor || this.g.player) {
    const state = this.actorState(actor), inv = state.inv;
    if (!(inv[key] > 0) || !ITEMS[key]) return;
    if (state.equipment?.[ITEMS[key].slot] === key && inv[key] <= 1) { this.g.log("Unequip this item before dropping it.", "fail"); return; }
    if (this.net) this.g.groundItems.drop(key, actor);
    else {
      inv[key]--; if (!inv[key]) delete inv[key];
      this.g.groundItems.drop(key, actor);
      this.renderInv(); this.renderSheet();
    }
  }

  // ---------- NPC shop ----------
  openShop(name, actor = this.g.conversationActor || this.g.player) {
    const el = $("#shop");
    this.shopActor = actor;
    document.body.classList.toggle("shop-owner-p2", actor === this.g.localPlayer2 && !!this.g.localPlayer2);
    this.shopMode = "trade";
    this.shopPending = false;
    this.shopGoldEditor = false;
    this.shopGoldDraft = "";
    this.shopOffer = { buying: {}, selling: {}, gold: 0 };
    el.classList.remove("hidden");
    const render = () => {
      if (el.classList.contains("hidden")) return;
      const state = this.actorState(actor), inv = state.inv, sheet = actor.sheet || this.g.sheet;
      const barter = this.shopMode === "barter", offer = this.shopOffer;
      const buyTotal = Object.entries(offer.buying).reduce((n,[k,q]) => n + buyPrice(k)*q,0);
      const sellTotal = Object.entries(offer.selling).reduce((n,[k,q]) => n + sellPrice(k)*q,0);
      const balance = sellTotal + offer.gold - buyTotal;
      const needed = Math.max(0, buyTotal - sellTotal);
      const valid = shopExchange(state, sheet, offer.buying, offer.selling, offer.gold);
      const buyerRows = SHOP.map(k => {
        const q = offer.buying[k] || 0, disabled = this.shopPending || (barter ? q >= 99 : state.gold < buyPrice(k) || !fitCount(inv,sheet,k));
        return `<button class="row" data-buy="${k}" ${disabled ? "disabled" : ""}>${itemImage(k)}<span>${esc(ITEMS[k].name)}${q ? ` <b>×${q} offered</b>` : ""}</span><i>${buyPrice(k)}g</i></button>`;
      }).join("");
      const sellerRows = Object.entries(inv).filter(([k,n]) => ITEMS[k] && n > 0).map(([k,n]) => {
        const available = n - (state.equipment?.[ITEMS[k].slot] === k ? 1 : 0), q = offer.selling[k] || 0;
        return `<button class="row" data-sell="${k}" ${this.shopPending || available <= (barter ? q : 0) ? "disabled" : ""}>${itemImage(k)}<span>${esc(ITEMS[k].name)} ×${n}${q ? ` <b>×${q} offered</b>` : ""}</span><i>${available ? `+${sellPrice(k)}g` : "Equipped"}</i></button>`;
      }).join("") || '<div class="empty">Nothing to sell</div>';
      const staged = (kind, map) => Object.entries(map).map(([k,q]) => `<button data-remove="${kind}:${k}" title="Remove one ${esc(ITEMS[k].name)}" ${this.shopPending ? "disabled" : ""}>− ${esc(ITEMS[k].name)} ×${q}</button>`).join("");
      const goldEditor = this.shopGoldEditor ? `<div class="shop-gold-editor">
        <label for="shopGoldAmount">Gold to offer · ${state.gold} available</label>
        <div class="shop-gold-input"><input id="shopGoldAmount" type="number" min="0" max="${state.gold}" step="1" inputmode="numeric" value="${esc(this.shopGoldDraft)}" aria-label="Gold to offer"><button data-gold-needed>Needed ${needed}g</button><button data-gold-max>Max</button></div>
        <div class="shop-gold-pad">${["1","2","3","4","5","6","7","8","9","0"].map(n => `<button data-gold-digit="${n}">${n}</button>`).join("")}<button data-gold-back aria-label="Delete digit">⌫</button><button data-gold-clear>Clear</button></div>
        <div class="shop-gold-actions"><button data-gold-submit>Submit gold</button><button data-gold-cancel>Cancel</button></div></div>` : "";
      const barterPanel = barter ? `<div class="shop-offer"><div><b>You offer · ${sellTotal + offer.gold}g</b><div>${staged("selling",offer.selling) || "Choose items from your inventory"}${offer.gold ? `<button data-gold-remove ${this.shopPending ? "disabled" : ""}>− Gold · ${offer.gold}g</button>` : ""}<button data-gold-toggle ${this.shopPending ? "disabled" : ""}>${offer.gold ? "Edit gold" : "Add gold"}</button></div></div><div><b>You request · ${buyTotal}g</b><div>${staged("buying",offer.buying) || "Choose items from the shop"}</div></div></div>${goldEditor}` : "";
      const previous = el.contains(document.activeElement) ? [...document.activeElement.attributes].find(a => a.name.startsWith("data-")) : null;
      const panelTop = el.scrollTop, listTops = [...el.querySelectorAll(".shop-columns section")].map(section => section.scrollTop);
      el.innerHTML = `<div class="sp-head"><b>${esc(name)}'s shop</b><span>${state.gold} gold</span><button class="x" data-close aria-label="Close shop">✕</button></div>
        <div class="shop-tabs"><button data-mode="trade" class="${barter ? "" : "on"}" ${this.shopPending ? "disabled" : ""}>Trade</button><button data-mode="barter" class="${barter ? "on" : ""}" ${this.shopPending ? "disabled" : ""}>Barter</button></div>
        ${barterPanel}
        <div class="shop-settle ${barter ? "" : "hidden"}"><span>${balance < 0 ? `${-balance} more gold needed` : balance > 0 ? `${balance} gold back` : "Even exchange"}</span><button data-accept ${valid && !this.shopPending && !this.shopGoldEditor ? "" : "disabled"}>${this.shopPending ? "Trading…" : "Accept offer"}</button></div>
        <div class="shop-columns"><section><div class="sp-sub">Your inventory · ${inventoryWeight(inv).toFixed(1)} / ${carryCapacity(sheet).toFixed(1)} kg</div><div class="rows">${sellerRows}</div></section>
        <section><div class="sp-sub">${esc(name)}'s wares</div><div class="rows">${buyerRows}</div></section></div>
        ${barter ? !valid && (buyTotal || sellTotal) ? '<div class="sp-note">Check offered gold, equipped items, and carrying capacity.</div>' : "" : '<div class="sp-note">Select an item to buy or sell for gold.</div>'}`;
      el.scrollTop = panelTop;
      [...el.querySelectorAll(".shop-columns section")].forEach((section,i) => { section.scrollTop = listTops[i] || 0; });
      el.querySelector("[data-close]").onclick = () => { el.classList.add("hidden"); this.shopRender = null; this.shopActor = null; document.body.classList.remove("shop-owner-p2"); };
      el.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { this.shopMode = b.dataset.mode; this.shopGoldEditor = false; render(); });
      el.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => { if (barter) { const k=b.dataset.buy; offer.buying[k]=(offer.buying[k]||0)+1; render(); } else this.shop("buy",b.dataset.buy,actor); });
      el.querySelectorAll("[data-sell]").forEach(b => b.onclick = () => { if (barter) { const k=b.dataset.sell; offer.selling[k]=(offer.selling[k]||0)+1; render(); } else this.shop("sell",b.dataset.sell,actor); });
      el.querySelectorAll("[data-remove]").forEach(b => b.onclick = () => { const [side,k]=b.dataset.remove.split(":"); if (--offer[side][k] <= 0) delete offer[side][k]; render(); });
      el.querySelector("[data-gold-toggle]")?.addEventListener("click", () => {
        this.shopGoldDraft = offer.gold ? String(offer.gold) : "";
        this.shopGoldEditor = true;
        render();
        el.querySelector('[data-gold-digit="1"]')?.focus();
      });
      el.querySelector("[data-gold-remove]")?.addEventListener("click", () => { offer.gold = 0; render(); });
      if (this.shopGoldEditor) {
        const input = el.querySelector("[data-gold-input], #shopGoldAmount");
        const submit = el.querySelector("[data-gold-submit]");
        const setDraft = value => {
          this.shopGoldDraft = String(value).replace(/\D/g, "").slice(0, 15);
          input.value = this.shopGoldDraft;
          submit.disabled = !this.shopGoldDraft || Number(this.shopGoldDraft) > state.gold;
        };
        input.oninput = () => setDraft(input.value);
        input.onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); submit.click(); } };
        el.querySelectorAll("[data-gold-digit]").forEach(b => b.onclick = () => setDraft(this.shopGoldDraft + b.dataset.goldDigit));
        el.querySelector("[data-gold-back]").onclick = () => setDraft(this.shopGoldDraft.slice(0,-1));
        el.querySelector("[data-gold-clear]").onclick = () => setDraft("");
        el.querySelector("[data-gold-needed]").onclick = () => setDraft(Math.min(needed,state.gold));
        el.querySelector("[data-gold-max]").onclick = () => setDraft(state.gold);
        submit.onclick = () => {
          const amount = Number(this.shopGoldDraft);
          if (!Number.isSafeInteger(amount) || amount < 0 || amount > state.gold) return;
          offer.gold = amount;
          this.shopGoldEditor = false;
          render();
          el.querySelector("[data-accept]:not(:disabled), [data-gold-toggle]")?.focus();
        };
        el.querySelector("[data-gold-cancel]").onclick = () => { this.shopGoldEditor = false; render(); el.querySelector("[data-gold-toggle]")?.focus(); };
        setDraft(this.shopGoldDraft);
      }
      el.querySelector("[data-accept]")?.addEventListener("click", () => {
        const exchange = shopExchange(state, sheet, offer.buying, offer.selling, offer.gold);
        if (!exchange) { this.g.log("That offer cannot be completed.", "fail"); render(); return; }
        if (this.net) { this.shopPending = true; this.net.send({ type:"shop", op:"barter", buying:offer.buying, selling:offer.selling, gold:offer.gold }); render(); }
        else { state.inv=exchange.inv; state.gold=exchange.gold; this.shopOffer={ buying:{}, selling:{}, gold:0 }; this.g.save(); this.renderInv(); this.renderSheet(); this.g.updateTorch?.(); this.g.toast("Barter complete", "Your offer was accepted"); render(); }
      });
      if (previous) [...el.querySelectorAll(`[${previous.name}]`)].find(node => node.getAttribute(previous.name) === previous.value && !node.disabled)?.focus({ preventScroll: true });
    };
    this.shopRender = render;
    render();
  }
  shop(op, k, actor = this.g.player) {
    const state = this.actorState(actor), sheet = actor.sheet || this.g.sheet;
    if (this.net) this.net.send({ type: "shop", op, key: k });
    else {
      const exchange = op === "buy" ? shopExchange(state, sheet, { [k]:1 }, {})
        : op === "sell" ? shopExchange(state, sheet, {}, { [k]:1 }) : null;
      if (!exchange) return;
      state.inv = exchange.inv; state.gold = exchange.gold;
    }
    this.g.audio.ui("dice", 0.25);
    this.g.updateTorch?.();
    if (!this.net) this.g.save();
    setTimeout(() => { this.shopRender?.(); this.renderInv(); this.renderSheet(); }, this.net ? 250 : 0);
  }

  // ---------- theft ----------
  inCity(p = this.g.player.pos) { return this.g.world.inCity(p.x, p.z); }
  myThief() { return { attrs: this.g.sheet.attrs, level: this.g.sheet.level || 1 }; }
  npcMark(kind, key) {
    // guards and the captain are hard marks; citizens are easy-ish
    if (key === "ilse") return { attrs: { instinct: 16 }, level: 4 };
    if (kind === "npc") return { attrs: { instinct: 13 }, level: 2 };
    return { attrs: { instinct: 11 }, level: 1 };
  }
  stealNPC(target) {
    const g = this.g;
    const now = performance.now();
    if (now - (this.stealAt || -1e9) < 12000) { g.log("Your hands are still shaking. Wait a moment.", "fail"); return; }
    this.stealAt = now;
    const pick = (this.inv.lockpick || 0) > 0;
    if (pick && !this.net) { this.inv.lockpick--; if (!this.inv.lockpick) delete this.inv.lockpick; }
    const { bonus, dc } = stealOdds(this.myThief(), this.npcMark(target.kind, target.key), pick);
    const nat = 1 + Math.floor(Math.random() * 20);
    const ok = nat === 20 || (nat !== 1 && nat + bonus >= dc);
    g.log(`Sleight of hand on ${target.name}: d20 ${nat} +${bonus} = ${nat + bonus} vs ${dc} — ${ok ? "success" : "caught"}`, ok ? "crit" : "fail");
    g.deed("steal", "steal_" + target.name + Math.floor(now));
    if (ok) {
      const item = Math.random() < 0.6 ? LOOTABLE[Math.floor(Math.random() * LOOTABLE.length)] : null;
      const gold = item ? 0 : 2 + Math.floor(Math.random() * 10);
      if (this.net) this.net.send({ type: "loot", gold, item });
      else this.earn(gold, item);
      g.toast("Lifted", item ? ITEMS[item].name : `${gold} gold`);
    } else {
      g.toast(`${target.name} shouts "Thief!"`, this.inCity() ? "The city guard is coming" : "");
      if (this.inCity()) this.callGuards();
    }
  }
  stealPlayer(r) {
    this.net.send({ type: "steal", to: r.info.id });
  }
  onStealResult(m) {
    const g = this.g;
    this.applyInv(m);
    if (m.reason) { g.log(m.reason, "fail"); return; }
    g.log(`Sleight of hand on ${m.victim}: d20 ${m.nat} +${m.bonus} = ${m.nat + m.bonus} vs ${m.dc}${m.pick ? " (lockpick)" : ""} — ${m.ok ? "success" : "caught"}`, m.ok ? "crit" : "fail");
    g.deed("steal", "psteal" + Date.now());
    if (m.ok) g.toast("Lifted", m.item ? ITEMS[m.item].name : m.gold ? `${m.gold} gold` : "Their pockets were empty");
  }
  onCaught(m) {
    const g = this.g;
    if (m.thief === this.net.id) {
      g.toast(m.horse ? "Stable guard catches you!" : `${m.victimName} caught you!`, m.city ? "The city guard is coming" : "Word will spread");
      if (m.city) this.callGuards();
    } else if (m.victim !== this.net.id) g.log(`${m.name} was caught stealing from ${m.victimName}${m.city ? " — guards respond!" : "."}`, "fail");
    const r = this.remotes.get(m.thief);
    if (r) r.info.bounty = m.bounty;
  }
  callGuards(actor = this.g.player) {
    const g = this.g, p = actor;
    this.guardTarget = p;
    this.guardT = 120;
    if (this.guards.some((e) => !e.dead)) { for (const e of this.guards) { e.aggro = true; e.target = p; } return; }
    const n = 3;
    const M = g.world.sites.marrowgate;
    const inMarrowgate = Math.max(Math.abs(p.pos.x - M.x), Math.abs(p.pos.z - M.z)) < M.r;
    for (let i = 0; i < n; i++) {
      let x = p.pos.x, z = p.pos.z;
      for (let attempt = 0; attempt < 24; attempt++) {
        const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 6;
        const q = { x: p.pos.x + Math.cos(a) * d, z: p.pos.z + Math.sin(a) * d };
        for (let k = 0; k < 3; k++) g.world.col.resolve(q, .5);
        if (!inMarrowgate || (cityPointClear(g.world, q.x, q.z, .5) && cityLineClear(g.world, q, p.pos, .48))) { x = q.x; z = q.z; break; }
        if (attempt === 23) { x = q.x; z = q.z; }
      }
      const e = g.combat.spawnEnemy("city_guard", new THREE.Vector3(x, g.world.heightAt(x, z), z), {});
      e.aggro = true; e.target = p; e.cityGuard = true;
      e.home = p.pos.clone();
      this.guards.push(e);
    }
    g.audio.ui("horns", 0.6);
    g.log("The city guard closes in! Flee the city or fight.", "fail");
  }
  clearGuards() {
    for (const e of this.guards) if (this.g.combat.actors.includes(e)) this.g.combat.remove(e);
    this.guards = [];
    this.guardT = 0;
    this.guardTarget = null;
  }
  onDefeat() {
    if (!this.guards.length) return false;
    this.clearGuards();
    if (this.net) this.net.send({ type: "guards_caught" });
    else { const fine = Math.min(this.gold, 15); this.g.state.gold -= fine; this.g.log(`The guards drag you off and fine you ${fine} gold.`, "fail"); }
    return true;
  }
  updateGuards(dt) {
    if (!this.guards.length) return;
    this.guards = this.guards.filter((e) => !e.dead && this.g.combat.actors.includes(e));
    this.guardT -= dt;
    const target = this.guardTarget || this.g.player;
    const m = this.g.world.sites.marrowgate;
    const inCity = Math.max(Math.abs(target.pos.x-m.x),Math.abs(target.pos.z-m.z)) < m.r;
    const out = !inCity && target.pos.distanceTo(this.guards[0]?.pos || target.pos) > 25;
    if (this.guardT <= 0 || out) { if (this.guards.length) this.g.log("The guards give up the chase."); this.clearGuards(); }
  }

  // ---------- remote players ----------
  addRemote(o) {
    if (this.remotes.has(o.info.id)) return;
    let model;
    try { model = new Character(equipmentLook(o.info.look || {}, o.info.equipment), { hairGuides: this.g.tier.name === "low" ? 12 : 30 }); } catch (e) { console.warn(e); return; }
    model.addTo(this.g.scene);
    const s = o.snaps[o.snaps.length - 1];
    const r = { o, info: o.info, model, glow: makeHostileGlow(model), pos: new THREE.Vector3(s.x, s.y, s.z), yaw: 0, downed: false, hp: 1, maxHp: 1 };
    this.remotes.set(o.info.id, r);
    this.g.log(`${o.info.name} is here.`);
  }
  dropRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.model.removeFrom?.(); r.model.dispose?.();
    this.remotes.delete(id);
    this.plates.get(id)?.remove(); this.plates.delete(id);
    if (this.trade?.withId === id) this.tradeClosed("left");
  }
  updateRemotes(dt) {
    const g = this.g, cam = g.camera.position;
    for (const r of this.remotes.values()) {
      const s = this.net.sample(r.o);
      // Realm snapshots already carry the actual height. Keep it so a player
      // on a house's upper floor is visible through that floor's windows.
      r.pos.set(s.x, Number.isFinite(s.y) ? s.y : g.world.floorHeightAt(s.x,s.z), s.z);
      const swimming = !s.ride && g.world.waterDepthAt(s.x, s.z) >= SWIM_DEPTH;
      if (swimming) r.pos.y = Math.max(g.world.surfaceHeightAt(s.x, s.z), g.world.waterSurface - 1.05);
      r.yaw = s.yaw; r.hp = s.hp; r.maxHp = s.maxHp;
      const d = !!s.d;
      if (d !== r.downed) { r.downed = d; r.model.play(d ? "downed" : "revive"); }
      const near = r.pos.distanceTo(cam) < 120;
      r.model.object.visible = near;
      if (!near) continue;
      r.model.object.position.copy(r.pos);
      if (s.ride) r.model.object.position.y += 1.56;
      r.model.object.rotation.y = r.yaw;
      r.model.speed = s.s || 0;
      r.model.swimMode = swimming ? (r.model.speed > 0.1 ? r.model.speed > 2.9 ? "sprint" : "swim" : "tread") : null;
      r.model.setMorality?.(s.M || 0);
      r.glow.material.opacity = r.info.hostile ? Math.max(0, Math.sin(Date.now() * .0024)) * .23 : 0;
      r.model.update(dt, { camera: g.camera, wind: g.wind, simulateHair: r.pos.distanceTo(cam) < 20 });
      if (s.ride) poseRider(r.model);
    }
    // nameplates
    const seen = new Set();
    for (const [id, r] of this.remotes) {
      if (!r.model.object.visible || r.pos.distanceTo(cam) > 45) continue;
      const sample = this.net.sample(r.o);
      const head=TMP.copy(r.pos).setY(r.pos.y + (r.model.height || 1.7) + 0.4 + (sample.ride ? 1.56 : 0));
      if(!g.world.los(cam,new THREE.Vector3(r.pos.x,r.pos.y+1.48,r.pos.z),.35)) continue;
      const p = g.project(head);
      if (!p.visible) continue;
      seen.add(id);
      let el = this.plates.get(id);
      if (!el) { el = document.createElement("div"); el.className = "nameplate player"; $("#dice").append(el); this.plates.set(id, el); }
      const html = `${skullVisible(r.info.skullUntil) ? '<strong class="skull">☠</strong>' : ""}${esc(r.info.name)} <span class="lvl">${r.info.level || 1}</span>${r.info.bounty ? ' <em class="wanted">WANTED</em>' : ""}<i><b style="width:${(r.hp / r.maxHp) * 100}%"></b></i>`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      el.style.left = p.x + "px"; el.style.top = p.y + "px";
    }
    for (const [id, el] of this.plates) if (!seen.has(id)) { el.remove(); this.plates.delete(id); }
    if (this.net) this.updateSelfMarkers();
  }
  updateSelfMarkers() {
    const model = this.g.player?.model;
    if (!model) return;
    if (!this.selfGlow) this.selfGlow = makeHostileGlow(model);
    this.selfGlow.material.opacity = this.hostile ? Math.max(0, Math.sin(Date.now() * .0024)) * .23 : 0;
    if (!this.selfSkull) { this.selfSkull = document.createElement("div"); this.selfSkull.className = "nameplate self-skull"; this.selfSkull.textContent = "☠"; $("#dice").append(this.selfSkull); }
    const p = this.g.project(TMP.copy(this.g.player.pos).setY(this.g.player.pos.y + (model.height || 1.7) + .45));
    this.selfSkull.style.display = skullVisible(this.skullUntil) && p.visible ? "block" : "none";
    if (p.visible) { this.selfSkull.style.left = p.x + "px"; this.selfSkull.style.top = p.y + "px"; }
  }

  // ---------- chat ----------
  chatLine(name, text, mine) {
    const L = $("#log");
    const d = document.createElement("div");
    d.className = "chat" + (mine ? " mine" : "");
    d.innerHTML = `<b>${esc(name)}:</b> ${esc(text)}`;
    L.append(d);
    while (L.children.length > 12) L.firstChild.remove();
  }
  focusChat() {
    if (!this.net) return;
    const i = $("#chatIn");
    i.classList.remove("hidden");
    i.focus();
  }
  setupChat() {
    const i = $("#chatIn");
    i.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { const t = i.value.trim(); if (t) this.net.send({ type: "chat", text: t }); i.value = ""; i.blur(); }
      if (e.key === "Escape") { i.value = ""; i.blur(); }
    };
    i.onblur = () => i.classList.add("hidden");
  }

  // ---------- trading with players ----------
  tradeAsk(m) {
    const el = $("#ask");
    el.classList.remove("hidden");
    el.innerHTML = `<span><b>${esc(m.name)}</b> wants to trade</span><button class="primary" data-y>Trade</button><button class="ghost" data-n>Decline</button>`;
    const done = (ok) => { el.classList.add("hidden"); this.net.send({ type: "trade_resp", ok }); };
    el.querySelector("[data-y]").onclick = () => done(true);
    el.querySelector("[data-n]").onclick = () => done(false);
    clearTimeout(this._askT);
    this._askT = setTimeout(() => { if (!el.classList.contains("hidden")) done(false); }, 20000);
  }
  tradeOpen(m) {
    this.trade = { with: m.with, offer: { items: {}, gold: 0 }, view: null };
    $("#trade").classList.remove("hidden");
    this.tradeRender({ mine: { items: {}, gold: 0 }, theirs: { items: {}, gold: 0 }, okMine: false, okTheirs: false });
  }
  sendOffer() { this.net.send({ type: "trade_offer", items: this.trade.offer.items, gold: this.trade.offer.gold }); }
  tradeRender(v) {
    if (!this.trade) return;
    this.trade.view = v;
    const T = this.trade, el = $("#trade");
    const left = { ...this.inv };
    for (const [k, n] of Object.entries(T.offer.items)) left[k] -= n;
    const list = (items) => Object.entries(items || {}).filter(([, n]) => n > 0).map(([k, n]) => itemChip(k, n)).join("");
    el.innerHTML = `<div class="sp-head"><b>Trade with ${esc(T.with)}</b><button class="x" data-close>✕</button></div>
      <div class="cols">
        <div class="col ${v.okMine ? "ok" : ""}"><div class="sp-sub">Your offer ${v.okMine ? "· accepted" : ""}</div><div class="grid mine">${list(T.offer.items) || '<div class="empty">Click items below</div>'}</div>
          <label class="goldIn">Gold <input type="number" min="0" max="${this.gold}" value="${T.offer.gold}"></label></div>
        <div class="col ${v.okTheirs ? "ok" : ""}"><div class="sp-sub">Their offer ${v.okTheirs ? "· accepted" : ""}</div><div class="grid">${list(v.theirs?.items) || '<div class="empty">Nothing yet</div>'}</div>
          <div class="goldOut">${v.theirs?.gold || 0} gold</div></div>
      </div>
      <div class="sp-sub">Your pack</div><div class="grid pack">${Object.entries(left).filter(([k, n]) => ITEMS[k] && n > 0).map(([k, n]) => itemChip(k, n)).join("") || '<div class="empty">Empty</div>'}</div>
      <div class="acts"><button class="primary" data-ok ${v.okMine ? "disabled" : ""}>${v.okMine ? "Waiting…" : "Accept"}</button><button class="ghost" data-close>Cancel</button></div>`;
    el.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => this.net.send({ type: "trade_cancel" })));
    el.querySelector("[data-ok]").onclick = () => this.net.send({ type: "trade_ok" });
    el.querySelectorAll(".pack .item").forEach((b) => (b.onclick = () => { const k = b.dataset.k; T.offer.items[k] = (T.offer.items[k] || 0) + 1; this.sendOffer(); }));
    el.querySelectorAll(".mine .item").forEach((b) => (b.onclick = () => { const k = b.dataset.k; T.offer.items[k]--; if (!T.offer.items[k]) delete T.offer.items[k]; this.sendOffer(); }));
    const gi = el.querySelector(".goldIn input");
    gi.onkeydown = (e) => e.stopPropagation();
    gi.onchange = () => { T.offer.gold = Math.max(0, Math.min(this.gold, Math.floor(+gi.value || 0))); this.sendOffer(); };
  }
  tradeClosed(reason) {
    $("#trade").classList.add("hidden");
    $("#ask").classList.add("hidden");
    const had = this.trade;
    this.trade = null;
    const msg = { declined: "Trade declined.", busy: "They're busy trading.", unavailable: "Get closer to trade.", left: "Trade partner left.", cancelled: "Trade cancelled.", failed: "Trade failed — offers changed." }[reason];
    if (msg && (had || reason !== "cancelled")) this.g.log(msg);
  }

  // ---------- pie menu ----------
  pickAt(x, y) {
    const g = this.g;
    let best = null, bd = 50;
    const consider = (pos, h, obj) => {
      const p = g.project(TMP.copy(pos).setY(pos.y + h));
      if (!p.visible) return;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = obj; }
    };
    consider(g.player.pos, 1.0, { type: "self" });
    for (const r of this.remotes.values()) if (r.model.object.visible) consider(r.pos, 1.0, { type: "player", r });
    for (const a of g.combat.actors) if (a.npc && !a.dead && a.model.object.visible) consider(a.pos, 1.0, { type: "npc", a });
    for (const c of g.citizens) if (c.model.object.visible) consider(c.pos, 1.0, { type: "citizen", c });
    for (const pet of g.wildlife?.pets.values() || []) if (pet.model.root.visible && !pet.dead) consider(pet.pos, pet.kind === "bat" ? 1.5 : .7, { type:"pet", pet });
    for (const horse of g.horses?.horses.values() || []) if (horse.model.root.visible && horse.deadUntil < Date.now()) consider(horse.pos, 1.5, { type:"horse", horse });
    for (const [id, actor] of g.corpses?.actors || []) if (actor.model.object.visible) consider(actor.pos,.35,{ type:"corpse", id, actor });
    for (const it of g.world.interactables) if (!it.hidden) consider(it.pos,it.kind === "gather" ? .35 : .7,{ type:"it", it });
    for (const a of g.combat.actors) if (a.caveBoss && a.parleyNeutral && a.alive && a.model.object.visible) consider(a.pos,1,{ type:"cave_boss", a });
    for (const a of g.combat.actors) if (a.surrendered && a.alive && a.model.object.visible) consider(a.pos,1,{ type:"surrender", a });
    for (const a of g.combat.actors) if (a.companion && a.alive && a.model.object.visible) consider(a.pos,1,{ type:"companion", a });
    for (const a of g.combat.actors) if (a.team === "enemy" && a.alive && !a.parleyNeutral && !a.surrendered && a.model.object.visible) consider(a.pos,1,{ type:"enemy", a });
    return best;
  }
  contextAt(x, y) {
    const t = this.pickAt(x, y);
    if (!t) { this.closePi(); return; }
    const g = this.g, me = g.player.pos;
    const opts = [];
    const far = (pos, d) => pos.distanceTo(me) > d;
    if (t.type === "self") {
      opts.push({ label: "Pack", sub: g.mobile ? "" : "I", fn: () => this.toggleInv(true) });
      opts.push({ label: "Character", fn: () => this.toggleSheet(true) });
      if (this.net) opts.push({ label: this.hostile ? "Leave Hostile" : "Go Hostile", danger: !this.hostile, fn: () => this.setHostile(!this.hostile) });
      opts.push({ label: "Wave", fn: () => this.emote("wave") });
      opts.push({ label: g.player.model.stance === "kneel" ? "Stand" : "Kneel", fn: () => this.emote(g.player.model.stance === "kneel" ? "stand" : "kneel") });
      const healK = Object.keys(this.inv).find((k) => ITEMS[k]?.heal && this.inv[k] > 0);
      if (healK) opts.push({ label: "Quick heal", sub: ITEMS[healK].name, fn: () => this.use(healK) });
      if (this.net && this.bounty) opts.push({ label: "Pay bounty", sub: `${this.bounty * 25}g`, disabled: this.gold < this.bounty * 25, fn: () => this.net.send({ type: "pay_bounty" }) });
      if (this.net) opts.push({ label: "Say…", sub: g.mobile ? "" : "Enter", fn: () => this.focusChat() });
      opts.push({ label: "Unstuck", disabled: g.combat.inCombat, fn: () => { const s = g.state.respawn || g.world.spots.respawn; g.player._teleport = true; g.teleport(s.x, s.z); g.snapCamera(); } });
      this.openPi(x, y, g.sheet.name, opts);
      return;
    }
    if (t.type === "player") {
      const r = t.r, o = stealOdds(this.myThief(), { attrs: r.info.attrs, level: r.info.level }, (this.inv.lockpick || 0) > 0);
      opts.push({ label: "Attack", sub: !this.canAttackRemote(r) ? "hostile required" : far(r.pos, 30) ? "too far" : "", danger: true, disabled: !this.canAttackRemote(r) || far(r.pos, 30), fn: () => this.attackRemote(r) });
      opts.push({ label: "Trade", sub: far(r.pos, 6) ? "too far" : "", disabled: far(r.pos, 6) || !!this.trade, fn: () => this.net.send({ type: "trade_req", to: r.info.id }) });
      opts.push({ label: "Steal", sub: far(r.pos, 3.2) ? "too far" : pct(o.chance), danger: true, disabled: far(r.pos, 3.2), fn: () => this.stealPlayer(r) });
      opts.push({ label: "Inspect", fn: () => this.inspect(r.info) });
      opts.push({ label: "Wave", fn: () => { g.combat.face(g.player, r.pos); this.emote("wave"); } });
      opts.push({ label: "Whisper", fn: () => { this.focusChat(); $("#chatIn").value = "@" + r.info.name + " "; } });
      this.openPi(x, y, r.info.name, opts);
      return;
    }
    if (t.type === "pet") {
      const p=t.pet, tooFar=far(p.pos,3.5);
      opts.push({ label:"Interact", sub:tooFar ? "too far" : "", disabled:tooFar, fn:()=>g.wildlife.open(p) });
      opts.push({ label:"Pet", disabled:tooFar, fn:()=>g.wildlife.action("pet",p) });
      if (!p.owner) opts.push({ label:"Tame", sub:`d20 · DC ${WILDLIFE[p.kind].dc}`, disabled:tooFar, fn:()=>g.wildlife.action("tame",p) });
      if (!p.owner || p.owner === g.wildlife.userId) opts.push({ label:"Shoo", disabled:tooFar, fn:()=>g.wildlife.action("shoo",p) });
      opts.push({ label:"Attack", danger:true, disabled:tooFar, fn:()=>g.wildlife.action("attack",p) });
      this.openPi(x,y,`${WILDLIFE[p.kind].name} · ${p.hp} HP`,opts); return;
    }
    if (t.type === "horse") {
      const h=t.horse, tooFar=far(h.pos,3.5);
      opts.push({ label:"Interact", disabled:tooFar || g.combat.inCombat, fn:()=>g.horses.open(h) });
      if (!h.tamed) opts.push({ label:"Tame", sub:"roll d20", disabled:tooFar || g.combat.inCombat, fn:()=>{ g.horses.open(h); g.horses.action("tame"); } });
      if (!h.tamed) opts.push({ label:"Attack", danger:true, disabled:tooFar || g.combat.inCombat, fn:()=>{ g.horses.open(h); g.horses.action("attack"); } });
      opts.push({ label:"Inspect", fn:()=>g.log(`${h.name || "Wild horse"} · ${h.hp}/24 HP`) });
      this.openPi(x,y,h.name || "Wild horse",opts); return;
    }
    if (t.type === "corpse") {
      opts.push({ label:"Search", disabled:far(t.actor.pos,3.2), fn:()=>g.corpses.open(t.id) });
      this.openPi(x,y,g.corpses.records[t.id]?.name || "Body",opts); return;
    }
    if (t.type === "it") {
      opts.push({ label:"Interact", disabled:far(t.it.pos,3.2), fn:()=>g.interact(false,{ type:"it", it:t.it }) });
      opts.push({ label:"Inspect", fn:()=>g.log(g.itLabel(t.it)) });
      this.openPi(x,y,g.itLabel(t.it),opts); return;
    }
    if (t.type === "cave_boss") {
      opts.push({ label:"Speak", disabled:far(t.a.pos,3.2), fn:()=>g.interact(false,{type:"cave_boss",actor:t.a}) });
      opts.push({ label:"Attack", danger:true, disabled:far(t.a.pos,4), fn:()=>g.startCaveFight(t.a) });
      this.openPi(x,y,t.a.name,opts); return;
    }
    if (t.type === "surrender") {
      opts.push({ label:"Spare", disabled:far(t.a.pos,3.2), fn:()=>g.interact(false,{type:"surrender",actor:t.a}) });
      opts.push({ label:"Finish", danger:true, disabled:far(t.a.pos,3.2), fn:()=>g.interact(true,{type:"surrender",actor:t.a}) });
      this.openPi(x,y,t.a.name,opts); return;
    }
    if (t.type === "companion") {
      opts.push({ label:"Talk", disabled:far(t.a.pos,3.2), fn:()=>g.interact(false,{type:"npc",key:t.a.companion,actor:t.a}) });
      opts.push({ label:"Inspect", fn:()=>g.log(`${t.a.name} · ${Math.ceil(t.a.hp)}/${t.a.stats.maxHp} HP`) });
      this.openPi(x,y,t.a.name,opts); return;
    }
    if (t.type === "enemy") {
      opts.push({ label:"Attack", danger:true, fn:()=>{g.player.target=t.a;g.useSlot(0);} });
      opts.push({ label:"Inspect", fn:()=>g.log(`${t.a.name} · ${Math.ceil(t.a.hp)}/${t.a.stats.maxHp} HP`) });
      this.openPi(x,y,t.a.name,opts); return;
    }
    if (t.type === "npc") {
      const a = t.a, card = NPCS[a.npc], o = stealOdds(this.myThief(), this.npcMark("npc", a.npc), (this.inv.lockpick || 0) > 0);
      opts.push({ label: "Talk", sub: far(a.pos, 3.2) ? "too far" : "", disabled: far(a.pos, 3.2), fn: () => g.interact(false, { type:"npc", key:a.npc, actor:a }) });
      if (a.npc !== "carver") opts.push({ label: "Trade", sub: far(a.pos, 4) ? "too far" : "", disabled: far(a.pos, 4), fn: () => this.openShop(card.name, g.player) });
      opts.push({ label: "Steal", sub: far(a.pos, 3) ? "too far" : pct(o.chance), danger: true, disabled: far(a.pos, 3), fn: () => this.stealNPC({ name: card.name, kind: "npc", key: a.npc }) });
      opts.push({ label: "Inspect", fn: () => g.log(`${card.name} — ${card.role}`) });
      this.openPi(x, y, card.name, opts);
      return;
    }
    if (t.type === "citizen") {
      const c = t.c, o = stealOdds(this.myThief(), this.npcMark("citizen"), (this.inv.lockpick || 0) > 0);
      const name = c.name || "Citizen";
      opts.push({ label: "Talk", sub: far(c.pos, 3.2) ? "too far" : "", disabled: far(c.pos, 3.2), fn: () => g.interact(false, { type: "citizen", key: c.npc, actor: c }) });
      opts.push({ label: "Steal", sub: far(c.pos, 3) ? "too far" : pct(o.chance), danger: true, disabled: far(c.pos, 3), fn: () => { c.pauseT = 1.5; this.stealNPC({ name, kind: "citizen" }); } });
      opts.push({ label: "Inspect", fn: () => g.log(`${name} of Marrowgate, going about their day.`) });
      this.openPi(x, y, name, opts);
    }
  }
  inspect(info) {
    const cls = CLASSES[info.cls]?.name || "Wayfarer";
    this.g.log(`${info.name} — level ${info.level || 1} ${cls}${info.username ? " (@" + info.username + ")" : ""}${info.bounty ? ` · bounty ${info.bounty}` : ""}`);
  }
  emote(name) {
    this.g.player.model.play(name);
    this.net?.event({ kind: "anim", name });
  }
  openPi(x, y, title, opts) {
    const el = $("#pi");
    const R = 84;
    x = Math.max(R + 50, Math.min(innerWidth - R - 50, x));
    y = Math.max(R + 30, Math.min(innerHeight - R - 30, y));
    el.style.left = x + "px"; el.style.top = y + "px";
    el.innerHTML = `<div class="pi-c">${esc(title)}</div>` + opts.map((o, i) => {
      const a = (i / opts.length) * Math.PI * 2 - Math.PI / 2;
      return `<button class="pi-o${o.danger ? " danger" : ""}" data-i="${i}" ${o.disabled ? "disabled" : ""} style="left:${Math.cos(a) * R}px;top:${Math.sin(a) * R}px">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</button>`;
    }).join("");
    el.classList.remove("hidden");
    requestAnimationFrame(() => el.classList.add("open"));
    el.querySelectorAll(".pi-o").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); this.closePi(); opts[+b.dataset.i].fn(); }));
  }
  closePi() { const el = $("#pi"); el.classList.remove("open"); el.classList.add("hidden"); }
  get piOpen() { return !$("#pi").classList.contains("hidden"); }

  // ---------- per-frame / lifecycle ----------
  setup() {
    this.setupChat();
    $("#pi").onpointerdown = (e) => { if (e.target.id === "pi") this.closePi(); };
    addEventListener("pointerdown", this._outside = (e) => { if (this.piOpen && !e.target.closest("#pi")) this.closePi(); }, true);
    $("#packBtn").onclick = () => this.toggleInv();
    $("#sheetBtn").onclick = () => this.toggleSheet();
    $("#realmTag").classList.toggle("hidden", !this.net);
    if (this.net) $("#realmTag").textContent = `${this.realm.name}${this.realm.owner ? " · host" : ""}`;
  }
  update(dt) {
    if (this.sheetPreview && !$("#characterSheet").classList.contains("hidden")) this.sheetPreview.update(dt);
    if (this.net) {
      this.net.update(dt, Object.assign(this.g.player, { M: this.g.morality.M }), { city: this.inCity(), level: this.g.sheet.level || 1 });
      this.updateRemotes(dt);
    }
    this.updateGuards(dt);
    if (this.net && skullVisible(this.skullUntil) && this.inCity() && !this.g.player.fullyDefeated) {
      this.skullGuardT -= dt;
      if (this.skullGuardT <= 0) { this.skullGuardT = 45; this.g.log("The city guard recognizes your skull!", "fail"); this.callGuards(); }
    } else this.skullGuardT = 0;
  }
  destroy() {
    document.body.classList.remove("shop-owner-p2");
    this.shopRender = null;
    this.shopActor = null;
    this.sheetPreview?.destroy(); this.sheetPreview = null;
    removeEventListener("pointerdown", this._outside, true);
    for (const id of [...this.remotes.keys()]) this.dropRemote(id);
    this.net?.close();
    this.selfSkull?.remove(); this.selfSkull = null;
    if (this.selfGlow) { this.selfGlow.removeFromParent(); this.selfGlow.geometry.dispose(); this.selfGlow.material.dispose(); this.selfGlow = null; }
    for (const s of ["#inv", "#characterSheet", "#shop", "#trade", "#ask", "#pi", "#chatIn"]) $(s)?.classList.add("hidden");
  }
}
