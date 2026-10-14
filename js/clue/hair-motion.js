// Pinned guide-chain hair dynamics: short groom and long loose hair profiles.
// Fixed 120 Hz Verlet integration, segment constraints and animated colliders.
import * as THREE from 'three';
const STEP = 1 / 120;
export class HairMotion {
  constructor(model, bones) {
    this.model=model; this.bones=bones; this.head=bones.Head; this.guides=[];
    this.acc=0; this.ready=false; this.long=this.head?.userData.hairProfile==='long';
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
    if(!this.ready||snap||dt>.15)this.reset();
    this.headWorld.copy(this.head.matrixWorld);this.invHead.copy(this.headWorld).invert();
    this.head.getWorldScale(this.scale);this.unitScale=Math.abs(this.scale.x)*100;
    for(const c of this.colliders){c.world.copy(c.bone.matrixWorld);c.inverse.copy(c.world).invert();}
    for(const c of this.capsules){c.a.getWorldPosition(c.start);c.b.getWorldPosition(c.end);c.axis.copy(c.end).sub(c.start);}
    const first=this.guides[0];
    if(first.p[0].distanceTo(this.v.copy(first.rest[0]).applyMatrix4(this.headWorld))>.3)this.reset();
    this.acc=Math.min(this.acc+Math.max(0,dt),STEP*8);
    while(this.acc>=STEP){
      for(const g of this.guides){
        const last=g.p.length-1;
        g.p[0].copy(g.rest[0]).applyMatrix4(this.headWorld);g.prev[0].copy(g.p[0]);
        for(let i=1;i<=last;i++){
          this.v.copy(g.p[i]).sub(g.prev[i]).multiplyScalar(this.long?.972:.90);
          g.prev[i].copy(g.p[i]);g.p[i].add(this.v);g.p[i].y-=9.81*STEP*STEP;
          this.v.copy(g.rest[i]).applyMatrix4(this.headWorld);
          const bend=this.long?(.022/(1+i*.45)):(i===1?.28:.18);
          g.p[i].lerp(this.v,bend);
        }
        for(let iteration=0;iteration<(this.long?8:4);iteration++){
          for(let i=1;i<=last;i++){
            this.v.copy(g.p[i]).sub(g.p[i-1]);
            const d=this.v.length();
            if(d>1e-6){
              if(this.long&&i>1){
                this.v.multiplyScalar((d-g.len[i-1])/d*.5);
                g.p[i].sub(this.v);g.p[i-1].add(this.v);
              }else g.p[i].copy(g.p[i-1]).add(this.v.multiplyScalar(g.len[i-1]/d));
            }
            this.collide(g.p[i]);
          }
        }
        // Limit extreme motion after sudden turns while retaining long-hair lag.
        for(let i=1;i<=last;i++){
          this.v.copy(g.rest[i]).applyMatrix4(this.headWorld);
          this.local.copy(g.p[i]).sub(this.v).clampLength(0,this.long?(.08+.045*i)*this.unitScale:.012*i);
          g.p[i].copy(this.v).add(this.local);
          if(this.long)this.collide(g.p[i]);
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
