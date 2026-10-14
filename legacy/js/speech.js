// Browser speech honors the requested voice code. Generated audio files can
// ignore it, so character dialogue uses the browser voice path directly.
let generation = 0;

export function characterVoice(character) {
  if (character?.voice === "en-female" || character?.voice === "en-male") return character.voice;
  return character?.gender === "male" ? "en-male" : "en-female";
}

export function stopSpeech() {
  generation++;
  window.speechSynthesis?.cancel();
}

export async function speakText(text, voice = "en-female") {
  if (!text || !window.websim?.textToSpeech) return;
  stopSpeech();
  const token = generation;
  try { await window.websim.textToSpeech({ text, voice }); }
  catch (error) { if (token === generation) console.warn("Speech playback unavailable", error); }
}
