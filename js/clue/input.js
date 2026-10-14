// Input devices: two keyboard layouts and any number of gamepads. Each local
// player owns one device ("kb1", "kb2", "pad:N"); solo play listens to all.
// kb1 (and solo) also gets pointer-locked mouse look.
import { Gamepads } from "../gamepads.js";

const pads = new Gamepads();
const keys = new Set();
const pressedKeys = new Set();
const mouse = { dx: 0, dy: 0, click: false, rclick: false };
const touch = { x: 0, z: 0, dx: 0, dy: 0, held: new Set(), pressed: new Set() };
let frameTouch = { dx: 0, dy: 0, held: new Set(), pressed: new Set() };
addEventListener("keydown", (e) => {
  if (e.target?.tagName === "INPUT") return;
  if (!keys.has(e.code)) pressedKeys.add(e.code);
  keys.add(e.code);
  if (["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code) && document.body.classList.contains("in-game")) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
addEventListener("mousemove", (e) => {
  if (!document.pointerLockElement) return;
  mouse.dx += e.movementX || 0; mouse.dy += e.movementY || 0;
});
addEventListener("mousedown", (e) => {
  if (!document.pointerLockElement) return;
  if (e.button === 0) mouse.click = true;
  if (e.button === 2) mouse.rclick = true;
});
addEventListener("contextmenu", (e) => { if (document.pointerLockElement) e.preventDefault(); });

// Click the 3D view to capture the mouse (only while playing, outside menus).
export function bindPointerLock(canvas, allowed) {
  canvas.addEventListener("click", (event) => {
    if (event.pointerType === "touch" || document.body.classList.contains("touch-capable")) return;
    if (!document.pointerLockElement && allowed()) canvas.requestPointerLock?.()?.catch?.(() => {});
  });
}
export function releasePointer() { if (document.pointerLockElement) document.exitPointerLock?.(); }

let touchBound = false;
export function bindTouchControls(canvas) {
  if (touchBound) return;
  if (!matchMedia("(pointer: coarse)").matches && !navigator.userAgentData?.mobile) return;
  touchBound = true;
  document.body.classList.add("touch-capable");
  const stick = document.querySelector("#touchStick");
  const knob = document.querySelector("#touchStickKnob");
  let stickId = null, lookId = null, lastX = 0, lastY = 0;
  const updateStick = (event) => {
    const rect = stick.getBoundingClientRect();
    const max = rect.width * 0.36;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const scale = Math.min(1, max / Math.max(1, Math.hypot(dx, dy)));
    touch.x = dx * scale / max;
    touch.z = dy * scale / max;
    knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  };
  stick.addEventListener("pointerdown", (event) => {
    if (stickId !== null) return;
    event.preventDefault(); stickId = event.pointerId; stick.setPointerCapture(event.pointerId); updateStick(event);
  });
  stick.addEventListener("pointermove", (event) => { if (event.pointerId === stickId) updateStick(event); });
  const endStick = (event) => { if (event.pointerId !== stickId) return; stickId = null; touch.x = touch.z = 0; knob.style.transform = ""; };
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);
  stick.addEventListener("lostpointercapture", endStick);
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || lookId !== null || !document.body.classList.contains("in-game")) return;
    event.preventDefault(); lookId = event.pointerId; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== lookId) return;
    touch.dx += (event.clientX - lastX) * 1.8; touch.dy += (event.clientY - lastY) * 1.8;
    lastX = event.clientX; lastY = event.clientY;
  });
  const endLook = (event) => { if (event.pointerId === lookId) lookId = null; };
  canvas.addEventListener("pointerup", endLook);
  canvas.addEventListener("pointercancel", endLook);
  canvas.addEventListener("lostpointercapture", endLook);
  document.querySelectorAll("#touchControls button[data-touch]").forEach((button) => {
    const action = button.dataset.touch;
    const down = (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); touch.held.add(action); touch.pressed.add(action); button.classList.add("pressed"); };
    const up = () => { touch.held.delete(action); button.classList.remove("pressed"); };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("lostpointercapture", up);
  });
  addEventListener("blur", () => { touch.x = touch.z = 0; touch.held.clear(); touch.pressed.clear(); knob.style.transform = ""; });
}

const LAYOUTS = {
  kb1: { up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"], act: ["KeyE", "Space"], alt: ["KeyF"], back: ["KeyQ"], pause: ["Escape", "KeyP"], notes: ["Tab", "KeyN"], run: ["ShiftLeft"], confirm: ["Enter", "KeyE", "Space"], view: ["KeyV"], throw: ["KeyR"], pocket: ["KeyG"], use: ["KeyT"], peek: ["KeyC"], buzz: [], turnL: [], turnR: [], nums: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"] },
  kb2: { up: ["ArrowUp"], down: ["ArrowDown"], left: [], right: [], act: ["Enter", "NumpadEnter", "Numpad0"], alt: ["ShiftRight", "NumpadDecimal"], back: ["Backspace", "NumpadSubtract"], pause: ["NumpadMultiply"], notes: ["NumpadAdd", "Slash"], run: ["ControlRight"], confirm: ["Enter", "NumpadEnter", "Numpad0"], view: ["End"], throw: ["PageDown"], pocket: ["Delete"], use: ["PageUp"], peek: ["Home"], buzz: [], turnL: ["ArrowLeft"], turnR: ["ArrowRight"], nums: ["Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5", "Numpad6"] },
};
// Menu navigation on kb2 still uses the arrows.
const KB2_NAV = { left: ["ArrowLeft"], right: ["ArrowRight"] };

let padStates = [];
let frameMouse = { dx: 0, dy: 0, click: false, rclick: false };
export function beginFrame() {
  padStates = pads.poll(() => 1);
  keyFrame = new Set(pressedKeys);
  pressedKeys.clear();
  frameMouse = { ...mouse };
  mouse.dx = mouse.dy = 0; mouse.click = mouse.rclick = false;
  frameTouch = { dx: touch.dx, dy: touch.dy, held: new Set(touch.held), pressed: new Set(touch.pressed), x: touch.x, z: touch.z };
  touch.dx = touch.dy = 0; touch.pressed.clear();
}
let keyFrame = new Set();

const anyDown = (codes) => codes.some((c) => keys.has(c));
const anyPressed = (codes) => codes.some((c) => keyFrame.has(c));

// Unified read for a device id, or "all" (solo).
export function read(device) {
  const out = { mx: 0, mz: 0, lx: 0, ly: 0, mouseX: 0, mouseY: 0, run: false, act: false, alt: false, back: false, pause: false, notes: false, confirm: false, view: false, throw: false, pocket: false, use: false, peek: false, buzz: false, up: false, down: false, left: false, right: false, num: -1, any: false, cycleL: false, cycleR: false };
  const kbs = device === "all" ? ["kb1", "kb2"] : device?.startsWith("kb") ? [device] : [];
  for (const k of kbs) {
    const L = LAYOUTS[k];
    out.mx += (anyDown(L.right) ? 1 : 0) - (anyDown(L.left) ? 1 : 0);
    out.mz += (anyDown(L.down) ? 1 : 0) - (anyDown(L.up) ? 1 : 0);
    out.lx += (anyDown(L.turnR) ? 1 : 0) - (anyDown(L.turnL) ? 1 : 0);
    out.run ||= anyDown(L.run);
    out.act ||= anyPressed(L.act);
    out.alt ||= anyPressed(L.alt);
    out.back ||= anyPressed(L.back);
    out.pause ||= anyPressed(L.pause);
    out.notes ||= anyPressed(L.notes);
    out.confirm ||= anyPressed(L.confirm);
    out.view ||= anyPressed(L.view);
    out.throw ||= anyPressed(L.throw);
    out.pocket ||= anyPressed(L.pocket);
    out.use ||= anyPressed(L.use);
    out.peek ||= anyDown(L.peek);
    const nav = k === "kb2" ? { ...L, ...KB2_NAV } : L;
    out.up ||= anyPressed(nav.up); out.down ||= anyPressed(nav.down); out.left ||= anyPressed(nav.left); out.right ||= anyPressed(nav.right);
    L.nums.forEach((c, i) => { if (keyFrame.has(c)) out.num = i; });
    if (k === "kb1") {
      out.mouseX += frameMouse.dx; out.mouseY += frameMouse.dy;
      out.act ||= frameMouse.click; out.alt ||= frameMouse.rclick;
    }
  }
  const padIdx = device === "all" ? null : device?.startsWith("pad:") ? Number(device.slice(4)) : -1;
  for (const p of padStates) {
    if (padIdx !== null && p.index !== padIdx) continue;
    out.mx += p.axes[0] + (p.buttons[15] ? 1 : 0) - (p.buttons[14] ? 1 : 0);
    out.mz += p.axes[1] + (p.buttons[13] ? 1 : 0) - (p.buttons[12] ? 1 : 0);
    out.lx += p.axes[2]; out.ly += p.axes[3];
    out.run ||= p.buttons[7];
    out.act ||= p.pressed[0];
    out.confirm ||= p.pressed[0];
    out.alt ||= p.pressed[2];
    out.back ||= p.pressed[1];
    out.notes ||= p.pressed[3];
    out.throw ||= p.pressed[4];
    out.cycleL ||= p.pressed[4]; out.cycleR ||= p.pressed[5];
    out.use ||= p.pressed[5];
    out.buzz ||= p.pressed[8];
    out.pause ||= p.pressed[9];
    out.view ||= p.pressed[10];
    out.pocket ||= p.pressed[11];
    out.up ||= p.pressed[12]; out.down ||= p.pressed[13]; out.left ||= p.pressed[14]; out.right ||= p.pressed[15];
    stickNav(p, out);
  }
  if (device === "all" || device === "kb1") {
    out.mx += frameTouch.x || 0; out.mz += frameTouch.z || 0;
    out.mouseX += frameTouch.dx; out.mouseY += frameTouch.dy;
    for (const action of ["act", "alt", "back", "notes", "view", "throw", "pocket", "use"]) out[action] ||= frameTouch.pressed.has(action);
    out.peek ||= frameTouch.held.has("peek");
    out.run ||= Math.hypot(frameTouch.x || 0, frameTouch.z || 0) > 0.88;
  }
  const len = Math.hypot(out.mx, out.mz);
  if (len > 1) { out.mx /= len; out.mz /= len; }
  out.lx = Math.max(-1, Math.min(1, out.lx)); out.ly = Math.max(-1, Math.min(1, out.ly));
  out.any = out.act || out.confirm || out.back || out.notes || out.up || out.down || out.left || out.right || out.num >= 0;
  return out;
}

const stickMemory = new Map();
function stickNav(p, out) {
  const m = stickMemory.get(p.index) || { dir: null, t: 0 };
  const x = p.axes[0], y = p.axes[1];
  let dir = null;
  if (Math.abs(y) > 0.6 && Math.abs(y) > Math.abs(x)) dir = y < 0 ? "up" : "down";
  else if (Math.abs(x) > 0.6) dir = x < 0 ? "left" : "right";
  const now = performance.now();
  if (dir && (dir !== m.dir || now - m.t > 280)) { out[dir] = true; m.t = now; }
  m.dir = dir;
  stickMemory.set(p.index, m);
}

// Rumble a pad `count` times (the secret role signal in split-screen).
export function buzz(device, count = 1) {
  if (!device?.startsWith("pad:")) return false;
  const idx = Number(device.slice(4));
  let pad = null;
  try { pad = navigator.getGamepads?.()[idx]; } catch {}
  const act = pad?.vibrationActuator;
  if (!act) return false;
  for (let i = 0; i < count; i++) {
    setTimeout(() => { try { act.playEffect?.("dual-rumble", { duration: 220, strongMagnitude: 1, weakMagnitude: 0.8 }); } catch {} }, i * 480);
  }
  return true;
}

// Devices that pressed "join" this frame (for the character select).
export function joinPresses() {
  const out = [];
  if (anyPressed(["KeyE", "Space"])) out.push("kb1");
  if (anyPressed(["Enter", "NumpadEnter", "Numpad0"])) out.push("kb2");
  for (const p of padStates) if (p.pressed[0] || p.pressed[9]) out.push(`pad:${p.index}`);
  return out;
}
export function connectedPads() { return padStates.map((p) => p.index); }
export function deviceLabel(d) { return d === "kb1" ? "Keyboard + mouse" : d === "kb2" ? "Keyboard (Arrows)" : d?.startsWith("pad:") ? `Controller ${Number(d.slice(4)) + 1}` : "Any"; }
