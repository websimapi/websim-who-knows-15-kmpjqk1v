// Preview haircuts are local studies, not changes to an active game match.
import * as THREE from 'three';
import {SUSPECT_BY_ID,BUTLER} from './data.js';
import { speak,stopSpeak,unlockSpeech } from './audio.js';
export function installHairPreviewControls({avatar,camera,renderer,controls,status}){
  if(!avatar?.haircuts)return {wind:[0,0,0]};
  const panel=document.querySelector('.controls'),group=document.createElement('span');group.style.cssText='display:contents';
  group.innerHTML='<button type="button" id="speakSample">Speak sample</button><button type="button" id="inspectShoes">Inspect shoes</button><button type="button" id="inspectTorso">Inspect outfit</button><button type="button" id="portraitFront">Front</button><button type="button" id="portraitSide">Side</button><button type="button" id="portraitBack">Back</button><button type="button" id="hairScissors" aria-pressed="false">Scissors</button><button type="button" id="hairTrim">Trim 25%</button><button type="button" id="hairShort">Cut to half</button><button type="button" id="hairShave">Shave</button><button type="button" id="hairReset">Reset hair</button>';
  panel.insertBefore(group,panel.querySelector('a'));
  let wind=document.getElementById('wind');
  if(!wind){const label=document.createElement('label');label.innerHTML='Wind <select id="wind" aria-label="Hair wind"><option value="0">Calm</option><option value="2" selected>Breeze</option><option value="5">Gusts</option></select>';panel.insertBefore(label,group);wind=label.querySelector('select');}
  if(avatar.lips){
    avatar.lips.previewDiagnostics=true;
    const label=document.createElement('label');
    label.innerHTML='Mouth <select aria-label="Mouth pose"><option value="audio">Speech audio</option><option value="aa">AH / open</option><option value="I">EE / wide</option><option value="O">OO / round</option><option value="PP">Closed lips</option></select>';
    panel.insertBefore(label,group);
    label.querySelector('select').onchange=e=>{avatar.lips.previewPose=e.target.value==='audio'?null:{[e.target.value]:.85};};
  }
  group.querySelector('#speakSample').onclick=async()=>{unlockSpeech();if(avatar.lips){avatar.lips.previewPose=null;avatar.lips.peakActivity=0;panel.querySelector('[aria-label="Mouth pose"]').value='audio';}stopSpeak();status.textContent='Preparing spoken sample…';const played=await speak('Perhaps we should compare what we actually saw before we decide who to trust.',(avatar.id==='butler'?BUTLER:SUSPECT_BY_ID[avatar.id])?.voice,avatar.id);status.textContent=played?'Spoken sample finished':`Speech unavailable: ${document.body.dataset.speechError||document.body.dataset.speechState}. Check Character voices in Settings.`;};
  group.querySelector('#inspectShoes').onclick=()=>{camera.position.set(.62,.32,.75);controls.target.set(0,.10,-.04);status.textContent='Soul-specific footwear · rounded toe, shaped heel and contoured sole';};
  group.querySelector('#inspectTorso').onclick=()=>{camera.position.set(.42,1.42,.82);controls.target.set(0,1.29,0);};
  function portrait(offset){
    avatar.root.updateMatrixWorld(true);
    let eyes;avatar.model.traverse(o=>{if(o.isSkinnedMesh&&o.name.endsWith('_Eyes'))eyes=o;});
    const center=new THREE.Vector3();
    if(eyes){eyes.computeBoundingBox();eyes.boundingBox.getCenter(center).applyMatrix4(eyes.matrixWorld);center.y-=.035;}
    else avatar.headWorld(center).add(new THREE.Vector3(0,.035,0));
    controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(...offset));
  }
  for(const [id,offset] of [['portraitFront',[0,.035,.85]],['portraitSide',[.85,.035,0]],['portraitBack',[0,.035,-.85]]])group.querySelector('#'+id).onclick=()=>portrait(offset);
  const inspectFace=document.getElementById('face');if(inspectFace)inspectFace.onclick=()=>portrait([.24,.055,.76]);
  const key='character-hair-study:'+avatar.id;let scissors=false,lastCut=0;
  try{const saved=sessionStorage.getItem(key);if(saved)avatar.haircuts.apply(JSON.parse(saved));}catch{}
  function save(count){
    try{sessionStorage.setItem(key,JSON.stringify(avatar.haircuts.serialize()));}catch{}
    const cut=avatar.haircuts.serialize();document.body.dataset.cutStrands=String(cut.cuts.length);document.body.dataset.hairStrands=String(avatar.haircuts.records.length);
    document.body.dataset.haircutVersion=String(avatar.haircuts.version);
    status.textContent=count===undefined?'Preview groom restored':`${count} fibers cut · preview only`;
  }
  const button=group.querySelector('#hairScissors');button.onclick=()=>{scissors=!scissors;controls.enabled=!scissors;button.setAttribute('aria-pressed',String(scissors));button.classList.toggle('active',scissors);renderer.domElement.style.cursor=scissors?'crosshair':'';status.textContent=scissors?'Drag across the hair to cut · preview only':'Drag to orbit';};
  group.querySelector('#hairTrim').onclick=()=>save(avatar.haircuts.trim(.75));
  group.querySelector('#hairShort').onclick=()=>save(avatar.haircuts.trim(.5));
  group.querySelector('#hairShave').onclick=()=>save(avatar.haircuts.trim(0));
  group.querySelector('#hairReset').onclick=()=>{avatar.haircuts.reset();save();};
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const stroke=e=>{
    if(!scissors||(e.type==='pointermove'&&!e.buttons)||performance.now()-lastCut<65)return;
    lastCut=performance.now();e.preventDefault();
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);save(avatar.haircuts.cutAtRay(raycaster.ray,.018));
  };
  renderer.domElement.addEventListener('pointerdown',stroke);renderer.domElement.addEventListener('pointermove',stroke);
  document.body.dataset.hairStrands=String(avatar.haircuts.records.length);document.body.dataset.cutStrands=String(avatar.haircuts.serialize().cuts.length);
  return {get wind(){const speed=Number(wind.value)||0;return [speed*.85,0,speed*.4];}};
}
