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

let speechCancel=null;
let speechGen=0,speechBusy=false,speechAudio=null,speechState=null,speechQueue=Promise.resolve(),queuedSpeech=0;
function speechApi(){try{return window.websim||window.parent?.websim;}catch{return window.websim;}}
function phonemes(text){
  const sounds=[];const map={a:'aa',e:'E',i:'I',o:'O',u:'U',y:'I',p:'PP',b:'PP',m:'PP',f:'FF',v:'FF',t:'DD',d:'DD',k:'kk',g:'kk',q:'kk',c:'kk',j:'CH',s:'SS',z:'SS',n:'nn',l:'nn',r:'RR',w:'U',h:'aa'};
  const input=text.toLowerCase();
  for(let i=0;i<input.length;i++){
    const startChar=i,pair=input.slice(i,i+2);let shape,weight=1;
    if(['th','sh','ch','oo','ee','ph'].includes(pair)){shape={th:'TH',sh:'CH',ch:'CH',oo:'U',ee:'I',ph:'FF'}[pair];i++;weight=1.5;}
    else {shape=map[input[i]]||'sil';weight=/[.,!?;:]/.test(input[i])?2.3:input[i]===' '?.6:1;}
    sounds.push({shape,weight,startChar,endChar:i+1});
  }
  const total=sounds.reduce((s,p)=>s+p.weight,0)||1;let cursor=0;
  return sounds.map(p=>{const start=cursor/total;cursor+=p.weight;return{...p,start,end:cursor/total};});
}
export function speechPose(characterId){
  const s=speechState;
  if(s?.native&&s.id===characterId){
    if(!s.playing||!window.speechSynthesis.speaking||window.speechSynthesis.paused)return {};
    // Word boundary events are optional for device voices. Keep advancing through
    // the utterance when a voice omits them instead of freezing at its first space.
    const elapsed=(performance.now()-s.boundaryAt)/1000;
    const char=Math.min(s.text.length-.001,s.boundaryIndex+elapsed*13* s.utterance.rate),shape=s.timeline.find(p=>char>=p.startChar&&char<p.endChar)?.shape;
    const pose=shape&&shape!=='sil'?{[shape]:.68}:{};document.body.dataset.speechMouth=shape||'sil';return pose;
  }
  if(!s||s.id!==characterId||s.audio.paused||!Number.isFinite(s.audio.duration)||!s.audio.duration)return {};
  let amplitude=.65;
  if(s.analyser){s.analyser.getFloatTimeDomainData(s.samples);let power=0;for(const v of s.samples)power+=v*v;const rms=Math.sqrt(power/s.samples.length);s.rmsPeak=Math.max(.008,rms,(s.rmsPeak||.02)*.995);amplitude=Math.min(1,Math.max(0,(rms-.0006)/s.rmsPeak*1.35));}
  s.audio.dataset.mouthLevel=amplitude.toFixed(3);
  if(amplitude<.025)return {};
  const t=s.audio.currentTime/s.audio.duration,at=s.timeline.findIndex(p=>t<p.end),index=at<0?s.timeline.length-1:at,now=s.timeline[index];
  if(!now||now.shape==='sil')return {};
  const pose={[now.shape]:amplitude*.8},fraction=(t-now.start)/Math.max(.001,now.end-now.start),next=s.timeline[index+1];
  if(next&&next.shape!=='sil'&&fraction>.65){const mix=(fraction-.65)/.35*.4;pose[now.shape]*=1-mix;pose[next.shape]=(pose[next.shape]||0)+amplitude*mix;}
  return pose;
}
async function playNativeSpeech(text,voice,id,g){
  if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)return false;
  window.speechSynthesis.cancel();
  return new Promise(resolve=>{
    const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.96;utterance.volume=.9;
    const voices=window.speechSynthesis.getVoices().filter(v=>v.lang.startsWith('en')),female=/female/.test(voice||''),candidate=voices.find(v=>(female?/zira|samantha|victoria|female|aria/i:/david|daniel|alex|\bmale\b|guy/i).test(v.name));if(candidate)utterance.voice=candidate;
    const state={native:true,id,text,utterance,timeline:phonemes(text),playing:false,boundaryIndex:0,boundaryAt:performance.now()};speechState=state;
    let finished=false;const done=ok=>{if(finished)return;finished=true;if(speechState===state)speechState=null;if(speechCancel===cancel)speechCancel=null;document.body.dataset.speechState=ok?'finished':'unavailable';resolve(ok);};const cancel=()=>done(false);speechCancel=cancel;
    utterance.onstart=()=>{if(g!==speechGen){done(false);return;}state.playing=true;state.boundaryAt=performance.now();document.body.dataset.speechState='playing-native';};
    utterance.onboundary=e=>{state.boundaryIndex=e.charIndex;state.boundaryAt=performance.now();};utterance.onend=()=>done(true);utterance.onerror=()=>done(false);
    if(g===speechGen){window.speechSynthesis.speak(utterance);setTimeout(()=>{if(!state.playing)done(false);},8000);}else done(false);
  });
}
async function playSpeech(text,voice,id,g){
  if(g!==speechGen)return;speechBusy=true;
  try{
    const api=speechApi();const result=api?.textToSpeech?await api.textToSpeech({text,voice:voice||'en-female'}):null;
    if(g!==speechGen||muted)return;
    if(!result?.url){await playNativeSpeech(text,voice,id,g);return;}
    const audio=new Audio();audio.crossOrigin='anonymous';audio.src=result.url;audio.volume=.88;audio.hidden=true;audio.dataset.character=id||'narration';audio.dataset.speech='tts';document.body.append(audio);speechAudio=audio;document.body.dataset.speechState='playing-audio';
    const state={id,audio,timeline:phonemes(text),analyser:null};speechState=state;
    let source;
    try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();source=audioContext.createMediaElementSource(audio);const analyser=audioContext.createAnalyser();analyser.fftSize=512;source.connect(analyser).connect(audioContext.destination);state.analyser=analyser;state.samples=new Float32Array(analyser.fftSize);}catch{}
    const played=await new Promise(resolve=>{let finished=false;const done=ok=>{if(finished)return;finished=true;source?.disconnect();audio.remove();document.body.dataset.speechState=ok?'finished':'unavailable';if(speechState===state)speechState=null;if(speechAudio===audio)speechAudio=null;resolve(ok);};audio.onended=()=>done(true);audio.onerror=()=>done(false);audio.onpause=()=>{if(g!==speechGen)done(false);};audio.play().catch(()=>done(false));});
    if(!played&&g===speechGen)await playNativeSpeech(text,voice,id,g);
  }catch(e){if(g===speechGen){console.warn('TTS audio unavailable; trying device speech',e?.message||e);await playNativeSpeech(text,voice,id,g);}}
  finally{if(g===speechGen)speechBusy=false;}
}
export function speak(text,voice,characterId){
  if(muted||!text)return Promise.resolve();
  const g=speechGen;queuedSpeech++;
  const job=speechQueue.then(()=>playSpeech(text,voice,characterId,g)).finally(()=>{if(g===speechGen)queuedSpeech=Math.max(0,queuedSpeech-1);});speechQueue=job.catch(()=>{});return job;
}
// Narration never drives a character mouth or builds a backlog.
export function narrate(text,voice){if(speechBusy||queuedSpeech)return false;return speak(text,voice,null);}
export function stopSpeak(){speechGen++;speechCancel?.();speechCancel=null;speechBusy=false;queuedSpeech=0;speechState=null;const a=speechAudio;speechAudio=null;a?.pause();speechQueue=Promise.resolve();try{window.speechSynthesis?.cancel();}catch{}}
