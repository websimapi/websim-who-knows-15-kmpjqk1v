// Facts are the currency of every conversation. Each one is a structured
// claim the rules engine can compare; text is only ever derived from it.
import { clockLabel, roomName, personName, weaponName, itemName, SUSPECT_BY_ID } from "./data.js";

// kind: saw (about in room over [t0,t1]) · held (about handled weapon in room)
//       body (about = victim, found in room with weapon) · kill (about killed victim)
//       talked (about talked with `with` in room) · missing (weapon gone from room)
//       tod (time of death estimate, public)
export function factKey(f) {
  switch (f.kind) {
    case "saw": return `saw|${f.about}|${f.room}|${f.day}|${Math.floor(f.t0 / 20)}`;
    case "ran": return `ran|${f.about}|${f.from}|${f.day}|${Math.floor(f.t0 / 8)}`;
    case "held": return `held|${f.about}|${f.weapon}|${f.day}`;
    case "body": return `body|${f.about}|${f.day}`;
    case "kill": return `kill|${f.about}|${f.victim}|${f.day}`;
    case "wound": return `wound|${f.about}|${f.victim}|${f.day}`;
    case "talked": return `talked|${[f.about, f.with].sort().join("+")}|${f.day}|${Math.floor(f.t0 / 30)}`;
    case "missing": return `missing|${f.weapon}|${f.room}|${f.day}`;
    case "tod": return `tod|${f.about}|${f.day}`;
    case "ghost": return `ghost|${f.about}|${f.day}|${Math.floor(f.t0 / 10)}`;
    case "blood": return `blood|${f.room}|${f.day}|${f.hidden ? 1 : 0}`;
    case "bleach": return `bleach|${f.room}|${f.day}`;
    case "cleaning": return `cleaning|${f.about}|${f.room}|${f.day}`;
    case "caught": return `caught|${f.about}|${f.weapon}|${f.bloody ? 1 : 0}|${f.day}`;
    case "binned": return `binned|${f.about}|${f.weapon}|${f.day}`;
    case "knocked": return `knocked|${f.about}|${f.victim}|${f.day}`;
    case "inbin": return `inbin|${f.weapon}|${f.room}|${f.day}|${f.bloody ? 1 : 0}`;
    case "report": return `report|${f.by}|${f.about}|${f.victim}|${f.day}`;
    case "watched": return `watched|${f.about}|${f.item}|${f.room}|${f.day}`;
    case "smell": return `smell|${f.room}|${f.day}|${f.bloody ? 1 : 0}|${f.lingering ? "l" : Math.floor(f.t0 / 25)}`;
    case "burned": return `burned|${f.item}|${f.spot}|${f.day}|${Math.floor(f.t0 / 25)}`;
    case "ashes": return `ashes|${f.spot}|${f.day}|${(f.items || []).join(",")}`;
    case "threw": return `threw|${f.about}|${f.item}|${f.day}|${Math.floor(f.t0 / 4)}`;
    case "dragged": return `dragged|${f.about}|${f.victim}|${f.day}`;
    case "team": return `team|${[f.about, f.with].sort().join("+")}|${f.day}`;
    case "peek": return `peek|${f.entry}|${f.day}`;
    case "peekCaught": return `peekCaught|${f.about}|${f.entry}|${f.day}`;
    default: return `${f.kind}|${JSON.stringify(f)}`;
  }
}

export const short = (id) => SUSPECT_BY_ID[id]?.short || id;
const at = (f) => clockLabel(((f.t0 ?? f.t) + (f.t1 ?? f.t0 ?? f.t)) / 2);

// Plain notebook text (third person, used in the detective sheet).
export function factText(f) {
  switch (f.kind) {
    case "saw": return `${short(f.about)} was in ${roomName(f.room)} around ${at(f)}${f.doing ? `, ${f.doing}` : ""}${f.day ? ` (night ${f.day})` : ""}.`;
    case "ran": return f.to ? `${short(f.about)} ran from ${roomName(f.from)} into ${roomName(f.to)} around ${at(f)}.` : `${short(f.about)} ran ${f.toward ? `${f.toward} ` : ""}through ${roomName(f.from)} around ${at(f)}.`;
    case "peek": return f.people?.length ? `Peeking into ${roomName(f.room)}, I saw ${f.people.map(short).join(" and ")} inside.` : `I peeked into ${roomName(f.room)}; it was empty.`;
    case "peekCaught": return `${short(f.about)} was spotted peeking into ${roomName(f.room)} around ${at(f)}.`;
    case "held": return `${short(f.about)} handled the ${itemName(f.weapon)} in ${roomName(f.room)} around ${at(f)}.`;
    case "body": return f.bleedOut ? `${personName(f.about)} bled to death in ${roomName(f.room)} after a wound from the ${weaponName(f.weapon)}.` : `${personName(f.about)} was found dead in ${roomName(f.room)} beside the ${weaponName(f.weapon)}.`;
    case "kill": return `${short(f.about)} murdered ${short(f.victim)} with the ${weaponName(f.weapon)} in ${roomName(f.room)}!`;
    case "wound": return f.about ? `${short(f.about)} wounded ${short(f.victim)} with the ${weaponName(f.weapon)} in ${roomName(f.room)}.` : `${short(f.victim)} was wounded with the ${weaponName(f.weapon)} in ${roomName(f.room)}; the attacker was not seen.`;
    case "talked": return `${short(f.about)} was talking with ${short(f.with)} in ${roomName(f.room)} around ${at(f)}.`;
    case "missing": return `The ${weaponName(f.weapon)} went missing from ${roomName(f.room)} around ${at(f)}.`;
    case "tod": return `${personName(f.about)} died around ${clockLabel(f.t)} on day ${f.day}.`;
    case "ghost": return `An unseen hand hurled ${f.item ? "a " + f.item : "something"} at ${short(f.about)} in ${roomName(f.room)} around ${at(f)}.`;
    case "blood": return f.hidden ? `The Lens of Truth revealed water-cleaned blood in ${roomName(f.room)} (night ${f.day}).` : `There's blood on the floor in ${roomName(f.room)} (night ${f.day}).`;
    case "bleach": return `A wet trail of bleach in ${roomName(f.room)} — someone has been scrubbing (night ${f.day}).`;
    case "cleaning": return `${short(f.about)} was scrubbing the floor in ${roomName(f.room)} around ${at(f)}.`;
    case "caught": return `${short(f.about)} was carrying ${f.bloody ? "a bloodied " : "a "}${itemName(f.weapon)}${f.searched ? " (found in their pockets)" : ""}.`;
    case "binned": return `${short(f.about)} threw ${f.bloody ? "a bloodied " : "a "}${itemName(f.weapon)} in the bin in ${roomName(f.room)}.`;
    case "knocked": return f.about ? `${short(f.about)} knocked ${short(f.victim)} out cold in the tunnels around ${at(f)}.` : `${short(f.victim)} was knocked out in the tunnels around ${at(f)}.`;
    case "inbin": return `The bin in ${roomName(f.room)} held ${f.bloody ? "a bloodied " : f.wet ? "a bleach-soaked " : "a "}${itemName(f.weapon)}.`;
    case "report": return `${short(f.by)} claims they saw ${short(f.about)} near ${short(f.victim)}'s body in ${roomName(f.room)} (day ${f.day}).`;
    case "watched": return `${short(f.about)} stood looking at the ${itemName(f.item)} in ${roomName(f.room)} around ${at(f)}. This shows interest, not intent.`;
    case "smell": return `${f.lingering ? "The air in" : "Something was burning in"} ${roomName(f.room)}${f.lingering ? " reeked of" : " around " + at(f) + " — it smelled of"} ${f.what}.`;
    case "burned": return `${f.bloody ? "A bloodied " : "The "}${itemName(f.item)} was burning in ${roomName(f.room)} around ${at(f)}.`;
    case "ashes": return `Ashes in ${roomName(f.room)}: ${(f.items || []).map(itemName).join(", ")}${f.bloody ? " — some of it bloodied" : ""}.`;
    case "threw": return `${short(f.about)} threw ${f.bloody ? "a bloodied " : "the "}${itemName(f.item)} ${f.where} around ${at(f)}.`;
    case "dragged": return `${short(f.about)} was dragging ${short(f.victim)}'s body in ${roomName(f.room)}.`;
    case "team": return `${short(f.about)} and ${short(f.with)} stuck together on day ${f.day}${f.full ? " — never out of each other's sight" : f.broken ? ", but lost sight of each other" : ""}.`;
    default: return "Something odd.";
  }
}

// First-person spoken claim from `speaker` to someone else.
// What a guest can honestly say about a notebook fact. Only things they saw
// themselves are told as "I saw"; anything told to them or overheard is
// passed on as hearsay naming its source, and a faint glimpse is hedged.
export function claimLine(f, speaker) {
  const src = f.src;
  if (src && src !== "self" && src !== "public") {
    const [how, who] = String(src).split(":");
    if (who === speaker) return firstHand(f, speaker);
    const said = lowerFirst(factText(f)).replace(/\.$/, "");
    return how === "overheard" ? `I overheard ${short(who)} say that ${said}.` : `${short(who)} told me that ${said}.`;
  }
  if (f.kind === "saw" && f.about !== speaker && (f.clear ?? 1) < 0.4) return `I only caught a glimpse, but I think I saw ${short(f.about)} in ${roomName(f.room)} around ${at(f)}.`;
  return firstHand(f, speaker);
}
const lowerFirst = (t) => (/^(The|A|An|Someone|Somebody|Nobody) /.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
function firstHand(f, speaker) {
  const me = (id) => id === speaker;
  switch (f.kind) {
    case "saw": return me(f.about) ? `I was in ${roomName(f.room)} around ${at(f)}.` : `I saw ${short(f.about)} in ${roomName(f.room)} around ${at(f)}${f.doing ? `, ${f.doing}` : ""}.`;
    case "ran": return f.to ? `I saw ${short(f.about)} run from ${roomName(f.from)} into ${roomName(f.to)} around ${at(f)}.` : `I saw ${short(f.about)} run ${f.toward ? `${f.toward} ` : ""}through ${roomName(f.from)} around ${at(f)}.`;
    case "peek": return factText(f);
    case "peekCaught": return `I saw ${short(f.about)} peeking into ${roomName(f.room)} around ${at(f)}.`;
    case "held": return me(f.about) ? `I handled the ${itemName(f.weapon)} in ${roomName(f.room)} myself.` : `${short(f.about)} had the ${itemName(f.weapon)} in ${roomName(f.room)} around ${at(f)}.`;
    case "body": return f.bleedOut ? `${short(f.about)} bled to death in ${roomName(f.room)} after a ${weaponName(f.weapon)} wound.` : `${short(f.about)} was lying dead in ${roomName(f.room)}, the ${weaponName(f.weapon)} right beside them.`;
    case "kill": return `I saw it with my own eyes: ${short(f.about)} killed ${short(f.victim)} with the ${weaponName(f.weapon)}!`;
    case "wound": return me(f.victim) ? f.about ? `${short(f.about)} wounded me with the ${weaponName(f.weapon)}!` : `I was wounded with the ${weaponName(f.weapon)}, but I didn't see who struck.` : `I saw ${short(f.about)} wound ${short(f.victim)} with the ${weaponName(f.weapon)}.`;
    case "talked": return me(f.about) || me(f.with) ? `I was talking with ${short(me(f.about) ? f.with : f.about)} in ${roomName(f.room)} around ${at(f)}.` : `${short(f.about)} and ${short(f.with)} were chatting in ${roomName(f.room)} around ${at(f)}.`;
    case "missing": return `The ${weaponName(f.weapon)} vanished from ${roomName(f.room)} around ${at(f)}.`;
    case "tod": return `${short(f.about)} died around ${clockLabel(f.t)}.`;
    case "blood": return f.hidden ? `With the Lens of Truth I found blood someone cleaned with water in ${roomName(f.room)}.` : `There's blood on the floor in ${roomName(f.room)}!`;
    case "bleach": return `Someone's been pouring bleach in ${roomName(f.room)} — the floor's still wet.`;
    case "cleaning": return me(f.about) ? `I was only tidying up in ${roomName(f.room)}.` : `I saw ${short(f.about)} scrubbing the floor in ${roomName(f.room)} around ${at(f)}.`;
    case "caught": return me(f.about) ? `I happened to pick up a ${itemName(f.weapon)}, that's all.` : `${short(f.about)} had ${f.bloody ? "a bloodied " : "a "}${itemName(f.weapon)}${f.searched ? " stuffed in their pocket" : " in hand"}.`;
    case "knocked": return me(f.victim) ? (f.about ? `${short(f.about)} knocked me out cold down in the tunnels!` : "Someone knocked me out cold down in the tunnels!") : me(f.about) ? `${short(f.victim)} took a nasty fall in the tunnels.` : f.about ? `I saw ${short(f.about)} knock ${short(f.victim)} senseless in the tunnels!` : `I found ${short(f.victim)} out cold in the tunnels.`;
    case "binned": return me(f.about) ? `I threw out some rubbish in ${roomName(f.room)}.` : `I saw ${short(f.about)} toss ${f.bloody ? "a bloodied " : "a "}${itemName(f.weapon)} into the bin in ${roomName(f.room)}.`;
    case "inbin": return `I looked in the bin in ${roomName(f.room)} — there was ${f.bloody ? "a bloodied " : f.wet ? "a bleach-soaked " : "a "}${itemName(f.weapon)} in it.`;
    case "ghost": return me(f.about) ? `Something invisible threw ${f.item ? "a " + f.item : "an object"} at me in ${roomName(f.room)}!` : `I swear a ghost flung ${f.item ? "a " + f.item : "something"} at ${short(f.about)} in ${roomName(f.room)}.`;
    case "report": return `I saw ${short(f.about)} near ${short(f.victim)}'s body in ${roomName(f.room)}.`;
    case "watched": return `I saw ${short(f.about)} stand looking at the ${itemName(f.item)} in ${roomName(f.room)}. I cannot say why.`;
    case "smell": return f.bloody ? `${roomName(f.room)} stank of burnt blood — someone burned something awful in there.` : `I smelled ${f.what} in ${roomName(f.room)} around ${at(f)}.`;
    case "burned": return `I saw ${f.bloody ? "a bloodied " : "the "}${itemName(f.item)} burning in ${roomName(f.room)} around ${at(f)}.`;
    case "ashes": return `I sifted the ashes in ${roomName(f.room)} — there was ${(f.items || []).map((k) => `the ${itemName(k)}`).join(" and ")} in there${f.bloody ? ", and blood" : ""}.`;
    case "threw": return me(f.about) ? `I tossed the ${itemName(f.item)} aside in ${roomName(f.room)}, nothing more.` : `I saw ${short(f.about)} throw ${f.bloody ? "a bloodied " : "the "}${itemName(f.item)} ${f.where}.`;
    case "dragged": return me(f.about) ? `I moved ${short(f.victim)}'s body in ${roomName(f.room)}.` : `I saw ${short(f.about)} dragging ${short(f.victim)}'s body in ${roomName(f.room)}.`;
    case "team": return me(f.about) || me(f.with) ? `${short(me(f.about) ? f.with : f.about)} and I stuck together on day ${f.day}${f.full ? " — never out of each other's sight" : ""}.` : `${short(f.about)} and ${short(f.with)} stuck together on day ${f.day}.`;
    default: return "I noticed something odd.";
  }
}

// Interval overlap in seconds.
const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

// Does claim `c` contradict first-hand observation `o`?
export function contradicts(c, o) {
  if (c.day !== o.day) return false;
  if ((c.kind === "saw" || c.kind === "talked") && o.kind === "saw") {
    const people = c.kind === "talked" ? [c.about, c.with] : [c.about];
    if (!people.includes(o.about) || c.room === o.room) return false;
    return overlap(c.t0, c.t1 ?? c.t0, o.t0 - 2, o.t1 + 2) > 0;
  }
  if (c.kind === "held" && o.kind === "held") {
    if (c.weapon !== o.weapon || c.about === o.about) return false;
    return Math.abs(c.t0 - o.t0) < 6;
  }
  if (c.kind === "held" && o.kind === "saw") {
    return c.about === o.about && c.room !== o.room && overlap(c.t0 - 2, c.t0 + 2, o.t0, o.t1) > 0;
  }
  if (c.kind === "body" && o.kind === "body") return c.about === o.about && (c.room !== o.room || c.weapon !== o.weapon);
  if (c.kind === "kill" && o.kind === "kill") return c.victim === o.victim && c.about !== o.about;
  return false;
}

export function cloneFact(f, extra = {}) {
  const { src, lie, ...rest } = f;
  return { ...rest, ...extra };
}
