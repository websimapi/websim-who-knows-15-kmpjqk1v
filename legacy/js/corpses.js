import * as THREE from "three";
import { ITEMS, corpseLoot, corpseEquipment, stripCorpseEquipment, fitCount, carryCapacity, inventoryWeight } from "./items.js";
import { Character, Creature } from "./character.js";
import { cleanEquipment, equipmentLook } from "./equipment.js";
import { itemImage } from "./item-art.js";
import { createHorseModel, horseLook } from "./horse-asset.js";
import { groundBody, orientBodyToTerrain } from "./body-grounding.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// Combat renders outdoor actors to 160 units. Keep bodies loaded throughout
// that view and unload them beyond it, with room to avoid boundary churn.
const CORPSE_LOAD_RANGE = 170;
const CORPSE_UNLOAD_RANGE = 190;
const weapon = (items) => Object.keys(items || {}).filter(k => ITEMS[k]?.weapon && items[k] > 0)
  .sort((a, b) => ITEMS[b].value - ITEMS[a].value)[0];

function corpseAppearance(record) {
  const worn = cleanEquipment(record.equipment, record.items);
  const look = equipmentLook(record.look || {}, worn);
  // Keep an NPC's original colors while the matching gear is still worn.
  if (record.kind !== "player_body") {
    if (worn.armor) {
      look.body = record.look?.body || look.body;
      look.armorStyle = record.look?.armorStyle || null;
      look.gear = record.look?.gear || look.gear;
      look.trim = record.look?.trim || look.trim;
    }
    if (worn.weapon) look.weapon = record.look?.weapon || look.weapon;
    if (worn.helmet) look.helmet = record.look?.helmet || look.helmet;
  }
  return look;
}

function settleCorpseHair(model, game) {
  if (!model.hairs?.length) return;
  const ground = (x, z) => game.world.surfaceHeightAt(x, z);
  for (let step = 0; step < 30; step++) {
    for (const hair of model.hairs) hair.update(1 / 30, game.camera, game.wind, true, ground);
  }
}

function skeletonModel(scene) {
  const object = new THREE.Group();
  const bone = new THREE.MeshStandardMaterial({ color: 0xc6b89a, roughness: .9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x352d27, roughness: 1 });
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const segment = (a, b, radius) => {
    const d = b.clone().sub(a), mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * .8, radius, d.length(), 7), bone);
    mesh.position.copy(a).addScaledVector(d, .5);
    mesh.quaternion.setFromUnitVectors(v(0,1,0), d.normalize());
    mesh.castShadow = true; object.add(mesh);
  };
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 9), bone);
  skull.scale.set(.9,.75,1.15); skull.position.set(0,.18,.82); skull.castShadow = true; object.add(skull);
  for (const side of [-1,1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.028,6,5),dark);
    eye.position.set(side*.055,.2,.94); object.add(eye);
    segment(v(0,.11,-.08),v(side*.15,.12,-.16),.055);
    segment(v(side*.16,.12,-.18),v(side*.22,.1,-.56),.045);
    segment(v(side*.22,.1,-.56),v(side*.24,.09,-.91),.03);
    segment(v(side*.13,.16,.51),v(side*.37,.12,.43),.035);
    segment(v(side*.37,.12,.43),v(side*.5,.08,.13),.028);
    segment(v(side*.5,.08,.13),v(side*.48,.07,-.12),.02);
    for (let i = 0; i < 5; i++) segment(v(0,.14,.14+i*.075),v(side*(.23-i*.01),.11,.13+i*.075),.016);
  }
  segment(v(0,.13,-.07),v(0,.14,.67),.032);
  object.position.y = .07;
  return { object, addTo() { scene.add(object); }, play() {}, update() {}, dispose() {
    object.removeFromParent(); object.traverse(o => o.geometry?.dispose?.()); bone.dispose(); dark.dispose();
  } };
}

function animalBodyModel(scene) {
  const object = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x796d5c, roughness: .95 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material);
  body.scale.set(.32, .2, .55); body.position.set(0, .23, 0); object.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.23, 10, 8), material);
  head.position.set(0, .22, .53); object.add(head);
  return { object, addTo() { scene.add(object); }, play() {}, update() {}, dispose() {
    object.removeFromParent(); body.geometry.dispose(); head.geometry.dispose(); material.dispose();
  } };
}

function horseBodyModel(scene, record) {
  const object = new THREE.Group(), horse = createHorseModel();
  horse.setAppearance(horseLook(record.coat, record.pattern, record.look));
  horse.root.rotation.z = -Math.PI / 2;
  horse.root.position.set(-1.05, .3, 0);
  object.add(horse.root);
  return { object, horse, height: 2.1, groundBonePattern: /^(ribcage|spine|hips|head)/,
    addTo() { scene.add(object); }, play() {}, update() {}, dispose() { object.removeFromParent(); horse.dispose(); } };
}

export class CorpseSystem {
  constructor(game, snapshot = []) {
    this.g = game;
    this.records = game.social.net ? {} : game.state.corpses;
    this.actors = new Map();
    this.openId = null;
    this.tick = 0;
    this.modelTick = 0;
    const panel = $("#corpsePanel");
    panel.addEventListener("click", e => { if (e.target === panel) this.close(); });
    for (const record of snapshot) this.onUpdate(record);
    if (!game.social.net) for (const record of Object.values(this.records)) this.ensureActor(record);
  }
  create(actor) {
    const id = `c_${Date.now().toString(36)}_${Math.floor(Math.random()*1e9).toString(36)}`;
    const base = corpseLoot(actor.kind, id);
    const look = base.human && actor.model?.look ? structuredClone(actor.model.look) : null;
    const equipment = corpseEquipment(actor.kind, look || {});
    for (const key of Object.values(equipment)) base.items[key] = (base.items[key] || 0) + 1;
    const record = { id, kind: actor.kind, name: actor.name, x: actor.pos.x, z: actor.pos.z, yaw: actor.yaw, spawn: actor.spawn || null,
      npc: actor.npc || null, look, equipment, items: base.items, gold: base.gold, wands: [], human: base.human, disturbed: false, devoured: false, createdAt: Date.now(), hollowId: actor.nightHunter ? actor.spawn : null };
    if (record.hollowId && !this.g.social.net) {
      const stolen = this.g.state.hollowLoot[record.hollowId] || {};
      for (const [key, n] of Object.entries(stolen.items || stolen)) if (ITEMS[key]) record.items[key] = (record.items[key] || 0) + n;
      record.gold += Math.max(0, Number(stolen.$gold) || 0);
      record.wands = [...(stolen.$wands || [])];
      delete this.g.state.hollowLoot[record.hollowId];
    }
    actor.corpseId = id;
    this.actors.set(id, actor);
    this.records[id] = record;
    if (this.g.social.net) this.g.social.net.send({ type: "corpse_create", corpse: { id, kind: record.kind, name: record.name, x: record.x, z: record.z, yaw: record.yaw, spawn: record.spawn, npc: record.npc, look: record.look, hollowId: record.hollowId } });
    else this.g.save();
    return record;
  }
  createHorse(horse) {
    const id = `c_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
    const loot = corpseLoot("horse", id);
    const record = { id, kind: "horse", name: `${horse.name || "Wild horse"}'s body`, x: horse.x, z: horse.z,
      yaw: horse.model.root.rotation.y, coat: horse.coat, pattern: horse.pattern, look: horse.look || null,
      items: loot.items, gold: loot.gold, wands: [], human: false, disturbed: false, devoured: false, createdAt: Date.now() };
    this.onUpdate(record);
    this.g.save();
    return record;
  }
  createPlayerRemains(player, hollow = null) {
    const id = `c_${Date.now().toString(36)}_${Math.floor(Math.random()*1e9).toString(36)}`;
    if (this.g.social.net) {
      this.g.social.net.send({ type: "player_death", hollow: hollow?.spawn || null, hollowX: hollow?.pos.x, hollowZ: hollow?.pos.z });
      return null;
    }
    const state = this.g.state;
    const record = { id, kind: hollow ? "player_skeleton" : "player_body", name: `${player.name}'s body`, x: player.pos.x, z: player.pos.z,
      yaw: player.yaw, spawn: null, items: { ...state.inv }, gold: state.gold, wands: [...(state.wands || [])], human: !hollow,
      disturbed: true, devoured: !!hollow, createdAt: Date.now(), ownerId: this.g.saveId, look: this.g.sheet.look, equipment: { ...state.equipment } };
    state.inv = {}; state.gold = 0; state.wands = []; state.equippedWandId = null;
    state.equipment = { hideHelmet: !!state.equipment?.hideHelmet };
    this.g.wands?.syncEquip(); this.g.refreshEquipment();
    if (hollow) {
      const cache = state.hollowLoot[hollow.spawn] || {};
      for (const [key, count] of Object.entries(record.items)) cache[key] = (cache[key] || 0) + count;
      cache.$gold = (cache.$gold || 0) + record.gold;
      cache.$wands = [...(cache.$wands || []), ...record.wands];
      cache.$x = hollow.pos.x; cache.$z = hollow.pos.z;
      state.hollowLoot[hollow.spawn] = cache;
      record.items = {}; record.gold = 0; record.wands = [];
      this.applyHollowGear(hollow, cache);
    }
    this.onUpdate(record);
    this.g.save();
    return record;
  }
  ensureActor(record) {
    if (!record?.id || this.actors.has(record.id)) return;
    const g = this.g;
    if (!g.combat || !g.world) return;
    if (g.player && [g.player, g.localPlayer2].filter(Boolean).every(p => Math.hypot(p.pos.x-record.x,p.pos.z-record.z) > CORPSE_LOAD_RANGE)) return;
    const pos = new THREE.Vector3(record.x, g.world.surfaceHeightAt(record.x, record.z), record.z);
    if (record.kind === "player_skeleton" || record.kind === "player_body" || record.kind === "npc" || record.kind === "wild_pet" || record.kind === "horse") {
      const body = record.kind === "player_body";
      const model = body ? new Character(corpseAppearance(record), { hairGuides: 12 })
        : record.kind === "npc" ? new Character(record.equipment ? corpseAppearance(record) : record.look || { ancestry: "valeborn", body: "robe", gear: "#665a4b", hair: { style: "short", color: "#332a22" } }, { hairGuides: 12 })
        : record.kind === "wild_pet" ? animalBodyModel(g.scene)
        : record.kind === "horse" ? horseBodyModel(g.scene, record)
        : skeletonModel(g.scene);
      model.addTo(g.scene); model.object.position.copy(pos);
      orientBodyToTerrain(model, g.world, pos, record.yaw || 0);
      if (body || record.kind === "npc") { model.play("death"); for (let i = 0; i < 8; i++) model.update(.2, { camera: g.camera, wind: g.wind, simulateHair: false, groundWorld: g.world, groundAnchor: pos, hairGround: g.world }); }
      groundBody(model, g.world, pos);
      settleCorpseHair(model, g);
      this.actors.set(record.id, { id: record.id, kind: record.kind, name: record.name, pos, dead: true, model, corpseId: record.id });
      return;
    }
    const actor = g.combat.spawnEnemy(record.kind, pos, { spawn: record.spawn, nightHunter: !!record.hollowId });
    actor.name = record.name; actor.yaw = record.yaw || 0; actor.hp = 0; actor.dead = true; actor.fade = Infinity; actor.corpseId = record.id;
    if (actor.model instanceof Character || actor.model instanceof Creature) orientBodyToTerrain(actor.model, g.world, pos, actor.yaw);
    else actor.model.object.rotation.y = actor.yaw;
    if (record.equipment && record.look && actor.model.setLook) actor.model.setLook(corpseAppearance(record));
    actor.model.play("death");
    for (let i = 0; i < 8; i++) actor.model.update(.2, { camera: g.camera, wind: g.wind, simulateHair: false, groundWorld: g.world, groundAnchor: pos, hairGround: g.world });
    groundBody(actor.model, g.world, pos);
    settleCorpseHair(actor.model, g);
    this.actors.set(record.id, actor);
  }
  onUpdate(record) {
    if (!record?.id) return;
    this.records[record.id] = record;
    if (record.npc && /^([a-z][a-z0-9_]{0,39})$/.test(record.npc)) {
      this.g.state.deadNpcs[record.npc] = true;
      const live = this.g.npcs?.[record.npc];
      if (live?.alive) { this.g.combat.remove(live); delete this.g.npcs[record.npc]; }
      const citizen = this.g.citizens?.find(c => c.npc === record.npc);
      if (citizen) { this.g.combat.remove(citizen.actor); this.g.citizens = this.g.citizens.filter(c => c !== citizen); }
    }
    const existing = this.actors.get(record.id);
    if (existing && existing.kind !== record.kind) { if (this.g.combat.actors.includes(existing)) this.g.combat.remove(existing); else existing.model.dispose(); this.actors.delete(record.id); }
    this.ensureActor(record);
    if (record.kind === "player_body" || (record.equipment && record.look && record.human)) {
      const model = this.actors.get(record.id)?.model;
      if (model?.setLook) {
        model.setLook(corpseAppearance(record));
        for (let i = 0; i < 4; i++) model.update(.2, { camera: this.g.camera, wind: this.g.wind, simulateHair: false, groundWorld: this.g.world, groundAnchor: this.actors.get(record.id).pos, hairGround: this.g.world });
        groundBody(model, this.g.world, this.actors.get(record.id).pos);
        settleCorpseHair(model, this.g);
      }
    }
    if (record.hollowId) {
      this.g.social.hollowLootIds = this.g.social.hollowLootIds.filter(id => id !== record.hollowId);
    }
    if (this.openId === record.id) this.render();
  }
  nearest(p, max = 2.8) {
    let out = null, best = max;
    for (const [id, actor] of this.actors) {
      if (!actor.dead) continue;
      const d = actor.pos.distanceTo(p);
      if (d < best) { best = d; out = { type: "corpse", id, actor, label: `Search ${this.records[id]?.name || "body"}` }; }
    }
    return out;
  }
  open(id, viewer = this.g.player) {
    const record = this.records[id], actor = this.actors.get(id);
    if (!record || !actor || actor.pos.distanceTo(viewer.pos) > 3.2) return;
    this.openId = id;
    this.viewer = viewer;
    document.body.classList.toggle("corpse-owner-p2", viewer === this.g.localPlayer2 && !!this.g.localPlayer2);
    $("#corpsePanel").classList.remove("hidden");
    this.render();
  }
  close() { this.openId = null; this.viewer = null; document.body.classList.remove("corpse-owner-p2"); $("#corpsePanel").classList.add("hidden"); }
  render() {
    const record = this.records[this.openId]; if (!record) return this.close();
    const viewer = this.viewer || this.g.player, state = this.g.social.actorState(viewer);
    const el = $("#corpsePanel .corpse-card"), inv = state.inv, sheet = viewer.sheet || this.g.sheet;
    const entries = Object.entries(record.items || {}).filter(([k,n]) => ITEMS[k] && n > 0);
    const wands = record.wands || [];
    const free = Math.max(0, carryCapacity(sheet) - inventoryWeight(inv));
    const canTakeGold = record.gold > 0 && (!this.g.social.net || state.gold < 1e7);
    el.innerHTML = `<div class="corpse-head"><div><small>FALLEN</small><h2>${esc(record.name)}</h2></div><button data-close aria-label="Close loot">✕</button></div>
      <div class="corpse-capacity">Pack ${inventoryWeight(inv).toFixed(1)} / ${carryCapacity(sheet).toFixed(1)} kg · ${free.toFixed(1)} kg free</div>
      <div class="corpse-list">${record.gold > 0 ? `<button data-gold ${canTakeGold ? "" : "disabled"}><span>◈</span> ${record.gold} gold <b>${canTakeGold ? "Take" : "Purse full"}</b></button>` : ""}
      ${entries.map(([k,n]) => `<button data-item="${k}" ${fitCount(inv,sheet,k,n) ? "" : "disabled"}>${itemImage(k)} ${esc(ITEMS[k].name)} ×${n}<em>${ITEMS[k].weight} kg each</em><b>${fitCount(inv,sheet,k,n) ? "Take" : "Too heavy"}</b></button>`).join("")}
      ${wands.map(w => `<button data-wand="${esc(w.id)}"><span style="color:${esc(w.spell?.color || '#b2cfff')}">✧</span> ${esc(w.name)} · ${esc(w.spell?.name || 'Wand')}<b>Take</b></button>`).join("") || (!record.gold && !entries.length ? '<p>Nothing remains.</p>' : "")}</div>
      <div class="corpse-actions"><button data-all ${!canTakeGold && !wands.length && !entries.some(([k,n]) => fitCount(inv,sheet,k,n)) ? "disabled" : ""}>Loot all that fits</button><button data-close>Leave body</button></div>`;
    el.querySelectorAll("[data-close]").forEach(b => b.onclick = () => this.close());
    el.querySelector("[data-all]").onclick = () => this.loot("all");
    el.querySelector("[data-gold]")?.addEventListener("click", () => this.loot("gold"));
    el.querySelectorAll("[data-item]").forEach(b => b.onclick = () => this.loot(b.dataset.item));
    el.querySelectorAll("[data-wand]").forEach(b => b.onclick = () => this.loot(`wand:${b.dataset.wand}`));
  }
  loot(key) {
    const r = this.records[this.openId]; if (!r) return;
    if (this.g.social.net) { this.g.social.net.send({ type: "corpse_loot", id: r.id, key }); return; }
    const viewer = this.viewer || this.g.player, state = this.g.social.actorState(viewer), inv = state.inv;
    let tookLoot = false;
    if (key === "all" || key.startsWith("wand:")) {
      const ids = key === "all" ? new Set((r.wands || []).map(w => w.id)) : new Set([key.slice(5)]);
      for (const wand of [...(r.wands || [])]) if (ids.has(wand.id)) {
        state.wands ||= [];
        if (!state.wands.some(w => w.id === wand.id)) state.wands.push(wand);
        this.g.wands?.register(wand, viewer.sheet || this.g.sheet);
        r.wands = r.wands.filter(w => w.id !== wand.id);
        stripCorpseEquipment(r, wand.id);
        tookLoot = true;
      }
    }
    if (key === "all" || key === "gold") {
      if (r.gold > 0) { state.gold += r.gold; r.gold = 0; tookLoot = true; }
    }
    if (key !== "gold" && !key.startsWith("wand:")) for (const k of key === "all" ? Object.keys(r.items) : [key]) {
      const n = fitCount(inv, viewer.sheet || this.g.sheet, k, r.items[k] || 0);
      if (n) { inv[k] = (inv[k] || 0) + n; r.items[k] -= n; if (!r.items[k]) delete r.items[k]; stripCorpseEquipment(r, k); tookLoot = true; }
    }
    if (tookLoot) r.disturbed = true;
    this.g.social.renderInv(); this.g.save(); this.onUpdate(r);
  }
  nearestEdible(hunter, max = 35) {
    let best = null, distance = max;
    for (const record of Object.values(this.records)) {
      if (record.devoured || record.kind === "player_skeleton") continue;
      const d = Math.hypot(hunter.pos.x - record.x, hunter.pos.z - record.z);
      if (d < distance) { best = record; distance = d; }
    }
    return best;
  }
  devour(record, hunter) {
    if (!record || record.devoured || !hunter?.alive) return;
    if (this.g.social.net) { this.g.social.net.send({ type: "corpse_devour", id: record.id, hollow: hunter.spawn }); return; }
    const g = this.g, cache = g.state.hollowLoot[hunter.spawn] || {};
    for (const [key, count] of Object.entries(record.items || {})) if (ITEMS[key] && count > 0) cache[key] = (cache[key] || 0) + count;
    cache.$gold = (cache.$gold || 0) + (record.gold || 0);
    cache.$wands = [...(cache.$wands || []), ...(record.wands || [])];
    cache.$x = hunter.pos.x; cache.$z = hunter.pos.z;
    g.state.hollowLoot[hunter.spawn] = cache;
    record.items = {}; record.gold = 0; record.wands = [];
    record.devoured = true; record.human = false; record.kind = "player_skeleton";
    this.onUpdate(record);
    this.applyHollowGear(hunter, cache);
    g.log(`The Hollow devours ${record.name} and scavenges the remains.`, "fail");
    g.save();
  }
  update(dt) {
    this.modelTick -= dt;
    if (this.modelTick <= 0) {
      this.modelTick = 1.5;
      for (const actor of this.actors.values()) if (actor.kind === "horse" && actor.model.horse?.rig && !actor.model._groundRigReady) {
        actor.model._groundContacts = null;
        groundBody(actor.model, this.g.world, actor.pos);
        actor.model._groundRigReady = true;
      }
      const players = [this.g.player, this.g.localPlayer2].filter(Boolean);
      for (const [id, actor] of this.actors) if (players.every(p => Math.hypot(actor.pos.x-p.pos.x,actor.pos.z-p.pos.z) > CORPSE_UNLOAD_RANGE)) {
        if (this.g.combat.actors.includes(actor)) this.g.combat.remove(actor); else actor.model.dispose();
        this.actors.delete(id);
      }
      for (const record of Object.values(this.records)) this.ensureActor(record);
    }
  }
  applyHollowGear(actor, items = null) {
    if (!actor || actor.kind !== "hollow") return;
    const cache = items || this.g.state.hollowLoot[actor.spawn] || {};
    const key = weapon(cache);
    if (actor.hollowWeapon === key) return;
    actor.hollowWeapon = key || null;
    actor.stats.abilities = key ? ["hollow_weapon", "hollow_throw", "warden_lash", "warden_slam", "hollow_hex"] : ["warden_lash", "warden_slam", "hollow_hex", "cleave"];
    actor.model.equipWeapon?.(key);
  }
  throwWeapon(actor) {
    const key = actor?.hollowWeapon;
    if (!key || !actor.nightHunter) return;
    if (this.g.social.net) {
      this.g.social.net.send({ type: "hollow_throw", hollow: actor.spawn, key });
      return;
    }
    const cache = this.g.state.hollowLoot[actor.spawn];
    if (!cache?.[key]) return;
    cache[key]--;
    if (!cache[key]) delete cache[key];
    this.applyHollowGear(actor, cache);
    this.g.save();
  }
}
