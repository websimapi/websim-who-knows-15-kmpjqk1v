// Shared sprint rules for guests and local players. Values are seconds based.
export const newStamina = () => ({ value: 100, cooldown: 0, delay: 0, exhausted: false, running: false });

export function stepStamina(s, dt, wantsRun, moving) {
  dt = Math.max(0, Math.min(dt, 0.1));
  s.cooldown = Math.max(0, s.cooldown - dt);
  s.delay = Math.max(0, s.delay - dt);
  s.running = !!(wantsRun && moving && !s.exhausted && s.cooldown <= 0 && s.value > 0);
  let justExhausted = false;
  if (s.running) {
    s.value = Math.max(0, s.value - 34 * dt);
    s.delay = 1.2;
    if (s.value <= 0) {
      s.running = false;
      s.exhausted = true;
      s.cooldown = 2.4;
      justExhausted = true;
    }
  } else if (s.delay <= 0) {
    s.value = Math.min(100, s.value + 23 * dt);
  }
  if (s.exhausted && s.cooldown <= 0 && s.value >= 42) s.exhausted = false;
  return justExhausted;
}
