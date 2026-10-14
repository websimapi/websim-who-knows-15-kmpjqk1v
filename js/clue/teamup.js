// Sticking together. After a first exchange a guest may propose teaming up
// for the rest of the day. The proposal is rolled; a failed roll means the
// other guest's own soul declines. Against a human a successful roll still
// needs their yes. A pair that stays in sight all day earns trust and an
// alibi for each other, which feeds the accusation.
import { trait, soulLine } from "./souls.js";
import { bumpTrust } from "./ai.js";
import { short } from "./facts.js";
import { TASK_BY_ID } from "./tasks.js";

const LOST_GRACE = 8; // seconds out of sight before a team-up breaks
const rand = (a, b) => a + Math.random() * (b - a);
const choice = (l) => l[Math.floor(Math.random() * l.length)];
const pairKey = (a, b) => [a, b].sort().join("+");

export const TeamMethods = {
  teamFor(c) { return c.team && this.teams?.get(pairKey(c.id, c.team)); },

  // Should a "team up" choice appear for `me` in this conversation?
  canOfferTeam(me, them, cv) {
    if (this.phase !== "day" || !me.alive || !them.alive || me.team || them.team) return false;
    if (cv.turns < 1 || cv.teamOffer || cv.teamTried?.[me.id]) return false;
    // Rolled once per conversation so the menu doesn't flicker between turns.
    cv.teamRng ||= {};
    cv.teamRng[me.id] ??= Math.random() < 0.3 + trait(me.id, "sociability") * 0.35 + (this.day > 1 ? 0.1 : 0);
    return cv.teamRng[me.id];
  },
  teamOption(me) {
    return { tag: "team", text: soulLine(me.id, "teamOffer") || "Let's stick together for the rest of the day.", tone: "warm", kind: "Team up" };
  },
  // The proposal itself: a persuasion roll against the listener's caution.
  proposeTeam(c, other, cv) {
    (cv.teamTried ||= {})[c.id] = true;
    const dc = Math.round(9 + trait(other.id, "skepticism") * 5 + (other.isKiller && !c.isKiller ? -2 : 0));
    const roll = this.dialogueRoll(c, other, "team", dc);
    if (c.human) this.showDialogueRoll(c, other, "Team up", roll, roll.success ? (other.human ? "They're willing to hear you out." : "They agree to stick with you.") : "They aren't convinced.");
    return roll.success;
  },
  formTeam(a, b) {
    this.teams ||= new Map();
    a.team = b.id; b.team = a.id;
    this.teams.set(pairKey(a.id, b.id), { a: a.id, b: b.id, day: this.day, start: this.t, lost: 0, broken: false });
    for (const [x, y] of [[a, b], [b, a]]) {
      bumpTrust(x, y.id, 0.4);
      if (x.human) this.toSeat(x.id, { type: "team", with: y.id, on: true });
      this.toast(x, `You and ${short(y.id)} are sticking together today. Stay within sight of each other.`);
    }
  },
  breakTeam(t, why) {
    if (t.broken) return;
    t.broken = true;
    for (const [id, other] of [[t.a, t.b], [t.b, t.a]]) {
      const c = this.chars.get(id);
      if (!c) continue;
      c.team = null;
      if (c.human) this.toSeat(id, { type: "team", with: other, on: false });
      if (c.alive) this.toast(c, `${why === "lost" ? `You lost sight of ${short(other)}` : `${short(other)} can't stay with you`} — the team-up is broken.`);
      if (c.alive && !c.human && why === "lost") this.say(c, choice([`Where did ${short(other)} go?`, `${short(other)}? I thought we were keeping together.`]), 3);
    }
  },
  // Every tick: are partners still in sight?
  updateTeams(dt) {
    if (!this.teams || this.phase !== "day") return;
    for (const t of this.teams.values()) {
      if (t.day !== this.day || t.broken) continue;
      const a = this.chars.get(t.a), b = this.chars.get(t.b);
      if (!a?.alive || !b?.alive) { this.breakTeam(t, "gone"); continue; }
      const inSight = (this.sees(a, b) || this.sees(b, a)) && Math.hypot(a.x - b.x, a.z - b.z) < 14;
      t.lost = inSight ? 0 : t.lost + dt;
      if (t.lost > LOST_GRACE) this.breakTeam(t, "lost");
    }
  },
  // AI partners keep the human in sight.
  followPartner(c) {
    const t = this.teamFor(c);
    if (!t || t.broken || c.convo) return false;
    const p = this.chars.get(c.team);
    if (!p?.alive) return false;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d > 3.2 || !this.sees(c, p)) {
      const ang = Math.atan2(c.x - p.x, c.z - p.z);
      this.goTo(c, p.x + Math.sin(ang) * 1.6, p.z + Math.cos(ang) * 1.6, { reach: 1.8, hurry: d > 4, arrive: () => { c.wait = 0.4; } });
      c.wait = 0.6;
      return true;
    }
    // Close enough: do a chore if it's right here, else wait at their side.
    if (!c.isKiller && c.task && !c.task.complete && TASK_BY_ID[c.task.id] && Math.hypot(TASK_BY_ID[c.task.id].x - c.x, TASK_BY_ID[c.task.id].z - c.z) < 3.5 && this.pursueTask(c)) return true;
    c.yaw = Math.atan2(p.x - c.x, p.z - c.z);
    c.wait = rand(0.6, 1.4);
    return true;
  },
  // The partner moved on: drop a stale route so the next think re-aims.
  retargetFollow(c) {
    const p = this.chars.get(c.team), end = c.path?.[c.path.length - 1];
    if (!p || !end || this.teamFor(c)?.broken) return;
    if (Math.hypot(end.x - p.x, end.z - p.z) > 2.2) { c.path = null; c.plan = null; c.wait = 0; }
  },
  // End of day: the pair's record becomes an alibi (or the lack of one).
  settleTeams() {
    if (!this.teams) return;
    for (const [key, t] of this.teams) {
      if (t.settled) continue;
      t.settled = true;
      const a = this.chars.get(t.a), b = this.chars.get(t.b);
      const full = !t.broken && a?.alive && b?.alive;
      const fact = { kind: "team", about: t.a, with: t.b, day: t.day, t0: Math.round(t.start), t1: Math.round(this.t), full: !!full, broken: !full };
      for (const c of [a, b]) {
        if (!c) continue;
        if (c.alive) this.learn(c.id, fact, "self");
        c.team = null;
        if (c.human) this.toSeat(c.id, { type: "team", with: c.id === t.a ? t.b : t.a, on: false });
      }
      if (full) {
        bumpTrust(a, b.id, 1.5); bumpTrust(b, a.id, 1.5);
        for (const c of [a, b]) this.toast(c, `You and ${short(c === a ? b.id : a.id)} stayed in each other's sight all day — an alibi for you both, and more trust.`);
      }
      this.teams.delete(key);
    }
  },
};
