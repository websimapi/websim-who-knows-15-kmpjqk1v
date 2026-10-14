// Mr. Grimsby, the butler. He walks the house on quiet (non-killing) days,
// does his own chores — bins, floors, bathroom stock — and watches everyone.
// Asking him what he saw takes an 18–20; fail and he lies, and remembers you.
// Hand him the Lucky Coin and he answers one question truthfully.
import { ROOM_LIST, SUSPECT_BY_ID, roomAtWorld, clockLabel, roomName } from "./data.js";
import { BINS, FURN_BY_ID, FURNITURE, stashPoint, PROP_RADIUS } from "./layout.js";
import { randomPointIn } from "./nav.js";
import { newStamina } from "./stamina.js";
import { claimLine, factText, contradicts } from "./facts.js";
import { bumpSocial } from "./ai.js";
import { soulLine, trait } from "./souls.js";
import { spawnLooseItem } from "./items.js";

const rand = (a, b) => a + Math.random() * (b - a);
const choice = (l) => l[Math.floor(Math.random() * l.length)];
const shuffle = (l) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const FRONT = FURNITURE.find((f) => f.type === "frontDoor");
const DOOR = { x: FRONT.x, z: FRONT.z - 1.1 };
const MURDER_ROOMS = ROOM_LIST.filter((r) => !["hallway", "cellar", "tunnels"].includes(r.id));
const TOOL_CODE = { mop: 1, bag: 2, supplies: 3 };
const LIES_EVERY = 22;
const short = (id) => SUSPECT_BY_ID[id]?.short || id;
// Fallbacks for when npc/butler/soul.md has not loaded.
const LINES = {
  greeting: "Good evening. Is there something the house can do for you?",
  farewell: "If you'll excuse me, the house does not clean itself.",
  coinAsk: "Forgive me, but is that a lucky coin you carry? I have wanted one like it for a very long time. Would you part with it?",
  coinThanks: "How very kind. For that, I shall tell you one true thing. Choose your question carefully.",
  coinWhy: "That coin keeps its keeper safe on the nights the killer walks. When the lights fail it carries you somewhere the blade won't reach. Spent or given away, another turns up the morning after a killing night.",
};
const line = (k) => soulLine("butler", k) || LINES[k];

export const ButlerMethods = {
  // ---------- day setup ----------
  startButlerDay(day) {
    this.butlerMind ||= { grudges: new Set(), honest: new Set() };
    // Whatever coin he was given is gone by the next day.
    if (this.butler?.coin) this.butler.coin = null;
    this.respawnCoin(day);
    if (this.isKillDay(day)) { this.butler = null; return; }
    this.butler = {
      id: "butler", human: false, alive: true, x: DOOR.x, z: DOOR.z, yaw: Math.PI, mv: 0, pace: 0, pitch: 0,
      stamina: newStamina(), path: null, plan: null, auto: null, wait: rand(4, 10), room: "hallway",
      hands: [null, null], pockets: [], anim: 0, animUntil: 0, tool: null, outside: 0, jobs: this.butlerJobs(), job: null,
      seen: new Map(), lieT: rand(10, LIES_EVERY), lookT: 0, convo: null, coin: null, truthFor: null, coinTold: new Set(),
    };
  },
  butlerJobs() {
    const jobs = [];
    if (Math.random() < 0.85) jobs.push({ kind: "trash" });
    for (const r of shuffle(MURDER_ROOMS).slice(0, 1 + (Math.random() < 0.6 ? 1 : 0))) jobs.push({ kind: "mop", room: r.id });
    if (Math.random() < 0.7) jobs.push({ kind: "restock" });
    return shuffle(jobs);
  },
  // The coin only comes back the day after a killing day, and only if the
  // last one was spent, burned or given away.
  respawnCoin(day) {
    if (day < 2 || !this.isKillDay(day - 1)) return;
    if (this.props.list.some((p) => p.kind === "coin" && !p.gone)) return;
    const room = choice(MURDER_ROOMS).id, at = randomPointIn(room);
    if (at) spawnLooseItem(this, "coin", { x: at.x, z: at.z, y: PROP_RADIUS.coin || 0.03 });
  },

  // ---------- per tick ----------
  updateButler(dt) {
    const b = this.butler;
    if (!b || this.phase !== "day") return;
    if (b.outside > 0) {
      b.outside -= dt;
      if (b.outside <= 0) { b.outside = 0; b.x = DOOR.x; b.z = DOOR.z; b.room = "hallway"; b.wait = 1; }
      return;
    }
    b.room = roomAtWorld(b.x, b.z) || b.room;
    b.lookT -= dt;
    if (b.lookT <= 0) { b.lookT = 0.8; this.butlerWatch(b); }
    b.lieT -= dt;
    if (b.lieT <= 0) { b.lieT = LIES_EVERY * rand(0.7, 1.3); this.butlerGossip(b); }
    if (b.aiTalk) { this.updateAiButlerTalk(b); b.mv = 0; b.pace = 0; return; }
    if (b.convo) {
      const cv = this.convos.get(b.convo), who = cv && this.chars.get(cv.a);
      if (!who || who.convo !== b.convo) b.convo = null;
      else { b.mv = 0; b.pace = 0; b.yaw = Math.atan2(who.x - b.x, who.z - b.z); return; }
    }
    // A guest is walking over to him: he waits politely where he is.
    if (b.hold && this.time < b.hold.until) {
      const g = this.chars.get(b.hold.id);
      if (g?.alive && !g.convo && dist(g, b) < 45) { b.mv = 0; b.pace = 0; return; }
      b.hold = null;
    }
    if (b.path?.[0]?.passage) { b.path = null; b.plan = null; }
    if (b.path?.length) { this.walk(b, dt); return; }
    b.mv = 0; b.pace = 0;
    if (b.plan?.arrive) {
      const plan = b.plan, fn = plan.arrive;
      plan.arrive = null;
      if (!plan.goal || Math.hypot(b.x - plan.goal.x, b.z - plan.goal.z) < (plan.reach || 1.5)) fn();
      else b.wait = 1;
    }
    if (b.wait > 0) { b.wait -= dt; return; }
    this.butlerNext(b);
  },
  butlerGo(b, at, arrive, reach = 1.3) {
    this.goTo(b, at.x, at.z, { reach, arrive });
    if (!b.path) { b.wait = 2; if (Math.hypot(b.x - at.x, b.z - at.z) > reach) b.job = null; }
  },
  butlerWork(b, secs) { b.wait = secs; b.anim = "agree"; b.animUntil = this.time + Math.min(secs, 1.2); },
  butlerNext(b) {
    const job = b.job || (b.job = b.jobs.shift() || { kind: "wander" });
    if ((job.tries = (job.tries || 0) + 1) > 12) { b.job = null; b.tool = null; b.wait = 1; return; }
    if (job.kind === "trash") return this.butlerTrash(b, job);
    if (job.kind === "mop") return this.butlerMop(b, job);
    if (job.kind === "restock") return this.butlerRestock(b, job);
    // Wander between chores, and keep pottering once they are done.
    b.job = null; b.tool = null;
    const room = choice(Math.random() < 0.3 ? [{ id: "hallway" }] : MURDER_ROOMS).id, at = randomPointIn(room);
    if (at) this.butlerGo(b, at, () => { b.wait = rand(4, 9); });
    else b.wait = 2;
  },

  // Bins: bag everything, bloody or not, and carry it out of the front door.
  butlerTrash(b, job) {
    job.bins ||= shuffle(BINS).slice(0, 3);
    b.tool = "bag";
    const f = job.bins.shift();
    if (f) {
      const front = { x: f.x + Math.sin(f.rot || 0) * 0.7, z: f.z + Math.cos(f.rot || 0) * 0.7 };
      return this.butlerGo(b, front, () => {
        for (const p of this.props.list) {
          if (p.stash !== `bin:${f.id}`) continue;
          const w = this.weapons.get(p.id);
          if (w) Object.assign(w, w.homePos, { room: w.home, atBody: false, bloody: false, pocket: false, stash: w.homeStash, hidden: false, vx: 0, vy: 0, vz: 0, sleep: false, moved: true });
          else { p.stash = null; p.gone = true; }
          this.hideState(p);
        }
        this.butlerWork(b, 2.2);
      }, 1.6);
    }
    this.butlerGo(b, DOOR, () => { b.outside = rand(5, 8); b.tool = null; b.job = null; }, 1.2);
  },
  // Floors: he mops the whole room, blood included, without a second look.
  butlerMop(b, job) {
    b.tool = "mop";
    if (!job.spots) {
      const blood = this.stains.filter((s) => s.room === job.room).slice(0, 3).map((s) => ({ x: s.x, z: s.z }));
      job.spots = [...blood, ...[0, 1, 2].map(() => randomPointIn(job.room)).filter(Boolean)].slice(0, 4);
    }
    const at = job.spots.shift();
    if (!at) {
      if (job.room !== "hallway") this.mopRoom(job.room);
      b.tool = null; b.job = null; b.wait = 1;
      return;
    }
    this.butlerGo(b, at, () => {
      this.mopNear(b, 2.6);
      if (job.room === "hallway") job.spots = job.spots.filter((spot) => this.stains.some((s) => s.id === spot.id && (s.s === 0 || s.s === 2)));
      this.butlerWork(b, rand(3, 4.5));
    }, 1.4);
  },
  mopNear(b, r) {
    const room = b.job?.kind === "mop" && b.job.room;
    if (!room) return;
    let changed = false;
    for (const s of this.stains) {
      if (s.room !== room || Math.hypot(s.x - b.x, s.z - b.z) > r) continue;
      const next = s.s === 0 ? 1 : s.s === 2 ? 3 : s.s;
      if (next !== s.s) { s.s = next; changed = true; }
    }
    const marksBefore = this.marks?.length || 0;
    this.marks = (this.marks || []).filter((m) => roomAtWorld(m.x, m.z) !== room || Math.hypot(m.x - b.x, m.z - b.z) > r);
    if (changed || this.marks.length !== marksBefore) this.stainV++;
  },
  mopRoom(room) {
    let changed = false;
    for (const s of this.stains) {
      if (s.room !== room) continue;
      const next = s.s === 0 ? 1 : s.s === 2 ? 3 : s.s;
      if (next !== s.s) { s.s = next; changed = true; }
    }
    const marksBefore = this.marks?.length || 0;
    this.marks = (this.marks || []).filter((m) => roomAtWorld(m.x, m.z) !== room);
    if (changed || this.marks.length !== marksBefore) this.stainV++;
  },
  // Bathroom: fresh bleach and towels in the linen cabinet.
  butlerRestock(b, job) {
    const f = FURN_BY_ID.bath_linen_cabinet;
    b.tool = "supplies";
    const front = { x: f.x + Math.sin(f.rot || 0) * (f.fd / 2 + 0.7), z: f.z + Math.cos(f.rot || 0) * (f.fd / 2 + 0.7) };
    this.butlerGo(b, front, () => {
      ["bleach", "towel", "towel"].forEach((kind, i) => spawnLooseItem(this, kind, stashPoint(f, 0.2 + i * 0.3), `cab:${f.id}`));
      this.butlerWork(b, 3);
      b.tool = null; b.job = null;
    }, 1.4);
  },

  // ---------- what he sees ----------
  butlerWatch(b) {
    const t = Math.round(this.t);
    for (const c of this.living()) {
      if (c.ko || !this.sees(b, c)) continue;
      const k = `${c.id}|${c.room}`, old = b.seen.get(k);
      if (old && t - old.t1 < 30) old.t1 = t;
      else b.seen.set(k, { kind: "saw", about: c.id, room: c.room, day: this.day, t0: t, t1: t });
      const w = this.weaponInHands(c);
      if (w) b.seen.set(`held|${c.id}|${w.id}`, { kind: "held", about: c.id, weapon: w.id, room: c.room, day: this.day, t0: t });
    }
    const visible = this.stains.filter((s) => {
      if (s.room !== "hallway" || (s.s !== 0 && s.s !== 2)) return false;
      const large = s.r > 0.3;
      return dist(b, s) <= (large ? 9 : 5) && this.perceiveAt(b, s.x, s.z, "hallway") > (large ? 0.15 : 0.3);
    });
    if (!visible.length) return;
    if (b.job?.kind === "mop" && b.job.room === "hallway") {
      for (const s of visible) if (!b.job.targets.has(s.id)) {
        b.job.targets.add(s.id);
        b.job.spots.push({ id: s.id, x: s.x, z: s.z });
      }
      return;
    }
    if (b.job && b.job.kind !== "wander") b.jobs.unshift(b.job);
    const spots = visible.sort((a, c) => dist(a, b) - dist(c, b)).map((s) => ({ id: s.id, x: s.x, z: s.z }));
    b.job = { kind: "mop", room: "hallway", spots, targets: new Set(spots.map((s) => s.id)) };
    b.path = null; b.plan = null; b.wait = 0; b.tool = "mop";
  },
  butlerTruth(filter) {
    const list = [...b_seen(this)].filter(filter);
    // Weapons in hand are the juiciest thing he saw; otherwise the latest sighting.
    return list.sort((x, y) => (y.kind === "held") - (x.kind === "held") || (y.t1 ?? y.t0) - (x.t1 ?? x.t0))[0] || null;
  },
  butlerLie(about = null, room = null) {
    const others = this.living().filter((c) => !c.ko);
    const target = about ? this.chars.get(about) : choice(others);
    if (!target) return null;
    const r = room || choice(MURDER_ROOMS.filter((x) => x.id !== target.room)).id;
    const t = Math.max(0, Math.round(this.t - rand(15, 90)));
    return { kind: "saw", about: target.id, room: r, day: this.day, t0: t, t1: t + 6 };
  },
  // Whoever crossed him gets talked about behind their back.
  butlerGossip(b) {
    const mind = this.butlerMind;
    const targets = [...mind.grudges].filter((id) => this.chars.get(id)?.alive && !mind.honest.has(id));
    if (!targets.length) return;
    const listener = this.living().filter((c) => !c.human && !c.convo && !c.ko && !targets.includes(c.id) && dist(c, b) < 4 && this.sees(b, c))[0];
    if (!listener) return;
    const about = choice(targets);
    const k = [...this.kills].reverse()[0];
    const lie = k && Math.random() < 0.6
      ? { kind: "saw", about, room: k.room, day: k.day, t0: Math.max(0, k.t - 8), t1: k.t + 4 }
      : this.butlerLie(about);
    if (!lie) return;
    this.learn(listener.id, { ...lie, lie: true }, "told:butler");
    bumpSocial(listener, about, 1.5);
    this.butlerSay(`${short(listener.id)}, a word. ${claimLine(lie, "butler")}`, 4);
  },
  butlerSay(text, dur = 3.6) { this.broadcast({ type: "say", id: "butler", text, room: this.butler?.room, dur }); },

  // ---------- conversation ----------
  startButlerTalk(c) {
    const b = this.butler;
    if (!b || b.outside || !c.alive || c.ko || c.convo || this.phase !== "day" || dist(b, c) > 3.4) return;
    if (b.convo) { this.toast(c, "Grimsby is busy with someone else."); return; }
    const id = this.convoSeq++;
    const cv = { id, a: c.id, b: "butler", ai: null, butler: true, turns: 0, history: [], options: {} };
    this.convos.set(id, cv);
    c.convo = b.convo = id;
    c.path = null; c.mv = 0; b.mv = 0; b.hold = null;
    c.yaw = Math.atan2(b.x - c.x, b.z - c.z);
    const coin = this.findItem(c, "coin");
    const intent = coin && !b.coin
      ? { kind: "butler_coin", line: line("coinAsk") }
      : { kind: "butler_greet", line: line("greeting") };
    this.butlerReply(c, cv, intent);
  },
  butlerOptions(c, cv) {
    const b = this.butler, out = [];
    const coin = this.findItem(c, "coin");
    if (coin && !b.coin) {
      out.push({ tag: "giveCoin", text: "Here — take the coin.", tone: "warm", kind: "Give coin" });
    }
    if (b.coin?.from === c.id && !b.coinTold.has(c.id)) out.push({ tag: "coinWhy", text: "Why does that coin matter so much to you?", tone: "neutral", kind: "Ask" });
    out.push({ tag: "askAny", text: choice(["What have you seen tonight, Grimsby?", "Anything unusual on your rounds?", "You see everything in this house. What did you notice?"]), tone: "neutral", kind: "Ask" });
    const others = shuffle(this.living().filter((x) => x.id !== c.id)).slice(0, 2);
    for (const o of others) out.push({ tag: "askWho", about: o.id, text: `Have you seen ${short(o.id)} tonight?`, tone: "neutral", kind: "Ask" });
    const k = [...this.kills].reverse()[0];
    const room = k?.room || choice(MURDER_ROOMS).id;
    out.push({ tag: "askRoom", room, text: `Who has been in the ${roomName(room)}?`, tone: "neutral", kind: "Ask" });
    out.push({ tag: "bye", text: "That will be all, Grimsby.", tone: "leave", kind: "Leave" });
    cv.options[c.id] = out;
    return out.map((o, i) => ({ i, text: o.text, tone: o.tone, kind: o.kind }));
  },
  butlerReply(c, cv, intent, end = false) {
    const options = end ? [] : this.butlerOptions(c, cv);
    cv.waitingFor = end ? null : c.id;
    cv.readyFor = cv.responseDue = null;
    cv.graces = 0;
    if (end) cv.closingAt = this.time + 4.5;
    cv.history.push({ speaker: "butler", text: intent.line });
    this.toSeat(c.id, {
      type: "convo", id: cv.id, with: "butler", speaker: "butler", options, ai: true,
      intent: { mood: "coolly polite", ...intent },
      history: cv.history.slice(-6), day: this.day, clock: clockLabel(this.t),
      temper: c.temper, aiTemper: "dry, unhurried and faintly amused", scene: null, aiScene: null,
    });
  },
  butlerChoose(c, cv, i) {
    const b = this.butler, opt = cv.options?.[c.id]?.[i];
    if (!b || !opt || cv.closingAt) return;
    cv.options[c.id] = null;
    cv.turns++;
    cv.history.push({ speaker: c.id, text: opt.text });
    this.say(c, opt.text, 3.5);
    if (opt.tag === "bye") { this.butlerReply(c, cv, { kind: "butler_bye", line: line("farewell") }, true); return; }
    if (opt.tag === "giveCoin") {
      const coin = this.findItem(c, "coin");
      if (!coin) return this.butlerReply(c, cv, { kind: "butler_none", line: "Ah. It seems you have nothing to give after all." });
      c.hands = c.hands.map((id) => (id === coin.id ? null : id)); c.pockets = c.pockets.map((id) => (id === coin.id ? null : id));
      coin.gone = true; coin.holder = null; coin.pocket = false; this.hideState(coin); this.sendInv(c);
      b.coin = { from: c.id, day: this.day }; b.truthFor = c.id;
      this.butlerMind.grudges.delete(c.id); this.butlerMind.honest.add(c.id);
      return this.butlerReply(c, cv, { kind: "butler_thanks", line: line("coinThanks") });
    }
    if (opt.tag === "coinWhy") {
      b.coinTold.add(c.id);
      return this.butlerReply(c, cv, { kind: "butler_coinwhy", line: line("coinWhy") });
    }
    const res = this.butlerAnswer(c, opt);
    if (!res.fact) return this.butlerReply(c, cv, { kind: "butler_none", line: res.line });
    this.learn(c.id, res.truthful ? res.fact : { ...res.fact, lie: true }, "told:butler");
    this.toSeat(c.id, { type: "noted", text: factText(res.fact), from: "butler" });
    this.butlerReply(c, cv, { kind: "butler_tell", line: res.line, deceptive: !res.truthful });
  },
  // ---------- AI guests using the butler ----------
  // Each soul decides how often the butler is worth the walk: curious,
  // credulous guests go to him; skeptics, and anyone he has fooled, less so.
  butlerAppeal(c) {
    const T = (k) => trait(c.id, k);
    const coin = this.findItem(c, "coin") && !this.butler?.coin;
    const suspect = this.topSuspect(c);
    let w = T("curiosity") * 0.45 + (1 - T("skepticism")) * 0.25 + T("sociability") * 0.1;
    if (this.kills.length) w += 0.2;
    if (suspect) w += 0.1;
    if (coin) w += (1 - T("superstition")) * 0.4;
    if (c.isKiller) w *= 0.5;
    return w / (1 + (c.butlerDoubt || 0) * 0.8);
  },
  topSuspect(c) {
    let best = null, bv = 1;
    for (const o of this.living()) if (o !== c && (c.social?.[o.id] || 0) > bv && !(c.isKiller && this.killers.includes(o.id))) { bv = c.social[o.id]; best = o.id; }
    return best;
  },
  seekButler(c) {
    const b = this.butler;
    if (!b || b.outside || b.convo || b.aiTalk || c.human || c.convo || c.chat || this.overtime) return false;
    if (this.time < (c.butlerCd ?? 0)) return false;
    const appeal = this.butlerAppeal(c);
    c.butlerCd = this.time + rand(18, 36) / (0.4 + appeal);
    if (Math.random() > appeal || dist(b, c) > 60) return false;
    b.hold = { id: c.id, until: this.time + 25 };
    this.goTo(c, b.x, b.z, { reach: 2.4, arrive: () => {
      const bb = this.butler;
      if (bb?.hold?.id === c.id) bb.hold = null;
      if (bb && !bb.outside && !bb.convo && !bb.aiTalk && dist(bb, c) < 3.2 && !c.convo && this.phase === "day" && !this.overtime) this.startAiButlerTalk(c);
      else c.wait = 1;
    } });
    return true;
  },
  startAiButlerTalk(c) {
    const b = this.butler, T = (k) => trait(c.id, k);
    c.path = null; c.mv = 0; c.wait = 9;
    c.yaw = Math.atan2(b.x - c.x, b.z - c.z); b.yaw = Math.atan2(c.x - b.x, c.z - b.z); b.hold = null;
    // Strategy: hand over the coin for a sure answer (unless superstition
    // says keep it), then ask about the prime suspect, the murder room, or anything.
    const coin = this.findItem(c, "coin");
    const give = coin && !b.coin && Math.random() < (1 - T("superstition")) * 0.8 + T("curiosity") * 0.2;
    const suspect = this.topSuspect(c), k = [...this.kills].reverse()[0];
    const q = suspect && Math.random() < 0.55 + T("boldness") * 0.3 ? { tag: "askWho", about: suspect, text: `Grimsby, have you seen ${short(suspect)} tonight?` }
      : k && Math.random() < 0.6 ? { tag: "askRoom", room: k.room, text: `Who has been in the ${roomName(k.room)}, Grimsby?` }
      : { tag: "askAny", text: choice(["Anything unusual on your rounds, Grimsby?", "What have you seen tonight, Grimsby?"]) };
    b.aiTalk = { id: c.id, stage: 0, at: this.time + (give ? 2.6 : 0.2), q, give };
    if (give) {
      this.say(c, "Here, Grimsby — take this coin. Now tell me the truth.", 3);
      c.hands = c.hands.map((id) => (id === coin.id ? null : id)); c.pockets = c.pockets.map((id) => (id === coin.id ? null : id));
      coin.gone = true; coin.holder = null; coin.pocket = false; this.hideState(coin);
      b.coin = { from: c.id, day: this.day }; b.truthFor = c.id;
      this.butlerMind.grudges.delete(c.id); this.butlerMind.honest.add(c.id);
    }
  },
  updateAiButlerTalk(b) {
    const t = b.aiTalk, c = this.chars.get(t.id);
    if (!c?.alive || c.ko || this.overtime || dist(b, c) > 4) { b.aiTalk = null; return; }
    if (this.time < t.at) return;
    c.wait = Math.max(c.wait, 2); c.path = null;
    if (t.stage === 0) {
      if (t.give) this.butlerSay(line("coinThanks"), 3);
      this.say(c, t.q.text, 3); t.stage = 1; t.at = this.time + 2.4; return;
    }
    if (t.stage === 1) {
      const res = this.butlerAnswer(c, t.q);
      this.butlerSay(res.line, 4.5);
      t.res = res; t.stage = 2; t.at = this.time + 3; return;
    }
    // The guest's own soul decides whether the answer is believed.
    const { fact, truthful } = t.res || {};
    if (fact) {
      const own = [...this.notes.get(c.id).facts.values()].filter((f) => f.src === "self");
      const caught = !truthful && own.some((o) => contradicts(fact, o));
      const believes = !caught && (truthful || Math.random() < 1 - trait(c.id, "skepticism") * 0.6);
      if (caught) { c.butlerDoubt = (c.butlerDoubt || 0) + 1; this.say(c, "That isn't what I saw, Grimsby.", 3); }
      else if (believes) {
        this.learn(c.id, truthful ? fact : { ...fact, lie: true }, "told:butler");
        if (fact.about && fact.about !== c.id) c.social[fact.about] = Math.min(12, (c.social[fact.about] || 0) + (fact.kind === "held" ? 1.5 : 0.6));
        this.say(c, choice(["I see. Thank you, Grimsby.", "Interesting. Very interesting.", "Hm. I'll remember that."]), 2.5);
      } else { c.butlerDoubt = (c.butlerDoubt || 0) + 0.4; this.say(c, choice(["Hm. If you say so.", "I'm not sure I believe you."]), 2.5); }
    }
    for (const o of this.witnesses(c.room, [c.id])) if (this.sees(o, c) && this.perceiveAt(o, b.x, b.z, b.room) > 0.12) this.learn(o.id, { kind: "talked", about: c.id, with: "butler", room: c.room, day: this.day, t0: Math.round(this.t) }, "self");
    c.wait = rand(0.5, 1.5);
    b.aiTalk = null; b.wait = Math.max(b.wait, 1);
  },
  // Shared by humans and AI guests: the honest answer is owed after the coin,
  // otherwise it takes an 18–20. A failed ask earns a lie and a grudge.
  butlerAnswer(c, q) {
    const b = this.butler;
    const honest = b.truthFor === c.id;
    let truthful = honest;
    if (!honest) {
      const roll = this.dialogueRoll(c, { id: "butler", trust: {} }, "ask", 18 + Math.floor(Math.random() * 3));
      truthful = roll.success;
      if (c.human) this.showDialogueRoll(c, { id: "butler" }, "Ask", roll, truthful ? "He tells it straight, for once." : "He answers smoothly. Something about it feels too smooth.");
    }
    const match = q.tag === "askWho" ? (f) => f.about === q.about : q.tag === "askRoom" ? (f) => f.room === q.room : (f) => f.about !== c.id;
    let fact = null;
    if (truthful) { fact = this.butlerTruth(match); if (fact && honest) b.truthFor = null; }
    else {
      this.butlerMind.grudges.add(c.id);
      fact = q.tag === "askWho" ? this.butlerLie(q.about) : q.tag === "askRoom" ? this.butlerLie(choice(this.living().filter((x) => x.id !== c.id))?.id, q.room) : this.butlerLie();
    }
    if (!fact) return { fact: null, truthful, line: q.tag === "askWho" ? "I have not laid eyes on them tonight. That much is true." : "Nothing worth repeating, I'm afraid. The house has been quiet." };
    return { fact, truthful, line: claimLine(fact, "butler") };
  },
  butlerSnap() {
    const b = this.butler;
    if (!b || b.outside > 0) return null;
    const q = (v) => Math.round(v * 100) / 100;
    return [q(b.x), q(b.z), q(b.yaw), Math.round(b.mv * 10) / 10, TOOL_CODE[b.tool] || 0, b.convo ? 1 : 0, b.anim && b.animUntil > this.time ? b.anim : 0, b.room];
  },
};

function b_seen(match) { return match.butler ? match.butler.seen.values() : []; }
