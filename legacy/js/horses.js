// Shared overworld horses using the supplied rigged Open Range horse asset.
import * as THREE from "three";
import { d20Check, describe } from "./dice.js";
import { wildHorses, animalHandlingBonus, startHorseFlee, stepWildHorse } from "../server.js";
import { createHorseModel, horseLook } from "./horse-asset.js";

const $ = (s) => document.querySelector(s);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function poseRider(model) {
  const bones = model?.bones;
  if (!bones) return;
  for (const side of ["L", "R"]) {
    if (bones[`upLeg.${side}`]) bones[`upLeg.${side}`].rotation.x = -1.14;
    if (bones[`leg.${side}`]) bones[`leg.${side}`].rotation.x = 1.3;
    if (bones[`foot.${side}`]) bones[`foot.${side}`].rotation.x = -.3;
    if (bones[`upperArm.${side}`]) bones[`upperArm.${side}`].rotation.x = -.62;
    if (bones[`foreArm.${side}`]) bones[`foreArm.${side}`].rotation.x = -.43;
  }
}

export class HorseSystem {
  constructor(game, initial = null) {
    this.g = game;
    this.online = !!game.social.net;
    this.userId = this.online ? game.social.userId : "local";
    this.horses = new Map();
    this.alerts = new Map();
    this.mounted = null;
    this.mounted2 = null;
    this.panel = $("#horsePanel");
    this.active = null;
    this.viewer = null;
    this.stable = null;
    this.moveT = 0;
    this.bondDistance = 0;
    this.bondDistance2 = 0;
    const saved = (this.online ? initial || [] : Object.values(game.state.horses || {}))
      .filter(h => Number(h.id?.slice(1)) < 4 || h.tamed || h.owner || h.owner_user_id);
    const list = saved.length ? saved : wildHorses(game.world.seed);
    for (const horse of list) this.upsert(horse);
    this.panel.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-horse-action]");
      if (button) this.action(button.dataset.horseAction);
    });
  }
  upsert(data) {
    const old = this.horses.get(data.id);
    const h = old || { id: data.id, model: createHorseModel(), pos: new THREE.Vector3(), displayPos: new THREE.Vector3() };
    if (!old) { this.horses.set(h.id, h); this.g.scene.add(h.model.root); }
    Object.assign(h, { x: data.x, z: data.z, home_x: data.home_x ?? old?.home_x ?? data.x,
      home_z: data.home_z ?? old?.home_z ?? data.z, coat: data.coat, pattern: data.pattern, look: data.look ?? old?.look ?? null,
      tamed: !!data.tamed, name: data.name || "", owner: data.owner ?? data.owner_user_id ?? null,
      ownerName: data.ownerName ?? data.owner_name ?? "", bond: Number(data.bond) || 0,
      hp: Number(data.hp) || 0, deadUntil: data.deadUntil ?? data.dead_until ?? 0, rider: data.rider ?? data.rider_user_id ?? null,
      heading: data.heading ?? old?.heading ?? 0, gaitSpeed: data.gaitSpeed ?? old?.gaitSpeed ?? 0 });
    h.model.tamed = h.tamed;
    if (h.model.saddle) h.model.saddle.visible = h.tamed;
    h.model.setAppearance(horseLook(h.coat, h.pattern, h.look));
    h.pos.set(h.x, this.g.world.heightAt(h.x, h.z), h.z);
    if (!old) h.displayPos.copy(h.pos);
    if (h.id === this.mounted && h.rider !== this.userId) this.mounted = null;
    if (this.online && h.id === this.mounted2) this.mounted2 = null;
    return h;
  }
  onUpdate(data) {
    const old = this.horses.get(data.id);
    const before = old && JSON.stringify([old.tamed, old.name, old.owner, old.bond, old.rider, old.coat, old.pattern, old.look]);
    const horse = this.upsert(data);
    const after = JSON.stringify([horse.tamed, horse.name, horse.owner, horse.bond, horse.rider, horse.coat, horse.pattern, horse.look]);
    if (this.active?.id === data.id && before !== after) this.render();
  }
  ownerFor(actor = this.g.player) { return !this.online && actor && actor === this.g.localPlayer2 ? "local:2" : this.userId; }
  mountedFor(actor = this.g.player) { return actor === this.g.localPlayer2 ? this.mounted2 : this.mounted; }
  nearest(limit = 3.3, actor = this.g.player) {
    let chosen = null, best = limit;
    for (const h of this.horses.values()) {
      if (h.deadUntil > Date.now() || this.g.world.inDungeon(actor.pos.x, actor.pos.z)) continue;
      const d = distance(h, actor.pos);
      if (d < best) { chosen = h; best = d; }
    }
    return chosen;
  }
  nearStable(h = null, actor = this.g.player) {
    for (const [city, spot] of Object.entries(this.g.world.stables || {}))
      if (distance(actor.pos, spot) < 12 && (!h || distance(h, spot) < 13)) return city;
    return null;
  }
  open(h, actor = this.g.player) {
    if (this.g.combat.actors.some(a => a.team === "enemy" && a.alive && a.hostile && distance(a.pos, actor.pos) < 12)) {
      this.g.toast("Horse startled", "Settle the fight before approaching"); return;
    }
    if (actor === this.g.player) this.g.resetPlayerMovement(); else { actor.autoMove = null; actor.moving = 0; }
    this.viewer = actor; this.active = h; this.stable = null;
    document.body.classList.toggle("horse-owner-p2", actor === this.g.localPlayer2); this.render();
  }
  openStable(city, actor = this.g.player) {
    if (this.g.combat.actors.some(a => a.team === "enemy" && a.alive && a.hostile && distance(a.pos, actor.pos) < 12)) {
      this.g.toast("Stable closed", "Settle the fight before naming a horse"); return;
    }
    if (actor === this.g.player) this.g.resetPlayerMovement(); else { actor.autoMove = null; actor.moving = 0; }
    this.viewer = actor;
    document.body.classList.toggle("horse-owner-p2", actor === this.g.localPlayer2);
    this.stable = city;
    const point = this.g.world.stables[city];
    const candidates = [...this.horses.values()].filter((h) => h.tamed && distance(h, point) < 13 && h.deadUntil < Date.now()
      && (!h.owner || h.owner === this.ownerFor(actor)) && (!h.rider || h.rider === this.ownerFor(actor)));
    this.active = candidates.find((h) => h.id === this.mountedFor(actor)) || candidates.sort((a, b) => distance(a, point) - distance(b, point))[0] || null;
    this.render();
  }
  close() { this.panel.classList.add("hidden"); this.active = null; this.viewer = null; this.stable = null; document.body.classList.remove("horse-owner-p2"); }
  render() {
    const actor = this.viewer || this.g.player, owner = this.ownerFor(actor), mounted = this.mountedFor(actor);
    const h = this.active, stable = this.stable || (h && this.nearStable(h, actor));
    const title = this.panel.querySelector(".horse-title"), line = this.panel.querySelector(".horse-line"), actions = this.panel.querySelector(".horse-actions");
    this.panel.classList.remove("hidden");
    title.textContent = this.stable ? `${this.g.world.sites[this.stable].name} Stable` : h?.name || "Wild horse";
    actions.innerHTML = "";
    const add = (label, action, tone = "") => { const b = document.createElement("button"); b.type = "button"; b.dataset.horseAction = action; b.className = tone; b.textContent = label; actions.append(b); };
    if (!h) { line.textContent = "Bring a tamed horse into this open pen to give it a name and bind it to you."; add("Leave", "leave"); return; }
    const rider = h.rider && h.rider !== owner;
    if (this.stable && h.tamed && (!h.owner || h.owner === owner)) {
      line.textContent = h.name ? `${h.name} knows your voice. Bond ${h.bond}/5.` : "A name spoken at a stable binds this horse to you.";
      const box = document.createElement("input"); box.id = "horseNameInput"; box.maxLength = 20; box.placeholder = "Horse name"; box.value = h.name;
      actions.append(box); add(h.name ? "Rename horse" : "Name and bond", "name", "primary");
      if (h.id === mounted) add("Dismount", "dismount");
    } else if (!h.tamed) {
      const dc = 12 + Number(h.id.slice(1)) % 4;
      const bonus = animalHandlingBonus(actor.sheet.attrs,actor.sheet.background,actor.sheet.level || 1);
      line.textContent = `A ${h.pattern === "none" ? "solid" : h.pattern} coated horse watches you. Approach with care, or let it graze. Animal Handling ${bonus >= 0 ? "+" : ""}${bonus} · DC ${dc}.`;
      add("Tame · roll d20", "tame", "primary"); add("Attack", "attack", "danger");
    } else if (h.id === mounted) {
      line.textContent = h.name ? `Bond ${h.bond}/5. Walk with the horse to strengthen it.` : "This unbound horse will carry anyone who gains its trust.";
      if (stable && (!h.owner || h.owner === owner)) add("Visit stable · name", "stable", "primary");
      add("Dismount", "dismount");
    } else if (rider) {
      line.textContent = "Someone is riding this horse.";
    } else if (h.owner && h.owner !== owner) {
      const alert = (this.alerts.get(h.id) || 0) > Date.now();
      line.textContent = `Bound to another rider. Bond ${h.bond}/5. Stealing: Finesse DC ${12 + h.bond * 2 + (alert ? 4 : 0)}${alert ? " · wary of you" : ""}${stable ? ". Stable guards are close." : ". A failed attempt may draw a kick."}`;
      add("Try to steal · roll d20", "steal", "danger");
    } else {
      line.textContent = h.name ? `Bond ${h.bond}/5. A stronger bond makes theft harder.` : "Tamed but unbound. Anyone can ride until a stable gives it a name.";
      add("Ride", "mount", "primary");
      if (stable && !h.owner) add("Name at stable", "stable");
    }
    add("Leave", "leave");
  }
  action(action) {
    const h = this.active, actor = this.viewer || this.g.player;
    if (action === "leave") { this.close(); return; }
    if (action === "stable") { const city = this.nearStable(h, actor); if (city) { this.stable = city; this.render(); } return; }
    if (!h) return;
    const city = this.stable || this.nearStable(h, actor);
    const name = action === "name" ? $("#horseNameInput")?.value.trim() : "";
    if (action === "name" && (name.length < 2 || !city)) { this.g.log("A horse's name needs at least two letters, spoken at a stable.", "fail"); return; }
    this.close();
    if (this.online) this.g.social.net.send({ type: "horse_action", horse: h.id, action, stable: city, name });
    else this.localAction(h, action, city, name, actor);
  }
  localAction(h, action, city, name, actor = this.g.player) {
    const now = Date.now();
    const result = { horse: h.id, action, ok: false };
    const owner = this.ownerFor(actor);
    if (action === "tame" && !h.tamed) {
      const bonus = animalHandlingBonus(actor.sheet.attrs,actor.sheet.background,actor.sheet.level || 1), dc = 12 + Number(h.id.slice(1)) % 4;
      const roll = d20Check(bonus, dc); Object.assign(result, roll);
      result.ok = roll.success;
      if (roll.success) { h.tamed = true; h.gaitSpeed = 0; h.fleeTarget = null; h.wanderTarget = null; result.reason = "The horse accepts your hand. Anyone can ride until it is named."; }
      else { startHorseFlee(h, actor.pos, now); result.reason = "The horse bolts away."; }
    } else if (action === "mount" && h.tamed && !h.rider && (!h.owner || h.owner === owner)) {
      h.rider = owner; result.ok = true; result.reason = "You mount the horse. Hold sprint to gallop; B to dismount.";
    } else if (action === "dismount" && h.id === this.mountedFor(actor)) {
      h.rider = null; result.ok = true; result.reason = "You dismount.";
    } else if (action === "name" && h.tamed && city && (!h.owner || h.owner === owner)) {
      h.name = name; h.owner = owner; h.ownerName = actor.name; h.bond = Math.max(1, h.bond);
      result.ok = true; result.reason = `${name} is now bonded to you.`;
    } else if (action === "attack" && !h.tamed) {
      h.hp = Math.max(0, h.hp - 9); if (!h.hp) h.deadUntil = now + 20 * 60000;
      else startHorseFlee(h, actor.pos, now, 16);
      result.ok = true; result.reason = h.deadUntil ? "The horse falls." : "The wounded horse bolts away.";
    }
    this.onResult(result, actor);
  }
  onResult(m, actor = this.g.player) {
    const h = this.horses.get(m.horse);
    if (!h) return;
    const owner = this.ownerFor(actor);
    if (Number.isFinite(m.nat)) {
      const roll = { nat: m.nat, bonus: m.bonus, dc: m.dc, total: m.total, success: m.ok, crit: m.nat === 20, fumble: m.nat === 1 };
      this.g.dice.die(() => h.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), roll, { label: m.action === "tame" ? "Tame " : "Steal " });
      this.g.dice.combatRoll(m.action === "tame" ? "Horse taming" : "Horse theft", roll, { successLabel: "SUCCESS", failureLabel: "FAIL", side: actor === this.g.localPlayer2 ? 2 : 1 });
      this.g.log(describe(roll), m.ok ? "crit" : "fail");
    }
    if (m.action === "mount" && m.ok) {
      if (actor === this.g.localPlayer2) { this.mounted2 = h.id; this.g.cam2Dist = Math.max(this.g.cam2Dist, 11); }
      else { this.mounted = h.id; this.g.resetPlayerMovement(); this.g.camDist = Math.max(this.g.camDist, 11); }
      if (actor === this.g.localPlayer2) this.bondDistance2 = 0; else this.bondDistance = 0;
      h.rider = owner; h.gaitSpeed = 0; actor.riding = true;
    }
    if (m.action === "dismount" && m.ok) {
      if (actor === this.g.localPlayer2) this.mounted2 = null; else this.mounted = null;
      if (actor === this.g.localPlayer2) this.bondDistance2 = 0; else this.bondDistance = 0;
      h.rider = null; h.gaitSpeed = 0; actor.riding = false;
    }
    if (m.action === "tame" && m.ok) h.tamed = true;
    h.model.tamed = h.tamed; if (h.model.saddle) h.model.saddle.visible = h.tamed;
    if (m.action === "name" && m.ok && !this.online) h.owner = owner;
    if (m.action === "steal" && m.ok) this.alerts.delete(h.id);
    if (m.action === "steal" && !m.ok && m.damage) this.alerts.set(h.id, Date.now() + 60000);
    if (m.action === "attack" && m.ok && h.deadUntil > Date.now() && !this.online) this.g.corpses?.createHorse(h);
    if (m.damage) { actor.hp = Math.max(0, actor.hp - m.damage); this.g.audio.ui("hit", .45);
      this.g.dice.text(() => actor.chest(new THREE.Vector3()), `−${m.damage} kick`, "enemy"); if (!actor.hp) this.g.onDefeat(actor); }
    if (m.reason) { this.g.toast(m.ok ? "Horse" : "Horse encounter", m.reason); this.g.log(m.reason, m.ok ? "crit" : "fail"); }
    if (m.action === "tame" && m.ok) this.open(h, actor);
    this.saveLocal();
  }
  saveLocal() {
    if (this.online) return;
    this.g.state.horses = this.serialize();
    this.g.save();
  }
  serialize() {
    return Object.fromEntries([...this.horses.values()].map((h) => [h.id, { id: h.id, x: h.x, z: h.z,
      home_x: h.home_x, home_z: h.home_z, coat: h.coat, pattern: h.pattern, look: h.look, tamed: h.tamed, name: h.name,
      owner: h.owner, ownerName: h.ownerName, bond: h.bond, hp: h.hp, deadUntil: h.deadUntil, rider: null }]));
  }
  dismount(actor = this.g.player) {
    const id = this.mountedFor(actor);
    if (!id) return;
    const h = this.horses.get(id);
    if (!h) return;
    if (this.viewer === actor) this.close();
    if (this.online) this.g.social.net.send({ type: "horse_action", horse: h.id, action: "dismount" });
    else this.localAction(h, "dismount", null, "", actor);
  }
  update(dt) {
    const now = Date.now(), riders = [[this.g.player, this.mounted], [this.g.localPlayer2, this.mounted2]];
    for (const [actor, id] of riders) {
      const horse = this.horses.get(id);
      if (!actor || !horse || horse.deadUntil >= now) continue;
      const travelled = distance(horse, actor.pos);
      horse.x = actor.pos.x; horse.z = actor.pos.z;
      horse.rider = this.ownerFor(actor);
      if (this.online && actor === this.g.player) {
        this.moveT -= dt;
        if (this.moveT <= 0) { this.moveT = .22; this.g.social.net.send({ type: "horse_move" }); }
      } else if (horse.owner === this.ownerFor(actor) && travelled > .01 && travelled < 1) {
        const bondKey = actor === this.g.localPlayer2 ? "bondDistance2" : "bondDistance";
        this[bondKey] += travelled;
        if (this[bondKey] >= 240 && horse.bond < 5) {
          this[bondKey] -= 240; horse.bond++; this.saveLocal();
          this.g.toast("Horse bond", `${horse.name} trusts ${actor.name} more · ${horse.bond}/5`);
        }
      }
    }
    for (const h of this.horses.values()) {
      if (h.deadUntil && h.deadUntil < now && !this.online) { h.deadUntil = 0; h.hp = 24; h.x = h.home_x; h.z = h.home_z; this.saveLocal(); }
      if (!this.online && !this.g.paused && !this.g.menuOpen && h !== this.active) {
        const wasFleeing = !!h.fleeTarget;
        if (stepWildHorse(h, dt, now, [this.g.player?.pos, this.g.localPlayer2?.pos])) {
          this.g.world.col.resolve(h, .5);
        }
        if (wasFleeing && !h.fleeTarget) this.saveLocal();
      }
      const outside = !this.g.inDungeon || (this.g.localPlayer2 && !this.g.world.inDungeon(this.g.localPlayer2.pos.x, this.g.localPlayer2.pos.z));
      const visible = outside && h.deadUntil < now && Math.min(
        distance(h, this.g.camera.position),
        this.g.camera2 ? distance(h, this.g.camera2.position) : Infinity,
      ) < 135;
      h.model.root.visible = visible;
      if (!visible) continue;
      h.pos.set(h.x, this.g.world.heightAt(h.x, h.z), h.z);
      const remote = h.rider && h.rider !== this.userId
        && h.rider !== this.ownerFor(this.g.localPlayer2)
        ? [...this.g.social.remotes.values()].find((r) => r.info.userId === h.rider) : null;
      const remoteMotion = remote ? this.g.social.net.sample(remote.o) : null;
      if (h.id === this.mounted || h.id === this.mounted2) h.displayPos.copy(h.pos);
      else if (remote) h.displayPos.set(remote.pos.x, remote.pos.y, remote.pos.z);
      else h.displayPos.lerp(h.pos, 1 - Math.exp(-dt * 8));
      h.model.root.position.copy(h.displayPos);
      const riderActor = h.id === this.mounted ? this.g.player : h.id === this.mounted2 ? this.g.localPlayer2 : null;
      const speed = riderActor ? riderActor.moving || 0 : remoteMotion?.s ?? h.gaitSpeed ?? 0;
      h.model.speed = THREE.MathUtils.damp(h.model.speed, speed, 5, dt);
      h.model.phase += dt * (1.4 + h.model.speed * .8);
      const step = Math.min(1, h.model.speed / 7), phase = h.model.phase;
      h.model.updateGait(h.model.speed, dt);
      const yaw = riderActor ? riderActor.yaw : remoteMotion?.yaw ?? h.heading;
      h.model.root.rotation.y += Math.atan2(Math.sin(yaw - h.model.root.rotation.y), Math.cos(yaw - h.model.root.rotation.y)) * (1 - Math.exp(-dt * 10));
      if (riderActor) {
        riderActor.model.object.position.set(riderActor.pos.x - Math.sin(riderActor.yaw) * .14,
          riderActor.pos.y + 1.56 + Math.sin(phase * 2) * .035 * step, riderActor.pos.z - Math.cos(riderActor.yaw) * .14);
        poseRider(riderActor.model);
      }
    }
  }
  destroy() {
    this.close();
    for (const h of this.horses.values()) {
      this.g.scene.remove(h.model.root);
      h.model.dispose();
    }
    this.horses.clear();
  }
}
