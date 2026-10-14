// Online realm client: joins a realm in the project's realtime room, sends
// 10 Hz state, interpolates other players ~100 ms in the past, and relays
// chat, trades, theft and server-owned inventory updates.

export class Net {
  constructor() {
    this.room = null;
    this.id = null;
    this.realm = null;
    this.others = new Map(); // id → { info, snaps: [] }
    this.handlers = {};
    this.sendT = 0;
  }
  on(type, fn) { this.handlers[type] = fn; }
  emit(type, ...a) { this.handlers[type]?.(...a); }

  async connect({ realm, password, char, pos }) {
    if (!window.WebsimSocket?.joinRoom) throw new Error("Online play needs the websim runtime.");
    this.room = await window.WebsimSocket.joinRoom();
    this.joinMsg = { type: "join", realm, password, char, x: pos.x, y: pos.y, z: pos.z };
    return new Promise((resolve, reject) => {
      let done = false;
      const timeout = setTimeout(() => { if (!done) reject(new Error("The realm server did not answer.")); }, 10000);
      this.room.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === "hello") { this.id = m.id; this.joinSent = true; this.room.send(this.joinMsg); return; }
        if (m.type === "denied") { clearTimeout(timeout); if (!done) { done = true; const e = new Error(m.reason); e.needPassword = m.needPassword; reject(e); } else this.emit("closed", m.reason); return; }
        if (m.type === "joined") {
          clearTimeout(timeout);
          this.realm = m.realm;
          for (const p of m.members) this.addOther(p);
          if (!done) { done = true; resolve(m); } else this.emit("rejoined", m);
          return;
        }
        if (m.realm && m.realm !== this.realm?.id) return;
        switch (m.type) {
          case "member": if (m.player.id !== this.id) this.addOther(m.player); break;
          case "left": { const o = this.others.get(m.id); if (o) { this.others.delete(m.id); this.emit("left", o); } break; }
          case "snap":
            for (const s of m.players) {
              if (s.id === this.id) continue;
              const o = this.others.get(s.id);
              if (!o) continue;
              o.snaps.push({ ...s, t: performance.now() });
              if (o.snaps.length > 4) o.snaps.shift();
            }
            break;
          case "event": { const o = this.others.get(m.from); if (o) this.emit("event", o, m.e); break; }
          default: this.emit(m.type, m);
        }
      };
      this.room.onreconnect = () => { this.others.forEach((o) => this.emit("left", o)); this.others.clear(); this.room.send(this.joinMsg); };
      this.room.onclose = (e) => this.emit("closed", e?.reason);
      setTimeout(() => { if (!this.realm && !this.joinSent) { this.joinSent = true; this.room.send(this.joinMsg); } }, 1500);
    });
  }
  addOther(info) {
    if (this.others.has(info.id)) { this.others.get(info.id).info = info; this.emit("update", this.others.get(info.id)); return; }
    const o = { info, snaps: [{ x: info.x, y: info.y, z: info.z, yaw: 0, hp: 1, maxHp: 1, s: 0, M: 0, ride: info.ride || null, t: performance.now() }] };
    this.others.set(info.id, o);
    this.emit("joined", o);
  }
  update(dt, me, extra = {}) {
    if (!this.realm) return;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.1;
      this.room.send({ type: "state", x: me.pos.x, y: me.pos.y, z: me.pos.z, yaw: me.yaw, hp: me.hp, maxHp: me.stats.maxHp, speed: me.moving || 0, M: me.M, downed: me.downed, teleport: me._teleport, ...extra });
      me._teleport = false;
    }
  }
  send(msg) { if (this.realm) this.room.send(msg); }
  event(e) { this.send({ type: "event", e }); }
  close() { try { this.room?.close?.(); } catch {} this.realm = null; }
  // interpolated state 100 ms in the past
  sample(o) {
    const t = performance.now() - 100;
    const s = o.snaps;
    if (s.length === 1) return s[0];
    for (let i = s.length - 2; i >= 0; i--) {
      if (s[i].t <= t) {
        const a = s[i], b = s[i + 1], k = Math.min(1, (t - a.t) / Math.max(1, b.t - a.t));
        let dy = b.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        return { ...b, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + dy * k };
      }
    }
    return s[0];
  }
}
