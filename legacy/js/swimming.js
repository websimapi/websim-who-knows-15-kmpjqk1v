// Swimming endurance uses Might (Athletics-like effort) and Vigor (breath).
export const SWIM_DEPTH = 0.95;
export const SWIM_RECOVERY = 4;

export function swimCapacity(attrs = {}, level = 1) {
  const might = Math.floor(((attrs.might ?? 10) - 10) / 2);
  const vigor = Math.floor(((attrs.vigor ?? 10) - 10) / 2);
  return Math.max(24, Math.min(90, 36 + might * 3 + vigor * 5 + (level - 1) * 2));
}

export function swimDrain(mode) {
  return mode === "sprint" ? 3.2 : mode === "swim" ? 1.7 : 0.75;
}

export function nearestShore(world, x, z, bound = Infinity) {
  const dryHeight = world.waterSurface + 0.1;
  for (let r = 0.75; r <= 60; r += 0.75) {
    let best = null;
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      const px = x + Math.cos(angle) * r, pz = z + Math.sin(angle) * r;
      if (Math.abs(px) >= bound || Math.abs(pz) >= bound || world.heightAt(px, pz) < dryHeight) continue;
      const distance = Math.hypot(px - x, pz - z);
      if (!best || distance < best.distance) best = { x: px, z: pz, distance };
    }
    if (best) return best;
  }
  return null;
}
