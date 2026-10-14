// Spontaneous blinks: independent schedules, fast closure and slower reopening.
const random = (a, b) => a + Math.random() * (b - a);
const ease = x => x * x * (3 - 2 * x);
export class BlinkMotion {
  constructor(model) {
    this.lids = []; this.completed = 0; this.value = 0;
    model.traverse(mesh => {
      const names = mesh.morphTargetDictionary;
      if (!names || !mesh.morphTargetInfluences) return;
      for (const name of ['BlinkLeft', 'BlinkRight'])
        if (names[name] !== undefined) this.lids.push([mesh, names[name]]);
    });
    this.rate = random(16, 20); this.wait = random(.8, 4.5); this.elapsed = null;
  }
  interval(conversing) {
    const mean = 60 / (conversing ? this.rate + 6 : this.rate);
    // A bounded bell-shaped interval avoids both clockwork and long vacant stares.
    return mean * (.45 + (Math.random() + Math.random() + Math.random()) * .37);
  }
  trigger() {
    if (!this.lids.length || this.elapsed !== null) return;
    this.elapsed = 0; this.close = random(.055, .080);
    this.hold = random(.012, .025); this.open = random(.115, .170);
    this.double = Math.random() < .045;
  }
  set(value) {
    this.value = value;
    for (const [mesh, index] of this.lids) mesh.morphTargetInfluences[index] = value;
  }
  update(dt, { alive = true, ko = false, conversing = false } = {}) {
    if (!this.lids.length) return;
    if (!alive || ko) { this.elapsed = null; this.set(ko && alive ? 1 : 0); return; }
    if (this.elapsed === null) {
      this.wait -= dt;
      if (this.wait <= 0) this.trigger();
    }
    if (this.elapsed === null) { this.set(0); return; }
    this.elapsed += dt;
    const t = this.elapsed;
    if (t < this.close) this.set(ease(t / this.close));
    else if (t < this.close + this.hold) this.set(1);
    else if (t < this.close + this.hold + this.open)
      this.set(1 - ease((t - this.close - this.hold) / this.open));
    else {
      this.set(0); this.elapsed = null; this.completed++;
      this.wait = this.double ? random(.18, .30) : this.interval(conversing);
    }
  }
}
