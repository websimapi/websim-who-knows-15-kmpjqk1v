// One running match on this machine: local (solo / split-screen co-op),
// online host (runs the rules engine) or online guest (mirrors the host).
// First-person control, look-to-interact, ghosts, the lights-out decision and VR.
import * as THREE from "three";
import { SUSPECT_BY_ID, DAY_SECONDS, EYE, clockLabel, roomAtWorld, roomName, weaponName, WEAPON_BY_ID, LAST_DAY, itemName, isBig } from "./data.js";
import { collide, losClear, DOOR_LIST, HATCH_POS, roomExitBlocked } from "./nav.js";
import {moveBody} from './body-collision.js';
import { waterAt } from "./tunnels.js";
import { FURNITURE, FURN_BY_ID, BODY_HIDES, SEATS, POOL, surfaceAt, PUSHABLES } from "./layout.js";
import {LIGHT_SWITCHES,FLOOR_LAMPS,illuminationAt,snapshotLighting} from './lighting.js';
import { Match } from "./match.js";
import { PlayerHud, Cine, TableBoard } from "./ui.js";
import { read, buzz, bindPointerLock, bindTouchControls, releasePointer } from "./input.js";
import { sfx, spatialSfx, startAmbience, startGameMusic, stopGameMusic, stopSpeak } from "./audio.js";
import { newStamina, stepStamina } from "./stamina.js";
import { interpolateSnapshot } from "./snapshotInterpolation.js";
import { TASKS, TOOL_NAME } from './tasks.js';
import { WorldTask } from './world-task.js';

const $ = (s) => document.querySelector(s);
const WALK = 2.6, RUN = 4.4, GHOST_SPEED = 3.4;
const MOUSE = 0.0022, STICK_YAW = 2.8, STICK_PITCH = 1.9;
const REACH = 2.3;
const FIRES = FURNITURE.filter((f) => f.fire);
const CABS = FURNITURE.filter((f) => f.cab);
const INSIGHT_KINDS = ["rag", "bleach", "towel", "lens"];
const STOVE = FURN_BY_ID.stove;
const BINS = FURNITURE.filter((f) => f.bin);
const FX_SOUND = { doorOpen: ["door_open", 0.6], doorClose: ["door_close", 0.6], fire: ["fire", 0.5], stove: ["stove", 0.6], cab: ["door_open", 0.3], pool: ["pool", 0.7], thud: ["thud", 0.7], ghost: ["ghost", 0.7], pant: ["pant", 0.45], scrape: ["scrape", 0.7] };
const pretty = (k) => k.replace(/_/g, " ");
const INROOM = (r) => r && r !== "hallway" && r !== "cellar" && r !== "tunnels";
let lockBound = false;

export class Game {
  // mode: "local" | "host" | "client"; locals: [{char, device}]; remote: [{char, conn, name}]
  constructor({ view, mode, locals, remote = [], net = null, names = {}, killers = 1, avatarMode='mixed', onExit, onAgain }) {
    this.view = view; this.mode = mode; this.net = net; this.names = names;
    this.onExit = onExit; this.onAgain = onAgain;
    this.cine = new Cine($("#cine"));
    this.table = new TableBoard($("#tableBoard"));
    this.view.names = names;
    this.view.resetWorld();
    $("#huds").innerHTML = "";
    $("#hud").classList.remove("hidden");
    document.body.classList.add("in-game");
    document.body.classList.toggle("split", locals.length > 1);
    // Split-screen players can see each other's screens, so they always share
    // a role: if either draws the killer, both are (a two-killer round).
    this.secret = false;
    this.players = locals.map((l, i) => ({
      ...l, i, x: 0, z: 0, yaw: 0, pitch: 0, mv: 0, synced: false, stamina: newStamina(),
      hud: new PlayerHud({ index: i, char: l.char, device: l.device, root: $("#huds"), names, secret: this.secret, send: (a) => this.act(l.char, a) }),
    }));
    this.view.setViews(this.players.map((p) => ({ follow: p.char })));
    this.remoteByChar = new Map(remote.map((r) => [r.char, r.conn]));
    this.charByConn = new Map(remote.map((r) => [r.conn, r.char]));
    this.itemSeen = new Set();
    this.snap = null;
    this.snaps = [];
    this.offlineProps = new Map();
    this.offlineStains = null;
    this.offlineMarks = null;
    this.snapshotSeq = 0;
    this.lastFullNetAt = 0;
    this.sendT = 0;
    this.paused = false;
    if (mode !== "client") {
      const humans = [...locals.map((l) => ({ char: l.char, name: names[l.char] })), ...remote.map((r) => ({ char: r.char, name: r.name }))];
      this.match = new Match({
        humans, killers, avatarMode, shared: locals.length > 1 ? locals.map((l) => l.char) : null,
        io: {
          toSeat: (id, msg) => this.toSeat(id, msg),
          broadcast: (msg) => { this.onBroadcast(msg); if (mode === "host") net.toAll({ k: "b", m: msg }); },
        },
      });
    }
    if (net) {
      this.offRelay = net.subscribe("relay", (m) => this.onRelay(m));
      this.offRecovering = net.subscribe("recovering", () => { this.connectionRecovering = true; releasePointer(); this.cine.show(`<div class="cine-card"><h1>Reconnecting…</h1><p>Trying to restore this round.</p></div>`, "over"); });
    }
    this.alive = true;
    $("#pauseBtn").onclick = () => this.pause(true);
    if (!lockBound) { lockBound = true; bindPointerLock(view.renderer.domElement, () => window.__clueGame?.mouseAllowed()); }
    bindTouchControls(view.renderer.domElement);
    this.taskPointerOwners = new Map();
    const taskPointer = (event, type) => {
      const bounds = view.renderer.domElement.getBoundingClientRect();
      const localY = event.clientY - bounds.top;
      const rects = view.rects();
      const found = rects.findIndex(r => event.clientX >= r.x && event.clientX < r.x+r.w && localY >= innerHeight-r.y-r.h && localY < innerHeight-r.y);
      const index = this.taskPointerOwners.get(event.pointerId) ?? found;
      const p = this.players[index < 0 ? 0 : index], work = p?.worldTask;
      if (type==='up') this.taskPointerOwners.delete(event.pointerId);
      if (!work?.active || !work.focus) return;
      const r = rects[p.i];
      const rect = { left: bounds.left+r.x, top: bounds.top+innerHeight-r.y-r.h, width:r.w, height:r.h };
      view.taskObjects.local = work; view.taskObjects.update(this.snap?.taskScene,this.snap?.painting); view.taskObjects.root.updateMatrixWorld(true);
      if (work.pointer(event,type,view.views[p.i].cam,rect)) { event.preventDefault(); event.stopImmediatePropagation(); if (type==='down') { this.taskPointerOwners.set(event.pointerId,p.i); view.renderer.domElement.setPointerCapture?.(event.pointerId); } }
    };
    this.taskPointerHandlers = [['pointerdown','down'],['pointermove','move'],['pointerup','up'],['pointercancel','up']].map(([name,type]) => {
      const fn = e => taskPointer(e,type); view.renderer.domElement.addEventListener(name,fn,true); return [name,fn];
    });
    window.__clueGame = this;
    this.xr = null;
    this.startedAt = performance.now();
    this.firstSnapshot = false;
    this.lastSnapshotAt = null;
    this.snapshotTimeoutLogged = false;
    this.roleTimeoutLogged = false;
    this.readyRetryAt = this.startedAt + 2000;
    if (mode === "client") {
      this.syncBadge = document.createElement("div");
      this.syncBadge.className = "online-sync";
      this.syncBadge.textContent = "Syncing with the host…";
      $("#hud").append(this.syncBadge);
    }
    net?.ready();
    net?.log("game-ready", { mode, character: locals[0]?.char, remotePlayers: remote.length, killers });
    startAmbience();
    startGameMusic();
  }

  destroy() {
    this.alive = false;
    for(const p of this.players)p.hud.barberPanel?.close();
    for (const p of this.players) p.worldTask?.close();
    for (const [name,fn] of this.taskPointerHandlers || []) this.view.renderer.domElement.removeEventListener(name,fn,true);
    if (window.__clueGame === this) window.__clueGame = null;
    releasePointer();
    stopSpeak();
    stopGameMusic();
    $("#hud").classList.add("hidden");
    $("#huds").innerHTML = "";
    this.syncBadge?.remove();
    this.cine.hide();
    this.table.render(null);
    document.body.classList.remove("in-game", "split", "touch-ui-open");
    $("#pause").classList.add("hidden");
    this.view.setFlicker(false);
    this.offRelay?.();
    this.offRecovering?.();
  }
  mouseAllowed() {
    const p = this.players.find((q) => q.device === "kb1" || q.device === "all");
    return this.alive && !this.paused && p && !this.panelOpen(p);
  }
  panelOpen(p) {
    const a = p.hud.accState;
    return !!(p.hud.barberPanel?.active || p.worldTask?.active && p.worldTask.focus || p.hud.poolPanel.active || p.hud.taskPanel.active || p.hud.convo || p.hud.bodyMenuVictim || p.hud.bookOpen || (a && !["tally", "reveal", "done"].includes(a.stage) && p.hud.alive) || this.overFocus?.length && !$("#cine").classList.contains("hidden"));
  }

  // ---------- messaging ----------
  reconnectPeers(lobby) {
    if (this.mode !== "host") return;
    for (const member of lobby.members) {
      if (member.id === this.net.id || !member.char) continue;
      const previous = this.remoteByChar.get(member.char);
      if (previous && previous !== member.id) this.charByConn.delete(previous);
      this.remoteByChar.set(member.char, member.id);
      this.charByConn.set(member.id, member.char);
    }
    this.lastFullNetAt = 0;
  }
  connectionRestored() {
    this.connectionRecovering = false;
    this.cine.hide();
    this.players[0]?.hud.toast("Reconnected to the mansion.");
  }
  offerOffline(onContinue) {
    this.connectionRecovering = false;
    this.offlineChoice = true;
    releasePointer();
    this.cine.show(`<div class="cine-card"><h1>Connection lost</h1><p>Continue this round offline? The other guests will be controlled by AI.</p><div class="over-btns"><button id="againBtn">Continue offline</button><button id="menuBtn2">Title</button></div></div>`, "over");
    $("#againBtn").onclick = onContinue;
    $("#menuBtn2").onclick = () => this.onExit?.();
    this.overFocus = [$("#againBtn"), $("#menuBtn2")];
    this.overI = 0;
  }
  offlineSnapshot() {
    const snap = this.snaps.at(-1)?.s || this.snap;
    if (!snap) return null;
    return { ...snap, props: [...this.offlineProps.values()], stains: this.offlineStains || snap.stains || [], marks: this.offlineMarks || snap.marks || [], full: true };
  }
  continueOffline() {
    const local = this.players[0];
    if (!local) return false;
    if (this.mode === "client") {
      const snapshot = this.offlineSnapshot();
      const io = { toSeat: (id, msg) => this.toSeat(id, msg), broadcast: (msg) => this.onBroadcast(msg) };
      const match = snapshot ? new Match({ humans: [], io }) : new Match({ humans: [{ char: local.char }], io });
      if (snapshot && !match.restoreSnapshot(snapshot, local.char, local.hud)) return false;
      this.match = match;
      local.synced = false;
      local.tpAt = 0;
    } else {
      this.match.humans = new Set([local.char]);
      for (const c of this.match.chars.values()) { c.human = c.id === local.char; if (!c.human) { c.plan = null; c.path = null; c.wait = 0.5; } }
      this.match.io.broadcast = (msg) => this.onBroadcast(msg);
      for (const id of [...this.match.convos.keys()]) this.match.endConvo(id, true);
    }
    this.mode = "local";
    this.net = null;
    this.offRelay?.(); this.offRecovering?.();
    this.offRelay = this.offRecovering = null;
    this.remoteByChar.clear(); this.charByConn.clear();
    this.names = {}; this.view.names = {}; this.match.names = {};
    this.syncBadge?.remove(); this.syncBadge = null;
    this.offlineChoice = false;
    this.overFocus = null;
    this.cine.hide();
    this.pause(false);
    this.snap = this.match.snapshot(true);
    local.hud.closeConvo();
    local.hud.toast("The round continues offline. Other guests are now AI.");
    return true;
  }
  local(char) { return this.players.find((p) => p.char === char); }
  networkSnapshot(forceFull = false) { return { ...(forceFull ? this.match.snapshot(true) : this.snap || this.match.snapshot(true)), seq: ++this.snapshotSeq }; }
  toSeat(char, msg) {
    const p = this.local(char);
    if (p) { this.seatMsg(p, msg); return; }
    const conn = this.remoteByChar.get(char);
    if (conn) this.net.to(conn, { k: "seat", m: msg });
  }
  seatMsg(p, msg) {
    const heldBefore = msg.type === "inv" ? new Set([...(p.hud.inv?.hands || []), ...(p.hud.inv?.pockets || [])].map((item) => item?.id).filter(Boolean)) : null;
    p.hud.onMsg(msg);
    if (heldBefore) for (const item of [...(msg.hands || []), ...(msg.pockets || [])]) {
      if (item && !heldBefore.has(item.id)) this.noticeItem(p, item.id, item.kind);
    }
    if (msg.type === "dead") p.dead = true;
    if (msg.type === "bump") { p.x=msg.x;p.z=msg.z; }
    if (msg.type === "tp") { p.x = msg.x; p.z = msg.z; p.mv = 0; p.tpAt = performance.now(); }
    if (msg.type === "role" && this.secret) setTimeout(() => this.buzzRole(p), 700);
    if (msg.sfx) sfx(msg.sfx);
  }
  buzzRole(p) { buzz(p.device, p.hud.role === "killer" ? 2 : 1); }
  act(char, a) {
    if (this.mode === "client") this.net.toHost({ k: "act", a });
    else this.match.action(char, a);
  }
  onRelay({ from, data }) {
    if (!data) return;
    if (this.mode === "host") {
      const char = this.charByConn.get(from);
      if (!char) return;
      if (data.k === "ready") {
        this.match.sendRole(char);
        this.net.to(from, { k: "snap", s: this.networkSnapshot(true) });
      }
      if (data.k === "act" && data.a && typeof data.a === "object" && typeof data.a.type === "string") this.match.action(char, data.a);
      if (data.k === "left") { const c = this.match.chars.get(char); if (c) { c.human = false; this.match.humans.delete(char); } this.remoteByChar.delete(char); this.charByConn.delete(from); }
      return;
    }
    if (data.k === "snap" && Array.isArray(data.s?.chars) && Array.isArray(data.s?.props)) {
      if (Number.isFinite(data.s.seq) && data.s.seq <= this.snapshotSeq) { if (this.firstSnapshot) this.net.ackSnapshot(data.s.seq); return; }
      if (Number.isFinite(data.s.seq)) this.snapshotSeq = data.s.seq;
      this.lastSnapshotAt = performance.now();
      if (data.s.full) this.offlineProps.clear();
      for (const row of data.s.props) this.offlineProps.set(row[0], row);
      if (data.s.stains) this.offlineStains = data.s.stains;
      if (data.s.marks) this.offlineMarks = data.s.marks;
      this.snapshotTimeoutLogged = false;
      if (!this.firstSnapshot) { this.firstSnapshot = true; if (this.players[0]?.hud.role) this.syncBadge?.remove(); this.net.log("first-snapshot", { mode: "client", phase: data.s?.ph, seq: data.s?.seq }); this.net.ackSnapshot(data.s?.seq); }
      this.snaps.push({ s: data.s, t: this.lastSnapshotAt }); if (this.snaps.length > 6) this.snaps.shift();
    }
    else if (data.k === "snap" && !this.invalidSnapshotLogged) {
      this.invalidSnapshotLogged = true;
      this.net.log("match-invalid", { reason: "missing-chars-or-props", seq: data.s?.seq });
    }
    else if (data.k === "seat") { const p = this.players[0]; if (p) { if (data.m?.type !== "role" || !p.hud.role) this.seatMsg(p, data.m); if (data.m?.type === "role") this.net.ackRole(); if (this.firstSnapshot && p.hud.role) this.syncBadge?.remove(); } }
    else if (data.k === "b") this.onBroadcast(data.m);
  }

  onBroadcast(m) {
    if (m.sfx) sfx(m.sfx);
    switch (m.type) {
      case "say": this.view.bubble(m.id, m.text, m.dur); break;
      case "fx": this.playFx(m); break;
      case "flicker":
        this.view.setFlicker(m.on);
        if (m.on) sfx("flicker", 0.4);
        for (const p of this.players) p.hud.setFlicker(m.on, !!m.afterKill);
        break;
      case "day":
        this.view.clearBodies(m.remainingBodies || m.concealed || []);
        for (const p of this.players) { p.hud.closeBodyMenu(); p.hud.setDay(m.day); p.synced = false; p.hud.onAcc(null); }
        this.table.render(null);
        this.cine.day(m);
        break;
      case "toast": for (const p of this.players) p.hud.toast(m.text); break;
      case "kill":
        this.view.onKill(m);
        for (const p of this.players) if (m.viewers?.includes(p.char)) { this.view.startCut(p.i, m); if (this.secret) buzz(p.device, 1); }
        break;
      case "cutscene": for (const p of this.players) p.hud.closeBodyMenu(); this.cine.night(m, this.names); break;
      case "acc": this.acc = m; this.table.render(m, this.names); for (const p of this.players) p.hud.onAcc(m); break;
      case "reveal": this.cine.reveal(m); break;
      case "over":
        setTimeout(() => {
          if (!this.alive) return;
          releasePointer();
          const mine = this.players.map((p) => `<p class="mine">${SUSPECT_BY_ID[p.char].short}: ${p.hud.role === "killer" ? (p.hud.partner ? "you were a killer" : "you were the killer") : "you were a savior"} — ${(m.winner === "killer") === (p.hud.role === "killer") ? "<b>victory</b>" : "defeat"}</p>`).join("");
          this.cine.over(m, mine);
          this.wireOver();
        }, m.winner === "saviors" ? 5200 : 2500);
        break;
    }
  }
  // Ray-test each listener's path to the sound; walls and doors muffle it.
  playFx(m) {
    const s = FX_SOUND[m.fx];
    if (!s) return;
    if (m.x === undefined || !this.players.length) { sfx(s[0], s[1] * (m.v ?? 1)); return; }
    let best = null;
    for (const p of this.players) {
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      const clear = losClear(p.x, p.z, m.x, m.z, this.snap?.doors);
      const volume = s[1] * (m.v ?? 1) * Math.max(0, 1 - d / 16) * (clear ? 1 : 0.48);
      const pan = d > 0.01 ? Math.sin(Math.atan2(dx, dz) - p.yaw) * Math.min(1, d / 3) : 0;
      if (!best || volume > best.volume) best = { volume, pan, occluded: !clear };
    }
    if (best?.volume > 0.02) spatialSfx(s[0], best.volume, best.pan, best.occluded);
  }
  wireOver() {
    const again = $("#againBtn"), menu = $("#menuBtn2");
    if (again) again.onclick = () => this.onAgain?.();
    if (menu) menu.onclick = () => this.onExit?.();
    this.overFocus = [again, menu].filter(Boolean);
    this.overI = 0;
  }

  pause(on) {
    this.paused = on;
    if (on) releasePointer();
    $("#pause").classList.toggle("hidden", !on);
    $("#help").classList.add("hidden");
    this.pauseI = 0;
  }

  // ---------- frame ----------
  update(dt) {
    if (!this.alive) return;
    if (this.connectionRecovering) return;
    if (this.offlineChoice) {
      const inp = read("all");
      if (inp.left || inp.up) this.overI = 0;
      if (inp.right || inp.down) this.overI = 1;
      this.overFocus?.forEach((button, i) => button.classList.toggle("focus", i === this.overI));
      if (inp.confirm) this.overFocus?.[this.overI]?.click();
      return;
    }
    if (this.mode === "client" && performance.now() >= this.readyRetryAt && (!this.firstSnapshot || !this.players[0]?.hud.role || performance.now() - this.lastSnapshotAt > 2500)) {
      this.net.ready();
      this.readyRetryAt = performance.now() + 2000;
    }
    if (this.mode === "client" && !this.firstSnapshot && !this.snapshotTimeoutLogged && performance.now() - this.startedAt > 12000) {
      this.snapshotTimeoutLogged = true;
      this.net.log("snapshot-timeout", { mode: this.mode, elapsedMs: Math.round(performance.now() - this.startedAt) });
      if (this.syncBadge) this.syncBadge.textContent = "Still waiting for the host…";
    }
    if (this.mode === "client" && this.firstSnapshot && !this.players[0]?.hud.role && !this.roleTimeoutLogged && performance.now() - this.startedAt > 12000) {
      this.roleTimeoutLogged = true;
      this.net.log("role-timeout", { elapsedMs: Math.round(performance.now() - this.startedAt) });
      if (this.syncBadge) this.syncBadge.textContent = "Still waiting for character details…";
    }
    if (this.mode === "client" && this.firstSnapshot && !this.snapshotTimeoutLogged && performance.now() - this.lastSnapshotAt > 8000) {
      this.snapshotTimeoutLogged = true;
      this.net.log("snapshot-timeout", { mode: this.mode, elapsedMs: Math.round(performance.now() - this.lastSnapshotAt) });
      this.players[0]?.hud.toast("Waiting for the host to reconnect…");
    }
    if (this.mode === "client") this.snap = this.interpolated();
    else {
      if (!(this.paused && this.mode === "local")) this.match.update(dt);
      this.snap = this.match.snapshot();
      if (this.mode === "host") {
        this.sendT -= dt;
        if (this.sendT <= 0) {
          this.sendT = 0.1;
          const now = performance.now();
          const full = !this.lastFullNetAt || now - this.lastFullNetAt >= 3000;
          const sent = this.net.toAll({ k: "snap", s: this.networkSnapshot(full) });
          if (sent && full) this.lastFullNetAt = now;
          if (sent && !this.firstSnapshot) { this.firstSnapshot = true; this.net.log("first-snapshot", { mode: "host", phase: this.snap.ph, seq: this.snapshotSeq }); }
        }
      }
    }
    const snap = this.snap;
    if (!snap) return;
    for (const p of this.players) if (p.hud.bodyMenuVictim && (snap.ph !== "day" || !snap.bodies?.some((b) => b[0] === p.hud.bodyMenuVictim && !b[3] && !b[6] && !b[7]))) p.hud.closeBodyMenu();
    const anyInp = this.players.map((p) => read(p.device));
    if (this.overFocus?.length && !$("#cine").classList.contains("hidden")) {
      for (const inp of anyInp) {
        if (inp.left || inp.up) this.overI = 0;
        if (inp.right || inp.down) this.overI = this.overFocus.length - 1;
        this.overFocus.forEach((b, i) => b.classList.toggle("focus", i === this.overI));
        if (inp.confirm) { this.overFocus[this.overI]?.click(); return; }
      }
    }
    if (this.paused) {
      const btns = [$("#resumeBtn"), $("#helpBtn"), $("#quitBtn")];
      for (const inp of anyInp) {
        if (inp.up) this.pauseI = (this.pauseI + 2) % 3;
        if (inp.down) this.pauseI = (this.pauseI + 1) % 3;
        if (inp.back || inp.pause) { this.pause(false); return; }
        if (inp.confirm) { btns[this.pauseI].click(); break; }
      }
      btns.forEach((b, i) => b.classList.toggle("focus", i === this.pauseI));
    } else if (anyInp.some((i) => i.pause)) { this.pause(true); return; }
    if (this.players.some((p) => this.panelOpen(p))) releasePointer();
    document.body.classList.toggle("touch-ui-open", this.paused || this.players.some((p) => this.panelOpen(p)));

    const xr = this.view.renderer.xr.isPresenting;
    const rows = new Map(snap.chars.map((r) => [r[0], r]));
    this.players.forEach((p, idx) => {
      const row = rows.get(p.char);
      if (!row) return;
      p.hud.poolPanel.update(snap, row);
      p.hud.taskPanel.update(snap, row);
      p.hud.barberPanel?.update(snap,row);
      p.worldTask?.update(snap,row,dt);
      const v = this.view.views[idx];
      const inp = this.paused ? read(null) : anyInp[idx];
      const alive = !!row[5], seated = !!row[9], auto = !!row[11];
      if (!snap.ot) p.flickerRoom = null;
      p.hud.setPeek(inp.peek);
      p.hud.tick();
      if (inp.buzz && this.secret) this.buzzRole(p);
      if (inp.view && !xr) { v.fp = !v.fp; v.tpDist = 0.6; }
      const consumed = !this.paused && (p.worldTask?.active && p.worldTask.input(inp) || p.hud.handleInput(inp));
      const free = snap.ph === "day" && !this.paused && !consumed && !p.hud.convo;
      // Look.
      if (!this.paused && !p.hud.convo && !consumed && !xr) {
        v.yaw -= inp.mouseX * MOUSE + inp.lx * STICK_YAW * dt;
        v.pitch = Math.max(-1.35, Math.min(1.35, v.pitch - inp.mouseY * MOUSE - inp.ly * STICK_PITCH * dt));
      }
      if (xr) {
        this.xrFrame(p, v, dt);
        if (this.xr.act) {
          // Trigger: use the small thing in hand, otherwise interact.
          const inv = p.hud.inv, held = inv && (inv.hands[1] || inv.hands[0]);
          if (held && !held.big) inp.use = true; else inp.act = true;
          this.xr.act = false;
        }
      }
      // Position: local authority while walking, server otherwise.
      const canMove = free && !seated && !auto && !row[16] && !this.view.cutActive(idx);
      // Just climbed a ladder: trust the teleport until the snapshot catches up.
      const tpFresh = p.tpAt && performance.now() - p.tpAt < 600 && Math.hypot(row[1] - p.x, row[2] - p.z) > 4;
      if (tpFresh) { row[1] = p.x; row[2] = p.z; }
      if (!p.synced || !canMove) {
        p.x = row[1]; p.z = row[2]; p.mv = 0;
        if (!p.synced) { v.yaw = row[3]; v.pitch = 0; v.snap = true; }
        if (snap.ph === "day") p.synced = true;
      }
      if (canMove) {
        this.move(p, v, inp, dt, alive, snap, row, xr);
        row[1] = p.x; row[2] = p.z; row[3] = v.yaw; row[4] = p.mv; row[12] = v.pitch; row[8] = roomAtWorld(p.x, p.z) || row[8];
        this.sendPos(p, v, dt);
      } else stepStamina(p.stamina, dt, false, false);
      p.hud.setStamina(alive ? p.stamina : null);
      if (row[6]) { v.yaw = row[3]; v.pitch = row[12] || 0; }
      p.yaw = v.yaw; p.pitch = v.pitch;
      if (!free || row[16]) { p.hud.prompt(p.worldTask?.active ? p.worldTask.hint() : null); this.view.highlight(idx, null); return; }
      if (p.worldTask?.active && !p.worldTask.focus) { p.hud.prompt(p.worldTask.hint()); this.view.highlight(idx,null); return; }
      // The lights-out decision.
      if (snap.ot && alive && (inp.act || inp.back)) {
        if (p.hud.role === "killer" && p.hud.decideState) { this.act(p.char, { type: "decide", accept: inp.act }); return; }
        if (this.secret) { if (inp.act) this.act(p.char, { type: "eye" }); return; }
      }
      p.hud.prompt(this.interactions(p, v, inp, row, rows, snap, xr));
    });
    this.view.apply(snap, dt);
    this.spotUsefulItems(snap);
    // Camera modes.
    this.players.forEach((p, i) => {
      const v = this.view.views[i];
      v.role = p.hud.role;
      v.taskWork = p.worldTask?.active ? p.worldTask : null;
      if (snap.ph === "accuse") v.mode = "table";
      else if (snap.ph === "night" || snap.ph === "body") { v.mode = "overview"; v.focus = snap.bodies?.length ? { x: snap.bodies[snap.bodies.length - 1][1], z: snap.bodies[snap.bodies.length - 1][2] } : null; }
      else if (p.hud.convo) { v.mode = "convo"; v.pair = [p.char, p.hud.convo.with]; v.convoSelf = performance.now() < (p.hud.replyShotUntil || 0); }
      else if (p.worldTask?.active && p.worldTask.focus) { v.mode = 'task'; v.taskFocus = p.worldTask.task; v.taskCollect = false; v.fp = true; }
      else { v.mode = "follow"; v.pair = null; v.taskFocus = null; }
    });
    this.clock(snap);
    this.layoutHuds();
  }

  noticeItem(p, id, kind, point = null) {
    if (!p.hud.role || !INSIGHT_KINDS.includes(kind) || (p.hud.role !== "killer" && kind !== "lens")) return;
    const day = this.snap?.day || 1;
    const key = `${p.char}:${day}:${kind}`;
    if (this.itemSeen.has(key)) return;
    this.itemSeen.add(key);
    const target = this.view.props.get(id)?.userData.target;
    const room = point && target ? roomAtWorld(target.x, target.z) : roomAtWorld(p.x, p.z);
    p.hud.noticeItem({ kind, day, room, point });
  }

  spotUsefulItems(snap) {
    if (snap.ph !== "day") return;
    for (const p of this.players) {
      if (!p.hud.alive || !p.hud.role || p.hud.convo || this.paused) continue;
      let nearest = null;
      for (const [id, mesh] of this.view.props) {
        const kind = INSIGHT_KINDS.find((k) => id.startsWith(`i_${k}`));
        if (!kind || (p.hud.role !== "killer" && kind !== "lens") || this.itemSeen.has(`${p.char}:${snap.day}:${kind}`)) continue;
        const target = mesh.userData.target;
        if (!target || target.hidden || this.view.carried.has(id)) continue;
        const distance = Math.hypot(target.x - p.x, target.z - p.z);
        if (distance > 5 || !losClear(p.x, p.z, target.x, target.z, snap.doors) || !this.view.visible(p.i, target.x, target.z)) continue;
        const point = this.view.screenPos(p.i, target.x, target.y + 0.13, target.z);
        if (point.visible && (!nearest || distance < nearest.distance)) nearest = { id, kind, point, distance };
      }
      if (!nearest) { p.itemGaze = null; continue; }
      if (p.itemGaze?.id !== nearest.id) { p.itemGaze = { id: nearest.id, at: performance.now() }; continue; }
      if (performance.now() - p.itemGaze.at < 450) continue;
      this.noticeItem(p, nearest.id, nearest.kind, nearest.point);
      p.itemGaze = null;
    }
  }

  move(p, v, inp, dt, alive, snap, row, xr) {
    let mx = inp.mx, mz = inp.mz;
    if (xr && this.xr?.move) { mx += this.xr.move.x; mz += this.xr.move.z; }
    const len = Math.hypot(mx, mz);
    if (len < 0.05) { p.mv = 0; stepStamina(p.stamina, dt, false, false); return; }
    const yaw = v.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    if (alive && stepStamina(p.stamina, dt, inp.run && !row[14], true)) sfx("pant", 0.25);
    const speed = (!alive ? GHOST_SPEED : p.stamina.running ? RUN : WALK) * (row[14] ? 0.5 : 1);
    const k = Math.min(1, len);
    const dx = (fx * -mz + rx * mx) / len * k, dz = (fz * -mz + rz * mx) / len * k;
    const nx = p.x + dx * speed * dt, nz = p.z + dz * speed * dt;
    const predicted={id:p.char,x:p.x,z:p.z,alive:true};
    const bodies=alive?snap.chars.filter(r=>r[0]!==p.char).map(r=>({id:r[0],x:r[1],z:r[2],alive:!!r[5],convo:!!r[6],seat:r[9],ko:!!r[16]})):[];
    if(alive&&snap.butler)bodies.push({id:'butler',x:snap.butler[0],z:snap.butler[1],alive:true,bodyFixed:!!snap.butler[5]});
    const c = alive ? moveBody(predicted,nx,nz,[predicted,...bodies],snap.doors) : collide(nx, nz, 0.3, null, { ghost: true });
    // Lights out: the living stay in the room they hurried into.
    if (snap.ot && p.hud.role !== "killer") {
      const current = roomAtWorld(p.x, p.z);
      if (!p.flickerRoom && INROOM(current)) p.flickerRoom = current;
      if (p.flickerRoom && roomExitBlocked(p.flickerRoom, p.x, p.z, c.x, c.z)) {
        p.mv = 0;
        if (!p.leaveWarnAt || performance.now() - p.leaveWarnAt > 2500) {
          p.leaveWarnAt = performance.now();
          p.hud.toast("You're too scared to leave the room.");
        }
        return;
      }
    }
    const moved = Math.hypot(c.x - p.x, c.z - p.z);
    p.mv = moved / Math.max(dt, 1e-3);
    p.x = c.x; p.z = c.z;
  }
  sendPos(p, v, dt) {
    const a = { type: "pos", x: p.x, z: p.z, yaw: v.yaw, pitch: v.pitch, mv: p.mv };
    if (this.mode !== "client") { this.match.action(p.char, a); return; }
    p.sendT = (p.sendT || 0) - dt;
    if (p.sendT > 0) return;
    p.sendT = 0.1;
    const r = (n, f = 100) => Math.round(n * f) / f;
    this.net.toHost({ k: "act", a: { type: "pos", x: r(p.x), z: r(p.z), yaw: r(v.yaw), pitch: r(v.pitch), mv: r(p.mv, 10) } });
  }

  key(dev, which) {
    if (document.body.classList.contains("touch-capable") && (dev === "all" || dev === "kb1")) {
      const touchLabel = { act: "Interact", alt: "Act", throw: "Throw", pocket: "Pocket", use: "Use", drop: "Drop" }[which];
      return `<kbd class="touch">${touchLabel}</kbd>`;
    }
    const padNow = dev?.startsWith("pad:") || (dev === "all" && navigator.getGamepads?.()?.some((g) => g?.connected));
    const kb = dev === "kb2" ? { act: "Enter", alt: "R-Shift", throw: "PgDn", pocket: "Del", use: "PgUp", drop: "Bksp" } : { act: "E", alt: "F", throw: "R", pocket: "G", use: "T", drop: "Q" };
    const pad = { act: "Ⓐ", alt: "Ⓧ", throw: "LB", pocket: "R3", use: "RB", drop: "Ⓑ" }[which];
    if (dev?.startsWith("pad:")) return `<kbd class="pad">${pad}</kbd>`;
    return `<kbd>${kb[which]}</kbd>${padNow ? `<kbd class="pad">${pad}</kbd>` : ""}`;
  }

  // Eye + look direction for aiming.
  aim(p, v, row) {
    const s = row[9] ? SEATS.find((x) => x.id === row[9]) : null;
    const ey = s ? s.h + 0.72 : row[5] ? EYE : EYE + 0.2;
    const eye = { x: s ? s.x : p.x, y: ey, z: s ? s.z : p.z };
    const cp = Math.cos(v.pitch);
    return { eye, dir: { x: Math.sin(v.yaw) * cp, y: Math.sin(v.pitch), z: Math.cos(v.yaw) * cp } };
  }

  interactions(p, v, inp, row, rows, snap, xr) {
    const { eye, dir } = this.aim(p, v, row);
    const alive = !!row[5];
    const me = { x: eye.x, z: eye.z, room: roomAtWorld(eye.x, eye.z) };
    const killer = p.hud.role === "killer";
    const lines = [];
    const k = (w) => this.key(p.device, w);
    const inv = p.hud.inv || { hands: [null, null], pockets: [null, null] };
    const [h0, h1] = inv.hands;
    const active = h1 || h0;                       // the hand the server acts with
    const big = !!(active && active.big);
    const dragging = !!row[14], pouring = !!row[15];
    // Hands and pockets.
    if (alive && inp.pocket) { this.act(p.char, { type: "stow" }); return null; }
    if (alive && inp.use && active && !active.big && active.kind!=='kitchen_knife') {
      const bandaging = p.hud.bleeding && inv.hands.some((d) => d?.kind === "bandage");
      this.act(p.char, { type: "use" });
      return null;
    }
    if (alive && inp.back && !snap.ot) {
      if (dragging) { this.act(p.char, { type: "drag" }); return null; }
      const id = active?.id || inv.pockets.find(Boolean)?.id;
      if (id) { this.act(p.char, { type: "dropItem", id }); return null; }
    }
    if (dragging) {
      this.view.highlight(p.i, null);
      const passage = this.target(p, eye, dir, alive, rows, snap, true);
      if (passage && !passage.blocked) {
        if (inp.act) { this.act(p.char, passage.action); return null; }
        const label = passage.kind === "hatch" ? (passage.label.includes("down") ? "Take the body through the trapdoor" : "Haul the body up the ladder") : passage.label;
        return `${k("act")} ${label}`;
      }
      if (inp.act) { this.act(p.char, { type: "drag" }); return null; }
      return `${k("act")} Let go${p.hud.dragLeft !== undefined ? ` <span class="dim">· ${Math.ceil(p.hud.dragLeft)}s of strength left</span>` : ""}`;
    }
    if (active && (inp.throw || (xr && this.xr?.throwV))) {
      const tv = xr && this.xr?.throwV ? this.xr.throwV : { x: dir.x * 7, y: dir.y * 7 + 2, z: dir.z * 7 };
      this.act(p.char, { type: "throw", v: tv });
      if (this.xr) this.xr.throwV = null;
      return null;
    }
    const placeActive = () => {
      const reach = Math.min(1.2, Math.max(0.6, dir.y < -0.05 ? (eye.y - 0.8) / -dir.y : 1));
      let x = eye.x + Math.sin(v.yaw) * reach, z = eye.z + Math.cos(v.yaw) * reach;
      if (!losClear(eye.x, eye.z, x, z, snap.doors)) { x = eye.x + Math.sin(v.yaw) * 0.45; z = eye.z + Math.cos(v.yaw) * 0.45; }
      this.act(p.char, { type: "drop", at: { x, y: surfaceAt(x, z), z }, id: active.id });
      if (this.xr) this.xr.release = false;
    };
    if (active && xr && this.xr?.release) { placeActive(); return null; }
    const nearFire = () => FIRES.some((f) => snap.fires?.includes(f.fire) && Math.hypot(f.x - me.x, f.z - me.z) < 2.6) || (snap.stove && STOVE && Math.hypot(STOVE.x - me.x, STOVE.z - me.z) < 2.4);
    const nearWater = () => !!(waterAt(me.x + dir.x * 0.5, me.z + dir.z * 0.5, 0) || waterAt(me.x, me.z, 0));
    const useHint = (d) => !d || d.big ? null : d.kind === "bandage" ? (p.hud.bleeding ? "Bandage your wound" : null) : d.kind === "torch" ? (d.lit ? (nearWater() ? "Douse the torch" : null) : nearFire() ? "Light the torch" : null) : d.kind === "rag" ? (!d.used ? "Wipe the floor" : null) : d.kind === "bleach" ? (pouring ? "Stop pouring" : (d.left ?? 1) > 0 ? "Pour bleach" : null) : d.kind === "towel" ? "Dry the floor" : d.kind === "coin" ? "Flip the coin" : null;
    if (active) {
      const u = p.hud.bleeding && inv.hands.some((d) => d?.kind === "bandage") ? "Bandage your wound" : useHint(active);
      if (u) lines.push(`${k("use")} ${u}`);
    }
    // What am I looking at?
    const best = this.target(p, eye, dir, alive, rows, snap);
    this.view.highlight(p.i, best?.kind === "prop" ? best.id : null);
    if (row[9]) lines.push(`${k("act")} Stand up`);
    if (best) {
      const t = best;
      if (t.kind === "person") {
        const r = t.row;
        const name = SUSPECT_BY_ID[r[0]].short;
        if (!r[6]) lines.push(`${k("act")} Talk to ${name}`); else lines.push(`<span class="dim">${name} is in conversation</span>`);
        const hairTarget=this.view.avatars.get(r[0])?.humanForm&&this.view.avatars.get(p.char)?.humanForm&&inv.hands.some(h=>h?.kind==='kitchen_knife')&&(p.hud.task?.id==='haircut'||killer)&&!!r[5]&&!r[16];
        if(hairTarget){lines.push(`${k('use')} Sneak cut hair · stealth vs attention`);if(inp.use){this.act(p.char,{type:'hairSneak',target:r[0]});return null;}}
        const canKill = killer && snap.ka && (!p.hud.lockedTarget || p.hud.lockedTarget === r[0]) && INROOM(me.room) && r[8] === me.room && t.d < 2.8;
        const down = !!r[16];
        const below = me.room === "tunnels" || r[8] === "tunnels";
        const canKnock = killer && below && !down && t.d < 2.4 && !(p.hud.partner && r[0] === p.hud.partner);
        if (down) {
          lines.pop();
          lines.push(`${k("act")} Shake ${name} awake`);
          if (killer && !canKill) lines.push(`${k("alt")} Drag ${name}`);
        }
        if (this.secret) lines.push(`${k("alt")} Act`);
        else if (canKill) lines.push(`${k("alt")} ${WEAPON_BY_ID[p.hud.held] ? `Use the ${weaponName(p.hud.held)}` : "Strike"} — ${name}`);
        else if (canKnock) lines.push(`${k("alt")} Knock ${name} out`);
        if (inp.alt) { this.act(p.char, canKill ? { type: "kill", target: r[0] } : down && killer ? { type: "drag", ko: r[0] } : canKnock ? { type: "knock", target: r[0] } : { type: "eye" }); return null; }
        if (inp.act && down) { this.act(p.char, { type: "wake", target: r[0] }); return null; }
        if (inp.act && !row[9] && !r[6]) { this.act(p.char, { type: "talk", target: r[0] }); return null; }
      } else {
        lines.push(t.blocked ? `<span class="dim">${t.label}</span>` : `${k("act")} ${t.label}`);
        if (t.peekAction) lines.push(`${k("alt")} ${t.peekLabel}`);
        if (inp.alt && t.peekAction) { this.act(p.char, t.peekAction); return null; }
        if (!t.blocked && (inp.act || (xr && this.xr?.grab && t.kind === "prop"))) {
          if (this.xr) this.xr.grab = false;
          if (t.kind === 'pool' || t.kind === 'task') {
            if (p.worldTask?.id === t.id && !p.worldTask.finished) {
              p.worldTask.active = true; p.worldTask.focus = !p.worldTask.collect && !p.worldTask.returning;
              p.hud.taskReflection('start', p.worldTask.task);
            } else { p.worldTask?.close(); p.worldTask = new WorldTask(this.view,p,t.id,a => this.act(p.char,a)); }
            if (t.id === 'defrag') {
              const seat = SEATS.filter(s => s.room === 'office').sort((a,b) => Math.hypot(a.x-(p.worldTask.task.x-.6),a.z-(p.worldTask.task.z+1.25))-Math.hypot(b.x-(p.worldTask.task.x-.6),b.z-(p.worldTask.task.z+1.25)))[0];
              if (seat) this.act(p.char,{type:'sit',seat:seat.id});
            }
            releasePointer();
          }
          else if (t.kind === "body") p.hud.openBodyMenu(t.victim, snap.chars.filter((r) => r[5] && r[0] !== p.char && r[0] !== t.victim && r[0] !== p.hud.partner).map((r) => r[0]));
          else this.act(p.char, t.action);
          return null;
        }
      }
    } else if (alive && inp.alt) this.act(p.char, { type: "eye" });
    if (row[9] && inp.act) { this.act(p.char, { type: "stand" }); return null; }
    if (active && !best) {
      if (inp.act) { placeActive(); return null; }
      lines.push(`${k("act")} Set down the ${active.name}`);
    }
    if (active && alive) lines.push(`<span class="dim">${k("throw")} Throw · ${k("drop")} Drop${!big && active.kind !== "torch" ? ` · ${k("pocket")} Pocket` : ""}</span>`);
    else if (alive && inv.pockets.some(Boolean)) lines.push(`<span class="dim">${k("pocket")} Take out the ${inv.pockets.find(Boolean).name}</span>`);
    return lines.length ? lines.join("<br>") : null;
  }

  propName(id) { const g = this.view.props.get(id); return itemName(g?.userData.p?.kind || "object"); }

  // Pick the thing nearest the centre of view within reach.
  target(p, eye, dir, alive, rows, snap, onlyPassage = false) {
    let best = null, bs = Infinity;
    const consider = (pt, reach, kind, extra, needLos = true, cone = 0.42) => {
      const dx = pt.x - eye.x, dy = pt.y - eye.y, dz = pt.z - eye.z;
      const d = Math.hypot(dx, dy, dz), hd = Math.hypot(dx, dz);
      if (hd > reach || d < 1e-3) return;
      if(alive&&hd>1.2&&!['light','door','hatch'].includes(kind)&&illuminationAt(pt.x,pt.z,snapshotLighting(snap,this.view.props))<.09)return;
      const cos = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
      const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      const lim = hd < 0.9 ? cone * 1.8 : cone;
      if (ang > lim) return;
      if (needLos && !losClear(eye.x, eye.z, pt.x, pt.z, snap.doors)) return;
      const s = ang + hd * 0.06;
      if (s < bs) { bs = s; best = { kind, d: hd, ...extra }; }
    };
    const carried = new Set(snap.chars.flatMap((r) => [r[10], r[13]]).filter(Boolean));
    const inv = p.hud.inv || { hands: [null, null] };
    const freeHands = inv.hands.filter((h) => !h).length;
    const active = inv.hands[1] || inv.hands[0];
    const ghostSpent = p.hud.ghost?.used;
    const frightened = alive && snap.ot && p.hud.role !== "killer";
    const hatchTargets = () => {
      if (!alive) return;
      for (const h of Object.values(HATCH_POS)) {
        consider({ x: h.tx, y: 0.1, z: h.tz }, 1.8, "hatch", { label: frightened ? "You're too scared to leave the room" : "Climb down the trapdoor", blocked: frightened, action: { type: "hatch", id: h.id } }, false, 0.7);
        const canPeek = alive && p.hud.role === "killer" && snap.ot && snap.fs && snap.ka && roomAtWorld(p.x, p.z) === "tunnels";
        consider({ x: h.bx, y: 1.5, z: h.bz }, 1.8, "hatch", { label: frightened ? "You're too scared to leave the room" : "Climb up the ladder", blocked: frightened, action: { type: "hatch", id: h.id }, peekAction: canPeek ? { type: "peekRoom", kind: "hatch", id: h.id } : null, peekLabel: `Peek up into ${roomName(h.room)}` }, false, 0.8);
      }
    };
    const doorTargets = () => {
      for (const d of DOOR_LIST) {
        const open = (snap.doorT?.[d.id] ?? snap.doors?.[d.id] ?? 0) > 0.5;
        const barred = !open && PUSHABLES.some((f) => f.push.door === d.id && f.push.t > 0.55);
        if (barred) { consider({ x: d.mid.x, y: 1.2, z: d.mid.z }, 1.9, "door", { label: "Something heavy is pushed against this door", blocked: true, action: { type: "door", door: d.id, open: true } }, false, 0.55); continue; }
        const side = (p.x - d.mid.x) * d.n.x + (p.z - d.mid.z) * d.n.z;
        const canPeek = alive && p.hud.role === "killer" && snap.ot && snap.fs && snap.ka && !open && (snap.doors?.[d.id] ?? 0) <= 0.05 && side < -0.25;
        consider({ x: d.mid.x, y: 1.2, z: d.mid.z }, 1.9, "door", { label: frightened ? "You're too scared to leave the room" : open ? "Close the door" : "Open the door", blocked: frightened, action: { type: "door", door: d.id, open: !open }, peekAction: canPeek ? { type: "peekRoom", kind: "door", id: d.id } : null, peekLabel: `Peek into ${roomName(d.room)}` }, false, 0.55);
      }
    };
    const frontOf = (f, height = 1) => {
      const sn = Math.sin(f.rot), cs = Math.cos(f.rot);
      const along = Math.max(-f.w / 2 + 0.18, Math.min(f.w / 2 - 0.18, (eye.x - f.x) * cs - (eye.z - f.z) * sn));
      const forward = f.d / 2 + 0.12;
      return { x: f.x + along * cs + forward * sn, y: height, z: f.z - along * sn + forward * cs };
    };
    if (onlyPassage) {
      hatchTargets(); doorTargets();
      for (const f of BODY_HIDES) if (f.room === rows.get(p.char)?.[8] && (!f.fire || !snap.fires?.includes(f.fire))) {
        consider(frontOf(f, f.type === "storageChest" ? 0.75 : 1), 2.35, "bodyHide", { label: `Hide the body in the ${f.fire ? "fireplace" : pretty(f.type)}`, action: { type: "hideBody", id: f.id } }, true, 0.62);
      }
      return best;
    }
    if(alive&&!snap.ot){
      for(const f of LIGHT_SWITCHES)consider(f,2.3,'light',{label:(snap.lightsOff?.[f.id]?'Turn on ':'Turn off ')+roomName(f.room)+' lights',action:{type:'light',id:f.id}},true,.3);
      for(const f of FLOOR_LAMPS){const id='lamp:'+f.id;consider({...f,y:f.h-.25},2.2,'light',{label:snap.lightsOff?.[id]?'Switch lamp on':'Switch lamp off',action:{type:'light',id}},true,.3);}
      for(const [key,g]of this.view.props){if(g.userData.p?.kind!=='lamp'||!g.visible)continue;const id='prop:'+key;consider({x:g.position.x,y:g.position.y+.3,z:g.position.z},2.1,'light',{label:snap.lightsOff?.[id]?'Switch desk lamp on':'Switch desk lamp off',action:{type:'light',id}},true,.2);}
    }
    // Props (the living and, once a night, ghosts).
    if (alive || !ghostSpent) {
      for (const [id, g] of this.view.props) {
        const tg = g.userData.target;
        if (!tg || tg.hidden || carried.has(id) || g.position.y < -1) continue;
        const weapon = !!WEAPON_BY_ID[id];
        if (!alive && weapon) continue;
        const kind = g.userData.p.kind, name = itemName(kind), large = isBig(kind);
        if (alive && (large ? freeHands < 2 : freeHands < 1)) continue;
        const tiny = kind === "coin";
        consider(g.position, tiny ? 1.4 : REACH, "prop", { id, label: alive ? `Pick up the ${name}${large ? " (both hands)" : ""}` : `Lift the ${name}`, action: { type: "grab", prop: id } }, true, tiny ? 0.16 : 0.3);
      }
    }
    // Trapdoors and the ladders beneath them.
    hatchTargets();
    // Doors.
    doorTargets();
    if (!alive) return best;
    // Waste bins: dispose of a small held thing, or rummage through.
    for (const f of BINS) {
      const toss = active && !active.big;
      consider({ x: f.x, y: 0.5, z: f.z }, 2.0, "bin", { label: toss ? `Throw the ${active.name} in the bin` : "Look in the bin", action: toss ? { type: "bin", id: f.id } : { type: "searchBin", id: f.id } }, true, 0.45);
    }
    // The killer can drag a body nobody has found yet.
    if (p.hud.role === "killer") for (const b of snap.bodies || []) {
      if (b[3] || b[6] || b[7]) continue;
      consider({ x: b[1], y: 0.3, z: b[2] }, 2.2, "body", { victim: b[0], label: `Inspect ${SUSPECT_BY_ID[b[0]]?.short}'s body` }, true, 0.6);
    }
    // People.
    for (const r of rows.values()) {
      if (r[0] === p.char || !r[5]) continue;
      if (!this.view.visible(p.i, r[1], r[2])) continue;
      consider({ x: r[1], y: r[16] ? 0.3 : r[9] ? 1.0 : 1.3, z: r[2] }, 2.4, "person", { row: r }, true, r[16] ? 0.7 : 0.5);
    }
    // The butler.
    const bt = snap.butler;
    if (alive && bt && this.view.visible(p.i, bt[0], bt[1])) consider({ x: bt[0], y: 1.3, z: bt[1] }, 2.6, "butler", { label: bt[5] ? "Grimsby is busy" : "Talk to Grimsby, the butler", blocked: !!bt[5], action: { type: "talkButler" } }, true, 0.5);
    // Seats.
    const taken = new Set(snap.chars.map((r) => r[9]).filter(Boolean));
    for (const s of SEATS) if (!taken.has(s.id)) consider({ x: s.x, y: s.h + 0.1, z: s.z }, 2.0, "seat", { label: "Sit", action: { type: "sit", seat: s.id } }, true, 0.4);
    for (const f of FIRES) {
      const lit = snap.fires?.includes(f.fire);
      const feed = lit && active;
      consider(frontOf(f, 0.6), 2.35, "fire", { label: feed ? `Throw the ${active.name} into the fire` : lit ? "Put out the fire" : f.bodyHide ? "Check or light the fireplace" : "Light the fire", action: feed ? { type: "burn", id: f.fire } : { type: "fire", id: f.fire } }, true, 0.55);
      if (feed) consider(frontOf(f, 1.25), 2.35, "fire", { label: "Put out the fire", action: { type: "fire", id: f.fire } }, true, 0.4);
      if (snap.ashes?.some(([id]) => id === f.fire)) consider(frontOf(f, 0.2), 2.35, "ashes", { label: "Sift through the ashes", action: { type: "ashes", id: f.fire } }, true, 0.4);
    }
    if (STOVE) {
      const feed = snap.stove && active;
      consider({ x: STOVE.x, y: 0.95, z: STOVE.z }, 2.2, "stove", { label: feed ? `Put the ${active.name} on the hot stove` : snap.stove ? "Turn off the stove" : "Light the stove", action: feed ? { type: "burn", id: "stove" } : { type: "stove" } }, true, 0.45);
      if (feed) consider({ x: STOVE.x, y: 0.6, z: STOVE.z }, 2.2, "stove", { label: "Turn off the stove", action: { type: "stove" } }, true, 0.35);
      if (snap.ashes?.some(([id]) => id === "stove")) consider({ x: STOVE.x, y: 1.1, z: STOVE.z }, 2.2, "ashes", { label: "Look at the scorched stovetop", action: { type: "ashes", id: "stove" } }, true, 0.35);
    }
    // Pushable chests: push from the end facing away from where it will go.
    if (alive) for (const f of PUSHABLES) {
      const { from, to, t } = f.push;
      if (t > 0.02 && t < 0.98) continue;
      const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
      const ux = (to.x - from.x) / len, uz = (to.z - from.z) / len, sgn = t < 0.5 ? -1 : 1;
      const half = Math.abs(ux) * f.fw / 2 + Math.abs(uz) * f.fd / 2;
      consider({ x: f.x + ux * sgn * (half + 0.05), y: 0.5, z: f.z + uz * sgn * (half + 0.05) }, 2.0, "push", { label: t < 0.5 ? `Push the ${pretty(f.type)} in front of the door` : `Push the ${pretty(f.type)} away from the door`, action: { type: "push", id: f.id } }, true, 0.5);
    }
    for (const f of CABS) {
      const open = snap.cabs?.includes(f.id);
      const canStash = active && !active.big && active.kind !== "torch";
      consider(frontOf(f, Math.min(1.2, f.h * 0.55)), 2.35, "cab", { label: canStash ? `Hide the ${active.name} in the ${pretty(f.type)}` : `${open ? "Close" : "Open"} the ${pretty(f.type)}`, action: canStash ? { type: "stashItem", id: f.id } : { type: "cab", id: f.id } }, true, 0.54);
    }
    if (!snap.ot) for (const task of TASKS.filter(t => t.id !== 'grime'&&t.id!=='haircut')) {
      const done = (p.hud.workProgress?.[task.id] || 0) >= task.steps;
      const hasTool = !task.tool || inv.hands.some(h => h?.kind === task.tool);
      const mine = p.hud.task?.id === task.id;
      const label = task.id === 'pool' ? 'Play skull pool' : `${task.verb}${mine ? ' ★' : ''}${done ? ' · done today' : ''}${!hasTool ? ` · hold ${TOOL_NAME[task.tool]}` : ''}`;
      consider(task, task.id === 'pool' ? 3.1 : 2.6, task.id === 'pool' ? 'pool' : 'task', { id: task.id, label, blocked: task.id !== 'pool' && (done || !hasTool), action: { type: 'taskWork', id: task.id } }, true, .5);
    }
    return best;
  }

  // ---------- VR ----------
  xrFrame(p, v, dt) {
    const r = this.view.renderer;
    if (!this.xr) {
      this.xr = { grips: [0, 1].map((i) => { const g = r.xr.getControllerGrip(i); this.view.xrRig.add(g); return g; }), prev: null, turnLatch: false, handT: 0 };
    }
    const X = this.xr;
    const session = r.xr.getSession();
    X.move = { x: 0, z: 0 };
    let trig = false, grip = false;
    const sources = session ? [...session.inputSources] : [];
    for (const src of sources) {
      const gp = src.gamepad;
      if (!gp) continue;
      const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
      if (src.handedness === "left") { X.move.x = Math.abs(ax[0]) > 0.15 ? ax[0] : 0; X.move.z = Math.abs(ax[1]) > 0.15 ? ax[1] : 0; }
      else {
        if (Math.abs(ax[0]) > 0.7) { if (!X.turnLatch) { v.xrYaw = (v.xrYaw || 0) - Math.sign(ax[0]) * Math.PI / 6; X.turnLatch = true; } } else X.turnLatch = false;
        trig = !!gp.buttons[0]?.pressed; grip = !!gp.buttons[1]?.pressed;
      }
    }
    // Head direction drives yaw/pitch (aim + movement).
    const cam = this.view.xrCam;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    v.yaw = Math.atan2(fwd.x, fwd.z);
    v.pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
    v.xrHead = { x: cam.position.x * Math.cos(v.xrYaw || 0) + cam.position.z * Math.sin(v.xrYaw || 0), z: -cam.position.x * Math.sin(v.xrYaw || 0) + cam.position.z * Math.cos(v.xrYaw || 0) };
    // Right hand: grab on grip press, release on grip up (throw when swung).
    const hand = X.grips[1].getWorldPosition(new THREE.Vector3());
    const vel = X.prev ? hand.clone().sub(X.prev).divideScalar(Math.max(dt, 1e-3)) : new THREE.Vector3();
    X.prev = hand.clone();
    X.vel = X.vel ? X.vel.lerp(vel, 0.5) : vel;
    if (trig && !X.trigWas) X.act = true;
    if (grip && !X.gripWas) X.grab = true;
    if (!grip && X.gripWas) { if (X.vel.length() > 2) X.throwV = { x: X.vel.x, y: X.vel.y, z: X.vel.z }; else X.release = true; }
    X.trigWas = trig; X.gripWas = grip;
    X.handT -= dt;
    if (grip && X.handT <= 0) { X.handT = 0.05; this.act(p.char, { type: "hand", p: { x: hand.x, y: hand.y, z: hand.z } }); }
    if (!grip && X.handWas) this.act(p.char, { type: "hand", p: null });
    X.handWas = grip;
  }

  interpolated() {
    return interpolateSnapshot(this.snaps, performance.now());
  }

  clock(snap) {
    const dayEl = $(".clk-day"), timeEl = $(".clk-time"), leftEl = $(".clk-left");
    const left = Math.max(0, Math.ceil(DAY_SECONDS - snap.t));
    const rooms = [...new Set(this.players.map((p) => {
      const row = snap.chars?.find((c) => c[0] === p.char);
      return p.synced ? roomAtWorld(p.x, p.z) || row?.[8] : row?.[8];
    }).filter(Boolean))];
    const location = rooms.length ? ` · ${rooms.map(roomName).join(" / ")}` : "";
    dayEl.textContent = `Night ${snap.day}${snap.day >= (snap.ld || LAST_DAY) ? " · Final" : ""}${location}`;
    if (snap.ph === "day") {
      timeEl.textContent = snap.search > 0 ? "Body search" : clockLabel(Math.min(snap.t, DAY_SECONDS));
      leftEl.textContent = snap.hide > 0 ? `Halls reopen in ${snap.hide}s` : snap.ot ? "Lights failing…" : snap.search > 0 ? `Find the body · ${Math.floor(snap.search / 60)}:${String(snap.search % 60).padStart(2, "0")}` : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      leftEl.classList.toggle("urgent", snap.search > 0 ? snap.search <= 15 : left <= 15 || !!snap.ot);
    } else if (snap.ph === "accuse") { timeEl.textContent = "Accusation"; leftEl.textContent = ""; }
    else if (snap.ph === "intro") { timeEl.textContent = clockLabel(0); leftEl.textContent = "The guests arrive"; }
    else { timeEl.textContent = snap.ph === "night" ? "Midnight" : snap.ph === "over" ? "The end" : "…"; leftEl.textContent = ""; }
  }

  layoutHuds() {
    const rects = this.view.rects();
    this.players.forEach((p, i) => p.hud.setRect(rects[i] || rects[0]));
  }
}
