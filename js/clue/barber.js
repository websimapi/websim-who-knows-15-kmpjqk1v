// Host-authoritative haircut task, consent, stealth and chair session.
import {HAIR_LENGTHS} from './hair-catalog.js';
import {HAIR_GROOMS,normalizeHairState} from './hair-state.js';
import {trait} from './souls.js';
import {bumpTrust} from './ai.js';
import {FURN_BY_ID,SEATS,local} from './layout.js';
import {losClear} from './nav.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const seat=()=>SEATS.find(s=>s.fid==='barber_chair');
const sum=a=>a.reduce((x,y)=>x+y,0);
export const BarberMethods={
  hairRemaining(id){const lengths=(HAIR_LENGTHS[id]||[]).slice();for(const [i,length] of this.haircuts[id]?.cuts||[])if(lengths[i]!==undefined)lengths[i]=Math.min(lengths[i],length);return lengths;},
  hairPeople(){return this.living().filter(c=>this.isHumanAvatar(c)&&sum(this.hairRemaining(c.id))>sum(HAIR_LENGTHS[c.id]||[])*.18);},
  canReceiveHairTask(c){return this.isHumanAvatar(c)&&this.hairPeople().length>=2&&this.hairPeople().some(v=>v!==c);},
  hairKnife(c){return this.toolInHand(c,'kitchen_knife');},
  hairGate(c,v,reach=2.8){return !!(c?.alive&&v?.alive&&c!==v&&!c.ko&&!v.ko&&this.phase==='day'&&!this.overtime&&this.isHumanAvatar(c)&&this.isHumanAvatar(v)&&this.hairKnife(c)&&distance(c,v)<=reach&&losClear(c.x,c.z,v.x,v.z,this.doors));},
  canAskHair(c,v){return this.hairGate(c,v)&&((c.task?.id==='haircut'&&!c.task.complete)||c.isKiller)&&this.hairPeople().includes(v);},
  askHair(c,target){
    const v=this.chars.get(target);if(!this.canAskHair(c,v))return this.toast(c,'Hold the Kitchen Knife and ask a living guest with hair about your haircut task.');
    if(this.barber||this.barberOffer)return this.toast(c,'The barber chair is reserved.');
    if((c.hairAskAt||0)>this.time)return; c.hairAskAt=this.time+12;
    const bonus=Math.round((trait(c.id,'stealth')-.5)*6+(trait(c.id,'persuasion')-.5)*4),dc=Math.round(10+trait(v.id,'observation')*7-(v.trust?.[c.id]||0));
    const roll=1+Math.floor(Math.random()*20),success=roll===20||roll!==1&&roll+bonus>=dc;
    this.showDialogueRoll(c,v,'Share haircut task',{roll,bonus,dc,success},success?'Your explanation is convincing. They can still decline.':'They do not trust the proposed haircut.');
    if(!success){bumpTrust(v,c.id,-.25);return;}
    if(v.convo)this.endConvo(v.convo,true);if(c.convo)this.endConvo(c.convo,true);
    if(v.human){this.barberOffer={actor:c.id,target:v.id,expires:this.time+22};this.toSeat(v.id,{type:'hairOffer',actor:c.id});this.toast(c,'Waiting for permission.');}
    else this.startBarber(c,v,'chair');
  },
  hairReply(c,accept){
    const offer=this.barberOffer;if(!offer||offer.target!==c.id)return;this.barberOffer=null;this.toSeat(c.id,{type:'hairOffer',actor:null});
    const actor=this.chars.get(offer.actor);if(!accept)return this.toast(actor,'They declined the haircut.');
    if(offer.expires<this.time||!this.hairGate(actor,c))return this.toast(actor,'The haircut invitation expired.');
    this.startBarber(actor,c,'chair');
  },
  startBarber(c,v,mode){
    if(this.barber||!this.hairGate(c,v))return;
    const chair=seat();if(mode==='chair'&&(this.seatsTaken.has(chair.id)||c.seat||v.seat))return this.toast(c,'The barber chair or guest is unavailable.');
    const initial=this.hairRemaining(v.id);this.barber={actor:c.id,target:v.id,mode,stage:mode==='chair'?'walking':'cutting',started:this.time,expires:this.time+(mode==='chair'?100:9),initial:sum(initial),removed:0,lastStroke:-99,opened:false};
    if(mode!=='chair'){this.openBarber(c,v);return;}
    const stand=local('bathroom',6.8,4.20),approach=local('bathroom',6.8,6.55);
    for(const [person,point] of [[c,stand],[v,approach]]){
      person.barberLocked=true;if(person.chat)this.endChat(person);
      this.goTo(person,point.x,point.z,{reach:1,barber:true,arrive:()=>{person.auto=null;person.path=null;person.mv=0;person.barberArrived=true;}});person.auto=person.path;
      this.toast(person,'Walk to the bathroom barber chair. You can cancel with Stand / Leave.');
    }
  },
  openBarber(c,v){
    const session=this.barber;if(!session||session.opened)return;session.opened=true;
    if(c.human)this.toSeat(c.id,{type:'barberOpen',target:v.id,mode:session.mode,canKill:session.mode==='chair'&&c.isKiller&&this.killAllowed()&&!v.isKiller,state:this.haircuts[v.id]||null});
  },
  cancelBarber(reason='Haircut ended.'){
    const session=this.barber;if(!session)return;this.barber=null;
    for(const id of [session.actor,session.target]){
      const c=this.chars.get(id);if(!c)continue;c.barberLocked=false;c.barberArrived=false;
      if(c.plan?.barber){c.auto=null;c.path=null;c.plan=null;}
      if(c.seat===seat().id)this.stand(c);
      this.toSeat(id,{type:'barberClose'});if(c.human)this.toast(c,reason);
    }
  },
  sneakHair(c,target){
    const v=this.chars.get(target);if(this.barber||!this.canAskHair(c,v)||(c.hairSneakAt||0)>this.time)return;
    c.hairSneakAt=this.time+15;
    const roll=1+Math.floor(Math.random()*20),bonus=Math.round((trait(c.id,'stealth')-.5)*12),dc=Math.round(9+trait(v.id,'observation')*10+(this.sees(v,c)?5:0)),success=roll===20||roll!==1&&roll+bonus>=dc;
    this.showDialogueRoll(c,v,'Sneak cut',{roll,bonus,dc,success},success?'A brief opening. Cut quickly and stay close.':'They notice the knife near their hair.');
    if(!success){bumpTrust(v,c.id,-1);this.toast(v,'You spotted '+c.id+' trying to cut your hair without permission.');return;}
    this.startBarber(c,v,'sneak');
  },
  barberCut(c,state){
    const s=this.barber,v=s&&this.chars.get(s.target);
    if(!s||s.actor!==c.id||s.stage!=='cutting'||!this.hairGate(c,v)||this.time-s.lastStroke<.10)return;
    if(s.mode==='chair'&&v.seat!==seat().id)return;
    const valid=normalizeHairState(v.id,state);if(!valid)return;
    const old=this.hairRemaining(v.id),newLengths=old.slice();let removed=0;
    for(const [id,length] of valid.cuts){const next=Math.min(old[id],Math.max(0,length));removed+=old[id]-next;newLengths[id]=next;}
    if(removed<=0)return;
    s.lastStroke=this.time;
    const next={schema:1,groom:HAIR_GROOMS[v.id][0],cuts:newLengths.flatMap((length,id)=>length<(HAIR_LENGTHS[v.id][id]||0)?[[id,length]]:[])};
    if(!this.recordHaircut(v.id,next))return;
    s.removed+=removed;s.progress=Math.min(1,s.removed/Math.max(1,s.initial*.15));
    if(c.task?.id==='haircut'&&!c.task.complete){c.workProgress.haircut=s.progress;this.sendTask(c);if(s.progress>=1)this.completeTask(c,'haircut');}
    this.toSeat(c.id,{type:'barberProgress',progress:s.progress});
  },
  barberBetray(c){
    const s=this.barber,v=s&&this.chars.get(s.target);
    if(!s||s.actor!==c.id||s.mode!=='chair'||s.stage!=='cutting'||!c.isKiller||v?.isKiller||!this.killAllowed()||!this.hairGate(c,v)||v.seat!==seat().id||this.roundWound&&this.roundWound.victim!==v.id)return;
    this.cancelBarber('The haircut was interrupted.');this.commitKill(c,v,null,false,'kitchen_knife');
  },
  updateBarber(dt){
    if(this.barberOffer&&(this.barberOffer.expires<this.time||this.phase!=='day'||!this.chars.get(this.barberOffer.target)?.alive||!this.chars.get(this.barberOffer.actor)?.alive)){
      this.toSeat(this.barberOffer.target,{type:'hairOffer',actor:null});this.barberOffer=null;
    }
    const eligible=this.hairPeople();
    for(const c of this.chars.values())if(c.task?.id==='haircut'&&!c.task.complete&&(!this.isHumanAvatar(c)||!eligible.some(v=>v!==c)||eligible.length<2)){
      c.task={day:this.day,id:'none',complete:true,waived:true};this.sendTask(c);this.toast(c,'Haircut task waived: fewer than two living human avatars with usable hair remain.');
    }
    const s=this.barber;if(!s)return;const c=this.chars.get(s.actor),v=this.chars.get(s.target);
    if(!c?.alive||!v?.alive||c.ko||v.ko||this.phase!=='day'||this.overtime||this.time>s.expires||!this.hairKnife(c)||!this.isHumanAvatar(v)){this.cancelBarber('Haircut cancelled.');return;}
    if(s.stage==='walking'){
      for(const person of [c,v]){
        if(person.barberArrived)continue;
        if(person.path?.length)this.walk(person,dt,true);
        else if(person.plan?.arrive){const fn=person.plan.arrive;person.plan.arrive=null;if(distance(person,person.plan.goal)<1.4)fn();else{this.cancelBarber('The barber chair could not be reached.');return;}}
        else{this.cancelBarber('The route to the chair was interrupted.');return;}
      }
      if(c.barberArrived&&v.barberArrived){this.sit(v,seat().id);if(v.seat!==seat().id){this.cancelBarber('The barber chair is unavailable.');return;}s.stage='cutting';s.expires=this.time+100;c.yaw=Math.atan2(v.x-c.x,v.z-c.z);this.openBarber(c,v);}
    }else{
      if(!this.hairGate(c,v)||s.mode==='chair'&&v.seat!==seat().id){this.cancelBarber('Haircut ended.');return;}
      if(!c.human&&this.time-s.lastStroke>.6){
        const old=this.hairRemaining(v.id),fraction=.98,next={schema:1,groom:HAIR_GROOMS[v.id][0],cuts:old.map((length,id)=>[id,Math.floor(length*fraction)])};this.barberCut(c,next);
        if(s.progress>=1)this.cancelBarber('Haircut finished.');
      }
    }
  },
  pursueHairTask(c){
    if(this.barber?.actor===c.id)return true;
    if(!this.hairKnife(c)){const knife=this.props.byId.get('kitchen_knife');if(!knife||knife.holder||knife.hidden||knife.atBody)return false;this.goTo(c,knife.x,knife.z+.8,{reach:2,arrive:()=>this.grab(c,knife.id)});return true;}
    const target=this.hairPeople().filter(v=>v!==c&&!v.convo&&!v.barberLocked).sort((a,b)=>distance(c,a)-distance(c,b))[0];if(!target)return false;
    if(distance(c,target)>2)this.goTo(c,target.x,target.z,{reach:2,arrive:()=>this.askHair(c,target.id)});else this.askHair(c,target.id);
    c.wait=3;return true;
  }
};
