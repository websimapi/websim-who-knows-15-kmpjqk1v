import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadKit,Avatar} from './avatars.js';
import {SUSPECT_BY_ID} from './data.js';
export class BarberPanel{
  constructor(parent,send){this.parent=parent;this.send=send;this.active=false;this.generation=0;this.cursor=new THREE.Vector2();}
  close(notify=false){
    this.active=false;this.generation++;this.element?.remove();this.element=null;this.controls?.dispose();this.renderer?.dispose();this.avatar?.haircuts?.texture.dispose();this.renderer=null;this.avatar=null;
    if(notify)this.send({type:'hairCancel'});
  }
  offer(actor){
    this.close();if(!actor)return;this.active=true;this.mode='offer';
    const el=document.createElement('section');el.className='pool-panel barber-panel';el.setAttribute('aria-label','Haircut invitation');
    const title=document.createElement('h2');title.textContent='Haircut invitation';const text=document.createElement('p');text.textContent=(SUSPECT_BY_ID[actor]?.name||'A guest')+' asks to cut your hair. Accepting routes both of you to the bathroom barber chair. You may leave at any time.';
    const yes=document.createElement('button'),no=document.createElement('button');yes.textContent='Accept haircut';no.textContent='Decline';
    yes.onclick=()=>{this.send({type:'hairReply',accept:true});this.close();};no.onclick=()=>{this.send({type:'hairReply',accept:false});this.close();};
    el.append(title,text,no,yes);this.parent.append(el);this.element=el;this.buttons=[no,yes];this.selected=0;
  }
  async open(message){
    this.close();this.active=true;this.mode='cut';this.target=message.target;const generation=++this.generation;
    const el=document.createElement('section');el.className='pool-panel barber-panel';el.setAttribute('aria-label','Manual haircut');
    el.innerHTML='<h2>Cut hair</h2><p class="barber-instructions">Drag the knife across hair to cut. Right drag to orbit; scroll to zoom. Cut 15% of the groom for the task.</p><p class="barber-progress" aria-live="polite">Preparing the chair…</p><div class="barber-stage"></div><button class="barber-leave" type="button">Finish / Leave</button>';
    this.parent.append(el);this.element=el;el.querySelector('.barber-leave').onclick=()=>this.close(true);
    this.buttons=[el.querySelector('.barber-leave')];this.selected=0;
    if(message.canKill){const betray=document.createElement('button');betray.textContent='Slit throat';betray.className='danger';betray.onclick=()=>{this.send({type:'hairBetray'});};el.append(betray);this.buttons.push(betray);}
    const kit=await loadKit();if(!this.active||generation!==this.generation)return;
    this.avatar=new Avatar(kit,SUSPECT_BY_ID[message.target]);if(!this.avatar.haircuts){this.close(true);return;}
    this.avatar.haircuts.apply(message.state);this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x171c22);this.scene.add(this.avatar.root);
    this.scene.add(new THREE.HemisphereLight(0xe6edf8,0x3d3329,2));const key=new THREE.DirectionalLight(0xffe6cf,3);key.position.set(-2,3,-2);this.scene.add(key);const fill=new THREE.DirectionalLight(0xc5dcff,1.8);fill.position.set(2,2,2);this.scene.add(fill);
    this.camera=new THREE.PerspectiveCamera(35,1.6,.01,20);this.camera.position.set(-.18,1.42,-.80);
    this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setSize(600,375);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const stage=el.querySelector('.barber-stage');stage.append(this.renderer.domElement);this.renderer.domElement.style.cssText='width:100%;height:auto;cursor:crosshair;touch-action:none';
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,1.30,0);this.controls.mouseButtons.LEFT=null;this.controls.update();
    this.raycaster=new THREE.Raycaster();this.lastCut=0;
    const stroke=e=>{if(e.type==='pointermove'&&!e.buttons||e.button>0||performance.now()-this.lastCut<140)return;e.preventDefault();const r=this.renderer.domElement.getBoundingClientRect();this.cursor.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.cut();};
    this.renderer.domElement.addEventListener('pointerdown',stroke);this.renderer.domElement.addEventListener('pointermove',stroke);this.progress(0);
    let previous=performance.now();const frame=now=>{if(!this.active||generation!==this.generation||!this.renderer)return;const dt=Math.min(.05,(now-previous)/1000);previous=now;this.avatar.update(dt,{x:0,z:0,yaw:0,mv:0,alive:true,seat:true,seatH:.54,wind:[.12,0,.03]});this.controls.update();this.renderer.render(this.scene,this.camera);requestAnimationFrame(frame);};requestAnimationFrame(frame);
  }
  cut(){
    if(!this.avatar||performance.now()-this.lastCut<140)return;this.lastCut=performance.now();this.raycaster.setFromCamera(this.cursor,this.camera);
    const changed=this.avatar.haircuts.cutAtRay(this.raycaster.ray,.022);if(changed)this.send({type:'hairCut',state:this.avatar.haircuts.serialize()});
  }
  progress(value){const label=this.element?.querySelector('.barber-progress');if(label)label.textContent=Math.round(value*100)+'% of required trim'+(value>=1?' · Task complete':'');}
  update(snap,row){
    if(!this.active||this.mode!=='cut')return;
    if(!row?.[5]||row[16]||snap.ph!=='day'||snap.ot||snap.barber?.actor!==row[0]||snap.barber?.target!==this.target){this.close();return;}
    this.progress(snap.barber.progress||0);
    if(this.avatar&&performance.now()-this.lastCut>500)this.avatar.haircuts.apply(snap.haircuts?.[this.target]);
  }
  input(input){
    if(!this.active)return false;if(input.back){if(this.mode==='offer')this.send({type:'hairReply',accept:false});this.close(this.mode!=='offer');return true;}
    if(this.mode==='offer'){if(input.left||input.right||input.up||input.down)this.selected=1-this.selected;if(input.confirm)this.buttons[this.selected].click();}
    else{this.cursor.x=THREE.MathUtils.clamp(this.cursor.x+(input.right ? .07 : input.left ? -.07 : 0),-1,1);this.cursor.y=THREE.MathUtils.clamp(this.cursor.y+(input.up ? .07 : input.down ? -.07 : 0),-1,1);if(input.confirm||input.act)this.cut();}
    this.buttons?.forEach((b,i)=>b.classList.toggle('focus',this.mode==='offer'&&i===this.selected));return true;
  }
}
