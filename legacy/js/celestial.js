// A compact sky model for the game's accelerated clock. One game day is 24 minutes;
// lunar phase follows a 29.53-day synodic month rather than a fixed eight-day loop.
export const DAY_SECONDS = 1440;
export const LUNAR_DAYS = 29.530588;
const TAU = Math.PI * 2;
const latitude = 42 * Math.PI / 180;
const sunDeclination = 5 * Math.PI / 180;
const positiveMod = (n, period) => ((n % period) + period) % period;
export const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function skyDirection(hourAngle, declination) {
  return {
    x: -Math.cos(declination) * Math.sin(hourAngle),
    y: Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
    z: Math.cos(latitude) * Math.sin(declination) - Math.sin(latitude) * Math.cos(declination) * Math.cos(hourAngle),
  };
}

export function celestialState(seconds) {
  const days = seconds / DAY_SECONDS;
  const cycle = positiveMod(days, 1);
  const hourAngle = (cycle - .5) * TAU;
  const lunar = positiveMod(days, LUNAR_DAYS) / LUNAR_DAYS;
  const phaseAngle = lunar * TAU;
  const sun = skyDirection(hourAngle, sunDeclination);
  const moon = skyDirection(hourAngle - phaseAngle, Math.sin(phaseAngle * 1.3) * 5 * Math.PI / 180);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sun.y)));
  // Civil, nautical and astronomical twilight end around -6°, -12° and -18°.
  const daylight = smoothstep(-Math.sin(18 * Math.PI / 180), Math.sin(6 * Math.PI / 180), sun.y);
  const darkness = smoothstep(Math.sin(6 * Math.PI / 180), Math.sin(18 * Math.PI / 180), -sun.y);
  const sunlight = smoothstep(-.015, .22, sun.y);
  const moonAbove = smoothstep(-.01, .16, moon.y);
  const illumination = (1 - Math.cos(phaseAngle)) * .5;
  const moonlight = Math.pow(illumination, 1.6) * moonAbove * (1 - daylight);
  return { days, cycle, sun, moon, elevation, daylight, darkness, sunlight, moonAbove, illumination, moonlight, lunar };
}

function hash01(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function nightFog(seconds, seed = 0) {
  const days = seconds / DAY_SECONDS;
  const day = Math.floor(days - .5); // one weather draw for sunset through sunrise
  const roll = hash01((day ^ Math.imul(Number(seed) || 0, 2654435761)) | 0);
  if (roll > .82) return 0;
  const cycle = positiveMod(days, 1);
  const overnight = cycle >= .5 ? smoothstep(.76, .88, cycle) : 1 - smoothstep(.18, .26, cycle);
  return (.62 + .38 * hash01(day + 3179)) * overnight;
}
