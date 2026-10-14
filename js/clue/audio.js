// Sound effects, the mansion ambience bed, and spoken AI lines.
const files = Object.fromEntries(["scream", "chime", "thunder", "card", "gavel", "step", "door_open", "door_close", "fire", "flicker", "ghost", "pool", "stove", "thud", "hiss", "ladder", "knock", "pant", "dart", "chop", "scrub", "beep", "done", "scrape"].map((n) => [n, `${n}.wav`]));
const cache = {};
let ambience = null;
let music = null;
let rain = null, exteriorRain = true;
let audioContext = null;
let muted = localStorage.getItem("clue.muted") === "1";

export function sfx(name, vol = 0.7) {
  if (muted || !files[name]) return;
  const base = cache[name] ||= new Audio(`./sfx/${files[name]}`);
  const a = base.cloneNode();
  a.volume = vol;
  a.play().catch(() => {});
}
export function startAmbience() {
  if (muted) return;
  if (!ambience) { ambience = new Audio("./sfx/mansion.wav"); ambience.loop = true; ambience.volume = 0.32; }
  if (!rain) { rain = new Audio("./sfx/rain.wav"); rain.loop = true; }
  ambience.volume = music ? 0.12 : 0.32;
  rain.volume = caveOn ? 0.02 : exteriorRain ? 0.28 : 0.08;
  ambience.play().catch(() => {});
  rain.play().catch(() => {});
}
export function setExteriorRain(on) {
  exteriorRain = !!on;
  if (rain) rain.volume = caveOn ? 0.02 : exteriorRain ? 0.28 : 0.08;
}
export function startGameMusic() {
  if (muted) return;
  if (!music) { music = new Audio("./audio/conservatory.ogg"); music.loop = true; music.volume = 0.32; }
  music.play().catch(() => {});
  if (ambience) ambience.volume = 0.12;
}
export function stopGameMusic() {
  music?.pause();
  if (music) music.currentTime = 0;
  cave?.pause(); caveOn = false;
  if (ambience) ambience.volume = 0.32;
}
export function stopAmbience() { ambience?.pause(); rain?.pause(); cave?.pause(); music?.pause(); }
// Underground: the house bed fades out and dripping tunnel air fades in.
let cave = null, caveOn = false;
export function setUnderground(on) {
  if (on === caveOn || muted) return;
  caveOn = on;
  if (!cave) { cave = new Audio("./sfx/tunnel.wav"); cave.loop = true; }
  cave.volume = 0.45;
  if (on) { cave.play().catch(() => {}); if (ambience) ambience.volume = 0.08; if (music) music.volume = 0.1; }
  else { cave.pause(); if (ambience) ambience.volume = music ? 0.12 : 0.32; if (music) music.volume = 0.32; }
  if (rain) rain.volume = on ? 0.02 : exteriorRain ? 0.28 : 0.08;
}

// One-shot sound with a ray-tested acoustic path supplied by the game.
export function spatialSfx(name, vol, pan = 0, occluded = false) {
  if (muted || !files[name] || vol <= 0) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    const a = new Audio(`./sfx/${files[name]}`);
    const source = audioContext.createMediaElementSource(a);
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = occluded ? 650 : 12000;
    const gain = audioContext.createGain(); gain.gain.value = Math.min(1, vol) * (occluded ? 0.48 : 1);
    const stereo = audioContext.createStereoPanner(); stereo.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter).connect(gain).connect(stereo).connect(audioContext.destination);
    a.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); stereo.disconnect(); };
    a.play().catch(() => { source.disconnect(); filter.disconnect(); gain.disconnect(); stereo.disconnect(); });
  } catch { sfx(name, vol * (occluded ? 0.4 : 1)); }
}

let speechGen = 0;
let speechBusy = false;
export function speak(text, voice) {
  if (muted || !text || !window.websim?.textToSpeech) return Promise.resolve();
  stopSpeak();
  const g = speechGen;
  speechBusy = true;
  return window.websim.textToSpeech({ text, voice: voice || "en-female" })
    .catch((e) => { if (g === speechGen) console.warn("TTS unavailable", e?.message || e); })
    .finally(() => { if (g === speechGen) speechBusy = false; });
}
// Inner thoughts are ephemeral. Never build an audible backlog while the
// player moves through several observations or opens a conversation.
export function narrate(text, voice) {
  if (muted || !text || !window.websim?.textToSpeech || speechBusy) return false;
  const g = speechGen;
  speechBusy = true;
  return window.websim.textToSpeech({ text, voice: voice || "en-female" })
    .catch((e) => { if (g === speechGen) console.warn("TTS unavailable", e?.message || e); })
    .finally(() => { if (g === speechGen) speechBusy = false; });
}
export function stopSpeak() { speechGen++; speechBusy = false; try { window.speechSynthesis?.cancel(); } catch {} }
