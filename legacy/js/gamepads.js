// Standard Gamepad layout: https://www.w3.org/TR/gamepad/#remapping
const DEAD_ZONE = 0.18;
export const BUTTON_NAMES = ["A · attack / select", "B · back", "X · skill", "Y · skill", "LB · target", "RB · skills", "LT", "RT · attack", "Back · character", "Start · pause / join", "Left stick click", "Right stick click", "D-pad up", "D-pad down · attack", "D-pad left", "D-pad right", "Home"];

// A standard gamepad reports face buttons by position. Nintendo prints B/A/Y/X
// on those positions, while the game uses the button letters A/B/X/Y.
function isNintendoPad(id) {
  return /nintendo|\bswitch\b|joy[ -]?con|(?:vendor\s*:?\s*|vid[_:]?)(?:0x)?057e\b/i.test(id);
}

export function stickAxis(value) {
  if (!Number.isFinite(value) || Math.abs(value) < DEAD_ZONE) return 0;
  return Math.sign(value) * (Math.abs(value) - DEAD_ZONE) / (1 - DEAD_ZONE);
}

export class Gamepads {
  constructor() {
    this.previous = new Map();
    try { this.bindings = JSON.parse(localStorage.getItem("ur.controllerBindings") || "{}"); }
    catch { this.bindings = {}; }
  }

  key(id, player) { return `${player}:${id}`; }

  sourcesFor(pad, player = 1) {
    const count = Math.max(BUTTON_NAMES.length, pad.rawButtons.length);
    const sources = Array.from({ length: count }, (_, i) => i < pad.rawButtons.length ? i : -1);
    if (pad.mapping === "standard" && isNintendoPad(pad.id)) {
      [sources[0], sources[1], sources[2], sources[3]] = [sources[1], sources[0], sources[3], sources[2]];
    }
    const binding = this.bindings[this.key(pad.id, player)] || (player === 1 ? this.bindings[pad.id] : null);
    if (Array.isArray(binding?.buttons)) {
      const used = new Set();
      return sources.map((source, i) => {
        const mapped = binding.buttons[i];
        if (mapped === -1) return -1;
        const value = Number.isInteger(mapped) && mapped >= 0 && mapped < pad.rawButtons.length ? mapped : source;
        if (value < 0 || used.has(value)) return -1;
        used.add(value);
        return value;
      });
    }
    // Read setups saved by the earlier A/B/Start wizard.
    if (binding && Number.isInteger(binding.confirm) && Number.isInteger(binding.menu)) {
      for (const [target, source] of [[0, binding.confirm], [1, binding.cancel], [9, binding.menu]]) {
        if (!Number.isInteger(source) || source < 0 || source >= pad.rawButtons.length) continue;
        const other = sources.indexOf(source);
        if (other !== -1 && other !== target) sources[other] = sources[target];
        sources[target] = source;
      }
    }
    return sources;
  }

  setBinding(id, player, buttons) {
    if (!id || ![1, 2].includes(player) || !Array.isArray(buttons)) return false;
    this.bindings[this.key(id, player)] = { buttons: [...buttons] };
    try { localStorage.setItem("ur.controllerBindings", JSON.stringify(this.bindings)); } catch {}
    return true;
  }

  poll(playerForIndex = () => 1) {
    let pads = [];
    try { pads = navigator.getGamepads?.() || []; } catch { return []; }
    const active = new Set();
    const states = [];
    for (const pad of pads) {
      if (!pad?.connected) continue;
      active.add(pad.index);
      const rawButtons = pad.buttons.map(button => !!button?.pressed || button?.value > 0.5);
      const before = this.previous.get(pad.index) || [];
      const rawPressed = rawButtons.map((down, i) => down && !before[i]);
      const player = playerForIndex(pad.index);
      const sources = this.sourcesFor({ id: pad.id, mapping: pad.mapping, rawButtons }, player);
      const buttons = sources.map(source => !!rawButtons[source]);
      const pressed = sources.map(source => !!rawPressed[source]);
      states.push({
        index: pad.index, id: pad.id, mapping: pad.mapping, player,
        buttons, pressed, rawButtons, rawPressed,
        axes: [0, 1, 2, 3].map(i => stickAxis(pad.axes[i])),
      });
      this.previous.set(pad.index, rawButtons);
    }
    for (const index of this.previous.keys()) if (!active.has(index)) this.previous.delete(index);
    return states;
  }
}
