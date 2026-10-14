// Inventory (two hands, two pockets), evidence items, blood forensics, body
// dragging, bleach, bins and the lucky coin. Installed onto Match.prototype.
import { ITEMS, isBig, itemName, roomAtWorld, ROOM_LIST, DAY_SECONDS, BODY_DRAG_SECONDS, BLEACH_SECONDS, GHOST_HOLD } from "./data.js";
import { STASHES, BINS, FURN_BY_ID, stashPoint, PROP_RADIUS, local, surfaceAt } from "./layout.js";
import { randomPointIn, findPath, losClear } from "./nav.js";
import { trait } from "./souls.js";

const rand = (a, b) => a + Math.random() * (b - a);
const choice = (l) => l[Math.floor(Math.random() * l.length)];
const shuffle = (l) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inRoom = (r) => r && r !== "hallway" && r !== "cellar" && r !== "tunnels";
export const RAG_RADIUS = 2.1, TOWEL_RADIUS = 1.9, BLEACH_R = 0.5;

// Evidence items placed for a new match: pushed into the prop list.
export function spawnItems(list) {
  const spots = shuffle(STASHES);
  let n = 0;
  const add = (kind, at, stash = null) => {
    const r = PROP_RADIUS[kind];
    const p = { id: `i_${kind}${n++}`, kind, item: true, r, x: at.x, z: at.z, y: at.y ?? surfaceAt(at.x, at.z) + r, stash };
    list.push(p);
    return p;
  };
  const inCab = (kind) => { const f = spots.pop(); return add(kind, stashPoint(f, Math.random()), `cab:${f.id}`); };
  add("rag", { ...local("kitchen", 2.2, 0.35) });
  add("bandage", local("kitchen", 10.3, 0.35));
  add("bandage", local("office", 9.0, 4.4));
  add("bandage", stashPoint(FURN_BY_ID.k_pantry), "cab:k_pantry");
  add("bandage", stashPoint(FURN_BY_ID.office_filing), "cab:office_filing");
  inCab("rag");
  for (let i = 0; i < 3; i++) inCab("towel");
  inCab("bleach").left = BLEACH_SECONDS;
  inCab("lens");
  if (Math.random() < 0.5) inCab("coin");
  else { const room = choice(ROOM_LIST).id; const p = randomPointIn(room); add("coin", { x: p.x, z: p.z, y: PROP_RADIUS.coin }); }
}

// Drop one new loose (or stashed) item into a running match.
let spawnSeq = 0;
export function spawnLooseItem(match, kind, at, stash = null) {
  const r = PROP_RADIUS[kind] || 0.08;
  const p = {
    id: `i_${kind}x${++spawnSeq}`, kind, item: true, r,
    x: at.x, z: at.z, y: at.y ?? surfaceAt(at.x, at.z) + r, room: roomAtWorld(at.x, at.z), stash,
    left: kind === "bleach" ? BLEACH_SECONDS : undefined,
    vx: 0, vy: 0, vz: 0, yaw: Math.random() * Math.PI * 2,
    tilt: 0, roll: 0, sleep: false, holder: null, ghost: null, moved: true,
  };
  match.props.list.push(p);
  match.props.byId.set(p.id, p);
  match.hideState(p);
  return p;
}

// Fresh cleaning supplies arrive at the start of each exploration night.
export function spawnDailySupplies(match, day) {
  if (match.dailySupplyDays?.has(day)) return;
  (match.dailySupplyDays ||= new Set()).add(day);
  const kinds = ["rag", "rag", ...(match.isKillDay(day) ? ["bleach"] : [])];
  kinds.forEach((kind, i) => {
    const f = choice(STASHES);
    const at = stashPoint(f, 0.25 + i * 0.25);
    const p = {
      id: `i_${kind}${day * 100 + i + 50}`, kind, item: true, r: PROP_RADIUS[kind],
      x: at.x, z: at.z, y: at.y, room: f.room, stash: `cab:${f.id}`,
      left: kind === "bleach" ? BLEACH_SECONDS : undefined,
      vx: 0, vy: 0, vz: 0, yaw: Math.random() * Math.PI * 2,
      tilt: 0, roll: 0, sleep: false, holder: null, ghost: null, moved: true,
    };
    match.props.list.push(p);
    match.props.byId.set(p.id, p);
    match.hideState(p);
  });
}

export const ItemMethods = {
  // ---------- inventory ----------
  handIds(c) { return [...new Set(c.hands.filter(Boolean))]; },
  allIds(c) { return [...this.handIds(c), ...c.pockets.filter(Boolean)]; },
  findItem(c, kind, where = "all") {
    const ids = where === "hands" ? this.handIds(c) : where === "pockets" ? c.pockets.filter(Boolean) : this.allIds(c);
    return ids.map((id) => this.props.byId.get(id)).find((p) => p && p.kind === kind) || null;
  },
  weaponInHands(c) { return this.handIds(c).map((id) => this.weapons.get(id)).find(Boolean) || null; },
  carrying(c) { return c.hands[0] || c.hands[1] || null; },
  hideState(p) {
    const cab = p.stash?.startsWith("cab:") ? p.stash.slice(4) : null;
    p.hidden = !!(p.gone || (p.holder && p.pocket) || (cab && !this.cabs.has(cab)) || p.stash?.startsWith("bin:"));
    p.moved = true;
  },
  sendInv(c) {
    if (!c.human) return;
    const desc = (id) => { const p = id && this.props.byId.get(id); return p ? { id, kind: p.kind, name: p.kind === "torch" ? (p.lit ? "Torch" : "Torch (out)") : itemName(p.kind), bloody: !!p.bloody, used: !!p.used, wet: !!p.wet, lit: !!p.lit, left: p.left !== undefined ? Math.ceil(p.left) : undefined, big: isBig(p.kind) } : null; };
    this.toSeat(c.id, { type: "inv", hands: c.hands.map(desc), pockets: c.pockets.map(desc), pouring: !!c.pouring, dragging: !!(c.dragging || c.dragKO) });
  },
  toast(c, text, sfx) { if (c.human) this.toSeat(c.id, { type: "toast", text, sfx }); },

  grab(c, pid) {
    const p = this.props.byId.get(pid);
    if (!p || p.holder || p.gone || Math.hypot(p.x - c.x, p.z - c.z) > 2.4) return false;
    if (p.stash?.startsWith("bin:")) return false;
    if (p.burn?.lit) { this.toast(c, `The ${itemName(p.kind)} is burning — too hot to touch.`); return false; }
    if (p.burn) p.burn = null;
    if (p.stash?.startsWith("cab:") && !this.cabs.has(p.stash.slice(4))) return false;
    if (!c.alive) return this.ghostGrab(c, pid);
    const big = isBig(p.kind);
    const free = c.hands.filter((h) => !h).length;
    if (c.dragging) this.stopDrag(c);
    if (big ? free < 2 : free < 1) { this.toast(c, big ? "You need both hands free for that." : "Your hands are full."); return false; }
    if (c.seat) this.stand(c);
    if (big) c.hands = [p.id, p.id]; else c.hands[c.hands.indexOf(null)] = p.id;
    p.holder = c.id; p.pocket = false; p.stash = null; p.thrower = null;
    if (p.weapon) { p.atBody = false; if (p.core) this.addCard(c, "weapon", p.id); }
    this.hideState(p);
    this.props.wake(p);
    c.anim = "agree"; c.animUntil = this.time + 0.8;
    if (p.weapon) {
      const fact = { kind: "held", about: c.id, weapon: p.id, room: c.room, day: this.day, t0: Math.round(this.t) };
      for (const o of this.living()) if (o === c || this.sees(o, c)) this.learn(o.id, fact, "self");
    }
    this.sendInv(c);
    return true;
  },
  // Let go of a hand item: drop (v≈0), place at `at`, or throw.
  release(c, v = { x: 0, y: 0, z: 0 }, at = null, id = null) {
    id = id || c.hands[1] || c.hands[0];
    const p = id && this.props.byId.get(id);
    if (!p) return;
    c.hands = c.hands.map((h) => (h === id ? null : h));
    p.holder = null; p.pocket = false;
    const sp = Math.hypot(v.x || 0, v.y || 0, v.z || 0);
    if (at && Math.hypot(at.x - c.x, at.z - c.z) < 2.6 && sp < 0.1) { p.x = at.x; p.z = at.z; p.y = Math.max(at.y + p.r + 0.02, p.r); }
    p.vx = v.x || 0; p.vy = v.y || 0; p.vz = v.z || 0;
    p.lastHolder = c.id;
    if (sp > 1) { p.thrownAt = this.time; p.thrower = c.id; p.hitDone = false; this.noteThrow(c, p); }
    p.room = roomAtWorld(p.x, p.z);
    this.hideState(p);
    this.props.wake(p);
    if (!c.alive) {
      c.ghostUsed = true;
      this.fx("ghost", { x: p.x, z: p.z });
      this.toSeat(c.id, { type: "ghost", used: true });
    }
    if (p.kind === "bleach") c.pouring = false;
    this.sendInv(c);
  },
  // Drop any held or pocketed item at your feet.
  dropItem(c, id) {
    const pi = c.pockets.indexOf(id);
    if (pi >= 0) {
      const p = this.props.byId.get(id);
      c.pockets[pi] = null;
      Object.assign(p, { holder: null, pocket: false, x: c.x + Math.sin(c.yaw) * 0.35, z: c.z + Math.cos(c.yaw) * 0.35, y: 0.6, vx: 0, vy: 0, vz: 0 });
      p.room = roomAtWorld(p.x, p.z);
      this.hideState(p); this.props.wake(p);
      if (p.kind === "bleach") c.pouring = false;
      this.sendInv(c);
      return;
    }
    if (c.hands.includes(id)) this.release(c, { x: 0, y: 0, z: 0 }, null, id);
  },
  // Pocket the small thing in hand, or bring a pocketed one out.
  stow(c, wanted = null) {
    const small = wanted && c.hands.includes(wanted) ? wanted : [c.hands[1], c.hands[0]].find((id) => id && !isBig(this.props.byId.get(id)?.kind) && this.props.byId.get(id)?.kind !== "torch");
    if (small && (isBig(this.props.byId.get(small)?.kind) || this.props.byId.get(small)?.kind === "torch")) return false;
    const slot = c.pockets.indexOf(null);
    if (small && slot >= 0) {
      const p = this.props.byId.get(small);
      c.hands = c.hands.map((h) => (h === small ? null : h));
      c.pockets[slot] = small; p.pocket = true;
      if (p.kind === "bleach") c.pouring = false;
      this.hideState(p);
      this.sendInv(c);
      return true;
    }
    const pid = c.pockets.find(Boolean);
    const free = c.hands.indexOf(null);
    if (pid && free >= 0) { this.draw(c, pid); return true; }
    if (small) this.toast(c, "Your pockets are full.");
    else if (pid) this.toast(c, "Free a hand first.");
    else if (this.findItem(c, "torch", "hands")) this.toast(c, "A torch won't go in a pocket.");
    else if (this.carrying(c)) this.toast(c, "That's far too big for a pocket.");
    return false;
  },
  draw(c, pid) {
    const slot = c.pockets.indexOf(pid), free = c.hands.indexOf(null);
    if (slot < 0 || free < 0) return false;
    const p = this.props.byId.get(pid);
    c.pockets[slot] = null; c.hands[free] = pid; p.pocket = false;
    this.hideState(p);
    this.sendInv(c);
    return true;
  },
  // Everything falls out (death).
  spill(c) {
    for (const id of [...new Set([...c.hands, ...c.pockets])].filter(Boolean)) {
      const p = this.props.byId.get(id);
      if (!p) continue;
      Object.assign(p, { holder: null, pocket: false, x: c.x + rand(-0.5, 0.5), z: c.z + rand(-0.5, 0.5), y: 0.4, vx: 0, vy: 0, vz: 0 });
      p.room = roomAtWorld(p.x, p.z);
      this.hideState(p); this.props.wake(p);
    }
    c.hands = [null, null]; c.pockets = [null, null]; c.pouring = false;
    if (c.dragging) this.stopDrag(c);
    this.sendInv(c);
  },
  // ---------- bins ----------
  binNear(c, id) { const f = id ? FURN_BY_ID[id] : BINS.filter((b) => b.room === c.room).sort((a, b) => dist(a, c) - dist(b, c))[0]; return f && dist(f, c) < 2.2 ? f : null; },
  binItem(c, binId) {
    const f = this.binNear(c, binId);
    if (!f) return false;
    const id = [c.hands[1], c.hands[0]].find(Boolean);
    const p = id && this.props.byId.get(id);
    if (!p) return false;
    if (isBig(p.kind) || p.kind === "torch") { this.toast(c, "That won't fit in the bin."); return false; }
    c.hands = c.hands.map((h) => (h === id ? null : h));
    Object.assign(p, { holder: null, pocket: false, stash: `bin:${f.id}`, x: f.x, z: f.z, y: 0.3, vx: 0, vy: 0, vz: 0 });
    if (p.kind === "bleach") c.pouring = false;
    this.hideState(p);
    this.fx("thud", { x: f.x, z: f.z, v: 0.3 });
    const fact = { kind: "binned", about: c.id, weapon: p.kind, room: c.room, day: this.day, t0: Math.round(this.t), bloody: !!p.bloody };
    for (const o of this.living()) if (o !== c && this.sees(o, c) && this.perceiveAt(o, f.x, f.z, f.room) > 0.12 && dist(o, c) < 9) this.learn(o.id, fact, "self");
    this.sendInv(c);
    return true;
  },
  binContents(binId) { return this.props.list.filter((p) => p.stash === `bin:${binId}`); },
  searchBin(c, binId) {
    const f = this.binNear(c, binId);
    if (!f) return;
    const items = this.binContents(f.id);
    c.anim = "agree"; c.animUntil = this.time + 1;
    for (const p of items) if (p.item) this.learn(c.id, { kind: "inbin", weapon: p.kind, room: f.room, day: this.day, bloody: !!p.bloody, wet: !!p.wet }, "self");
    this.toast(c, items.length ? `In the bin: ${items.map((p) => `${itemName(p.kind)}${p.bloody ? " (bloodied)" : p.wet ? " (damp, smells of bleach)" : ""}`).join(", ")}.` : "The bin is empty.");
    return items;
  },
  emptyBins() {
    for (const p of this.props.list) if (p.stash?.startsWith("bin:")) { p.stash = null; p.gone = true; this.hideState(p); }
  },
  // Opening a cupboard reveals what was tucked inside.
  onCab(id) { for (const p of this.props.list) if (p.stash === `cab:${id}`) this.hideState(p); },
  stashItem(c, cabinetId) {
    const f = FURN_BY_ID[cabinetId];
    if (!f?.cab || f.room !== c.room || dist(f, c) > Math.max(f.fw, f.fd) / 2 + 1.7) return false;
    const id = [c.hands[1], c.hands[0]].find(Boolean);
    const p = id && this.props.byId.get(id);
    if (!p) return false;
    if (isBig(p.kind) || p.kind === "torch") { this.toast(c, "That won't fit in the cupboard."); return false; }
    const count = this.props.list.filter((q) => q.stash === `cab:${f.id}` && !q.gone).length;
    if (count >= 12) { this.toast(c, "There is no more space inside."); return false; }
    c.hands = c.hands.map((h) => h === id ? null : h);
    const at = stashPoint(f, (count % 5 + 1) / 6);
    Object.assign(p, { holder: null, pocket: false, stash: `cab:${f.id}`, x: at.x, y: at.y, z: at.z, room: f.room, vx: 0, vy: 0, vz: 0 });
    if (p.kind === "bleach") c.pouring = false;
    this.cabs.delete(f.id); this.onCab(f.id); this.hideState(p);
    this.props.wake(p);
    this.fx("cab", { id: f.id, on: false, x: f.x, z: f.z });
    this.toast(c, `You hide the ${itemName(p.kind)} in the ${f.type.replace(/([A-Z])/g, " $1").toLowerCase()}.`);
    this.sendInv(c);
    return true;
  },

  // ---------- blood ----------
  addStain(s) { s.id = this.stainSeq++; s.room = roomAtWorld(s.x, s.z); s.day = this.day; s.s = s.s || 0; this.stains.push(s); this.stainV++; return s; },
  bloodSpatter(killer, v) {
    const dir = Math.atan2(v.x - killer.x, v.z - killer.z);
    this.addStain({ x: v.x, z: v.z, r: rand(0.55, 0.75), rot: rand(0, 6.28), k: 0, e: 1, grow: 1 });
    const n = 22 + Math.floor(Math.random() * 14);
    for (let i = 0; i < n; i++) {
      const a = dir + rand(-1, 1) * rand(0.2, 1.1);
      const d = Math.pow(Math.random(), 0.7) * rand(0.4, 2.4);
      const r = rand(0.02, 0.11) * (1.2 - d / 3);
      this.addStain({ x: v.x + Math.sin(a) * d, z: v.z + Math.cos(a) * d, r, rot: a, k: 1, e: 1 + d * rand(0.4, 1.4) });
    }
    for (let i = 0; i < 5; i++) this.addStain({ x: killer.x + rand(-0.4, 0.4), z: killer.z + rand(-0.4, 0.4), r: rand(0.02, 0.05), rot: rand(0, 6.28), k: 1, e: 1.2 });
  },
  woundSpatter(v) {
    for (let i = 0; i < 8; i++) this.addStain({ x: v.x + rand(-0.25, 0.25), z: v.z + rand(-0.25, 0.25), r: rand(0.025, 0.075), rot: rand(0, 6.28), k: 1, e: 1.1 });
  },
  updateBleeding() {
    for (const c of this.living()) {
      if (!c.wound) { c.bleedPos = { x: c.x, z: c.z }; continue; }
      const old = c.bleedPos || { x: c.x, z: c.z };
      const moved = Math.min(2, Math.hypot(c.x - old.x, c.z - old.z));
      c.bleedDistance = (c.bleedDistance || 0) + moved;
      c.bleedPos = { x: c.x, z: c.z };
      if (c.bleedDistance >= 0.75) {
        c.bleedDistance = 0;
        this.addStain({ x: c.x + rand(-0.12, 0.12), z: c.z + rand(-0.12, 0.12), r: rand(0.018, 0.045), rot: rand(0, 6.28), k: 1, e: 1 });
      }
    }
  },
  stainsNear(x, z, r, states) { return this.stains.filter((s) => states.includes(s.s) && Math.hypot(s.x - x, s.z - z) < r + s.r * 0.5); },
  useItem(c, wantedKind = null) {
    const id = wantedKind ? c.hands.find((id) => this.props.byId.get(id)?.kind === wantedKind) : c.wound ? c.hands.find((id) => this.props.byId.get(id)?.kind === "bandage") || [c.hands[1], c.hands[0]].find(Boolean) : [c.hands[1], c.hands[0]].find(Boolean);
    const p = id && this.props.byId.get(id);
    if (!p) { this.toast(c, "Nothing in your hands."); return; }
    const witnesses = () => this.living().filter((o) => o !== c && this.sees(o, c) && dist(o, c) < 10);
    if (p.kind === "bandage") {
      if (!c.wound) { this.toast(c, "You have no wound to bandage."); return; }
      c.wound = null; c.bleedDistance = 0;
      c.hands = c.hands.map((h) => h === p.id ? null : h);
      p.holder = null; p.gone = true; this.hideState(p);
      this.toSeat(c.id, { type: "wound", bleeding: false });
      this.toast(c, "You bind the wound. The bleeding stops.");
      this.sendInv(c);
    } else if (p.kind === "rag") {
      if (p.used) { this.toast(c, "The rag is already soaked through."); return; }
      const grime = this.stainsNear(c.x, c.z, RAG_RADIUS, [2]).filter(s => s.k === 3);
      if (grime.length) {
        for (const s of grime) s.s = 3;
        const covered = this.marks.filter(m => grime.some(s => Math.hypot(s.x - m.x, s.z - m.z) < m.r + s.r));
        for (const m of covered) m.wet = 0;
        this.marks = this.marks.filter(m => m.wet);
        p.wet = true; c.anim = 'bathroom'; c.animUntil = this.time + 1.6;
        this.stainV++; this.checkGrimeTasks(); this.sendInv(c);
        for (const o of witnesses()) this.learn(o.id, { kind: 'cleaning', about: c.id, room: c.room, day: this.day, t0: Math.round(this.t) }, 'self');
        this.toast(c, 'You wipe away the bleached dirt.');
        return;
      }
      const near = this.stainsNear(c.x, c.z, RAG_RADIUS, [0]);
      if (!near.length) { this.toast(c, "There's nothing here to wipe up."); return; }
      for (const s of near) s.s = 1;
      this.stainV++;
      p.used = true; p.bloody = true;
      c.anim = "bathroom"; c.animUntil = this.time + 2.2;
      for (const o of witnesses()) this.learn(o.id, { kind: "cleaning", about: c.id, room: c.room, day: this.day, t0: Math.round(this.t) }, "self");
      this.toast(c, "You scrub the blood away. The rag is ruined — get rid of it.");
      this.sendInv(c);
    } else if (p.kind === "bleach") {
      if ((p.left ?? 0) <= 0) { this.toast(c, "The bottle is empty."); c.pouring = false; return; }
      c.pouring = !c.pouring;
      this.toast(c, c.pouring ? "You start pouring bleach as you walk…" : "You stop pouring.");
      this.sendInv(c);
    } else if (p.kind === "towel") {
      const marks = this.marks.filter((m) => m.wet && Math.hypot(m.x - c.x, m.z - c.z) < TOWEL_RADIUS);
      if (!marks.length) { this.toast(c, "Nothing wet to dry here."); return; }
      for (const m of marks) {
        m.wet = 0;
        for (const s of this.stains) if (s.k !== 3 && s.s === 2 && Math.hypot(s.x - m.x, s.z - m.z) < m.r + 0.1) s.s = 3;
      }
      this.marks = this.marks.filter((m) => m.wet);
      this.stainV++;
      p.wet = true;
      c.anim = "bathroom"; c.animUntil = this.time + 2;
      for (const o of witnesses()) this.learn(o.id, { kind: "cleaning", about: c.id, room: c.room, day: this.day, t0: Math.round(this.t) }, "self");
      this.toast(c, "You mop up the bleach. Not a trace left.");
      this.sendInv(c);
    } else if (p.kind === "torch") this.useTorch(c, p);
    else if (p.kind === "lens") this.toast(c, "Hold the lens in hand — hidden blood will glow blue.");
    else if (p.kind === "coin") this.toast(c, "Keep it in your pocket. Luck finds the pocketed.");
    else this.toast(c, `You can't do much with the ${itemName(p.kind)}.`);
  },
  updatePour(c, dt) {
    if (!c.pouring) return;
    const b = this.findItem(c, "bleach", "hands");
    if (!b || !c.alive) { c.pouring = false; this.sendInv(c); return; }
    b.left = Math.max(0, (b.left ?? 0) - dt);
    const last = c.pourAt;
    if (!last || Math.hypot(last.x - c.x, last.z - c.z) > 0.35 || this.time - last.t > 0.6) {
      c.pourAt = { x: c.x, z: c.z, t: this.time };
      const m = { id: this.stainSeq++, x: c.x + Math.sin(c.yaw) * 0.3, z: c.z + Math.cos(c.yaw) * 0.3, r: BLEACH_R * rand(0.8, 1.2), wet: 1, rot: rand(0, 6.28) };
      this.marks.push(m);
      for (const s of this.stains) if (s.s < 2 && Math.hypot(s.x - m.x, s.z - m.z) < m.r + 0.05) s.s = 2;
      if (this.stains.some(s => s.k === 3 && s.s === 2 && Math.hypot(s.x - m.x, s.z - m.z) < m.r + s.r)) { c.pouring = false; this.toast(c, 'The dirt is soaked. Wipe it with a rag.'); }
      this.stainV++;
    }
    if (Math.floor(b.left) !== Math.floor(b.left + dt)) this.sendInv(c);
    if (b.left <= 0) { c.pouring = false; this.toast(c, "The bleach runs dry."); this.sendInv(c); }
  },

  // ---------- dragging ----------
  bodyNear(c, victim = null) { return this.bodies.find((b) => !b.found && !b.dragging && !b.hideSpot && (!victim || b.victim === victim) && b.room === c.room && Math.hypot(b.x - c.x, b.z - c.z) < 2.2) || null; },
  hideDraggedBody(c, spotId) {
    const f = FURN_BY_ID[spotId];
    if (!c.isKiller || !c.alive || !c.dragging || !f?.bodyHide || f.room !== c.room || this.phase !== "day") return false;
    if (dist(c, f) > Math.max(f.fw, f.fd) / 2 + 1.7) return false;
    if (f.fire && this.fires.has(f.fire)) { this.toast(c, "Put the fire out first."); return false; }
    if (this.bodies.some((b) => !b.found && b.hideSpot === spotId)) { this.toast(c, "There is no room for another body."); return false; }
    const b = this.bodies.find((body) => body.victim === c.dragging);
    if (!b) return false;
    b.dragging = false; b.hideSpot = spotId; b.concealed = true; b.room = f.room;
    // Lay the body along the wide axis of the hollow chest, wardrobe or
    // firebox. Opening it now reveals the body inside, not on the floor ahead.
    b.x = f.x;
    b.z = f.z;
    b.yaw = f.rot + Math.PI / 2;
    const victim = this.chars.get(b.victim);
    if (victim) { victim.x = b.x; victim.z = b.z; }
    c.dragging = null;
    if (f.cab) { this.cabs.delete(f.id); this.onCab(f.id); }
    this.fx(f.fire ? "fire" : "cab", { id: f.id, on: false, x: f.x, z: f.z });
    this.toast(c, `You conceal the body in the ${f.fire ? "fireplace" : f.type.replace(/([A-Z])/g, " $1").toLowerCase()}.`);
    this.sendInv(c);
    return true;
  },
  startDrag(c, victim = null) {
    if (!c.isKiller || !c.alive || this.phase !== "day") return false;
    const b = this.bodyNear(c, victim);
    if (!b) return false;
    if ((c.bodyDragT || 0) >= BODY_DRAG_SECONDS) { this.toast(c, "You're out of strength until tomorrow."); return false; }
    if (this.carrying(c)) { this.toast(c, "Free both hands to drag the body."); return false; }
    if (c.seat) this.stand(c);
    c.dragging = b.victim; b.dragging = true;
    this.toast(c, `You drag ${this.chars.get(b.victim) ? b.victim : "the body"} — ${Math.ceil(BODY_DRAG_SECONDS - (c.bodyDragT || 0))}s of strength left today.`);
    this.toSeat(c.id, { type: "drag", left: Math.ceil(BODY_DRAG_SECONDS - (c.bodyDragT || 0)) });
    this.sendInv(c);
    return true;
  },
  stopDrag(c) {
    const b = this.bodies.find((x) => x.victim === c.dragging);
    c.dragging = null;
    if (b) { b.dragging = false; b.room = roomAtWorld(b.x, b.z) || b.room; b.concealed = b.room === "tunnels"; }
    this.sendInv(c);
  },
  updateDrag(c, dt) {
    const b = this.bodies.find((x) => x.victim === c.dragging);
    if (!b || b.found || !c.alive) { this.stopDrag(c); return; }
    const tx = c.x - Math.sin(c.yaw) * 1.05, tz = c.z - Math.cos(c.yaw) * 1.05;
    const ox = b.x, oz = b.z;
    const k = Math.min(1, dt * 6);
    b.x += (tx - b.x) * k; b.z += (tz - b.z) * k;
    const moved = Math.hypot(b.x - ox, b.z - oz);
    if (moved > 0.001) b.yaw = Math.atan2(c.x - b.x, c.z - b.z) + Math.PI;
    c.bodyDragT = (c.bodyDragT || 0) + dt;
    b.room = roomAtWorld(b.x, b.z) || b.room;
    b.concealed = b.room === "tunnels";
    const v = this.chars.get(b.victim);
    if (v) { v.x = b.x; v.z = b.z; }
    b.trail = (b.trail || 0) + moved;
    if (b.trail > 0.32) { b.trail = 0; this.addStain({ x: b.x, z: b.z, r: rand(0.18, 0.28), rot: Math.atan2(tx - ox, tz - oz), k: 2, e: rand(2.2, 3.4) }); }
    if (c.bodyDragT >= BODY_DRAG_SECONDS) { this.stopDrag(c); this.toast(c, "Your arms give out. Your strength returns tomorrow."); }
    else if (c.human && Math.floor(c.bodyDragT) !== Math.floor(c.bodyDragT - dt)) this.toSeat(c.id, { type: "drag", left: Math.ceil(BODY_DRAG_SECONDS - c.bodyDragT) });
  },

  // ---------- lucky coin ----------
  luckyCoin(c) {
    const coin = this.findItem(c, "coin", "pockets");
    if (!coin || c.isKiller) return false;
    const ks = this.activeKillers();
    const rooms = ROOM_LIST.map((r) => r.id).filter((r) => !ks.some((k) => r === k.room || r === k.lockRoom));
    let best = null, bd = Infinity;
    for (const r of rooms) { const p = randomPointIn(r); const d = Math.hypot(p.x - c.x, p.z - c.z) - Math.min(...ks.map((k) => Math.hypot(p.x - k.x, p.z - k.z)), 30) * 0.6; if (d < bd) { bd = d; best = { ...p, room: r }; } }
    c.pockets = c.pockets.map((id) => (id === coin.id ? null : id));
    coin.gone = true; coin.holder = null; this.hideState(coin);
    this.sendInv(c);
    if (!best) return false;
    const path = findPath(c.x, c.z, best.x, best.z);
    if (path?.length) { c.auto = path; c.path = null; c.plan = null; c.lockRoom = best.room; }
    this.toast(c, "Your lucky coin grows warm… and crumbles. Your feet carry you somewhere safe.");
    return true;
  },

  // ---------- perception of evidence ----------
  seeEvidence(o) {
    const lens = !!this.findItem(o, "lens", "hands");
    const rooms = new Set();
    for (const s of this.stains) {
      if (s.s === 3 || rooms.has(s.room)) continue;
      const visible = s.s === 0 || (lens && s.s === 1);
      if (!visible) continue;
      const d = Math.hypot(s.x - o.x, s.z - o.z);
      if (d > (s.r > 0.3 ? 9 : 5)) continue;
      if (this.perceiveAt(o, s.x, s.z, s.room) < (s.r > 0.3 ? 0.15 : 0.3)) continue;
      if (!o.human && s.s === 0 && Math.random() > 0.35 + trait(o.id, "observation") * 0.6) continue;
      rooms.add(s.room);
      this.learn(o.id, { kind: "blood", room: s.room, day: s.day, hidden: s.s === 1 ? 1 : 0 }, "self");
      if (!o.human && s.s === 1 && Math.random() < 0.5) this.say(o, "The lens… there's blood here someone wiped away!", 3);
    }
    for (const m of this.marks) {
      if (!m.wet || Math.hypot(m.x - o.x, m.z - o.z) > 6 || this.perceiveAt(o, m.x, m.z) < 0.3) continue;
      const room = roomAtWorld(m.x, m.z);
      this.learn(o.id, { kind: "bleach", room, day: this.day }, "self");
      break;
    }
    // Suspicious things in plain sight in other people's hands.
    for (const p of this.living()) {
      const clear = p === o ? 0 : this.perceive(o, p);
      if (clear <= 0.12) continue;
      // Telling what is in someone's hands takes a proper look.
      if (clear >= 0.35) for (const id of this.handIds(p)) {
        const it = this.props.byId.get(id);
        if (it?.weapon) { this.learn(o.id, { kind: "held", about: p.id, weapon: it.id, room: p.room, day: this.day, t0: Math.round(this.t) }, "self"); continue; }
        if (!it?.item || !(it.bloody || it.kind === "bleach" || it.wet)) continue;
        this.learn(o.id, { kind: "caught", about: p.id, weapon: it.kind, bloody: !!it.bloody, room: p.room, day: this.day }, "self");
      }
      if (p.dragging) this.learn(o.id, { kind: "dragged", about: p.id, victim: p.dragging, room: p.room, day: this.day, t0: Math.round(this.t) }, "self");
      if (p.pouring) this.learn(o.id, { kind: "cleaning", about: p.id, room: p.room, day: this.day, t0: Math.round(this.t) }, "self");
    }
  },

  // ---------- pocket search (d20) ----------
  searchPockets(searcher, target, convoId = null) {
    if (!searcher?.alive || !target?.alive) return null;
    if ((target.searchedBy ||= new Set()).has(`${searcher.id}:${this.day}`)) { this.toast(searcher, `You've already searched ${target.id} today.`); return null; }
    target.searchedBy.add(`${searcher.id}:${this.day}`);
    const roll = 1 + Math.floor(Math.random() * 20);
    const bonus = Math.round(trait(searcher.id, "observation") * 4) + Math.round((target.trust?.[searcher.id] || 0) / 2);
    const guard = target.human ? 0 : Math.round(trait(target.id, "boldness") * 3);
    const dc = 12 + guard;
    const success = roll === 20 || (roll !== 1 && roll + bonus >= dc);
    const found = success ? this.allIds(target).map((id) => this.props.byId.get(id)).filter(Boolean).map((p) => ({ kind: p.kind, name: itemName(p.kind), bloody: !!p.bloody, wet: !!p.wet })) : null;
    const msg = { type: "dice", by: searcher.id, target: target.id, roll, bonus, dc, success, found, convo: convoId };
    this.toSeat(searcher.id, msg);
    this.toSeat(target.id, msg);
    if (success) {
      for (const it of found) {
        const evidence = it.bloody || it.kind === "bleach" || it.wet || it.kind === "rag";
        this.learn(searcher.id, { kind: "caught", about: target.id, weapon: it.kind, bloody: it.bloody, room: target.room, day: this.day, searched: 1, weak: evidence ? 0 : 1 }, "self");
      }
    }
    return msg;
  },

  // ---------- AI: the killer tidies up ----------
  killerChores(c) {
    if (!c.isKiller) return false;
    const body = this.bodies.find((b) => !b.found);
    const myStains = this.stains.filter((s) => s.s === 0);
    const wet = this.marks.filter((m) => m.wet);
    const T = (k) => trait(c.id, k);
    const rag = this.findItem(c, "rag"), bleach = this.findItem(c, "bleach"), towel = this.findItem(c, "towel");
    // 1. Drag a fresh body out into the hallway.
    if (body && !c.dragging && (c.bodyDragT || 0) < BODY_DRAG_SECONDS && inRoom(body.room) && !this.carrying(c) && Math.random() < 0.45 + T("boldness") * 0.3) {
      this.goTo(c, body.x, body.z, { hurry: true, arrive: () => {
        if (!this.startDrag(c)) return;
        let best = null, bd = Infinity;
        for (let i = 0; i < 10; i++) { const p = randomPointIn("hallway"); const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < bd) { bd = d; best = p; } }
        if (best) this.goTo(c, best.x, best.z, { arrive: () => this.stopDrag(c) });
      } });
      return true;
    }
    if (c.dragging) return true;
    // 2. Bin anything incriminating while the body is still undiscovered.
    const dirty = this.allIds(c).map((id) => this.props.byId.get(id)).filter((p) => p && (p.bloody || (p.wet && !(p.kind === "towel" && wet.length)) || (p.kind === "bleach" && (p.left ?? 0) <= 0)));
    const needBleach = myStains.length || this.stains.some((s) => s.s === 1);
    const doneWithBleach = bleach && (!needBleach || (bleach.left ?? 0) <= 0);
    if (dirty.length || (doneWithBleach && !wet.length)) {
      const bin = BINS.slice().sort((a, b) => dist(a, c) - dist(b, c))[0];
      this.goTo(c, bin.x + 0.6, bin.z + 0.6, { hurry: !!body, arrive: () => {
        for (const p of [...dirty, ...(doneWithBleach ? [bleach] : [])]) { if (!this.handIds(c).includes(p.id)) { if (!this.draw(c, p.id)) { this.release(c); this.draw(c, p.id); } } this.binItem(c, bin.id); }
      } });
      return true;
    }
    // 3. Mop up wet bleach with a towel.
    if (wet.length && towel) {
      const m = wet.sort((a, b) => dist(a, c) - dist(b, c))[0];
      this.goTo(c, m.x, m.z, { arrive: () => { if (dist(c, m) < TOWEL_RADIUS && this.inHand(c, towel)) this.useItem(c, "towel"); this.stowAll(c); } });
      return true;
    }
    // 4. Bleach the stains, or wipe them with a rag.
    if (myStains.length || (bleach && needBleach)) {
      const targets = myStains.length ? myStains : this.stains.filter((s) => s.s === 1);
      const target = targets.slice().sort((a, b) => dist(a, c) - dist(b, c))[0];
      const cluster = targets.filter((s) => dist(s, target) < RAG_RADIUS);
      if (rag && !rag.used && myStains.length && (cluster.length < 5 || !bleach || (bleach.left ?? 0) <= 0)) {
        this.goTo(c, target.x, target.z, { arrive: () => { if (dist(c, target) < RAG_RADIUS && this.inHand(c, rag)) this.useItem(c, "rag"); this.stowAll(c); } });
        return true;
      }
      if (bleach && (bleach.left ?? 0) > 0) {
        this.goTo(c, target.x, target.z, { arrive: () => {
          if (!this.inHand(c, bleach)) return;
          c.pouring = true;
          this.updatePour(c, 0.1);
          // Trace one nearby patch in order. Each leg starts where the last ended.
          const nearby = targets.filter((s) => dist(s, target) < 3).slice(0, 8);
          const route = []; let x = c.x, z = c.z;
          for (const s of nearby) {
            const leg = findPath(x, z, s.x, s.z);
            if (leg?.length) { route.push(...leg); x = s.x; z = s.z; }
          }
          if (!route.length) { c.pouring = false; this.stowAll(c); return; }
          c.path = route; c.plan = { goal: { x, z }, arrive: () => { c.pouring = false; this.stowAll(c); } };
        } });
        return true;
      }
    }
    // 5. Hunt for tools: rag, bleach, towels (before or after the deed).
    const wants = [];
    if ((!rag || rag.used) && (myStains.length || Math.random() < 0.3)) wants.push("rag");
    if ((!bleach || (bleach.left ?? 0) <= 0) && (needBleach || Math.random() < 0.25)) wants.push("bleach");
    if (!towel && (wet.length || bleach)) wants.push("towel");
    if (!wants.length) return false;
    if (!needBleach && !wet.length && Math.random() > 0.2 + T("tidiness") * 0.3) return false;
    return this.fetchItem(c, wants);
  },
  // Walk to a known/visible item, or search a cupboard for one.
  fetchItem(c, kinds) {
    const known = this.props.list.filter((p) => kinds.includes(p.kind) && !p.holder && !p.gone && !p.stash?.startsWith("bin:") && (!p.stash || this.cabs.has(p.stash.slice(4)) || c.searched?.has(p.stash.slice(4))));
    const p = known.sort((a, b) => dist(a, c) - dist(b, c))[0];
    if (p) {
      const cab = p.stash?.startsWith("cab:") ? FURN_BY_ID[p.stash.slice(4)] : null;
      const at = cab ? this.cabFront(cab) : p;
      this.goTo(c, at.x, at.z, { reach: cab ? 1.5 : 2.2, arrive: () => {
        if (cab && !this.cabs.has(cab.id)) this.toggleCab(c, cab.id);
        if (c.hands.every(Boolean)) { this.stowAll(c); if (c.hands.every(Boolean)) this.release(c, { x: 0, y: 0, z: 0 }, null, c.hands.find((id) => this.props.byId.get(id)?.kind !== "lens") || c.hands[0]); }
        if (this.grab(c, p.id)) this.stowAll(c);
      } });
      return true;
    }
    return this.rummage(c, kinds);
  },
  cabFront(f) { return { x: f.x + Math.sin(f.rot) * (f.fd / 2 + 0.7), z: f.z + Math.cos(f.rot) * (f.fd / 2 + 0.7) }; },
  rummage(c, kinds) {
    c.searched ||= new Set();
    const cabs = STASHES.filter((f) => !c.searched.has(f.id)).sort((a, b) => dist(a, c) - dist(b, c));
    const f = cabs[Math.floor(Math.random() * Math.min(3, cabs.length))];
    if (!f) return false;
    const at = this.cabFront(f);
    this.goTo(c, at.x, at.z, { arrive: () => {
      c.searched.add(f.id);
      if (!this.cabs.has(f.id)) this.toggleCab(c, f.id);
      for (const p of this.props.list) if (p.stash === `cab:${f.id}` && (kinds.includes(p.kind) || p.kind === "coin" || p.kind === "lens")) {
        if (c.hands.every(Boolean)) this.stowAll(c);
        if (c.hands.some((id) => !id) && this.grab(c, p.id)) this.stowAll(c);
      }
      if (Math.random() < trait(c.id, "tidiness") * 0.6) this.toggleCab(c, f.id);
    } });
    return true;
  },
  inHand(c, p) {
    if (this.handIds(c).includes(p.id)) return true;
    if (c.hands.indexOf(null) < 0) this.release(c);
    return this.draw(c, p.id);
  },
  stowAll(c) { for (let i = 0; i < 2; i++) { const s = [c.hands[1], c.hands[0]].find((id) => id && !isBig(this.props.byId.get(id)?.kind) && this.props.byId.get(id)?.kind !== "lens" && this.props.byId.get(id)?.kind !== "torch"); if (!s || c.pockets.indexOf(null) < 0) break; this.stow(c, s); } },

  // ---------- AI: guests hunt for clues ----------
  saviorChores(c) {
    if (c.isKiller) return false;
    const T = (k) => trait(c.id, k);
    const lens = this.findItem(c, "lens");
    // Hold the lens up while wandering.
    if (lens && !this.handIds(c).includes(lens.id)) this.inHand(c, lens);
    // Pocket anything small that we're holding that isn't the lens.
    if (this.handIds(c).length) this.stowAll(c);
    if (lens && this.handIds(c).includes(lens.id)) {
      c.lensChecked ||= new Set();
      const scenes = [...(this.notes.get(c.id)?.facts.values() || [])].filter((f) => f.kind === "body" && ROOM_LIST.some((r) => r.id === f.room));
      const scene = scenes.find((f) => !c.lensChecked.has(`${f.day}:${f.room}`));
      if (scene) {
        const key = `${scene.day}:${scene.room}`, at = randomPointIn(scene.room);
        this.goTo(c, at.x, at.z, { hurry: this.t > DAY_SECONDS - 30 && dist(c, at) > 6, arrive: () => { c.lensChecked.add(key); this.seeEvidence(c); } });
        return true;
      }
    }
    const r = Math.random();
    const bin = BINS.find((b) => b.room === c.room);
    if (bin && r < T("curiosity") * 0.25) {
      this.goTo(c, bin.x + 0.6, bin.z + 0.6, { arrive: () => this.searchBin(c, bin.id) });
      return true;
    }
    if (!lens || !this.findItem(c, "coin")) {
      if (r < T("curiosity") * 0.3) return this.fetchItem(c, [lens ? "coin" : "lens", "coin"]);
    }
    return false;
  },
};
