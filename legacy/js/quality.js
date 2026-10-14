// Three quality tiers for mobile through desktop.

export const TIERS = {
  low: {
    name: "low", pixelRatio: Math.min(window.devicePixelRatio, 1), shadowMap: 1024, softShadows: false,
    terrainRes: 2, veg: 0.35, grass: 0.28, fogFar: 350, bloom: false,
    octaves: 4, antialias: false, shadowRadius: 60,
  },
  medium: {
    name: "medium", pixelRatio: Math.min(window.devicePixelRatio, 1.25), shadowMap: 1536, softShadows: true,
    terrainRes: 2, veg: 0.7, grass: 0.75, fogFar: 550, bloom: false,
    octaves: 5, antialias: true, shadowRadius: 75,
  },
  high: {
    name: "high", pixelRatio: Math.min(window.devicePixelRatio, 1.6), shadowMap: 3072, softShadows: true,
    terrainRes: 1, veg: 1, grass: 1.3, fogFar: 800, bloom: true,
    octaves: 6, antialias: true, shadowRadius: 90,
  },
};

export function autoTier() {
  const saved = localStorage.getItem("ur.quality");
  if (saved && TIERS[saved]) return saved;
  const touch = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (touch || cores <= 4) return "low";
  if (cores >= 8 && window.devicePixelRatio <= 2) return "high";
  return "medium";
}

// Grass is tuned separately from the other graphics options. Frame-time
// feedback in Game can refine this initial hardware estimate while playing.
export function autoGrassProfile(maxTier) {
  const cores = Number(navigator.hardwareConcurrency) || 4;
  const memory = Number(navigator.deviceMemory) || 6;
  const touch = matchMedia("(pointer: coarse)").matches;
  const pixels = innerWidth * innerHeight * Math.min(devicePixelRatio || 1, 2) ** 2;
  const levels = ["low", "medium", "high"];
  let detected = "medium";
  if (touch || cores <= 4 || memory <= 3 || pixels > 6000000) detected = "low";
  else if (cores >= 8 && memory >= 8 && pixels < 4200000) detected = "high";
  return levels[Math.min(levels.indexOf(detected), Math.max(0, levels.indexOf(maxTier)))];
}

export function setTier(name) {
  localStorage.setItem("ur.quality", name);
}
