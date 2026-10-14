// Context the dialogue model needs to phrase lines like a real guest would:
// what was actually seen, where everyone stands now, and the speaker's frame
// of mind tonight. Built by the host from match state, never from guesses.
import { roomName, clockLabel, weaponName, itemName } from "./data.js";
import { short } from "./facts.js";
import { TASK_BY_ID } from "./tasks.js";

// A fresh frame of mind each match keeps the same guest from sounding
// identical across playthroughs.
export const TEMPERS = [
  "rattled and talking a little too fast", "tired and blunt", "wry, covering nerves with dry humor", "unusually chatty, over-explaining",
  "guarded, choosing every word", "irritable after a long night", "quietly frightened but trying to sound calm", "sharp and impatient",
  "distracted, half-listening to the house", "warm and conspiratorial", "formal and stiff", "restless, eager to be moving",
];
export const pickTemper = () => TEMPERS[Math.floor(Math.random() * TEMPERS.length)];

const ago = (match, f) => {
  if (f.day !== match.day) return f.day < match.day ? "on an earlier day" : "";
  const mins = Math.round((match.t - ((f.t0 ?? f.t) + (f.t1 ?? f.t0 ?? f.t)) / 2) * 2); // one second is two in-world minutes
  return mins < 8 ? "just moments ago" : mins < 40 ? "a little while ago" : "earlier tonight";
};

// Engine-true detail behind one option. The model may use it for color.
export function optionHint(match, me, them, opt, fact) {
  if (opt.tag === "share" || opt.tag === "lie") {
    if (!fact) return "";
    if (opt.tag === "lie") return "this claim is deliberately invented; sound convincing, but do not frame it as something someone told you";
    const when = ago(match, fact);
    if (fact.kind === "saw" && fact.about === me.id) {
      const task = me.task && TASK_BY_ID[me.task.id];
      const working = task && task.room === fact.room && (me.workProgress?.[task.id] || me.task.complete);
      return [`you were there yourself, ${when}`, working ? `you were doing your chore: ${task.title.toLowerCase()}` : "you were not doing anything notable — just passing time"].join("; ");
    }
    if (fact.kind === "saw") return [`you saw this ${fact.src === "self" ? "with your own eyes" : "second-hand (someone told you)"}, ${when}`, fact.doing ? `${short(fact.about)} was ${fact.doing}` : ""].filter(Boolean).join("; ");
    if (fact.kind === "ran") return `you saw ${short(fact.about)} running ${when}; mention only the route you actually witnessed`;
    if (fact.kind === "held") return `you saw it ${when}; it might be innocent handling`;
    if (fact.kind === "body" || fact.kind === "kill") return "this is grave — say it with weight";
    if (fact.kind === "watched") return `${short(fact.about)} lingered looking at the ${itemName(fact.item)}; interest is not guilt`;
    return when;
  }
  if (opt.tag === "ask") {
    if (opt.look) return `you saw ${short(them.id)} ${opt.look}; ask what they were doing without claiming a motive`;
    const t = opt.topic || {};
    if (t.kind === "room") return `you want to know who went in or out of ${roomName(t.id)} — you may ask about sounds, footsteps or who was seen`;
    if (t.kind === "person") return `you are curious where ${short(t.id)} has been and what they were up to`;
    if (t.kind === "where") return "you are pressing them for their whereabouts at the time of a death";
    if (t.kind === "weapon") return `you want to know who has handled the ${weaponName(t.id)}`;
    return "a general, open question about anything odd";
  }
  if (opt.tag === "search") return "you are asking to inspect their pockets; use a reason from this conversation or simple caution";
  if (opt.tag === "bluff") return "this is a false reassurance about your intentions, not a claim that you witnessed an event";
  if (opt.tag === "accuse") return "you are naming a suspect; it is a serious claim";
  if (opt.tag === "end") return "you are excusing yourself from the conversation";
  if (opt.tag === "team") return `you are proposing that you and ${short(them.id)} stick together and keep each other in sight for the rest of today — say why, in your own way, drawing on the conversation so far`;
  if (opt.tag === "teamAccept") return `${short(them.id)} asked to stick together today; you are saying yes`;
  if (opt.tag === "teamDecline") return `${short(them.id)} asked to stick together today; you are politely saying no thank you`;
  return "";
}

// The shared scene both people are standing in right now.
export function sceneContext(match, me, them) {
  const lines = [`Night ${match.day}, ${clockLabel(match.t)}. You and ${short(them.id)} are talking in ${roomName(me.room)}.`];
  const found = match.bodies.filter((b) => b.found);
  if (found.length) lines.push(`Bodies found so far: ${found.map((b) => short(b.victim)).join(", ")}.`);
  else lines.push("No one has been found dead yet today.");
  if (match.overtime) lines.push("The lights are flickering.");
  const task = me.task && TASK_BY_ID[me.task.id];
  if (task) lines.push(`Your chore today: ${task.title.toLowerCase()} in ${roomName(task.room)}${me.task.complete ? " (done)" : " (not done yet)"}.`);
  return lines.join(" ");
}
