// Fire as evidence disposal. Burnable things left in a lit fireplace (or on a
// lit stove) smoulder for 5 s — still retrievable — then burn for 15 s and are
// gone, leaving ash whose makeup can be read with a roll. Burning smells; a
// bloodied cloth taints the room until the next day. Throws are witnessed.
import { FURNITURE, FURN_BY_ID } from "./layout.js";
import { itemName, roomName } from "./data.js";
import { losClear } from "./nav.js";
import { trait } from "./souls.js";
import { nearestFurniture } from "./observe.js";
import { short } from "./facts.js";

export const IGNITE_SECONDS = 5, BURN_SECONDS = 15;
// smell: what a nose catches · ash: what is left to read.
export const BURNABLE = {
  rag: { smell: "scorched cotton", ash: "fine, pale cotton ash — the weave of a cloth still faintly printed in it" },
  towel: { smell: "singed cotton", ash: "thick, fluffy grey ash from a heavy looped cloth" },
  rope: { smell: "sharp burnt hemp", ash: "coarse fibrous ash in twisted coils, like burnt hemp strands" },
  flashlight: { smell: "acrid melting rubber and hot metal", ash: "a blackened lump of melted casing with a scorched glass bulb and a spring in it", melt: true },
  paper: { smell: "burnt paper", ash: "feather-light flakes of black paper ash" },
  book: { smell: "burnt paper and leather", ash: "curled leaves of black paper and a shrivelled leather spine" },
  pillow: { smell: "burnt feathers", ash: "clumps of charred feathers and the stitching of a cushion" },
  log: { smell: "woodsmoke", ash: "ordinary wood embers" },
  box: { smell: "burning card", ash: "a collapsed square of charred cardboard" },
  bread: { smell: "burnt bread", ash: "a carbonised crust" },
  bandage: { smell: "scorched gauze", ash: "thin strips of gauze ash" },
  umbrella: { smell: "melting oilcloth", ash: "bent ribs of an umbrella in a puddle of melted cloth", melt: true },
  candle: { smell: "hot wax", ash: "a pool of hardened wax with a burnt wick", melt: true },
};
const CLOTH = new Set(["rag", "towel", "bandage"]);
const BLOOD_SMELL = "a sickly, coppery stench of burnt blood";
const BLOOD_ASH = "with a rust-brown crust that smells of copper — it was soaked in blood";

const FIREPLACES = FURNITURE.filter((f) => f.fire);
// x,z: the grate on the logs (inside the collision box) · hx,hz: the hearth in
// front of it, where a tossed object lands against the stone.
const fwd = (f, k) => ({ x: f.x + Math.sin(f.rot) * k, z: f.z + Math.cos(f.rot) * k });
const spotOf = (f) => { const g = fwd(f, f.d / 2 - 0.2), hz = fwd(f, f.d / 2 + 0.3); return { id: f.fire, f, room: f.room, x: g.x, z: g.z, y: 0.25, hx: hz.x, hz: hz.z, r: Math.max(f.w * 0.4, 0.6), top: 0.75, label: `the ${roomName(f.room)} fireplace` }; };
const STOVE = FURN_BY_ID.stove;
export const HOT_SPOTS = [...FIREPLACES.map(spotOf), ...(STOVE ? [{ id: "stove", f: STOVE, room: STOVE.room, x: STOVE.x, z: STOVE.z, y: STOVE.h + 0.06, hx: STOVE.x, hz: STOVE.z, r: 0.8, top: 1.4, label: "the kitchen stove" }] : [])];
export const HOT_BY_ID = Object.fromEntries(HOT_SPOTS.map((s) => [s.id, s]));

export const ashText = (a) => `${BURNABLE[a.kind]?.ash || "unidentifiable ash"}${a.bloody ? `, ${BLOOD_ASH}` : ""}`;

export const BurnMethods = {
  hot(spot) { return spot.id === "stove" ? !!this.stove : this.fires.has(spot.id); },
  hotSpotAt(p) {
    if (p.stash?.startsWith("fire:")) { const s = HOT_BY_ID[p.stash.slice(5)]; return s && this.hot(s) ? s : null; }
    for (const s of HOT_SPOTS) if (this.hot(s) && Math.hypot(p.x - s.hx, p.z - s.hz) < s.r && p.y < s.top) return s;
    return null;
  },
  // Settle an object onto the grate: it stops being a physics body.
  intoGrate(p, s) {
    Object.assign(p, { x: s.x + (Math.random() - 0.5) * 0.2, z: s.z, y: s.y + (p.r || 0.05), vx: 0, vy: 0, vz: 0, stash: `fire:${s.id}`, room: s.room, moved: true, sleep: false });
  },
  canBurn(kind) { return !!BURNABLE[kind]; },
  // A visible point must be in the witness's forward view as well as unobstructed.
  seesPoint(o, x, z, room) {
    if (!o.alive || o.ko) return false;
    if (o.room !== room && Math.hypot(o.x - x, o.z - z) > 9) return false;
    return Math.hypot(o.x - x, o.z - z) < 12 && this.perceiveAt(o, x, z, room) > 0.2;
  },

  // Place a held item straight into a hot spot (the "throw it in" action).
  burnItem(c, spotId) {
    const s = HOT_BY_ID[spotId], id = c.hands[1] || c.hands[0], p = id && this.props.byId.get(id);
    if (!s || !p || !c.alive || Math.hypot(c.x - s.x, c.z - s.z) > 2.6) return false;
    if (!this.hot(s)) { this.toast(c, spotId === "stove" ? "The stove is cold." : "The fire isn't lit."); return false; }
    this.release(c, { x: (s.x - c.x) * 1.2, y: 1.6, z: (s.z - c.z) * 1.2 }, null, id);
    // Land it in the grate regardless of a fumbled arc.
    this.intoGrate(p, s);
    if (!this.canBurn(p.kind)) this.toast(c, `The ${itemName(p.kind)} won't burn.`);
    return true;
  },

  updateBurning(dt) {
    this.ashes ||= {}; this.taint ||= {};
    this.burnTick = (this.burnTick || 0) + dt;
    const slow = this.burnTick >= 1; if (slow) this.burnTick = 0;
    for (const p of this.props.list) {
      if (p.gone) continue;
      this.watchThrow(p);
      const loose = !p.holder && !p.hidden && (!p.stash || p.stash.startsWith("fire:"));
      const s = loose ? this.hotSpotAt(p) : null;
      if (s && !p.stash && p.sleep) this.intoGrate(p, s);
      if (!p.burn) {
        if (s && this.canBurn(p.kind)) { p.burn = { spot: s.id, start: this.time, by: p.lastHolder || null, bloody: !!p.bloody, seen: new Set(), smelt: new Set() }; p.moved = true; }
        continue;
      }
      const b = p.burn, spot = HOT_BY_ID[b.spot], age = this.time - b.start;
      if (!b.lit) {
        // Pulled out (or the fire died) before it caught.
        if (!s || s.id !== b.spot) { p.burn = null; p.moved = true; continue; }
        if (age >= IGNITE_SECONDS) {
          b.lit = true; p.moved = true;
          this.fx("fire", { id: spot.id === "stove" ? null : spot.id, on: true, x: spot.x, z: spot.z });
          for (const o of this.living()) if (o.human && this.seesPoint(o, spot.x, spot.z, spot.room)) this.toast(o, `The ${itemName(p.kind)} catches fire${BURNABLE[p.kind]?.melt ? " and starts to melt" : ""}.`);
        }
      }
      if (b.lit) {
        b.progress = Math.min(1, (age - IGNITE_SECONDS) / BURN_SECONDS);
        if (slow) this.burnSenses(p, spot);
        if (age >= IGNITE_SECONDS + BURN_SECONDS) this.finishBurn(p, spot);
        else p.moved = true;
      }
    }
    if (slow) this.lingeringSmells();
  },
  // During the 15 s burn: noses in the room, eyes on the grate.
  burnSenses(p, spot) {
    const b = p.burn, info = BURNABLE[p.kind];
    for (const o of this.living()) {
      if (o.ko) continue;
      const sameRoom = o.room === spot.room;
      if (sameRoom && !b.smelt.has(o.id)) {
        b.smelt.add(o.id);
        const what = b.bloody ? `${info.smell} — and under it, ${BLOOD_SMELL}` : info.smell;
        this.learn(o.id, { kind: "smell", room: spot.room, day: this.day, t0: Math.round(this.t), bloody: b.bloody, what }, "self");
        if (o.human) this.toast(o, `You catch the smell of ${what}.`);
        else if (Math.random() < 0.4 * (0.5 + trait(o.id, "sociability"))) this.say(o, b.bloody ? "What is that smell? That's not just smoke…" : "Something's burning in here.", 2.6);
      }
      if (!b.seen.has(o.id) && this.seesPoint(o, spot.x, spot.z, spot.room) && Math.hypot(o.x - spot.x, o.z - spot.z) < 7) {
        b.seen.add(o.id);
        this.learn(o.id, { kind: "burned", item: p.kind, room: spot.room, spot: spot.id, day: this.day, t0: Math.round(this.t), bloody: b.bloody }, "self");
      }
    }
  },
  finishBurn(p, spot) {
    const b = p.burn;
    p.gone = true; p.holder = null; p.burn = null; p.moved = true;
    this.hideState(p);
    (this.ashes[spot.id] ||= []).push({ kind: p.kind, bloody: b.bloody, day: this.day, t: Math.round(this.t), by: b.by });
    this.ashV = (this.ashV || 0) + 1;
    if (b.bloody && CLOTH.has(p.kind)) {
      this.taint[spot.room] = { day: this.day, what: BLOOD_SMELL };
      // Those who smelt it burning already know; the stench greets newcomers.
      for (const id of b.smelt) { const o = this.chars.get(id); if (o) (o.smeltRooms ||= new Set()).add(`${spot.room}:${this.day}`); }
    }
  },
  // A bloodied cloth's stench hangs in the room for the rest of the day.
  lingeringSmells() {
    for (const o of this.living()) {
      const t = this.taint[o.room];
      if (!t || t.day !== this.day) continue;
      const key = `${o.room}:${this.day}`;
      (o.smeltRooms ||= new Set());
      if (o.smeltRooms.has(key)) continue;
      o.smeltRooms.add(key);
      this.learn(o.id, { kind: "smell", room: o.room, day: this.day, t0: Math.round(this.t), bloody: true, what: t.what, lingering: true }, "self");
      if (o.human) this.toast(o, `The room reeks of ${t.what}.`);
    }
  },

  // ---------- reading the ashes ----------
  inspectAshes(c, spotId) {
    const s = HOT_BY_ID[spotId], ash = this.ashes?.[spotId] || [];
    if (!s || !c.alive || Math.hypot(c.x - s.x, c.z - s.z) > 2.6) return;
    if (!ash.length) { this.toSeat(c.id, { type: "ashes", spot: spotId, empty: true }); return; }
    const key = `${spotId}:${this.day}:${ash.length}`;
    (c.ashChecks ||= new Set());
    if (c.ashChecks.has(key)) { this.toast(c, "You've already sifted these ashes."); return; }
    c.ashChecks.add(key);
    const bonus = Math.round((trait(c.id, "observation") - 0.5) * 8 + (trait(c.id, "curiosity") - 0.5) * 4);
    const old = ash.some((a) => a.day < this.day);
    const dc = 9 + (ash.length > 2 ? 2 : 0) + (old ? 3 : 0);
    const roll = 1 + Math.floor(Math.random() * 20);
    const success = roll === 20 || (roll !== 1 && roll + bonus >= dc);
    c.anim = "agree"; c.animUntil = this.time + 1.2;
    const finds = success ? ash.map((a) => ({ kind: a.kind, bloody: a.bloody, day: a.day, text: ashText(a), name: itemName(a.kind) })) : null;
    if (success) this.learn(c.id, { kind: "ashes", room: s.room, spot: spotId, day: this.day, t0: Math.round(this.t), items: ash.map((a) => a.kind), bloody: ash.some((a) => a.bloody) }, "self");
    if (c.human) this.toSeat(c.id, { type: "ashes", spot: spotId, label: s.label, roll, bonus, dc, success, finds });
    return success;
  },

  // ---------- witnessed throws ----------
  watchThrow(p) {
    const w = p.throwWatch;
    if (!w) return;
    const settled = p.sleep || p.holder || p.burn || this.time - w.at > 2.5;
    if (!settled) return;
    p.throwWatch = null;
    const thrower = this.chars.get(w.by);
    const s = this.hotSpotAt(p) || (p.burn && HOT_BY_ID[p.burn.spot]);
    const f = !s && nearestFurniture(p, 1.4);
    const where = p.holder ? `in ${short(p.holder)}'s hands` : s ? `into ${s.label}` : f ? `near the ${f.type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} in ${roomName(p.room)}` : `across ${roomName(p.room)}`;
    const hit = w.hit && w.hit !== w.by ? `, striking ${short(w.hit)}` : "";
    const whereHit = where + hit;
    for (const id of w.ids) {
      const o = this.chars.get(id);
      if (!o?.alive) continue;
      // Seeing the throw begin does not reveal where it landed behind a wall.
      if (!this.seesPoint(o, p.x, p.z, p.room)) continue;
      this.learn(id, { kind: "threw", about: w.by, item: p.kind, room: p.room, where: whereHit, fire: !!s, day: this.day, t0: Math.round(w.at), bloody: !!p.bloody }, "self");
      if (o.human && thrower) this.toast(o, `${thrower.id === o.id ? "You" : short(thrower.id)} threw ${p.bloody ? "a bloodied" : "the"} ${itemName(p.kind)} — it landed ${whereHit}.`);
    }
  },
  noteThrow(c, p) {
    if (!c.alive) return;
    const ids = this.living().filter((o) => o !== c && this.sees(o, c)).map((o) => o.id);
    p.throwWatch = { by: c.id, at: this.time, ids };
  },

  // ---------- AI use ----------
  burnActivities(c, opts) {
    const T = (k) => trait(c.id, k);
    const spots = HOT_SPOTS.filter((s) => s.room === c.room);
    for (const s of spots) {
      const front = { x: s.x + Math.sin(s.f.rot) * 1.0, z: s.z + Math.cos(s.f.rot) * 1.0 };
      // A killer feeds bloody cloth or rope to a lit fire when nobody's watching.
      if (c.isKiller && this.hot(s)) {
        const held = this.handIds(c).map((id) => this.props.byId.get(id)).find((p) => p && this.canBurn(p.kind) && (p.bloody || p.kind === "rope"));
        const watched = this.living().some((o) => o !== c && !o.isKiller && this.sees(o, c));
        if (held && !watched) opts.push([4, () => this.goTo(c, front.x, front.z, { reach: 1.4, arrive: () => { this.burnItem(c, s.id); c.wait = 1; } })]);
      }
      // The curious sift through ash they haven't read today.
      const ash = this.ashes?.[s.id];
      if (!c.isKiller && ash?.length && !c.ashChecks?.has(`${s.id}:${this.day}:${ash.length}`)) opts.push([T("curiosity") * 0.9 + T("observation") * 0.4, () => this.goTo(c, front.x, front.z, { reach: 1.4, arrive: () => { const ok = this.inspectAshes(c, s.id); if (ok && Math.random() < 0.6) this.say(c, ash.some((a) => a.bloody) ? "There's blood in these ashes…" : "Someone's been burning things.", 3); c.wait = 2; } })]);
    }
  },
};
