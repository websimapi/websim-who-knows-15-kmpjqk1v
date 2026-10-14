// Soul + Memory files for every guest (npc/<id>/soul.md, npc/<id>/Memory.json).
// The soul's front-matter traits drive AI behaviour; its prose voices the
// guest in conversation. Memory seeds relationships and grows across games
// (persisted locally on top of the shipped file).
import { SUSPECTS, BUTLER, personName } from "./data.js";

const DEFAULT = { observation: 0.7, memory: 0.7, deception: 0.6, stealth: 0.5, boldness: 0.5, sociability: 0.6, curiosity: 0.5, tidiness: 0.5, superstition: 0.5, restlessness: 0.6, skepticism: 0.5, persuasion: 0.5, leave_dc: 4, favorites: [] };
export const SOULS = Object.fromEntries([...SUSPECTS, BUTLER].map((s) => [s.id, { traits: { ...DEFAULT }, prose: s.soul, memory: { relationships: {}, memories: [], matches: [] } }]));
const LS = (id) => `who-knows.memory.${id}`;

function parseSoul(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const traits = { ...DEFAULT };
  if (!m) return { traits, prose: text.trim() };
  for (const line of m[1].split("\n")) {
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    if (!k || !v) continue;
    if (k.trim() === "favorites") traits.favorites = v.split(",").map((x) => x.trim()).filter(Boolean);
    else if (!isNaN(Number(v))) traits[k.trim()] = Number(v);
    else traits[k.trim()] = v;
  }
  return { traits, prose: m[2].replace(/[#*]/g, "").replace(/\n{2,}/g, "\n").trim() };
}

let loaded = null;
export function loadSouls() {
  if (loaded) return loaded;
  loaded = Promise.all([...SUSPECTS, BUTLER].map(async (s) => {
    try {
      const [soul, mem] = await Promise.all([
        fetch(`./npc/${s.id}/soul.md`).then((r) => r.ok ? r.text() : ""),
        fetch(`./npc/${s.id}/Memory.json`).then((r) => r.ok ? r.json() : {}),
      ]);
      if (soul) Object.assign(SOULS[s.id], parseSoul(soul));
      let local = null;
      try { local = JSON.parse(localStorage.getItem(LS(s.id)) || "null"); } catch {}
      SOULS[s.id].memory = mergeMemory(mem || {}, local);
    } catch (e) { console.warn("soul load failed", s.id, e); }
  }));
  return loaded;
}
function mergeMemory(base, local) {
  // Existing browser memories can predate the copper guest's rename.
  const currentName = (value) => typeof value === "string" ? value.replace(/\bOrla Fen\b/g, "Nessa Calder").replace(/\bOrla\b/g, "Nessa") : value;
  const m = { impression: base.impression || "", relationships: { ...(base.relationships || {}) }, memories: [...(base.memories || [])], habits: base.habits || [], matches: [] };
  if (local) {
    for (const [k, r] of Object.entries(local.relationships || {})) {
      const b = m.relationships[k] || { trust: 0, social: 0, note: "" };
      m.relationships[k] = { trust: (b.trust || 0) + (r.trust || 0), social: (b.social || 0) + (r.social || 0), note: currentName(r.note || b.note) };
    }
    m.memories.push(...(local.memories || []).slice(-6).map(currentName));
    m.matches = (local.matches || []).slice(-10);
  }
  return m;
}

export const trait = (id, k) => SOULS[id]?.traits?.[k] ?? DEFAULT[k];
export function soulLine(id, kind, name = "") {
  const line = SOULS[id]?.traits?.[kind];
  return typeof line === "string" ? line.replaceAll("{name}", name) : null;
}

// Starting trust/social for an AI guest, from its memory.
export function seedRelations(id) {
  const rel = SOULS[id]?.memory?.relationships || {};
  const trust = {}, social = {};
  for (const [k, r] of Object.entries(rel)) { trust[k] = r.trust || 0; social[k] = r.social || 0; }
  return { trust, social };
}

// After a match each guest remembers how it went.
export function rememberMatch({ killer, winner, kills, day }) {
  for (const s of SUSPECTS) {
    let local = {};
    try { local = JSON.parse(localStorage.getItem(LS(s.id)) || "{}"); } catch {}
    local.relationships ||= {}; local.memories ||= []; local.matches ||= [];
    if (s.id !== killer) {
      const r = (local.relationships[killer] ||= { trust: 0, social: 0 });
      r.trust = Math.max(-3, (r.trust || 0) - 0.6);
      r.social = Math.min(3, (r.social || 0) + 0.4);
      r.note = `${personName(killer)} was the killer once${winner === "killer" ? " — and got away with it" : ""}.`;
      const victims = kills.map((k) => k.victim);
      local.memories.push(victims.includes(s.id) ? `Was murdered by ${personName(killer)} on night ${kills.find((k) => k.victim === s.id)?.day}.` : `Survived a night at the mansion; ${personName(killer)} was the killer.`);
    } else local.memories.push(winner === "killer" ? "Got away with murder at the mansion." : "Was caught at the accusation table.");
    local.memories = local.memories.slice(-6);
    local.matches.push({ killer, winner, day, at: Date.now() });
    local.matches = local.matches.slice(-10);
    try { localStorage.setItem(LS(s.id), JSON.stringify(local)); } catch {}
    SOULS[s.id].memory = mergeMemory({ ...SOULS[s.id].memory, matches: [] }, null);
    SOULS[s.id].memory.memories.push(local.memories[local.memories.length - 1]);
  }
}
export function soulPrompt(id) {
  const s = SOULS[id];
  if (!s) return "";
  const mem = s.memory || {};
  const rel = Object.entries(mem.relationships || {}).map(([k, r]) => `${personName(k)}: ${r.note || ""}`).join("; ");
  return `${s.prose}\nMemories: ${(mem.memories || []).slice(-4).join(" ")}\nOpinions: ${rel}`;
}

// Speech guidance is deliberately separate from biography. Backstory is not
// evidence from the current round, and feeding it into every rewrite caused
// guests to mention old clocks, weather, letters and tools out of nowhere.
const SPEECH_GUIDES = {
  red: "Mara is attentive and exact. She repeats a telling word, asks one clear question, and grows quiet and precise when angry.",
  blue: "Tomas sounds easy and genuinely interested. He asks short follow-up questions; when cornered, his smooth phrasing breaks and he starts again.",
  green: "Sera is direct and practical, with brief dry humor. She asks for a concrete route or position and readily admits what she did not see.",
  yellow: "Ivo uses compact, careful sentences and ordinary words. He separates what he knows from an estimate, with a dry wit when relaxed.",
  violet: "Leonie notices angles and visible details. She speaks in short, thoughtful phrases, catches her own overreach, and asks to check another view.",
  teal: "Basil is gentle and patient. He pauses before disagreeing, asks what someone heard directly, and marks uncertain sounds as uncertain.",
  white: "Elian is plainspoken and gentle. He asks permission, avoids dramatic conclusions, and checks the order of events before judging.",
  copper: "Nessa is brisk and direct, quick to laugh at pretension. She works through practical steps aloud and challenges vague words.",
  butler: "Grimsby is formally polite, unhurried and dry. He gives even an evasive answer with smooth certainty.",
};
export const speechGuide = (id) => SPEECH_GUIDES[id] || "Speak naturally, with a distinct but restrained manner.";
