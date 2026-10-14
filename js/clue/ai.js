// AI reasoning: weighted beliefs from notebook facts, trust in sources, and
// the accusation it would make. Movement lives in match.js.
import { SUSPECTS, WEAPONS, ROOM_LIST } from "./data.js";
import { trait } from "./souls.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function sourceWeight(ai, src) {
  if (!src || src === "self" || src === ai.id) return 1;
  if (src === "public") return 1;
  const id = String(src).replace(/^(told|overheard):/, "");
  const t = ai.trust[id] ?? 0;
  return clamp(0.5 + t * 0.08, 0.1, 0.95) * (String(src).startsWith("overheard") ? 0.85 : 1);
}

// Known murders from the AI's point of view: victim + time of death.
export function knownKills(match, note) {
  const out = [];
  for (const f of note.facts.values()) if (f.kind === "tod") out.push({ victim: f.about, day: f.day, t: f.t });
  return out;
}

// Beliefs for one murder. Returns scored maps.
export function judgeKill(match, ai, note, kill, { selfBlind = false } = {}) {
  const susp = {}, weap = {}, room = {};
  for (const s of SUSPECTS) susp[s.id] = (ai.social[s.id] || 0) - (ai.trust[s.id] || 0) * 0.35;
  for (const w of WEAPONS) weap[w.id] = 0;
  for (const r of ROOM_LIST) room[r.id] = 0;
  const near = (f, win) => f.day === kill.day && Math.max(f.t0 ?? f.t, kill.t - win) <= Math.min(f.t1 ?? f.t0 ?? f.t, kill.t + win);
  for (const f of note.facts.values()) {
    const w = sourceWeight(ai, f.src);
    if (f.kind === "body" && f.about === kill.victim) { if (!f.bleedOut && room[f.room] !== undefined) room[f.room] += 5 * w; weap[f.weapon] = (weap[f.weapon] || 0) + 6 * w; }
    if (f.kind === "blood" && f.day === kill.day && room[f.room] !== undefined) room[f.room] += (f.hidden ? 8 : 5) * w;
    if (f.kind === "bleach" && f.day === kill.day && room[f.room] !== undefined) room[f.room] += 3 * w;
    if (f.kind === "kill" && f.victim === kill.victim) { susp[f.about] += 14 * w; room[f.room] += 5 * w; weap[f.weapon] += 5 * w; }
    if (f.kind === "wound" && f.victim === kill.victim) { susp[f.about] = (susp[f.about] || 0) + 12 * w; room[f.room] = (room[f.room] || 0) + 6 * w; weap[f.weapon] = (weap[f.weapon] || 0) + 6 * w; }
    if (f.kind === "missing" && f.day === kill.day) weap[f.weapon] += 1.5 * w;
    if (f.kind === "saw" && f.about === kill.victim && near(f, 15) && room[f.room] !== undefined) room[f.room] += 2 * w;
  }
  const kRoom = argmax(room), kWeap = argmax(weap);
  for (const f of note.facts.values()) {
    const w = sourceWeight(ai, f.src);
    if (f.about === kill.victim || susp[f.about] === undefined) continue;
    if (f.kind === "held" && f.day === kill.day) {
      const prox = f.t0 <= kill.t + 3 ? 1 : 0.3;
      susp[f.about] += (f.weapon === kWeap.key ? 3.2 : 0.4) * w * prox;
    }
    if (f.kind === "saw" && near(f, 18)) {
      if (f.room === kRoom.key) susp[f.about] += 3 * w;
      else if (near(f, 6)) susp[f.about] -= 2.6 * w;
    }
    if (f.kind === "caught" && f.day >= kill.day) susp[f.about] += (f.bloody ? 9 : f.weapon === "bleach" ? 4 : f.weapon === "towel" ? 2 : f.weak ? 0.3 : 1) * w;
    if (f.kind === "cleaning" && f.day === kill.day) susp[f.about] += 8 * w;
    if (f.kind === "dragged" && f.victim === kill.victim) susp[f.about] += 9 * w;
    if (f.kind === "peekCaught" && f.day === kill.day && f.room === kRoom.key) susp[f.about] += 5 * w;
    if (f.kind === "knocked" && f.about && f.day >= kill.day - 1) susp[f.about] += (f.victim === kill.victim ? 14 : 10) * w;
    if (f.kind === "binned" && f.day === kill.day) susp[f.about] += (f.bloody ? 9 : f.weapon === "bleach" ? 4 : 1.2) * w;
    if (f.kind === "ghost" && f.day >= kill.day) susp[f.about] += (0.5 + 3.5 * trait(ai.id, "superstition")) * w;
    if (f.kind === "talked" && near(f, 6) && f.room !== kRoom.key) { susp[f.about] -= 2 * w; if (susp[f.with] !== undefined) susp[f.with] -= 2 * w; }
    if (f.kind === "watched" && f.day === kill.day && WEAPONS.some((item) => item.id === f.item)) susp[f.about] += 0.45 * w;
    // Feeding things to a fire, bloodied ones above all.
    if (f.kind === "threw" && f.day >= kill.day) susp[f.about] += (f.fire ? (f.bloody ? 10 : f.item === "rope" || f.item === "flashlight" ? 4 : 1.5) : f.bloody ? 3 : 0.3) * w;
    // A full day in each other's sight is an alibi for both.
    if (f.kind === "team" && f.full && f.day === kill.day) {
      const self = f.about === ai.id || f.with === ai.id;
      for (const id of [f.about, f.with]) if (susp[id] !== undefined) susp[id] -= (self ? 30 : 7) * w;
    }
  }
  for (const [id, seen] of Object.entries(ai.witnessedKillers || {})) if (seen.victim === kill.victim && susp[id] !== undefined) susp[id] += 100;
  delete susp[kill.victim];
  for (const s of SUSPECTS) if (!match.chars.get(s.id)?.alive && susp[s.id] !== undefined && s.id !== kill.victim) susp[s.id] -= 4;
  if (selfBlind || ai.id) delete susp[ai.id];
  return { susp, weap, room, kRoom, kWeap };
}

export function argmax(map, allowed) {
  let key = null, best = -Infinity, second = -Infinity;
  for (const [k, v] of Object.entries(map)) {
    if (allowed && !allowed.includes(k)) continue;
    const s = v + Math.random() * 0.01;
    if (s > best) { second = best; best = s; key = k; } else if (s > second) second = s;
  }
  return { key, score: best, margin: best - second };
}

// The triple this AI would accuse right now (optionally limited per slot).
export function accusationFor(match, ai, note, limits = {}) {
  const eyewitness = !ai.isKiller && Object.values(ai.witnessedKillers || {}).filter((f) => match.chars.get(f.about)?.alive).sort((a, b) => a.day - b.day || a.t0 - b.t0).at(-1);
  if (eyewitness) return { p: eyewitness.about, w: eyewitness.weapon, r: eyewitness.room, conf: 1000 };
  const kills = knownKills(match, note);
  const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];
  if (!kills.length) {
    return { p: pickRandom(limits.p || SUSPECTS.map((s) => s.id).filter((id) => id !== ai.id)), w: pickRandom(limits.w || WEAPONS.map((w) => w.id)), r: pickRandom(limits.r || ROOM_LIST.map((r) => r.id)) };
  }
  let best = null;
  for (const k of kills) {
    const j = judgeKill(match, ai, note, k);
    if (ai.isKiller) {
      // Blend in: real weapon and room, but a scapegoat for the person.
      const real = match.kills.find((x) => x.victim === k.victim);
      // Never name yourself or your partner in crime.
      const mates = match.killers || [ai.id];
      for (const id of mates) delete j.susp[id];
      const okP = limits.p?.filter((id) => !mates.includes(id));
      const p = argmax(j.susp, okP?.length ? okP : limits.p);
      const cand = { p: p.key || ai.scapegoat, w: limits.w && !limits.w.includes(real.weapon) ? argmax(j.weap, limits.w).key : real.weapon, r: limits.r && !limits.r.includes(real.room) ? argmax(j.room, limits.r).key : real.room, conf: 1 };
      if (!best) best = cand;
      continue;
    }
    const p = hunch(j.susp, limits.p), w = hunch(j.weap, limits.w), r = hunch(j.room, limits.r);
    const conf = p.margin + w.score * 0.2 + r.score * 0.2;
    if (!best || conf > best.conf) best = { p: p.key, w: w.key, r: r.key, conf };
  }
  return best;
}

// Unsure guests go with a hunch among their top few candidates.
function hunch(map, allowed) {
  const best = argmax(map, allowed);
  if (best.margin > 2.2) return best;
  const top = Object.entries(map).filter(([k]) => !allowed || allowed.includes(k)).sort((a, b) => b[1] - a[1]).slice(0, best.margin > 1 ? 2 : 3);
  const [key, score] = top[Math.floor(Math.random() * top.length)] || [best.key, best.score];
  return { key, score, margin: best.margin };
}

export function bumpTrust(ai, who, d) { ai.trust[who] = ai.witnessedKillers?.[who] ? -6 : clamp((ai.trust[who] || 0) + d, -6, 6); }
export function bumpSocial(ai, who, d) { ai.social[who] = ai.witnessedKillers?.[who] ? 12 : clamp((ai.social[who] || 0) + d, -8, 12); }

// ---------- template lines (AI ↔ AI, overheard, and offline fallback) ----------
export const LINES = {
  open: ["Ah, {n}. A word?", "{n}! Just the person.", "Psst. {n}, over here.", "A moment of your time, {n}?", "You look like you've been busy, {n}."],
  react: ["Hm. Interesting.", "Is that so?", "I'll remember that.", "Curious…", "That's useful, thank you.", "Noted."],
  doubt: ["That's not what I saw.", "Funny — I remember it differently.", "Are you quite sure about that?", "Now that's a lie, and we both know it."],
  deflect: ["I'd rather not say.", "Why do you want to know?", "I've nothing to add.", "Ask someone else."],
  agree: ["I was thinking the same.", "Yes… it fits.", "I'd suspected as much."],
  disagree: ["I doubt that very much.", "Careful who you point at.", "That doesn't add up to me."],
  bye: ["I must be going.", "Watch yourself.", "Let's speak later.", "Keep your eyes open."],
  demo: ["…", "Hmm.", "Did you hear that?", "Lovely house.", "Quite.", "Indeed…", "What was that noise?", "Rather chilly.", "Shall we?", "Oh?", "Mm-hm.", "Fancy that."],
};
export const pick = (list, n = "") => list[Math.floor(Math.random() * list.length)].replace("{n}", n);
