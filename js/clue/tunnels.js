// The tunnels under the house: trapdoor ladders, torches (doused by water,
// relit at a fire), and knockouts — nobody can be killed down here, but the
// killer can knock a guest senseless and drag them up into a room.
// Installed onto Match.prototype.
import { SCONCES, WATER, CELL, DRAG_SECONDS, cellToWorld, roomAtWorld } from "./data.js";
import { FURNITURE, FURN_BY_ID, local } from "./layout.js";
import { HATCH_POS, hatchNear, collide, losClear, randomPointIn } from "./nav.js";
import { trait } from "./souls.js";
import { short } from "./facts.js";

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a, b) => a + Math.random() * (b - a);
export const TORCH_Y = 1.6;
export const KO_REACH = 2.4;

// Upstairs water: the kitchen sink and the bathroom tub.
{
  const sink = local("kitchen", 8.8, 0.35), tub = local("bathroom", 10.1, 8.6);
  WATER.push({ x: sink.x, z: sink.z, r: 0.45, y: 0.92 }, { x: tub.x, z: tub.z, r: 0.85, y: 0.62 });
}

export function sconcePos(s) {
  const p = cellToWorld(s.c, s.r), off = CELL / 2 - 0.14;
  return { x: p.x + (s.side === "e" ? off : s.side === "w" ? -off : 0), z: p.z + (s.side === "s" ? off : s.side === "n" ? -off : 0), y: TORCH_Y, yaw: s.side === "e" ? -Math.PI / 2 : s.side === "w" ? Math.PI / 2 : 0 };
}
export function spawnTorches(list) {
  SCONCES.forEach((s, i) => {
    const p = sconcePos(s);
    list.push({ id: `i_torch${20 + i}`, kind: "torch", item: true, r: 0.07, x: p.x, y: p.y, z: p.z, yaw: p.yaw, stash: `sconce:${i}`, lit: true });
  });
}
export function waterAt(x, z, y = 0) {
  return WATER.find((w) => Math.hypot(w.x - x, w.z - z) < w.r + 0.15 && y < w.y + 0.45) || null;
}

export const TunnelMethods = {
  torches() { return this.props.list.filter((p) => p.kind === "torch" && !p.gone); },
  // Where a torch's flame actually is (held ones ride with their holder).
  torchSpot(t) { const h = t.holder && this.chars.get(t.holder); return h && t.pocket ? { x: h.x, z: h.z } : { x: t.x, z: t.z }; },
  // 0..1: how well lit a spot underground is.
  tunnelLight(x, z) {
    let best = 0;
    for (const t of this.torches()) {
      if (!t.lit) continue;
      const s = this.torchSpot(t), d = Math.hypot(s.x - x, s.z - z);
      if (d < 8 && losClear(s.x, s.z, x, z, null)) best = Math.max(best, 1 - d / 8);
    }
    return best;
  },
  // Can o make out p down here?
  seesUnderground(o, p) {
    const d = dist(o, p);
    if (d < 2.2) return true;
    if (d > 13 || !losClear(o.x, o.z, p.x, p.z, null)) return false;
    return this.tunnelLight(p.x, p.z) > Math.min(0.85, d / 14);
  },

  // ---------- ladders ----------
  climb(c, hatchId, forced = false) {
    if (!c.alive || c.ko || this.phase !== "day") return false;
    if (this.overtime && !c.isKiller && !forced) return false;
    const h = (hatchId && HATCH_POS[hatchId]) || hatchNear(c.x, c.z, 1.8)?.h;
    if (!h) return false;
    const dTop = Math.hypot(h.tx - c.x, h.tz - c.z), dBot = Math.hypot(h.bx - c.x, h.bz - c.z);
    if (Math.min(dTop, dBot) > 2) return false;
    if (c.convo) this.endConvo(c.convo, true);
    if (c.seat) this.stand(c);
    c.pouring = false;
    const body = c.dragging && this.bodies.find((b) => b.victim === c.dragging && !b.found);
    const down = dTop < dBot;
    // Guests leave their torch at the foot of the ladder for the next person.
    if (!c.human && !down) { const t = this.findItem(c, "torch", "hands"); if (t) this.release(c, { x: 0, y: 0, z: 0 }, null, t.id); }
    const to = down ? { x: h.bx, z: h.bz } : { x: h.tx, z: h.tz };
    const yaw = c.yaw;
    const step = collide(to.x + Math.sin(yaw) * 0.6, to.z + Math.cos(yaw) * 0.6, 0.28, this.doors);
    const from = { x: c.x, z: c.z };
    c.x = step.x; c.z = step.z; c.room = roomAtWorld(c.x, c.z) || c.room; c.mv = 0;
    // The corpse comes through the same trapdoor, so its position never
    // interpolates across the enormous gap between floors.
    if (body) {
      const q = collide(c.x - Math.sin(yaw) * 0.75, c.z - Math.cos(yaw) * 0.75, 0.28, this.doors, { noFurniture: true });
      body.x = q.x; body.z = q.z; body.room = roomAtWorld(q.x, q.z) || c.room;
      body.concealed = body.room === "tunnels";
      const victim = this.chars.get(body.victim);
      if (victim) { victim.x = q.x; victim.z = q.z; victim.room = body.room; }
    }
    // Hauling someone senseless up (or down) the ladder with you.
    const v = c.dragKO && this.chars.get(c.dragKO);
    if (v?.ko) {
      const q = collide(c.x - Math.sin(yaw) * 1.0, c.z - Math.cos(yaw) * 1.0, 0.28, this.doors);
      v.x = q.x; v.z = q.z; v.room = roomAtWorld(v.x, v.z) || v.room;
    }
    this.fx("ladder", { x: from.x, z: from.z });
    this.fx("ladder", { x: c.x, z: c.z });
    this.toSeat(c.id, { type: "tp", x: c.x, z: c.z, yaw });
    if (v?.ko) this.toSeat(v.id, { type: "tp", x: v.x, z: v.z, yaw: v.yaw });
    this.sendInv(c);
    return true;
  },

  // ---------- knockouts ----------
  knockOut(by, v) {
    if (!v.alive || v.ko) return false;
    const sawAttacker = !!by && this.sees(v, by);
    if (v.convo) this.endConvo(v.convo, true);
    if (v.chat) this.endChat(v);
    if (v.seat) this.stand(v);
    if (v.dragging) this.stopDrag(v);
    if (v.dragKO) this.stopKODrag(v);
    v.pouring = false;
    // Whatever was in their hands clatters to the floor.
    for (const id of this.handIds(v)) this.release(v, { x: rand(-0.6, 0.6), y: 0.5, z: rand(-0.6, 0.6) }, null, id);
    v.ko = true; v.koBy = by?.id || null; v.path = null; v.plan = null; v.auto = null; v.mv = 0; v.wait = 99;
    this.fx("knock", { x: v.x, z: v.z });
    const fact = { kind: "knocked", about: by?.id || null, victim: v.id, room: v.room, day: this.day, t0: Math.round(this.t) };
    this.learn(v.id, { ...fact, about: sawAttacker ? fact.about : null }, "self");
    for (const o of this.living()) if (o !== v && o !== by && !o.ko && this.sees(o, v)) this.learn(o.id, { ...fact, about: by && this.sees(o, by) ? by.id : null }, "self");
    this.toSeat(v.id, { type: "ko", on: true });
    if (by) this.toast(by, `${short(v.id)} crumples to the floor. Drag them up into a room before anyone wakes them.`);
    return true;
  },
  // Strike in the tunnels with whatever's in hand (or bare fists).
  tryKnock(c, targetId) {
    const v = this.chars.get(targetId);
    if (!c.isKiller || !c.alive || c.ko || !v?.alive || v.ko || v.isKiller || this.phase !== "day") return;
    if (c.room !== "tunnels" && v.room !== "tunnels") return;
    if (dist(c, v) > KO_REACH) return;
    if (c.convo) this.endConvo(c.convo, true);
    c.anim = "headShake"; c.animUntil = this.time + 0.6;
    this.knockOut(c, v);
  },
  wake(v, by = null, text = null) {
    if (!v?.ko) return;
    v.ko = false; v.koBy = null; v.wait = rand(0.6, 1.4);
    for (const k of this.chars.values()) if (k.dragKO === v.id) this.stopKODrag(k);
    this.toSeat(v.id, { type: "ko", on: false, text: text || (by ? `${short(by.id)} shakes you awake.` : "You come to.") });
    if (by) { by.anim = "agree"; by.animUntil = this.time + 1; this.toast(by, `${short(v.id)} groans and comes round.`); }
  },
  wakeAll(text) { for (const c of this.chars.values()) if (c.ko) this.wake(c, null, text); },
  koNear(c) { return [...this.chars.values()].filter((v) => v.ko && v.alive && v !== c && dist(v, c) < 2.2).sort((a, b) => dist(a, c) - dist(b, c))[0] || null; },

  // ---------- dragging the unconscious ----------
  startKODrag(c, vId) {
    const v = vId ? this.chars.get(vId) : this.koNear(c);
    if (!c.isKiller || !c.alive || this.phase !== "day" || !v?.ko || dist(v, c) > 2.4) return false;
    if ((c.koDragT || 0) >= DRAG_SECONDS) { this.toast(c, "You haven't the strength to drag anyone else tonight."); return false; }
    if (this.carrying(c)) { this.toast(c, "Free both hands to drag them."); return false; }
    if (c.dragging) this.stopDrag(c);
    if (c.seat) this.stand(c);
    c.dragKO = v.id; c.koDragT = c.koDragT || 0;
    this.toast(c, `You haul ${short(v.id)} along — ${Math.ceil(DRAG_SECONDS - c.koDragT)}s of strength left.`);
    this.sendInv(c);
    return true;
  },
  stopKODrag(c) { if (!c.dragKO) return; c.dragKO = null; this.sendInv(c); },
  updateKODrag(c, dt) {
    const v = this.chars.get(c.dragKO);
    if (!v?.ko || !v.alive || !c.alive) { this.stopKODrag(c); return; }
    const tx = c.x - Math.sin(c.yaw) * 1.0, tz = c.z - Math.cos(c.yaw) * 1.0;
    const k = Math.min(1, dt * 6);
    const p = collide(v.x + (tx - v.x) * k, v.z + (tz - v.z) * k, 0.2, this.doors, { noFurniture: true });
    if (Math.hypot(p.x - v.x, p.z - v.z) > 0.001) v.yaw = Math.atan2(c.x - p.x, c.z - p.z) + Math.PI;
    v.x = p.x; v.z = p.z; v.room = roomAtWorld(v.x, v.z) || v.room;
    c.koDragT += dt;
    if (c.koDragT >= DRAG_SECONDS) { this.stopKODrag(c); this.toast(c, "Your arms give out."); }
    else if (c.human && Math.floor(c.koDragT) !== Math.floor(c.koDragT - dt)) this.toSeat(c.id, { type: "drag", left: Math.ceil(DRAG_SECONDS - c.koDragT) });
  },

  // ---------- torches ----------
  fireNear(c) {
    for (const f of FURNITURE) if (f.fire && this.fires.has(f.fire) && dist(f, c) < 2.6) return "fire";
    const st = FURN_BY_ID.stove;
    if (st && this.stove && dist(st, c) < 2.4) return "stove";
    return null;
  },
  douse(t, c = null) {
    if (!t.lit) return;
    t.lit = false; t.moved = true;
    this.fx("hiss", { x: t.x, z: t.z });
    if (c) this.toast(c, "The torch hisses out.");
  },
  useTorch(c, t) {
    const w = waterAt(c.x + Math.sin(c.yaw) * 0.5, c.z + Math.cos(c.yaw) * 0.5, 0) || waterAt(c.x, c.z, 0);
    if (t.lit) {
      if (w) { this.douse(t, c); this.sendInv(c); return; }
      this.toast(c, "Hold it up and light the way. Water would put it out.");
      return;
    }
    const src = this.fireNear(c);
    if (!src) { this.toast(c, "The torch is out. Relight it at a burning fireplace or the stove."); return; }
    t.lit = true; t.moved = true;
    this.fx("fire", { on: true, x: c.x, z: c.z, v: 0.6 });
    this.toast(c, src === "stove" ? "You touch the torch to the stove's flame. It catches." : "You hold the torch to the fire. It roars back to life.");
    this.sendInv(c);
  },
  // ---------- AI ----------
  // Returns true when the tunnels gave this guest something to do.
  tunnelThink(c) {
    // Shake awake anyone you find lying senseless (killers walk on by).
    if (!c.isKiller) {
      const down = [...this.chars.values()].find((v) => v.ko && v.alive && v !== c && dist(v, c) < 14 && this.sees(c, v));
      if (down) {
        this.goTo(c, down.x, down.z, { hurry: true, arrive: () => { if (down.ko && dist(down, c) < 2.6) { this.wake(down, c); this.say(c, `${short(down.id)}! Wake up!`, 2.5); } } });
        return true;
      }
    }
    if (c.room === "tunnels") {
      // Grab a torch to see by.
      if (!c.hands.every(Boolean) && !this.findItem(c, "torch", "hands") && this.tunnelLight(c.x, c.z) < 0.6) {
        const t = this.torches().filter((t) => !t.holder && t.lit && dist(t, c) < 9).sort((a, b) => dist(a, c) - dist(b, c))[0];
        if (t) { this.goTo(c, t.x, t.z, { arrive: () => this.grab(c, t.id) }); return true; }
      }
      // Linger a little, then head back upstairs (the path climbs a ladder).
      if (Math.random() < 0.55) { const p = randomPointIn("tunnels"); this.goTo(c, p.x, p.z, {}); c.wait = rand(1, 3); return true; }
      return false;
    }
    // Now and then, the curious go exploring below.
    if (Math.random() < 0.03 + trait(c.id, "curiosity") * 0.06 && this.t < 100) {
      const p = randomPointIn("tunnels");
      this.goTo(c, p.x, p.z, {});
      return true;
    }
    return false;
  },
  // Killer AI: knock out a lone guest down below, haul them up into a room, finish it.
  tunnelHunt(c, watched) {
    const prey = this.living().filter((v) => v !== c && !v.isKiller && !v.ko && v.room === "tunnels" && !watched(v) && dist(v, c) < 30);
    if (!prey.length) return false;
    const v = prey.sort((a, b) => dist(a, c) - dist(b, c))[0];
    this.goTo(c, v.x, v.z, { hurry: true, stalk: true, arrive: () => {
      if (!v.alive || v.ko || dist(v, c) > KO_REACH || watched(v)) { c.wait = 0.4; return; }
      for (const id of this.handIds(c)) this.release(c, { x: 0, y: 0, z: 0 }, null, id);
      this.tryKnock(c, v.id);
      if (v.ko) this.haul(c, v);
    } });
    return true;
  },
  haul(c, v) {
    if (!this.startKODrag(c, v.id)) return;
    const h = Object.values(HATCH_POS).sort((a, b) => Math.hypot(a.bx - c.x, a.bz - c.z) - Math.hypot(b.bx - c.x, b.bz - c.z))[0];
    const room = randomPointIn(h.room);
    const tx = h.tx + (room.x - h.tx) * 0.25, tz = h.tz + (room.z - h.tz) * 0.25;
    this.goTo(c, tx, tz, { hurry: true, arrive: () => {
      if (v.ko && v.alive && v.room === c.room && dist(v, c) < 2.8) this.tryKill(c, v.id);
      this.stopKODrag(c);
    } });
  },

  updateTorches() {
    for (const t of this.torches()) {
      if (!t.lit || t.holder || t.stash) continue;
      if (waterAt(t.x, t.z, t.y)) this.douse(t);
    }
  },
};
