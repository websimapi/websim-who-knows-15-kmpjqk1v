// Physical task input. The host still awards progress and trust.
import * as THREE from 'three';
import { TASK_BY_ID } from './tasks.js';
import { sfx } from './audio.js';
import { POOL } from './layout.js';

const TAU = Math.PI * 2;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const drift = t => ({ x: (Math.sin(t * 1.7) * 95 + Math.sin(t * 3.3) * 38) / 150 * .31, y: -(Math.cos(t * 1.3) * 75 + Math.sin(t * 2.6) * 32) / 150 * .31 });
const dartScore = p => { const r = Math.hypot(p.x,p.y); return r < .025 ? 50 : r < .062 ? 25 : r < .145 ? 20 : r < .232 ? 10 : r < .31 ? 5 : 0; };

export class WorldTask {
  constructor(view, player, id, send) {
    this.view=view; this.player=player; this.task=TASK_BY_ID[id]; this.id=id; this.send=send;
    this.active=true; this.focus=true; this.selected=0; this.cleared=[]; this.darts=[]; this.score=0;
    this.aim={x:0,y:0}; this.order=[2,0,3,1]; this.turns=0; this.angle=-Math.PI/2; this.power=.3;
    this.drag=null; this.start=performance.now();
    if (id==='paint') {
      this.sketch=document.createElement('canvas'); this.sketch.width=256; this.sketch.height=320;
      const c=this.sketch.getContext('2d'); c.fillStyle='#eee4cf'; c.fillRect(0,0,256,320);
      this.covered=new Set(); this.lastPaint=null;
    }
    player.hud.taskReflection('start',this.task);
  }
  close(done=false) {
    if (!this.active) return;
    this.active=false; this.focus=false; this.view.taskObjects.local=null;
    if (this.id==='defrag') this.send({type:'stand'});
    this.player.hud.taskReflection(done?'complete':'abandon',this.task);
  }
  finish(extra={}) {
    if (this.finished) return;
    this.finished=true; sfx('done'); this.send({type:'taskDone',id:this.id,...extra}); this.close(true);
  }
  step(progress,extra={}) { this.send({type:'taskStep',id:this.id,progress,...extra}); }
  hint() {
    const n=this.cleared.length;
    if (this.id==='bathroom') return 'Hold and scrub grime on the mirror and counter · '+n+'/6';
    if (this.id==='darts') return this.collect?'Walk to the board and pick up your darts':this.returning?'Return to the throwing line':'Click to throw · '+this.darts.length+'/3 darts · '+this.score+'/60';
    if (this.id==='defrag') return this.runAt?'Defragmenting…':'Click red fragments on the computer · '+(12-n)+' left';
    if (this.id==='paint') return this.generating?'The painting is taking shape…':'Brush across the canvas on the easel';
    if (this.id==='books') return 'Click two books to swap · shortest to tallest';
    if (this.id==='papers') return 'Pick up pages in order · next '+(n+1);
    if (this.id==='lettuce') return 'Cut the lettuce on the board · '+n+'/6';
    if (this.id==='clock') return 'Drag the clock hand to the green mark';
    if (this.id==='pool') return 'Aim on the real table · click to shoot · arrows adjust aim and power';
    return 'Turn the gramophone crank in circles';
  }
  update(snap,row) {
    if (!this.active) return;
    if (snap.ph!=='day'||snap.ot||!row?.[5]||row[16]||row[6]||Math.hypot(row[1]-this.task.x,row[2]-this.task.z)>3.3) { this.close(); return; }
    if (this.id==='darts') {
      this.aim=drift((performance.now()-this.start)/1000);
      this.nearBoard=this.collect && Math.hypot(row[1]-this.task.x,row[2]-this.task.z)<1.15;
      if (this.returning && Math.hypot(row[1]-(this.task.x+1.9),row[2]-this.task.z)<.65) { this.returning=false; this.focus=true; }
    }
    if (this.id==='defrag'&&this.runAt&&performance.now()-this.runAt>3200) this.finish();
    if (this.id==='pool') {
      this.ball=snap.pool?.[0] || [POOL.x,POOL.z,false]; this.moving=!!snap.poolMoving;
      if (this.player.hud.task?.id==='pool'&&this.player.hud.task.complete) this.close(true);
    }
    this.view.taskObjects.local=this;
  }
  input(inp) {
    if (!this.active) return false;
    if (inp.back) { this.close(); return true; }
    if (this.id==='darts'&&(this.collect||this.returning)) {
      if (this.collect&&inp.act&&this.nearBoard) {
        this.collect=false; this.returning=true; this.nearBoard=false; this.darts=[]; this.score=0;
        this.step(0,{darts:[]}); sfx('dart',.35); return true;
      }
      return false;
    }
    if (this.id==='pool') {
      if (inp.left) this.angle-=.035; if (inp.right) this.angle+=.035;
      if (inp.up) this.power=Math.min(1,this.power+.05); if (inp.down) this.power=Math.max(.05,this.power-.05);
      if (inp.confirm||inp.act) this.shoot();
      return true;
    }
    if (inp.left||inp.up) this.selected=(this.selected+this.count()-1)%this.count();
    if (inp.right||inp.down) this.selected=(this.selected+1)%this.count();
    if (inp.confirm||inp.act) { this.choose(this.selected,null,true); return true; }
    return true;
  }
  count() { return this.id==='bathroom'||this.id==='lettuce'?6:this.id==='papers'?5:this.id==='books'?4:this.id==='defrag'?12:1; }
  pointer(event,type,cam,rect) {
    if (!this.active||!this.focus) return false;
    if (this.id==='pool') {
      const ndc=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height*2-1));
      const ray=new THREE.Raycaster(); ray.setFromCamera(ndc,cam);
      const at=new THREE.Vector3();
      if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-POOL.y),at)) {
        this.angle=Math.atan2(at.z-(this.ball?.[1]??POOL.z),at.x-(this.ball?.[0]??POOL.x));
      }
      if (type==='down') this.shoot();
      return true;
    }
    const hit=this.view.taskObjects.hit(this.id,cam,event.clientX,event.clientY,rect);
    if (type==='down') {
      if (!hit && this.id!=='darts') return true;
      this.drag={x:event.clientX,y:event.clientY,angle:this.screenAngle(event,cam,rect)};
      if (this.id!=='bathroom'&&this.id!=='music'&&this.id!=='clock'&&this.id!=='paint') this.choose(hit?.index??0,hit?.uv,false);
      if (this.id==='paint'&&hit) this.paint(hit.uv);
    } else if (type==='move'&&this.drag) {
      if (this.id==='bathroom'&&hit) this.scrub(hit.index,Math.hypot(event.clientX-this.drag.x,event.clientY-this.drag.y));
      else if (this.id==='music'||this.id==='clock') {
        const a=this.screenAngle(event,cam,rect),d=wrap(a-this.drag.angle);
        if (this.id==='music'&&d>0&&d<1) {
          const before=this.turns; this.turns+=d/TAU;
          if (this.turns>=5) this.finish();
          else if (Math.floor(before*4)!==Math.floor(this.turns*4)) this.step(this.turns/5);
        }
        if (this.id==='clock'&&Math.abs(d)<1) {
          this.angle-=d; this.clockTravel=(this.clockTravel||0)+Math.abs(d);
          if (performance.now()-(this.lastClockStep||0)>180) { this.lastClockStep=performance.now(); this.step(Math.min(.95,this.clockTravel/TAU),{angle:this.angle}); }
          if (this.clockTravel>.5&&Math.abs(wrap(this.angle))<.12) this.finish();
        }
        this.drag.angle=a;
      } else if (this.id==='paint'&&hit) this.paint(hit.uv);
      this.drag.x=event.clientX; this.drag.y=event.clientY;
    } else if (type==='up') { this.drag=null; this.lastPaint=null; }
    return true;
  }
  screenAngle(event,cam,rect) {
    const pos=new THREE.Vector3(this.task.x,this.task.y,this.task.z).project(cam);
    const cx=rect.left+(pos.x+1)*rect.width/2,cy=rect.top+(1-pos.y)*rect.height/2;
    return Math.atan2(event.clientY-cy,event.clientX-cx);
  }
  shoot() {
    if (this.moving||performance.now()<(this.pending||0)) return;
    this.pending=performance.now()+800;
    this.send({type:'pool',dx:Math.cos(this.angle),dz:Math.sin(this.angle),power:this.power});
  }
  scrub(index,d) {
    if (this.cleared.includes(index)||index<0||index>5) return;
    this.scrubbed ||= Array(6).fill(0); this.scrubbed[index]+=d;
    if (d>2&&Math.random()<.08) sfx('scrub',.25);
    if (d>1&&performance.now()-(this.lastScrubStep||0)>180) { this.lastScrubStep=performance.now(); this.step((this.cleared.length+Math.min(1,this.scrubbed[index]/85))/6); }
    if (this.scrubbed[index]>=85) {
      this.cleared.push(index); sfx('scrub'); this.step(this.cleared.length/6);
      if (this.cleared.length===6) this.finish();
    }
  }
  choose(index,uv,keyboard=false) {
    if (this.finished) return;
    if (this.id==='bathroom') { this.scrub(index,keyboard?35:8); return; }
    if (this.id==='lettuce') {
      if (!this.cleared.includes(index)) { this.cleared.push(index); sfx('chop'); this.step(this.cleared.length/6); if (this.cleared.length===6) this.finish(); }
    } else if (this.id==='darts') {
      if (this.darts.length>=3||this.collect||this.returning) return;
      const p={...this.aim,s:dartScore(this.aim)}; this.darts.push(p); this.score+=p.s;
      sfx('dart'); this.step(this.darts.length/3,{darts:this.darts});
      if (this.darts.length===3) { if (this.score>=60) this.finish({score:this.score}); else { this.collect=true; this.focus=false; this.drag=null; } }
    } else if (this.id==='defrag') {
      const red=Array.from({length:60},(_,i)=>i).filter(i=>(i*7)%5===0);
      const col=uv?Math.floor((uv.x*128-8)/9.5):-1, row=uv?Math.floor(((1-uv.y)*96-10)/11):-1;
      const i=keyboard?red[index%red.length]:col>=0&&col<12&&row>=0&&row<5?row*12+col:-1;
      if (red.includes(i)&&!this.cleared.includes(i)) {
        this.cleared.push(i); sfx('beep',.5); this.step(this.cleared.length/12);
        if (this.cleared.length===12) this.runAt=performance.now();
      }
    } else if (this.id==='papers') {
      if (index===this.cleared.length) { this.cleared.push(index); sfx('card'); this.step(this.cleared.length/5); if (this.cleared.length===5) this.finish(); }
    } else if (this.id==='books') {
      if (this.selectedBook==null) this.selectedBook=this.order.indexOf(index);
      else {
        const slot=this.order.indexOf(index);
        [this.order[this.selectedBook],this.order[slot]]=[this.order[slot],this.order[this.selectedBook]];
        this.selectedBook=null; this.selected=slot; sfx('card');
        this.step(this.order.filter((n,i)=>n===i).length/4);
        if (this.order.every((n,i)=>n===i)) this.finish();
      }
    } else if (this.id==='music'&&keyboard) {
      this.turns+=.25; if (this.turns>=5) this.finish(); else this.step(this.turns/5);
    } else if (this.id==='clock'&&keyboard) {
      this.angle+=Math.PI/12; this.clockTravel=(this.clockTravel||0)+Math.PI/12;
      this.step(Math.min(.95,this.clockTravel/TAU),{angle:this.angle});
      if (this.clockTravel>.5&&Math.abs(wrap(this.angle))<.12) this.finish();
    } else if (this.id==='paint'&&keyboard) this.paint({x:Math.random(),y:Math.random()});
  }
  paint(uv) {
    if (this.generating||!uv) return;
    const x=uv.x*256,y=(1-uv.y)*320,c=this.sketch.getContext('2d');
    const colors=['#303b5b','#8d453b','#bd8e4b','#536b56'];
    c.strokeStyle=colors[Math.floor(this.covered.size/18)%colors.length]; c.lineWidth=20; c.lineCap='round';
    c.beginPath(); c.moveTo(this.lastPaint?.x??x,this.lastPaint?.y??y); c.lineTo(x,y); c.stroke(); this.lastPaint={x,y};
    this.paintRevision=(this.paintRevision||0)+1;
    for (const [dx,dy] of [[0,0],[-10,0],[10,0],[0,-10],[0,10]]) this.covered.add(Math.floor((x+dx)/25)+','+Math.floor((y+dy)/26));
    if (Math.floor(this.covered.size/10)!==this.paintStep) { this.paintStep=Math.floor(this.covered.size/10); this.step(Math.min(.95,this.covered.size/55)); }
    if (this.covered.size>=55) this.generatePainting();
  }
  async generatePainting() {
    if (this.generating) return; this.generating=true;
    let url=null;
    try {
      const res=await window.websim.imageGen({prompt:'An expressive oil painting of a midnight mansion, based on this guest’s painted composition. Moody 1920s gothic palette, visible brushwork.',width:768,height:1024,image_inputs:[{url:this.sketch.toDataURL('image/jpeg',.8)}]});
      url=res?.url||null;
    } catch(e) { console.warn('Painting generation failed',e); }
    if (!url) try {
      const blob=await new Promise(r=>this.sketch.toBlob(r,'image/jpeg',.85));
      url=await window.websim.upload(new File([blob],'painting.jpg',{type:'image/jpeg'}));
    } catch(e) { console.warn('Painting upload failed',e); }
    if (this.active) this.finish({url,title:'The mansion at midnight'});
  }
}
