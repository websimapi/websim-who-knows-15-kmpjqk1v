// Spatial audio: HRTF panners → low-pass → bus → compressor, with staggered
// ray-cast occlusion against the world (terrain + colliders).
const FILES = ["ambience", "death", "dice", "halo", "hit", "hold", "horns", "miss", "spell", "step"];

export class AudioSys {
  constructor({ feeding = false } = {}) {
    this.ctx = null;
    this.files = feeding ? [...FILES, "title-eating"] : FILES;
    this.buffers = {};
    this.sources = [];
    this.world = null;
    this.listener = { x: 0, y: 0, z: 0 };
    this.k = 0;
  }
  async init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    // A game can finish loading after the title click's gesture has expired.
    // Unlock the already loaded buffers on the next real player input.
    const unlock = () => { if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {}); };
    this.unlock = unlock;
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    this.comp = this.ctx.createDynamicsCompressor();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.8;
    this.master.connect(this.comp).connect(this.ctx.destination);
    this.bus = this.ctx.createGain(); this.bus.connect(this.master);
    await Promise.all(this.files.map(async (f) => {
      try { const r = await fetch(`./sfx/${f}.wav`); this.buffers[f] = await this.ctx.decodeAudioData(await r.arrayBuffer()); } catch {}
    }));
  }
  ambience(on) {
    if (!this.ctx || !this.buffers.ambience) return;
    if (on && !this.amb) {
      const s = this.ctx.createBufferSource(); s.buffer = this.buffers.ambience; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0.35;
      s.connect(g).connect(this.master); s.start();
      this.amb = { s, g };
    } else if (!on && this.amb) { this.amb.s.stop(); this.amb = null; }
  }
  setAmbienceLevel(v) { if (this.amb) this.amb.g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.5); }
  // 2D UI sound
  ui(name, vol = 0.6) {
    if (!this.ctx || !this.buffers[name]) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.buffers[name];
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g).connect(this.master); s.start();
  }
  // positional sound
  play(name, pos, { vol = 1, rate = 1, loop = false } = {}) {
    if (!this.ctx || !this.buffers[name] || !pos) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.buffers[name]; s.loop = loop; s.playbackRate.value = loop ? rate : rate * (0.94 + Math.random() * 0.12);
    const p = ctx.createPanner();
    p.panningModel = "HRTF"; p.distanceModel = "inverse"; p.refDistance = 3; p.rolloffFactor = 1.2; p.maxDistance = 120;
    p.positionX.value = pos.x; p.positionY.value = pos.y + 1; p.positionZ.value = pos.z;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 18000;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(lp).connect(p).connect(g).connect(this.bus);
    const src = { s, p, lp, g, vol, pos: { x: pos.x, y: pos.y + 1, z: pos.z }, occ: null };
    this.occlude(src, true);
    this.sources.push(src);
    s.onended = () => { const i = this.sources.indexOf(src); if (i >= 0) this.sources.splice(i, 1); };
    s.start();
    let stopped = false;
    return { stop: () => {
      if (stopped) return;
      stopped = true;
      g.gain.setTargetAtTime(0, ctx.currentTime, .05);
      s.stop(ctx.currentTime + .25);
    } };
  }
  occlude(src, immediate) {
    if (!this.world) return;
    const L = this.listener;
    const a = { x: L.x, y: L.y, z: L.z, distanceTo(b) { return Math.hypot(b.x - this.x, b.y - this.y, b.z - this.z); } };
    const blocked = !this.world.los(a, src.pos, 1.2);
    if (blocked === src.occ) return;
    src.occ = blocked;
    const t = this.ctx.currentTime;
    const f = blocked ? 900 : 18000, gv = src.vol * (blocked ? 0.5 : 1);
    if (immediate) { src.lp.frequency.value = f; src.g.gain.value = gv; }
    else { src.lp.frequency.setTargetAtTime(f, t, 0.08); src.g.gain.setTargetAtTime(gv, t, 0.08); }
  }
  update(camera, focus) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = focus || camera.position;
    this.listener = { x: p.x, y: p.y + 1.6, z: p.z };
    const fwd = camera.getWorldDirection(this._v || (this._v = camera.position.clone()));
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y + 1.6; l.positionZ.value = p.z;
      l.forwardX.value = fwd.x; l.forwardY.value = 0; l.forwardZ.value = fwd.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(p.x, p.y + 1.6, p.z); l.setOrientation(fwd.x, 0, fwd.z, 0, 1, 0); }
    // staggered occlusion: a couple of sources per frame
    for (let i = 0; i < Math.min(2, this.sources.length); i++) {
      this.k = (this.k + 1) % this.sources.length;
      this.occlude(this.sources[this.k]);
    }
  }
  dispose() {
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("keydown", this.unlock);
    this.amb?.s.stop(); this.amb = null;
    for (const src of this.sources) { try { src.s.stop(); } catch {} }
    this.sources.length = 0;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
