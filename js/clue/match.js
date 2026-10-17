// The authoritative rules engine. Runs on the local machine (solo/co-op) or
// on the host (online). Pure logic — no three.js. Positions are world metres.
import { SUSPECTS, WEAPONS, WEAPON_BY_ID, ROOM_LIST, ROOM_BY_ID, DAY_SECONDS, LAST_DAY, CHECKLIST, FLICKER_SECONDS, BODY_DRAG_SECONDS, POST_KILL_HIDE_SECONDS, BODY_SEARCH_SECONDS, GHOST_HOLD, cellToWorld, roomAtWorld, clockLabel, roomName, weaponName, itemName, isBig } from "./data.js";
import { ItemMethods, spawnItems, spawnDailySupplies } from "./items.js";
import { TunnelMethods, spawnTorches } from "./tunnels.js";
import { WEAPON_SPOTS, TABLE, PROPS, PROP_RADIUS, SEATS, FURNITURE, FURN_BY_ID, BODY_HIDES, POOL, surfaceAt, PUSHABLES, placePushable } from "./layout.js";
import { findPath, randomPointIn, collide, losClear, BLOCKED_DOORS, DOOR_LIST, HATCH_POS, roomCenter, roomExitBlocked } from "./nav.js";
import { Props, Pool } from "./physics.js";
import { factKey, factText, claimLine, contradicts, short } from "./facts.js";
import { accusationFor, knownKills, judgeKill, argmax, bumpTrust, bumpSocial, LINES, pick } from "./ai.js";
import { trait, soulLine, seedRelations, rememberMatch } from "./souls.js";
import { newStamina, stepStamina } from "./stamina.js";
import { TaskMethods } from "./tasks.js";
import { describeActivity, movementHeading } from "./observe.js";
import { BurnMethods } from "./burning.js";
import { TeamMethods } from "./teamup.js";
import { ButlerMethods } from "./butler.js";
import { optionHint, sceneContext, pickTemper } from "./talk-context.js";
import { mergeHairState, normalizeHairState } from "./hair-state.js";
import {avatarMode as validAvatarMode,humanAvatar} from './avatar-policy.js';
import {LIGHT_SWITCHES,FLOOR_LAMPS,illuminationAt} from './lighting.js';
import {moveBody} from './body-collision.js';
import {BarberMethods} from './barber.js';

const rand = (a, b) => a + Math.random() * (b - a);
const choice = (l) => l[Math.floor(Math.random() * l.length)];
const shuffle = (l) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const WALK = 1.6, HURRY = 4.2, GHOST_SPEED = 2.6;
const inRoom = (r) => r && r !== "hallway" && r !== "cellar" && r !== "tunnels";

export class Match {
  constructor({ humans = [], demo = false, io = {}, killers = 1, avatarMode='mixed', shared = null }) {
    this.avatarMode=validAvatarMode(avatarMode);
    this.lightsOff = {};
    this.haircuts = {};
    this.demo = demo;
    this.io = { toSeat: io.toSeat || (() => {}), broadcast: io.broadcast || (() => {}) };
    this.humans = new Set(humans.map((h) => h.char));
    this.names = Object.fromEntries(humans.map((h) => [h.char, h.name || null]));
    this.chars = new Map();
    for (const s of SUSPECTS) {
      const w = cellToWorld(...s.start);
      const rel = seedRelations(s.id);
      this.chars.set(s.id, {
        id: s.id, human: this.humans.has(s.id), x: w.x, z: w.z, yaw: Math.atan2(-w.x, -w.z), mv: 0, pace: 0, alive: true,
        room: roomAtWorld(w.x, w.z), hands: [null, null], pockets: [null, null], dragging: null, pouring: false, seat: null, auto: null, convo: null, anim: null, animUntil: 0, cards: [], chat: null,
        trust: rel.trust, social: rel.social, isKiller: false, plan: null, path: null, wait: rand(0.5, 2.5), talkCd: rand(8, 20) / (0.5 + trait(s.id, "sociability")), humanCd: rand(18, 35),
        temper: pickTemper(), cur: {}, scapegoat: null, usedWeapons: new Set(), witnessedKillers: {}, peekedEntrances: new Set(), avoidRooms: new Set(), lastPos: { x: w.x, z: w.z }, ghostUsed: false, ghostT: 0, ghostPlan: null, closeDoor: null, stamina: newStamina(),
      });
    }
    this.notes = new Map(SUSPECTS.map((s) => [s.id, { facts: new Map() }]));
    // Weapons have authored homes; secondary weapons are discoveries, not core cards.
    const list = PROPS.map((p) => ({ ...p, y: surfaceAt(p.x, p.z) + p.r }));
    this.weapons = new Map();
    this.cabs = new Set();
    WEAPONS.forEach((w) => {
      const s = WEAPON_SPOTS[w.id];
      const p = { id: w.id, kind: w.id, core: w.core, weapon: true, home: w.home, room: w.home, x: s.x, z: s.z, yaw: s.yaw || 0, stash: s.stash || null, homeStash: s.stash || null, r: PROP_RADIUS[w.id], atBody: false };
      p.y = s.y ?? surfaceAt(p.x, p.z) + p.r;
      list.push(p);
      this.weapons.set(w.id, p);
    });
    spawnItems(list);
    spawnTorches(list);
    this.props = new Props(list);
    for (const p of this.props.list) if (p.stash) this.hideState(p);
    this.stains = []; this.marks = []; this.stainSeq = 1; this.stainV = 1;
    for (const w of this.weapons.values()) w.homePos = { x: w.x, y: w.y, z: w.z, yaw: w.yaw, roll: 0 };
    this.doors = DOOR_LIST.map(() => 0);
    this.doorTarget = DOOR_LIST.map(() => (Math.random() < 0.35 ? 1 : 0));
    // Pushable chests start at home, clear of their doors.
    BLOCKED_DOORS.clear();
    this.pushTarget = {};
    for (const f of PUSHABLES) { placePushable(f, 0); this.pushTarget[f.id] = 0; }
    this.fires = new Set(FURNITURE.filter((f) => f.fire && f.lit).map((f) => f.fire));
    this.stove = false;
    this.pool = new Pool();
    this.poolT = 0;
    this.taskScene = {};
    this.seatsTaken = new Map();
    // One killer, or two. Split-screen partners always share a role: if either
    // draws the killer, both are (and it becomes a two-killer round).
    const first = choice(SUSPECTS).id;
    if (shared?.length > 1) this.killers = shared.includes(first) ? [...shared] : [first];
    else if (killers === 2) this.killers = [first, choice(SUSPECTS.filter((s) => s.id !== first)).id];
    else this.killers = [first];
    this.killer = this.killers[0];
    this.duo = this.killers.length > 1;
    this.lastDay = this.duo ? 10 : LAST_DAY;
    for (const id of this.killers) this.chars.get(id).isKiller = true;
    this.kills = [];
    this.bodies = [];
    this.convos = new Map();
    this.convoSeq = 1;
    this.day = 1;
    this.t = 0;
    this.phase = "intro";
    this.phaseT = demo ? 0.1 : 6;
    this.overtime = false;
    this.flickerSealed = false;
    this.flickerT = 0;
    this.forcedPursuit = null;
    this.postKillUntil = null;
    this.searchUntil = null;
    this.killedToday = false;
    this.roundWound = null;
    this.skipped = false;
    this.acc = null;
    this.winner = null;
    this.sightT = 0;
    this.time = 0;
    this.fullT = -99;
    this.events = [];
    if (!demo) for (const id of this.humans) this.sendRole(id);
  }

  // Rebuild a playable local round from the public state a guest last received.
  // The host's private AI plans are unavailable to guests, so AI chooses fresh plans.
  restoreSnapshot(snap, localChar, hud) {
    this.avatarMode=validAvatarMode(snap.avatarMode);
    this.lightsOff={...snap.lightsOff};
    this.haircuts = {};
    for(const [id,state] of Object.entries(snap.haircuts||{})){const valid=normalizeHairState(id,state);if(valid)this.haircuts[id]=valid;}
    if (!snap?.chars?.length) return false;
    this.humans = new Set([localChar]);
    this.names = {};
    this.day = snap.day || 1;
    this.t = snap.t || 0;
    this.time = (this.day - 1) * DAY_SECONDS + this.t;
    this.phase = snap.ph || "day";
    this.phaseT = this.phase === "intro" ? 1 : 6;
    this.lastDay = snap.ld || LAST_DAY;
    this.duo = this.lastDay > LAST_DAY;
    this.overtime = !!snap.ot;
    this.flickerSealed = !!snap.fs;
    this.flickerT = this.overtime ? 1 : 0;
    this.evacUntil = this.time + 8;
    this.postKillUntil = snap.hide ? this.time + snap.hide : null;
    this.searchUntil = snap.search ? this.time + snap.search : null;
    const knownKillers = [...(hud?.facts?.values() || [])].filter((f) => f.kind === "kill" && f.src === "self" && this.chars.has(f.about) && (hud?.role === "killer" || f.about !== localChar)).map((f) => f.about);
    this.killers = [...new Set([...(hud?.role === "killer" ? [localChar, hud.partner].filter(Boolean) : []), ...knownKillers])];
    const candidates = shuffle([...this.chars.values()].filter((c) => c.id !== localChar && snap.chars.find((r) => r[0] === c.id)?.[5]));
    while (this.killers.length < (this.duo ? 2 : 1)) {
      const next = candidates.find((c) => !this.killers.includes(c.id));
      if (!next) break;
      this.killers.push(next.id);
    }
    this.killers = this.killers.slice(0, this.duo ? 2 : 1);
    this.killer = this.killers[0];
    this.seatsTaken.clear();
    for (const row of snap.chars) {
      const c = this.chars.get(row[0]);
      if (!c) continue;
      c.x = row[1]; c.z = row[2]; c.yaw = row[3]; c.mv = row[4]; c.alive = !!row[5];
      c.room = row[8] || roomAtWorld(c.x, c.z); c.seat = row[9] || null;
      c.hands = [row[10] || null, row[13] || null]; c.pitch = row[12] || 0;
      c.pockets = [row[17] || null, row[18] || null]; c.ko = !!row[16];
      c.human = c.id === localChar; c.isKiller = this.killers.includes(c.id);
      c.plan = c.path = c.auto = c.convo = c.chat = null;
      c.dragging = c.dragKO = null; c.pouring = false;
      c.ghostPlan = c.alive ? null : { at: this.t + 15 };
      if (c.seat) this.seatsTaken.set(c.seat, c.id);
    }
    const player = this.chars.get(localChar);
    if (player) {
      player.cards = [...(hud?.cards || [])];
      player.task = hud?.task || null;
      player.workProgress = { ...(hud?.workProgress || {}) };
      if (hud?.inv) {
        player.hands = hud.inv.hands.map((item) => item?.id || null);
        player.pockets = hud.inv.pockets.map((item) => item?.id || null);
      }
      this.notes.get(localChar).facts = new Map(hud?.facts || []);
    }
    const previous = this.props.byId;
    const props = [];
    for (const row of snap.props || []) {
      const kind = row[11] || previous.get(row[0])?.kind || String(row[0]).replace(/^i_/, "").replace(/\d.*$/, "");
      const p = previous.get(row[0]) || { id: row[0], kind, item: true, r: PROP_RADIUS[kind] || 0.08 };
      p.kind = kind; p.x = row[1]; p.y = row[2]; p.z = row[3]; p.yaw = row[4]; p.roll = row[5];
      p.hidden = !!row[6]; p.holder = row[12] || null; p.stash = row[13] || null; p.pocket = !!row[14]; p.gone = !!row[15];
      p.atBody = !!row[8]; p.bloody = !!(row[9] & 1); p.wet = !!(row[9] & 2); p.lit = !!(row[9] & 4);
      p.burn = null;p.vx=Number.isFinite(row[17])?row[17]:0;p.vy=Number.isFinite(row[18])?row[18]:0;p.vz=Number.isFinite(row[19])?row[19]:0;p.sleep=row[16]===1;p.moved=true;
      props.push(p);
    }
    if (props.length) { this.props.list = props; this.props.byId = new Map(props.map((p) => [p.id, p])); }
    for (const weapon of WEAPONS) if (this.props.byId.has(weapon.id)) this.weapons.set(weapon.id, this.props.byId.get(weapon.id));
    this.doors = [...(snap.doors || this.doors)]; this.doorTarget = [...(snap.doorT || this.doors)];
    BLOCKED_DOORS.clear();
    PUSHABLES.forEach((f, i) => { const t = snap.push?.[i] || 0; placePushable(f, t); this.pushTarget[f.id] = t; if (t > 0.55) BLOCKED_DOORS.add(f.push.door); });
    this.fires = new Set(snap.fires || []); this.stove = !!snap.stove; this.cabs = new Set(snap.cabs || []);
    this.taskScene = snap.taskScene || {}; this.painting = snap.painting ? { url: snap.painting } : null;
    if (snap.pool?.length) { this.pool.balls = snap.pool.map((r, n) => ({ n, x: r[0], z: r[1], in: !!r[2], vx: 0, vz: 0 })); this.pool.moving = false; this.pool.shots = snap.poolShots || 0; }
    this.bodies = (snap.bodies || []).map((r) => ({ victim: r[0], x: r[1], z: r[2], found: !!r[3], room: r[4], yaw: r[5], dragging: null, hideSpot: r[8] || null, weapon: r[9] || WEAPONS[0].id, day: r[10] || this.day, killT: this.time - 10 }));
    this.kills = this.bodies.map((b) => ({ killer: [...(hud?.facts?.values() || [])].find((f) => f.kind === "kill" && f.src === "self" && f.victim === b.victim)?.about || this.killer, victim: b.victim, weapon: b.weapon, room: b.room, day: b.day, t: 0 }));
    this.killedToday = this.bodies.some((b) => b.day === this.day);
    this.skipped = !snap.ka && !this.killedToday && this.isKillDay();
    this.stains = (snap.stains || []).map((r) => ({ id: r[0], x: r[1], z: r[2], r: r[3], rot: r[4], k: r[5], s: r[6], e: r[7], room: roomAtWorld(r[1], r[2]), day: this.day }));
    this.marks = (snap.marks || []).map((r) => ({ id: r[0], x: r[1], z: r[2], r: r[3], rot: r[4], wet: 1 }));
    this.stainSeq = Math.max(0, ...this.stains.map((s) => s.id), ...this.marks.map((m) => m.id)) + 1;
    this.stainV++;
    if (snap.butler) { this.startButlerDay(this.day); if (this.butler) { this.butler.x = snap.butler[0]; this.butler.z = snap.butler[1]; this.butler.yaw = snap.butler[2]; this.butler.room = snap.butler[7]; } }
    if (this.phase === "accuse") this.startAccusation();
    return true;
  }

  // ---------- helpers ----------
  living() { return [...this.chars.values()].filter((c) => c.alive); }
  // Kill days: odd days with one killer; day 1 then every third day with two.
  isKillDay(day = this.day) { return day === 1 || (this.duo ? (day - 1) % 3 === 0 : day % 2 === 1); }
  killAllowed() { return this.phase === "day" && !this.killedToday && !this.skipped && this.isKillDay(); }
  // Killers still in play (alive, not caught).
  activeKillers() { return this.killers.map((id) => this.chars.get(id)).filter((c) => c.alive); }
  partnerOf(c) { return this.killers.find((id) => id !== c.id) || null; }
  toSeat(id, msg) { if (this.humans.has(id)) this.io.toSeat(id, msg); }
  broadcast(msg) { this.io.broadcast(msg); }
  fx(type, data = {}) { this.broadcast({ type: "fx", fx: type, ...data }); }
  say(c, text, dur = 3.4) {
    if (this.demo) text = pick(LINES.demo);
    c.say = { text, until: this.time + dur };
    this.broadcast({ type: "say", id: c.id, text, room: c.room, dur });
  }
  sendRole(id) { const k = this.killers.includes(id); this.toSeat(id, { type: "role", killer: k, partner: k ? this.killers.find((x) => x !== id) || null : null, duo: this.duo, lastDay: this.lastDay }); }

  learn(id, fact, src = "self") {
    const note = this.notes.get(id);
    const k = factKey(fact);
    const old = note.facts.get(k);
    if (old) { if (fact.kind === "saw" && fact.t1 > old.t1) old.t1 = fact.t1; return false; }
    const f = { ...fact, src, key: k };
    note.facts.set(k, f);
    if (this.humans.has(id)) this.toSeat(id, { type: "fact", fact: publicFact(f), privateContext: src === "self" ? this.privateWitnessContext(id, f) : null });
    return true;
  }
  // Only the killer's own seat receives this context. It is for private
  // thoughts, never a shareable notebook fact or a claim to another guest.
  privateWitnessContext(id, fact) {
    const c = this.chars.get(id);
    if (!c?.isKiller || !["blood", "body", "wound", "dragged", "cleaning", "bleach"].includes(fact.kind)) return null;
    const ownKill = [...this.kills].reverse().find((k) => k.killer === id && k.day === fact.day && k.room === fact.room);
    const wounded = this.roundWound?.killer === id ? this.chars.get(this.roundWound.victim)?.wound : null;
    const ownWound = wounded?.room === fact.room && wounded?.day === fact.day ? this.roundWound.victim : null;
    return { ownVictim: ownKill?.victim || ownWound || null, draggingVictim: c.dragging || null };
  }
  addCard(c, type, id) {
    if (this.day !== 1 || c.cards.length >= 12) return;
    if (c.cards.some((x) => x.type === type && x.id === id)) return;
    c.cards.push({ type, id });
    this.toSeat(c.id, { type: "cards", cards: c.cards });
  }
  // How clearly o can see p right now, 0..1. Sight is a cone in front of
  // the eyes (sharp ahead, faint at the edges, nothing behind), needs a clear
  // line through walls and doors, and fades with distance; sharp-eyed souls
  // see further. Someone brushing past at arm's length is always noticed.
  perceive(o, p) {
    if (!o || !p || o.ko || o === p) return 0;
    return this.perceiveAt(o, p.x, p.z, p.room);
  }
  perceiveAt(o, x, z, room = roomAtWorld(x, z)) {
    if (!o || o.ko) return 0;
    const p = { x, z, room };
    const d = dist(o, p);
    if (d < 0.001) return 0.9;
    if (o.room === "tunnels" || room === "tunnels") {
      if (o.room !== room || !this.seesUnderground(o, p)) return 0;
    } else if (!losClear(o.x, o.z, x, z, this.doors)) return 0;
    const cos = (Math.sin(o.yaw) * (p.x - o.x) + Math.cos(o.yaw) * (p.z - o.z)) / d;
    // Even at arm's length, something behind the eyes is not a sighting.
    const fov = cos >= 0.5 ? 1 : cos >= 0.25 ? 0.35 + 0.65 * (cos - 0.25) / 0.25 : 0;
    if (!fov) return 0;
    const illumination=room==='tunnels'?1:illuminationAt(x,z,{off:this.lightsOff,props:this.props.list,fires:[...this.fires],doors:this.doors});
    if (d < 1.3) return fov * (.35+.55*illumination);
    const range = (6 + 9 * trait(o.id, "observation"))*(.15+.85*Math.sqrt(illumination));
    const far = Math.max(0, Math.min(1, 1 - (d - 2.5) / (range - 2.5)));
    const light = this.overtime ? 0.65 : 1;
    return fov * far * light * (.12+.88*Math.sqrt(illumination));
  }
  // Can o see p right now? Anything clearer than a vague shape counts.
  sees(o, p) { return this.perceive(o, p) > 0.12; }
  // Hearing needs no line of sight, only being close enough in the same space.
  hears(o, p, range = 8) { return !!o && !!p && !o.ko && o.room === p.room && dist(o, p) < (o.room === "hallway" ? 6 : range); }

  // ---------- tick ----------
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.updateWorld(dt);
    this.updateBarber(dt);
    if (this.phase === "intro") { this.phaseT -= dt; if (this.phaseT <= 0) this.startDay(1); return; }
    if (this.phase === "over") return;
    if (this.phase === "night" || this.phase === "body") {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.demo) { this.phase = "over"; this.winner = "demo"; return; }
        if (this.checkKillerWin()) return;
        if (this.phase === "night") this.startDay(this.day + 1);
        else this.startAccusation();
      }
      return;
    }
    if (this.phase === "accuse") { this.updateAccusation(dt); this.updateBots(dt, true); return; }
    // --- day ---
    this.t += dt;
    for (const c of this.chars.values()) if (c.alive) c.room = roomAtWorld(c.x, c.z) || c.room;
    this.sightT -= dt;
    if (this.sightT <= 0) { this.sightT = 0.5; this.sightings(); }
    this.updateBots(dt, false);
    this.updateBleeding();
    this.updateGhosts(dt);
    this.updateChats(dt);
    this.updateConvos();
    this.faceConversationPartners();
    this.updateTasks();
    this.checkBodies();
    // Discovering a body changes the phase. Never run the day timeout after it.
    if (this.phase !== "day") return;
    const len = this.demo ? 75 : DAY_SECONDS;
    if (this.overtime) { this.updateFlicker(dt); return; }
    if (this.searchUntil !== null) {
      if (this.time >= this.searchUntil) {
        this.broadcast({ type: "toast", text: "No one found the body. A new day begins." });
        this.startDay(this.day + 1);
      }
      return;
    }
    if (this.t >= len) {
      if (this.killAllowed() && this.activeKillers().length) { this.startFlicker(); return; }
      if (this.day >= 2) this.startAccusation();
      else this.startDay(this.day + 1);
    }
  }

  // Doors, physics, pool, carried objects.
  updateWorld(dt) {
    this.updatePushables(dt);
    for (let i = 0; i < this.doors.length; i++) {
      const t = this.doorTarget[i], o = this.doors[i];
      if (o !== t) this.doors[i] = o < t ? Math.min(t, o + dt * 1.6) : Math.max(t, o - dt * 1.9);
    }
    // Carried props follow their holder's hands.
    for (const c of this.chars.values()) {
      for (const id of c.pockets) { const p = id && this.props.byId.get(id); if (p) { p.x = c.x; p.z = c.z; p.y = 1; } }
      if (c.alive && this.phase === "day") { this.updatePour(c, dt); if (c.dragging) this.updateDrag(c, dt); if (c.dragKO) this.updateKODrag(c, dt); }
      const ids = this.handIds(c);
      if (!ids.length) continue;
      const ghost = !c.alive;
      const pitch = c.pitch || 0;
      for (const id of ids) {
        const p = this.props.byId.get(id);
        if (!p) { c.hands = c.hands.map((h) => (h === id ? null : h)); continue; }
        const both = c.hands[0] === c.hands[1];
        const side = both ? 0 : id === c.hands[0] ? -0.22 : 0.22;
        if (c.hand && this.time - c.hand.t < 0.5 && (both || id === c.hands[1] || ids.length === 1)) { p.x = c.hand.x; p.y = c.hand.y; p.z = c.hand.z; }
        else {
          const f = both ? 0.55 : 0.42;
          p.x = c.x + Math.sin(c.yaw) * f + Math.cos(c.yaw) * -side; p.z = c.z + Math.cos(c.yaw) * f - Math.sin(c.yaw) * -side;
          p.y = (c.seat ? 0.9 : both ? 1.1 : 1.0) + (ghost ? 0.15 + Math.sin(this.time * 3) * 0.06 : 0) + Math.max(-0.3, Math.min(0.4, pitch * 0.4));
        }
        p.vx = p.vy = p.vz = 0; p.moved = true; p.yaw = c.yaw;
      }
      if (ghost) {
        c.ghostT += dt;
        if (c.ghostT >= GHOST_HOLD) { this.release(c, { x: Math.sin(c.yaw) * 0.6, y: 0, z: Math.cos(c.yaw) * 0.6 }); this.toSeat(c.id, { type: "toast", text: "The object slips from your spectral grasp." }); }
      }
    }
    const walkers = [...this.chars.values()].map((c) => ({ id: c.id, x: c.x, z: c.z, mv: c.mv, ghost: !c.alive || !!c.seat || !!c.ko }));
    const hits = this.props.step(dt, this.doors, walkers);
    this.updateTorches();
    for (const h of hits) {
      if (h.hitChar) this.onPropHit(h.prop, h.hitChar);
      else if (h.speed > 1.6) this.fx("thud", { x: h.prop.x, z: h.prop.z, v: Math.min(1, h.speed / 5) });
    }
    this.updateBurning(dt);
    this.updateTeams(dt);
    this.updateButler(dt);
    const pr = this.pool.step(dt);
    if (pr) { this.poolT = this.time; if (pr.clacks) this.fx("pool", { x: POOL.x, z: POOL.z, v: Math.min(1, pr.clacks * 0.4) }); }
    if (pr?.sunk && this.phase === 'day') { const shooter = this.chars.get(this.poolShooter); if (shooter) { this.completeTask(shooter, 'pool'); this.toSeat(shooter.id, { type: 'toast', text: 'Skull pocketed!' }); } }
  }

  startDay(day) {
    this.settleTasks(); this.settleTeams();
    this.day = day;
    this.t = 0;
    this.phase = "day";
    this.overtime = false;
    this.flickerSealed = false;
    this.flickerT = 0;
    this.forcedPursuit = null;
    this.postKillUntil = null;
    this.searchUntil = null;
    this.killedToday = false;
    this.roundWound = null;
    this.skipped = false;
    this.broadcast({ type: "flicker", on: false });
    this.wakeAll("A new night. You wake with a pounding head.");
    for (const c of this.chars.values()) {
      c.koDragT = 0; c.dragKO = null; c.bodyDragT = 0;
      c.cur = {}; c.plan = null; c.path = null; c.auto = null; c.hideHatch = null; c.wait = rand(0.3, 2); c.talkCd = rand(4, 12); c.humanCd = rand(10, 25);
      c.ghostUsed = false; c.ghostT = 0; c.ghostPlan = c.alive ? null : { at: rand(15, 70) };
      if (c.seat) this.stand(c);
    }
    // The garbage is taken out overnight; weapons go home; blood stays.
    if (day > 1) this.emptyBins();
    spawnDailySupplies(this, day);
    for (const c of this.chars.values()) { c.pouring = false; if (c.dragging) this.stopDrag(c); }
    for (const w of this.weapons.values()) {
      if (w.holder) { const h = this.chars.get(w.holder); if (h) { h.hands = h.hands.map((x) => (x === w.id ? null : x)); h.pockets = h.pockets.map((x) => (x === w.id ? null : x)); this.sendInv(h); } w.holder = null; }
      if (w.atBody || day > 1) Object.assign(w, w.homePos, { room: w.home, atBody: false, bloody: false, pocket: false, stash: w.homeStash, hidden: false, vx: 0, vy: 0, vz: 0, sleep: false, moved: true });
    }
    for (const b of this.bodies) b.dragging = false;
    let bleedDeath = false;
    for (const c of this.living()) if (c.wound && day > c.wound.day + 1) { this.bleedOut(c); bleedDeath = true; }
    if (bleedDeath && this.checkKillerWin()) return;
    this.pool.rack(); this.poolT = this.time; this.poolShooter = null;
    this.assignTasks();
    this.startButlerDay(day);
    this.broadcast({ type: "day", day, killDay: this.isKillDay(day) && !this.killedToday, lastDay: this.lastDay, remainingBodies: this.bodies.filter((b) => !b.found).map((b) => b.victim), sfx: "chime" });
  }

  // ---------- lights flickering ----------
  startFlicker(afterKill = false) {
    if (this.phase !== "day" || this.overtime) return;
    if (!afterKill && (this.t < (this.demo ? 75 : DAY_SECONDS) || !this.killAllowed())) return;
    this.overtime = true;
    this.flickerSealed = false;
    this.flickerT = 0;
    this.forcedPursuit = null;
    this.evacUntil = this.time + FLICKER_SECONDS;
    this.postKillUntil = afterKill ? this.time + POST_KILL_HIDE_SECONDS : null;
    this.wakeAll("The lights begin to flicker — you jolt awake.");
    for (const c of this.chars.values()) { c.koDragT = 0; if (c.dragKO) this.stopKODrag(c); }
    for (const c of this.chars.values()) { c.peekedEntrances.clear(); c.avoidRooms.clear(); c.peekCompelled = null; }
    this.decideAt = null;
    for (const id of [...this.convos.keys()]) this.endConvo(id, true);
    for (const c of this.chars.values()) if (c.chat) this.endChat(c);
    const killDay = !afterKill && this.killAllowed();
    this.broadcast({ type: "toast", text: afterKill ? "The lights fail. Stay inside until the halls reopen." : killDay ? "The lights flicker… get into a room!" : "The lights flicker…", sfx: "thunder" });
    this.broadcast({ type: "flicker", on: true, afterKill });
    // Guests already inside stay put. Everyone else walks to a reachable
    // refuge, including those who must climb out of the tunnels first.
    for (const c of this.living()) {
      if (c.isKiller) continue;
      if (c.seat) this.stand(c);
      if (c.dragging) this.stopDrag(c);
      c.auto = null; c.path = null; c.plan = null; c.mv = c.pace = 0;
      if (!c.human) c.wait = rand(0.5, 1.8);
      c.lockRoom = inRoom(c.room) ? c.room : null;
      if (!c.lockRoom) {
        this.routeToRefuge(c);
        if (c.human) this.toSeat(c.id, { type: "toast", text: "You hurry toward the nearest room as the lights fail." });
      }
    }
    this.sealFlickerWhenReady();
  }
  routeToRefuge(c) {
    const targets = c.room === "tunnels"
      ? Object.values(HATCH_POS).map((h) => ({ room: h.room, x: h.tx, z: h.tz }))
      : DOOR_LIST.filter((d) => inRoom(d.room)).map((d) => ({ room: d.room, x: d.mid.x + d.n.x * 1.5, z: d.mid.z + d.n.z * 1.5 }));
    // Compare walking distance along real paths, not distance through walls.
    // A ladder is a short climb; its large grid offset is not walking distance.
    let best = null;
    for (const goal of targets) {
      const path = findPath(c.x, c.z, goal.x, goal.z);
      if (!path?.length || roomAtWorld(goal.x, goal.z) !== goal.room) continue;
      let length = 0, x = c.x, z = c.z;
      for (const p of path) {
        length += p.passage ? 2.2 : Math.hypot(p.x - x, p.z - z);
        x = p.x; z = p.z;
      }
      if (!best || length < best.length) best = { path, goal, length };
    }
    c.refugeRetryAt = this.time + 1;
    if (!best) { c.auto = null; c.path = null; c.plan = null; return false; }
    c.path = best.path;
    c.auto = c.path;
    c.plan = { goal: { x: best.goal.x, z: best.goal.z }, hurry: true, refuge: best.goal.room };
    return true;
  }
  sealFlickerWhenReady() {
    if (this.flickerSealed) return true;
    if (this.living().some((c) => !c.isKiller && !c.lockRoom)) return false;
    this.flickerSealed = true;
    this.flickerT = 0;
    if (this.postKillUntil !== null) this.postKillUntil = this.time + POST_KILL_HIDE_SECONDS;
    for (let i = 0; i < this.doors.length; i++) this.setDoor(i, false);
    this.broadcast({ type: "toast", text: "Every door slams shut. Stay inside." });
    return true;
  }
  updateFlicker(dt) {
    for (const c of this.living()) {
      if (c.isKiller || c.lockRoom) continue;
      if (c.path?.length) this.walk(c, dt, true);
      c.room = roomAtWorld(c.x, c.z) || c.room;
      if (!c.path?.length && inRoom(c.room)) {
        c.lockRoom = c.room; c.auto = null; c.path = null; c.plan = null; c.mv = c.pace = 0;
      } else if (!c.path?.length && this.time >= (c.refugeRetryAt || 0)) this.routeToRefuge(c);
    }
    if (!this.sealFlickerWhenReady()) {
      if (this.time >= this.evacUntil) this.endFlicker();
      return;
    }
    const ks = this.activeKillers();
    const killDay = this.killAllowed() && ks.length > 0;
    this.flickerT += dt;
    if (this.flickerT > 1.5) this.roomBoundBots(dt);
    if (this.postKillUntil !== null) {
      this.hideBodyDuringLockdown(dt);
      if (this.time >= this.postKillUntil) this.endFlicker();
      return;
    }
    if (!killDay) { if (this.flickerT > (this.killedToday ? FLICKER_SECONDS : 8)) { this.endFlicker(); } return; }
    // Only one kill per killing round, whichever killer gets there first.
    for (const k of ks) {
      if (this.killedToday) break;
      if (k.peekCompelled) { this.advancePeekCompulsion(k, dt); continue; }
      if (this.forcedPursuit?.killer === k.id) continue;
      const target = this.killTarget(k);
      if (k.human) {
        const key = target ? target.id : null;
        if (key !== k.offered) { k.offered = key; this.toSeat(k.id, { type: "decide", target: key, forced: true, until: this.day === 1 ? 6 : 0 }); if (key && this.day === 1) k.decideAt = this.time + 6; }
        if (target && this.day === 1 && !this.roundWound && k.decideAt && this.time >= k.decideAt) this.decide(k, true);
      } else if (!target) {
        if (!k.path?.length || this.flickerT % 2 < dt) {
          const roomsWith = this.living().filter((c) => !c.isKiller && inRoom(c.lockRoom || c.room) && !k.avoidRooms.has(c.lockRoom || c.room));
          const v = roomsWith.sort((a, b) => dist(a, k) - dist(b, k))[0];
          if (v) { const p = randomPointIn(v.lockRoom || v.room); this.goTo(k, p.x, p.z, { hurry: true }); }
        }
        if (k.path?.length) this.walk(k, dt);
      } else if (this.flickerT > 3 + Math.random() * 2) {
        // A human partner gets first refusal; the AI one waits a moment longer.
        if (ks.some((o) => o !== k && o.human && this.killTarget(o)) && this.flickerT < 9) continue;
        this.decide(k, true);
      }
    }
    if (this.killedToday) return;
    // Every killing day requires its kill, including a second strike on a wound.
    if (this.flickerT >= FLICKER_SECONDS * 2 && !ks.some((k) => k.peekCompelled)) this.forcedKill(dt);
  }
  // A peek is resolved at the entrance. Success reveals the room without
  // opening it; failure is noticed and commits the killer to walking inside.
  peekRoom(k, kind, id) {
    if (!k?.isKiller || !k.alive || k.ko || k.auto || k.peekCompelled || !this.overtime || !this.flickerSealed || !this.killAllowed()) return null;
    let room, goal;
    if (kind === "door") {
      const d = Number.isInteger(id) && DOOR_LIST[id];
      if (!d || !inRoom(d.room) || BLOCKED_DOORS.has(id) || Math.hypot(k.x - d.mid.x, k.z - d.mid.z) > 1.9) return null;
      const side = (k.x - d.mid.x) * d.n.x + (k.z - d.mid.z) * d.n.z;
      if (side > -0.25 || roomAtWorld(k.x, k.z) === d.room) return null;
      if (this.doorTarget[id] > 0.5 || this.doors[id] > 0.05) { this.toast(k, "Close the door before peeking."); return null; }
      room = d.room;
      goal = { x: d.mid.x + d.n.x * 1.5, z: d.mid.z + d.n.z * 1.5 };
    } else if (kind === "hatch") {
      const h = typeof id === "string" && HATCH_POS[id];
      if (!h || k.room !== "tunnels" || Math.hypot(k.x - h.bx, k.z - h.bz) > 1.8) return null;
      room = h.room;
      goal = { x: h.tx, z: h.tz };
    } else return null;
    const entry = `${kind}:${id}`;
    if (k.peekedEntrances.has(entry)) { this.toast(k, "You have already checked this entrance tonight."); return null; }
    const path = findPath(k.x, k.z, goal.x, goal.z);
    const throughEntrance = kind === "door" ? path?.some((p) => p.door === id) : path?.some((p) => p.passage && p.hatch === id);
    if (!throughEntrance) { this.toast(k, "There is no way through this entrance."); return null; }
    k.peekedEntrances.add(entry);
    const roll = 1 + Math.floor(Math.random() * 20);
    const bonus = Math.round((trait(k.id, "stealth") - 0.5) * 10);
    const dc = 11;
    const success = roll === 20 || (roll !== 1 && roll + bonus >= dc);
    const people = this.living().filter((o) => o !== k && o.room === room);
    const targets = people.filter((o) => !o.isKiller);
    this.toSeat(k.id, { type: "peekResult", room, roll, bonus, dc, success, count: people.length, killRequired: targets.length > 0, people: success ? people.map((o) => o.id) : null });
    if (success) {
      this.learn(k.id, { kind: "peek", room, people: people.map((o) => o.id), entry, private: true, day: this.day, t0: Math.round(this.t) }, "self");
      if (!k.human && targets.length > 1) k.avoidRooms.add(room);
      return { success, people, witnessRisk: targets.length > 1 };
    }
    for (const o of people) this.learn(o.id, { kind: "peekCaught", about: k.id, room, entry, day: this.day, t0: Math.round(this.t) }, "self");
    const victim = targets.find((o) => o.id === this.roundWound?.victim) || targets[0] || null;
    k.peekCompelled = { room, entry: goal, victim: victim?.id || null, retryAt: this.time + 1, until: this.time + FLICKER_SECONDS };
    k.path = path; k.auto = path; k.plan = { goal, hurry: true, peekCompelled: true };
    k.offered = null; k.decideAt = null;
    this.toSeat(k.id, { type: "decide", target: null });
    return { success, people, witnessRisk: targets.length > 1 };
  }
  advancePeekCompulsion(k, dt) {
    const state = k.peekCompelled;
    if (!state) return;
    if (this.time >= state.until) {
      this.toast(k, "The way in is blocked. The lights steady.");
      this.endFlicker();
      return;
    }
    const occupants = this.living().filter((o) => !o.isKiller && o.room === state.room);
    let victim = this.chars.get(state.victim);
    if (!victim?.alive || victim.room !== state.room) {
      victim = occupants.find((o) => o.id === this.roundWound?.victim) || occupants[0] || null;
      state.victim = victim?.id || null;
    }
    if (k.path?.length) this.walk(k, dt, true);
    k.room = roomAtWorld(k.x, k.z) || k.room;
    if (victim && k.room === state.room && dist(k, victim) <= 2.8) {
      const witnesses = occupants.filter((o) => o !== victim);
      k.peekWitnesses = witnesses.map((o) => o.id);
      this.ensureWeapon(k);
      this.broadcast({ type: "toast", text: "The lights go out!", sfx: "thunder" });
      this.strike(k, victim, true);
      if (victim.alive) this.strike(k, victim, true);
      k.peekWitnesses = null;
      const murder = [...this.kills].reverse().find((entry) => entry.killer === k.id && entry.victim === victim.id && entry.day === this.day);
      if (murder) for (const o of witnesses) if (o.alive) {
        const fact = { kind: "kill", about: k.id, victim: victim.id, weapon: murder.weapon, room: murder.room, day: this.day, t0: murder.t };
        this.learn(o.id, { kind: "tod", about: victim.id, day: this.day, t: murder.t }, "self");
        o.witnessedKillers[k.id] = fact;
        bumpTrust(o, k.id, -6); bumpSocial(o, k.id, 12);
      }
      k.peekCompelled = null; k.auto = null; k.path = null; k.plan = null;
      return;
    }
    if (!victim && k.room === state.room && !k.path?.length) {
      k.peekCompelled = null; k.auto = null; k.plan = null; return;
    }
    if (!k.path?.length && this.time >= state.retryAt) {
      const goal = victim || state.entry;
      this.goTo(k, goal.x, goal.z, { hurry: true, peekCompelled: true });
      k.auto = k.path;
      state.retryAt = this.time + 1;
    }
  }
  // Frightened guests stay inside their refuge, where they can still talk,
  // sit and interact with the room. Their routes never use a doorway.
  roomBoundBots(dt) {
    for (const c of this.living()) {
      if (c.human || c.isKiller || !inRoom(c.lockRoom || c.room) || c.ko) continue;
      const room = c.lockRoom || c.room;
      c.talkCd -= dt; c.humanCd -= dt;
      if (c.convo || c.chat) {
        const partner = this.chars.get(c.chat?.with || this.convoPartner(c));
        if (partner) c.yaw = Math.atan2(partner.x - c.x, partner.z - c.z);
        c.mv = c.pace = 0;
        continue;
      }
      if (c.seat) {
        c.mv = c.pace = 0;
        c.wait -= dt;
        if (c.wait <= 0) { c.darkSeat = c.seat; c.darkSeatUntil = this.time + 8; this.stand(c); c.wait = rand(0.5, 1.5); }
        continue;
      }
      if (c.path?.length) {
        if (c.plan?.roomBound !== room || c.path.some((p) => p.passage || p.door !== undefined || roomAtWorld(p.x, p.z) !== room)) { c.path = null; c.plan = null; }
        else {
          const oldX = c.x, oldZ = c.z;
          this.walk(c, dt);
          if (roomAtWorld(c.x, c.z) !== room || roomExitBlocked(room, oldX, oldZ, c.x, c.z)) { c.x = oldX; c.z = oldZ; c.path = null; c.plan = null; c.mv = c.pace = 0; }
          else if (!c.path?.length && c.plan?.arrive) {
            const plan = c.plan, fn = plan.arrive;
            plan.arrive = null;
            if (Math.hypot(c.x - plan.goal.x, c.z - plan.goal.z) < (plan.reach || 1.5)) fn();
            else { c.plan = null; c.wait = 1; }
          }
          continue;
        }
      }
      c.mv = c.pace = 0;
      c.wait -= dt;
      if (c.wait > 0) continue;
      const near = this.living().filter((o) => o !== c && !o.ko && o.room === room && !o.convo && !o.chat && dist(o, c) < 8).sort((a, b) => dist(a, c) - dist(b, c));
      const human = c.humanCd <= 0 && near.find((o) => o.human && this.globalHumanCd(o));
      const npc = c.talkCd <= 0 && near.find((o) => !o.human && !o.isKiller && o.talkCd <= 0);
      const other = human || npc;
      // A sociable guest often seeks company, but does not spend the whole
      // blackout waiting for someone to become available to talk to.
      if (other && Math.random() < 0.35 + trait(c.id, "sociability") * 0.45) {
        if (human) { c.humanCd = rand(30, 48); human._approachedAt = this.time; }
        else c.talkCd = rand(15, 25);
        const reach = human ? 3.4 : 2.8;
        const talk = () => {
          if (!other.alive || other.ko || other.room !== room || other.convo || other.chat || dist(c, other) >= reach) return;
          if (other.human) this.startConvo(c, other);
          else this.startChat(c, other);
        };
        if (dist(c, other) < reach) talk();
        else this.roomBoundGoTo(c, room, other.x, other.z, reach, talk);
      } else this.roomBoundActivity(c, room);
      if (!c.seat && !c.path?.length) c.wait = Math.max(c.wait, rand(1, 2.5));
    }
  }
  // Only accept paths whose entire route stays on this side of every door.
  // Interaction points inside furniture are snapped by findPath as usual.
  roomBoundGoTo(c, room, x, z, reach, arrive) {
    if (roomAtWorld(x, z) !== room) return false;
    if (Math.hypot(c.x - x, c.z - z) < reach && losClear(c.x, c.z, x, z, this.doors)) { arrive(); return true; }
    const path = findPath(c.x, c.z, x, z);
    if (!path?.length) return false;
    let px = c.x, pz = c.z;
    for (const p of path) {
      if (p.passage || p.door !== undefined || roomAtWorld(p.x, p.z) !== room || roomExitBlocked(room, px, pz, p.x, p.z)) return false;
      px = p.x; pz = p.z;
    }
    c.path = path;
    c.plan = { goal: { x: path.at(-1).x, z: path.at(-1).z }, roomBound: room, reach, arrive };
    return true;
  }
  // Small, visible choices for guests who are shut in a room: settle into a
  // chair, handle a loose object, tend a cupboard, or pace by the furniture.
  roomBoundActivity(c, room) {
    const T = (key) => trait(c.id, key);
    const options = [];
    const add = (weight, run) => { if (weight > 0) options.push([weight, run]); };
    const held = this.handIds(c).map((id) => this.props.byId.get(id)).find((p) => p && !p.core && !p.item && !p.weapon);
    if (held) {
      const surfaces = FURNITURE.filter((f) => f.room === room && f.solid !== false && f.top >= 0.4 && f.top <= 1.2 && /table|desk|counter|island|bar|shelf|cart|workbench|credence|sideboard/i.test(f.type));
      const f = surfaces.length ? choice(surfaces) : null;
      const goal = f ? { x: f.x + Math.sin(f.rot) * (f.fd / 2 + 0.7), z: f.z + Math.cos(f.rot) * (f.fd / 2 + 0.7) } : randomPointIn(room);
      const putDown = () => {
        if (!c.hands.includes(held.id)) return;
        const at = f ? { x: Math.max(f.x - f.fw / 2 + 0.15, Math.min(f.x + f.fw / 2 - 0.15, c.x)), z: Math.max(f.z - f.fd / 2 + 0.15, Math.min(f.z + f.fd / 2 - 0.15, c.z)), y: f.top } : null;
        this.release(c, { x: 0, y: 0, z: 0 }, at, held.id);
        c.darkHandled = held.id; c.darkHandledUntil = this.time + 12;
        c.wait = rand(1.5, 3);
      };
      if (!this.roomBoundGoTo(c, room, goal.x, goal.z, 1.6, putDown)) putDown();
      return;
    }
    const seats = SEATS.filter((s) => s.room === room && !this.seatsTaken.has(s.id) && (s.id !== c.darkSeat || this.time >= (c.darkSeatUntil || 0)));
    if (seats.length) add(0.8 + (1 - T("restlessness")) * 1.5, () => {
      const s = seats.sort((a, b) => dist(a, c) - dist(b, c))[0];
      this.roomBoundGoTo(c, room, s.x + Math.sin(s.yaw) * 0.6, s.z + Math.cos(s.yaw) * 0.6, 1.4, () => {
        if (c.lockRoom !== room || this.seatsTaken.has(s.id)) return;
        this.sit(c, s.id); c.wait = rand(5, 12) * (1.3 - T("restlessness") * 0.4);
      });
    });
    const loose = this.props.list.filter((p) => !p.core && !p.item && !p.weapon && !p.holder && !p.hidden && !p.stash && !p.gone && (p.id !== c.darkHandled || this.time >= (c.darkHandledUntil || 0)) && roomAtWorld(p.x, p.z) === room && dist(p, c) < 8);
    if (loose.length && c.hands.includes(null)) add(0.5 + T("curiosity") * 1.4 + T("tidiness") * 0.5, () => {
      const p = choice(loose);
      this.roomBoundGoTo(c, room, p.x, p.z, 2.1, () => {
        if (c.lockRoom === room && roomAtWorld(p.x, p.z) === room && this.grab(c, p.id)) c.wait = rand(1, 2.5);
      });
    });
    const cabinets = FURNITURE.filter((f) => f.room === room && f.cab && (f.id !== c.darkCab || this.time >= (c.darkCabUntil || 0)));
    if (cabinets.length) add(0.4 + T("curiosity") * 0.7 + T("tidiness") * 0.6, () => {
      const f = choice(cabinets);
      const x = f.x + Math.sin(f.rot) * (f.fd / 2 + 0.7), z = f.z + Math.cos(f.rot) * (f.fd / 2 + 0.7);
      this.roomBoundGoTo(c, room, x, z, 1.5, () => {
        if (c.lockRoom === room) { this.toggleCab(c, f.id); c.darkCab = f.id; c.darkCabUntil = this.time + 10; c.anim = "agree"; c.animUntil = this.time + 1; c.wait = rand(2, 4); }
      });
    });
    const furniture = FURNITURE.filter((f) => f.room === room && f.solid !== false && !f.seat && !f.fire && f.w > 0.4);
    add(0.5 + T("restlessness") * 1.2, () => {
      const f = furniture.length ? choice(furniture) : null;
      const p = f ? { x: f.x + Math.sin(f.rot) * (f.fd / 2 + 0.9), z: f.z + Math.cos(f.rot) * (f.fd / 2 + 0.9) } : randomPointIn(room);
      this.roomBoundGoTo(c, room, p.x, p.z, 1.3, () => {
        if (f) c.yaw = Math.atan2(f.x - c.x, f.z - c.z);
        c.anim = "agree"; c.animUntil = this.time + 1.2; c.wait = rand(2, 5);
      });
    });
    let roll = Math.random() * options.reduce((sum, [weight]) => sum + weight, 0);
    for (const [weight, run] of options) { roll -= weight; if (roll <= 0) { run(); return; } }
  }
  hideBodyDuringLockdown(dt) {
    const body = [...this.bodies].reverse().find((b) => !b.found && !b.hideSpot && b.room !== "tunnels");
    if (!body) return;
    const k = this.activeKillers().filter((c) => !c.human && (c.bodyDragT || 0) < BODY_DRAG_SECONDS && (!body.dragging || c.dragging === body.victim)).sort((a, b) => dist(a, body) - dist(b, body))[0];
    if (!k) return;
    if (!k.dragging) {
      if (dist(k, body) < 2) { this.startDrag(k); k.path = null; k.plan = null; return; }
      if (k.plan?.hideStage !== "body" || !k.path?.length) this.goTo(k, body.x, body.z, { hideStage: "body", hurry: true });
      if (k.path?.length) this.walk(k, dt);
      return;
    }
    if (k.room === "tunnels") { this.stopDrag(k); return; }
    const storage = BODY_HIDES.filter((f) => f.room === k.room && (!f.fire || !this.fires.has(f.fire)) && !this.bodies.some((b) => !b.found && b.hideSpot === f.id))
      .sort((a, b) => dist(a, k) - dist(b, k))[0];
    if (storage) {
      const tx = storage.x + Math.sin(storage.rot) * (storage.d / 2 + 0.8);
      const tz = storage.z + Math.cos(storage.rot) * (storage.d / 2 + 0.8);
      if (Math.hypot(tx - k.x, tz - k.z) < 1.2 && this.hideDraggedBody(k, storage.id)) { k.path = null; k.plan = null; return; }
      if (k.plan?.hideStage !== `storage:${storage.id}` || !k.path?.length) this.goTo(k, tx, tz, { hideStage: `storage:${storage.id}`, hurry: true });
      if (k.path?.length) this.walk(k, dt);
      return;
    }
    const nearest = Object.values(HATCH_POS).sort((a, b) => Math.hypot(a.tx - k.x, a.tz - k.z) - Math.hypot(b.tx - k.x, b.tz - k.z));
    const h = k.hideHatch && HATCH_POS[k.hideHatch] || nearest[0];
    if (h && Math.hypot(h.tx - k.x, h.tz - k.z) < 1.8) {
      if (this.climb(k, h.id)) this.stopDrag(k);
      k.path = null; k.plan = null; k.hideHatch = null;
      return;
    }
    if (!k.path?.length || k.plan?.hideStage !== "hatch") {
      for (const next of nearest) {
        this.goTo(k, next.tx, next.tz, { hideStage: "hatch", hurry: true });
        if (k.path?.length) { k.hideHatch = next.id; break; }
      }
    }
    if (k.path?.length) this.walk(k, dt);
  }
  endFlicker() {
    const afterKill = this.postKillUntil !== null || this.killedToday;
    this.overtime = false;
    this.flickerSealed = false;
    this.postKillUntil = null;
    this.forcedPursuit = null;
    for (const c of this.chars.values()) {
      c.auto = null; c.lockRoom = null; c.offered = undefined; c.decideAt = null; c.peekCompelled = null;
      if (c.plan?.forcedKill || c.plan?.refuge || c.plan?.peekCompelled) { c.path = null; c.plan = null; c.mv = c.pace = 0; }
    }
    this.broadcast({ type: "flicker", on: false });
    for (const id of this.humans) this.toSeat(id, { type: "decide", target: null });
    this.wakeAll("The lights steady and you come to.");
    if (afterKill) {
      this.searchUntil = this.time + BODY_SEARCH_SECONDS;
      this.broadcast({ type: "toast", text: "The halls are open. You have two minutes to find the body." });
      return;
    }
    if (this.day >= 2) this.startAccusation();
    else this.startDay(this.day + 1);
  }
  // Nearest victim sharing a room with the killer.
  killTarget(k) {
    if (!inRoom(k.room)) return null;
    const v = this.living().filter((c) => c !== k && !c.isKiller && c.room === k.room && !c.auto?.length && (!this.roundWound || this.roundWound.victim === c.id));
    return v.sort((a, b) => dist(a, k) - dist(b, k))[0] || null;
  }
  // Killer's A (accept) / B (decline) during the flicker.
  decide(k, accept) {
    if (!k?.isKiller || !k.alive || !this.overtime || !this.flickerSealed || !this.killAllowed()) return;
    if (!accept) {
      this.toast(k, "A kill is required today. Complete it before the night ends.");
      return;
    }
    const v = this.killTarget(k);
    if (!v) return;
    if (v.convo) this.endConvo(v.convo, true);
    if (v.chat) this.endChat(v);
    this.ensureWeapon(k);
    this.broadcast({ type: "toast", text: "The lights go out!", sfx: "thunder" });
    this.strike(k, v, true);
    k.decideAt = null;
  }
  // No weapon in the pocket? Grab the nearest unused one.
  ensureWeapon(k) {
    if (this.weaponInHands(k)) return;
    const free = [...this.weapons.values()].filter((w) => w.core && !w.holder && !k.usedWeapons.has(w.id)).sort((a, b) => dist(a, k) - dist(b, k));
    const w = free[0] || [...this.weapons.values()].find((w) => w.core && !w.holder) || [...this.weapons.values()].find((w) => w.core);
    if (!w) return;
    if (w.holder) { const old = this.chars.get(w.holder); if (old) { old.hands = old.hands.map((id) => id === w.id ? null : id); old.pockets = old.pockets.map((id) => id === w.id ? null : id); this.sendInv(old); } }
    for (const id of this.handIds(k)) { if (!this.stow(k)) this.release(k, { x: 0, y: 0, z: 0 }, null, id); }
    for (const id of this.handIds(k)) this.release(k, { x: 0, y: 0, z: 0 }, null, id);
    w.stash = null; w.holder = k.id; w.pocket = false; w.hidden = false;
    k.hands = WEAPON_BY_ID[w.id].hands === 2 ? [w.id, w.id] : [w.id, null];
    this.sendInv(k);
  }

  // ---------- perception ----------
  sightings() {
    const living = this.living();
    for (const o of living) {
      this.track(o, o);
      const obs = trait(o.id, "observation");
      for (const p of living) {
        if (p === o) continue;
        const clear = this.perceive(o, p);
        if (clear <= 0.12) continue;
        if (o.human || Math.random() < obs * Math.min(1, clear * 1.4)) this.track(o, p, clear);
      }
      // A stationary, sustained look is evidence about attention, not guilt.
      // It is visible only to guests who can see the person and the object.
      this.noticeGaze(o);
      this.seeEvidence(o);
      if (inRoom(o.room)) {
        this.addCard(o, "room", o.room);
        for (const w of this.weapons.values()) {
          if (w.home === o.room && w.holder && !w.atBody && this.perceiveAt(o, w.homePos.x, w.homePos.z) > 0.25 && (o.human || Math.random() < obs)) this.learn(o.id, { kind: "missing", weapon: w.id, room: o.room, day: this.day, t0: Math.round(this.t) });
        }
      }
    }
  }
  track(o, p, clear = 1) {
    const cur = o.cur[p.id];
    const t = Math.round(this.t);
    const continuous = cur && this.time - cur.seenAt <= 1.25;
    const dx = continuous ? p.x - cur.x : 0, dz = continuous ? p.z - cur.z : 0;
    const moved = Math.hypot(dx, dz);
    const visibleMove = continuous && moved > 0.4 && moved < 4.8 && this.perceiveAt(o, cur.x, cur.z, cur.room) > 0.12;
    const doing = clear >= 0.5 ? describeActivity(this, p, o, visibleMove ? { dx, dz } : null) : null;
    const running = p !== o && clear >= 0.5 && visibleMove && cur.running && p.mv > 3 && moved > 0.65;
    let runKey = null;
    if (running) {
      if (cur.room !== p.room && cur.runKey) {
        const f = this.notes.get(o.id).facts.get(cur.runKey);
        if (f && f.kind === "ran" && f.from === cur.room && !f.to) {
          f.to = p.room; f.t1 = t;
          if (this.humans.has(o.id)) this.toSeat(o.id, { type: "fact", fact: publicFact(f) });
        }
      } else {
        const heading = movementHeading(this, o, p, dx, dz);
        const fact = { kind: "ran", about: p.id, from: p.room, to: null, toward: heading, day: this.day, t0: t, t1: t };
        runKey = factKey(fact);
        if (!this.learn(o.id, fact, "self")) {
          const f = this.notes.get(o.id).facts.get(runKey);
          if (f) f.t1 = t;
        }
      }
    }
    if (cur && cur.room === p.room && t - cur.t1 <= 2) {
      cur.t1 = t;
      const f = this.notes.get(o.id).facts.get(cur.key);
      if (f) {
        f.t1 = t;
        if (clear > (f.clear ?? 1)) f.clear = Math.round(clear * 100) / 100;
        const oldMotion = f.doing?.split(",")[0] || "", newMotion = doing?.split(",")[0] || "";
        const hasHeading = (s) => /^(?:walking|running) (?:toward|north|south|east|west)\b/.test(s);
        const richer = doing && (
          (/(?:walking|running)/.test(oldMotion) && !hasHeading(oldMotion) && hasHeading(newMotion)) ||
          (f.doing && !f.doing.includes("head turned toward") && doing.includes("head turned toward"))
        );
        if (doing && (!f.doing || richer)) { f.doing = doing; if (this.humans.has(o.id)) this.toSeat(o.id, { type: "fact", fact: publicFact(f) }); }
      }
      cur.x = p.x; cur.z = p.z; cur.seenAt = this.time; cur.running = p.mv > 3;
      cur.runKey = runKey || (running ? cur.runKey : null);
      return;
    }
    // A sharp look keeps detail; a distant or sidelong glimpse keeps only
    // that someone was there.
    const fact = { kind: "saw", about: p.id, room: p.room, day: this.day, t0: t, t1: t, clear: Math.round(clear * 100) / 100, doing };
    const key = factKey(fact);
    o.cur[p.id] = { room: p.room, t1: t, key, x: p.x, z: p.z, seenAt: this.time, running: p.mv > 3, runKey };
    const isNew = this.learn(o.id, fact, "self");
    if (!isNew) { const f = this.notes.get(o.id).facts.get(key); if (f) f.t1 = t; }
  }
  facing(c, x, y, z) {
    const dx = x - c.x, dz = z - c.z, dy = y - 1.6;
    const length = Math.hypot(dx, dy, dz) || 1;
    const pitch = c.pitch || 0;
    return (Math.sin(c.yaw) * Math.cos(pitch) * dx + Math.cos(c.yaw) * Math.cos(pitch) * dz + Math.sin(pitch) * dy) / length > 0.66;
  }
  noticeGaze(o) {
    for (const p of this.living()) {
      if (p === o) continue;
      const start = o.gazeStarts ||= new Map();
      const clear = () => { for (const old of start.keys()) if (old.startsWith(`${p.id}:`)) start.delete(old); };
      if (p.mv > 0.18 || !this.sees(o, p) || dist(o, p) > 10) { clear(); continue; }
      let target = null, best = 0.94;
      for (const item of this.props.list) {
        if (item.hidden || item.gone || item.holder || item.stash || item.atBody) continue;
        const d = Math.hypot(item.x - p.x, item.z - p.z);
        if (d < 0.8 || d > 7 || !losClear(p.x, p.z, item.x, item.z, this.doors)) continue;
        const dy = (item.y || 0.7) - 1.6, pitch = p.pitch || 0;
        const dot = (Math.sin(p.yaw) * Math.cos(pitch) * (item.x - p.x) + Math.cos(p.yaw) * Math.cos(pitch) * (item.z - p.z) + Math.sin(pitch) * dy) / Math.hypot(d, dy);
        if (dot > best) { best = dot; target = item; }
      }
      if (!target || !this.facing(o, p.x, 1.5, p.z) || !losClear(o.x, o.z, target.x, target.z, this.doors)) { clear(); continue; }
      const key = `${p.id}:${target.id}`;
      if (!start.has(key)) start.set(key, this.time);
      for (const old of start.keys()) if (old.startsWith(`${p.id}:`) && old !== key) start.delete(old);
      if (this.time - start.get(key) < 1.5) continue;
      this.learn(o.id, { kind: "watched", about: p.id, item: target.kind, room: p.room, day: this.day, t0: Math.round(this.t) }, "self");
    }
  }
  witnesses(room, except = []) { return this.living().filter((c) => c.room === room && !except.includes(c.id)); }

  moveWithBodies(c,x,z) {
    const bodies=[...this.chars.values(),this.butler].filter(Boolean);
    const result=moveBody(c,x,z,bodies,this.doors);
    for(const b of result.changed)if(b.human&&(b!==c||Math.hypot(x-b.x,z-b.z)>.035)){
      if(this.time-(b.bumpSentAt??-1)>.075){b.bumpSentAt=this.time;this.toSeat(b.id,{type:"bump",x:b.x,z:b.z});}
    }
    return result;
  }

  // ---------- actions (from humans; AI calls the same paths) ----------
  action(id, a) {
    const c = this.chars.get(id);
    if (!c) return;
    if(a.type==='hairCancel'&&[this.barber?.actor,this.barber?.target].includes(id))return this.cancelBarber('Haircut cancelled.');
    if (a.type === "pos") {
      if (![a.x,a.z,a.yaw,a.mv].every(Number.isFinite)) return;
      if (!c.alive && this.phase !== "accuse") {
        const refuge = c.lockRoom || c.room;
        if (this.overtime && !c.isKiller && inRoom(refuge) && roomExitBlocked(refuge, c.x, c.z, a.x, a.z)) return;
        c.x = a.x; c.z = a.z; c.yaw = a.yaw; c.pitch = a.pitch || 0; c.mv = a.mv; return;
      }
      if (c.convo || c.seat || c.auto || c.ko || this.phase !== "day") return;
      if (Math.hypot(a.x - c.x, a.z - c.z) > 8 && !a.tp) return;
      const refuge = c.lockRoom || c.room;
      if (this.overtime && !c.isKiller && inRoom(refuge) && roomExitBlocked(refuge, c.x, c.z, a.x, a.z)) return;
      this.moveWithBodies(c,a.x,a.z); c.yaw = a.yaw; c.pitch = a.pitch || 0; c.mv = a.mv;
      return;
    }
    if (a.type === "hand") { c.hand = a.p ? { ...a.p, t: this.time } : null; return; }
    if (a.type === "push") return this.pushFurniture(c, a.id);
    if (a.type === "peekRoom") return this.peekRoom(c, a.kind, a.id);
    if (a.type === "door") { if (this.overtime && c.alive && !c.isKiller) return this.toast(c, "You're too scared to leave the room."); if (a.open !== false && BLOCKED_DOORS.has(a.door) && this.doorTarget[a.door] < 0.5) return this.toast(c, "Something heavy is pushed against this door."); return this.setDoor(a.door, a.open); }
    if (!c.alive) {
      if (a.type === "grab") return this.ghostGrab(c, a.prop);
      if (a.type === "drop") return this.release(c, { x: 0, y: 0, z: 0 });
      if (a.type === "throw") return this.release(c, a.v);
      if (a.type === "hand") { c.hand = a.p ? { ...a.p, t: this.time } : null; return; }
      return;
    }
    if (c.ko && a.type !== "propose" && a.type !== "vote" && a.type !== "rebut") return;
    if(a.type==='light'){
      if(this.phase!=='day'||this.overtime||c.convo||(c.lightAt||0)>this.time)return;
      const key=String(a.id),fixture=LIGHT_SWITCHES.find(f=>f.id===key)||FLOOR_LAMPS.find(f=>'lamp:'+f.id===key)||this.props.list.find(p=>'prop:'+p.id===key&&p.kind==='lamp'&&!p.hidden&&!p.gone&&!p.pocket);
      if(!fixture||dist(c,fixture)>2.6||!losClear(c.x,c.z,fixture.x,fixture.z,this.doors))return;
      this.lightsOff[key]=!this.lightsOff[key];c.lightAt=this.time+.3;this.toast(c,this.lightsOff[key]?'Light off.':'Light on.');return;
    }
    if (a.type === "kill") return this.tryKill(c, a.target);
    if (a.type === "knock") return this.tryKnock(c, a.target);
    if (a.type === "decide") return this.decide(c, !!a.accept);
    if (a.type === "talk") return this.startConvo(c, this.chars.get(a.target));
    if (a.type === "talkButler") return this.startButlerTalk(c);
    if (a.type === "choose") return this.choose(c, a.convo, a.i, a.text);
    if (a.type === "convoReady") { const cv = this.convos.get(a.convo); if ((cv?.ai || cv?.butler) && cv.waitingFor === c.id && cv.readyFor !== c.id) { cv.readyFor = c.id; const secs = this.patience(cv, c); cv.responseDue = this.time + secs; this.toSeat(c.id, { type: "convoTimer", id: cv.id, secs }); } return; }
    if (a.type === "spoke") { const cv = this.convos.get(a.convo); if (cv && a.text) this.say(c.id === cv.a ? this.chars.get(cv.a) : c, String(a.text).slice(0, 220), 5); return; }
    if (a.type === "spokeAs" && this.convos.get(a.convo)?.butler) { const cv = this.convos.get(a.convo); if (a.text) { const line = String(a.text).slice(0, 260); this.butlerSay(line, 6); cv.history[cv.history.length - 1] = { speaker: "butler", text: line }; if (cv.closingAt) cv.closingAt = this.time + 3.4; } return; }
    if (a.type === "spokeAs") { const cv = this.convos.get(a.convo); const ai = cv && this.chars.get(cv.ai); if (ai && a.text) { const line = String(a.text).slice(0, 260); this.say(ai, line, 6); cv.history.push({ speaker: ai.id, text: line }); if (cv.closingAt) cv.closingAt = this.time + 3.4; } return; }
    if (a.type === "propose" || a.type === "vote") return this.accVote(c, a);
    if (a.type === "rebut") return this.accRebut(c, a);
    if (this.phase !== "day") return;
    if(a.type==='hairAsk')return this.askHair(c,a.target);
    if(a.type==='hairReply')return this.hairReply(c,!!a.accept);
    if(a.type==='hairSneak')return this.sneakHair(c,a.target);
    if(a.type==='hairCut')return this.barberCut(c,a.state);
    if(a.type==='hairBetray')return this.barberBetray(c);
    if (a.type === "grab") return this.grab(c, a.prop);
    if (a.type === "drop") return this.release(c, { x: 0, y: 0, z: 0 }, a.at, a.id || null);
    if (a.type === "throw") return this.release(c, a.v);
    if (a.type === "stow") return this.stow(c);
    if (a.type === "burn") return this.burnItem(c, a.id);
    if (a.type === "ashes") return this.inspectAshes(c, a.id);
    if (a.type === "dropItem") return this.dropItem(c, a.id);
    if (a.type === "use") return this.useItem(c);
    if (a.type === "bin") return this.binItem(c, a.id);
    if (a.type === "searchBin") return this.searchBin(c, a.id);
    if (a.type === "drag") {
      if (c.dragKO) return this.stopKODrag(c);
      if (c.dragging) return this.stopDrag(c);
      if (a.ko || (!a.victim && !this.bodyNear(c) && this.koNear(c))) return this.startKODrag(c, a.ko);
      return this.startDrag(c, a.victim);
    }
    if (a.type === "reportBody") return this.reportBody(c, a.victim, a.suspect);
    if (a.type === "wake") { const v = this.chars.get(a.target); if (v?.ko && dist(v, c) < 2.6) this.wake(v, c); return; }
    if (a.type === "hatch") { if (this.overtime && !c.isKiller) return this.toast(c, "You're too scared to leave the room."); return this.climb(c, a.id); }
    if (a.type === "sit") return this.sit(c, a.seat);
    if (a.type === "stand") return this.stand(c);
    if (a.type === "fire") return this.toggleFire(c, a.id);
    if (a.type === "stove") return this.toggleStove(c);
    if (a.type === "cab") return this.toggleCab(c, a.id);
    if (a.type === "stashItem") return this.stashItem(c, a.id);
    if (a.type === "hideBody") return this.hideDraggedBody(c, a.id);
    if (a.type === "pool") return this.poolShot(c, a.dx, a.dz, a.power);
    if (a.type === "taskWork") return this.workTask(c, a.id);
    if (a.type === "taskStep") return this.taskStep(c, a);
    if (a.type === "taskDone") return this.taskDone(c, a);
    if (a.type === "eye") { c.anim = "headShake"; c.animUntil = this.time + 1.2; return; }
  }

  // Slide a chest in front of its door (barricading it) or back home.
  pushFurniture(c, id) {
    const f = FURN_BY_ID[id];
    if (!f?.push || !c.alive || c.ko || this.phase !== "day" || c.room !== f.room) return;
    const near = Math.max(Math.abs(c.x - f.x) - f.fw / 2, Math.abs(c.z - f.z) - f.fd / 2, 0);
    if (near > 1.1) return;
    const to = this.pushTarget[id] > 0.5 ? 0 : 1;
    // The far end must be clear of people and bodies.
    const dest = to ? f.push.to : f.push.from, hw = f.fw / 2 + 0.3, hd = f.fd / 2 + 0.3;
    const inWay = (p) => p !== c && Math.abs(p.x - dest.x) < hw && Math.abs(p.z - dest.z) < hd;
    if ([...this.chars.values()].some((p) => p.alive && inWay(p)) || this.bodies.some((b) => !b.hideSpot && inWay(b)) || (this.butler && inWay(this.butler))) return this.toast(c, "Something is in the way.");
    if (to && this.doors[f.push.door] > 0.15) this.setDoor(f.push.door, false);
    this.pushTarget[id] = to;
    this.fx("scrape", { x: f.x, z: f.z });
  }
  updatePushables(dt) {
    for (const f of PUSHABLES) {
      const goal = this.pushTarget[f.id], t = f.push.t;
      const door = f.push.door;
      if (t !== goal) {
        // Wait for the door leaf to swing shut before sliding across it.
        if (goal && this.doors[door] > 0.05) continue;
        const nt = goal > t ? Math.min(goal, t + dt * 0.75) : Math.max(goal, t - dt * 0.75);
        const ox = f.x, oz = f.z, top = f.h;
        placePushable(f, nt);
        const dx = f.x - ox, dz = f.z - oz;
        // Anything resting on or hidden in it rides along.
        for (const p of this.props.list) if (!p.holder && ((p.stash === `cab:${f.id}`) || (Math.abs(p.x - ox) < f.fw / 2 && Math.abs(p.z - oz) < f.fd / 2 && Math.abs((p.y || 0) - top) < 0.35))) { p.x += dx; p.z += dz; p.moved = true; p.sleep = false; }
        for (const b of this.bodies) if (b.hideSpot === f.id) { b.x += dx; b.z += dz; }
      }
      const blocked = f.push.t > 0.55;
      if (blocked !== BLOCKED_DOORS.has(door)) {
        if (blocked) BLOCKED_DOORS.add(door); else BLOCKED_DOORS.delete(door);
        for (const c of this.chars.values()) if (c.path?.some((p) => p.door === door)) { c.path = null; c.plan = null; }
      }
    }
  }

  setDoor(i, open) {
    if (this.doorTarget[i] === undefined) return;
    const want = open === undefined ? (this.doorTarget[i] > 0.5 ? 0 : 1) : open ? 1 : 0;
    if (want && BLOCKED_DOORS.has(i)) return;
    if (want === this.doorTarget[i]) return;
    this.doorTarget[i] = want;
    const d = DOOR_LIST[i];
    this.fx(want ? "doorOpen" : "doorClose", { x: d.mid.x, z: d.mid.z });
  }
  toggleFire(c, id) {
    const f = FURNITURE.find((x) => x.fire === id);
    if (!f || f.room !== c.room || dist(c, f) > 3) return;
    const hidden = this.bodies.find((b) => !b.found && b.hideSpot === f.id);
    if (hidden) { hidden.hideSpot = null; hidden.concealed = false; this.discover(hidden, c); return; }
    if (this.fires.has(id)) this.fires.delete(id); else this.fires.add(id);
    this.fx("fire", { id, on: this.fires.has(id), x: f.x, z: f.z });
  }
  toggleStove(c) {
    const f = FURN_BY_ID.stove;
    if (dist(c, f) > 3) return;
    this.stove = !this.stove;
    this.fx("stove", { on: this.stove, x: f.x, z: f.z });
  }
  toggleCab(c, id) {
    const f = FURN_BY_ID[id];
    if (!f?.cab || f.room !== c.room || dist(c, f) > Math.max(f.fw, f.fd) / 2 + 1.7) return;
    if (this.cabs.has(id)) this.cabs.delete(id); else this.cabs.add(id);
    this.onCab(id);
    this.fx("cab", { id, on: this.cabs.has(id), x: f.x, z: f.z });
    if (this.cabs.has(id)) {
      const hidden = this.bodies.find((b) => !b.found && b.hideSpot === id);
      if (hidden) {
        hidden.hideSpot = null; hidden.concealed = false;
        if (f.type === "barrel") {
          // A full-length body cannot be drawn inside the small opening.
          // Lay it beside the opened barrel so the discovery is readable.
          hidden.x = f.x + Math.sin(f.rot) * (f.d / 2 + 0.72);
          hidden.z = f.z + Math.cos(f.rot) * (f.d / 2 + 0.72);
          hidden.yaw = f.rot + Math.PI / 2;
        }
        this.discover(hidden, c);
      }
    }
  }
  poolShot(c, dx, dz, power = 1) {
    if (!c.alive || c.ko || c.convo || this.phase !== 'day' || this.overtime || ![dx, dz, power].every(Number.isFinite) || Math.hypot(dx, dz) < 0.001 || Math.hypot(c.x - POOL.x, c.z - POOL.z) > 3.2 || !losClear(c.x, c.z, POOL.x, POOL.z, this.doors)) return;
    if (this.pool.shoot(dx, dz, 0.45 + Math.max(0.05, Math.min(1, power)) * 2.8)) { this.poolShooter = c.id; this.poolT = this.time; this.fx("pool", { x: POOL.x, z: POOL.z, v: 0.8 }); }
  }
  sit(c, seatId) {
    const s = SEATS.find((x) => x.id === seatId);
    if (!s) return;
    if (c.dragging) this.stopDrag(c);
    if (this.seatsTaken.has(s.id) && this.seatsTaken.get(s.id) !== c.id) return;
    if (dist(c, s) > 2.4) return;
    if (c.seat) this.stand(c);
    this.seatsTaken.set(s.id, c.id);
    c.seat = s.id; c.x = s.x; c.z = s.z; c.yaw = s.yaw; c.mv = 0; c.path = null;
  }
  stand(c) {
    if (!c.seat) return;
    const s = SEATS.find((x) => x.id === c.seat);
    this.seatsTaken.delete(c.seat);
    c.seat = null;
    if (s) { const p = collide(s.x + Math.sin(s.yaw) * 0.65, s.z + Math.cos(s.yaw) * 0.65, 0.3, this.doors); c.x = p.x; c.z = p.z; }
  }

  // ---------- ghosts ----------
  ghostGrab(c, pid) {
    if (c.alive || c.ghostUsed || this.carrying(c) || this.phase !== "day") return;
    const p = this.props.byId.get(pid);
    if (!p || p.weapon || p.holder || p.hidden || Math.hypot(p.x - c.x, p.z - c.z) > 2.4) return;
    p.holder = c.id; p.stash = null; c.hands = [p.id, p.id]; c.ghostT = 0;
    this.props.wake(p);
    this.fx("ghost", { x: p.x, z: p.z });
    this.toSeat(c.id, { type: "ghost", carrying: true, until: GHOST_HOLD });
    // Anyone who sees it float notices.
    for (const o of this.living()) if (Math.hypot(o.x - p.x, o.z - p.z) < 9 && losClear(o.x, o.z, p.x, p.z, this.doors)) {
      if (o.human) this.toSeat(o.id, { type: "toast", text: "Something is moving on its own…" });
      else if (Math.random() < 0.6) this.say(o, choice(["Did that just… move?", "Heavens! It's floating!", "Who's there?!"]), 2.5);
    }
  }
  onPropHit(p, victimId) {
    const thrower = this.chars.get(p.thrower);
    const v = this.chars.get(victimId);
    if (!v) return;
    if (p.throwWatch && !p.throwWatch.hit) p.throwWatch.hit = v.id;
    this.fx("thud", { x: p.x, z: p.z, v: 1 });
    // A killer's well-aimed throw down in the tunnels knocks a guest cold.
    if (thrower?.alive && thrower.isKiller && v.alive && !v.ko && !v.isKiller && this.phase === "day" && (v.room === "tunnels" || thrower.room === "tunnels")) { this.knockOut(thrower, v); return; }
    if (thrower && !thrower.alive) {
      const fact = { kind: "ghost", about: v.id, room: v.room, day: this.day, t0: Math.round(this.t), item: p.kind };
      for (const o of this.living()) if (o === v || this.sees(o, v)) {
        this.learn(o.id, fact, "self");
        if (!o.human) {
          bumpSocial(o, v.id, 2.5 * trait(o.id, "superstition") + 0.3);
          if (o !== v && Math.random() < 0.7) this.say(o, choice([`The spirits point at ${short(v.id)}!`, `It flew straight at ${short(v.id)}…`, "A sign from beyond!"]), 3);
        }
      }
      if (v.human) this.toSeat(v.id, { type: "toast", text: "Something unseen hurls an object at you!" });
      this.broadcast({ type: "ghostHit", victim: v.id, room: v.room });
    }
  }
  updateGhosts(dt) {
    if (this.overtime) return;
    for (const c of this.chars.values()) {
      if (c.alive || c.human) continue;
      const g = c.ghostPlan;
      if (!g || c.ghostUsed) { c.mv = 0; continue; }
      if (this.t < g.at) continue;
      // Victims haunt their own murderer; a caught killer's ghost picks a guest to frame.
      let target = g.target && this.chars.get(g.target);
      if (!target?.alive) {
        const mine = this.kills.find((k) => k.victim === c.id)?.killer;
        const ks = this.activeKillers();
        target = c.isKiller ? choice(this.living().filter((o) => !o.isKiller)) : ks.find((k) => k.id === mine) || choice(ks);
        g.target = target?.id;
      }
      if (!target?.alive) continue;
      if (!this.carrying(c)) {
        // Float to the nearest loose prop near the killer.
        if (!g.prop) {
          const cands = this.props.list.filter((p) => !p.holder && !p.hidden && !p.weapon && !p.stash).sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z));
          g.prop = cands[Math.floor(Math.random() * Math.min(3, cands.length))]?.id;
        }
        const p = this.props.byId.get(g.prop);
        if (!p || p.holder) { g.prop = null; continue; }
        if (this.ghostMove(c, p, dt) < 1.2) this.ghostGrab(c, p.id);
      } else {
        const d = this.ghostMove(c, target, dt, 3.2);
        if (d < 3.6 || c.ghostT > GHOST_HOLD - 1) {
          const p = this.props.byId.get(this.carrying(c));
          const dx = target.x - p.x, dz = target.z - p.z, dy = 1.2 - p.y, l = Math.hypot(dx, dz) || 1;
          const sp = 7;
          this.release(c, { x: dx / l * sp, y: dy * 1.5 + l * 0.35, z: dz / l * sp });
        }
      }
    }
  }
  ghostMove(c, t, dt, stop = 0.8) {
    const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz);
    if (d > stop) { const s = Math.min(d - stop, GHOST_SPEED * dt); c.x += dx / d * s; c.z += dz / d * s; c.mv = GHOST_SPEED; }
    else c.mv = 0;
    c.yaw = Math.atan2(dx, dz);
    return d;
  }

  // ---------- killing ----------
  tryKill(c, targetId) {
    const v = this.chars.get(targetId);
    if (!c.isKiller || !v?.alive || v === c || v.isKiller || !this.killAllowed()) return;
    if (this.overtime && !this.flickerSealed) return;
    if (!inRoom(c.room) || v.room !== c.room || dist(c, v) > 2.8) return;
    if (this.roundWound && this.roundWound.victim !== v.id) { this.toast(c, "You can only strike the guest already wounded tonight."); return; }
    this.ensureWeapon(c);
    if (!this.weaponInHands(c)) return;
    if (v.convo) this.endConvo(v.convo, true);
    if (c.convo) this.endConvo(c.convo, true);
    this.strike(c, v);
  }
  strike(c, v, dark = false) {
    const held = this.handIds(c).filter((id) => this.weapons.has(id));
    const weapon = v.wound && held.length > 1 ? held.find((id) => id !== v.wound.weapon) || held[0] : held[0];
    const w = WEAPON_BY_ID[weapon];
    if (!w) return;
    if (w.hands === 2 || v.wound) { this.commitKill(c, v, null, dark, weapon); return; }
    v.wound = { killer: c.id, weapon, room: v.room, day: this.day, t: Math.round(Math.min(this.t, DAY_SECONDS)) };
    this.roundWound = { victim: v.id, killer: c.id };
    for (const id of this.killers) this.toSeat(id, { type: "attackLock", target: v.id });
    const prop = this.weapons.get(weapon); if (prop) prop.bloody = true;
    this.woundSpatter(v);
    this.toSeat(v.id, { type: "wound", bleeding: true, day: this.day });
    this.toast(v, "You are bleeding. Find a bandage before the next night ends.");
    this.toast(c, `${short(v.id)} is wounded. Strike them again to kill; you cannot attack anyone else tonight.`);
    const fact = { kind: "wound", about: c.id, victim: v.id, weapon, room: v.room, day: this.day, t0: v.wound.t };
    this.learn(c.id, fact, "self"); this.learn(v.id, { ...fact, about: !dark && this.sees(v, c) ? c.id : null }, "self");
    if (!dark) for (const o of this.living()) if (o !== c && o !== v && this.sees(o, v) && this.sees(o, c)) this.learn(o.id, fact, "self");
    this.sendInv(c);
  }
  commitKill(c, v, forcedRoom = null, dark = false, chosenWeapon = null) {
    if (v.ko) { v.ko = false; this.toSeat(v.id, { type: "ko", on: false }); }
    for (const o of this.chars.values()) if (o.dragKO === v.id) o.dragKO = null;
    this.ensureWeapon(c);
    const weapon = chosenWeapon || this.weaponInHands(c)?.id || [...this.weapons.values()].find((w) => w.core && !c.usedWeapons.has(w.id))?.id || "hammer";
    const room = forcedRoom || v.room;
    const w = this.weapons.get(weapon);
    if (v.seat) this.stand(v);
    this.spill(v);
    v.alive = false; v.mv = 0; v.path = null; v.plan = null; v.auto = null;
    v.wound = null;
    if (v.chat) this.endChat(v);
    if (w.holder) { const h = this.chars.get(w.holder); if (h) { h.hands = h.hands.map((x) => (x === w.id ? null : x)); this.sendInv(h); } }
    w.holder = null; w.hidden = false; w.stash = null; w.pocket = false; w.atBody = true; w.x = v.x + 0.5; w.z = v.z + 0.3; w.y = 0.3; w.room = room;
    this.props.wake(w);
    c.usedWeapons.add(weapon);
    c.yaw = Math.atan2(v.x - c.x, v.z - c.z);
    this.bloodSpatter(c, v);
    this.sendInv(c);
    this.killedToday = true;
    this.roundWound = null;
    for (const id of this.killers) this.toSeat(id, { type: "attackLock", target: null });
    this.postKillUntil = this.time + POST_KILL_HIDE_SECONDS;
    const kill = { killer: c.id, victim: v.id, weapon, room, day: this.day, t: Math.round(Math.min(this.t, DAY_SECONDS)) };
    this.kills.push(kill);
    this.bodies.push({ victim: v.id, x: v.x, z: v.z, yaw: v.yaw, room, weapon, found: false, killT: this.time, day: this.day });
    const wit = c.peekWitnesses?.length
      ? c.peekWitnesses.map((id) => this.chars.get(id)).filter((o) => o?.alive && o.room === room)
      : forcedRoom || dark ? [] : this.living().filter((o) => o !== c && this.sees(o, v) && this.sees(o, c));
    for (const o of wit) {
      this.learn(o.id, { kind: "kill", about: c.id, victim: v.id, weapon, room, day: this.day, t0: kill.t }, "self");
      this.learn(o.id, { kind: "body", about: v.id, weapon, room, day: this.day }, "self");
      this.say(o, choice(["Murder!", "Oh my god!", "No!!"]), 2.5);
    }
    this.learn(c.id, { kind: "body", about: v.id, weapon, room, day: this.day }, "self");
    const viewers = [c.id, v.id, ...wit.map((o) => o.id)];
    this.broadcast({ type: "kill", victim: v.id, killer: c.id, weapon, x: v.x, z: v.z, kx: c.x, kz: c.z, viewers, sfx: "thunder" });
    // The victim lingers as a ghost (knowing who did it).
    v.ghostUsed = false; v.ghostT = 0; v.ghostPlan = { at: this.t + rand(8, 30) };
    this.learn(v.id, { kind: "kill", about: c.id, victim: v.id, weapon, room, day: this.day, t0: kill.t }, "self");
    this.toSeat(v.id, { type: "dead", by: c.id });
    if (c.human) this.toSeat(c.id, { type: "toast", text: `${short(v.id)} is dead. Slip away before anyone finds the body.` });
    for (const id of this.humans) this.toSeat(id, { type: "decide", target: null });
    if (!this.overtime) this.startFlicker(true);
    else this.broadcast({ type: "flicker", on: true, afterKill: true });
  }
  bleedOut(v) {
    const wound = v.wound;
    if (!wound || !v.alive) return;
    if (v.seat) this.stand(v);
    if (v.convo) this.endConvo(v.convo, true);
    if (v.chat) this.endChat(v);
    this.spill(v);
    v.alive = false; v.wound = null; v.mv = 0; v.path = null; v.plan = null; v.auto = null;
    v.ghostUsed = false; v.ghostT = 0; v.ghostPlan = { at: rand(8, 30) };
    this.killedToday = true;
    this.searchUntil = this.time + BODY_SEARCH_SECONDS;
    const kill = { killer: wound.killer, victim: v.id, weapon: wound.weapon, room: wound.room, day: this.day, t: 0, bleedOut: true };
    this.kills.push(kill);
    this.bodies.push({ victim: v.id, x: v.x, z: v.z, yaw: v.yaw, room: v.room, weapon: wound.weapon, found: false, killT: this.time, day: this.day, bleedOut: true });
    this.addStain({ x: v.x, z: v.z, r: 0.22, rot: rand(0, 6.28), k: 0, e: 1 });
    this.learn(v.id, { kind: "kill", about: wound.killer, victim: v.id, weapon: wound.weapon, room: wound.room, day: this.day, t0: 0 }, "self");
    this.toSeat(v.id, { type: "dead", by: wound.killer });
    this.toast(v, "The untreated wound was fatal.");
  }
  forcedKill(dt) {
    const ks = this.activeKillers();
    const others = this.living().filter((c) => !c.isKiller);
    if (!ks.length || !others.length) { this.endFlicker(); return; }
    if (!this.forcedPursuit) {
      let best = null;
      for (const k of ks) for (const v of others) {
        if (!inRoom(v.room) || (this.roundWound && this.roundWound.victim !== v.id)) continue;
        const path = findPath(k.x, k.z, v.x, v.z);
        if (!path?.length && (k.room !== v.room || dist(k, v) > 2.8)) continue;
        let length = 0, x = k.x, z = k.z;
        for (const p of path || []) { length += p.passage ? 2.2 : Math.hypot(p.x - x, p.z - z); x = p.x; z = p.z; }
        // Prefer an AI pursuer when the available routes are comparable.
        const score = length + (k.human ? 3 : 0);
        if (!best || score < best.score) best = { k, v, path, score };
      }
      if (!best) { this.endFlicker(); return; }
      this.forcedPursuit = { killer: best.k.id, victim: best.v.id, until: this.time + FLICKER_SECONDS };
      best.k.path = best.path?.length ? best.path : null;
      best.k.auto = best.k.path;
      best.k.plan = { goal: { x: best.v.x, z: best.v.z }, hurry: true, forcedKill: true };
      this.broadcast({ type: "toast", text: "The lights go out!", sfx: "thunder" });
    }
    const pursuit = this.forcedPursuit;
    const k = this.chars.get(pursuit.killer), v = this.chars.get(pursuit.victim);
    if (!k?.alive || !v?.alive || this.time >= pursuit.until) { this.endFlicker(); return; }
    if (v.ko) this.wake(v);
    if (k.path?.length) this.walk(k, dt, true);
    k.room = roomAtWorld(k.x, k.z) || k.room;
    if (k.room === v.room && dist(k, v) <= 2.8) {
      this.ensureWeapon(k);
      this.strike(k, v, true);
      if (v.alive) this.strike(k, v, true);
      k.auto = null; k.path = null; k.plan = null; this.forcedPursuit = null;
    } else if (!k.path?.length && (!pursuit.retryAt || this.time >= pursuit.retryAt)) {
      this.goTo(k, v.x, v.z, { hurry: true, forcedKill: true });
      k.auto = k.path;
      pursuit.retryAt = this.time + 1;
    }
  }

  checkBodies() {
    if (this.overtime) return; // nobody can see a thing in the dark
    for (const b of this.bodies) {
      if (b.found || b.hideSpot) continue;
      const finder = this.living().find((c) => !c.isKiller && (b.concealed
        ? c.room === "tunnels" && dist(c, b) < 4 && this.perceiveAt(c, b.x, b.z, b.room) > 0.12
        : dist(c, b) < (c.room === b.room ? 12 : 8) && this.perceiveAt(c, b.x, b.z, b.room) > 0.12));
      if (finder) { this.discover(b, finder); return; }
    }
  }
  reportBody(c, victim, suspect) {
    if (!c.isKiller || !c.alive || c.dragging || c.ko || this.phase !== "day") return false;
    const b = this.bodies.find((x) => x.victim === victim && !x.found && !x.dragging && !x.hideSpot);
    if (!b || dist(c, b) > 2.2 || c.room !== b.room || !losClear(c.x, c.z, b.x, b.z, b.room === "tunnels" ? null : this.doors)) return false;
    const named = suspect ? this.chars.get(suspect) : null;
    if (suspect && (!named?.alive || named.isKiller || suspect === victim)) return false;
    this.discover(b, c, named?.id || null);
    return true;
  }
  discover(b, finder, claim = null) {
    b.found = true;
    for (const c of this.chars.values()) if (c.dragging === b.victim) {
      if (finder && finder !== c && this.sees(finder, c)) this.learn(finder.id, { kind: "dragged", about: c.id, victim: b.victim, room: b.room, day: this.day, t0: Math.round(this.t) }, "self");
      this.stopDrag(c);
    }
    for (const c of this.chars.values()) if (c.pouring) { c.pouring = false; this.sendInv(c); }
    b.finder = finder?.id || null;
    if (finder) {
      this.learn(finder.id, { kind: "body", about: b.victim, weapon: b.weapon, room: b.room, day: b.day, bleedOut: !!b.bleedOut }, "self");
      this.say(finder, choice(["Help! A body!", "Someone come quick!", `It's ${short(b.victim)}…`]), 3);
    }
    const kill = this.kills.find((k) => k.victim === b.victim);
    const tod = { kind: "tod", about: b.victim, day: kill.day, t: Math.max(0, Math.round(kill.t / 10) * 10) };
    for (const c of this.chars.values()) this.learn(c.id, tod, "public");
    if (claim) {
      const report = { kind: "report", by: finder.id, about: claim, victim: b.victim, room: b.room, day: this.day };
      for (const c of this.chars.values()) if (c.id !== finder.id) this.learn(c.id, report, `told:${finder.id}`);
      this.say(finder, claimLine(report, finder.id), 5);
    }
    this.afterDiscovery(b, finder, claim);
  }
  afterDiscovery(b, finder, claim = null) {
    this.wakeAll("A scream rouses you.");
    for (const c of this.chars.values()) if (c.dragKO) this.stopKODrag(c);
    for (const cv of [...this.convos.keys()]) this.endConvo(cv, true);
    for (const c of this.chars.values()) { if (c.chat) this.endChat(c); c.auto = null; c.lockRoom = null; }
    this.overtime = false;
    this.flickerSealed = false;
    this.postKillUntil = null;
    this.searchUntil = null;
    this.broadcast({ type: "flicker", on: false });
    const night = this.day === 1;
    this.phase = night ? "night" : "body";
    this.phaseT = this.demo ? 5 : 8;
    const kill = this.kills.find((k) => k.victim === b.victim);
    this.broadcast({
      type: "cutscene", kind: night ? "night" : "body", victim: b.victim, finder: finder?.id || null, claim,
      tod: clockLabel(kill.t), alive: this.living().map((c) => c.id), day: this.day, sfx: "scream",
    });
  }
  checkKillerWin() {
    const saviors = this.living().filter((c) => !c.isKiller).length;
    if (saviors <= 1) { this.finish("killer", this.duo ? "Only one guest remains. The killers walk free." : "Only one guest remains. The killer walks free."); return true; }
    return false;
  }
  // The last accusation failed. With two killers, both must have drawn blood.
  finalVerdict() {
    if (!this.duo) { this.finish("killer", "The final accusation was wrong. The killer escapes into the night."); return; }
    const idle = this.killers.filter((id) => !this.kills.some((k) => k.killer === id));
    if (idle.length) this.finish("saviors", `${idle.map(short).join(" and ")} never made a kill. The killers' pact falls apart.`);
    else this.finish("killer", "The final accusation was wrong. The killers escape into the night.");
  }
  // Two-killer mode: a correctly accused killer becomes a ghost; the game goes on.
  catchKiller(c) {
    if (!c?.alive) return;
    if (c.seat) this.stand(c);
    if (c.dragging) this.stopDrag(c);
    this.spill(c);
    c.alive = false; c.caught = true; c.mv = 0; c.path = null; c.plan = null; c.auto = null; c.ko = false;
    c.ghostUsed = false; c.ghostT = 0; c.ghostPlan = { at: rand(10, 40) };
    this.toSeat(c.id, { type: "dead", by: null, caught: true });
  }
  finish(winner, reason) {
    this.settleTasks(); this.settleTeams();
    this.phase = "over";
    this.winner = winner;
    for (const id of [...this.convos.keys()]) this.endConvo(id, true);
    this.broadcast({ type: "over", winner, reason, killer: this.killer, killers: this.killers, kills: this.kills, day: this.day, sfx: "gavel" });
    if (!this.demo) try { rememberMatch({ killer: this.killer, winner, kills: this.kills, day: this.day }); } catch (e) { console.warn(e); }
  }

  // ---------- AI movement & behaviour ----------
  updateBots(dt, seated) {
    for (const c of this.chars.values()) {
      if (c.human || !c.alive || c.barberLocked) continue;
      if (c.ko) { c.mv = c.pace = 0; stepStamina(c.stamina, dt, false, false); continue; }
      if (seated) { c.mv = c.pace = 0; stepStamina(c.stamina, dt, false, false); continue; }
      if (this.overtime) { stepStamina(c.stamina, dt, false, false); continue; } // flicker logic drives movement
      if (c.closeDoor && this.time > c.closeDoor.at) { const d = DOOR_LIST[c.closeDoor.id]; if (Math.hypot(d.mid.x - c.x, d.mid.z - c.z) > 1.3 && !this.living().some((o) => Math.hypot(d.mid.x - o.x, d.mid.z - o.z) < 1.1)) this.setDoor(d.id, false); c.closeDoor = null; }
      if (c.convo || c.chat) {
        c.mv = c.pace = 0;
        stepStamina(c.stamina, dt, false, false);
        const partner = this.chars.get(c.chat?.with || this.convoPartner(c));
        if (partner && !c.seat) c.yaw = Math.atan2(partner.x - c.x, partner.z - c.z);
        continue;
      }
      c.talkCd -= dt; c.humanCd -= dt;
      if (c.seat) { c.mv = c.pace = 0; stepStamina(c.stamina, dt, false, false); c.wait -= dt; if (c.wait <= 0) { this.stand(c); c.wait = rand(0.5, 1.5); } continue; }
      if (c.team && c.path?.length && this.time - (c.followAt || 0) > 0.6) { c.followAt = this.time; this.retargetFollow(c); }
      if (c.path?.length) { this.walk(c, dt); continue; }
      stepStamina(c.stamina, dt, false, false);
      c.mv = 0; c.pace = Math.max(0, c.pace - dt * 8);
      if (c.plan?.arrive) {
        const plan = c.plan, goal = plan.goal;
        const fn = plan.arrive;
        plan.arrive = null;
        if (!goal || Math.hypot(c.x - goal.x, c.z - goal.z) < (plan.reach || 1.5)) fn();
        else { c.plan = null; c.wait = 1; }
      }
      c.wait -= dt;
      if (c.wait > 0) continue;
      this.think(c);
    }
  }
  faceConversationPartners() {
    for (const c of this.chars.values()) {
      if (!c.alive || c.ko || !(c.convo || c.chat)) continue;
      const id = c.chat?.with || this.convoPartner(c);
      const partner = id === 'butler' ? this.butler : this.chars.get(id);
      if (!partner || partner.ko || partner.alive === false) continue;
      if (Math.hypot(partner.x - c.x, partner.z - c.z) < .05) continue;
      const chair = c.seat && SEATS.find(seat => seat.id === c.seat);
      if (chair) {
        const heading = Math.atan2(partner.x - c.x, partner.z - c.z);
        const turn = Math.atan2(Math.sin(heading - chair.yaw), Math.cos(heading - chair.yaw));
        if (Math.abs(turn) > 1.1) this.stand(c);
      }
      c.yaw = Math.atan2(partner.x - c.x, partner.z - c.z);
      c.pitch = 0; c.mv = c.pace = 0;
      if (id === 'butler') partner.yaw = Math.atan2(c.x - partner.x, c.z - partner.z);
    }
  }
  convoPartner(c) { const cv = this.convos.get(c.convo); return cv ? (cv.a === c.id ? cv.b : cv.a) : null; }
  walk(c, dt, forced = false) {
    let p, dx, dz, d, ready = false;
    // Consume close waypoints in this tick so path nodes do not create a
    // visible stop every few metres.
    for (let i = 0; i < 5 && c.path?.length; i++) {
      p = c.path[0];
      if (p.passage) {
        if (!forced && !c.human && c.isKiller && this.overtime && this.flickerSealed && this.killAllowed() && c.room === "tunnels" && !c.peekedEntrances.has(`hatch:${p.hatch}`)) {
          const peek = this.peekRoom(c, "hatch", p.hatch);
          if (peek && (!peek.success || peek.witnessRisk)) {
            if (peek.success) { c.path = null; c.plan = null; c.wait = 1; }
            c.mv = c.pace = 0;
            return;
          }
        }
        if (this.climb(c, p.hatch, forced)) { c.path.shift(); c.stuck = 0; }
        else { c.path = null; c.auto = null; c.plan = null; c.wait = 1; }
        c.mv = c.pace = 0;
        stepStamina(c.stamina, dt, false, false);
        return;
      }
      // Doors: wait for the leaf to clear before spending a sprint burst.
      if (p.door !== undefined) {
        const door = DOOR_LIST[p.door];
        const near = Math.hypot(door.mid.x - c.x, door.mid.z - c.z);
        if (!forced && near < 1.9 && !c.human && c.isKiller && this.overtime && this.flickerSealed && this.killAllowed() && !c.peekedEntrances.has(`door:${p.door}`)) {
          if (this.doorTarget[p.door] < 0.5 && this.doors[p.door] > 0.05) { c.mv = c.pace = 0; stepStamina(c.stamina, dt, false, false); return; }
          const peek = this.peekRoom(c, "door", p.door);
          if (peek && (!peek.success || peek.witnessRisk)) {
            if (peek.success) { c.path = null; c.plan = null; c.wait = 1; }
            c.mv = c.pace = 0;
            return;
          }
        }
        if (near < 1.9 && this.doorTarget[p.door] < 0.5) this.setDoor(p.door, true);
        if (near < 1.9 && this.doors[p.door] < 0.7) {
          c.mv = 0; c.pace = Math.max(0, c.pace - dt * 8);
          stepStamina(c.stamina, dt, false, false);
          return;
        }
      }
      dx = p.x - c.x; dz = p.z - c.z; d = Math.hypot(dx, dz);
      if (d >= 0.22) { ready = true; break; }
      const done = c.path.shift();
      if (done.door !== undefined && !forced && Math.random() < trait(c.id, "tidiness") * 0.8) c.closeDoor = { id: done.door, at: this.time + 1.1 };
    }
    if (!ready || !c.path?.length) { c.mv = c.pace = 0; stepStamina(c.stamina, dt, false, false); return; }
    const sprint = (forced || (c.plan?.hurry && (c.path.length > 1 || d > 1.8))) && !c.dragging && !c.dragKO;
    if (stepStamina(c.stamina, dt, sprint, true)) this.fx("pant", { x: c.x, z: c.z, v: 0.55 });
    const speed = (c.stamina.running ? HURRY : WALK * (0.85 + trait(c.id, "restlessness") * 0.3)) * (c.dragging || c.dragKO ? 0.5 : 1);
    const target = Math.atan2(dx, dz);
    let dy = target - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    c.yaw += dy * Math.min(1, dt * 7);
    const turnFactor = Math.max(0.45, 1 - Math.abs(dy) * 0.3);
    const arrivalFactor = c.path.length === 1 ? Math.max(0.55, Math.min(1, d / 1.2)) : 1;
    const wantedPace = speed * turnFactor * arrivalFactor;
    c.pace += Math.max(-8 * dt, Math.min((c.stamina.running ? 7 : 4.5) * dt, wantedPace - c.pace));
    const step = Math.min(d, c.pace * dt);
    const nx = c.x + dx / d * step, nz = c.z + dz / d * step;
    const oldX=c.x,oldZ=c.z;
    const safe=this.moveWithBodies(c,nx,nz);
    const moved=Math.hypot(safe.x-oldX,safe.z-oldZ);
    c.mv = Math.min(moved / Math.max(dt, 1e-3), c.pace + 0.6);
    c.stuck = moved < step * 0.2 ? (c.stuck || 0) + dt : 0;
    if (c.stuck > 1.2) {
      c.stuck = 0;
      const plan = c.plan || {}, goal = plan.goal || c.path[c.path.length - 1];
      c.path = null;
      plan.retries = (plan.retries || 0) + 1;
      if (plan.retries <= 2 && goal) { this.goTo(c, goal.x, goal.z, plan); if (forced) c.auto = c.path; }
      else { c.plan = null; c.wait = 1.5; c.mv = 0; if (forced) c.auto = null; }
    }
  }
  goTo(c, x, z, plan = {}) {
    const path = findPath(c.x, c.z, x, z, c.id === "butler" ? ["cellar", "tunnels"] : []);
    c.plan = plan;
    plan.goal = { x, z };
    c.path = path && path.length ? path : null;
    if (!c.path) {
      // A failed route must never perform a remote pickup or cleanup action.
      if (Math.hypot(c.x - x, c.z - z) < (plan.reach || 1.2) && losClear(c.x, c.z, x, z, this.doors)) { const fn = plan.arrive; if (fn) { plan.arrive = null; fn(); } }
      else { c.plan = null; c.wait = 1.5; }
    }
  }

  think(c) {
    if (c.wound && this.seekBandage(c)) return;
    if (this.followPartner(c)) return;
    if (c.isKiller && this.killAllowed() && this.wantsToKill(c)) return;
    if (c.isKiller && this.killerChores(c)) return;
    if (!c.isKiller && this.pursueTask(c)) return;
    if (this.seekButler(c)) return;
    if (this.tunnelThink(c)) return;
    if (!c.isKiller && Math.random() < 0.35 && this.saviorChores(c)) return;
    const r = Math.random();
    const T = (k) => trait(c.id, k);
    // Approach a human for a conversation.
    const humans = this.living().filter((h) => h.human && !h.convo && !h.chat);
    if (!this.demo && humans.length && c.humanCd <= 0 && r < 0.3 + T("sociability") * 0.2 && this.t < DAY_SECONDS - 8) {
      const h = humans.sort((a, b) => dist(a, c) - dist(b, c))[0];
      if (dist(h, c) < 26 && this.globalHumanCd(h) && (h.room === c.room || Math.random() < 0.5)) {
        c.humanCd = rand(40, 65);
        h._approachedAt = this.time;
        this.goTo(c, h.x, h.z, { arrive: () => {
          if (h.alive && c.alive && !h.convo && !c.convo && dist(h, c) < 3.4 && this.phase === "day" && !this.overtime) this.startConvo(c, h);
          else c.wait = 1;
        } });
        return;
      }
    }
    if (c.talkCd <= 0 && r < 0.4 + T("sociability") * 0.3) {
      const others = this.living().filter((o) => !o.human && o !== c && !o.convo && !o.chat && o.talkCd <= 4 && !o.seat);
      const near = others.filter((o) => dist(o, c) < 16).sort((a, b) => dist(a, c) - dist(b, c))[0];
      if (near) {
        c.talkCd = rand(14, 26) / (0.5 + T("sociability"));
        near.path = null; near.wait = 3;
        this.goTo(c, near.x, near.z, { arrive: () => { if (near.alive && !near.convo && !near.chat && dist(near, c) < 2.8 && this.phase === "day") this.startChat(c, near); } });
        return;
      }
    }
    if (this.day === 1 && c.cards.filter((x) => x.type === "weapon").length < 2 && r < 0.6) {
      const free = [...this.weapons.values()].filter((w) => w.core && !w.holder && !w.atBody);
      const w = free.sort((a, b) => dist(a, c) - dist(b, c))[Math.floor(Math.random() * Math.min(3, free.length))];
      if (w) { this.goTo(c, w.x, w.z, { reach: 2.4, arrive: () => { if (dist(c, w) < 2.4) { this.addCard(c, "weapon", w.id); c.anim = "agree"; c.animUntil = this.time + 1.2; const f = { kind: "held", about: c.id, weapon: w.id, room: c.room, day: this.day, t0: Math.round(this.t) }; for (const o of this.living()) if (o === c || this.sees(o, c)) this.learn(o.id, f, "self"); } } }); c.wait = rand(1, 2); return; }
    }
    if (this.activity(c)) return;
    const favs = T("favorites") || [];
    const room = Math.random() < 0.12 ? "hallway" : favs.length && Math.random() < 0.5 ? choice(favs) : choice(ROOM_LIST).id;
    const p = randomPointIn(ROOM_BY_ID[room] || room === "hallway" ? room : "conference");
    this.goTo(c, p.x, p.z, {});
    c.wait = rand(1.5, 4.5) * (1.4 - T("restlessness"));
  }
  seekBandage(c) {
    let b = this.findItem(c, "bandage", "hands");
    if (b) { this.useItem(c, "bandage"); return true; }
    b = this.findItem(c, "bandage", "pockets");
    if (b) {
      if (c.hands.every(Boolean)) this.release(c, { x: 0, y: 0, z: 0 });
      if (this.draw(c, b.id)) this.useItem(c, "bandage");
      return true;
    }
    b = this.props.list.filter((p) => p.kind === "bandage" && !p.gone && !p.holder && (!p.hidden || p.stash?.startsWith("cab:"))).sort((a, d) => dist(a, c) - dist(d, c))[0];
    if (!b) return false;
    if (c.hands.every(Boolean)) this.release(c, { x: 0, y: 0, z: 0 });
    const cabinet = b.stash?.startsWith("cab:") ? FURN_BY_ID[b.stash.slice(4)] : null;
    const goal = cabinet ? { x: cabinet.x + Math.sin(cabinet.rot) * (cabinet.fd / 2 + 0.7), z: cabinet.z + Math.cos(cabinet.rot) * (cabinet.fd / 2 + 0.7) } : b;
    this.goTo(c, goal.x, goal.z, { hurry: true, reach: 2.2, arrive: () => {
      if (cabinet && !this.cabs.has(cabinet.id)) this.toggleCab(c, cabinet.id);
      if (this.grab(c, b.id)) this.useItem(c, "bandage");
    } });
    return true;
  }
  // Soul-driven pastimes: sit, play billiards, tend fires, open cupboards, tidy up.
  activity(c) {
    const T = (k) => trait(c.id, k);
    const opts = [];
    const roomSeats = SEATS.filter((s) => s.room === c.room && !this.seatsTaken.has(s.id));
    if (roomSeats.length) opts.push([1.1 - T("restlessness"), () => {
      const s = roomSeats.sort((a, b) => dist(a, c) - dist(b, c))[0];
      this.goTo(c, s.x + Math.sin(s.yaw) * 0.6, s.z + Math.cos(s.yaw) * 0.6, { arrive: () => { this.sit(c, s.id); c.wait = rand(6, 22) * (1.3 - T("restlessness")); } });
    }]);
    opts.push([T("curiosity") * 0.5, () => {
      const p = { x: POOL.x + (Math.random() < 0.5 ? -1 : 1) * 1.8, z: POOL.z + (Math.random() - 0.5) * 0.6 };
      this.goTo(c, p.x, p.z, { arrive: () => { const b = this.pool.balls[0]; this.poolShot(c, b.x - c.x + rand(-0.2, 0.2), b.z - c.z + rand(-0.2, 0.2), rand(0.4, 1)); c.wait = rand(3, 6); } });
    }]);
    const fire = FURNITURE.find((f) => f.fire && f.room === c.room);
    if (fire) opts.push([this.fires.has(fire.fire) ? T("tidiness") * 0.15 : T("curiosity") * 0.6 + 0.1, () => this.goTo(c, fire.x + Math.sin(fire.rot) * 1.1, fire.z + Math.cos(fire.rot) * 1.1, { arrive: () => this.toggleFire(c, fire.fire) })]);
    const stove = FURN_BY_ID.stove;
    if (c.room === "kitchen") opts.push([this.stove ? T("tidiness") * 0.9 : T("curiosity") * 0.25, () => this.goTo(c, stove.x + 1, stove.z, { arrive: () => this.toggleStove(c) })]);
    this.burnActivities(c, opts);
    const cabs = FURNITURE.filter((f) => f.cab && f.room === c.room);
    if (cabs.length) {
      const open = cabs.filter((f) => this.cabs.has(f.id)), shut = cabs.filter((f) => !this.cabs.has(f.id));
      if (open.length) opts.push([T("tidiness") * 0.8, () => { const f = open[0]; this.goTo(c, f.x + Math.sin(f.rot) * (f.fd / 2 + 0.7), f.z + Math.cos(f.rot) * (f.fd / 2 + 0.7), { arrive: () => this.toggleCab(c, f.id) }); }]);
      if (shut.length) opts.push([T("curiosity") * 0.5, () => { const f = choice(shut); this.goTo(c, f.x + Math.sin(f.rot) * (f.fd / 2 + 0.7), f.z + Math.cos(f.rot) * (f.fd / 2 + 0.7), { arrive: () => this.toggleCab(c, f.id) }); }]);
    }
    // Carry a curiosity elsewhere (and drop it), or put down what we hold.
    const carried = this.handIds(c).map((id) => this.props.byId.get(id)).filter((p) => p && !p.item);
    if (carried.length) opts.push([2, () => { this.release(c, { x: 0, y: 0, z: 0 }, null, carried[0].id); c.wait = 1; }]);
    else {
      const near = this.props.list.filter((p) => !p.core && !p.item && !p.holder && !p.hidden && !p.stash && Math.hypot(p.x - c.x, p.z - c.z) < 6);
      if (near.length) opts.push([T("curiosity") * 0.25 * (1 - T("tidiness") * 0.5), () => { const p = choice(near); this.goTo(c, p.x, p.z, { arrive: () => { this.grab(c, p.id); c.wait = rand(0.5, 1); } }); }]);
    }
    const total = opts.reduce((s, o) => s + o[0], 0);
    if (Math.random() > Math.min(0.55, total * 0.3)) return false;
    let pickW = Math.random() * total;
    for (const [w, fn] of opts) { pickW -= w; if (pickW <= 0) { fn(); c.wait = rand(0.5, 2); return true; } }
    return false;
  }
  globalHumanCd(h) { return !h._approachedAt || this.time - h._approachedAt > 18; }

  wantsToKill(c) {
    const len = DAY_SECONDS;
    const bold = trait(c.id, "boldness");
    const urgency = (this.day === 1 ? this.t / len : (this.t / len) * 0.7) * (0.6 + bold * 0.6);
    if (this.day !== 1 && Math.random() > 0.5 && !c.plan?.stalk && urgency < 0.3) return false;
    if (!this.weaponInHands(c)) {
      const free = [...this.weapons.values()].filter((w) => !w.holder && !w.atBody && !c.usedWeapons.has(w.id));
      if (!free.length) return false;
      // Carrying a weapon openly is risky: only fetch one when it's nearly time.
      if (urgency < 0.35 && Math.random() < 0.7) return false;
      const w = free.sort((a, b) => dist(a, c) - dist(b, c))[0];
      this.goTo(c, w.x, w.z, { hurry: urgency > 0.6, arrive: () => { if (dist(c, w) < 2.4) { this.stowAll(c); for (const id of this.handIds(c)) this.release(c, { x: 0, y: 0, z: 0 }, null, id); this.grab(c, w.id); } } });
      c.wait = 0.5;
      return true;
    }
    const watched = (v) => this.living().some((o) => o !== v && o !== c && !o.isKiller && this.sees(o, v));
    if (urgency > 0.2 && Math.random() < 0.6 && this.tunnelHunt(c, watched)) return true;
    const victims = this.living().filter((v) => v !== c && !v.isKiller && !v.ko && inRoom(v.room) && !watched(v) && (!this.roundWound || this.roundWound.victim === v.id));
    if (!victims.length || urgency < 0.25) return false;
    const v = victims.sort((a, b) => dist(a, c) - dist(b, c))[0];
    this.goTo(c, v.x, v.z, { hurry: urgency > 0.5, stalk: true, arrive: () => {
      if (v.alive && v.room === c.room && dist(v, c) < 2.8 && !watched(v)) this.tryKill(c, v.id);
      else c.wait = 0.4;
    } });
    return true;
  }

  // ---------- AI ↔ AI chats (template lines; overheard by anyone in the room) ----------
  startChat(a, b) {
    a.chat = { with: b.id, lines: 0, next: 0.2, first: true };
    b.chat = { with: a.id, lines: 0, next: 99 };
    a.path = b.path = null;
  }
  endChat(c) {
    const o = this.chars.get(c.chat?.with);
    c.chat = null; c.wait = rand(0.5, 2);
    if (o?.chat) { o.chat = null; o.wait = rand(0.5, 2); }
  }
  updateChats(dt) {
    for (const c of this.chars.values()) {
      if (!c.chat) continue;
      const o = this.chars.get(c.chat.with);
      if (!o?.alive || !c.alive || !o.chat) { this.endChat(c); continue; }
      c.chat.next -= dt;
      if (c.chat.next > 0) continue;
      const total = c.chat.lines + o.chat.lines;
      if (total >= 4) { this.say(c, soulLine(c.id, "farewell") || pick(LINES.bye), 2.5); this.endChat(c); continue; }
      if (!c.isKiller && !c.chat.first && Math.random() < 0.05 + (c.social[o.id] || 0) * 0.04) {
        this.say(c, soulLine(c.id, "searchLine") || choice(["Turn out your pockets.", "What are you hiding there?"]), 2.8);
        this.searchPockets(c, o);
        c.chat.lines++; c.chat.next = 99; o.chat.next = 3;
        continue;
      }
      const line = this.aiShareLine(c, o, c.chat.first);
      c.chat.first = false;
      c.chat.lines++;
      c.anim = Math.random() < 0.5 ? "agree" : null; c.animUntil = this.time + 1.5;
      this.say(c, line.text, 3.6);
      if (line.fact) this.deliver(c, o, line.fact, line.lie, true);
      c.chat.next = 99; o.chat.next = 3.4;
    }
  }
  // AI picks something to say to `o` (shares a fact or asks).
  aiShareLine(c, o, opening) {
    const testimony = Object.values(c.witnessedKillers || {}).map((seen) => this.notes.get(c.id).facts.get(factKey(seen))).find((f) => f && !this.notes.get(o.id).facts.has(f.key));
    const f = testimony || this.pickShareFact(c, o.id);
    if (c.isKiller && Math.random() < 0.45) {
      const lie = this.makeLie(c, null, o.id);
      if (lie) return { text: (opening ? (soulLine(c.id, "greeting", short(o.id)) || pick(LINES.open, short(o.id))) + " " : "") + claimLine(lie, c.id), fact: lie, lie: true };
    }
    if (!f) return { text: opening ? (soulLine(c.id, "greeting", short(o.id)) || pick(LINES.open, short(o.id))) : "I need a moment to think about that." };
    return { text: (opening && Math.random() < 0.5 ? (soulLine(c.id, "greeting", short(o.id)) || pick(LINES.open, short(o.id))) + " " : "") + claimLine(f, c.id), fact: f };
  }
  // Most useful fact c knows that listener doesn't.
  pickShareFact(c, listenerId, topic = null) {
    const mine = this.notes.get(c.id).facts, theirs = this.notes.get(listenerId).facts;
    const kills = knownKills(this, this.notes.get(c.id));
    let best = null, bestScore = -Infinity;
    for (const f of mine.values()) {
      const answering=topic&&['where','person','room','weapon'].includes(topic.kind);
      const relevant=!answering||(topic.kind==='where'?f.kind==='saw'&&f.about===c.id:topic.kind==='person'?f.about===topic.id||f.with===topic.id:topic.kind==='room'?f.room===topic.id:f.weapon===topic.id);
      if(!relevant||(!answering&&theirs.has(f.key))||f.kind==='tod'||f.lie||f.private)continue;
      if (c.isKiller && (f.about === c.id && f.kind !== "saw" || f.kind === "kill")) continue;
      if (f.about === listenerId && ["saw", "ran"].includes(f.kind)) continue;
      let s = Math.random() * 1.5 + (f.day === this.day ? 1 : 0) + (f.src === "self" ? 1 : 0);
      if (f.kind === "body" || f.kind === "kill") s += 8;
      if (f.kind === "held" || f.kind === "missing" || f.kind === "ran") s += 2.5;
      for (const k of kills) if (f.day === k.day && Math.abs(((f.t0 ?? 0) + (f.t1 ?? f.t0 ?? 0)) / 2 - k.t) < 20) s += 4;
      if (topic && (f.about === topic.id || f.weapon === topic.id || f.room === topic.id || f.with === topic.id)) s += 10;
      if (topic?.kind === "where" && f.about === c.id) s += 9;
      if (f.about === c.id && !topic) s -= 1.5;
      if ((f.t1 ?? 0) - (f.t0 ?? 0) < 2 && f.kind === "saw" && !topic) s -= 1;
      if (s > bestScore) { bestScore = s; best = f; }
    }
    return best;
  }
  makeLie(c, topic = null, listenerId = null) {
    const k = [...this.kills].reverse()[0];
    if (!k && this.t < 12) return null;
    // A false sighting about the person listening would be immediately
    // absurd: they know where they were. Pick a third party instead.
    const alive = this.living().filter((x) => x !== c && x.id !== listenerId && !x.isKiller && (!k || x.id !== k.victim));
    if (!alive.length) return null;
    if (!alive.some((x) => x.id === c.scapegoat)) c.scapegoat = choice(alive).id;
    const goat = c.scapegoat;
    const t = Math.round(this.t);
    if (k) {
      if (topic?.kind === "where" || Math.random() < 0.4) {
        const anchor = ROOM_LIST.some((r) => r.id === k.room) ? k.room : ROOM_LIST.some((r) => r.id === c.room) ? c.room : null;
        const nearby = ROOM_LIST.filter((r) => r.id !== k.room).sort((a, b) => anchor ? dist(roomCenter(a.id), roomCenter(anchor)) - dist(roomCenter(b.id), roomCenter(anchor)) : 0).slice(0, anchor ? 3 : ROOM_LIST.length);
        const room = choice(nearby).id;
        return { kind: "saw", about: c.id, room, day: k.day, t0: Math.max(0, k.t - 12), t1: k.t + 10 };
      }
      if (Math.random() < 0.5) return { kind: "held", about: goat, weapon: k.weapon, room: k.room, day: k.day, t0: Math.max(0, k.t - 6) };
      return { kind: "saw", about: goat, room: k.room, day: k.day, t0: Math.max(0, k.t - 8), t1: k.t + 4 };
    }
    const person = this.chars.get(goat);
    const reachable = ROOM_LIST.filter((r) => r.id !== person.room && dist(roomCenter(r.id), person) < Math.min(22, 5 + this.t * 0.8));
    if (!reachable.length) return null;
    const nearbyWeapons = WEAPONS.filter((w) => reachable.some((r) => r.id === w.home));
    if (nearbyWeapons.length && Math.random() < 0.35) {
      const w = choice(nearbyWeapons);
      return { kind: "held", about: goat, weapon: w.id, room: w.home, day: this.day, t0: Math.max(0, t - 5) };
    }
    return { kind: "saw", about: goat, room: choice(reachable).id, day: this.day, t0: Math.max(0, t - 6), t1: Math.max(0, t - 2) };
  }

  // Speaker tells listener a fact. Handles trust/contradiction for AI listeners.
  // Returns "doubt" if the listener caught a contradiction.
  deliver(speaker, listener, fact, lie = false, overheard = false, check = null) {
    const src = `told:${speaker.id}`;
    const f = { ...fact };
    delete f.src; delete f.key;
    let verdict = "new", roll = check;
    if (!listener.human) {
      const own = [...this.notes.get(listener.id).facts.values()].filter((x) => x.src === "self");
      const verified = own.some((o) => factKey(o) === factKey(f));
      const corroborated = this.notes.get(listener.id).facts.has(factKey(f));
      const dc = verified ? 3 : corroborated ? 6 : Math.round(9 + trait(listener.id, "skepticism") * 6 - (listener.trust[speaker.id] || 0) * 0.5);
      roll ||= this.dialogueRoll(speaker, listener, lie ? "lie" : "share", dc);
      roll.dc = dc;
      roll.success = roll.roll === 20 || (roll.roll !== 1 && roll.roll + roll.bonus >= dc);
      if (own.some((o) => contradicts(f, o))) {
        verdict = "doubt";
        bumpTrust(listener, speaker.id, -3);
        bumpSocial(listener, speaker.id, 3.5);
      } else if (verified) { verdict = "known"; if (roll.success) bumpTrust(listener, speaker.id, 1.2); }
      else {
        if (roll.success) bumpTrust(listener, speaker.id, 0.35);
        else { verdict = "rejected"; bumpTrust(listener, speaker.id, -0.55); bumpSocial(listener, speaker.id, 0.5 + trait(listener.id, "skepticism") * 0.4); }
      }
    } else roll ||= this.dialogueRoll(speaker, listener, lie ? "lie" : "share", 8);
    if (speaker.human) this.showDialogueRoll(speaker, listener, lie ? "Deceive" : fact.src === "self" ? "Share" : "Pass on", roll, verdict === "doubt" ? "They know this conflicts with what they saw." : verdict === "rejected" ? "They reject this unverified account." : verdict === "known" ? (roll.success ? "They already checked it; your account fits." : "They know it is true, but your delivery feels rehearsed.") : "They take the account seriously.");
    if (verdict !== "doubt" && verdict !== "rejected") this.learn(listener.id, lie ? { ...f, lie: true } : f, src);
    // Anyone else in the room overhears.
    if (verdict !== "rejected") {
      for (const o of this.witnesses(speaker.room, [speaker.id, listener.id])) {
        if (!this.hears(o, speaker, 7)) continue;
        this.learn(o.id, f, `overheard:${speaker.id}`);
      }
    }
    if (listener.human && verdict !== "doubt" && verdict !== "rejected") this.toSeat(listener.id, { type: "noted", text: factText(f), from: speaker.id });
    return verdict;
  }

  // ---------- conversations with humans ----------
  startConvo(a, b) {
    if (!a || !b || a === b || !a.alive || !b.alive || a.ko || b.ko || this.phase !== "day") return;
    if (a.convo || b.convo || dist(a, b) > 3.6) return;
    if (!a.human && !b.human) return;
    if (b.chat) this.endChat(b);
    if (a.chat) this.endChat(a);
    const id = this.convoSeq++;
    const ai = !a.human ? a : !b.human ? b : null;
    const cv = { id, a: a.id, b: b.id, ai: ai?.id || null, turns: 0, history: [], topic: null, waitingFor: null, readyFor: null, responseDue: null, last: null,
      firstLook: { [a.id]: this.perceive(a, b) > 0.12 ? describeActivity(this, b, a) : null, [b.id]: this.perceive(b, a) > 0.12 ? describeActivity(this, a, b) : null } };
    this.convos.set(id, cv);
    a.convo = b.convo = id;
    a.path = b.path = a.auto = b.auto = null; a.mv = b.mv = a.pace = b.pace = 0;
    for(const c of [a,b])if(c.seat)this.stand(c);
    a.yaw = Math.atan2(b.x - a.x, b.z - a.z); b.yaw = Math.atan2(a.x - b.x, a.z - b.z);
    this.faceConversationPartners();
    this.addCard(a, "person", b.id); this.addCard(b, "person", a.id);
    const talked = { kind: "talked", about: a.id, with: b.id, room: a.room, day: this.day, t0: Math.round(this.t) };
    for (const o of this.witnesses(a.room)) if (o === a || o === b || (this.sees(o, a) && this.sees(o, b))) this.learn(o.id, talked, "self");
    if (ai) {
      const human = ai === a ? b : a;
      bumpTrust(ai, human.id, 0.2);
      if (a.human) {
        // The player who initiated the interaction chooses the opening line.
        cv.waitingFor = a.id;
        this.toSeat(a.id, { type: "convo", id, with: b.id, speaker: null, line: null, options: this.optionsFor(a, b, cv), ...this.talkCtx(a, b) });
      } else this.aiTurn(cv, human, null);
    } else {
      // Human ↔ human: initiator speaks first.
      cv.waitingFor = a.id;
      this.toSeat(a.id, { type: "convo", id, with: b.id, speaker: null, line: null, options: this.optionsFor(a, b, cv), ...this.talkCtx(a, b) });
      this.toSeat(b.id, { type: "convo", id, with: a.id, speaker: a.id, line: "…", options: [], waiting: true });
    }
  }
  endConvo(id, silent = false) {
    const cv = this.convos.get(id);
    if (!cv) return;
    this.convos.delete(id);
    for (const pid of [cv.a, cv.b]) {
      const c = this.chars.get(pid);
      if (c?.convo === id) { c.convo = null; c.wait = rand(1, 3); c.humanCd = Math.max(c.humanCd, 30); }
      this.toSeat(pid, { type: "convoEnd", id });
    }
  }
  // Patience comes from this soul's baseline, current trust and what they
  // actually know about tonight. The timer begins only after client TTS ends.
  patience(cv, human) {
    const id = cv.butler ? "butler" : cv.ai;
    if (!id) return 18;
    const ai = this.chars.get(id);
    const trust = cv.butler ? 0 : ai?.trust?.[human.id] || 0;
    let secs = 9 + 8 * (1 - trait(id, "restlessness")) + 6 * trait(id, "sociability") + 3 * (1 - trait(id, "skepticism")) + 3 * trust;
    if (ai?.wound) secs -= 3;
    if (human?.wound) secs += 1;
    if (ai && knownKills(this, this.notes.get(id)).some((k) => k.day === this.day)) secs -= 2;
    if (["offended", "deflect", "search", "caught"].includes(cv.last?.kind)) secs -= 2;
    if (cv.last?.kind === "team_offer") secs += 2;
    return Math.round(Math.max(12, Math.min(36, secs)));
  }
  updateConvos() {
    for (const cv of this.convos.values()) {
      if (cv.closingAt && this.time >= cv.closingAt) { this.endConvo(cv.id); continue; }
      if (!cv.waitingFor || !cv.responseDue || this.time < cv.responseDue) continue;
      const human = this.chars.get(cv.waitingFor), ai = this.chars.get(cv.ai);
      if (cv.butler && human) {
        const line = "If you need more time, I shall return to my duties.";
        cv.waitingFor = cv.readyFor = cv.responseDue = null;
        cv.closingAt = this.time + 4.2;
        this.butlerSay(line, 4);
        this.toSeat(human.id, { type: "convo", id: cv.id, with: "butler", speaker: "butler", line, options: [], instantAi: true });
        continue;
      }
      if (ai && human) {
        // Out of patience: a d20 decides whether the silence annoys them.
        // Each grace they have already granted makes the next one harder.
        const trust = ai.trust?.[human.id] || 0;
        const dc = 9 + Math.round(trait(ai.id, "restlessness") * 6) + Math.round(trait(ai.id, "skepticism") * 3) + 4 * (cv.graces || 0);
        const r = 1 + Math.floor(Math.random() * 20), bonus = Math.round(trust / 2);
        const roll = { roll: r, bonus, dc, success: r === 20 || (r !== 1 && r + bonus >= dc) };
        this.showDialogueRoll(human, ai, "Patience", roll, roll.success ? `${short(ai.id)} lets the silence go and waits a little longer.` : `${short(ai.id)} has had enough of waiting.`);
        if (roll.success) {
          cv.graces = (cv.graces || 0) + 1;
          const secs = Math.max(4, Math.round(this.patience(cv, human) / 2));
          cv.responseDue = this.time + secs;
          this.say(ai, pick(["Take your time.", "Well? I'm listening.", "Go on, I'm in no hurry.", "Hm? Something on your mind?"]), 3);
          this.toSeat(human.id, { type: "convoTimer", id: cv.id, secs });
          continue;
        }
        bumpTrust(ai, human.id, -0.5);
      }
      cv.waitingFor = cv.readyFor = cv.responseDue = null;
      if (!ai || !human) { this.endConvo(cv.id); continue; }
      const line = soulLine(ai.id, "silenceLine") || "You seem occupied. We can talk later.";
      cv.closingAt = this.time + 4.2;
      this.say(ai, line, 4);
      this.toSeat(human.id, { type: "convo", id: cv.id, with: ai.id, speaker: ai.id, line, options: [], instantAi: true });
    }
  }
  dialogueRoll(actor, listener, tag, dcOverride = null) {
    const stat = tag === "ask" ? "curiosity" : tag === "accuse" ? "boldness" : tag === "lie" ? "deception" : "persuasion";
    const bonus = Math.round((trait(actor.id, stat) - 0.5) * 8) + Math.round((listener.trust?.[actor.id] || 0) / 2);
    const dc = dcOverride ?? (tag === "ask" ? 8 : tag === "accuse" ? 12 : tag === "lie" ? 11 : 10);
    const roll = 1 + Math.floor(Math.random() * 20);
    return { roll, bonus, dc, success: roll === 20 || (roll !== 1 && roll + bonus >= dc) };
  }
  showDialogueRoll(actor, listener, tag, result, text) {
    this.toSeat(actor.id, { type: "dialogueDice", tag, target: listener.id, ...result, result: text });
  }

  // Options a human can choose, built from their notebook + cards.
  optionsFor(me, them, cv) {
    const note = this.notes.get(me.id);
    cv.options = cv.options || {};
    if (cv.teamOffer?.to === me.id) {
      const out = [
        { tag: "teamAccept", text: choice(["Yes — let's stick together.", "All right, I'll stay with you.", "Agreed. Neither of us out of sight."]), tone: "warm", kind: "Accept" },
        { tag: "teamDecline", text: choice(["No, thank you. I'll manage on my own.", "I'd rather not, but thank you.", "Not today, I think."]), tone: "leave", kind: "Decline" },
      ];
      cv.options[me.id] = out;
      return out.map((o, i) => ({ i, text: o.text, tone: o.tone, kind: o.kind, hint: optionHint(this, me, them, o, null) }));
    }
    const opts = [];
    const topic = cv.topic;
    const kills = knownKills(this, note);
    const boldness = trait(me.id, "boldness"), curiosity = trait(me.id, "curiosity");
    // Shares (truthful)
    const shares = [];
    const used = new Set(cv.history.filter((h) => h.fact).map((h) => h.fact));
    const candidates = [...note.facts.values()].filter(f=>!(f.kind==='talked'&&[me.id,them.id].includes(f.about)&&[me.id,them.id].includes(f.with))&&!(f.kind==='saw'&&f.about===me.id&&topic?.kind!=='where')).filter((f) => f.kind !== "tod" && !f.private && !used.has(f.key) && !(me.isKiller && f.kind === "kill") && !f.lie && !(f.about === them.id && ["saw", "ran"].includes(f.kind)) && f.src !== `told:${them.id}` && !(f.src === `overheard:${them.id}`));
    const score = (f) => {
      let s = (f.day === this.day ? 2 : 0) + (f.src === "self" ? 1 : 0) + Math.random();
      if (f.kind === "body" || f.kind === "kill") s += 8;
      if (f.kind === "held" || f.kind === "missing" || f.kind === "ran") s += 2;
      if (f.kind === "saw" && f.about === me.id && topic?.kind !== "where") s -= 4;
      if (f.kind === "talked" && (f.about === me.id || f.with === me.id) && !topic) s -= 2;
      for (const k of kills) if (f.day === k.day && Math.abs(((f.t0 ?? 0) + (f.t1 ?? f.t0 ?? 0)) / 2 - k.t) < 20) s += 4;
      if (topic && (f.about === topic.id || f.weapon === topic.id || f.room === topic.id || f.with === topic.id)) s += 10;
      if (topic?.kind === "where" && f.about === me.id) s += 12;
      if (f.about === them.id && f.kind === "saw" && topic?.kind !== "where") s -= 3;
      return s;
    };
    const ranked = candidates.map((f) => ({ f, weight: score(f) })).sort((a, b) => b.weight - a.weight);
    for (const { f } of ranked.slice(0, me.isKiller ? 1 : trait(me.id, "sociability") > 0.58 || trait(me.id, "memory") > 0.82 ? 2 : 1)) shares.push({ tag: "share", fact: f.key, text: claimLine(f, me.id), tone: f.kind === "kill" || f.kind === "body" ? "urgent" : "neutral", kind: f.src === "self" ? "Share" : "Pass on" });
    opts.push(...shares);
    // A killer always has two distinct deceptions. One can be a fabricated
    // fact once the night has enough history; the other conceals intent.
    // Early in a night, two intent bluffs avoid implausible room sightings.
    if (me.isKiller) {
      const lie = this.makeLie(me, topic, them.id);
      if (lie) { const k = `lie${cv.turns}`; cv.lies = cv.lies || {}; cv.lies[k] = lie; opts.push({ tag: "lie", lie: k, text: claimLine(lie, me.id), tone: "sly", kind: "Deceit" }); }
      const bluffs = [
        { tag: "bluff", bluff: "safety", text: choice(["I only want to keep everyone safe tonight.", "You can trust me to protect the others.", "I promise I'll keep the others safe."]), tone: "sly", kind: "Deceit" },
        { tag: "bluff", bluff: "help", text: choice(["I'll help you find whoever is doing this.", "Count on me to help uncover who did it.", "I'll help you catch whoever is hurting people."]), tone: "sly", kind: "Deceit" },
      ];
      opts.push(...bluffs.slice(0, lie ? 1 : 2));
    }
    // Ask (learn)
    const asks = [];
    const look = cv.turns === 0 ? cv.firstLook?.[me.id] : null;
    if (look && /holding|hurrying|busy|staring|lingering/.test(look)) asks.push({ tag: "ask", topic: { kind: "activity", id: them.id, observation: look }, text: `You were ${look}. What were you doing?`, look });
    if (kills.length) asks.push({ tag: "ask", topic: { kind: "where", id: them.id }, text: `Where were you around ${clockLabel(kills[kills.length - 1].t)}?` });
    const cards = me.cards.length ? me.cards : [];
    const persons = [...new Set([...cards.filter((x) => x.type === "person").map((x) => x.id), ...[...note.facts.values()].filter((f) => f.kind === "saw").map((f) => f.about)])].filter((id) => id !== me.id && id !== them.id && this.chars.get(id)?.alive);
    if (persons.length) { const p = choice(persons); asks.push({ tag: "ask", topic: { kind: "person", id: p }, text: choice([`Have you seen ${short(p)} today?`, `Any idea where ${short(p)} has got to?`, `What's ${short(p)} been up to, do you know?`]) }); }
    const weapons = [...new Set([...cards.filter((x) => x.type === "weapon").map((x) => x.id), ...kills.length ? WEAPONS.map((w) => w.id) : []])];
    if (weapons.length) { const w = choice(weapons); asks.push({ tag: "ask", topic: { kind: "weapon", id: w }, text: choice([`Who's had their hands on the ${weaponName(w)}?`, `Seen anyone carrying the ${weaponName(w)} about?`]) }); }
    const rooms = cards.filter((x) => x.type === "room").map((x) => x.id);
    if (rooms.length || kills.length) { const r = choice(rooms.length ? rooms : ROOM_LIST.map((x) => x.id)); asks.push({ tag: "ask", topic: { kind: "room", id: r }, text: choice([`Who have you seen in ${roomName(r)}?`, `Did you hear anyone in ${roomName(r)} earlier tonight?`, `Has anyone been going in and out of ${roomName(r)}?`]) }); }
    const pickedAsks = look && asks[0]?.look ? [asks[0], ...shuffle(asks.slice(1))] : shuffle(asks);
    for (const a of pickedAsks.slice(0, curiosity > 0.68 ? 2 : 1)) opts.push({ ...a, tone: "curious", kind: "Ask" });
    // Accuse
    const strongEvidence = [...note.facts.values()].some((f) => f.kind === "kill" || f.kind === "caught");
    if (kills.length && (boldness >= 0.5 || strongEvidence || this.day >= 3)) {
      const j = judgeKill(this, { id: me.id, trust: {}, social: {} }, note, kills[kills.length - 1]);
      delete j.susp[them.id];
      const sus = Object.values(me.witnessedKillers || {}).at(-1)?.about || argmax(j.susp).key;
      if (sus) opts.push({ tag: "accuse", target: sus, text: me.isKiller && Math.random() < 0.5 ? `Between us, I think ${short(me.scapegoat || sus)} did it.` : `I think ${short(sus)} did it.`, tone: "bold", kind: "Accuse", targetOverride: me.isKiller ? me.scapegoat : null });
    }
    if (opts.length < 2) opts.push({ tag: "ask", topic: { kind: "general" }, text: "Seen anything strange today?", tone: "curious", kind: "Ask" });
    const out = opts.slice(0, 4);
    if ((boldness >= 0.35 || trait(me.id, "observation") >= 0.85 || this.day >= 3) && !them.searchedBy?.has(`${me.id}:${this.day}`)) {
      const search = { tag: "search", text: soulLine(me.id, "searchLine") || choice(["Turn out your pockets, would you?", "Mind if I check your pockets?"]), tone: "bold", kind: "Search" };
      // Preserve the killer's truthful claim and both Deceit choices.
      const replace = out.length >= 4 ? out.findLastIndex((o) => o.tag !== "share" && o.kind !== "Deceit" && !o.look) : -1;
      if (replace >= 0) out.splice(replace, 1, search);
      else out.push(search);
    }
    if (this.canOfferTeam(me, them, cv)) out.splice(Math.min(out.length, 2), 0, this.teamOption(me));
    if(this.canAskHair(me,them))out.unshift({tag:'hairAsk',text:me.isKiller?'May I help tidy your hair at the bathroom chair?':'My task is to cut hair. May I give you a trim in the bathroom?',tone:'warm',kind:'Share task'});
    // Keep ordinary conversation available even before the first useful clue.
    out.push({tag:'casual',topic:{kind:'casual',id:'mood'},text:'How are you holding up?',tone:'warm',kind:'Chat'});
    out.push({tag:'casual',topic:{kind:'casual',id:'house'},text:'What do you make of this place?',tone:'warm',kind:'Chat'});
    out.push({ tag: "end", text: Math.random() < 0.5 && soulLine(me.id, "farewell") || choice(["I should be going.", "Excuse me.", "Let's talk later."]), tone: "leave", kind: "" });
    cv.options = cv.options || {};
    cv.options[me.id] = out;
    const factOf = (o) => o.fact ? note.facts.get(o.fact) : o.lie ? cv.lies?.[o.lie] : null;
    return out.map((o, i) => ({ i, text: o.text, tone: o.tone, kind: o.kind, bluff: o.bluff || null, hint: optionHint(this, me, them, o, factOf(o)) }));
  }

  choose(c, convoId, i, text) {
    const cv = this.convos.get(convoId);
    if (cv?.butler) return cv.a === c.id ? this.butlerChoose(c, cv, i) : undefined;
    if (!cv || cv.waitingFor !== c.id) return;
    const opt = cv.options?.[c.id]?.[i];
    if (!opt) return;
    if(opt.tag==='hairAsk'){this.endConvo(cv.id,true);return this.askHair(c,cv.a===c.id?cv.b:cv.a);}
    cv.waitingFor = cv.readyFor = cv.responseDue = null;
    cv.graces = 0;
    const other = this.chars.get(cv.a === c.id ? cv.b : cv.a);
    const line = (typeof text === "string" && text.trim() ? text.trim().slice(0, 200) : opt.text);
    // A demand out of character or a practiced lie can color the listener's
    // suspicions even when the factual content of a choice is unchanged.
    if (!other.human && opt.tag === "lie") bumpSocial(other, c.id, 0.25 + (1 - trait(c.id, "deception")) * 0.7);
    if (!other.human && (opt.tag === "search" || opt.tag === "accuse")) bumpSocial(other, c.id, 0.15 + (1 - trait(c.id, "boldness")) * 0.65);
    this.say(c, line, 4.5);
    cv.history.push({ speaker: c.id, text: line, fact: opt.fact });
    cv.turns++;
    let reaction = null;
    if (opt.tag === "share") {
      const f = this.notes.get(c.id).facts.get(opt.fact);
      if (f) reaction = this.deliver(c, other, f, false);
    } else if (opt.tag === "lie") {
      const lie = cv.lies?.[opt.lie];
      if (lie) reaction = this.deliver(c, other, lie, true);
    } else if (opt.tag === "bluff") {
      const caught = !other.human && [...this.notes.get(other.id).facts.values()].some((f) => f.src === "self" && (f.kind === "kill" || f.kind === "wound") && f.about === c.id);
      if (caught) {
        bumpTrust(other, c.id, -2);
        this.toast(c, `${short(other.id)} saw what you did. Reassurance will not convince them.`);
        reaction = "bluffDoubt";
      } else {
        const roll = this.dialogueRoll(c, other, "lie");
        if (!other.human) bumpTrust(other, c.id, roll.success ? 0.25 : -0.45);
        this.showDialogueRoll(c, other, "Deceive", roll, roll.success ? "Your reassurance sounds sincere." : "Your reassurance sounds rehearsed.");
        reaction = roll.success ? null : "bluffDoubt";
      }
    } else if(opt.tag==='casual'){
      cv.topic=opt.topic; if(!other.human)bumpTrust(other,c.id,.05);
    } else if (opt.tag === "ask") {
      const roll = this.dialogueRoll(c, other, "ask", Math.round(7 + trait(other.id, "skepticism") * 5));
      this.showDialogueRoll(c, other, "Ask", roll, roll.success ? "They consider the question." : "The question puts them on guard.");
      cv.topic = opt.topic;
      if (!other.human) { bumpTrust(other, c.id, roll.success ? 0.1 : -0.25); if (!roll.success) reaction = "pressed"; }
    } else if (opt.tag === "accuse") {
      const roll = this.dialogueRoll(c, other, "accuse", Math.round(10 + trait(other.id, "skepticism") * 6));
      this.showDialogueRoll(c, other, "Accuse", roll, roll.success ? "The accusation lands." : "The accusation sounds thin.");
      const target = opt.target;
      if (!other.human) {
        if (target === other.id) { bumpTrust(other, c.id, -2); bumpSocial(other, c.id, 1); reaction = "offended"; }
        else { if (roll.success) bumpSocial(other, target, 0.6 + (other.trust[c.id] || 0) * 0.25); else { bumpTrust(other, c.id, -0.5); reaction = "unpersuaded"; } if ((other.trust[target] || 0) > 2) bumpTrust(other, c.id, -0.6); }
      }
      cv.topic = { kind: "accuse", id: target };
    } else if (opt.tag === "search") {
      const r = this.searchPockets(c, other, cv.id);
      if (!other.human) {
        bumpTrust(other, c.id, -0.8);
        const bad = r?.success && r.found.some((it) => it.bloody || it.kind === "bleach" || it.wet);
        reaction = r?.success ? (bad ? "caught" : "searched") : "evaded";
      }
    } else if (opt.tag === "team") {
      const ok = this.proposeTeam(c, other, cv);
      if (other.human) {
        if (ok) cv.teamOffer = { from: c.id, to: other.id };
        else {
          // Their character's own instincts decline before they're asked.
          const no = soulLine(other.id, "teamNo") || "No, thank you. I'd rather keep to myself today.";
          this.say(other, no, 4);
          cv.history.push({ speaker: other.id, text: no });
          this.toast(other, `${short(c.id)} asked to team up, but ${SUSPECTS.find((s) => s.id === other.id)?.short || "your guest"}'s instincts said no.`);
          cv.waitingFor = other.id;
          this.toSeat(other.id, { type: "convo", id: cv.id, with: c.id, speaker: c.id, line, options: this.optionsFor(other, c, cv), ...this.talkCtx(other, c) });
          this.toSeat(c.id, { type: "convo", id: cv.id, with: other.id, speaker: other.id, line: no, options: [], waiting: true });
          return;
        }
      } else {
        if (ok) this.formTeam(c, other);
        reaction = ok ? "teamYes" : "teamNo";
      }
    } else if (opt.tag === "teamAccept" || opt.tag === "teamDecline") {
      const offer = cv.teamOffer;
      cv.teamOffer = null;
      if (offer && opt.tag === "teamAccept" && !c.team && !other.team) this.formTeam(c, other);
      reaction = opt.tag === "teamAccept" ? "teamAccepted" : "teamDeclined";
    } else if (opt.tag === "end") {
      if (cv.turns <= 1) {
        const dc = Math.round(trait(other.id, "leave_dc"));
        const roll = this.dialogueRoll(c, other, "end", dc);
        this.showDialogueRoll(c, other, "Leave", roll, roll.success ? "They let you go without a second thought." : "Your abrupt exit makes them suspicious.");
        if (!other.human && !roll.success) { bumpTrust(other, c.id, -0.7); bumpSocial(other, c.id, other.id === "red" ? 2.5 : 0.65); this.say(other, soulLine(other.id, "walkawayLine") || "That was abrupt.", 3.5); }
      }
      this.endConvo(cv.id);
      return;
    }
    if (!other.human) this.aiTurn(cv, c, { opt, reaction });
    else {
      cv.waitingFor = other.id;
      this.toSeat(other.id, { type: "convo", id: cv.id, with: c.id, speaker: c.id, line, options: this.optionsFor(other, c, cv), ...this.talkCtx(other, c) });
      this.toSeat(c.id, { type: "convo", id: cv.id, with: other.id, speaker: c.id, line, options: [], waiting: true });
    }
  }

  // AI decides what it says next (the "intent"); the client voices it.
  aiTurn(cv, human, last) {
    const ai = this.chars.get(cv.ai);
    const intent = { kind: "open", line: "", fact: null };
    const topic = cv.topic;
    let fact = null, lie = false;
    const testimony = Object.values(ai.witnessedKillers || {}).map((seen) => this.notes.get(ai.id).facts.get(factKey(seen))).filter(Boolean).at(-1);
    const recent = [...this.notes.get(ai.id).facts.values()].filter((f) => f.kind === "watched" && f.about === human.id && f.day === this.day).at(-1);
    if (recent) intent.scene = factText(recent);
    if (cv.turns >= 7) {
      intent.kind = "goodbye"; intent.line = pick(LINES.bye);
    } else if(last?.opt?.tag==='casual'){
      intent.kind='casual';
      const tense=/rattled|frightened|guarded|irritable|uneasy/.test(ai.temper||'');
      intent.line=last.opt.topic.id==='mood'?(tense?"A little on edge, honestly. It helps to have someone to talk to.":"I'm managing, thank you. How are you holding up?"):"It's an imposing place. I'd rather have some company than wander it alone.";
      cv.topic=null;
    } else if(last?.opt?.topic?.kind==='activity'){
      intent.kind='activity_answer';
      const observed=last.opt.topic.observation||last.opt.look;
      // Acknowledge the actual pre-conversation observation. Never replace an
      // activity question with a random alibi or fabricate why they did it.
      intent.line=`I was ${observed}.`;
      const task=ai.task;
      if(!ai.isKiller&&task&&!task.complete&&['bathroom','grime'].includes(task.id)&&/rag|towel|bleach/.test(observed))intent.line+=' I have some cleaning to finish.';
      else if(/staring|looking|lingering/.test(observed))intent.line+=" It caught my attention; I can't tell you anything more about it.";
      else intent.line+=" That's what you saw me doing just before we spoke.";
      intent.question=last.opt.text;cv.topic=null;
    } else if (testimony && !cv.witnessTold && last?.opt?.tag!=='ask') {
      cv.witnessTold = true;
      fact = testimony;
      intent.kind = "open_share";
      intent.line = claimLine(testimony, ai.id);
    } else if (last?.reaction === "doubt") {
      intent.kind = "doubt";
      const own = [...this.notes.get(ai.id).facts.values()].find((o) => o.src === "self" && contradicts(this.lastClaim(cv, human), o));
      if (own) fact = own;
      intent.line = own ? claimLine(own, ai.id) : "That does not match what I saw.";
    } else if (["caught", "searched", "evaded"].includes(last?.reaction)) {
      intent.kind = last.reaction;
      intent.line = last.reaction === "caught" ? choice(["That… that's not what it looks like!", "I found that! I was going to tell someone!", "Give that back. It's nothing."]) : last.reaction === "searched" ? choice(["Satisfied? Nothing to hide.", "There. Happy now?", "As you can see — nothing."]) : choice(["Hands off! How dare you.", "I think not.", "Keep your hands to yourself."]);
    } else if (["teamYes", "teamNo", "teamAccepted", "teamDeclined"].includes(last?.reaction)) {
      const r = last.reaction;
      intent.kind = r === "teamNo" ? "team_no" : r === "teamDeclined" ? "team_declined" : "team_yes";
      intent.line = r === "teamNo" ? soulLine(ai.id, "teamNo") || "No. I'd rather keep to myself today." : r === "teamDeclined" ? choice(["Suit yourself.", "As you like. Be careful, then.", "Fair enough."]) : r === "teamAccepted" ? choice(["Good. Stay close.", "Then don't wander off.", "Right. Where you go, I go."]) : soulLine(ai.id, "teamYes") || "Very well. Stay where I can see you.";
    } else if (last?.reaction === "offended") {
      intent.kind = "offended"; intent.line = "How dare you. I'll be watching you very closely.";
    } else if (last?.reaction === "rejected") {
      intent.kind = "reject"; intent.line = soulLine(ai.id, "rejectLine") || "I cannot take that as fact without something to support it.";
    } else if (last?.reaction === "bluffDoubt") {
      intent.kind = "deflect"; intent.line = "Show me what you do, then. Promises are easy.";
    } else if (last?.reaction === "pressed") {
      intent.kind = "deflect"; intent.line = "Give me a moment. I will answer when I know what you mean.";
    } else if (last?.reaction === "unpersuaded") {
      intent.kind = "disagree"; intent.line = "You have not given me enough to accuse them.";
    } else if (last?.opt?.tag === "accuse") {
      const kills = knownKills(this, this.notes.get(ai.id));
      const j = kills.length ? judgeKill(this, ai, this.notes.get(ai.id), kills[kills.length - 1]) : null;
      const top = j ? argmax(j.susp).key : null;
      intent.kind = ai.isKiller || top === last.opt.target ? "agree" : "disagree";
      intent.line = pick(intent.kind === "agree" ? LINES.agree : LINES.disagree);
    } else if (last?.opt?.tag === "ask") {
      const willing = ai.isKiller || (ai.trust[human.id] || 0) > -2.5;
      if (!willing) { intent.kind = "deflect"; intent.line = pick(LINES.deflect); }
      else {
        if (ai.isKiller && topic?.kind === "where") { fact = this.makeLie(ai, topic, human.id); lie = !!fact; }
        if (!fact) fact = this.pickShareFact(ai, human.id, topic);
        if (fact) { intent.kind = "answer"; intent.line = claimLine(fact, ai.id); }
        else { intent.kind = "nothing"; intent.line = "I'm afraid I haven't noticed anything about that."; }
      }
    } else {
      // Opening or reacting to a share: offer something back or ask.
      const kills = knownKills(this, this.notes.get(ai.id));
      const wary = (ai.social[human.id] || 0) * 0.06 + trait(ai.id, "curiosity") * 0.08 + (kills.length ? 0.06 : 0);
      if (!ai.isKiller && cv.turns >= 1 && !human.searchedBy?.has(`${ai.id}:${this.day}`) && Math.random() < wary) {
        intent.kind = "search"; intent.line = choice(["Forgive me — turn out your pockets.", "Before we go on, show me what you're carrying.", "Let's see your pockets, then."]);
        this.searchPockets(ai, human, cv.id);
        cv.waitingFor = human.id; cv.last = intent;
        const options = this.optionsFor(human, ai, cv);
        this.toSeat(human.id, { type: "convo", id: cv.id, with: ai.id, speaker: ai.id, options, ai: true, intent: { ...intent, mood: "cold" }, history: cv.history.slice(-6).map((h) => ({ speaker: h.speaker, text: h.text })), day: this.day, clock: clockLabel(this.t), ...this.talkCtx(human, ai) });
        return;
      }
      // A guest who has warmed to you may propose sticking together.
      if (this.canOfferTeam(ai, human, cv) && ((ai.trust[human.id] || 0) > 0.4 || (ai.isKiller && Math.random() < 0.5)) && this.proposeTeam(ai, human, cv)) {
        intent.kind = "team_offer"; intent.line = soulLine(ai.id, "teamOffer") || "Let's stick together for the rest of the day.";
        cv.teamOffer = { from: ai.id, to: human.id };
        intent.prefix = null;
        cv.waitingFor = human.id; cv.readyFor = cv.responseDue = null; cv.last = intent;
        const trust = ai.trust[human.id] || 0;
        this.toSeat(human.id, { type: "convo", id: cv.id, with: ai.id, speaker: ai.id, options: this.optionsFor(human, ai, cv), ai: true, intent: { ...intent, mood: trust > 2 ? "warm" : "guarded" }, history: cv.history.slice(-6).map((h) => ({ speaker: h.speaker, text: h.text })), day: this.day, clock: clockLabel(this.t), ...this.talkCtx(human, ai) });
        return;
      }
      const reciprocate = Math.random() < (last ? 0.65 : 0.6);
      if (reciprocate) {
        if (ai.isKiller && Math.random() < 0.55) { fact = this.makeLie(ai, null, human.id); lie = !!fact; }
        if (!fact) fact = this.pickShareFact(ai, human.id);
      }
      if (fact) { intent.kind = last ? "react_share" : "open_share"; intent.line = claimLine(fact, ai.id); }
      else if (kills.length) { intent.kind = "ask"; cv.topic = { kind: "where", id: human.id }; intent.line = `Where were you around ${clockLabel(kills[kills.length - 1].t)}?`; intent.ask = intent.line; }
      else {
        const p = choice(this.living().filter((x) => x.id !== ai.id && x.id !== human.id)) || ai;
        cv.topic = { kind: "person", id: p.id };
        intent.kind = "ask"; intent.line = `Have you seen ${short(p.id)} anywhere today?`; intent.ask = intent.line;
      }
      // The voice model reacts to the actual exchange. A fixed soul reaction
      // can imply unrelated weather, routes or mechanisms as if observed here.
      intent.prefix = null;
    }
    if (fact?.doing) intent.detail = `${fact.about === ai.id ? "You were" : `${short(fact.about)} was`} ${fact.doing}${fact.src && fact.src !== "self" ? " (you heard this from someone else)" : ""}.`;
    if (fact && intent.kind !== "doubt") this.deliver(ai, human, fact, lie);
    cv.waitingFor = human.id; cv.readyFor = cv.responseDue = null;
    cv.last = intent;
    const options = intent.kind === "goodbye" ? [{ i: 0, text: "Goodbye.", tone: "leave", kind: "" }] : this.optionsFor(human, ai, cv);
    if (intent.kind === "goodbye") cv.options[human.id] = [{ tag: "end", text: "Goodbye." }];
    const trust = ai.trust[human.id] || 0;
    this.toSeat(human.id, {
      type: "convo", id: cv.id, with: ai.id, speaker: ai.id, options, ai: true,
      intent: { ...intent, mood: trust > 2 ? "warm" : trust < -2 ? "cold" : "guarded", deceptive: lie },
      history: cv.history.slice(-6).map((h) => ({ speaker: h.speaker, text: h.text })),
      day: this.day, clock: clockLabel(this.t), ...this.talkCtx(human, ai),
    });
  }
  talkCtx(me, them) {
    const cv = this.convos.get(me.convo);
    const recentTruth = [...this.notes.get(me.id).facts.values()].filter((f) => f.src === "self" && (f.kind !== "saw" || f.about !== me.id)).slice(-3).map(factText);
    const ownAttacks = me.isKiller ? this.kills.filter((k) => k.killer === me.id).slice(-2).map((k) => `You killed ${short(k.victim)} in ${roomName(k.room)} on night ${k.day}.`) : [];
    const killerContext = me.isKiller ? [...ownAttacks, me.dragging ? `You are dragging ${short(me.dragging)}'s body now.` : ""].filter(Boolean).join(" ") : null;
    return { scene: sceneContext(this, me, them), firstLook: cv?.firstLook?.[me.id] || "", recentTruth, killerContext, temper: me.temper, aiTemper: them.human ? null : them.temper, aiScene: them.human ? null : sceneContext(this, them, me) };
  }
  lastClaim(cv, human) {
    const h = [...cv.history].reverse().find((x) => x.speaker === human.id);
    if (!h) return {};
    const lieKey = Object.entries(cv.lies || {}).find(([, l]) => claimLine(l, human.id) === h.text)?.[1];
    return lieKey || this.notes.get(human.id).facts.get(h.fact) || {};
  }

  // ---------- accusation ----------
  startAccusation() {
    this.settleTasks(); this.settleTeams();
    for (const id of [...this.convos.keys()]) this.endConvo(id, true);
    for (const c of this.chars.values()) if (c.chat) this.endChat(c);
    this.phase = "accuse";
    this.wakeAll("You stagger to the table.");
    const seated = this.living();
    seated.forEach((c, i) => {
      const a = (i / seated.length) * Math.PI * 2;
      if (c.seat) this.stand(c);
      for (const id of this.handIds(c)) this.release(c, { x: 0, y: 0, z: 0 }, null, id);
      c.pouring = false; if (c.dragging) this.stopDrag(c);
      const p = { x: TABLE.x + Math.sin(a) * TABLE.seatR, z: TABLE.z + Math.cos(a) * TABLE.seatR };
      const center = TABLE;
      c.x = p.x; c.z = p.z; c.yaw = Math.atan2(center.x - p.x, center.z - p.z); c.mv = 0; c.path = null; c.room = "cellar";
    });
    this.acc = { stage: "propose", until: this.time + 35, proposals: {}, rebuttals: [], votes: {}, round: 0, limits: {}, result: null, locked: {} };
    this.broadcast({ type: "toast", text: this.day >= this.lastDay ? "Final accusation. Get it right." : "To the table. Make your accusation.", sfx: "gavel" });
    // AI proposals arrive with a little delay.
    for (const c of seated) if (!c.human) c.accAt = this.time + rand(2, 7);
    this.pushAcc();
  }
  pushAcc() {
    const a = this.acc;
    const pub = {
      type: "acc", stage: a.stage, left: Math.max(0, Math.ceil(a.until - this.time)), day: this.day, final: this.day >= this.lastDay,
      seated: this.living().map((c) => c.id), proposals: a.proposals, rebuttals: a.rebuttals.map((r) => ({ by: r.by, target: r.target, text: r.text })),
      votes: a.stage === "tally" || a.stage === "reveal" ? a.votes : Object.fromEntries(Object.keys(a.votes).map((k) => [k, true])),
      limits: a.limits, result: a.result, tally: a.tally || null,
    };
    this.broadcast(pub);
    for (const id of this.humans) {
      const c = this.chars.get(id);
      if (!c.alive) continue;
      if (a.stage === "rebut") this.toSeat(id, { type: "rebutOptions", options: this.rebutOptions(c) });
    }
  }
  rebutOptions(c) {
    const note = this.notes.get(c.id);
    const out = [];
    for (const [by, p] of Object.entries(this.acc.proposals)) {
      if (by === c.id) continue;
      // Alibis / contradictions for the accused, room or weapon.
      const kills = knownKills(this, note);
      for (const f of note.facts.values()) {
        const k = kills[kills.length - 1];
        if (!k) break;
        const near = f.day === k.day && Math.max(f.t0 ?? f.t, k.t - 8) <= Math.min(f.t1 ?? f.t0 ?? f.t, k.t + 8);
        if (f.kind === "saw" && f.about === p.p && near && f.room !== p.r) out.push({ target: by, key: f.key, text: `${short(by)} is wrong — ${claimLine(f, c.id)}` });
        if (f.kind === "body" && ((!f.bleedOut && f.room !== p.r) || f.weapon !== p.w)) out.push({ target: by, key: f.key, text: `${short(by)}, no — ${claimLine(f, c.id)}` });
        if (f.kind === "kill" && f.about !== p.p) out.push({ target: by, key: f.key, text: `${short(by)}, you've got it wrong. ${claimLine(f, c.id)}` });
        if (f.kind === "team" && f.full && f.day === k.day && (f.about === p.p || f.with === p.p)) out.push({ target: by, key: f.key, text: `${short(by)}, that can't be — ${claimLine(f, c.id)}` });
      }
      if (c.isKiller && this.killers.includes(p.p) && this.chars.get(p.p)?.alive) {
        const lie = this.makeLie(c, { kind: "where" });
        if (lie) { this.acc.lies = this.acc.lies || {}; const k = `L${by}`; this.acc.lies[k] = lie; out.push({ target: by, key: k, lie: true, text: `${short(by)}, that's impossible — ${claimLine(lie, c.id)}` }); }
      }
    }
    const seen = new Set();
    return out.filter((o) => (seen.has(o.text) ? false : seen.add(o.text))).slice(0, 5).map((o, i) => ({ i, ...o }));
  }
  accVote(c, a) {
    const A = this.acc;
    if (!A || !c.alive) return;
    const triple = { p: a.p, w: a.w, r: a.r };
    if (!SUSPECTS.some((s) => s.id === triple.p) || !WEAPONS.some((w) => w.id === triple.w) || !ROOM_LIST.some((r) => r.id === triple.r)) return;
    if (A.stage === "propose" && a.type === "propose") { A.proposals[c.id] = triple; A.votes[c.id] = triple; }
    else if (A.stage === "vote" && a.type === "vote") {
      for (const k of ["p", "w", "r"]) if (A.limits[k] && !A.limits[k].includes(triple[k])) triple[k] = A.limits[k][0];
      A.votes[c.id] = triple;
      A.confirmed = A.confirmed || {}; A.confirmed[c.id] = true;
    } else return;
    this.pushAcc();
  }
  accRebut(c, a) {
    const A = this.acc;
    if (!A || A.stage !== "rebut" || A.rebutted?.[c.id]) return;
    A.rebutted = A.rebutted || {};
    A.rebutted[c.id] = true;
    if (a.pass) { this.pushAcc(); return; }
    const opt = this.rebutOptions(c).find((o) => o.i === a.i);
    if (!opt) return;
    const fact = opt.lie ? A.lies?.[opt.key] : this.notes.get(c.id).facts.get(opt.key);
    this.presentRebuttal(c, opt.target, fact, opt.text, opt.lie);
  }
  presentRebuttal(c, target, fact, text, lie) {
    this.acc.rebuttals.push({ by: c.id, target, text });
    this.say(c, text, 6);
    if (fact) for (const o of this.living()) if (o !== c) this.deliver(c, o, fact, lie);
    this.pushAcc();
  }
  updateAccusation(dt) {
    const A = this.acc;
    const seated = this.living();
    // AI acts on its schedule.
    for (const c of seated) {
      if (c.human || this.time < (c.accAt || 0)) continue;
      const note = this.notes.get(c.id);
      if (A.stage === "propose" && !A.proposals[c.id]) {
        const t = accusationFor(this, c, note);
        A.proposals[c.id] = { p: t.p, w: t.w, r: t.r }; A.votes[c.id] = { ...A.proposals[c.id] };
        this.say(c, `I accuse ${short(t.p)}, in ${roomName(t.r)}, with the ${weaponName(t.w)}.`, 4.5);
        c.accAt = this.time + rand(1.5, 3);
        this.pushAcc();
      } else if (A.stage === "rebut" && !A.rebutted?.[c.id]) {
        A.rebutted = A.rebutted || {};
        A.rebutted[c.id] = true;
        const opts = this.aiRebut(c);
        if (opts) this.presentRebuttal(c, opts.target, opts.fact, opts.text, opts.lie);
        else this.pushAcc();
      } else if (A.stage === "vote" && !A.voted?.[c.id]) {
        A.voted = A.voted || {};
        A.voted[c.id] = true;
        const t = accusationFor(this, c, note, A.limits);
        // On re-votes, wavering guests start to break the deadlock.
        for (const k of ["p", "w", "r"]) if (A.limits[k] && A.round > 0 && Math.random() < 0.25 + A.round * 0.2) t[k] = choice(A.limits[k]);
        A.votes[c.id] = { p: A.locked.p || t.p, w: A.locked.w || t.w, r: A.locked.r || t.r };
        this.pushAcc();
      }
    }
    const allIn = (obj) => seated.every((c) => obj?.[c.id]);
    const advance = this.time >= A.until
      || (A.stage === "propose" && allIn(A.proposals))
      || (A.stage === "rebut" && allIn(A.rebutted))
      || (A.stage === "vote" && seated.every((c) => A.voted?.[c.id] || (c.human && A.confirmed?.[c.id])));
    if (!advance) return;
    if (A.stage === "propose") {
      for (const c of seated) if (!A.proposals[c.id]) { const t = accusationFor(this, c, this.notes.get(c.id)); A.proposals[c.id] = { p: t.p, w: t.w, r: t.r }; A.votes[c.id] = { ...A.proposals[c.id] }; }
      A.stage = "rebut"; A.until = this.time + 25; A.rebutted = {};
      for (const c of seated) if (!c.human) c.accAt = this.time + rand(2, 10);
    } else if (A.stage === "rebut") {
      A.stage = "vote"; A.until = this.time + 22; A.voted = {}; A.confirmed = {};
      for (const c of seated) if (!c.human) c.accAt = this.time + rand(1.5, 6);
    } else if (A.stage === "vote") {
      for (const c of seated) if (!A.votes[c.id]) { const t = accusationFor(this, c, this.notes.get(c.id), A.limits); A.votes[c.id] = t; }
      this.tally();
      return;
    } else if (A.stage === "tally") {
      if (A.tie) { A.stage = "vote"; A.until = this.time + 20; A.voted = {}; A.confirmed = {}; for (const c of seated) if (!c.human) c.accAt = this.time + rand(1, 4); A.round++; }
      else this.reveal();
    } else if (A.stage === "reveal") {
      this.acc = null;
      if (this.winner) return;
      if (this.day >= this.lastDay) { this.finalVerdict(); return; }
      this.startDay(this.day + 1);
      return;
    }
    this.pushAcc();
  }
  confirmVote(id) { if (this.acc?.stage === "vote") { this.acc.confirmed[id] = true; } }
  aiRebut(c) {
    const note = this.notes.get(c.id);
    const kills = knownKills(this, note);
    const k = kills[kills.length - 1];
    for (const [by, p] of Object.entries(this.acc.proposals)) {
      if (by === c.id) continue;
      if (c.isKiller && this.killers.includes(p.p) && this.chars.get(p.p)?.alive) {
        const lie = this.makeLie(c, { kind: "where" });
        if (lie) return { target: by, fact: lie, lie: true, text: `${short(by)}, that's impossible. ${claimLine(lie, c.id)}` };
      }
      if (c.isKiller) continue;
      if (!k) continue;
      for (const f of note.facts.values()) {
        if (f.src !== "self") continue;
        const near = f.day === k.day && Math.max(f.t0 ?? f.t, k.t - 6) <= Math.min(f.t1 ?? f.t0 ?? f.t, k.t + 6);
        if (f.kind === "kill" && f.about !== p.p) return { target: by, fact: f, text: `No! ${claimLine(f, c.id)}` };
        if (f.kind === "body" && ((!f.bleedOut && f.room !== p.r) || f.weapon !== p.w)) return { target: by, fact: f, text: `${short(by)}, I found the body. ${claimLine(f, c.id)}` };
        if (f.kind === "saw" && f.about === p.p && near && f.room !== k.room && Math.random() < 0.8) return { target: by, fact: f, text: `${short(by)} is wrong. ${claimLine(f, c.id)}` };
      }
    }
    return null;
  }
  tally() {
    const A = this.acc;
    const votes = Object.values(A.votes);
    const res = {}, tally = {};
    let tie = false;
    const limits = {};
    for (const k of ["p", "w", "r"]) {
      if (A.locked[k]) { res[k] = A.locked[k]; continue; }
      const counts = {};
      for (const v of votes) counts[v[k]] = (counts[v[k]] || 0) + 1;
      tally[k] = counts;
      const max = Math.max(...Object.values(counts));
      const top = Object.keys(counts).filter((x) => counts[x] === max);
      if (top.length > 1) { tie = true; limits[k] = top; }
      else { res[k] = top[0]; A.locked[k] = top[0]; }
    }
    A.tie = tie;
    A.limits = limits;
    A.tally = tally;
    A.stage = "tally";
    A.until = this.time + 4.5;
    A.result = tie ? { tie: true, partial: res } : { triple: res };
    if (tie) this.broadcast({ type: "toast", text: "A tie! The table must vote again.", sfx: "gavel" });
    this.pushAcc();
  }
  reveal() {
    const A = this.acc;
    const t = A.result.triple;
    // Room, weapon AND the killer who did that murder must all be right.
    const hit = this.kills.find((k) => k.killer === t.p && k.weapon === t.w && k.room === t.r && this.chars.get(k.killer)?.alive);
    A.stage = "reveal";
    A.until = this.time + 7;
    A.result = { triple: t, correct: !!hit };
    this.broadcast({ type: "reveal", triple: t, correct: !!hit, sfx: "gavel" });
    if (hit) {
      const why = `${short(t.p)} did it — in ${roomName(t.r)} with the ${weaponName(t.w)}.`;
      if (!this.duo) { this.finish("saviors", why); }
      else {
        this.catchKiller(this.chars.get(t.p));
        if (!this.activeKillers().length) this.finish("saviors", `Both killers caught. ${why}`);
        else this.broadcast({ type: "toast", text: `${short(t.p)} was one of the killers — now a restless ghost. One killer remains…`, sfx: "scream" });
      }
    }
    this.pushAcc();
  }


  // ---------- public snapshot ----------
  isHumanAvatar(c){return !!c&&humanAvatar(this.avatarMode,c.id,[...this.humans]);}
  // Call from a completed, host-authorized haircut task. This deliberately is
  // not a public client command: the task must validate tools/reach/consent.
  recordHaircut(targetId,state){
    const target=this.chars.get(targetId);if(!target?.alive||!this.isHumanAvatar(target))return false;
    const next=mergeHairState(targetId,this.haircuts[targetId],state);
    if(!next)return false;this.haircuts[targetId]=next;return true;
  }
  snapshot(forceFull = false) {
    const full = forceFull || this.time - this.fullT > 3;
    if (full) this.fullT = this.time;
    const props = [];
    for (const p of this.props.list) {
      if (!full && p.sleep && !p.holder && !p.moved) continue;
      p.moved = false;
      props.push([p.id, q(p.x), q(p.y), q(p.z), q(p.yaw || 0), q(p.roll || 0), p.hidden ? 1 : 0, p.holder ? 1 : 0, p.atBody ? 1 : 0, (p.bloody ? 1 : 0) | (p.wet ? 2 : 0) | (p.lit ? 4 : 0) | (p.burn ? 8 : 0) | (p.burn?.lit ? 16 : 0), p.burn?.lit ? q(p.burn.progress || 0) : 0, p.kind, p.holder || null, p.stash || null, p.pocket ? 1 : 0, p.gone ? 1 : 0,p.sleep?1:0,q(p.vx||0),q(p.vy||0),q(p.vz||0)]);
    }
    if (this.stainV !== this.lastSV) { this.lastSV = this.stainV; this.stainT = this.time; }
    const sendStains = full || this.time - (this.stainT || -9) < 0.6;
    return {
      lightsOff:this.lightsOff,
      haircuts: this.haircuts,
      avatarMode:this.avatarMode,humanIds:[...this.humans],
      barber:this.barber?{actor:this.barber.actor,target:this.barber.target,mode:this.barber.mode,stage:this.barber.stage,progress:this.barber.progress||0}:null,
      ph: this.phase, day: this.day, ld: this.lastDay, t: Math.round(this.t * 10) / 10, ot: this.overtime, fs: this.flickerSealed, hide: this.postKillUntil === null ? 0 : Math.max(0, Math.ceil(this.postKillUntil - this.time)), search: this.searchUntil === null ? 0 : Math.max(0, Math.ceil(this.searchUntil - this.time)), ka: this.killAllowed(), full,
      chars: [...this.chars.values()].map((c) => [c.id, q(c.x), q(c.z), q(c.yaw), Math.round(c.mv * 10) / 10, c.alive ? 1 : 0, c.convo || c.chat ? 1 : 0, c.anim && c.animUntil > this.time ? c.anim : 0, c.room, c.seat || 0, c.hands[0] || 0, c.auto ? 1 : 0, q(c.pitch || 0), c.hands[1] || 0, c.dragging || c.dragKO ? 1 : 0, c.pouring ? 1 : 0, c.ko ? 1 : 0, c.pockets[0] || 0, c.pockets[1] || 0, c.chat?.with || this.convoPartner(c) || null]),
      props,
      doors: this.doors.map(q), doorT: this.doorTarget, push: PUSHABLES.map((f) => Math.round(f.push.t * 1000) / 1000),
      fires: [...this.fires], stove: this.stove ? 1 : 0, ashes: Object.entries(this.ashes || {}).filter(([, l]) => l.length).map(([id, l]) => [id, l.length]), cabs: [...this.cabs],
      pool: this.pool.state(), poolMoving: this.pool.moving, poolShots: this.pool.shots, taskScene: this.taskScene, painting: this.painting?.url || null, butler: this.butlerSnap(),
      bodies: this.bodies.map((b) => [b.victim, q(b.x), q(b.z), b.found ? 1 : 0, b.room, q(b.yaw || 0), b.dragging ? 1 : 0, b.hideSpot ? 1 : 0, b.hideSpot || null, b.weapon || null, b.day || this.day]),
      stains: sendStains ? this.stains.filter((x) => x.s !== 3).map((x) => [x.id, q(x.x), q(x.z), q(x.r), q(x.rot), x.k, x.s, q(x.e)]) : null,
      marks: sendStains ? this.marks.map((m) => [m.id, q(m.x), q(m.z), q(m.r), q(m.rot)]) : null,
    };
  }
  notebookFor(id) { return [...this.notes.get(id).facts.values()].map(publicFact); }
  cardsFor(id) { return this.chars.get(id).cards; }
}

const q = (v) => Math.round(v * 100) / 100;
export function publicFact(f) {
  const { lie, ...rest } = f;
  return { ...rest, text: factText(f) };
}

Object.assign(Match.prototype, ItemMethods, TunnelMethods, TaskMethods, BurnMethods, TeamMethods, ButlerMethods, BarberMethods);
