// Original procedural fiber grooms for guests awaiting their authored bodies.
// These use the same physics and haircut schema as the four Blender characters.
import * as THREE from 'three';
const styles={
  red:{length:.24,color:0x25150f,long:true,wave:.010},
  yellow:{length:.045,color:0x3d2a19,long:false,wave:.001},
  copper:{length:.13,color:0x65331a,long:true,wave:.004},
  teal:{length:.085,color:0x332c24,long:false,wave:.003},
  butler:{length:.035,color:0x77736c,long:false,wave:.001}
};
export function addFallbackHair(model,bones,id){
  const head=bones.Head;if(!head||head.userData.hairGroom)return;
  const style=styles[id]||styles.yellow,count=1600,segments=12,guideCount=24;
  let seed=[...id].reduce((v,c)=>v+c.charCodeAt(0),173);
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // X Bot head bounds measured through its Head inverse-bind matrix:
  // x ±8.8, y -5.7..21.0, z -11.1..13.8 centimeters. Fit the cranium,
  // rather than using the smaller authored characters' scalp dimensions.
  const paths=[],roots=[],center=new THREE.Vector3(0,9.3,1.3),radii=new THREE.Vector3(9.3,12,12.7);
  for(let s=0;s<count;s++){
    const angle=random()*Math.PI*2,front=Math.max(0,Math.sin(angle));
    const minY=.10+.45*front,y=minY+random()*(.995-minY),r=Math.sqrt(1-y*y);
    const normal=new THREE.Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r);
    const root=normal.clone().multiply(radii).add(center);roots.push(root);
    const length=style.length*(.62+.38*y)*(.85+random()*.3),path=[];
    for(let j=0;j<=segments;j++){
      const t=j/segments;
      let p;
      if(style.long){
        // Root follows the scalp, then the end drops with gravity. Front roots
        // sweep toward the sides, keeping the face clear.
        const theta=Math.acos(y),down=Math.min(1,t/.38),theta2=theta+down*.65;
        // Front sections part toward the temples instead of hanging over eyes.
        const targetAngle=Math.cos(angle)>=0?0:Math.PI;
        const flowAngle=angle+(targetAngle-angle)*front*down*.85;
        p=new THREE.Vector3(Math.cos(flowAngle)*Math.sin(theta2)*(radii.x+.2),Math.cos(theta2)*(radii.y+.2),Math.sin(flowAngle)*Math.sin(theta2)*(radii.z+.2)).add(center);
        p.y-=Math.max(0,t-.38)*length*100;
        p.x+=Math.sin(t*7+s*.13)*style.wave*100*t;
      }else{
        const flow=new THREE.Vector3(-.25,0,-.9).addScaledVector(normal,.35);flow.addScaledVector(normal,-flow.dot(normal)).normalize();
        p=root.clone().addScaledVector(flow,length*100*t).addScaledVector(normal,1.5*Math.sin(Math.PI*t));
      }
      const delta=p.clone().sub(center),rho=delta.clone().divide(radii).length();if(rho<1.025)p.copy(delta.multiplyScalar(1.025/Math.max(.001,rho))).add(center);
      path.push(p);
    }
    paths.push(path);
  }
  const seeds=Array.from({length:guideCount},(_,k)=>paths[Math.floor(k*count/guideCount)]);
  model.updateWorldMatrix(true,true);const allBones=[head],headQ=head.getWorldQuaternion(new THREE.Quaternion());
  for(let k=0;k<guideCount;k++){
    let parent=head;
    for(let j=0;j<segments;j++){
      const bone=new THREE.Bone();bone.name=`HairGuide${String(k).padStart(2,'0')}_${j}`;parent.add(bone);
      parent.updateWorldMatrix(true,false);
      bone.position.copy(parent.worldToLocal(head.localToWorld(seeds[k][j].clone())));
      const direction=seeds[k][j+1].clone().sub(seeds[k][j]),worldQ=headQ.clone().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize()));
      bone.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldQ));
      bone.userData.tailLength=direction.length();bone.updateWorldMatrix(false,true);
      bones[bone.name]=bone;allBones.push(bone);parent=bone;
    }
  }
  const pos=[],norm=[],indices=[],skinIndices=[],skinWeights=[],ids=[],arcs=[],lengths=[],records=[];
  paths.forEach((path,s)=>{
    let guide=0,distance=Infinity;seeds.forEach((p,k)=>{const d=p[0].distanceToSquared(path[0]);if(d<distance){distance=d;guide=k;}});
    const arc=[0];for(let j=1;j<path.length;j++)arc.push(arc[j-1]+path[j].distanceTo(path[j-1])*.01);
    const length=arc.at(-1);records.push({id:s,length,guide,root:path[0].toArray().map(v=>v*.01)});
    const start=pos.length/3;
    path.forEach((point,j)=>{
      const tangent=path[Math.min(j+1,segments)].clone().sub(path[Math.max(0,j-1)]).normalize();
      const side=tangent.clone().cross(new THREE.Vector3(1,0,0));if(side.lengthSq()<.001)side.crossVectors(tangent,new THREE.Vector3(0,0,1));side.normalize();const other=tangent.clone().cross(side).normalize();
      const t=j/segments,width=.025*(1-.88*t),strength=THREE.MathUtils.smoothstep(t,.18,.40),u=Math.min(segments-1,j),bone=1+guide*segments+u;
      for(let a=0;a<3;a++){
        const radial=side.clone().multiplyScalar(Math.cos(a*Math.PI*2/3)).addScaledVector(other,Math.sin(a*Math.PI*2/3));
        pos.push(...point.clone().addScaledVector(radial,width).toArray());norm.push(...radial.toArray());
        skinIndices.push(0,bone,0,0);skinWeights.push(1-strength,strength,0,0);ids.push(s);arcs.push(arc[j]);lengths.push(length);
      }
      if(j<segments)for(let a=0;a<3;a++){const x=start+j*3+a,y=start+j*3+(a+1)%3;indices.push(x,y,x+3,y,y+3,x+3);}
    });
  });
  const geometry=new THREE.BufferGeometry();
  for(const [name,values,size] of [['position',pos,3],['normal',norm,3],['skinWeight',skinWeights,4],['_hair_id',ids,1],['_hair_arc',arcs,1],['_hair_length',lengths,1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));geometry.setIndex(indices);
  const material=new THREE.MeshStandardMaterial({color:style.color,roughness:.42,side:THREE.DoubleSide});
  const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name=id+'_Hair_Strands';mesh.frustumCulled=false;mesh.userData.preserveMaterials=true;mesh.userData.fineDetail=true;
  head.add(mesh);model.updateWorldMatrix(true,true);mesh.bind(new THREE.Skeleton(allBones),mesh.matrixWorld.clone());
  // Fine dark scalp support, as in the Blender grooms. It is separately
  // cuttable, so shaved patches reveal the original head material cleanly.
  const capPos=[],capNorm=[],capIds=[],capArc=[],capLen=[],capIndex=[],rows=16,columns=48;
  for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
    const angle=column/columns*Math.PI*2,minY=.10+.45*Math.max(0,Math.sin(angle));
    const y=1-(1-minY)*row/rows,r=Math.sqrt(Math.max(0,1-y*y));
    const normal=new THREE.Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r);
    const point=normal.clone().multiply(radii).multiplyScalar(1.006).add(center);
    let closest=0,d=Infinity;roots.forEach((root,k)=>{const distance=root.distanceToSquared(point);if(distance<d){d=distance;closest=k;}});
    capPos.push(...point.toArray());capNorm.push(...normal.toArray());capIds.push(closest);capArc.push(.0015);capLen.push(records[closest].length);
    if(row<rows&&column<columns){const a=row*(columns+1)+column,b=a+columns+1;capIndex.push(a,b,a+1,a+1,b,b+1);}
  }
  const capGeo=new THREE.BufferGeometry();
  for(const [name,values,size] of [['position',capPos,3],['normal',capNorm,3],['_hair_id',capIds,1],['_hair_arc',capArc,1],['_hair_length',capLen,1]])capGeo.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
  capGeo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(capIds.length*4),4));
  const capWeights=new Float32Array(capIds.length*4);capIds.forEach((_,i)=>{capWeights[i*4]=1;});capGeo.setAttribute('skinWeight',new THREE.BufferAttribute(capWeights,4));capGeo.setIndex(capIndex);
  const cap=new THREE.SkinnedMesh(capGeo,new THREE.MeshStandardMaterial({color:style.color,roughness:.75,side:THREE.DoubleSide}));cap.name=id+'_Scalp_Undercoat';cap.userData.preserveMaterials=true;cap.userData.fineDetail=true;cap.frustumCulled=false;
  head.add(cap);model.updateWorldMatrix(true,true);cap.bind(mesh.skeleton,cap.matrixWorld.clone());
  head.userData.hairProfile=style.long?'long':'short';head.userData.hairGuideCount=guideCount;head.userData.hairSegments=segments;
  head.userData.scalpCenter=center.toArray();head.userData.scalpRadii=radii.toArray();
  head.userData.hairBodyColliders=style.long?[{bone:'Spine2',center:[0,-6,0],radii:[17,17,12]},{bone:'Spine',center:[0,0,0],radii:[16,18,12]}]:[];
  head.userData.hairGroom={schema:1,id:id+'-fallback-v1',strands:records};
}
