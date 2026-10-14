// Mercy–Cruelty track, deeds with anti-farming, renown and local reputation.
import { DEEDS, MORAL_STAGES, RENOWN_TITLES } from "./data.js";

export class Morality {
  constructor(state = {}) {
    this.M = state.M ?? 0;
    this.renown = state.renown ?? 0;
    this.rep = state.rep ?? { marrowgate: 0, brightwell: 0, compact: 0 };
    this.done = state.done ?? {};       // deed:target → true
    this.repeats = state.repeats ?? {}; // deed → {n, day}
    this.balancedT = state.balancedT ?? 0;
    this.history = state.history ?? [];
  }
  toJSON() { return { M: this.M, renown: this.renown, rep: this.rep, done: this.done, repeats: this.repeats, balancedT: this.balancedT, history: this.history.slice(-30) }; }

  get stage() { return MORAL_STAGES.find((s) => this.M >= s.min && this.M <= s.max) || MORAL_STAGES[3]; }
  get title() { let t = RENOWN_TITLES[0][1]; for (const [v, n] of RENOWN_TITLES) if (this.renown >= v) t = n; return t; }
  get balanced() { return this.balancedT > 600 && Math.abs(this.M) <= 5; }

  // Returns the applied ΔM (0 if blocked by anti-farming).
  apply(key, target = "", day = 0) {
    const d = DEEDS[key];
    if (!d) return 0;
    const id = key + ":" + target;
    if (target && this.done[id]) return 0;
    this.done[id] = true;
    const rp = this.repeats[key];
    let k = 1;
    if (rp && rp.day === day) { rp.n++; k = Math.pow(0.6, rp.n); } else this.repeats[key] = { n: 0, day };
    const dm = Math.round(d.dm * k);
    if (!dm) return 0;
    const before = this.stage.name;
    this.M = Math.max(-100, Math.min(100, this.M + dm));
    this.history.push({ key, dm, t: Date.now() });
    return { dm, name: d.name, stageChanged: before !== this.stage.name ? this.stage.name : null };
  }
  addRep(city, v) { this.rep[city] = Math.max(-100, Math.min(100, (this.rep[city] || 0) + v)); }
  tick(dt) { if (Math.abs(this.M) <= 5) this.balancedT += dt; else this.balancedT = 0; }

  // What NPCs can see: passed to the dialogue model.
  reaction(city, hooded) {
    const s = this.stage.name;
    const look = hooded ? "a hooded stranger" :
      this.M <= -76 ? "curled horns, glowing red eyes, flies circling" :
      this.M <= -46 ? "clear horns and ember-bright eyes" :
      this.M <= -16 ? "small horn nubs breaking the scalp, darkened eyes" :
      this.M >= 76 ? "a bright halo and a shaft of light" :
      this.M >= 46 ? "a solid halo and soft light motes" :
      this.M >= 16 ? "a faint halo ring" : "an ordinary road-worn traveller";
    return { stage: s, M: this.M, renown: this.title, localRep: this.rep[city] || 0, appearance: look };
  }
}
