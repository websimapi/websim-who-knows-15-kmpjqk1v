// Real-time combat: actors, movement, enemy & companion AI, abilities with
// wind-up/recovery, visible dice, active d20 checks, statuses, downed/death checks,
// surrender, champions/uniques, the Mire Warden, projectiles and loot.
import * as THREE from "three";
import { Character, Creature } from "./character.js";
import { ABILITIES, CLASSES, ENEMIES, UNIQUE_MODS, ATTRS, mod, profBonus, XP_TABLE } from "./data.js";
import { d20Check, rollDice, describe, fmtBonus, rollDie } from "./dice.js";
import { makePursuer } from "./title-monster.js";
import { cityLineClear, cityRoute } from "./city-nav.js";
import { SWIM_DEPTH } from "./swimming.js";
import { groundBody, orientBodyToTerrain } from "./body-grounding.js";

const TMP = new THREE.Vector3();
let NEXT_ID = 1;

// ---------- stats ----------
export function playerStats(sheet) {
  const C = CLASSES[sheet.class];
  const a = sheet.attrs, L = sheet.level || 1;
  const vig = mod(a.vigor);
  const maxHp = C.die + vig + (L - 1) * (Math.floor(C.die / 2) + 1 + vig);
  const prof = profBonus(L);
  const def = (k, attrs) => 10 + Math.max(...attrs.map((x) => mod(a[x]))) + (C.prof.includes(k) ? prof : 0);
  return {
    maxHp, prof, attrs: a, level: L,
    guard: 10 + C.armour + C.shield + Math.min(mod(a.finesse), C.finCap),
    reflex: def("reflex", ["finesse", "instinct"]), fortitude: def("fortitude", ["might", "vigor"]), resolve: def("resolve", ["intellect", "presence"]),
    abilities: C.abilities.filter((k) => (ABILITIES[k].minLevel || 1) <= L), resource: { ...C.resource, cur: C.resource.start },
    speed: 4.6,
  };
}
function enemyStats(kind, { champion, unique, level } = {}) {
  const E = ENEMIES[kind];
  const s = {
    maxHp: Math.round(E.hp * (champion ? 2.5 : unique ? 2 : 1)), prof: 0, level: E.level,
    guard: E.guard, reflex: E.defs.reflex, fortitude: E.defs.fortitude, resolve: E.defs.resolve,
    atk: E.atk, dmgBonus: E.dmgBonus, abilities: [E.ability, E.special].filter(Boolean), speed: E.speed, xp: Math.round(E.xp * (champion ? 2 : unique ? 3 : 1)),
    resource: { name: "", max: 0, cur: 0 },
  };
  if (unique) {
    const m = UNIQUE_MODS[unique];
    if (m.speed) s.speed *= m.speed;
    if (m.guard) s.guard += m.guard;
    s.mod = m;
  }
  if (kind === "hollow") {
    const L = Math.max(4, Math.min(7, level || 4));
    s.level = L;
    s.maxHp = 88 + (L - 4) * 34;
    s.guard = 15 + Math.floor((L - 4) / 2);
    s.atk = 7 + L - 4;
    s.dmgBonus = 4 + L - 4;
    s.reflex += L - 4; s.fortitude += L - 4; s.resolve += L - 4;
    s.speed = 1.55;
    s.xp = 300 + L * 90;
    s.resource = { name: "Dread", max: 9, cur: 9, regen: 1 };
    s.abilities = ["warden_lash", "warden_slam", "hollow_hex", "cleave"];
  }
  return s;
}

// ---------- models ----------
const HAIRS = ["crop", "swept", "wild", "ponytail", "bald", "long", "curls"];
export function makeModel(kind, look, guides = 80) {
  if (kind === "hollow") return makePursuer(look.scene, look.low);
  if (kind === "gloam_rat") return new Creature("rat");
  if (kind === "fen_hound") return new Creature("hound", { champion: look?.champion });
  if (kind === "root_matriarch") {
    const c = new Creature("hound", { champion: true });
    c.object.scale.setScalar(1.55); c.scale *= 1.55;
    c.object.traverse((o) => { if (o.isLight) o.color.set(0x78cf82); });
    return c;
  }
  if (kind === "ash_crawler") {
    const c = new Creature("rat");
    c.object.scale.setScalar(1.5); c.scale *= 1.5;
    c.object.traverse((o) => { if (o.isMesh && o.material?.color?.getHex() === 0x3d3530) o.material.color.set(0x3a2927); if (o.isMesh && o.material?.color?.getHex() === 0xb0ff60) o.material.color.set(0xff8b4b); });
    return c;
  }
  if (kind === "bristleback") return new Creature("boar");
  if (kind === "briar_stag") return new Creature("stag");
  if (kind === "mire_warden") {
    const c = new Character({ ancestry: "hollowed", cls: "vanguard", height: 1.55, build: 1.25, sex: 0.9, skin: "#5a6a5a", body: "plate", gear: "#2c3a30", trim: "#6a8a5a", weapon: "mace", shield: false, eyeColor: "#8fffc0", hair: { style: "wild", color: "#2a3a2a", length: 0.4 }, beard: { style: "long", color: "#2a3a2a" } }, { hairGuides: guides });
    c.setMorality(-100);
    return c;
  }
  if (kind === "tide_keeper") {
    const c = new Character({ ancestry: "hollowed", cls: "lifekeeper", height: 1.35, build: 1.1, sex: 0.7, skin: "#718f98", body: "robe", gear: "#234856", trim: "#a5ddda", weapon: "mace", shield: false, eyeColor: "#b1fff2", hair: { style: "long", color: "#d4dfdb", length: .85 }, beard: { style: "long", color: "#d4dfdb" } }, { hairGuides: guides });
    return c;
  }
  if (kind === "glass_smith") {
    const c = new Character({ ancestry: "cindrel", cls: "vanguard", height: 1.25, build: 1.25, sex: .85, skin: "#8b6251", body: "plate", gear: "#352826", trim: "#ea824b", weapon: "mace", shield: false, eyeColor: "#ffba6c", hair: { style: "wild", color: "#191a1c", length: .55 }, beard: { style: "short", color: "#171719" } }, { hairGuides: guides });
    return c;
  }
  if (ENEMIES[kind]) {
    const E = ENEMIES[kind];
    const r = Math.random;
    return new Character({ ancestry: ["valeborn", "bronzeborn", "cindrel", "saltborn"][Math.floor(r() * 4)], body: E.look.body, gear: E.look.gear, trim: E.look.trim, sex: 0.3 + r() * 0.7, weapon: E.ranged ? "bow" : "blade", shield: kind === "sellsword" || kind === "city_guard", height: 0.95 + r() * 0.1, hair: { style: HAIRS[Math.floor(r() * HAIRS.length)], color: ["#2b1d14", "#5a3a22", "#1a1a1a", "#7a3b1c"][Math.floor(r() * 4)] }, beard: { style: r() < 0.4 ? "short" : "none" } }, { hairGuides: Math.floor(guides * 0.6) });
  }
  return new Character(look, { hairGuides: guides });
}

// ---------- actor ----------
export class Actor {
  constructor({ name, team, kind, model, pos, stats, npc, sheet, companion, champion, unique, boss, spawn, nightHunter }) {
    this.id = "a" + NEXT_ID++;
    Object.assign(this, { name, team, kind, model, stats, npc, sheet, companion, champion, unique, boss, spawn });
    this.pos = pos.clone();
    this.yaw = 0;
    this.vel = new THREE.Vector3();
    this.hp = stats.maxHp;
    this.res = stats.resource?.cur ?? 0;
    this.cd = {};
    this.status = {};
    this.buffs = [];
    this.cast = null;
    this.recover = 0;
    this.target = null;
    this.downed = false;
    this.dead = false;
    this.deathChecks = null;
    this.surrendered = false;
    this.aggro = false;
    this.radius = kind === "gloam_rat" ? 0.35 : kind === "ash_crawler" ? .53 : kind === "mire_warden" || kind === "tide_keeper" || kind === "glass_smith" || kind === "root_matriarch" ? 1.1 : kind === "fen_hound" ? 0.6 : kind === "bristleback" ? .65 : kind === "briar_stag" ? .65 : 0.42;
    this.home = pos.clone();
    this.moveTarget = null;
    this.fade = 0;
    this.nightHunter = !!nightHunter;
    if (kind === "hollow") this.radius = .72;
  }
  get alive() { return !this.dead && !this.downed; }
  get hostile() { return this.team === "enemy" && !this.surrendered && !this.parleyNeutral && this.alive; }
  defence(k) {
    let v = this.stats[k];
    if (k === "guard") for (const b of this.buffs) v += b.guard || 0;
    return v;
  }
  eye(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + (this.model.height || 1.6) * 0.85); }
  chest(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + (this.model.height || 1.6) * 0.62); }
}

// ---------- combat system ----------
export class Combat {
  constructor({ scene, world, dice, hold, log, audio, events }) {
    Object.assign(this, { scene, world, dice, hold, log, audio, events });
    this.actors = [];
    this.projectiles = [];
    this.projectilePool = new Map();
    this.telegraphs = [];
    this.telegraphPool = [];
    this.feedingPoint = new THREE.Vector3();
    this.inCombatT = 0;
  }

  add(actor) {
    this.actors.push(actor);
    actor.model.addTo(this.scene);
    actor.model.object.position.copy(actor.pos);
    return actor;
  }
  remove(actor) {
    const i = this.actors.indexOf(actor);
    if (i >= 0) this.actors.splice(i, 1);
    actor.model.dispose();
  }
  spawnEnemy(kind, pos, opts = {}) {
    const stats = enemyStats(kind, opts);
    const E = ENEMIES[kind];
    const model = makeModel(kind, kind === "hollow" ? { scene: this.scene, low: (this.events.hairGuides?.() ?? 80) < 25 } : { champion: opts.champion }, this.events.hairGuides?.() ?? 80);
    const name = kind === "hollow" ? `The Hollow · level ${stats.level}` : (opts.unique ? UNIQUE_MODS[opts.unique].name + " " : opts.champion ? "Champion " : "") + E.name;
    const a = new Actor({ name, team: "enemy", kind, model, pos, stats, champion: opts.champion, unique: opts.unique, boss: E.boss, spawn: opts.spawn, nightHunter: opts.nightHunter });
    a.yaw = Math.random() * 6.28;
    return this.add(a);
  }
  get inCombat() { return this.inCombatT > 0; }

  // ---------- movement ----------
  move(a, dx, dz, speed, dt) {
    if (a.status.pinned > 0 || a.status.staggered > 0) speed = 0;
    if (a.status.slowed > 0) speed *= 0.5;
    const len = Math.hypot(dx, dz);
    const w = this.world;
    if (len > 1e-3 && speed > 0) {
      const sx = dx / len * speed * dt, sz = dz / len * speed * dt;
      const nx = a.pos.x + sx, nz = a.pos.z + sz;
      // Land movement keeps its slope and water limits; swimmers can cross
      // the channel and climb its bank again.
      const h0 = w.floorHeightAt(a.pos.x, a.pos.z, a.pos.y), h1 = w.floorHeightAt(nx, nz, a.pos.y);
      const rise = (h1 - h0) / Math.max(1e-3, Math.hypot(sx, sz));
      const crossingWater = a.player && !a.riding && a.swimStamina > 0
        && (w.waterDepthAt(a.pos.x, a.pos.z) > 0 || w.waterDepthAt(nx, nz) > 0);
      const stairClimb = rise >= .9 && !crossingWater && w.houseStairAt(nx,nz)
        && (w.houseStairAt(a.pos.x,a.pos.z) || h1-h0 < .5);
      if ((rise < 0.9 || crossingWater || stairClimb) && (h1 > -1.2 || crossingWater)) { a.pos.x = nx; a.pos.z = nz; }
      else if (h1 > -1.2) { // slide along contour
        const hx = w.floorHeightAt(nx, a.pos.z, a.pos.y), hz = w.floorHeightAt(a.pos.x, nz, a.pos.y);
        if ((hx - h0) / Math.max(1e-3, Math.abs(sx)) < 0.9) a.pos.x = nx; else if ((hz - h0) / Math.max(1e-3, Math.abs(sz)) < 0.9) a.pos.z = nz;
      }
      const targetYaw = Math.atan2(dx, dz);
      let d = targetYaw - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      a.yaw += d * Math.min(1, dt * 12);
      const deep = w.waterDepthAt(a.pos.x, a.pos.z) >= SWIM_DEPTH;
      a.moving = speed * (deep || a.sheet?.ancestry === "saltborn" ? 1 : w.heightAt(a.pos.x, a.pos.z) < -0.3 ? 0.6 : 1);
    } else a.moving = 0;
    w.col.resolve(a.pos, a.radius);
    a.pos.y = a.player && !a.riding && w.waterDepthAt(a.pos.x, a.pos.z) >= SWIM_DEPTH
      ? Math.max(w.surfaceHeightAt(a.pos.x, a.pos.z), w.waterSurface - 1.05)
      : w.floorHeightAt(a.pos.x, a.pos.z, a.pos.y, true);
  }
  moveCityChase(a, target, dt) {
    const M = this.world.sites.marrowgate;
    const marrowgate = Math.max(Math.abs(a.pos.x - M.x), Math.abs(a.pos.z - M.z)) < M.r - 1;
    if (!a.cityGuard || !marrowgate || cityLineClear(this.world, a.pos, target.pos, a.radius + .06)) {
      this.move(a, target.pos.x - a.pos.x, target.pos.z - a.pos.z, a.stats.speed, dt); return;
    }
    a.cityRouteT = (a.cityRouteT || 0) - dt;
    if (a.cityRouteT <= 0 || !a.cityRouteGoal || a.cityRouteGoal.distanceToSquared(target.pos) > 7) {
      a.cityRoute = cityRoute(this.world, a.pos, target.pos, a.radius + .06);
      a.cityRouteGoal = target.pos.clone(); a.cityRouteT = 1;
    }
    const next = a.cityRoute?.[0];
    if (!next) { a.moving = 0; return; }
    if (Math.hypot(next.x - a.pos.x, next.z - a.pos.z) < .65) { a.cityRoute.shift(); a.moving = 0; return; }
    this.move(a, next.x - a.pos.x, next.z - a.pos.z, a.stats.speed, dt);
  }
  face(a, p) { a.yaw = Math.atan2(p.x - a.pos.x, p.z - a.pos.z); }
  separate() {
    const A = this.actors;
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
      const a = A[i], b = A[j];
      if (a.dead || b.dead || a.downed || b.downed) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = a.radius + b.radius;
      if (d < m && d > 1e-4) {
        const k = (m - d) / d * 0.5;
        a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k;
      }
    }
  }

  // ---------- abilities ----------
  canUse(a, key) {
    const ab = ABILITIES[key];
    if (!ab || !a.alive || a.cast || a.recover > 0 || a.status.staggered > 0) return false;
    if ((a.cd[key] || 0) > 0) return false;
    if (ab.cost && a.res < ab.cost) return false;
    return true;
  }
  inRange(a, key, target) {
    const ab = ABILITIES[key];
    if (ab.self) return true;
    if (!target) return false;
    const d = a.pos.distanceTo(target.pos) - target.radius;
    if (d > ab.range) return false;
    if (ab.range > 4 && !this.world.los(a.eye(new THREE.Vector3()), target.chest(new THREE.Vector3()))) return false;
    return true;
  }
  // begin wind-up. byPlayer marks deliberate commands.
  use(a, key, target, byPlayer = false) {
    const ab = ABILITIES[key];
    if (!this.canUse(a, key)) return false;
    if (ab.self) target = a;
    if (ab.kind === "heal" && !target) target = a;
    if (!this.inRange(a, key, target)) return false;
    if (ab.cost) a.res -= ab.cost;
    if (ab.cooldown) a.cd[key] = ab.cooldown;
    let windup = ab.windup;
    if (a.unique === "frenzied") windup *= UNIQUE_MODS.frenzied.haste;
    a.cast = { key, ab, t: 0, windup, target, byPlayer };
    if (target && target !== a) this.face(a, target.pos);
    const anim = a.kind === "hollow" ? key === "warden_slam" ? "special" : key === "hollow_hex" ? "magic" : "attack"
      : ab.kind === "heal" ? "heal" : ab.kind === "buff" ? "cast" : key === "shield_bash" ? "bash" : key === "cleave" ? "cleave" : ab.projectile === "arrow" ? "shoot" : ab.kind === "spell" || ab.kind === "save" ? "cast" : "attack";
    a.model.play(anim, windup + ab.recover * 0.6);
    if (ab.telegraph) this.telegraph(a, ab, windup);
    if (a.team === "enemy" && target?.team === "party") a.intent = `${ab.name} → ${target.name}`;
    if (a.team === "party" || target?.team === "enemy") this.engage(a, target);
    return true;
  }
  telegraph(a, ab, dur) {
    const m = this.telegraphPool.pop() || new THREE.Mesh(new THREE.RingGeometry(0.2, 4.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.25, depthWrite: false }));
    m.scale.setScalar(ab.aoe / 4.5);
    m.material.opacity = .25;
    m.position.copy(a.pos).setY(a.pos.y + 0.08);
    this.scene.add(m);
    this.telegraphs.push({ m, t: 0, dur });
  }
  engage(a, b) {
    if (b?.team === "enemy" && b.parleyNeutral && b.caveBoss) {
      b.parleyNeutral = false;
      b.aggro = true;
      b.target = a?.team === "party" ? a : null;
    }
    if (b?.team === "enemy" && b.parleyNeutral && b.spawn?.startsWith("gm_")) {
      for (const x of this.actors) if (x.team === "enemy" && x.spawn?.startsWith("gm_") && x.alive) {
        x.parleyNeutral = false;
        x.aggro = true;
        x.target = a?.team === "party" ? a : x.target;
      }
      this.events.onParleyBroken?.();
    }
    this.inCombatT = 8;
    for (const x of [a, b]) if (x && x.team === "enemy" && !x.aggro) { x.aggro = true; this.alertGroup(x); }
  }
  alertGroup(e) {
    for (const o of this.actors) if (o.team === "enemy" && !o.aggro && o.spawn && o.spawn === e.spawn) o.aggro = true;
  }

  async release(a) {
    const { key, ab, target, byPlayer } = a.cast;
    a.cast = null;
    a.intent = null;
    a.recover = ab.recover;
    if (!a.alive) return;
    if (ab.kind === "buff") {
      a.buffs.push({ ...ab.buff, t: ab.buff.dur });
      this.log(`${a.name} uses ${ab.name} (+${ab.buff.guard} Guard).`);
      this.dice.text(() => a.chest(TMP), ab.name, "heal");
      this.audio.play("spell", a.pos, { vol: 0.5 });
      return;
    }
    if (ab.aoe && ab.kind === "save" && a.team === "enemy") { // boss slam: everyone in radius saves
      for (const t of this.actors) if (t !== a && t.alive && (a.kind === "hollow" ? t.kind !== "hollow" : t.team === "party") && t.pos.distanceTo(a.pos) < ab.aoe) await this.resolveSave(a, ab, t);
      this.audio.play("hit", a.pos, { vol: 1.2, rate: 0.6 });
      return;
    }
    if (!target || (!target.alive && ab.kind !== "heal") || target.dead) return;
    if (ab.range > 4 && a.pos.distanceTo(target.pos) > ab.range + 3) { this.log(`${a.name}'s ${ab.name}: target out of range.`); return; }
    if (ab.kind === "heal") return this.resolveHeal(a, ab, target);
    if (ab.projectile) {
      // roll now (visible), apply on arrival
      const res = ab.kind === "save" ? null : await this.attackRoll(a, ab, target, byPlayer);
      this.launch(a, ab, target, async () => {
        if (ab.kind === "save") await this.resolveSave(a, ab, target, byPlayer); else this.applyHit(a, ab, target, res);
      });
      if (a.kind === "hollow" && key === "hollow_throw") this.events.onHollowThrow?.(a);
      return;
    }
    if (ab.kind === "save") return this.resolveSave(a, ab, target, byPlayer);
    // melee
    const targets = ab.arc ? this.actors.filter((t) => t.hostile !== undefined && this.isFoe(a, t) && t.alive && t.pos.distanceTo(a.pos) < ab.range + t.radius) : [target];
    for (const t of targets) {
      const res = await this.attackRoll(a, ab, t, byPlayer && t === target);
      this.applyHit(a, ab, t, res);
    }
  }
  isFoe(a, t) { return a.team === "enemy" ? t.team === "party" : t.team === "enemy" && !t.surrendered || t === a.target; }

  attackBonus(a, ab) {
    if (a.team === "enemy" || !a.stats.attrs) return a.stats.atk;
    return mod(a.stats.attrs[ab.attr] ?? 10) + a.stats.prof + (["melee", "ranged"].includes(ab.kind) ? (a.stats.weaponAttack || 0) : 0);
  }
  async attackRoll(a, ab, t, byPlayer = false) {
    const bonus = this.attackBonus(a, ab);
    const dc = t.defence("guard");
    let adv = 0;
    if (t.status.pinned > 0 || t.status.staggered > 0 || t.surrendered) adv = 1;
    if (ab.range > 4 && a.pos.distanceTo(t.pos) < 2.5 && a.team === "party") adv -= 1;
    if (a.pos.y - t.pos.y > 3 && ab.range > 4) adv += 1; // height matters
    adv = Math.sign(adv);
    const party = a.team === "party";
    const special = a.player && byPlayer && !!ab.specialRoll;
    const opening = a.player && byPlayer && (t.status.pinned > 0 || t.status.staggered > 0) && !special;
    const title = opening ? `${a.name} · Critical opening` : `${a.name} · ${ab.name}`;
    const hint = `d20 ${fmtBonus(bonus)} · Guard ${dc}${adv > 0 ? " · advantage" : adv < 0 ? " · disadvantage" : ""}`;
    let r = special || opening
      ? await this.hold.run(title, () => d20Check(bonus, dc, adv), (x) => describe(x), hint, a)
      : d20Check(bonus, dc, adv);
    if (!special && !opening && (a.player || t.player) && r.crit)
      r = await this.hold.run(`${a.name} · Critical hit`, () => r, (x) => describe(x), hint, a.player ? a : t, true);
    this.dice.combatRoll(`${a.name} · ${ab.name}`, r, { enemy: !party, side: this.events.isPlayer2?.(a) || this.events.isPlayer2?.(t) ? 2 : 1 });
    this.log(`${a.name} → ${t.name} · ${ab.name}: ${describe(r)}`, r.crit ? "crit" : r.success ? "" : "fail");
    this.audio.play(r.success ? "hit" : "miss", t.pos, { vol: r.crit ? 1.3 : 0.8 });
    if (r.crit || r.fumble) this.audio.play("dice", t.pos, { vol: 0.5 });
    return r;
  }
  damage(a, ab, crit) {
    const bonus = a.team === "enemy" || !a.stats.attrs ? a.stats.dmgBonus : mod(a.stats.attrs[ab.attr] ?? 10);
    return rollDice(ab.dmg, { crit, bonus: ab.dmg ? bonus : 0 });
  }
  applyHit(a, ab, t, r) {
    if (!r || !t || t.dead) return;
    if (!r.success) {
      if (t.team === "enemy") { t.aggro = true; t.target = t.target || a; }
      return;
    }
    if (t.stats.mod?.name === "Stoneskin" && false) return;
    if (a.kind === "sellsword" || t.kind === "sellsword") { /* shield block */ }
    let blocked = t.kind === "sellsword" && Math.random() < ENEMIES.sellsword.block && !r.crit;
    const d = this.damage(a, ab, r.crit);
    let dmg = blocked ? Math.floor(d.total / 2) : d.total;
    if (a.unique === "ember") dmg += rollDie(4);
    this.hurt(t, dmg, a, r.crit, `${d.rolls.join("+")}${d.bonus ? fmtBonus(d.bonus) : ""}${blocked ? " (blocked ½)" : ""}`);
    if (ab.gain && a.stats.resource?.max) a.res = Math.min(a.stats.resource.max, a.res + ab.gain);
    if (ab.status) for (const [k, v] of Object.entries(ab.status)) t.status[k] = Math.max(t.status[k] || 0, v);
    if (ab.pull && t.alive && t.kind !== "mire_warden") { const dir = TMP.subVectors(a.pos, t.pos).setY(0).normalize(); t.pos.addScaledVector(dir, 1.5); }
    if (ab.interrupt && t.cast && !t.cast.ab.telegraph) { this.log(`${t.name}'s ${t.cast.ab.name} is interrupted!`, "crit"); t.cast = null; t.intent = null; t.recover = 0.6; }
  }
  async resolveSave(a, ab, t, byPlayer = false) {
    const dc = ab.dc ?? (8 + (a.stats.prof || 2) + mod(a.stats.attrs?.[ab.attr] ?? 12));
    const bonus = t.defence(ab.def) - 10;
    const important = (t.player && ab.telegraph) || (a.player && byPlayer && !!ab.specialRoll);
    const owner = t.player ? t : a.player && byPlayer ? a : null;
    const title = t.player && ab.telegraph ? `${t.name} · Special dodge` : `${t.name} · resist ${ab.name}`;
    const hint = `d20 ${fmtBonus(bonus)} · DC ${dc}`;
    let r = important
      ? await this.hold.run(title, () => d20Check(bonus, dc), (x) => describe(x), hint, owner, false,
        a.player && !t.player ? { allowReroll: false, resultText: (x) => x.success ? "RESISTED" : "ATTACK SUCCEEDED" } : {})
      : d20Check(bonus, dc);
    if (!important && owner && r.crit) r = await this.hold.run(`${t.name} · Critical save`, () => r, (x) => describe(x), hint, owner, true);
    this.dice.combatRoll(`${t.name} · ${ab.def}`, r, { enemy: t.team === "enemy", successLabel: "SAVE", failureLabel: "FAILED", side: this.events.isPlayer2?.(owner) ? 2 : 1 });
    this.log(`${t.name} ${ab.def} save vs ${a.name}'s ${ab.name}: ${describe(r)}`, r.success ? "" : "fail");
    // a failed save = full effect; success = half damage, no status
    if (ab.dmg) {
      const d = this.damage(a, ab, false);
      const dmg = r.success ? Math.floor(d.total / 2) : d.total;
      if (dmg > 0) this.hurt(t, dmg, a, false, d.rolls.join("+"));
    }
    if (!r.success && ab.status) for (const [k, v] of Object.entries(ab.status)) { t.status[k] = Math.max(t.status[k] || 0, v); this.dice.text(() => t.eye(TMP), k, ""); }
    if (ab.gain && a.stats.resource?.max) a.res = Math.min(a.stats.resource.max, a.res + ab.gain);
    if (t.team === "enemy") { t.aggro = true; t.target = t.target || a; }
    this.engage(a, t);
  }
  resolveHeal(a, ab, t) {
    const h = rollDice(ab.heal, { bonus: mod(a.stats.attrs?.[ab.attr] ?? 10) * (ab.addMod || ab.attr ? 1 : 0) });
    const amt = Math.max(1, h.total);
    if (t.downed) { t.downed = false; t.feedingHollow = null; t.deathChecks = null; t.model.play("revive"); this.log(`${a.name} revives ${t.name}!`, "crit"); }
    t.hp = Math.min(t.stats.maxHp, t.hp + amt);
    this.dice.text(() => t.chest(TMP), "+" + amt, "heal");
    this.log(`${a.name} · ${ab.name} → ${t.name}: ${h.rolls.join("+")}${fmtBonus(h.bonus)} = +${amt} health`);
    this.audio.play("halo", t.pos, { vol: 0.5 });
    if (ab.gain && a.stats.resource?.max) a.res = Math.min(a.stats.resource.max, a.res + ab.gain);
    this.events.onHeal?.(a, t);
  }

  hurt(t, dmg, src, crit, detail = "") {
    if (t.dead || t.downed) return;
    if (t.team === "party" && src?.team === "enemy") t.lastAttacker = src;
    for (const b of t.buffs) if (b.absorb && dmg > 0) { dmg = Math.max(0, dmg - 3); b.absorb = 0; }
    t.hp -= dmg;
    this.dice.text(() => t.chest(TMP), (crit ? "✶" : "") + dmg, (t.team === "party" ? "player " : "") + (crit ? "crit" : ""));
    this.log(`  ${dmg} damage to ${t.name}${detail ? " (" + detail + ")" : ""}`);
    t.model.play("hit", 0.35);
    if (t.cast && dmg >= 6 && !t.cast.ab.telegraph && t.team === "party" && t.cast.ab.kind === "spell") { this.log(`${t.name}'s cast is broken!`, "fail"); t.cast = null; }
    if (t.team === "enemy") { t.aggro = true; if (!t.target || Math.random() < 0.3) t.target = src; this.alertGroup(t); }
    this.engage(src, t);
    if (t.team === "enemy" && ENEMIES[t.kind]?.surrender && !t.surrendered && t.hp > 0 && t.hp <= t.stats.maxHp * ENEMIES[t.kind].surrender) {
      t.surrendered = true; t.cast = null; t.intent = null; t.model.play("kneel");
      this.log(`${t.name} throws down their weapon and begs for mercy.`, "moral");
      this.events.onSurrender?.(t);
      return;
    }
    if (t.hp <= 0) {
      t.hp = 0;
      if (t.team === "party") this.down(t);
      else this.kill(t, src);
    }
    // boss phase: summon rats at half health
    if (t.boss && !t._summoned && t.hp < t.stats.maxHp / 2 && t.hp > 0) {
      t._summoned = true;
      const brood = t.kind === "root_matriarch" ? "fen_hound" : t.kind === "tide_keeper" ? "drowned_thrall" : t.kind === "glass_smith" ? "ash_crawler" : "gloam_rat";
      this.log(`${t.name} calls reinforcements from the dark!`, "fail");
      for (let i = 0; i < 3; i++) { const e = this.spawnEnemy(brood, t.pos.clone().add(new THREE.Vector3(Math.cos(i * 2.1) * 5, 0, Math.sin(i * 2.1) * 5)), { spawn: t.spawn + "_brood" }); e.aggro = true; }
    }
  }
  down(t) {
    t.downed = true; t.cast = null;
    t.deathChecks = { t: 4, ok: 0, fail: 0 };
    t.model.play("downed");
    this.log(`${t.name} is downed!`, "fail");
    this.audio.play("death", t.pos, { vol: 0.8 });
    this.events.onDowned?.(t);
  }
  kill(t, src) {
    t.dead = true; t.cast = null; t.intent = null; t.fade = 30;
    t.model.play("death");
    this.audio.play("death", t.pos, { vol: 0.7 });
    this.log(`${t.name} falls.`);
    if (t.unique === "ember") { for (const p of this.actors) if (p.team === "party" && p.alive && p.pos.distanceTo(t.pos) < 3) this.hurt(p, rollDie(6), t, false, "ember burst"); }
    this.events.onKill?.(t, src);
  }

  // ---------- projectiles ----------
  launch(a, ab, t, onHit) {
    const baseKind = ab.projectile;
    const kind = baseKind === "wand" ? `wand:${ab.wandForm}:${ab.wandColor}` : baseKind;
    const col = baseKind === "wand" ? ab.wandColor : ({ arrow: 0xd9c8a0, blade: 0xbfc5b6, thorn: 0x7fbf5a, fire: 0xff7a2a, force: 0x7fb7ff, radiant: 0xffe08a }[kind] || 0xffffff);
    let pool = this.projectilePool.get(kind);
    if (!pool) { pool = []; this.projectilePool.set(kind, pool); }
    let m = pool.pop();
    if (!m) {
      const form = ab.wandForm;
      const geo = baseKind === "wand" ? form === "ring" ? new THREE.TorusGeometry(.22,.055,7,18) : form === "arc" ? new THREE.TorusGeometry(.22,.055,7,18,Math.PI*1.25) : form === "dart" ? new THREE.ConeGeometry(.11,.5,8).rotateX(Math.PI/2) : form === "bloom" ? new THREE.IcosahedronGeometry(.23,1) : new THREE.SphereGeometry(.18,10,8)
        : kind === "arrow" || kind === "blade" ? new THREE.CylinderGeometry(kind === "blade" ? .07 : .02, .02, .8, 5).rotateX(Math.PI / 2) : new THREE.SphereGeometry(0.16, 10, 8);
      m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col }));
    }
    const from = a.model.handWorld?.("R", new THREE.Vector3()) || a.chest(new THREE.Vector3());
    m.position.copy(from);
    this.scene.add(m);
    this.projectiles.push({ m, t, onHit, speed: kind === "arrow" ? 34 : baseKind === "wand" ? (ab.wandMotion?.speed || 26) : 22, kind,
      base: baseKind === "wand" ? from.clone() : null, motion: ab.wandMotion, age: 0 });
    this.audio.play(ab.projectile === "arrow" ? "miss" : "spell", a.pos, { vol: 0.5, rate: ab.projectile === "arrow" ? 1.6 : 1 });
  }

  // ---------- AI ----------
  nearestFoe(a, maxD = 1e9) {
    let best = null, bd = maxD;
    for (const t of this.actors) {
      if (!t.alive || t === a || (t.team === "enemy" && t.parleyNeutral && a.kind !== "hollow")) continue;
      if (a.defender ? t.kind !== "hollow"
        : a.kind === "hollow" ? t.kind === "hollow"
        : a.team === "enemy" ? t.team !== "party" : t.team !== "enemy" || t.surrendered) continue;
      const d = t.pos.distanceTo(a.pos);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  enemyAI(e, dt, player) {
    if (e.defender) {
      const threat = this.nearestFoe(e, 30);
      if (threat && threat.pos.distanceTo(e.home) < 38) {
        e.target = threat; e.aggro = true;
        const distance = e.pos.distanceTo(threat.pos);
        if (e.cast || e.recover > 0) { e.moving = 0; return; }
        if (distance > 2.35) this.move(e, threat.pos.x - e.pos.x, threat.pos.z - e.pos.z, e.stats.speed * 1.2, dt);
        else { e.moving = 0; this.face(e, threat.pos); this.use(e, e.stats.abilities[0], threat); }
      } else {
        e.target = null; e.aggro = false;
        const distance = e.pos.distanceTo(e.home);
        if (distance > 1.5) this.move(e, e.home.x - e.pos.x, e.home.z - e.pos.z, e.stats.speed * .8, dt);
        else e.moving = 0;
      }
      return;
    }
    if (e.kind === "hollow") {
      this.events.prepareHollowPrey?.(e);
      const threat = this.nearestFoe(e, 18);
      if (e.hp <= e.stats.maxHp * .27 && threat) {
        e.fleeing = true; e.feedingRecord = null; e.feedT = 0;
        e.cast = null; e.intent = null;
        if (e.model.pose !== "walk") e.model.play("walk");
        const dx = e.pos.x - threat.pos.x, dz = e.pos.z - threat.pos.z;
        this.move(e, dx || 1, dz || 1, e.stats.speed * 1.55, dt);
        return;
      }
      if (e.fleeing && e.hp > e.stats.maxHp * .4) e.fleeing = false;
      if (e.fleeing) {
        if (e.model.pose !== "walk") e.model.play("walk");
        const dx = e.pos.x - (threat?.pos.x ?? e.home.x), dz = e.pos.z - (threat?.pos.z ?? e.home.z);
        this.move(e, dx || 1, dz || 1, e.stats.speed * 1.3, dt);
        return;
      }
      const feedingPlayer = (this.localPlayers || [player]).find(p => p?.downed && p.feedingHollow === e && !e.dead);
      if (feedingPlayer) {
        e.cast = null; e.intent = null; e.recover = 0;
        const body = feedingPlayer.model.bones?.chest?.getWorldPosition(this.feedingPoint) || this.feedingPoint.copy(feedingPlayer.pos);
        const d = Math.hypot(e.pos.x - body.x, e.pos.z - body.z);
        if (d > 2.45) { if (e.feeding !== "approach") e.model.play("walk"); this.move(e, body.x - e.pos.x, body.z - e.pos.z, e.stats.speed * 1.2, dt); e.feeding = "approach"; }
        else { e.moving = 0; this.face(e, body); if (e.feeding !== "consume" || e.model.pose !== "consume") e.model.play("consume"); e.feeding = "consume"; }
        return;
      }
      const corpse = this.events.nearestCorpse?.(e, 38);
      if (corpse) {
        e.target = null; e.aggro = false; e.cast = null; e.intent = null;
        const distance = Math.hypot(e.pos.x - corpse.x, e.pos.z - corpse.z);
        if (distance > 1.7) {
          e.feedT = 0; e.feedingRecord = corpse.id;
          this.move(e, corpse.x - e.pos.x, corpse.z - e.pos.z, e.stats.speed * 1.12, dt);
          if (e.model.pose !== "walk") e.model.play("walk");
        } else {
          e.moving = 0; this.face(e, corpse);
          if (e.feedingRecord !== corpse.id) e.feedT = 0;
          e.feedingRecord = corpse.id; e.feedT = (e.feedT || 0) + dt;
          if (e.model.pose !== "consume") e.model.play("consume");
          if (e.feedT >= 2.1) { e.feedT = 0; this.events.devourCorpse?.(corpse, e); }
        }
        return;
      }
      if (e.feedingRecord && e.model.pose === "consume") e.model.play("stalk");
      e.feedingRecord = null; e.feedT = 0;
      if (e.feeding) { e.feeding = false; e.model.play("stalk"); }
    }
    if (e.parleyNeutral) { e.moving = 0; return; }
    if (e.surrendered) { e.moving = 0; return; }
    if (e.spawnDef?.roamRadius && !(this.localPlayers || [player]).some(p => p && e.pos.distanceToSquared(p.pos) <= 210 * 210) && !e.aggro) {
      e.moving = 0;
      return;
    }
    if (!e.aggro) {
      const f = this.nearestFoe(e, e.boss ? 16 : 14);
      if (f && (f.pos.distanceTo(e.pos) < 6 || this.world.los(e.eye(new THREE.Vector3()), f.eye(new THREE.Vector3())))) { e.aggro = true; e.target = f; this.alertGroup(e); this.engage(e, f); }
      else { // idle wander
        e.wanderT = (e.wanderT || 0) - dt;
        if (e.wanderT < 0 || (e.moveTarget && Math.hypot(e.moveTarget.x - e.pos.x, e.moveTarget.z - e.pos.z) < 1)) {
          const roam = e.spawnDef?.roamRadius || 6;
          e.wanderT = roam > 6 ? 5 + Math.random() * 5 : 3 + Math.random() * 4;
          for (let attempt = 0; attempt < 8; attempt++) {
            const angle = Math.random() * Math.PI * 2, distance = Math.sqrt(Math.random()) * roam;
            const x = e.home.x + Math.cos(angle) * distance, z = e.home.z + Math.sin(angle) * distance;
            if (Math.abs(x) > 392 || Math.abs(z) > 392 || this.world.inCity(x, z)
              || this.world.heightAt(x, z) < 1 || this.world.slopeAt(x, z) > .45) continue;
            e.moveTarget = new THREE.Vector3(x, this.world.heightAt(x, z), z);
            break;
          }
        }
        if (e.moveTarget && Math.hypot(e.moveTarget.x - e.pos.x, e.moveTarget.z - e.pos.z) > 1)
          this.move(e, e.moveTarget.x - e.pos.x, e.moveTarget.z - e.pos.z, e.stats.speed * (e.spawnDef?.roamRadius ? .38 : .3), dt);
        else e.moving = 0;
        return;
      }
    }
    if (!e.target || !e.target.alive) e.target = this.nearestFoe(e, 40);
    const t = e.target;
    if (!t) { e.aggro = false; e.moving = 0; return; }
    if (e.kind !== "hollow" && e.pos.distanceTo(e.home) > 60 && !e.boss) { e.aggro = false; e.target = null; e.moveTarget = e.home.clone(); return; }
    this.inCombatT = Math.max(this.inCombatT, 3);
    if (e.cast || e.recover > 0) { e.moving = 0; return; }
    const ab0 = ABILITIES[e.stats.abilities[0]];
    const d = e.pos.distanceTo(t.pos) - t.radius;
    // boss special
    if (e.boss && this.canUse(e, "warden_slam") && d < 4 && (e.kind !== "hollow" || Math.random() < .12)) { this.use(e, "warden_slam", t); return; }
    if (e.kind === "hollow") {
      const ready = e.stats.abilities.map((key) => ({ key, ab: ABILITIES[key] }))
        .filter(({ key, ab }) => this.canUse(e, key) && d <= ab.range * .92 && (!ab.range || ab.range <= 4 || this.world.los(e.eye(new THREE.Vector3()), t.chest(new THREE.Vector3()))));
      const reach = Math.max(...e.stats.abilities.map((key) => ABILITIES[key].range));
      if (d > reach * .9) { this.move(e, t.pos.x - e.pos.x, t.pos.z - e.pos.z, e.stats.speed, dt); return; }
      if (!ready.length && d > 3) { this.move(e, t.pos.x - e.pos.x, t.pos.z - e.pos.z, e.stats.speed, dt); return; }
      e.moving = 0; this.face(e, t.pos);
      e.atkT = (e.atkT || 0) - dt;
      if (e.atkT <= 0 && ready.length) {
        e.atkT = .65 + Math.random() * .8;
        const pick = ready[Math.floor(Math.random() * ready.length)];
        this.use(e, pick.key, t);
      }
      return;
    }
    const ranged = ab0.range > 4;
    if (ranged && d < 6) { this.move(e, e.pos.x - t.pos.x, e.pos.z - t.pos.z, e.stats.speed * 0.8, dt); return; }
    if (d > ab0.range * 0.9 || (ranged && !this.world.los(e.eye(new THREE.Vector3()), t.chest(new THREE.Vector3())))) { this.moveCityChase(e, t, dt); return; }
    e.moving = 0;
    this.face(e, t.pos);
    e.atkT = (e.atkT || 0) - dt;
    if (e.atkT <= 0) { e.atkT = 0.4 + Math.random() * 0.8; this.use(e, e.stats.abilities[0], t); }
  }
  companionAI(c, dt, player) {
    if (c.cast || c.recover > 0 || !c.alive) { if (!c.cast) c.moving = 0; return; }
    const abil = c.stats.abilities;
    // heal priorities
    const hurt = this.actors.filter((x) => x.team === "party" && !x.dead && (x.downed || x.hp < x.stats.maxHp * 0.45)).sort((x, y) => x.hp - y.hp)[0];
    if (hurt) for (const k of abil) if (ABILITIES[k].kind === "heal" && this.canUse(c, k)) {
      if (this.inRange(c, k, hurt)) { this.use(c, k, hurt); return; }
      this.move(c, hurt.pos.x - c.pos.x, hurt.pos.z - c.pos.z, c.stats.speed, dt); return;
    }
    // help up a downed ally without heals
    const down = this.actors.find((x) => x.team === "party" && x.downed && x !== c);
    if (down && !this.inCombatT) {
      if (down.pos.distanceTo(c.pos) > 1.6) { this.move(c, down.pos.x - c.pos.x, down.pos.z - c.pos.z, c.stats.speed, dt); return; }
      c.helpT = (c.helpT || 0) + dt;
      if (c.helpT > 2) { c.helpT = 0; down.downed = false; down.feedingHollow = null; down.deathChecks = null; down.hp = 1; down.model.play("revive"); this.log(`${c.name} helps ${down.name} up.`); }
      return;
    }
    let t = player.target && player.target.hostile ? player.target : this.nearestFoe(c, this.inCombat ? 25 : 12);
    if (t && !t.hostile) t = null;
    if (t) {
      const choices = abil.filter((k) => ABILITIES[k].kind !== "heal" && ABILITIES[k].kind !== "buff" && this.canUse(c, k));
      const pickAb = choices.sort((x, y) => (ABILITIES[y].cost || 0) - (ABILITIES[x].cost || 0))[0];
      if (pickAb) {
        if (this.inRange(c, pickAb, t)) { c.moving = 0; this.face(c, t.pos); this.use(c, pickAb, t); return; }
        const basic = abil.find((k) => !ABILITIES[k].cost && ABILITIES[k].kind !== "heal");
        if (basic && this.inRange(c, basic, t) && this.canUse(c, basic)) { this.use(c, basic, t); return; }
        this.move(c, t.pos.x - c.pos.x, t.pos.z - c.pos.z, c.stats.speed, dt); return;
      }
      c.moving = 0; return;
    }
    // follow
    const slot = c.slot ?? 0;
    const ang = player.yaw + Math.PI + (slot - 1) * 0.7;
    const fx = player.pos.x + Math.sin(ang) * 2.6, fz = player.pos.z + Math.cos(ang) * 2.6;
    const d = Math.hypot(fx - c.pos.x, fz - c.pos.z);
    if (d > 30) { c.pos.set(fx, this.world.heightAt(fx, fz), fz); return; }
    if (d > 1.2) this.move(c, fx - c.pos.x, fz - c.pos.z, Math.min(player.stats.speed * 1.25, 2 + d), dt); else c.moving = 0;
  }

  // ---------- tick ----------
  update(dt, player, ctx) {
    this.localPlayers = ctx.localPlayers || [player];
    this.inCombatT = Math.max(0, this.inCombatT - dt);
    for (const a of this.actors) {
      for (const k in a.cd) a.cd[k] = Math.max(0, a.cd[k] - dt);
      for (const k in a.status) { a.status[k] -= dt; if (a.status[k] <= 0) delete a.status[k]; }
      a.buffs = a.buffs.filter((b) => (b.t -= dt) > 0);
      a.recover = Math.max(0, a.recover - dt);
      if (a.stats.resource?.regen && a.alive) a.res = Math.min(a.stats.resource.max, a.res + a.stats.resource.regen * dt);
      if (a.stats.resource?.name === "Tempo" && !this.inCombat) a.res = Math.max(0, a.res - dt * 0.2);
      if (a.cast) {
        a.cast.t += dt;
        if (a.status.staggered > 0 && !a.cast.ab.telegraph) { a.cast = null; a.intent = null; }
        else if (a.cast.t >= a.cast.windup) this.release(a);
      }
      // downed: escalating death checks (party only)
      if (a.downed && a.deathChecks) {
        a.deathChecks.t -= dt;
        if (a.deathChecks.t <= 0 && !a.deathChecks.rolling) {
          const n = a.deathChecks.ok + a.deathChecks.fail;
          a.deathChecks.t = 4;
          const checks = a.deathChecks;
          checks.rolling = true;
          const check = a.player
            ? this.hold.run(`${a.name} · death check`, () => d20Check(0, 10 + n * 2), (x) => describe(x), `d20 +0 · DC ${10 + n * 2}`, a)
            : Promise.resolve(d20Check(0, 10 + n * 2));
          check.then((r) => {
            if (a.deathChecks !== checks) return;
            checks.rolling = false;
            this.dice.combatRoll(`${a.name} · death`, r, { successLabel: "STABLE", failureLabel: "FAILED", side: this.events.isPlayer2?.(a) ? 2 : 1 });
            this.log(`${a.name} death check: ${describe(r)}`, r.success ? "" : "fail");
            if (r.success) checks.ok++; else checks.fail++;
            if (checks.ok >= 3 || r.crit) { a.downed = false; a.feedingHollow = null; a.deathChecks = null; a.hp = 1; a.model.play("revive"); this.log(`${a.name} stabilises and rises.`, "crit"); }
            else if (checks.fail >= 3) { a.deathChecks = null; this.events.onDefeat?.(a); }
          });
        }
      }
      if (!a.player && !a.remote && !a.dead && !a.downed) {
        if (a.team === "enemy" || a.defender) this.enemyAI(a, dt, player);
        else if (a.team === "wildlife" && a.target?.alive) {
          const distance = a.pos.distanceTo(a.target.pos);
          if (distance < 14) this.move(a, a.pos.x - a.target.pos.x || 1, a.pos.z - a.target.pos.z || 1, a.stats.speed, dt);
          else a.moving = 0;
        }
        else if (a.companion) this.companionAI(a, dt, player);
        else if (a.npc) { a.moving = 0; if (a.talkTo) this.face(a, a.talkTo); }
      }
    }
    this.separate();
    // telegraphs
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const g = this.telegraphs[i];
      g.t += dt;
      g.m.material.opacity = 0.2 + 0.5 * (g.t / g.dur);
      if (g.t >= g.dur) { g.m.removeFromParent(); this.telegraphPool.push(g.m); this.telegraphs.splice(i, 1); }
    }
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const to = p.t.chest(TMP);
      const d = (p.base || p.m.position).distanceTo(to);
      if (d < 0.5 || p.t.dead) {
        p.m.removeFromParent(); this.projectiles.splice(i, 1);
        this.projectilePool.get(p.kind).push(p.m);
        if (!p.t.dead) p.onHit();
        continue;
      }
      const step = Math.min(d, p.speed * dt);
      p.m.lookAt(to);
      if (p.base) {
        const direction = TMP.sub(p.base).normalize();
        p.base.addScaledVector(direction, step);
        p.age += dt;
        const side = new THREE.Vector3(-direction.z, 0, direction.x);
        const motion = p.motion || {};
        const bend = (motion.bend || .12) * Math.min(1, d / 3) * Math.sin(p.age * (motion.frequency || 9));
        p.m.position.copy(p.base).addScaledVector(side, bend);
        p.m.rotation.z += (motion.spin || 0) * dt;
      } else p.m.position.addScaledVector(TMP.sub(p.m.position).normalize(), step);
    }
    // models
    const cam = ctx.camera;
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (a.dead && a.team === "enemy" && !a.corpseId) { a.fade -= dt; if (a.fade <= 0) { this.remove(a); continue; } }
      const o = a.model.object;
      const primaryDist = a.pos.distanceTo(cam.position);
      const secondDist = ctx.secondCamera ? a.pos.distanceTo(ctx.secondCamera.position) : Infinity;
      const dist = Math.min(primaryDist, secondDist);
      const visible = dist < ctx.viewDist;
      o.visible = visible;
      for (const h of a.model.hairs || []) if (h.mesh) h.mesh.visible = visible;
      if (!visible) continue;
      o.position.copy(a.pos);
      const fallen = a.dead || a.downed;
      // A settled corpse sleeps: reuse its support height until its terrain,
      // location or facing changes. The expensive mesh probes run during the
      // fall and immediately after an appearance change.
      let settling = false;
      if (fallen) {
        const base = this.world.surfaceHeightAt(a.pos.x, a.pos.z);
        const state = a._groundState ||= { age: 0, x: a.pos.x, z: a.pos.z, yaw: a.yaw, base };
        if (state.x !== a.pos.x || state.z !== a.pos.z || state.yaw !== a.yaw || Math.abs(state.base - base) > .01) {
          state.age = 0; state.x = a.pos.x; state.z = a.pos.z; state.yaw = a.yaw; state.base = base;
        }
        state.age += dt;
        settling = state.age < 2.5 || !Number.isFinite(a.model._groundLift);
        if (!settling) o.position.y = base + a.model._groundLift;
      } else a._groundState = null;
      if (a.model instanceof Character || a.model instanceof Creature) {
        if (fallen) orientBodyToTerrain(a.model, this.world, a.pos, a.yaw);
        else o.rotation.set(0, a.yaw, 0);
      } else o.rotation.y = a.yaw;
      a.model.speed = fallen ? 0 : a.moving || 0;
      a.model.update(dt, { camera: secondDist < primaryDist ? ctx.secondCamera : cam, wind: ctx.wind, simulateHair: dist < ctx.hairDist,
        groundWorld: settling && a.model instanceof Character ? this.world : null, groundAnchor: a.pos,
        hairGround: fallen ? this.world : null });
      if (settling && !(a.model instanceof Character)) groundBody(a.model, this.world, a.pos);
    }
  }

  xpFor(level) { return XP_TABLE[Math.min(XP_TABLE.length - 1, level + 1)] ?? Infinity; }
  clearEnemies() { for (const a of [...this.actors]) if (a.team === "enemy") this.remove(a); }
}
