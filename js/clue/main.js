// Boot, title cinematic (live online spectating or an AI demo match),
// menus, character select, and the online lobby.
import { SUSPECTS, SUSPECT_BY_ID } from "./data.js";
import { View } from "./view.js";
import { Match } from "./match.js";
import { Game } from "./game.js";
import { Net } from "./net.js";
import { interpolateSnapshot } from "./snapshotInterpolation.js";
import { Focus, portrait } from "./ui.js";
import { beginFrame, read, joinPresses, connectedPads, deviceLabel } from "./input.js";
import { sfx, startAmbience, startGameMusic } from "./audio.js";
import { loadSouls } from "./souls.js";
import { saveGraphics } from "./graphics.js";
import { setupManual } from "./manual.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const screens = ["title", "local", "select", "online", "lobby"];
const touchDevice = matchMedia("(pointer: coarse)").matches || !!navigator.userAgentData?.mobile;
document.body.classList.toggle("touch-capable", touchDevice);
const view = new View($("#stage"));
const manual = setupManual();
let demo = null, game = null, net = null, screen = "title";
let settingsOpen = false;
const menuFocus = new Focus();
let sel = null; // character select state
let lastSettings = null;
let liveCode = null, requestedCode = null, liveSnap = null, liveSeed = null, liveSamples = [], titleNetWired = false;
let lobbyNetWired = false;
let activeMatchCode = null;
let lastLoggedFailure = "";
let lastLoggedFailureAt = 0;

function logClientFailure(stage, detail) {
  const signature = stage + ":" + String(detail.message || detail.reason || "unknown").slice(0, 200);
  const now = Date.now();
  if (signature === lastLoggedFailure && now - lastLoggedFailureAt < 15000) return;
  lastLoggedFailure = signature;
  lastLoggedFailureAt = now;
  net?.log("game-failed", { stage, ...detail });
}
window.addEventListener("error", (event) => {
  if ((!game && screen !== "lobby") || !event.message || event.message === "Script error.") return;
  logClientFailure("runtime", { message: event.message, source: String(event.filename || "").split("/").pop(), line: event.lineno, column: event.colno });
});
window.addEventListener("unhandledrejection", (event) => {
  if (!game && screen !== "lobby") return;
  const reason = String(event.reason?.stack || event.reason?.message || event.reason || "Unknown promise rejection").slice(0, 800);
  logClientFailure("rejection", { reason });
});

function avatar(username, signedIn = true) {
  return signedIn && username !== "guest"
    ? `<img src="https://images.websim.com/avatar/${encodeURIComponent(username)}" alt="${esc(username)}">`
    : `<span aria-hidden="true">?</span>`;
}
const DEVICE_ICONS = { mobile: "📱", desktop: "🖥️", vr: "🥽" };
function deviceIcon(device) {
  const type = Object.hasOwn(DEVICE_ICONS, device) ? device : "desktop";
  return `<span class="device-icon" title="${type === "vr" ? "VR" : type === "mobile" ? "Mobile" : "Desktop"}" aria-label="${type === "vr" ? "VR" : type === "mobile" ? "Mobile" : "Desktop"} player">${DEVICE_ICONS[type]}</span>`;
}
function renderPresence(users = []) {
  $("#titlePresence").innerHTML = users.map((u) =>
    `<span class="avatar-pill" title="${esc(u.username)}" aria-label="${esc(u.username)} is here">${avatar(u.username, u.signedIn)}</span>`
  ).join("");
}
function renderTitleLobbies(list = []) {
  const el = $("#titleLobbies");
  el.innerHTML = list.map((l) => `<button class="avatar-pill" data-code="${esc(l.code)}" title="Join @${esc(l.host)} · ${esc(l.code)}" aria-label="Join ${esc(l.host)}'s lobby">${avatar(l.host)}</button>`).join("");
  el.querySelectorAll("button").forEach((b) => b.onclick = () => net?.join(b.dataset.code));
  if (screen === "title") show("title");
}

function show(name) {
  if (name !== "title") closeGraphics();
  if (name !== "title") manual.close();
  screen = name;
  for (const s of screens) $(`#${s}`).classList.toggle("hidden", s !== name);
  const root = $(`#${name}`);
  if (root) {
    const items = [...root.querySelectorAll("nav.menu button:not([disabled]), .lobbies button, .suspects.small button:not([disabled])")];
    if (name === "title") items.push($("#titleHelpButton"), $("#settingsCog"));
    menuFocus.set(items);
  }
  if (name === "select") renderSelect();
}

function closeGraphics() {
  if (!settingsOpen) return;
  settingsOpen = false;
  $("#settings").classList.add("hidden");
  $("#settingsCog").focus();
}

function openGraphics() {
  const s = view.graphics;
  $("#gfxPreset").value = s.preset;
  $("#gfxResolution").value = s.resolution;
  $("#gfxResolutionValue").value = `${s.resolution}%`;
  $("#gfxShadows").value = s.shadows;
  $("#gfxAdaptive").checked = s.adaptive;
  $("#gfxAtmosphere").checked = s.atmosphere;
  settingsOpen = true;
  $("#settings").classList.remove("hidden");
  $("#gfxPreset").focus();
}

function updateGraphics(presetChanged = false) {
  if (presetChanged) $("#gfxShadows").value = $("#gfxPreset").value === "performance" ? "off" : $("#gfxPreset").value === "balanced" ? "standard" : "high";
  const s = {
    preset: $("#gfxPreset").value,
    resolution: Number($("#gfxResolution").value),
    shadows: $("#gfxShadows").value,
    adaptive: $("#gfxAdaptive").checked,
    atmosphere: $("#gfxAtmosphere").checked,
  };
  $("#gfxResolutionValue").value = `${s.resolution}%`;
  view.applyGraphics(s);
  saveGraphics(s);
}

$("#settingsCog").onclick = openGraphics;
$("#settingsClose").onclick = closeGraphics;
$("#settings").onclick = (event) => { if (event.target.id === "settings") closeGraphics(); };
$("#gfxPreset").onchange = () => updateGraphics(true);
for (const id of ["gfxResolution", "gfxShadows", "gfxAdaptive", "gfxAtmosphere"]) $("#" + id).oninput = () => updateGraphics();
document.addEventListener("keydown", (event) => { if (settingsOpen && event.key === "Escape") { event.preventDefault(); closeGraphics(); } });

// ---------- title demo ----------
function startDemo(restartCamera = false) {
  demo = new Match({ demo: true, io: { broadcast: (m) => { if (m.type === "say") view.bubble(m.id, m.text, m.dur); } } });
  view.resetWorld();
  view.bloodSeen = false;
  view.names = {};
  view.setViews([{ follow: null }]);
  view.views[0].mode = "title";
  if (restartCamera) view.restartTitleCamera();
}
function clearTitleLive(resumeDemo = false) {
  const hadLive = !!liveSnap;
  liveCode = requestedCode = liveSnap = liveSeed = null;
  liveSamples = [];
  $("#liveBadge").classList.add("hidden");
  if (resumeDemo && hadLive && !game) startDemo(true);
}
function stopTitleWatch() {
  net?.stopSpectate();
  clearTitleLive();
}
async function connectTitle() {
  net ||= new Net();
  wireNet();
  if (!titleNetWired) {
    titleNetWired = true;
    net.on("presence", (m) => renderPresence(m.users || []));
    net.on("live", (m) => {
      if (game || net.lobby) return;
      const available = m.list || [];
      if (liveCode && available.some((l) => l.code === liveCode)) return;
      if (requestedCode && available.some((l) => l.code === requestedCode)) return;
      if (!available.length) { clearTitleLive(true); return; }
      requestedCode = available[0].code;
      net.spectate(requestedCode);
    });
    net.on("watching", (m) => { liveCode = m.code; requestedCode = null; });
    net.on("watchSnap", (m) => {
      if (game || !demo || m.code !== liveCode || !m.snap?.chars) return;
      if (!liveSnap) {
        view.resetWorld();
        view.bloodSeen = false;
        view.setViews([{ follow: null }]);
        view.views[0].mode = "title";
        view.restartTitleCamera();
        view.setFlicker(!!m.snap.ot);
        $("#liveBadge").textContent = `● LIVE · ${m.code}`;
        $("#liveBadge").classList.remove("hidden");
        liveSeed = m.snap;
      }
      liveSnap = m.snap;
      liveSamples.push({ s: m.snap, t: performance.now() });
      if (liveSamples.length > 8) liveSamples.shift();
    });
    net.on("watchEvent", (m) => {
      if (game || m.code !== liveCode || !liveSnap || !m.event) return;
      const e = m.event;
      if (e.type === "say") view.bubble(e.id, e.text, e.dur);
      else if (e.type === "flicker") view.setFlicker(!!e.on);
      else if (e.type === "day") { view.clearBodies(e.remainingBodies || e.concealed || []); view.setFlicker(false); }
      else if (e.type === "kill") view.onKill(e);
    });
    net.on("spectateEnded", (m) => {
      if (m.code && m.code !== liveCode && m.code !== requestedCode) return;
      clearTitleLive(true);
      net.live();
    });
    net.on("disconnect", () => { clearTitleLive(true); renderPresence([]); renderTitleLobbies([]); });
  }
  await net.connect();
  net.updateDevice(view.renderer.xr.isPresenting);
  if (!game && !net.lobby) net.live();
}

// ---------- menus ----------
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  sfx("card", 0.4);
  startAmbience();
  startGameMusic();
  if (b.dataset.go === "local") show("local");
  if (b.dataset.go === "online") openOnline();
  if (b.dataset.back) { if (b.dataset.back === "title" && net?.lobby) net.leave(); show(b.dataset.back); }
  if (b.dataset.mode) startSelect(b.dataset.mode);
});

function startSelect(mode) {
  sel = { mode, slots: mode === "solo" ? [{ device: "all", cursor: 0, locked: false }] : [] };
  $("#selTitle").textContent = mode === "solo" ? "Choose your suspect" : "Co-op: each player joins with their own controls";
  show("select");
}
function renderSelect() {
  if (!sel) return;
  const grid = $("#suspects");
  grid.innerHTML = SUSPECTS.map((s, i) => {
    const here = sel.slots.map((sl, k) => (sl.cursor === i ? k : -1)).filter((k) => k >= 0);
    const lockedBy = sel.slots.findIndex((sl) => sl.locked && sl.cursor === i);
    return `<button class="sus ${lockedBy >= 0 ? "locked" : ""}" data-i="${i}" style="--c:${s.color}">
      ${portrait(s.id)}<b>${s.name}</b><small>${s.soul.split(".")[0]}.</small>
      <div class="cursors">${here.map((k) => `<span class="cur p${k + 1}">P${k + 1}${sel.slots[k].locked ? " ✓" : ""}</span>`).join("")}</div></button>`;
  }).join("");
  grid.querySelectorAll(".sus").forEach((b) => b.onclick = () => {
    const slot = sel.slots[0] || (sel.slots[0] = { device: "kb1", cursor: 0, locked: false });
    const i = Number(b.dataset.i);
    if (sel.slots.some((s, k) => k !== 0 && s.locked && s.cursor === i)) return;
    slot.cursor = i; slot.locked = true;
    renderSelect();
  });
  const slotsEl = $("#slots");
  if (sel.mode === "coop") {
    slotsEl.innerHTML = [0, 1].map((k) => {
      const sl = sel.slots[k];
      return `<div class="slot ${sl ? "in" : ""}"><b>Player ${k + 1}</b><span>${sl ? `${touchDevice && sl.device === "kb1" ? "Touch" : deviceLabel(sl.device)} — ${sl.locked ? `${SUSPECT_BY_ID[SUSPECTS[sl.cursor].id].short} ✓` : "choosing…"}` : touchDevice ? (k === 0 ? "Tap a suspect to join" : "Connect a controller and press Ⓐ") : "Press E (WASD), Enter (arrows) or Ⓐ to join"}</span></div>`;
    }).join("");
  } else slotsEl.innerHTML = `<div class="slot in"><b>Solo</b><span>${touchDevice ? "Tap a suspect. " : "Keyboard, mouse or any controller. "}${sel.slots[0].locked ? "Ready ✓" : touchDevice ? "" : "Pick with ←/→ and confirm."}</span></div>`;
  const ready = sel.slots.length === (sel.mode === "coop" ? 2 : 1) && sel.slots.every((s) => s.locked);
  $("#selStart").disabled = !ready;
}
$("#selBack").onclick = () => { sel = null; show("local"); };
$("#selStart").onclick = () => {
  const locals = sel.slots.map((s) => ({ char: SUSPECTS[s.cursor].id, device: s.device }));
  lastSettings = { kind: "local", locals };
  beginLocal(locals);
};

function selectInput() {
  if (!sel) return;
  let changed = false;
  if (sel.mode === "coop") {
    for (const dev of joinPresses()) {
      if (sel.slots.length < 2 && !sel.slots.some((s) => s.device === dev)) {
        const taken = new Set(sel.slots.map((s) => s.cursor));
        sel.slots.push({ device: dev, cursor: SUSPECTS.findIndex((_, i) => !taken.has(i)), locked: false, justJoined: true });
        changed = true;
      }
    }
  }
  for (const [k, sl] of sel.slots.entries()) {
    const inp = read(sl.device);
    if (sl.justJoined) { sl.justJoined = false; continue; }
    if (!sl.locked) {
      let d = 0;
      if (inp.left) d = -1; if (inp.right) d = 1; if (inp.up) d = -3; if (inp.down) d = 3;
      if (d) { sl.cursor = (sl.cursor + d + SUSPECTS.length) % SUSPECTS.length; changed = true; }
      if (inp.confirm && !sel.slots.some((s, j) => j !== k && s.locked && s.cursor === sl.cursor)) { sl.locked = true; changed = true; sfx("card"); }
      else if (inp.back) { if (sel.mode === "coop" && k > 0) sel.slots.splice(k, 1); else { sel = null; show("local"); return; } changed = true; }
    } else {
      if (inp.back) { sl.locked = false; changed = true; }
      else if (inp.confirm && !$("#selStart").disabled) { $("#selStart").click(); return; }
    }
  }
  if (changed) renderSelect();
}

// ---------- local game ----------
function beginLocal(locals) {
  stopTitleWatch();
  demo = null;
  show(null);
  for (const s of screens) $(`#${s}`).classList.add("hidden");
  game?.destroy();
  for (const c of view.chalk.values()) c.removeFromParent();
  view.chalk.clear();
  game = new Game({ view, mode: "local", locals, onExit: exitToTitle, onAgain: () => beginLocal(locals) });
}
function exitToTitle() {
  if (net) { net.inRound = false; net.cancelRecovery(); }
  game?.destroy();
  game = null;
  activeMatchCode = null;
  lobbyNetWired = false;
  if (net?.lobby) net.leave();
  clearTitleLive();
  startDemo(true);
  show("title");
  startGameMusic();
  connectTitle().catch(() => {});
}
$("#resumeBtn").onclick = () => game?.pause(false);
$("#quitBtn").onclick = () => exitToTitle();
$("#helpBtn").onclick = () => $("#help").classList.toggle("hidden");

// ---------- online ----------
async function openOnline() {
  show("online");
  const st = $("#onlineStatus");
  st.textContent = "Connecting to the mansion…";
  try {
    net ||= new Net();
    await net.connect();
    net.updateDevice(view.renderer.xr.isPresenting);
    wireNet();
    st.textContent = `Signed in as @${net.username}. Host a game or join one.`;
    net.list();
  } catch (e) {
    st.textContent = e.message || "Could not connect.";
  }
}
function wireNet() {
  if (lobbyNetWired) return;
  lobbyNetWired = true;
  net.on("lobbies", (m) => {
    renderTitleLobbies(m.list || []);
    const el = $("#lobbyList");
    el.innerHTML = m.list.length ? m.list.map((l) => `<button data-code="${esc(l.code)}"><b>${esc(l.code)}</b><span>@${esc(l.host)}</span><em>${l.count}/6</em></button>`).join("") : `<p class="empty">No open mansions. Host one!</p>`;
    el.querySelectorAll("button").forEach((b) => b.onclick = () => joinLobby(b.dataset.code));
    if (screen === "online") show("online");
  });
  net.on("lobby", (m) => { if (game) game.reconnectPeers(m.lobby); else { clearTitleLive(true); renderLobby(m.lobby); if (screen !== "lobby") show("lobby"); } });
  net.on("lobbyUpdate", (m) => game?.reconnectPeers(m.lobby));
  net.on("error", (m) => { if (screen === "lobby") { $("#lobbyStatus").textContent = m.text; $("#lobbyStart").disabled = !net.isHost; } else if (screen === "online") $("#onlineStatus").textContent = m.text; });
  net.on("startTimeout", () => { if (screen === "lobby") { $("#lobbyStatus").textContent = "No response from the mansion server. Try starting again."; $("#lobbyStart").disabled = !net.isHost; } });
  net.on("startReset", (m) => { if (game?.mode === "local") return; game?.destroy(); game = null; activeMatchCode = null; renderLobby(m.lobby); show("lobby"); $("#lobbyStatus").textContent = m.reason || "The match could not initialize. Try Start again."; $("#lobbyStart").disabled = !net.isHost; });
  net.on("closed", () => {
    if (game && game.mode !== "local") {
      net.inRound = false;
      net.cancelRecovery();
      game.offerOffline(() => {
        const local = game?.players[0];
        if (!game?.continueOffline()) return;
        activeMatchCode = null;
        net.inRound = false;
        net.lobby = null;
        game.onAgain = () => beginLocal([{ char: local.char, device: local.device }]);
      });
    }
    else if (!game && screen === "lobby") exitToTitle();
  });
  net.on("resumed", (m) => { game?.reconnectPeers(m.lobby); game?.connectionRestored(); net.ready(); });
  net.on("connected", () => { if (screen === "online") net.list(); else if (screen === "title" && !game && !net.lobby) net.live(); });
  net.on("left", () => { if (!game) net.live(); });
  net.on("started", (m) => { if (!game || game.mode !== "local") beginOnline(m.lobby); });
}
function joinLobby(code) { $("#onlineStatus").textContent = `Joining mansion ${String(code).toUpperCase()}…`; net?.join(code); }
$("#createBtn").onclick = () => { $("#onlineStatus").textContent = "Opening a mansion…"; net?.create(); };
$("#refreshBtn").onclick = () => net?.list();
$("#joinBtn").onclick = () => joinLobby($("#joinCode").value.trim());
$("#lobbyLeave").onclick = () => { net.leave(); show("online"); net.list(); };
$("#lobbyStart").onclick = () => { $("#lobbyStatus").textContent = "Starting the round…"; $("#lobbyStart").disabled = true; net.start(); };
$("#lobbySuspects").onclick = (e) => {
  const button = e.target.closest("button[data-c]");
  const lobby = net?.lobby;
  if (!button || !lobby || button.disabled) return;
  const me = lobby.members.find((m) => m.id === net.id);
  if (!me || lobby.members.some((m) => m.id !== net.id && m.char === button.dataset.c)) return;
  me.char = button.dataset.c;
  renderLobby(lobby);
  net.pick(button.dataset.c);
  net.sync();
};

function renderLobby(l) {
  $("#lobbyCode").textContent = l.code;
  const host = l.host === net.id;
  const unassigned = l.members.filter((m) => !m.char).length;
  if (!net.startTimer) $("#lobbyStatus").textContent = host ? (unassigned ? unassigned + " joined player" + (unassigned === 1 ? "" : "s") + " will be assigned a character when you start." : "Ready. Empty seats are filled by AI.") : "Choose a character, then wait for the host.";
  $("#lobbyStart").style.display = host ? "" : "none";
  $("#lobbyStart").disabled = !host || !l.members.length || !!net.startTimer;
  const mine = l.members.find((m) => m.id === net.id)?.char;
  $("#lobbySuspects").innerHTML = SUSPECTS.map((s) => {
    const by = l.members.find((m) => m.char === s.id);
    const face = by ? `<div class="portrait seat-portrait" style="--c:${s.color}">${avatar(by.username)}</div>` : portrait(s.id);
    return `<button data-c="${s.id}" class="sus ${by ? "taken" : ""} ${mine === s.id ? "locked" : ""}" style="--c:${s.color}" ${by && by.id !== net.id ? "disabled" : ""}>${face}<b>${esc(s.short)}</b><small>${by ? "@" + esc(by.username) : "Open seat"}</small></button>`;
  }).join("");
  const kEl = $("#lobbyKillers");
  kEl.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("on", Number(b.dataset.k) === (l.killers || 1));
    b.setAttribute("aria-pressed", String(Number(b.dataset.k) === (l.killers || 1)));
    b.disabled = !host;
    b.onclick = () => net.settings(Number(b.dataset.k));
  });
  kEl.title = host ? "" : "The host chooses";
  $("#lobbyMembers").innerHTML = l.members.map((m) => {
    const label = `@${esc(m.username)}${m.id === l.host ? " · host" : ""}${m.char ? ` · ${esc(SUSPECT_BY_ID[m.char]?.short || m.char)}` : " · choosing"}`;
    const profile = m.username === "guest" ? `<span class="member-profile"><span class="avatar-pill">${avatar(m.username)}</span><span>${label}</span></span>` : `<a class="member-profile" href="https://websim.com/@${encodeURIComponent(m.username)}" target="_blank" rel="noopener"><span class="avatar-pill">${avatar(m.username)}</span><span>${label}</span></a>`;
    return `<div class="member">${profile}${deviceIcon(m.device)}</div>`;
  }).join("");
  if (screen === "lobby") menuFocus.set([...$("#lobby").querySelectorAll("nav.menu button:not([disabled]), .killers button:not([disabled]), .suspects.small button:not([disabled])")], true);
}

function beginOnline(lobby) {
  if (game && activeMatchCode === lobby.code) return;
  activeMatchCode = lobby.code;
  net.log("start-event", { stage: "begin-online", code: lobby.code, members: lobby.members.map((m) => ({ id: m.id, char: m.char })) });
  try {
    stopTitleWatch();
    demo = null;
    for (const s of screens) $(`#${s}`).classList.add("hidden");
    game?.destroy();
    game = null;
    for (const c of view.chalk.values()) c.removeFromParent();
    view.chalk.clear();
    const me = lobby.members.find((m) => m.id === net.id);
    const names = Object.fromEntries(lobby.members.map((m) => [m.char, "@" + m.username]));
    const host = lobby.host === net.id;
    const remote = lobby.members.filter((m) => m.id !== net.id).map((m) => ({ char: m.char, conn: m.id, name: "@" + m.username }));
    if (!me?.char || !SUSPECTS.some((s) => s.id === me.char)) throw new Error("The server did not assign this player a character.");
    game = new Game({
      view, net, names, mode: host ? "host" : "client", locals: [{ char: me.char, device: "all" }], remote: host ? remote : [], killers: lobby.killers || 1,
      onExit: exitToTitle, onAgain: () => { exitToTitle(); openOnline(); },
    });
    net.inRound = true;
  } catch (error) {
    console.error("Online match startup failed", error);
    const reason = String(error?.stack || error?.message || error).slice(0, 800);
    net.startupFailed(reason);
    game = null;
    activeMatchCode = null;
    $("#hud").classList.add("hidden");
    document.body.classList.remove("in-game", "split");
    show("lobby");
    $("#lobbyStatus").textContent = "The round could not initialize. Try Start again.";
  }
}

// ---------- menu input (keyboard + controllers) ----------
function menuInput() {
  if (settingsOpen) { const inp = read("all"); if (inp.back || inp.pause) closeGraphics(); return; }
  if (manual.isOpen) {
    const inp = read("all");
    if (inp.back || inp.pause) manual.close();
    else if (inp.left) manual.previous();
    else if (inp.right) manual.next();
    return;
  }
  if (screen === "select") { selectInput(); return; }
  if (!screens.includes(screen)) return;
  const inp = read("all");
  if (document.activeElement?.tagName === "INPUT" && !inp.up && !inp.down) return;
  if (inp.back || inp.pause) {
    const back = { local: "title", online: "title", lobby: null }[screen];
    if (back) $(`#${screen} [data-back]`)?.click();
    return;
  }
  const items = menuFocus.items;
  if (!items.length) return;
  if (inp.left) inp.up = true;
  if (inp.right) inp.down = true;
  menuFocus.handle({ ...inp, num: -1 });
}

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  now ??= performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  beginFrame();
  if (game) game.update(dt);
  else if (demo && liveSnap) {
    if (liveSeed) { view.apply(liveSeed, 0, true); liveSeed = null; }
    view.apply(interpolateSnapshot(liveSamples, performance.now(), 240) || liveSnap, dt);
    menuInput();
  } else if (demo) {
    demo.update(dt);
    if (demo.phase === "over") startDemo();
    view.apply(demo.snapshot(), dt);
    menuInput();
  } else menuInput();
  if (game || demo) view.render(dt);
  $("#title").classList.toggle("fp-spectate", screen === "title" && !view.views[0]?.titleOrbit);
  const pads = connectedPads().length;
  $("#padsHint").textContent = pads ? `${pads} controller${pads > 1 ? "s" : ""} connected` : touchDevice ? "Touch controls supported" : "Keyboard · mouse · controllers supported";
}

// ---------- VR ----------
async function setupVR() {
  const btn = $("#vrBtn");
  if (!btn || !navigator.xr) return;
  let ok = false;
  try { ok = await navigator.xr.isSessionSupported("immersive-vr"); } catch {}
  if (!ok) return;
  btn.classList.remove("hidden");
  btn.onclick = async () => {
    const r = view.renderer;
    if (r.xr.isPresenting) { r.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] });
      r.xr.setReferenceSpaceType("local-floor");
      await r.xr.setSession(session);
      document.body.classList.add("xr-active");
      btn.textContent = "Exit VR";
      net?.updateDevice(true);
      session.addEventListener("end", () => { document.body.classList.remove("xr-active"); btn.textContent = "VR"; net?.updateDevice(); });
    } catch (e) { console.warn("VR failed", e); }
  };
}

(async () => {
  try { await Promise.all([view.init(), loadSouls()]); }
  catch (e) { console.error(e); }
  startDemo(true);
  show("title");
  view.renderer.setAnimationLoop((t) => frame(t));
  startAmbience();
  startGameMusic();
  connectTitle().catch(() => {});
  setInterval(() => { if (!net?.lobby) connectTitle().catch(() => {}); }, 10000);
  setInterval(() => { if (screen === "lobby" && net?.lobby && !game) net.sync(); }, 2500);
  setupVR();
})();
