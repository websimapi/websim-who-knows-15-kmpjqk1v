import * as THREE from "three";
import { Character } from "./character.js";
import { d20Check, describe } from "./dice.js";
import { HOUSE_LOTS, ITEMS, fitCount } from "../server.js";

const $ = (s) => document.querySelector(s);
const BASE_Z = 0;

export class CityInteriors {
  constructor(game, slot = 1) {
    this.g = game;
    this.slot = slot;
    this.active = null;
    this.transition = null;
    this.doorMotion = null;
    this.group = null;
    this.colliders = [];
    this.resident = null;
    this.hostile = null;
    this.dialogOpen = false;
    this.el = $("#housePanel");
    this.exitIt = { id: `house_exit_${slot}`, kind: "house_exit", pos: new THREE.Vector3(), label: "Leave building", hidden: true, slot };
    this.chestIt = { id: `house_chest_${slot}`, kind: "house_chest", pos: new THREE.Vector3(), label: "Open chest", hidden: true, slot };
    this.decorIt = { id: `house_decor_${slot}`, kind: "house_decor", pos: new THREE.Vector3(), label: "Arrange furnishings", hidden: true, slot };
    this.boltIt = { id: `house_bolt_${slot}`, kind: "house_bolt", pos: new THREE.Vector3(), label: "Work door bolt", hidden: true, slot };
    game.world.interactables.push(this.exitIt, this.chestIt, this.decorIt, this.boltIt);
    for (const door of game.world.cityDoors) {
      const record = game.state.cityHouses[door.id];
      if (door.property) door.setSignName(record?.characterId ? record.ownerName : null);
      if (door.property && record?.characterId) door.leaf.children[0].material.color.setHex(0x593a27);
      else if (record?.unlocked) door.leaf.children[0].material.color.setHex(0x6c452c);
    }
    this.keyHandler = (e) => {
      if (!this.dialogOpen) return;
      if (this.slot === 2 && this.g.localPlayer2) return;
      e.stopImmediatePropagation();
      if (e.code === "Escape") { e.preventDefault(); if (this.active && this.resident && !this.record(this.active).welcomed) this.leave(); else this.closePanel(); return; }
      const n = +e.key;
      if (n >= 1 && n <= 9) this.el.querySelectorAll(".house-options button")[n - 1]?.click();
    };
    addEventListener("keydown", this.keyHandler);
  }
  record(door) { return this.g.state.cityHouses[door.id] ||= { unlocked: false, welcomed: false, reported: false }; }
  get owner() { return this.slot === 2 ? this.g.localPlayer2 : this.g.player; }
  get characterId() { return this.slot === 2 ? (this.g.p2SaveId || (this.g.social.net ? `${this.g.saveId}:coop` : "local-coop-2")) : this.g.saveId; }
  get propertyOwner() { const r = this.active && this.record(this.active); return !!r && r.characterId === this.characterId && r.ownerSlot === this.slot && (!this.g.social.net || r.ownerUserId === this.g.social.userId); }
  onHouseUpdate(house) {
    const door = this.g.world.cityDoors.find(d => d.id === house.id);
    if (!door) return;
    const r = this.record(door);
    Object.assign(r, { ownerUserId: house.ownerUserId, ownerSlot: house.ownerSlot, characterId: house.characterId,
      ownerName: house.ownerName, lootTaken: house.lootTaken, decor: house.decor || [], unbarredUntil: house.unbarredUntil || 0 });
    door.leaf.children[0].material.color.setHex(house.characterId ? 0x593a27 : 0x6c452c);
    door.setSignName(house.characterId ? house.ownerName : null);
    if (this.active?.id === house.id) this.renderDecor();
  }
  label(door) {
    const r = this.record(door);
    if (door.property) return `${door.label} · ${r.characterId ? (r.characterId === this.characterId && r.ownerSlot === this.slot ? "Your home" : "Tier 3 lock") : "Vacant"}`;
    return `${door.label} · ${door.locked && !r.unlocked ? "Locked door" : "Open door"}`;
  }
  show(line, choices, name = "Marrowgate") {
    if (this.g.conversationActive() && this.g.conversationActor && this.g.conversationActor !== this.owner) return;
    this.dialogOpen = true;
    this.g.beginConversation?.(this.owner);
    this.el.classList.remove("hidden");
    this.el.querySelector(".house-name").textContent = name;
    this.el.querySelector(".house-line").textContent = line;
    const options = this.el.querySelector(".house-options");
    options.replaceChildren();
    choices.forEach(([label, fn], i) => {
      const button = document.createElement("button");
      button.textContent = `${i + 1}. ${label}`;
      button.onclick = fn;
      options.append(button);
    });
  }
  closePanel() {
    const wasOpen = this.dialogOpen;
    this.dialogOpen = false;
    if (wasOpen) this.el.classList.add("hidden");
    if (this.g.talking === this.resident) this.g.talking = null;
    if (this.g.conversationActor === this.owner && !this.g.dialogue?.open) this.g.endConversation?.();
  }
  async useDoor(door, actor = this.g.player) {
    if (this.active || this.dialogOpen || this.busy) return;
    const eye = actor.eye(new THREE.Vector3());
    const latch = door.pos.clone().add(new THREE.Vector3(0, 1.25, 0));
    if (!this.g.world.los(eye, latch, .35)) { this.g.toast("Door out of reach", "Stand in front of the doorway"); return; }
    if (door.property) { this.propertyDoor(door, actor); return; }
    const r = this.record(door);
    if (door.locked && !r.unlocked) {
      if (this.g.conversationActive() && this.g.conversationActor !== actor) return;
      this.show("The latch is locked. A failed attempt may bring the watch.", [
        [`Pick lock · ${this.g.social.inv.lockpick || 0} picks`, () => this.pick(door, actor)],
        ["Leave it", () => this.closePanel()],
      ], door.label);
      return;
    }
    this.closePanel(); this.openAndEnter(door, actor);
  }
  async propertyDoor(door, actor = this.owner) {
    const r = this.record(door), mine = r.characterId === this.characterId && r.ownerSlot === this.slot && (!this.g.social.net || r.ownerUserId === this.g.social.userId);
    if (!r.characterId || mine || r.unbarredUntil > Date.now()) { await this.enterProperty(door, actor); return; }
    this.show(`${r.ownerName || "The owner"} holds the deed. The tier 3 iron lock is barred from inside.`, [
      ["Knock and wait for the owner", async () => { if (this.g.social.net) await this.g.social.houseAction("knock", door, actor); this.closePanel(); this.g.toast("You knock", "Only the owner can unbar the inside bolt."); }],
      [`Pick tier 3 lock · ${this.g.social.actorInv(actor).lockpick || 0} picks`, () => this.pickProperty(door, actor)],
      ["Force iron bolt · Might DC 24", () => this.pickProperty(door, actor, true)],
      ["Step away", () => this.closePanel()],
    ], door.label);
  }
  async enterProperty(door, actor = this.owner) {
    if (this.busy) return;
    this.busy = true;
    const result = this.g.social.net ? await this.g.social.houseAction("enter", door, actor) : { ok: true };
    this.busy = false;
    if (!result?.ok) { this.show(result?.reason || "The door stays shut.", [["Step away", () => this.closePanel()]], door.label); return; }
    if (result.house) this.onHouseUpdate(result.house);
    if (result.chest) this.record(door).chest = result.chest;
    this.closePanel(); this.openAndEnter(door, actor);
  }
  async pickProperty(door, actor = this.owner, force = false) {
    if (this.busy) return;
    const inv = this.g.social.actorInv(actor);
    if (!force && !inv.lockpick) { this.show("You need a lockpick for the iron wards.", [["Step away", () => this.closePanel()]], door.label); return; }
    this.busy = true; this.closePanel();
    const bonus = this.g.dialogueCheckBonus(force ? { abilities: ["Strength"], skill: "athletics" } : { abilities: ["Dexterity"], skill: "sleight of hand" }, actor), dc = force ? 24 : 22;
    let result;
    if (this.g.social.net) {
      const response = await this.g.social.houseAction(force ? "force" : "pick", door, actor);
      if (!response?.ok) { this.busy = false; this.show(response?.reason || "The lock resists.", [["Step away", () => this.closePanel()]], door.label); return; }
      result = response.roll;
    } else {
      result = d20Check(bonus, dc);
      if (!force) { inv.lockpick--; if (!inv.lockpick) delete inv.lockpick; }
      this.g.social.renderInv(); this.g.save();
    }
    this.g.dice.die(() => actor.chest(new THREE.Vector3()), result, { label: "TIER 3 " });
    this.g.log(`Tier 3 lockpick: ${describe(result)}`, result.success ? "crit" : "fail");
    this.busy = false;
    if (result.success) await this.enterProperty(door, actor);
    else this.guardDialogue(door, actor);
  }
  guardDialogue(door, actor = this.owner) {
    this.show("A watchman catches your hand at the iron latch. ‘Give me a reason not to take you in.’", [
      ["Explain yourself · Persuasion DC 15", () => this.answerGuard(door, actor, "persuade")],
      ["Claim city business · Deception DC 17", () => this.answerGuard(door, actor, "deceive")],
      ["Pay a 20 gold fine", () => this.answerGuard(door, actor, "fine")],
      ["Back away with a warning", () => this.answerGuard(door, actor, "leave")],
      ["Draw your weapon", () => this.answerGuard(door, actor, "fight")],
    ], "Marrowgate Watch");
  }
  async answerGuard(door, actor, choice) {
    if (this.busy) return;
    this.busy = true; this.closePanel();
    let response;
    if (this.g.social.net) response = await this.g.social.houseAction("guard_reply", door, actor, { choice });
    else {
      const state = this.g.social.actorState(actor);
      const r = this.record(door); let attack = choice === "fight", line = "";
      if (choice === "fine" && state.gold >= 20) { state.gold -= 20; line = "The watchman accepts the fine and sends you on."; }
      else if (choice === "leave") { r.guardWarnings = (r.guardWarnings || 0) + 1; attack = r.guardWarnings > 1; line = attack ? "The watchman recognizes a repeat offender. To arms!" : "The watchman gives you one warning."; }
      else if (choice === "persuade" || choice === "deceive") {
        const dc = choice === "persuade" ? 15 : 17;
        const bonus = this.g.dialogueCheckBonus({ abilities: ["Charisma"], skill: choice === "persuade" ? "persuasion" : "deception" }, actor);
        const roll = d20Check(bonus, dc); attack = !roll.success;
        line = attack ? "The watchman sees through your story. To arms!" : "The watchman accepts your explanation.";
        this.g.dice.die(() => actor.chest(new THREE.Vector3()), roll, { label: "WATCH " });
      } else { attack = true; line = "The watchman draws steel!"; }
      response = { ok: true, attack, line };
      this.g.save();
    }
    this.busy = false;
    if (!response?.ok) { this.g.toast("The watch", response?.reason || "The guard moves on."); return; }
    this.g.toast("The watch", response.line);
    if (response.attack) this.g.social.callGuards(actor);
  }
  openAgent() {
    const actor = this.owner;
    const owned = HOUSE_LOTS.find(l => { const r = this.g.state.cityHouses[l.id]; return r?.characterId && r.ownerSlot === this.slot && (!this.g.social.net || r.ownerUserId === this.g.social.userId); });
    this.show(owned ? `Your deed is registered to ${owned.name}. Each account may hold one deed per local player.` : "Four vacant houses are on the city rolls. Tour any of them before buying; abandoned chests are sold as found.", [
      ...HOUSE_LOTS.map(l => {
        const r = this.g.state.cityHouses[l.id];
        return [`${l.name} · ${r?.characterId ? `Owned by ${r.ownerName || "another"}` : `${l.price} gold`}`, () => this.offerProperty(l)];
      }),
      ["Leave the office", () => this.closePanel()],
    ], "Estate Agent · Marrowgate");
  }
  offerProperty(lot) {
    const door = this.g.world.cityDoors.find(d => d.id === lot.id), r = this.record(door);
    const state = this.g.social.actorState(this.owner);
    if (r.characterId) { this.show("That deed has already been signed.", [["Back to listings", () => this.openAgent()]], "Estate Agent"); return; }
    const existing = HOUSE_LOTS.find(l => this.g.state.cityHouses[l.id]?.characterId && this.g.state.cityHouses[l.id]?.ownerSlot === this.slot && (!this.g.social.net || this.g.state.cityHouses[l.id]?.ownerUserId === this.g.social.userId));
    if (existing) { this.show(`This player slot already holds ${existing.name}. One deed each.`, [["Back to listings", () => this.openAgent()]], "Estate Agent"); return; }
    this.show(`${lot.name}: ${lot.price} gold, with a tier 3 lock fitted on transfer. Gold on hand: ${state.gold || 0}.`, [
      [`Sign deed · ${lot.price} gold`, () => this.purchase(door)],
      ["Back to listings", () => this.openAgent()],
    ], "Estate Agent");
  }
  async purchase(door) {
    if (this.busy) return;
    this.busy = true;
    const state = this.g.social.actorState(this.owner);
    let result;
    if (this.g.social.net) result = await this.g.social.houseAction("purchase", door, this.owner);
    else if (state.gold < door.price) result = { reason: `You need ${door.price} gold.` };
    else {
      const existing = HOUSE_LOTS.some(l => this.g.state.cityHouses[l.id]?.characterId && this.g.state.cityHouses[l.id]?.ownerSlot === this.slot);
      if (existing || this.record(door).characterId) result = { reason: "A deed is already held for this character or plot." };
      else {
        state.gold -= door.price;
        const r = this.record(door);
        Object.assign(r, { characterId: this.characterId, ownerSlot: this.slot, ownerName: this.owner.name || this.g.sheet.name, ownerUserId: null, unbarredUntil: 0, chest: r.chest || {}, decor: r.decor || [] });
        door.leaf.children[0].material.color.setHex(0x593a27);
        if (this.slot === 2 && this.g.p2SaveId) (this.g.p2State.cityHouses ||= {})[door.id] = structuredClone(r);
        this.g.save(); result = { ok: true, house: { id: door.id, ...r } };
      }
    }
    this.busy = false;
    if (!result?.ok) { this.show(result?.reason || "The deed was not signed.", [["Back to listings", () => this.openAgent()]], "Estate Agent"); return; }
    if (result.house) this.onHouseUpdate(result.house);
    this.show(`The deed for ${door.label} is yours. Your key opens the new tier 3 lock; you can unbar it for visitors from inside.`, [["Thank you", () => this.closePanel()]], "Estate Agent");
    this.g.social.renderSheet();
  }
  nearest(p) {
    let best = null, distance = 3.2;
    for (const it of [this.exitIt, this.chestIt, this.decorIt, this.boltIt]) {
      if (it.hidden) continue;
      if (it === this.boltIt && !this.propertyOwner) continue;
      const d = it.pos.distanceTo(p);
      if (d < distance) { distance = d; best = { type: "it", it, label: this.g.itLabel(it) }; }
    }
    return best;
  }
  async propertyAction(op, extra = {}) {
    const door = this.active;
    if (!door) return { reason: "You are outside." };
    if (this.g.social.net) {
      const result = await this.g.social.houseAction(op, door, this.owner, extra);
      if (result?.house) this.onHouseUpdate(result.house);
      if (result?.chest) this.record(door).chest = result.chest;
      if (result?.reason) this.g.toast(door.label, result.reason);
      return result;
    }
    const r = this.record(door), state = this.g.social.actorState(this.owner), inv = state.inv;
    if (op === "loot") {
      if (r.characterId || r.lootTaken) return { reason: "The chest is empty." };
      const key = ["silver_ring", "lantern_oil", "lockpick", "road_map"][HOUSE_LOTS.findIndex(l => l.id === door.id)];
      if (!fitCount(inv, this.owner.sheet || this.g.sheet, key)) return { reason: "Your pack is full." };
      inv[key] = (inv[key] || 0) + 1; r.lootTaken = true;
      this.g.social.renderInv(); this.g.save(); return { ok: true, item: key };
    }
    if (!this.propertyOwner) return { reason: "Only the deed holder can do that." };
    if (op === "unbar" || op === "bar") r.unbarredUntil = op === "unbar" ? Date.now() + 60000 : 0;
    if (op === "deposit" || op === "withdraw") {
      const key = extra.key;
      if (!ITEMS[key]) return { reason: "Unknown item." };
      r.chest ||= {};
      if (op === "deposit") {
        if ((inv[key] || 0) <= (state.equipment?.[ITEMS[key].slot] === key ? 1 : 0)) return { reason: "No loose copy to store." };
        inv[key]--; if (!inv[key]) delete inv[key]; r.chest[key] = (r.chest[key] || 0) + 1;
      } else {
        if (!r.chest[key] || !fitCount(inv,this.owner.sheet || this.g.sheet,key)) return { reason: "Unavailable or too heavy." };
        r.chest[key]--; if (!r.chest[key]) delete r.chest[key]; inv[key] = (inv[key] || 0) + 1;
      }
      this.g.social.renderInv();
    }
    if (op === "decor") {
      r.decor ||= [];
      const { action, decorType, index, dx, dz, key } = extra;
      if (action === "display") {
        if (!ITEMS[key] || r.decor.length >= 12 || (inv[key] || 0) <= (state.equipment?.[ITEMS[key].slot] === key ? 1 : 0)) return { reason: "That item cannot be displayed." };
        inv[key]--; if (!inv[key]) delete inv[key];
        r.decor.push({ type: "display", itemKey: key, x: 0, z: -1.3, rot: 0 });
        this.g.social.renderInv();
      }
      else if (action === "add") { if (r.decor.length >= 12) return { reason: "The room is full." }; r.decor.push({ type: decorType, x: 0, z: -1.3, rot: 0 }); }
      else if (!r.decor[index]) return { reason: "Furnishing missing." };
      else if (action === "remove") {
        const removed = r.decor[index];
        if (removed.type === "display" && ITEMS[removed.itemKey]) {
          if (!fitCount(inv,this.owner.sheet || this.g.sheet,removed.itemKey)) return { reason: "Your pack is too full." };
          inv[removed.itemKey] = (inv[removed.itemKey] || 0) + 1;
          this.g.social.renderInv();
        }
        r.decor.splice(index, 1);
      }
      else if (action === "turn") r.decor[index].rot = ((r.decor[index].rot || 0) + 1) % 4;
      else if (action === "move") { r.decor[index].x = Math.max(-2.3, Math.min(2.3, r.decor[index].x + dx * .45)); r.decor[index].z = Math.max(-2.3, Math.min(1, r.decor[index].z + dz * .45)); }
      this.renderDecor();
    }
    if (this.slot === 2 && this.g.p2SaveId) (this.g.p2State.cityHouses ||= {})[door.id] = structuredClone(r);
    this.g.save(); return { ok: true, chest: r.chest };
  }
  openChest() {
    const door = this.active, r = this.record(door);
    if (!r.characterId) {
      this.show(r.lootTaken ? "The abandoned chest is empty." : "A dusty chest rests in the vacant house. Its contents are unclaimed.", [
        ...(r.lootTaken ? [] : [["Search the chest", async () => { const result = await this.propertyAction("loot"); this.show(result.ok ? `You found ${ITEMS[result.item]?.name || "an item"}.` : result.reason, [["Close", () => this.closePanel()]], "Old Chest"); }]]),
        ["Close", () => this.closePanel()],
      ], "Old Chest"); return;
    }
    if (!this.propertyOwner) { this.show("The owner's chest is secured with a separate lock.", [["Leave it", () => this.closePanel()]], "House Chest"); return; }
    const chest = r.chest || {};
    this.show(`Private storage · ${Object.values(chest).reduce((a,b) => a+b,0)} items`, [
      ["Store from pack", () => this.chestList("deposit")],
      ["Take from chest", () => this.chestList("withdraw")],
      [r.unbarredUntil > Date.now() ? "Bar door for visitors" : "Unbar door for visitors · 60 seconds", async () => { const result = await this.propertyAction(r.unbarredUntil > Date.now() ? "bar" : "unbar"); this.g.toast(door.label,result.ok ? (r.unbarredUntil > Date.now() ? "Door unbarred" : "Door barred") : result.reason); this.openChest(); }],
      ["Close", () => this.closePanel()],
    ], "House Chest");
  }
  async useBolt() {
    if (!this.active || !this.propertyOwner || this.busy) return;
    this.busy = true;
    const isOpen = this.record(this.active).unbarredUntil > Date.now();
    const result = await this.propertyAction(isOpen ? "bar" : "unbar");
    this.busy = false;
    if (result.ok) this.g.toast(this.active.label, isOpen ? "Inside bolt barred" : "Door unbarred for visitors for one minute");
  }
  chestList(op, page = 0) {
    const r = this.record(this.active), bag = op === "deposit" ? this.g.social.actorInv(this.owner) : r.chest || {};
    const keys = Object.keys(bag).filter(k => ITEMS[k] && bag[k] > 0);
    const part = keys.slice(page * 4, page * 4 + 4);
    this.show(op === "deposit" ? "Choose one item to store." : "Choose one item to take.", [
      ...part.map(key => [`${ITEMS[key].name} ×${bag[key]}`, async () => { const result = await this.propertyAction(op, { key }); if (result.ok) this.g.toast(this.active.label, `${op === "deposit" ? "Stored" : "Took"} ${ITEMS[key].name}`); this.chestList(op,page); }]),
      ...(keys.length > (page + 1) * 4 ? [["More items", () => this.chestList(op,page+1)]] : []),
      ...(page ? [["Previous", () => this.chestList(op,page-1)]] : []),
      ["Back", () => this.openChest()],
    ], "House Chest");
  }
  openDecor() {
    if (!this.propertyOwner) { this.show("Only the deed holder can arrange this room.", [["Close", () => this.closePanel()]], this.active.label); return; }
    const n = this.record(this.active).decor?.length || 0;
    this.show(`Arrange your home · ${n}/12 placed furnishings`, [
      ["Place furnishing", () => this.decorCatalog()],
      ["Move or turn furnishing", () => this.decorSelect("move")],
      ["Put furnishing away", () => this.decorSelect("remove")],
      ["Close", () => this.closePanel()],
    ], this.active.label);
  }
  decorCatalog() {
    this.show("Choose a furnishing. It will appear beside the hearth; move it afterward.", [
      ...["chair","table","shelf","rug","lamp","chest"].map(type => [`Place ${type}`, async () => { await this.propertyAction("decor", { action: "add", decorType: type }); this.openDecor(); }]),
      ["Display an item from your pack", () => this.displayList()],
      ["Back", () => this.openDecor()],
    ], "Furnishings");
  }
  displayList(page = 0) {
    const state = this.g.social.actorState(this.owner), keys = Object.keys(state.inv || {}).filter(k => ITEMS[k] && state.inv[k] > (state.equipment?.[ITEMS[k].slot] === k ? 1 : 0));
    this.show("One item will leave your pack until you put the display away.", [
      ...keys.slice(page*5,page*5+5).map(key => [`Display ${ITEMS[key].name}`, async () => { await this.propertyAction("decor", { action: "display", key }); this.openDecor(); }]),
      ...(keys.length > (page+1)*5 ? [["More items", () => this.displayList(page+1)]] : []),
      ...(page ? [["Previous", () => this.displayList(page-1)]] : []),
      ["Back", () => this.decorCatalog()],
    ], "Display Item");
  }
  decorSelect(action, page = 0) {
    const list = this.record(this.active).decor || [];
    this.show(action === "remove" ? "Choose what to put away." : "Choose a furnishing to move.", [
      ...list.slice(page*5,page*5+5).map((d,i) => [`${d.type === "display" ? ITEMS[d.itemKey]?.name || "item" : d.type} ${page*5+i+1}`, () => action === "remove" ? this.removeDecor(page*5+i) : this.moveDecor(page*5+i)]),
      ...(list.length > (page+1)*5 ? [["More", () => this.decorSelect(action,page+1)]] : []),
      ["Back", () => this.openDecor()],
    ], "Furnishings");
  }
  async removeDecor(index) { await this.propertyAction("decor", { action: "remove", index }); this.openDecor(); }
  moveDecor(index) {
    const d = this.record(this.active).decor?.[index]; if (!d) { this.openDecor(); return; }
    this.show(`${d.type} · move in small steps, or rotate it.`, [
      ["← Left", () => this.shiftDecor(index,-1,0)], ["→ Right", () => this.shiftDecor(index,1,0)],
      ["↑ Toward back wall", () => this.shiftDecor(index,0,-1)], ["↓ Toward door", () => this.shiftDecor(index,0,1)],
      ["Rotate", async () => { await this.propertyAction("decor", { action: "turn", index }); this.moveDecor(index); }],
      ["Done", () => this.openDecor()],
    ], "Arrange Room");
  }
  async shiftDecor(index,dx,dz) { await this.propertyAction("decor", { action: "move", index, dx, dz }); this.moveDecor(index); }
  openAndEnter(door, actor = this.owner) {
    if (this.active || this.transition || !actor) return;
    this.busy = true;
    this.doorMotion = null;
    door.collider.disabled = true;
    const walkThrough = !!door.residential;
    this.transition = {
      kind: "enter", door, actor, walkThrough, elapsed: 0, index: 0,
      points: walkThrough ? [
        this.doorPoint(door, door.doorX, door.depth / 2 + .62),
        this.doorPoint(door, door.doorX, door.depth / 2 - .62),
      ] : [],
    };
  }
  doorPoint(door, x, z) {
    const M = this.g.world.sites.marrowgate, c = Math.cos(door.rot), s = Math.sin(door.rot);
    return new THREE.Vector3(M.x + door.cx + c*x + s*z, M.flatH, M.z + door.cz - s*x + c*z);
  }
  closeDoor(door) {
    this.doorMotion = { door, from: door.leaf.rotation.y, elapsed: 0, duration: .34 };
  }
  updateTransition(dt) {
    const transition = this.transition;
    if (!transition) return false;
    transition.elapsed += dt;
    const opening = Math.min(1, transition.elapsed / .28);
    const eased = opening * opening * (3 - 2 * opening);
    transition.door.leaf.rotation.y = transition.door.rot - 1.05 * eased;
    if (!transition.walkThrough) {
      if (transition.elapsed >= .28) {
        this.transition = null;
        this.busy = false;
        if (transition.kind === "enter") this.enter(transition.door);
        else this.completeLeave(transition);
        this.closeDoor(transition.door);
      }
      return true;
    }
    if (!this.g.running || !transition.actor) return true;
    // Let the leaf clear the opening before the guided walk begins.
    if (opening < .8) return true;
    const actor = transition.actor, target = transition.points[transition.index];
    if (!target) {
      this.transition = null;
      this.busy = false;
      if (transition.kind === "enter") this.enter(transition.door, false, { keepPosition: true });
      else this.completeLeave(transition);
      this.closeDoor(transition.door);
      return true;
    }
    if (Math.hypot(target.x - actor.pos.x, target.z - actor.pos.z) < .14) {
      transition.index++;
      return true;
    }
    const distance = Math.hypot(target.x - actor.pos.x, target.z - actor.pos.z);
    this.g.combat.move(actor, target.x - actor.pos.x, target.z - actor.pos.z,
      Math.min(actor.stats.speed, distance / Math.max(dt, .001)), dt);
    return true;
  }
  async pick(door, actor = this.owner) {
    if (this.busy) return;
    const g = this.g, inv = g.social.actorInv(actor);
    if (!inv.lockpick) { this.show("You need a lockpick to work this latch.", [["Step away", () => this.closePanel()]], door.label); return; }
    this.busy = true;
    this.closePanel();
    const bonus = g.dialogueCheckBonus({ abilities: ["Dexterity"], skill: "sleight of hand" }, actor);
    const dc = door.landmark ? 15 : 12;
    let rolls = 0;
    const result = await g.hold.run(`${door.label} · pick lock`, async () => {
      if (!g.social.net) return d20Check(bonus, dc);
      const message = await g.social.rollCityLock(door, rolls++ > 0);
      return message.roll || { nat: 1, bonus, dc, total: 1 + bonus, success: false, crit: false, fumble: true, margin: 1 + bonus - dc, adv: 0, reason: message.reason };
    }, (roll) => roll.reason || describe(roll), `d20 ${bonus >= 0 ? "+" : ""}${bonus} · DC ${dc}`, actor);
    if (!g.social.net) { inv.lockpick--; if (!inv.lockpick) delete inv.lockpick; g.social.renderInv(); }
    if (result.reason) { this.show(result.reason, [["Step away", () => this.closePanel()]], door.label); this.busy = false; return; }
    g.dice.die(() => actor.chest(new THREE.Vector3()), result, { label: "LOCK " });
    g.log(`Lockpick: ${describe(result)}`, result.success ? "crit" : "fail");
    if (result.success) {
      this.record(door).unlocked = true;
      door.leaf.children[0].material.color.setHex(0x6c452c);
      g.toast("Lock opened", door.label);
      g.save();
      this.busy = false;
      this.openAndEnter(door, actor);
      return;
    } else {
      g.toast("The lock holds", result.nat <= 8 ? "The watch heard the attempt" : "Your pick snapped");
      if (result.nat <= 8) g.social.callGuards();
      g.save();
    }
    this.busy = false;
  }
  box(w, h, d, x, y, z, color, roughness = .82) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness }));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    this.group.add(m); return m;
  }
  disposeRoom() {
    if (!this.group) return;
    this.group.removeFromParent();
    const seen = new Set();
    this.group.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const material of materials) if (!seen.has(material)) { seen.add(material); material.dispose(); }
    });
    this.group = null;
    this.decorGroup = null;
  }
  themeDetails(door, hw, hd) {
    const theme = door.theme || (door.landmark === "Compact Counting-House" ? "ledger" : door.landmark === "Wayfinder Chapel" ? "chapel" : door.landmark === "Smithy" ? "smith" : door.landmark === "The Lantern Inn" ? "inn" : ["weaver","herbalist","scribe","merchant","watchman"][Number(door.id.split("_").pop()) % 5]);
    const colors = { weaver: 0x9c563f, herbalist: 0x6c8062, scribe: 0x567085, merchant: 0xa07b43, watchman: 0x765758, ledger: 0x6d7180, chapel: 0x8b876f, smith: 0x595a5d, inn: 0x9e6949 };
    const accent = colors[theme] || 0x8b6948;
    // Limewashed lower wall, carved cornice, hand-painted border and crossbeams.
    for (const z of [-hd + .16, hd - .16]) {
      this.box(Math.max(1,hw*2-.5), .52, .025, 0, .45, z, 0x70533c);
      this.box(hw*2-.35, .055, .04, 0, .77, z, accent);
      for (let x = -hw+.55; x < hw-.3; x += .7) this.box(.14,.09,.045,x,3.43,z,accent);
    }
    for (const x of [-hw+.17,hw-.17]) {
      this.box(.04,.52,hd*2-.55,x,.45,0,0x70533c);
      this.box(.045,.06,hd*2-.55,x,.79,0,accent);
    }
    for (const z of [-hd/2, hd/2]) this.box(hw*2-.4,.16,.2,0,3.83,z,0x4c3023);
    // A stone firebox and a hearth shelf anchor the otherwise bare rooms.
    this.box(1.25,1.2,.22,-hw+.3,.6,-hd+1.15,0x635b50);
    this.box(1.52,.16,.82,-hw+.51,.12,-hd+1.15,0x8d8270);
    this.box(.7,.45,.08,-hw+.45,.48,-hd+1.15,0x231c19);
    this.box(.62,.11,.3,-hw+.45,.4,-hd+1.15,0xb35b32);
    this.box(1.5,.16,.35,-hw+.36,1.34,-hd+1.15,0x69472e);
    for (let i=0;i<3;i++) this.box(.13,.16,.13,-hw+.05,1.46,-hd+.75+i*.34,[0xb89461,0x7a8e75,0xb17852][i]);
    // Shelves, shutters and period tools change with the former occupant.
    const shelfX = hw-.43, shelfZ = -hd+1.2;
    for (let y of [.58,1.27,1.96]) this.box(.55,.1,1.8,shelfX,y,shelfZ,0x65472f);
    for (let i=0;i<9;i++) {
      const z=shelfZ-.72+(i%5)*.35, y=i<5?.85:1.55;
      if (theme==="herbalist") {
        this.box(.18,.25+(i%3)*.08,.18,shelfX,y,z,[0x9c855f,0x798767,0x876a56][i%3]);
        this.box(.2,.035,.2,shelfX,y+.15+(i%3)*.04,z,0xc2a77d);
      } else if (theme==="smith") this.box(.13,.28,.12,shelfX,y,z,0x565757);
      else this.box(.14,.28+(i%3)*.06,.21,shelfX,y,z,[0x76513c,0x3f5a64,0x8a4d43,0x7b683f][i%4]);
    }
    if (theme==="weaver") {
      for (let i=0;i<6;i++) this.box(.08,1.4,.09,hw-.28,1.6,-hd+2.2+i*.25,i%2?0xb87c4e:0x8e3d39);
      this.box(.55,.1,1.8,hw-.38,2.36,-hd+2.8,0x58402d);
      for (const y of [.36,1.42]) this.box(.13,.13,1.4,-hw+.9,y,-hd+2.1,0x60442e);
      for (const z of [-hd+1.5,-hd+2.7]) this.box(.13,1.35,.13,-hw+.9,.75,z,0x60442e);
      for (let i=0;i<8;i++) this.box(.012,.82,.012,-hw+.89,.92,-hd+1.56+i*.15,i%2?0xa46148:0xd0ad74);
    } else if (theme==="scribe" || theme==="ledger") {
      for (let i=0;i<4;i++) this.box(.36,.018,.28,hw-.5, .95+i*.12, .35+i*.19,0xd9c8a2);
      this.box(.16,.28,.16,hw-.44,1.06,1.35,0x343a3b);
      this.box(1.2,.12,.55,hw-1.12,.78,hd-1.2,0x68482f);
      this.box(.37,.018,.3,hw-1.25,.86,hd-1.2,0xe0d0a7);
      this.box(.07,.32,.07,hw-.78,1.04,hd-1.2,0xb0a282);
    } else if (theme==="watchman") {
      this.box(.7,.95,.12,hw-.26,1.8,.8,0x69717a);
      this.box(.25,1.2,.08,hw-.22,1.7,1.5,0xb6a784);
    } else if (theme==="chapel") {
      this.box(.85,1.15,.08,0,2.25,-hd+.2,0xb8a97d);
      this.box(.15,1.8,.08,0,2.25,-hd+.15,0x756e57);
    } else if (theme==="inn" || theme==="merchant") {
      for (let i=0;i<3;i++) this.box(.2,.38,.2,hw-.42,1.02+i*.07,.6+i*.31,0xae754c);
      for (let i=0;i<4;i++) this.box(.38,.38,.38,-hw+.74+(i%2)*.42,.22,hd-1.2-Math.floor(i/2)*.42,0x8a633e);
      this.box(.8,.08,.45,-hw+1.13,.45,hd-1.45,0x5c3b26);
    } else if (theme==="herbalist") {
      for (let i=0;i<5;i++) {
        this.box(.025,.6,.025,-hw+1+i*.36,2.65,-hd+.5,0x826543);
        this.box(.24,.3,.24,-hw+1+i*.36,2.25,-hd+.5,[0x758d59,0x8c9566,0x566d52][i%3]);
      }
      this.box(.65,.17,.65,hw-1.2,.7,hd-1.15,0x897b65);
      this.box(.38,.28,.38,hw-1.2,.91,hd-1.15,0x747065);
    }
    // Small rush baskets and a patterned hanging cloth make the room lived in.
    for (let i=0;i<3;i++) this.box(.36,.28,.34,-hw+.65+i*.4,.14,hd-.5,0x9b7950);
    this.box(.82,1.4,.025,0,2.1,-hd+.18,accent);
    this.box(.62,.12,.035,0,2.58,-hd+.16,0xc9ab6f);
  }
  renderDecor() {
    if (!this.group || !this.active?.property || this.sharedRoom) return;
    if (this.decorGroup) {
      this.group.remove(this.decorGroup);
      this.decorGroup.traverse(o => { o.geometry?.dispose(); if (o.material) o.material.dispose(); });
    }
    const group = new THREE.Group(); this.decorGroup = group; this.group.add(group);
    for (const item of this.record(this.active).decor || []) {
      if (!item || !["chair","table","shelf","rug","lamp","chest","display"].includes(item.type)) continue;
      const x = Math.max(-2.3,Math.min(2.3,Number(item.x)||0)), z = Math.max(-2.3,Math.min(1,Number(item.z)||0));
      const piece = new THREE.Group(); piece.position.set(x,0,z); piece.rotation.y = ((item.rot||0)%4)*Math.PI/2; group.add(piece);
      const box = (w,h,d,px,py,pz,c) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({ color:c,roughness:.8 })); mesh.position.set(px,py,pz); mesh.castShadow=true; piece.add(mesh); };
      if (item.type==="rug") { box(1.55,.03,1.05,0,.045,0,0x935044); box(1.35,.01,.85,0,.07,0,0xb68b5b); }
      if (item.type==="chair") { box(.65,.14,.6,0,.52,0,0x765137); box(.65,.75,.12,0,.9,-.25,0x684831); for(const a of [-.24,.24]) for(const b of [-.2,.2]) box(.11,.5,.11,a,.25,b,0x59402c); }
      if (item.type==="table") { box(1.45,.15,.95,0,.8,0,0x855e3c); for(const a of [-.6,.6]) for(const b of [-.35,.35]) box(.13,.76,.13,a,.38,b,0x60432d); box(.25,.04,.25,.32,.9,0,0xd0b77f); }
      if (item.type==="shelf") { for(const y of [.4,1,1.6]) box(1.15,.1,.35,0,y,0,0x755137); for(const a of [-.5,.5]) box(.1,1.7,.35,a,.85,0,0x533c2a); for(let i=0;i<4;i++) box(.15,.28,.2,-.34+i*.22,1.22,0,[0x6b4d41,0x496174,0x877042,0xa05a48][i]); }
      if (item.type==="lamp") { box(.28,.13,.28,0,.1,0,0x5b4931); box(.1,1.16,.1,0,.7,0,0x7b6544); box(.45,.22,.42,0,1.32,0,0xe2b05f); }
      if (item.type==="chest") { box(.95,.55,.6,0,.3,0,0x715135); box(1,.13,.65,0,.65,0,0x503723); for(const a of [-.32,.32]) box(.08,.65,.68,a,.36,0,0xb3975e); }
      if (item.type==="display") {
        const color = ITEMS[item.itemKey]?.color || "#bf9a64";
        box(.5,.17,.5,0,.1,0,0x65503b);
        if (ITEMS[item.itemKey]?.weapon) { box(.09,.76,.1,0,.56,0,color); box(.38,.075,.1,0,.29,0,0xc9ad77); }
        else { box(.27,.35,.26,0,.37,0,color); box(.31,.07,.29,0,.57,0,0xd5bc86); }
      }
    }
  }
  otherInterior() { return this.slot === 2 ? this.g.interiors : this.g.interiors2; }
  worldPoint(x,z,y=0) {
    if (!this.inPlace) return new THREE.Vector3(this.anchorX+x,y,BASE_Z+z);
    const c=Math.cos(this.active.rot),s=Math.sin(this.active.rot);
    return new THREE.Vector3(this.group.position.x+c*x+s*z,this.group.position.y+y,this.group.position.z-s*x+c*z);
  }
  releaseRoom() {
    const other = this.otherInterior();
    if (this.group && other?.active?.id === this.active?.id && other.group === this.group) {
      if (this.resident && !other.resident) { other.resident = this.resident; this.resident = null; }
      if (this.hostile && !other.hostile) { other.hostile = this.hostile; other.hostile.target = other.owner; this.hostile = null; }
      if (this.colliders.length) other.colliders = this.colliders;
      if (this.decorGroup) other.decorGroup = this.decorGroup;
      other.sharedRoom = false;
      this.group = null; this.decorGroup = null; this.colliders = []; this.sharedRoom = false;
      return;
    }
    this.disposeRoom();
    for (const c of this.colliders) this.g.world.col.remove(c);
    this.colliders = []; this.sharedRoom = false;
  }
  placeInteractions(door) {
    const { hw, hd } = this.room;
    const sw=this.inPlace&&(door.face==="+x"||door.face==="-x");
    this.g.world[this.slot === 2 ? "activeInterior2" : "activeInterior"] = {
      x:this.inPlace?this.group.position.x:this.anchorX,z:this.inPlace?this.group.position.z:BASE_Z,
      hw:sw?hd:hw,hd:sw?hw:hd,name:door.label,inPlace:this.inPlace };
    this.exitIt.pos.copy(this.worldPoint(this.inPlace?door.doorX:0,hd-1.08)); this.exitIt.hidden = false;
    this.chestIt.pos.copy(this.worldPoint(this.inPlace?-hw+1.08:hw-1.05,-hd+1.35)); this.chestIt.hidden = !door.property;
    this.decorIt.pos.copy(this.worldPoint(-hw+.65,.3)); this.decorIt.hidden = !door.property;
    this.boltIt.pos.copy(this.worldPoint(.86,hd-1.08)); this.boltIt.hidden = !door.property;
  }
  buildInPlace(door) {
    const w=door.width-.42,d=door.depth-.42,hw=w/2,hd=d/2;
    this.room={w,d,hw,hd};
    const M=this.g.world.sites.marrowgate;
    this.group=new THREE.Group();
    this.group.position.set(M.x+door.cx,M.flatH+.35,M.z+door.cz);
    this.group.rotation.y=door.rot;
    this.g.scene.add(this.group);
    const furniture=(bw,bh,bd,x,y,z,color) => {
      this.box(bw,bh,bd,x,y,z,color);
      const at=this.worldPoint(x,z),c=this.g.world.col.box(at.x,at.z,bw/2,bd/2,door.rot,bh,this.group.position.y);
      c.top=this.group.position.y+y+bh/2;
      this.colliders.push(c);
    };
    const palette={weaver:0x9c563f,herbalist:0x6c8062,scribe:0x567085,merchant:0xa07b43};
    const accent=palette[door.theme]||0x8c6848;
    for(let i=0,z=-hd+.2;z<hd-.15;i++,z+=.4)
      this.box(w-.12,.018,.35,0,.012,z,i%4===0?0x9c7650:0x795637);
    // Lower wall trim sits below the real window apertures.
    for(const z of [-hd+.03,hd-.03]) {
      this.box(w-.2,.28,.055,0,.18,z,0x67482e);
      this.box(w-.2,.055,.075,0,.34,z,accent);
    }
    for(const x of [-hw+.03,hw-.03]) {
      this.box(.055,.28,d-.2,x,.18,0,0x67482e);
      this.box(.075,.055,d-.2,x,.34,0,accent);
    }
    // Furniture leaves the stair on the right clear.
    furniture(1.12,.12,.65,-hw+1.05,.7,hd-1.25,0x755135);
    for(const x of [-hw+.58,-hw+1.52]) for(const z of [hd-1.52,hd-.98])
      this.box(.11,.68,.11,x,.34,z,0x583d2a);
    this.box(.83,.08,.52,-hw+.82,1.75,-hd+.35,0x76523b);
    for(let i=0;i<4;i++) this.box(.12,.3,.16,-hw+.54+i*.18,1.94,-hd+.35,[0x856c4e,0x526960,0x9a7052,0x777045][i]);
    this.box(1.15,.025,.8,-.35,.026,.55,0x8c4d3f);
    if(door.property) {
      furniture(.96,.55,.62,-hw+1.08,.28,-hd+1.35,0x67492d);
      this.box(1.02,.12,.67,-hw+1.08,.62,-hd+1.35,0x4d3324);
      this.renderDecor();
    }
    if(door.floors>1) {
      // The city shell owns the structural slab and stairs. This bedroom is
      // visible through its upper windows from the street.
      this.box(1.55,.18,1.05,-hw+1.28,2.91,-hd+1.2,0x705039);
      this.box(1.43,.07,.95,-hw+1.28,3.04,-hd+1.2,0xb49a72);
      this.box(.82,.11,.42,-hw+1.05,3.55,hd-1.2,0x68492f);
      this.box(.58,.45,.08,-hw+1.05,3.8,hd-1.38,0x8e6849);
    }
    const lamp=new THREE.PointLight(0xffcb8a,9,Math.max(w,d)*1.8,1.5);
    lamp.position.set(-.4,2.35,0);this.group.add(lamp);
    if(door.floors>1) {
      const upperLamp=new THREE.PointLight(0xffd9a7,6,Math.max(w,d)*1.2,1.5);
      upperLamp.position.set(-.5,4.35,0);this.group.add(upperLamp);
    }
    this.placeInteractions(door);
  }
  build(door) {
    const index = Number(door.id.slice("marrow_door_".length));
    this.anchorX = (this.slot === 2 ? -1400 : -900) - index * 40;
    this.releaseRoom();
    const other = this.otherInterior();
    if (other?.active?.id === door.id && other.group) {
      this.anchorX = other.anchorX;
      this.group = other.group; this.room = other.room; this.inPlace=other.inPlace; this.sharedRoom = true;
      this.placeInteractions(door);
      return;
    }
    this.inPlace=!!door.residential;
    if(this.inPlace) { this.buildInPlace(door); return; }
    const w = Math.max(3.2, door.width - 1.15), d = Math.max(3.2, door.depth - 1.15);
    const hw = w / 2, hd = d / 2, h = 4.2;
    this.room = { w, d, hw, hd };
    this.group = new THREE.Group(); this.group.position.set(this.anchorX, 0, BASE_Z); this.g.scene.add(this.group);
    const stone = door.landmark === "Wayfinder Chapel" || door.landmark === "The Warden's Keep" || door.landmark === "Compact Counting-House";
    const wall = stone ? 0xb6ad99 : 0xbfae8f, trim = stone ? 0x77736a : 0x593c29;
    this.box(w, .24, d, 0, -.12, 0, stone ? 0x77736a : 0x5d3a26);
    // Individually lit planks and seams give the floor texture without an external asset.
    for (let i = 0, z = -hd + .22; z < hd - .05; i++, z += .44) {
      this.box(w - .12, .018, .39, 0, .018, z, stone ? (i % 3 ? 0x89847a : 0x9b9589) : (i % 3 ? 0x815b3b : 0x97704b));
    }
    this.box(w, .25, d, 0, h, 0, stone ? 0x625d54 : 0x503d2c);
    this.box(.24, h, d, -hw, h / 2, 0, wall);
    this.box(.24, h, d, hw, h / 2, 0, wall);
    this.box(w, h, .24, 0, h / 2, -hd, wall);
    this.box(w, h, .24, 0, h / 2, hd, wall);
    for (const [x, z, cw, cd] of [[-hw, 0, .13, hd], [hw, 0, .13, hd], [0, -hd, hw, .13], [0, hd, hw, .13]]) {
      const c = this.g.world.col.box(this.anchorX + x, BASE_Z + z, cw, cd, 0, h);
      c.top = h; this.colliders.push(c);
    }
    for (const x of [-hw + .1, hw - .1]) for (const z of [-hd + .1, hd - .1]) this.box(.2, h, .2, x, h / 2, z, trim);
    for (const z of [-hd + .12, hd - .12]) {
      this.box(w, .17, .19, 0, .16, z, trim);
      this.box(w, .2, .2, 0, h - .18, z, trim);
    }
    for (const x of [-hw + .12, hw - .12]) {
      this.box(.19, .15, d, x, .15, 0, trim);
      this.box(.2, .2, d, x, h - .18, 0, trim);
    }
    // Door, bright window bays, and interior furniture keep each room readable.
    this.box(1.35, 2.5, .07, 0, 1.25, hd - .14, 0x3e291b);
    this.box(.1, .1, .08, .46, 1.2, hd - .2, 0xc5a367, .34);
    const glass = new THREE.MeshStandardMaterial({ color: 0xffd590, emissive: 0x9d6130, emissiveIntensity: .45, roughness: .17 });
    for (const x of [-hw + .7, hw - .7]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.35, 1.35), glass);
      win.position.set(x > 0 ? hw - .12 : -hw + .12, 2.25, 0); this.group.add(win);
      this.box(.1, 1.5, .12, x > 0 ? hw - .17 : -hw + .17, 2.25, 0, trim);
    }
    // Panelling, window muntins, a woven rug, and a warm wall sconce add close-up detail.
    for (const z of [-hd + .14, hd - .14]) for (let y = .85; y < h - .5; y += 1.05) this.box(w - .5, .045, .045, 0, y, z, trim);
    for (const x of [-hw + .18, hw - .18]) for (let z = -hd + .8; z < hd - .5; z += 1.15) this.box(.04, h - .65, .045, x, h / 2, z, trim);
    for (const x of [-hw + .65, hw - .65]) {
      this.box(.16, .08, .16, x, 3.13, 0, 0xb59355, .38);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffce7b, emissive: 0xff8b35, emissiveIntensity: 1.7 }));
      flame.position.set(x, 3.27, 0); this.group.add(flame);
    }
    this.box(Math.min(2.8, w - 1.2), .025, Math.min(1.7, d - 3), 0, .035, .45, stone ? 0x704a37 : 0x8b433a);
    this.box(Math.min(2.85, w - 1.15), .012, .06, 0, .052, .45 - Math.min(1.7, d - 3) / 2 + .12, 0xd8a86b);
    const furniture = door.landmark === "The Lantern Inn" ? "inn" : door.landmark === "Wayfinder Chapel" ? "chapel" : door.landmark === "Smithy" ? "smith" : "home";
    const addFurniture = (w, h, d, x, y, z, color) => {
      this.box(w, h, d, x, y, z, color);
      const c = this.g.world.col.box(this.anchorX + x, BASE_Z + z, w / 2, d / 2, 0, h);
      c.top = h; this.colliders.push(c);
    };
    if (door.property) {
      // Vacant plots keep their old trade's fittings and a few salvageable items.
      this.box(1.3,.12,.72,-hw+1.2,.14,-hd+1.95,0x776048);
      this.box(1.2,.025,.62,-hw+1.2,.22,-hd+1.95,0x9d8a68);
      this.box(.95,.56,.65,hw-1.05,.28,-hd+1.35,0x67492d);
      this.box(1,.13,.7,hw-1.05,.64,-hd+1.35,0x4d3324);
      for (const x of [hw-1.38,hw-.72]) this.box(.06,.67,.68,x,.34,-hd+1.35,0xb39059);
      this.box(.95,.1,.14,.31,1.4,hd-.24,0x89847c,.38);
      this.box(.12,.36,.15,.75,1.4,hd-.25,0xb2a174,.38);
    } else if (furniture === "chapel") {
      for (const z of [-1.1, .6]) for (const x of [-Math.min(2, hw - .9), Math.min(2, hw - .9)]) addFurniture(1.25, .72, .55, x, .36, z, 0x654930);
      addFurniture(2, 1.2, .9, 0, .6, -hd + 1, 0x9b907b);
    } else if (furniture === "inn") {
      for (const x of [-Math.min(2.4, hw - 1), Math.min(2.4, hw - 1)]) addFurniture(1.3, .75, 1.3, x, .38, -1, 0x69472f);
      addFurniture(Math.max(2, w - 1.3), 1.05, .65, 0, .52, -hd + .75, 0x573620);
    } else {
      const narrow = w < 5.2;
      const sideWidth = narrow ? .7 : Math.min(1.3, w * .23);
      addFurniture(sideWidth, .8, 1.05, -hw + .18 + sideWidth / 2, .4, -hd + 1.1, 0x745037);
      if (!narrow) addFurniture(sideWidth, .55, 1.45, hw - .18 - sideWidth / 2, .3, -hd + 1.2, furniture === "smith" ? 0x5c5a56 : 0x76523b);
      this.box(.55, 1.15, .5, -hw + .35, .58, .1, 0x60442e);
      for (let n = 0; n < 4; n++) this.box(.12, .22 + n * .035, .18, -hw + .32 + (n % 2) * .13, 1.28, -.12 + Math.floor(n / 2) * .2, [0x9a673d, 0x4d644f, 0x7a4035, 0x75614c][n]);
    }
    this.themeDetails(door,hw,hd);
    if (door.property) this.renderDecor();
    const lamp = new THREE.PointLight(0xffc986, 12, Math.max(w, d) * 1.8, 1.5);
    lamp.position.set(0, h - .75, 0); this.group.add(lamp);
    this.box(.45, .18, .45, 0, h - .55, 0, 0xd2a65d, .38);
    this.placeInteractions(door);
  }
  enter(door, restoring = false, { keepPosition = false } = {}) {
    const g = this.g, actor = this.owner;
    if (!actor) return;
    g.horses?.dismount(actor);
    this.closePanel();
    this.active = door;
    this.build(door);
    if (this.slot === 1) g.audio?.setAmbienceLevel(.12);
    g.state[this.slot === 2 ? "activeHouse2" : "activeHouse"] = door.id;
    if (this.slot === 1) g.resetPlayerMovement();
    actor.autoMove = null; actor.target = null; actor.moving = 0;
    let entry=keepPosition ? actor.pos.clone() : this.worldPoint((this.inPlace?door.doorX:0)+(this.sharedRoom ? .85 : 0),this.room.hd-2.1);
    const saved=this.slot===2 ? (g.p2ProfileData?.pos || g.state.localCoop?.pos) : g.data.pos;
    if(restoring && this.inPlace && Number.isFinite(saved?.x) && Number.isFinite(saved?.z)) {
      const dx=saved.x-this.group.position.x,dz=saved.z-this.group.position.z,c=Math.cos(door.rot),s=Math.sin(door.rot);
      if(Math.abs(dx*c+dz*s)<this.room.hw-.3 && Math.abs(-dx*s+dz*c)<this.room.hd-.3)
        entry=new THREE.Vector3(saved.x,Number.isFinite(saved.y)?saved.y:this.group.position.y,saved.z);
    }
    if (!keepPosition) {
      g.teleport(entry.x,entry.z,actor);
      if(this.inPlace) {
        actor.pos.y=g.world.floorHeightAt(entry.x,entry.z,entry.y);
        if(actor===g.player) for(const companion of g.combat.actors) if(companion.companion)
          companion.pos.y=g.world.floorHeightAt(companion.pos.x,companion.pos.z,actor.pos.y);
      }
      actor._teleport = true;
    }
    const prefix = this.slot === 2 ? "cam2" : "cam";
    this.savedCamera = { dist: g[`${prefix}Dist`], pitch: g[`${prefix}Pitch`], yaw: g[`${prefix}Yaw`] };
    g[`${prefix}Dist`] = 1.7; g[`${prefix}Pitch`] = .18; g[`${prefix}Yaw`] = this.inPlace ? door.rot : 0;
    if (!keepPosition) {
      if (this.slot === 2) g.updateLocalCamera(0, true); else g.snapCamera();
    }
    if (!this.sharedRoom) this.spawnResident(door, restoring);
    g.toast(door.label, door.property ? (this.propertyOwner ? "Your home" : "Inside") : door.locked ? "Behind a locked door" : "Inside");
    if (!restoring) g.save();
  }
  spawnResident(door, restoring) {
    const g = this.g, record = this.record(door);
    const isHome = !door.property && !door.landmark && door.floors > 1 && !record.residentDead;
    if (!isHome) return;
    const model = new Character({ ancestry: "valeborn", body: "robe", gear: "#77644b", trim: "#b99a67", weapon: "none", hair: { style: "bun", color: "#3b2920" } }, { hairGuides: 20 });
    const pos = this.worldPoint(0,-this.room.hd+2.2);
    model.addTo(g.scene); model.object.position.copy(pos);
    this.resident = { name: "Householder", pos, model, yaw: Math.PI, alive: true };
    if (door.locked && !record.welcomed) {
      this.makeHostile("The householder finds you inside and calls for the watch!");
    } else if (!record.welcomed && !restoring) {
      if (g.conversationActive() && g.conversationActor !== this.owner) this.pendingResident = true;
      else this.openResident();
    }
  }
  openResident() {
    if (!this.resident || !this.active) return;
    this.g.talking = this.resident; this.g.dialogueSpeaker = "npc";
    this.show("This is my home. Please leave before I call the watch.", [
      ["I'm leaving.", () => this.leave()],
      ["May I stay a moment? · Persuasion", () => this.persuade()],
      ["I'll stay anyway.", () => this.makeHostile("The householder shouts for help!")],
      ["Threaten the householder.", () => this.makeHostile("Your threat brings a cry for the watch!")],
    ], "Householder · " + this.active.label);
  }
  async persuade() {
    if (this.busy) return;
    const actor = this.owner;
    this.busy = true;
    this.closePanel();
    const g = this.g, bonus = g.dialogueCheckBonus({ abilities: ["Charisma"], skill: "persuasion" }, actor);
    const result = await g.hold.run("Ask to stay · persuasion", () => d20Check(bonus, 12), (roll) => describe(roll), `d20 ${bonus >= 0 ? "+" : ""}${bonus} · DC 12`, actor);
    g.dice.die(() => actor.chest(new THREE.Vector3()), result, { label: "PERSUADE " });
    if (result.success) {
      this.record(this.active).welcomed = true;
      this.show("All right. Keep your voice down and make yourself at home for a while.", [["Thank you.", () => this.closePanel()]], "Householder");
      g.save();
    } else {
      this.show("No. I said leave. This is your final warning.", [["Leave", () => this.leave()], ["Refuse", () => this.makeHostile("The householder calls for the watch!")]], "Householder");
    }
    this.busy = false;
  }
  makeHostile(line) {
    const g = this.g;
    this.closePanel();
    if (this.resident) { this.resident.model.dispose(); this.resident = null; }
    if (!this.hostile) {
      const pos = this.worldPoint(0,-this.room.hd+2.1);
      this.hostile = g.combat.spawnEnemy("brigand", pos, {});
      this.hostile.name = "Householder";
      this.hostile.aggro = true; this.hostile.target = this.owner;
    }
    this.record(this.active).reported = true;
    g.toast("Trespass!", line); g.log(line, "fail"); g.save();
  }
  leave(suppressGuards = false) {
    if (!this.active || this.transition) return;
    const door = this.active, actor = this.owner;
    this.pendingResident = false;
    this.closePanel();
    this.busy = true;
    this.doorMotion = null;
    door.collider.disabled = true;
    const walkThrough = this.inPlace;
    this.transition = {
      kind: "exit", door, actor, walkThrough, elapsed: 0, index: 0, suppressGuards,
      points: walkThrough ? [
        this.doorPoint(door, door.doorX, door.depth / 2 - .62),
        this.doorPoint(door, door.doorX, door.depth / 2 + .62),
      ] : [],
    };
  }
  completeLeave(transition) {
    const g = this.g, actor = transition.actor, door = transition.door;
    const suppressGuards = transition.suppressGuards, report = this.record(door).reported;
    const other = this.otherInterior();
    if (other?.active?.id === door.id && other.group === this.group) {
      if (this.resident && !other.resident) { other.resident = this.resident; this.resident = null; }
      if (this.hostile && !other.hostile) { other.hostile = this.hostile; other.hostile.target = other.owner; this.hostile = null; }
    }
    this.resident?.model.dispose(); this.resident = null;
    if (this.hostile) { g.combat.remove(this.hostile); this.hostile = null; }
    this.releaseRoom();
    g.world[this.slot === 2 ? "activeInterior2" : "activeInterior"] = null;
    if (this.slot === 1) g.audio?.setAmbienceLevel(.35);
    this.exitIt.hidden = true;
    this.chestIt.hidden = true; this.decorIt.hidden = true; this.boltIt.hidden = true;
    this.active = null; g.state[this.slot === 2 ? "activeHouse2" : "activeHouse"] = null;
    if (door.property && g.social.net) g.social.houseAction("leave", door, actor);
    if (!transition.walkThrough) {
      const outside = { x: door.pos.x + door.nx * .2, z: door.pos.z + door.nz * .2 };
      for (let n = 0; n < 4; n++) g.world.col.resolve(outside, actor?.radius || .42);
      if (actor) { g.teleport(outside.x, outside.z, actor); actor._teleport = true; }
    }
    const camera = this.slot === 2 ? "cam2" : "cam";
    g[camera + "Dist"] = this.savedCamera?.dist || 9;
    g[camera + "Pitch"] = this.savedCamera?.pitch ?? .42;
    g[camera + "Yaw"] = this.savedCamera?.yaw ?? Math.PI;
    this.savedCamera = null;
    if (this.slot === 1) g.resetPlayerMovement();
    if (report) { this.record(door).reported = false; if (!suppressGuards) g.social.callGuards(actor); }
    if (!suppressGuards) g.save();
  }
  update(dt) {
    if (this.doorMotion) {
      const motion = this.doorMotion;
      motion.elapsed += dt;
      const t = Math.min(1,motion.elapsed/motion.duration);
      const eased = t*t*(3-2*t);
      motion.door.leaf.rotation.y = motion.from + (motion.door.rot-motion.from)*eased;
      if (t >= 1) {
        motion.door.leaf.rotation.y = motion.door.rot;
        motion.door.collider.disabled = false;
        this.doorMotion = null;
      }
    }
    if (this.updateTransition(dt)) return;
    if (!this.active) return;
    if (this.pendingResident && !this.g.conversationActive()) { this.pendingResident = false; this.openResident(); }
    if (this.resident) {
      this.resident.model.speed = 0;
      this.resident.model.object.position.copy(this.resident.pos);
      this.resident.model.object.rotation.y = this.resident.yaw;
      this.resident.model.update(dt, { camera: this.g.camera, wind: this.g.wind, simulateHair: false });
    }
  }
  destroy() { if (this.transition?.door?.collider) this.transition.door.collider.disabled = false; this.transition = this.doorMotion = null; this.busy = false; removeEventListener("keydown", this.keyHandler); this.closePanel(); this.releaseRoom(); this.resident?.model.dispose(); if (this.hostile) this.g.combat.remove(this.hostile); this.g.world[this.slot === 2 ? "activeInterior2" : "activeInterior"] = null; for (const it of [this.exitIt,this.chestIt,this.decorIt,this.boltIt]) { it.hidden = true; const i = this.g.world.interactables.indexOf(it); if (i >= 0) this.g.world.interactables.splice(i, 1); } }
}
