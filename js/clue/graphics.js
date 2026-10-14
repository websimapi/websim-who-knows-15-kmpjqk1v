// Persisted graphics choices and the renderer limits behind each preset.
export const GRAPHICS_PRESETS = {
  performance: { ratio: 1, keyShadow: 512, moonShadow: false, shadowMap: 1024, anisotropy: 2 },
  balanced: { ratio: 1.25, keyShadow: 1024, moonShadow: false, shadowMap: 1024, anisotropy: 4 },
  high: { ratio: 1.6, keyShadow: 1536, moonShadow: true, shadowMap: 2048, anisotropy: 8 },
  ultra: { ratio: 2, keyShadow: 2048, moonShadow: true, shadowMap: 3072, anisotropy: 16 },
};

function initialPreset() {
  try {
    const old = localStorage.getItem("clue.quality");
    if (old === "low") return "performance";
    if (old === "medium") return "balanced";
    if (old === "high") return "high";
  } catch {}
  const touch = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  return touch || cores <= 4 ? "performance" : cores >= 8 ? "high" : "balanced";
}

export function loadGraphics() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("clue.graphics") || "{}") || {}; } catch {}
  const preset = GRAPHICS_PRESETS[saved.preset] ? saved.preset : initialPreset();
  const resolution = Math.max(60, Math.min(120, Number(saved.resolution) || 100));
  const shadows = ["off", "standard", "high"].includes(saved.shadows) ? saved.shadows : preset === "performance" ? "off" : preset === "balanced" ? "standard" : "high";
  return { preset, resolution, shadows, adaptive: saved.adaptive !== false, atmosphere: saved.atmosphere !== false };
}

export function saveGraphics(settings) {
  try { localStorage.setItem("clue.graphics", JSON.stringify(settings)); } catch {}
}

export function resolveGraphics(settings) {
  const preset = GRAPHICS_PRESETS[settings.preset] || GRAPHICS_PRESETS.balanced;
  return {
    ...preset,
    ratio: preset.ratio * settings.resolution / 100,
    keyShadow: settings.shadows === "off" ? 0 : settings.shadows === "standard" ? Math.min(preset.keyShadow, 1024) : preset.keyShadow,
    moonShadow: settings.shadows === "high" && preset.moonShadow,
  };
}
