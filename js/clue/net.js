// Online client: lobby management and host/guest relay over the realtime room.
export class Net {
  constructor() { this.room = null; this.connecting = null; this.id = null; this.handlers = {}; this.listeners = new Map(); this.lobby = null; this.lastStartedKey = null; this.sessionId = crypto.randomUUID(); this.startTimer = null; this.requestTimer = null; this.pendingRequest = null; this.matchSent = new Set(); this.matchReceived = new Set(); this.pendingMatch = []; this.inRound = false; this.recovering = false; this.recoveryTimer = null; }
  on(type, fn) { this.handlers[type] = fn; }
  subscribe(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); if (type === "relay" && this.pendingMatch.length) { const pending = this.pendingMatch.splice(0); queueMicrotask(() => { if (this.listeners.get(type)?.has(fn)) for (const packet of pending) if (!packet.code || packet.code === this.lobby?.code && (!packet.round || packet.round === this.lobby?.round)) fn(packet); }); } return () => this.listeners.get(type)?.delete(fn); }
  emit(type, ...a) { this.handlers[type]?.(...a); for (const fn of this.listeners.get(type) || []) fn(...a); }
  receiveMatch(packet, transport) {
    if (packet.code && this.lobby?.code && packet.code !== this.lobby.code) return;
    if (packet.round && this.lobby?.round && packet.round < this.lobby.round) return;
    if (["seat", "snap", "ready"].includes(packet.data?.k) && !this.matchReceived.has(packet.data.k)) {
      this.matchReceived.add(packet.data.k);
      this.log("match-received", { kind: packet.data.k, from: packet.from, code: packet.code || this.lobby?.code, seq: packet.data.s?.seq, transport, listeners: this.listeners.get("relay")?.size || 0 });
    }
    if (!this.listeners.get("relay")?.size || packet.round && packet.round !== this.lobby?.round) {
      this.pendingMatch.push(packet);
      if (this.pendingMatch.length > 8) this.pendingMatch.shift();
    } else this.emit("relay", packet);
  }
  async connect() {
    if (this.id && this.room) return;
    if (this.connecting) return this.connecting;
    if (!window.WebsimSocket?.joinRoom) throw new Error("Online play needs the websim runtime.");
    this.connecting = this.open();
    try { await this.connecting; } finally { this.connecting = null; }
  }
  async open() {
    const room = await window.WebsimSocket.joinRoom();
    this.room = room;
    try { await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("The mansion server did not answer.")), 10000);
      let connected = false;
      room.onmessage = (ev) => {
        if (this.room !== room) return;
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === "hello") { this.id = m.id; this.userId = m.userId; this.username = m.username; this.signedIn = !!m.signedIn; this.send({ type: "session", sessionId: this.sessionId }); if (this.device) this.send({ type: "device", device: this.device }); clearTimeout(t); if (!connected) { connected = true; resolve(); } if (this.recovering) this.send({ type: "resume", sessionId: this.sessionId }); else this.emit("connected"); return; }
        if (m.type === "resumed") { if (!this.recovering) { this.send({ type: "leave" }); return; } this.lobby = m.lobby; this.recovering = false; clearInterval(this.recoveryTimer); this.recoveryTimer = null; this.emit("resumed", m); return; }
        if (m.type === "closed" && this.recovering) return;
        if (m.type === "lobby" && m.matchPacket) { this.receiveMatch({ from: m.matchPacket.sender, data: m.matchPacket.payload, code: m.code, round: m.round }, "broadcast"); return; }
        if (m.type === "wkMatch") { this.receiveMatch(m, "direct"); return; }
        const eventType = m.type === "lobby" && m.lobby?.started ? "started" : m.type;
        if (m.type === "lobby" || m.type === "started" || m.type === "startReset") this.lobby = m.lobby;
        if (m.type === "lobby" && m.lobby?.started) this.emit("lobbyUpdate", m);
        if (m.type === "closed" || m.type === "left") { this.lobby = null; this.pendingMatch.length = 0; }
        if ((m.type === "lobby" || m.type === "started") && this.pendingRequest && (this.pendingRequest.type === "create" || this.pendingRequest.code === m.lobby?.code)) this.clearRequest();
        if (m.type === "error" || m.type === "closed" || m.type === "left") this.clearRequest();
        if (m.type === "error" && this.startTimer) this.log("start-event", { stage: "rejected", message: m.text });
        const startedKey = eventType === "started" ? `${m.lobby?.code}:${m.lobby?.round || 0}` : null;
        if (startedKey && startedKey === this.lastStartedKey) return;
        if (startedKey) this.lastStartedKey = startedKey;
        if (eventType === "started") this.send({ type: "startSeen", round: m.lobby?.round, via: m.type });
        if (eventType === "started") this.log("start-event", { stage: "started", via: m.type, members: m.lobby?.members?.length, killers: m.lobby?.killers });
        if (m.type === "startReset") { this.pendingMatch.length = 0; this.log("start-event", { stage: "reset", reason: m.reason }); }
        if (eventType === "started" || m.type === "error" || m.type === "startReset") { clearTimeout(this.startTimer); this.startTimer = null; }
        this.emit(eventType, m);
      };
      room.onreconnect = () => { if (this.room !== room) return; this.log("socket-reconnected"); this.emit("disconnect"); if (this.inRound) this.startRecovery(); else if (this.lobby) { this.lobby = null; this.emit("closed", { reason: "The lobby connection was lost." }); } };
      room.onclose = (e) => { if (this.room !== room) return; const reason = e?.reason || "Disconnected."; this.log("socket-closed", { reason }); this.clearRequest(); clearTimeout(this.startTimer); this.startTimer = null; this.id = null; this.userId = null; this.room = null; if (!connected) { clearTimeout(t); reject(new Error(reason)); } this.emit("disconnect"); if (this.inRound) this.startRecovery(); else if (this.lobby) { this.lobby = null; this.emit("closed", { reason }); } };
    }); this.updateDevice(); } catch (e) { if (this.room === room) { this.room = null; this.id = null; } throw e; }
  }
  startRecovery() {
    if (this.recovering) return;
    this.recovering = true;
    this.clearRequest();
    clearTimeout(this.startTimer); this.startTimer = null;
    this.emit("recovering");
    const deadline = Date.now() + 15000;
    const retry = () => {
      if (!this.recovering) return;
      if (Date.now() >= deadline) {
        this.recovering = false;
        clearInterval(this.recoveryTimer); this.recoveryTimer = null;
        this.inRound = false; this.lobby = null; this.lastStartedKey = null;
        this.pendingMatch.length = 0;
        this.emit("closed", { reason: "Could not reconnect to the mansion." });
        return;
      }
      if (!this.room && !this.connecting) this.connect().catch(() => {});
      else if (this.id) this.send({ type: "resume", sessionId: this.sessionId });
    };
    retry();
    this.recoveryTimer = setInterval(retry, 1000);
  }
  cancelRecovery() {
    this.recovering = false;
    clearInterval(this.recoveryTimer);
    this.recoveryTimer = null;
  }
  updateDevice(virtualReality = false) {
    const mobile = navigator.userAgentData?.mobile || (matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches);
    this.device = virtualReality ? "vr" : mobile ? "mobile" : "desktop";
    this.send({ type: "device", device: this.device });
  }
  send(m) { if (!this.room || !this.id) return false; try { this.room.send(m); if (m.type === "wkMatch" && ["seat", "snap"].includes(m.data?.k) && !this.matchSent.has(m.data.k)) { this.matchSent.add(m.data.k); this.log("match-sent", { kind: m.data.k, to: m.to, seq: m.data.s?.seq, bytes: JSON.stringify(m).length }); } return true; } catch (error) { this.log("game-failed", { stage: "send", message: String(error?.message || error), type: m.type }); return false; } }
  clearRequest() { clearTimeout(this.requestTimer); this.requestTimer = null; this.pendingRequest = null; }
  request(type, code = null) {
    if (!this.room || !this.id) { this.emit("error", { type: "error", text: "Connection to the mansion was lost. Open Online again." }); return; }
    this.clearRequest();
    const request = { type, code, attempts: 0 };
    this.pendingRequest = request;
    const attempt = () => {
      if (this.pendingRequest !== request) return;
      if (request.attempts === 2) this.send({ type: "sync" });
      else if (request.attempts < 2) this.send({ type, ...(code ? { code } : {}) });
      else {
        this.log("lobby-request-timeout", { type, code });
        this.clearRequest();
        this.emit("error", { type: "error", text: "The mansion did not respond. Try again." });
        return;
      }
      request.attempts++;
      this.requestTimer = setTimeout(attempt, 3000);
    };
    attempt();
  }
  log(event, details = {}) {
    if (!this.signedIn) return;
    fetch("/api/session-log", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ event, details, lobbyCode: this.lobby?.code, connectionId: this.id, sessionId: this.sessionId }) })
      .then((response) => { if (!response.ok) console.warn("Session log request failed:", response.status); })
      .catch((error) => console.warn("Session log request failed", error));
  }
  list() { this.send({ type: "list" }); }
  sync() { this.send({ type: "sync" }); }
  live() { this.send({ type: "live" }); }
  spectate(code) { this.send({ type: "spectate", code }); }
  stopSpectate() { this.send({ type: "stopSpectate" }); }
  create() { this.log("lobby-create-click"); this.request("create"); }
  join(code) { const normalized = String(code || "").toUpperCase().trim(); if (!/^[A-HJ-NP-Z2-9]{4}$/.test(normalized)) { this.emit("error", { type: "error", text: "Enter a four-character mansion code." }); return; } this.log("lobby-join-click", { code: normalized }); this.request("join", normalized); }
  pick(char) { this.log("character-pick-click", { char }); this.send({ type: "pick", char }); }
  start() {
    this.log("start-click", { members: this.lobby?.members?.length, chars: this.lobby?.members?.map((m) => m.char) });
    clearTimeout(this.startTimer);
    if (!this.send({ type: "start" })) { this.emit("error", { type: "error", text: "Connection to the mansion was lost. Open Online again." }); return; }
    this.startTimer = setTimeout(() => { this.send({ type: "sync" }); this.startTimer = setTimeout(() => { this.startTimer = null; this.log("start-timeout", { reason: this.room ? "no-server-response" : "not-connected" }); this.emit("startTimeout"); }, 4000); }, 3000);
  }
  ready() { this.send({ type: "ready" }); }
  startupFailed(reason) {
    const detail = String(reason || "unknown").slice(0, 800);
    this.log("game-failed", { stage: "initialize", reason: detail });
    this.send({ type: "startupFailed", reason: detail.slice(0, 300) });
  }
  settings(killers) { this.send({ type: "settings", killers }); }
  leave() { this.send({ type: "leave" }); }
  toHost(data) { return this.send({ type: "wkMatch", to: "host", data }); }
  toAll(data) { return this.send({ type: "wkMatch", to: "all", data }); }
  to(id, data) { return this.send({ type: "wkMatch", to: id, data }); }
  ackSnapshot(seq) { this.send({ type: "matchAck", kind: "snap", seq }); }
  ackRole() { this.send({ type: "matchAck", kind: "role" }); }
  get isHost() { return this.lobby?.host === this.id; }
}
