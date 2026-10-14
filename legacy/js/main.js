import { autoTier, setTier } from "./quality.js";
import { Creator } from "./creator.js";
import { startAct1Cutscene } from "./cutscene.js";
import { Game } from "./game.js";
import { newId, store, Local, Online, LocalDialogueCache } from "./save.js";
import { STARTER, STARTER_EQUIPMENT } from "./items.js";
import { importOnlineDialogueCache, importLocalDialogueCaches } from "./dialogue-cache.js";
import { BUTTON_NAMES, Gamepads } from "./gamepads.js";
import { relocateState } from "./realm-transfer.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const seedInput = $("#seedIn");
const quality = autoTier();
let mode = "local";
let game = null;
let titleCinematic = null;
let menuControllerIndex = null;
const gamepads = new Gamepads();
const menuNavAt = new Map();
let lastControllerStates = [];
let controllerSetup = null;
function controllerPlayer(index) {
  const joined = game?.controllerSlots.get(index);
  if (joined) return joined;
  if (game?.controllerSlots.size) return 2;
  const connected = [...(navigator.getGamepads?.() || [])].filter(pad => pad?.connected);
  return connected[0]?.index === index ? 1 : 2;
}
function selectedController() {
  return controllerSetup?.entries.find(entry => entry.index === controllerSetup.index);
}
function renderControllerMap() {
  const entry = selectedController();
  if (!entry) return;
  const list = $("#controllerMapList");
  list.replaceChildren();
  entry.sources.forEach((source, target) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "controller-map-row";
    const label = document.createElement("span");
    label.textContent = BUTTON_NAMES[target] || `Button ${target + 1}`;
    const value = document.createElement("span");
    value.textContent = source < 0 ? "Unassigned" : `Button ${source + 1}`;
    button.append(label, value);
    button.onclick = () => {
      controllerSetup.target = target;
      controllerSetup.waitingRelease = true;
      $("#controllerMapInstruction").textContent = `Release all buttons, then press the physical button for ${BUTTON_NAMES[target] || `Button ${target + 1}`}.`;
      list.querySelectorAll("button").forEach(row => row.classList.remove("mapping"));
      button.classList.add("mapping");
    };
    list.append(button);
  });
}
function beginControllerSetup(index = null) {
  const entries = lastControllerStates.map(pad => ({
    index: pad.index, id: pad.id, player: pad.player,
    sources: gamepads.sourcesFor(pad, pad.player),
  }));
  if (!entries.length) { $("#loadMsg").textContent = "Connect a controller first."; return; }
  const selected = entries.find(entry => entry.index === index) || entries[0];
  controllerSetup = { index: selected.index, entries, target: null, waitingRelease: false, wasPaused: game?.paused ?? false };
  if (game) { game.paused = true; game.controllerStates.clear(); }
  const playerSelect = $("#controllerMapPlayer");
  playerSelect.replaceChildren();
  for (const entry of entries) {
    const option = document.createElement("option");
    option.value = String(entry.index);
    option.textContent = `Player ${entry.player} · Controller ${entry.index + 1}`;
    playerSelect.append(option);
  }
  playerSelect.value = String(selected.index);
  playerSelect.classList.toggle("hidden", entries.length < 2);
  $("#controllerMapInstruction").textContent = "Choose a button to remap.";
  renderControllerMap();
  $("#controllerMap").classList.remove("hidden");
  document.activeElement?.blur?.();
}
function endControllerSetup() {
  if (!controllerSetup) return;
  if (game) game.paused = controllerSetup.wasPaused;
  controllerSetup = null;
  $("#controllerMap").classList.add("hidden");
  if (game?.menuOpen) $("#resume")?.focus();
  else $("#newChar")?.focus();
}
function updateControllerSetup(states) {
  const setup = controllerSetup;
  const entry = selectedController();
  const pad = states.find(state => state.index === entry.index);
  const text = $("#controllerMapInstruction");
  if (!pad) { text.textContent = "Reconnect the controller or cancel."; return; }
  if (setup.target === null) return;
  if (setup.waitingRelease) {
    if (!pad.rawButtons.some(Boolean)) setup.waitingRelease = false;
    return;
  }
  const source = pad.rawPressed.findIndex(Boolean);
  if (source < 0) return;
  const target = setup.target;
  const other = entry.sources.indexOf(source);
  if (other !== -1 && other !== target) entry.sources[other] = entry.sources[target];
  entry.sources[target] = source;
  setup.target = null;
  text.textContent = "Choose another button to remap, or save.";
  renderControllerMap();
}
$("#controllerSetupTitle").onclick = () => beginControllerSetup();
$("#controllerSetupPause").onclick = () => beginControllerSetup(game?.lastControllerIndex);
$("#controllerMapPlayer").onchange = (event) => {
  controllerSetup.index = Number(event.target.value);
  controllerSetup.target = null;
  $("#controllerMapInstruction").textContent = "Choose a button to remap.";
  renderControllerMap();
};
$("#controllerMapSave").onclick = () => {
  for (const entry of controllerSetup.entries) gamepads.setBinding(entry.id, entry.player, entry.sources);
  endControllerSetup();
};
$("#controllerMapCancel").onclick = () => endControllerSetup();
addEventListener("keydown", (event) => {
  if (controllerSetup && event.code === "Escape") {
    event.preventDefault();
    if (controllerSetup.target !== null) {
      controllerSetup.target = null;
      $("#controllerMapInstruction").textContent = "Choose a button to remap.";
      renderControllerMap();
    } else endControllerSetup();
  }
});
function dismissTitleCinematic() {
  $("#title").dataset.cinematicDismissed = "true";
  titleCinematic?.stop();
}

seedInput.value = String(Math.floor(Math.random() * 900000) + 100000);

function selectIn(group, value) {
  $$("button", group).forEach((button) => button.classList.toggle("on", button.dataset.v === value));
}
function wireSegment(id, onChange) {
  const group = $(id);
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-v]");
    if (!button) return;
    selectIn(group, button.dataset.v);
    onChange(button.dataset.v);
  });
}

wireSegment("#modeSeg", (value) => { mode = value; showMode(); listSaves(); });

// ---------- online realms ----------
let realmSel = { id: "MAIN", name: "The Main Realm", visibility: "public" };
let realmData = null;
let hostVis = "public";
function showMode() {
  const on = mode === "online";
  $("#realmBox").classList.toggle("hidden", !on);
  $("#seedRow").classList.toggle("hidden", on);
  $("#importOnline").classList.toggle("hidden", on);
  if (on) loadRealms();
}
async function loadRealms() {
  try {
    const r = await fetch("/api/realms");
    realmData = await r.json();
  } catch { realmData = null; }
  renderRealms();
}
function realmRow(r, kind) {
  const sel = realmSel.id === r.id ? " on" : "";
  const lock = r.visibility === "private" ? '<span class="lock" title="Private">private</span>' : "";
  const own = kind === "mine" ? `<span class="own"><button class="ghost tiny" data-vis="${r.id}">${r.visibility === "private" ? "Make public" : "Make private"}</button><button class="del tiny" data-del="${r.id}" title="Delete realm">✕</button></span>` : "";
  const by = kind === "main" ? "Everyone plays here" : kind === "mine" ? `Code ${r.id} · you host` : `@${escape(r.username)} · ${r.id}`;
  return `<div class="realm${sel}" data-id="${r.id}"><span><b>${escape(r.name)}</b> ${lock}<small>${by}</small></span>${own}</div>`;
}
function renderRealms() {
  const box = $("#realmList");
  if (!realmData) { box.innerHTML = '<div class="note">Realms are unavailable right now.</div>'; return; }
  const mine = realmData.mine || [], pub = (realmData.public || []).filter((r) => !mine.some((m) => m.id === r.id));
  box.innerHTML = realmRow({ ...realmData.main, visibility: "public" }, "main")
    + (mine.length ? '<div class="realm-h">Your realms</div>' + mine.map((r) => realmRow(r, "mine")).join("") : "")
    + (pub.length ? '<div class="realm-h">Public realms</div>' + pub.map((r) => realmRow(r, "public")).join("") : "")
    + (realmData.signedIn ? "" : '<div class="note">Sign in to websim to play online.</div>');
  $$(".realm", box).forEach((el) => el.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    const id = el.dataset.id;
    realmSel = [realmData.main, ...mine, ...pub].find((r) => r.id === id) || realmSel;
    $("#realmCode").value = id === "MAIN" ? "" : id;
    renderRealms();
  }));
  $$("[data-vis]", box).forEach((b) => (b.onclick = async () => {
    const r = mine.find((x) => x.id === b.dataset.vis);
    const toPrivate = r.visibility !== "private";
    let password;
    if (toPrivate) { password = prompt("Password for " + r.name + " (3+ characters)"); if (!password) return; }
    const res = await fetch("/api/realms", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id, visibility: toPrivate ? "private" : "public", password }) });
    if (!res.ok) $("#loadMsg").textContent = (await res.json().catch(() => ({}))).error || "Could not update realm";
    loadRealms();
  }));
  $$("[data-del]", box).forEach((b) => (b.onclick = async () => {
    const r = mine.find((x) => x.id === b.dataset.del);
    if (!confirm(`Delete ${r.name}? Everyone's progress in it is lost.`)) return;
    await fetch("/api/realms?id=" + encodeURIComponent(r.id), { method: "DELETE" });
    if (realmSel.id === r.id) realmSel = { ...realmData.main, visibility: "public" };
    loadRealms();
  }));
}
$("#realmCode").addEventListener("change", async () => {
  const id = $("#realmCode").value.trim().toUpperCase();
  if (!id) { realmSel = { ...realmData?.main, visibility: "public" }; renderRealms(); return; }
  const r = await fetch("/api/realms/info?id=" + encodeURIComponent(id));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { $("#loadMsg").textContent = j.error || "No realm with that code"; return; }
  realmSel = j.realm;
  $("#loadMsg").textContent = `Selected ${j.realm.name}${j.realm.visibility === "private" ? " — enter its password" : ""}`;
  renderRealms();
});
wireSegment("#hostVis", (v) => { hostVis = v; $("#hostPass").classList.toggle("hidden", v !== "private"); });
$("#hostGo").addEventListener("click", async () => {
  const res = await fetch("/api/realms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: $("#hostName").value, visibility: hostVis, password: $("#hostPass").value }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { $("#loadMsg").textContent = j.error || "Could not create realm"; return; }
  realmSel = j.realm;
  $("#hostBox").open = false;
  $("#loadMsg").textContent = `Realm created · share code ${j.realm.id}`;
  loadRealms();
});
function onlineOpts() {
  return { realm: realmSel.id, password: $("#realmPass").value || undefined };
}
wireSegment("#qualSeg", (value) => setTier(value));
wireSegment("#qualSeg2", (value) => { setTier(value); $("#pauseInfo").textContent = "Quality applies next time you load."; });
selectIn($("#qualSeg"), quality);
selectIn($("#qualSeg2"), quality);

$("#seedRand").addEventListener("click", () => { seedInput.value = String(Math.floor(Math.random() * 900000) + 100000); });
seedInput.addEventListener("input", () => { seedInput.value = seedInput.value.replace(/[^0-9]/g, "").slice(0, 12); });

const showTitle = () => { $("#title").classList.remove("hidden"); listSaves(); };

async function onlineProfileChoices() {
  const saves = await Online.list();
  const choices = [];
  for (const rec of saves) {
    if (!rec.data?.char) continue;
    let realms = [];
    try {
      const response = await fetch("/api/realm-progress?character=" + encodeURIComponent(rec.id));
      if (response.ok) realms = (await response.json()).realms || [];
    } catch (error) { console.warn("Realm progress unavailable", error); }
    // Older saves did not record their last realm. The realm table stores one
    // character per account, so only attach rows named for this character.
    realms = realms.filter(realm => realm.characterName === rec.data.char.name || realm.id === rec.data.lastRealm);
    if (!realms.length) choices.push({ rec, realm: null });
    else for (const realm of realms) choices.push({ rec, realm });
  }
  return choices;
}

async function importOnlineProfile(source, seed) {
  const { rec, realm } = source;
  const id = newId();
  const data = structuredClone(rec.data);
  const state = { ...(data.state || {}) };
  if (realm) {
    state.inv = realm.inv;
    state.gold = realm.gold;
    state.bounty = realm.bounty;
    state.equipment = realm.equipment;
    state.equipmentInitialized = true;
    state.wands = realm.wands;
    state.equippedWandId = realm.equipment?.wand || null;
    if (realm.alchemy !== "locked") state.quests = { ...(state.quests || {}), alchemy: realm.alchemy };
    state.skills = { ...(state.skills || {}), alchemy: realm.alchemy === "done" };
    state.alchemyFresh = realm.alchemyFresh;
  }
  delete state.localCoop;
  Object.assign(data, { mode: "local", online: undefined, seed, pos: undefined, state: relocateState(state),
    scene: "world", arrivalPortal: true,
    migratedHorses: (realm?.horses || []).map(horse => ({ ...horse, id: "h" + Math.floor(1000000000 + Math.random() * 1000000000), look: horse.look })),
    migratedPets: (realm?.pets || []).map(pet => ({ ...pet, id: "p_marrowgate_" + Math.floor(Math.random() * 1000000000) })),
    onlineOrigin: { realm: realm?.id || data.lastRealm || "online", name: realm?.name || "Online realm" },
    progress: { ...(data.progress || {}), cutscene: { id: "act1-opening", step: 2, complete: true } } });
  await Local.save(id, data);
  try {
    await importOnlineDialogueCache(id);
    await LocalDialogueCache.setChoice(id, "imported-online");
  } catch (error) { console.warn("Dialogue cache import unavailable", error); }
  return { id, data, store: Local };
}

async function coopProfiles(currentGame) {
  const local = (await Local.list()).filter(rec => rec.id !== currentGame.saveId && rec.data?.char)
    .map(rec => ({ id: rec.id, data: rec.data, store: Local, name: rec.data.char.name,
      detail: `Level ${rec.data.char.level || 1} · ${rec.data.seed === currentGame.world.seed ? "Local profile" : "Another realm · city portal arrival"}` }));
  try {
    const online = await onlineProfileChoices();
    local.push(...online.map(source => ({ source: "online", profileSource: source,
      name: source.rec.data.char.name,
      detail: `${source.realm?.name || "Online save"} · Level ${source.rec.data.char.level || 1} · bring to local` })));
  } catch { /* Signed-out players can still use local profiles. */ }
  return local;
}

function play(saveId, saves, data) {
  dismissTitleCinematic();
  $("#title").classList.add("hidden");
  data = { ...data, online: mode === "online" ? onlineOpts() : undefined };
  game = new Game({
    data, saveId, saves,
    getCoopProfiles: coopProfiles,
    createCoopProfile: (currentGame, index) => { coopCreation = { game: currentGame, index }; creator.open({}); },
    importCoopProfile: (currentGame, choice) => importOnlineProfile(choice.profileSource, currentGame.world.seed),
    onQuit: () => { game = null; showTitle(); },
  });
  game.start().then(() => {
    try {
      if (menuControllerIndex != null && navigator.getGamepads?.()[menuControllerIndex]?.connected) game.joinController(menuControllerIndex);
    } catch { /* Gamepad access can be unavailable in an embedded browser. */ }
    menuControllerIndex = null;
  }).catch((e) => {
    console.error(e);
    $("#loading").classList.add("hidden");
    showTitle();
    try { game?.destroy(); } catch {}
    game = null;
    $("#loadMsg").textContent = (e.needPassword ? "" : "Could not start: ") + (e.message || e);
  });
}

const startingWorlds = new Set();
async function playFrom(saveId, saves, data) {
  if (startingWorlds.has(saveId)) return;
  startingWorlds.add(saveId);
  dismissTitleCinematic();
  $("#title").classList.add("hidden");
  try {
    const cacheChoice = mode === "local" ? await LocalDialogueCache.choice(saveId) : null;
    if (mode === "local" && (!cacheChoice || cacheChoice.choice === "imported-online")) {
      const wantsLocal = confirm("Merge dialogue branches from all your other local games into this one? When the same branch exists in several games, the newest version is used.");
      const user = await window.websim?.getUser?.().catch(() => null);
      const wantsOnline = cacheChoice?.choice !== "imported-online" && !!user && confirm("Also merge your online dialogue cache into this local world? The newest timestamped version of each branch wins.");
      if (wantsLocal || wantsOnline) {
        $("#loadingText").textContent = "Merging dialogue branches…";
        $("#loading").classList.remove("hidden");
        let count = 0;
        let failed = false;
        try {
          if (wantsLocal) count += await importLocalDialogueCaches(saveId);
          if (wantsOnline) count += await importOnlineDialogueCache(saveId);
          $("#loadMsg").textContent = `${count} dialogue branches merged.`;
        } catch (error) {
          failed = true;
          console.warn("Dialogue cache import failed", error);
          $("#loadMsg").textContent = "Some dialogue branches could not be imported. You can still play locally.";
        } finally { $("#loading").classList.add("hidden"); }
        if (!failed) await LocalDialogueCache.setChoice(saveId, "chosen");
      } else {
        await LocalDialogueCache.setChoice(saveId, "chosen");
      }
    }
  } catch (error) {
    console.warn("Dialogue cache setup unavailable", error);
  } finally { startingWorlds.delete(saveId); }
  if (!data.progress?.cutscene?.complete && !data.pos) {
    startAct1Cutscene({ sheet: data.char, saveId, saves, data, onDone: (updated) => play(saveId, saves, updated) });
  } else play(saveId, saves, data);
}

async function listSaves() {
  const box = $("#saves");
  box.innerHTML = "";
  let list = [];
  try { list = await store(mode).list(); } catch (e) { $("#loadMsg").textContent = mode === "online" ? "Sign in to load online saves." : ""; return; }
  for (const rec of list.slice(0, 5)) {
    const d = rec.data;
    if (!d?.char) continue;
    const row = document.createElement("div");
    row.className = "save";
    const when = new Date(rec.updated_at).toLocaleDateString();
    row.innerHTML = `<span><b>${escape(d.char.name)}</b> <small>Lv ${d.char.level || 1} · ${escape(d.state?.main || "Act I")} · ${when}</small></span><span><button class="ghost cont">Continue</button><button class="del" title="Delete">✕</button></span>`;
    row.querySelector(".cont").onclick = () => playFrom(rec.id, store(mode), d);
    row.querySelector(".del").onclick = async () => { if (!confirm(`Delete ${d.char.name}?`)) return; await store(mode).remove(rec.id); listSaves(); };
    box.append(row);
  }
}
const escape = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let coopCreation = null;
const creator = new Creator({
  onBack: () => {
    if (coopCreation) { coopCreation.game.cancelCoopJoin(); coopCreation = null; }
    else showTitle();
  },
  onBegin: async (sheet) => {
    if (coopCreation) {
      const { game: currentGame, index } = coopCreation;
      const saveId = newId();
      const data = { version: 2, mode: "local", seed: currentGame.world.seed, scene: "world", char: sheet,
        pos: { x: currentGame.player.pos.x + 2, z: currentGame.player.pos.z + 1 },
        state: { main: "marrowgate", gold: 25, inv: { ...STARTER }, equipment: { ...(STARTER_EQUIPMENT[sheet.class] || {}) }, equipmentInitialized: true },
        progress: { act: 1, quest: "bitter_medicine", node: "marrowgate", cutscene: { id: "act1-opening", step: 2, complete: true } } };
      for (const key of Object.values(data.state.equipment)) if (!data.state.inv[key]) data.state.inv[key] = 1;
      await Local.save(saveId, data);
      coopCreation = null;
      return () => currentGame.finishCoopJoin(index, { id: saveId, data, store: Local });
    }
    const saveId = newId();
    const saves = store(mode);
    const data = {
      version: 2,
      mode,
      seed: Number(seedInput.value) || 1,
      scene: "act1-opening",
      char: sheet,
      progress: { act: 1, quest: "bitter_medicine", node: "act1-opening", cutscene: { id: "act1-opening", step: 0, complete: false } },
    };
    await saves.save(saveId, data);
    sessionStorage.setItem("ur.currentSave", saveId);
    return () => playFrom(saveId, saves, data);
  },
});

$("#newChar").addEventListener("click", () => { dismissTitleCinematic(); $("#title").classList.add("hidden"); $("#loadMsg").textContent = ""; creator.open(); });
$("#importOnline").addEventListener("click", async () => {
  const panel = $("#onlineImport"), box = $("#onlineImportChoices"), status = $("#onlineImportMessage");
  panel.classList.remove("hidden"); box.replaceChildren(); status.textContent = "Loading online profiles…";
  try {
    const choices = await onlineProfileChoices();
    status.textContent = choices.length ? `Arrival: Marrowgate portal · seed ${Number(seedInput.value) || 1}` : "No online profiles found.";
    for (const source of choices) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "coop-choice";
      button.textContent = source.rec.data.char.name;
      const small = document.createElement("small");
      small.textContent = `${source.realm?.name || "Online save"} · Level ${source.rec.data.char.level || 1}`;
      button.append(small);
      button.onclick = async () => {
        button.disabled = true; status.textContent = "Bringing profile into this world…";
        try {
          const imported = await importOnlineProfile(source, Number(seedInput.value) || 1);
          panel.classList.add("hidden");
          playFrom(imported.id, Local, imported.data);
        } catch (error) { status.textContent = error.message || "Import failed"; button.disabled = false; }
      };
      box.append(button);
    }
  } catch (error) { status.textContent = error.message || "Sign in to load online profiles."; }
  box.querySelector("button")?.focus();
});
$("#onlineImportCancel").onclick = () => $("#onlineImport").classList.add("hidden");
$("#mobileStart").addEventListener("click", () => {
  dismissTitleCinematic();
  $("#title").classList.add("menu-open");
});
showMode();
listSaves();
function controllerMenu(states) {
  const active = ["#onlineImport", "#creator", "#pause", "#cutscene", "#actEnd", "#title"]
    .map(selector => $(selector)).find(el => el && !el.classList.contains("hidden"));
  if (!active || !states.length) return;
  const controls = [...active.querySelectorAll("button:not(:disabled), select, input:not([type=hidden])")]
    .filter(el => el.getClientRects().length && !el.closest(".hidden"));
  if (!controls.length) return;
  for (const pad of states) {
    const next = pad.pressed[13] || pad.pressed[15] || pad.axes[1] > .7 ? 1
      : pad.pressed[12] || pad.pressed[14] || pad.axes[1] < -.7 ? -1 : 0;
    if (next && performance.now() - (menuNavAt.get(pad.index) || 0) > 170) {
      const current = controls.indexOf(document.activeElement);
      controls[(current + next + controls.length) % controls.length].focus();
      menuNavAt.set(pad.index, performance.now());
    }
    if (pad.pressed[0] || (active.id === "title" && !active.dataset.cinematicDismissed && pad.pressed[9])) {
      menuControllerIndex = pad.index;
      if (active.id === "title" && !active.dataset.cinematicDismissed) {
        dismissTitleCinematic();
        active.classList.add("menu-open");
        (active.querySelector(".save .cont") || $("#newChar")).focus();
      } else {
        const target = controls.includes(document.activeElement) ? document.activeElement
          : active.querySelector(".save .cont, #cutsceneNext, #cGo, #resume, #actEndGo, #newChar") || controls[0];
        if (target instanceof HTMLInputElement && target.type !== "button") target.focus();
        else target.click();
      }
    }
    if (pad.pressed[1] && active.id === "creator") $("#cBack")?.click();
  }
}
function controllerLoop() {
  requestAnimationFrame(controllerLoop);
  if (document.hidden) return;
  const states = gamepads.poll(controllerPlayer);
  lastControllerStates = states;
  if (controllerSetup) { updateControllerSetup(states); return; }
  if (game?.running && !coopCreation) game.handleGamepads(states);
  else controllerMenu(coopCreation ? states.filter(pad => pad.index === coopCreation.index) : states);
}
requestAnimationFrame(controllerLoop);
import("./title-cinematic.js").then(({ startTitleCinematic }) => {
  if (!$("#title").classList.contains("hidden") && !$("#title").dataset.cinematicDismissed) titleCinematic = startTitleCinematic($("#title"));
}).catch((error) => {
  console.warn("Title cinematic unavailable", error);
  $("#title").classList.remove("title-film");
  $("#title").querySelectorAll(".title-film-stage, .title-film-sound").forEach((el) => el.remove());
});
