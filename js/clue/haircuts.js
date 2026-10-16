// Shared fiber cutting. Lengths are measured along the groom in meters, never by
// scaling the avatar. A task owns authorization; rendering owns no match state.
import * as THREE from 'three';
export class Haircuts {
  constructor(model, motion) {
    this.model=model;this.motion=motion;
    this.groom=motion.head?.userData.hairGroom;
    this.records=this.groom?.strands||[];this.lengths=this.records.map(s=>s.length);
    this.width=Math.max(1,2**Math.ceil(Math.log2(this.records.length||1)));
    this.data=new Float32Array(this.width*4);this.texture=new THREE.DataTexture(this.data,this.width,1,THREE.RGBAFormat,THREE.FloatType);
    this.texture.minFilter=this.texture.magFilter=THREE.NearestFilter;this.texture.generateMipmaps=false;
    this.meshes=[];this.paths=new Map();this.version=0;this.appliedKey='';
    model.traverse(o=>{
      const ids=o.geometry?.getAttribute('_hair_id'),arcs=o.geometry?.getAttribute('_hair_arc');
      if(!o.isMesh||!ids||!arcs)return;
      this.meshes.push(o);
      if(/Scalp|Bun_Core/.test(o.name))return;
      for(let i=0;i<ids.count;i++){
        const id=Math.round(ids.getX(i));let path=this.paths.get(id);
        if(!path){path={mesh:o,rings:new Map()};this.paths.set(id,path);}
        const arc=arcs.getX(i);if(!path.rings.has(arc))path.rings.set(arc,i);
      }
    });
    for(const path of this.paths.values())path.samples=[...path.rings].sort((a,b)=>a[0]-b[0]);
    this.a=new THREE.Vector3();this.b=new THREE.Vector3();this.c=new THREE.Vector3();this.rayPoint=new THREE.Vector3();
    this.clippings=[];this.clipRoot=new THREE.Group();model.add(this.clipRoot);
    this.refresh();this.commit();
  }
  refresh(){
    const uniforms={hairLengths:{value:this.texture},hairTextureWidth:{value:this.width}};
    for(const o of this.meshes){
      for(const m of Array.isArray(o.material)?o.material:[o.material]){
        if(m.userData.hairCutInstalled)continue;m.userData.hairCutInstalled=true;
        const previous=m.onBeforeCompile,cache=m.customProgramCacheKey.bind(m);
        m.onBeforeCompile=shader=>{
          previous.call(m,shader);Object.assign(shader.uniforms,uniforms);
          shader.vertexShader='attribute float _hair_id;\nattribute float _hair_arc;\nvarying vec2 vHairCut;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvHairCut=vec2(_hair_id,_hair_arc);');
          shader.fragmentShader='uniform sampler2D hairLengths;\nuniform float hairTextureWidth;\nvarying vec2 vHairCut;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat hairLimit=texture2D(hairLengths,vec2((floor(vHairCut.x+0.5)+0.5)/hairTextureWidth,0.5)).r;\nif(vHairCut.y>hairLimit+0.000001)discard;');
        };
        m.customProgramCacheKey=()=>cache()+'-strand-cut-v1';m.needsUpdate=true;
      }
      // Fine fibers and scalp layers cannot cast an uncut silhouette.
      o.castShadow=false;
    }
  }
  commit(){
    this.lengths.forEach((length,id)=>{this.data[id*4]=length;});this.texture.needsUpdate=true;
    this.version++;this.appliedKey=JSON.stringify(this.serialize());
    this.motion.setCutLengths(this.records,this.lengths);
    const bun=this.records.filter(s=>s.bun),original=bun.reduce((n,s)=>n+s.length,0),remaining=bun.reduce((n,s)=>n+this.lengths[s.id],0);
    const bunGone=original>0&&remaining/original<.35;
    this.model.traverse(o=>{if(/Hairpin/.test(o.name)||/Bun_Core/.test(o.name)&&!o.geometry?.getAttribute('_hair_id'))o.visible=!bunGone;});
  }
  serialize(){return {schema:1,groom:this.groom?.id,cuts:this.records.filter(s=>this.lengths[s.id]<s.length-.0001).map(s=>[s.id,Math.round(this.lengths[s.id]*10000)])};}
  apply(state){
    const key=JSON.stringify(state||null);if(key===this.appliedKey)return false;
    if(state&&(state.schema!==1||state.groom!==this.groom?.id||!Array.isArray(state.cuts)))return false;
    this.lengths=this.records.map(s=>s.length);
    for(const [id,tenthsMm] of state?.cuts||[])if(Number.isInteger(id)&&this.records[id]&&Number.isFinite(tenthsMm))this.lengths[id]=Math.max(0,Math.min(this.records[id].length,tenthsMm/10000));
    this.commit();this.appliedKey=key;return true;
  }
  reset(){this.lengths=this.records.map(s=>s.length);this.commit();return this.serialize();}
  prepare(){this.model.updateWorldMatrix(true,true);for(const mesh of this.meshes)mesh.skeleton?.update();}
  point(path,index,out){
    path.mesh.getVertexPosition(index,out).applyMatrix4(path.mesh.matrixWorld);
    if(this.motion.long)this.motion.collide(out);
    return out;
  }
  cutStrand(id,length,{clippings=true}={}){
    if(!Number.isInteger(id)||!this.records[id]||!Number.isFinite(length))return false;
    length=Math.max(0,Math.min(this.records[id].length,length));
    if(length>=this.lengths[id]-.0001)return false;
    if(clippings)this.spawnClip(id,length);
    this.lengths[id]=length;return true;
  }
  trim(fraction){
    if(!Number.isFinite(fraction))return 0;this.prepare();let count=0;
    for(const s of this.records)if(this.cutStrand(s.id,s.length*THREE.MathUtils.clamp(fraction,0,1),{clippings:s.id%45===0}))count++;
    if(count)this.commit();return count;
  }
  cutSphere(center,radius=.025){
    if(!center?.isVector3||!Number.isFinite(radius)||radius<=0)return 0;
    this.prepare();let count=0;
    for(const [id,path] of this.paths){
      const samples=path.samples;
      for(let i=1;i<samples.length;i++){
        const [arcA,indexA]=samples[i-1],[arcB,indexB]=samples[i];if(arcA>=this.lengths[id])break;
        this.point(path,indexA,this.a);this.point(path,indexB,this.b);
        const segment=this.b.clone().sub(this.a),offset=this.a.clone().sub(center);
        const A=segment.lengthSq(),B=2*offset.dot(segment),C=offset.lengthSq()-radius*radius,disc=B*B-4*A*C;
        if(A<1e-12||disc<0)continue;
        const enter=(-B-Math.sqrt(disc))/(2*A),exit=(-B+Math.sqrt(disc))/(2*A);
        if(exit<0||enter>1)continue;
        const t=THREE.MathUtils.clamp(enter,0,1),length=arcA+(arcB-arcA)*t;
        if(this.cutStrand(id,length,{clippings:count%35===0})){count++;break;}
      }
    }
    if(count)this.commit();return count;
  }
  cutAtRay(ray,radius=.018){
    this.prepare();let best=Infinity,hit=null;
    for(const [id,path] of this.paths)for(let i=1;i<path.samples.length;i++){
      const [aa,ia]=path.samples[i-1],[ab,ib]=path.samples[i];if(aa>=this.lengths[id])break;
      this.point(path,ia,this.a);this.point(path,ib,this.b);
      if(ab>this.lengths[id])this.b.lerp(this.a,(ab-this.lengths[id])/Math.max(1e-8,ab-aa));
      const distance=ray.distanceSqToSegment(this.a,this.b,this.rayPoint,this.c),depth=this.rayPoint.distanceToSquared(ray.origin);
      if(distance<=radius*radius&&depth<best){best=depth;hit=this.c.clone();}
    }
    return hit?this.cutSphere(hit,radius):0;
  }
  spawnClip(id,from){
    if(this.clippings.length>=70)return;const path=this.paths.get(id);if(!path)return;
    const points=[];
    for(const [arc,index] of path.samples)if(arc>=from&&arc<=this.lengths[id])points.push(this.point(path,index,new THREE.Vector3()).clone());
    if(points.length<2)return;
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    const original=Array.isArray(path.mesh.material)?path.mesh.material[0]:path.mesh.material;
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:original.color||0x3b2417,transparent:true}));
    // World-space clipping particles are attached to the scene, not the moving head.
    const scene=this.model;scene.updateWorldMatrix(true,false);const inverse=scene.matrixWorld.clone().invert();
    const position=geometry.attributes.position;for(let i=0;i<position.count;i++){this.a.fromBufferAttribute(position,i).applyMatrix4(inverse);position.setXYZ(i,this.a.x,this.a.y,this.a.z);}
    this.clipRoot.add(line);this.clippings.push({line,points,age:0,velocity:new THREE.Vector3(.04,0,.03)});
  }
  update(dt){
    const inverse=this.model.matrixWorld.clone().invert();
    for(let i=this.clippings.length-1;i>=0;i--){
      const clip=this.clippings[i];clip.age+=dt;
      if(clip.age>2.5){clip.line.removeFromParent();clip.line.geometry.dispose();clip.line.material.dispose();this.clippings.splice(i,1);continue;}
      clip.velocity.y-=9.81*dt;const p=clip.line.geometry.attributes.position;
      clip.points.forEach((point,j)=>{point.addScaledVector(clip.velocity,dt);point.y=Math.max(.015,point.y);this.a.copy(point).applyMatrix4(inverse);p.setXYZ(j,this.a.x,this.a.y,this.a.z);});
      p.needsUpdate=true;clip.line.material.opacity=Math.min(1,(2.5-clip.age)*2);
    }
  }
}
