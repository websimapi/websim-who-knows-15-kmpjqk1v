// Pinned guide-chain hair dynamics: short groom and long loose hair profiles.
// Fixed 120 Hz Verlet integration, segment constraints and animated colliders.
import * as THREE from 'three';
const STEP = 1 / 120;
export class HairMotion {
  constructor(model, bones) {
    this.model=model; this.bones=bones; this.head=bones.Head; this.guides=[];
    this.acc=0; this.ready=false; this.time=0; this.wind=new THREE.Vector3(.22,0,.10); this.air=new THREE.Vector3(); this.flow=new THREE.Vector3(); this.direction=new THREE.Vector3(); this.delta=new THREE.Vector3(); this.contact=new THREE.Vector3(); this.turnQ=new THREE.Quaternion(); this.long=this.head?.userData.hairProfile==='long';
    this.invHead=new THREE.Matrix4(); this.headWorld=new THREE.Matrix4();
    this.v=new THREE.Vector3(); this.local=new THREE.Vector3();
    this.q=new THREE.Quaternion(); this.parentQ=new THREE.Quaternion();
    this.scale=new THREE.Vector3(); this.closest=new THREE.Vector3();
    model.updateMatrixWorld(true);
    const count=this.head?.userData.hairGuideCount||24;
    const segments=this.head?.userData.hairSegments||2;
    if(this.head)for(let k=0;k<count;k++){
      const chain=[];
      for(let n=0;n<segments;n++){
        const bone=bones[`HairGuide${String(k).padStart(2,'0')}_${n}`];
        if(!bone)break; chain.push(bone);
      }
      if(chain.length!==segments)continue;
      const last=chain[chain.length-1];
      const tip=new THREE.Vector3(0,last.userData.tailLength||1,0);
      const points=chain.map(b=>b.getWorldPosition(new THREE.Vector3()));
      points.push(last.localToWorld(tip.clone()));
      const inverse=this.head.matrixWorld.clone().invert();
      const axes=chain.map((b,i)=>i+1<chain.length?chain[i+1].position.clone().normalize():tip.clone().normalize());
      this.guides.push({chain,tip,p:points,prev:points.map(v=>v.clone()),
        rest:points.map(v=>v.clone().applyMatrix4(inverse)),
        len:points.slice(1).map((p,i)=>p.distanceTo(points[i])),
        quaternions:chain.map(b=>b.quaternion.clone()),axes});
    }
    for(const g of this.guides){
      g.restDirections=g.rest.slice(1).map((p,i)=>p.clone().sub(g.rest[i]).normalize());
      g.turns=g.restDirections.map((d,i)=>i?new THREE.Quaternion().setFromUnitVectors(g.restDirections[i-1],d):new THREE.Quaternion());
      g.pins=this.long?Math.min(3,g.chain.length-1):0;g.lambda=new Float64Array(g.len.length);
      g.rootStart=new THREE.Vector3();g.rootTarget=new THREE.Vector3();
    }
    this.center=new THREE.Vector3(...(this.head?.userData.scalpCenter||[0,0,8.8]));
    this.radii=new THREE.Vector3(...(this.head?.userData.scalpRadii||[9.625,11.825,11.55]));
    this.colliders=(this.head?.userData.hairBodyColliders||[]).map(c=>({
      bone:bones[c.bone],center:new THREE.Vector3(...c.center),
      radii:new THREE.Vector3(...c.radii),inverse:new THREE.Matrix4(),world:new THREE.Matrix4()
    })).filter(c=>c.bone);
    this.capsules=[];
    if(this.long)for(const side of ['Left','Right']){
      for(const [a,b,radius] of [['Arm','ForeArm',.070],['ForeArm','Hand',.054]]){
        if(bones[side+a]&&bones[side+b])this.capsules.push({
          a:bones[side+a],b:bones[side+b],radius,
          start:new THREE.Vector3(),end:new THREE.Vector3(),axis:new THREE.Vector3()
        });
      }
    }
  }
  // World-space air velocity in meters/second, supplied by the game or preview.
  setWind(wind){
    if(Array.isArray(wind))this.wind.set(wind[0]||0,wind[1]||0,wind[2]||0);
    else if(wind)this.wind.set(wind.x||0,wind.y||0,wind.z||0);
    else this.wind.set(0,0,0);
    this.wind.clampLength(0,12);
  }
  reset(){
    if(!this.head)return;
    this.model.updateMatrixWorld(true); this.headWorld.copy(this.head.matrixWorld);
    for(const g of this.guides)for(let i=0;i<g.p.length;i++){
      g.p[i].copy(g.rest[i]).applyMatrix4(this.headWorld);g.prev[i].copy(g.p[i]);
    }
    this.acc=0;this.ready=true;
  }
  ellipsoid(point,inverse,world,center,radii){
    this.local.copy(point).applyMatrix4(inverse).sub(center);
    const rho=Math.hypot(this.local.x/radii.x,this.local.y/radii.y,this.local.z/radii.z);
    if(rho<1.005&&rho>.001){
      this.local.multiplyScalar(1.005/rho).add(center).applyMatrix4(world);
      point.copy(this.local);
    }
  }
  collide(point){
    this.ellipsoid(point,this.invHead,this.headWorld,this.center,this.radii);
    for(const c of this.colliders)this.ellipsoid(point,c.inverse,c.world,c.center,c.radii);
    for(const c of this.capsules){
      this.v.copy(point).sub(c.start);
      const t=THREE.MathUtils.clamp(this.v.dot(c.axis)/Math.max(1e-8,c.axis.lengthSq()),0,1);
      this.closest.copy(c.start).addScaledVector(c.axis,t);
      this.local.copy(point).sub(this.closest);
      const distance=this.local.length(),radius=c.radius*this.unitScale;
      if(distance<radius&&distance>1e-6)point.copy(this.closest).addScaledVector(this.local,radius/distance);
    }
  }
  update(dt,snap=false){
    if(!this.head||!this.guides.length)return;
    if(this.head.scale.x<.1){this.ready=false;return;}
    for(const g of this.guides)g.chain.forEach((b,i)=>b.quaternion.copy(g.quaternions[i]));
    this.model.updateMatrixWorld(true);
    this.headWorld.copy(this.head.matrixWorld);this.invHead.copy(this.headWorld).invert();
    const first=this.guides[0];
    const jump=first.p[0].distanceTo(this.v.copy(first.rest[0]).applyMatrix4(this.headWorld));
    if(!this.ready||dt>.15||jump>.75||(snap&&jump>.35))this.reset();
    this.head.getWorldScale(this.scale);this.unitScale=Math.abs(this.scale.x)*100;
    for(const c of this.colliders){c.world.copy(c.bone.matrixWorld);c.inverse.copy(c.world).invert();}
    for(const c of this.capsules){c.a.getWorldPosition(c.start);c.b.getWorldPosition(c.end);c.axis.copy(c.end).sub(c.start);}
    for(const g of this.guides){g.rootStart.copy(g.p[0]);g.rootTarget.copy(g.rest[0]).applyMatrix4(this.headWorld);}
    this.acc=Math.min(this.acc+Math.max(0,dt),STEP*8);
    const steps=Math.floor(this.acc/STEP);let step=0;
    while(this.acc>=STEP){
      this.time+=STEP;step++;
      for(let guide=0;guide<this.guides.length;guide++){
        const g=this.guides[guide],last=g.p.length-1;
        g.p[0].copy(g.rootStart).lerp(g.rootTarget,step/Math.max(1,steps));g.prev[0].copy(g.p[0]);
        for(let i=1;i<=last;i++){
          if(i<=g.pins){g.p[i].copy(g.rest[i]).applyMatrix4(this.headWorld);g.prev[i].copy(g.p[i]);continue;}
          // World-space particles retain momentum when their moving root turns/stops.
          this.v.copy(g.p[i]).sub(g.prev[i]).multiplyScalar(this.long?.986:.94).clampLength(0,8*STEP);
          g.prev[i].copy(g.p[i]);g.p[i].add(this.v);g.p[i].y-=9.81*STEP*STEP;
          const pos=g.p[i],t=this.time;
          const speed=this.wind.length();
          // Coherent gusts and small, independent eddies; no wind when the air is still.
          this.air.copy(this.wind).multiplyScalar(1+.22*Math.sin(t*1.17)+.13*Math.sin(t*2.31));
          const eddy=Math.min(1.2,speed*.20);
          this.air.x+=eddy*Math.sin(pos.y*4.3+pos.z*2.4+t*2.7+guide*.37);
          this.air.y+=eddy*.3*Math.sin(pos.x*4.7+t*1.8+guide*.17);
          this.air.z+=eddy*Math.sin(pos.y*3.9-pos.x*2.7-t*2.1+guide*.31);
          this.flow.copy(this.air).sub(this.delta.copy(this.v).multiplyScalar(1/STEP));
          this.direction.copy(g.p[i]).sub(g.p[i-1]).normalize();
          this.flow.addScaledVector(this.direction,-this.flow.dot(this.direction)*.80);
          const drag=(this.long?2.3:1.2)*(.6+Math.sqrt(this.flow.length())*.45);
          g.p[i].addScaledVector(this.flow,drag*STEP*STEP);
          if(!this.long){
            // Short styled grooms and the pinned bun retain stronger shape support.
            this.v.copy(g.rest[i]).applyMatrix4(this.headWorld);
            g.p[i].lerp(this.v,i===1?.20:.10);
          }
        }
        if(this.long){
          // Local curvature follows the preceding segment, not the original head pose.
          // Flexible ends can trail, swing and settle rather than snapping to rest.
          for(let i=g.pins+1;i<=last;i++){
            if(i===1)this.direction.copy(g.restDirections[0]).transformDirection(this.headWorld);
            else{
              this.direction.copy(g.p[i-1]).sub(g.p[i-2]).normalize().transformDirection(this.invHead);
              this.direction.applyQuaternion(g.turns[i-1]).transformDirection(this.headWorld);
            }
            this.v.copy(g.p[i-1]).addScaledVector(this.direction,g.len[i-1]);
            const bend=i===g.pins+1?.09:i===g.pins+2?.035:.018;
            g.p[i].lerp(this.v,bend);
          }
        }
        g.lambda.fill(0);
        const alpha=(this.long?2e-8:0)/(STEP*STEP);
        // Compliant inextensibility: pinned root, free internal particles.
        for(let iteration=0;iteration<(this.long?8:4);iteration++){
          const reverse=iteration%2===1;
          for(let n=1;n<=last;n++){
            const i=reverse?last+1-n:n,wi=i-1<=g.pins?0:1,wj=i<=g.pins?0:1;
            if(!wi&&!wj)continue;
            this.delta.copy(g.p[i]).sub(g.p[i-1]);const d=this.delta.length();
            if(d>1e-7){
              this.delta.multiplyScalar(1/d);
              const dl=(-(d-g.len[i-1])-alpha*g.lambda[i-1])/(wi+wj+alpha);
              g.lambda[i-1]+=dl;g.p[i].addScaledVector(this.delta,dl*wj);
              if(wi)g.p[i-1].addScaledVector(this.delta,-dl*wi);
            }
          }
          if(iteration%2===1)for(let i=g.pins+1;i<=last;i++){
            this.contact.copy(g.p[i]);this.collide(g.p[i]);
            this.contact.sub(g.p[i]);
            // Remove contact-generated normal velocity, retaining sliding motion.
            if(this.contact.lengthSq()>1e-12)g.prev[i].addScaledVector(this.contact,-.85);
          }
        }
        for(let i=g.pins+1;i<=last;i++){
          this.contact.copy(g.p[i]);this.collide(g.p[i]);this.contact.sub(g.p[i]);
          if(this.contact.lengthSq()>1e-12)g.prev[i].addScaledVector(this.contact,-.85);
        }
      }
      if(this.long){
        // Coarse lock-volume separation, with no attraction to an absolute pose.
        for(let pass=0;pass<2;pass++)for(let k=0;k<this.guides.length-1;k++){
          const a=this.guides[k],b=this.guides[k+1];
          for(let i=a.pins+1;i<a.p.length;i++){
            this.delta.copy(b.p[i]).sub(a.p[i]);const d=this.delta.length();
            const gap=Math.min(.010,.005+.005*i/(a.p.length-1))*this.unitScale;
            if(d>1e-6&&d<gap){
              this.delta.multiplyScalar((gap-d)/(2*d));a.p[i].sub(this.delta);b.p[i].add(this.delta);
              this.collide(a.p[i]);this.collide(b.p[i]);
            }
          }
        }
      }
      this.acc-=STEP;
    }
    for(const g of this.guides)for(let i=0;i<g.chain.length;i++){
      const bone=g.chain[i],restQ=g.quaternions[i];
      bone.parent.updateWorldMatrix(true,false);bone.parent.getWorldQuaternion(this.parentQ).invert();
      this.v.copy(g.p[i+1]).sub(g.p[i]).normalize().applyQuaternion(this.parentQ);
      this.local.copy(g.axes[i]).applyQuaternion(restQ).normalize();
      this.q.setFromUnitVectors(this.local,this.v);bone.quaternion.copy(this.q).multiply(restQ);bone.updateWorldMatrix(false,true);
    }
  }
}
