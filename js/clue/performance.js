// Bounded numeric diagnostics. Never record speech, messages, player positions or identity.
const VERSION='hair-speech-dialogue-v48';
export class PerformanceJournal{
  constructor(){
    this.session=crypto.randomUUID();this.started=performance.now();this.sent=0;this.pending=false;this.reset();
    try{this.observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){this.longTasks++;this.longestTask=Math.max(this.longestTask,entry.duration);}});this.observer.observe({type:'longtask',buffered:false});}catch{}
    document.addEventListener('visibilitychange',()=>{this.reset();});
  }
  reset(){this.since=performance.now();this.frames=0;this.work=0;this.max=0;this.slow=0;this.longTasks=0;this.longestTask=0;this.worst=[];}
  async send(report){
    if(this.pending||this.sent>=40||document.hidden)return;
    this.pending=true;this.sent++;
    try{const response=await fetch('/api/performance-log',{signal:AbortSignal.timeout(10000),method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:this.session,report:{version:VERSION,...report}}),keepalive:true});document.body.dataset.performanceLog=response.ok?'stored':`unavailable-${response.status}`;}
    catch{document.body.dataset.performanceLog='offline';}finally{this.pending=false;}
  }
  ready(view){this.reset();this.send({kind:'startup',mapReady:document.body.dataset.mapReadiness,preparationMs:Number(document.body.dataset.preparationMs),totalMs:Math.round(performance.now()-this.started),programs:view.renderer.info.programs.length,geometries:view.renderer.info.memory.geometries,textures:view.renderer.info.memory.textures});}
  frame(elapsed,work,update,render,view,context){
    if(document.hidden){this.reset();return;}
    this.frames++;this.work+=work;this.max=Math.max(this.max,work);if(work>50)this.slow++;
    const round=x=>Math.round((x||0)*10)/10;
    if(work>40){this.worst.push({work:round(work),update:round(update),apply:round(view.profileApplyMs),actors:round(view.profileActorsMs),props:round(view.profilePropsMs),world:round(view.profileWorldMs),visibility:round(view.profilePrepareMs),draw:round(view.profileDrawMs),render:round(render),interval:round(elapsed),programs:view.renderer.info.programs.length,geometries:view.renderer.info.memory.geometries});this.worst.sort((a,b)=>b.work-a.work);this.worst.length=Math.min(4,this.worst.length);}
    if(performance.now()-this.since<30000)return;
    const report={kind:'frames',...context,ageSec:Math.round((performance.now()-this.started)/1000),frames:this.frames,fps:round(this.frames*1000/(performance.now()-this.since)),meanWork:round(this.work/this.frames),peakWork:round(this.max),slowFrames:this.slow,longTasks:this.longTasks,longestTask:round(this.longestTask),worst:this.worst,programs:view.renderer.info.programs.length,geometries:view.renderer.info.memory.geometries,textures:view.renderer.info.memory.textures,triangles:view.renderer.info.render.triangles,calls:view.renderer.info.render.calls,mirrors:view.profileMirrorCaptures||0,pixelRatio:round(view.pixelRatio),quality:view.graphics.preset};
    document.body.dataset.performanceSummary=JSON.stringify(report);this.send(report);this.reset();
  }
}
