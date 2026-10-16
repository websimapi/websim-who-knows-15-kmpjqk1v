// Final strand-surface clearance after skinning. The guide solver supplies motion;
// this prevents follower strands offset from a guide from entering the clothing.
import * as THREE from 'three';
export function installHairCollision(model, motion) {
  if (!motion.long) return;
  const shapes=[{bone:motion.head,center:motion.center,radii:motion.radii},...motion.colliders].slice(0,4);
  const u={
    hairSurfaceEnabled:{value:1},
    hairMeshInverse:{value:new THREE.Matrix4()},
    hairShapeInverse:{value:Array.from({length:4},()=>new THREE.Matrix4())},
    hairShapeWorld:{value:Array.from({length:4},()=>new THREE.Matrix4())},
    hairShapeCenter:{value:Array.from({length:4},()=>new THREE.Vector3())},
    hairShapeRadii:{value:Array.from({length:4},()=>new THREE.Vector3(1,1,1))},
    hairShapeCount:{value:shapes.length},
    hairArmStart:{value:Array.from({length:4},()=>new THREE.Vector3())},
    hairArmEnd:{value:Array.from({length:4},()=>new THREE.Vector3())},
    hairArmRadius:{value:new Float32Array(4)},
    hairArmCount:{value:Math.min(4,motion.capsules.length)}
  };
  const declarations=`
uniform float hairSurfaceEnabled;
uniform mat4 hairMeshInverse;
uniform mat4 hairShapeInverse[4];
uniform mat4 hairShapeWorld[4];
uniform vec3 hairShapeCenter[4];
uniform vec3 hairShapeRadii[4];
uniform int hairShapeCount;
uniform vec3 hairArmStart[4];
uniform vec3 hairArmEnd[4];
uniform float hairArmRadius[4];
uniform int hairArmCount;
`;
  const surface=`
if(hairSurfaceEnabled>0.5){
 vec3 hairW=(modelMatrix*vec4(transformed,1.0)).xyz;
 for(int c=0;c<4;c++){
  if(c<hairShapeCount){
   vec3 q=(hairShapeInverse[c]*vec4(hairW,1.0)).xyz-hairShapeCenter[c];
   float rho=length(q/hairShapeRadii[c]);
   if(rho>0.00001&&rho<1.025){
    q*=1.025/rho;
    hairW=(hairShapeWorld[c]*vec4(q+hairShapeCenter[c],1.0)).xyz;
   }
  }
 }
 for(int c=0;c<4;c++){
  if(c<hairArmCount){
   vec3 axis=hairArmEnd[c]-hairArmStart[c];
   float t=clamp(dot(hairW-hairArmStart[c],axis)/max(dot(axis,axis),0.000001),0.0,1.0);
   vec3 closest=hairArmStart[c]+axis*t;
   vec3 delta=hairW-closest;
   float d=length(delta);
   if(d>0.00001&&d<hairArmRadius[c])hairW=closest+delta*(hairArmRadius[c]/d);
  }
 }
 transformed=(hairMeshInverse*vec4(hairW,1.0)).xyz;
}
`;
  model.traverse(o=>{
    if(!o.isMesh||!/Hair/.test(o.name)||/Scalp|Hairpin/.test(o.name))return;
    if(o.name.includes('Underlayer')){o.visible=false;return;}
    const materials=Array.isArray(o.material)?o.material:[o.material];
    for(const material of materials){
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,u);
        shader.vertexShader=declarations+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <skinning_vertex>','#include <skinning_vertex>\n'+surface);
      };
      material.customProgramCacheKey=()=>'hair-surface-clearance-v1';
      material.needsUpdate=true;
    }
    o.onBeforeRender=()=>{
      u.hairSurfaceEnabled.value=motion.head.scale.x<.1?0:1;
      u.hairMeshInverse.value.copy(o.matrixWorld).invert();
      shapes.forEach((c,i)=>{
        c.bone.updateWorldMatrix(true,false);
        u.hairShapeWorld.value[i].copy(c.bone.matrixWorld);
        u.hairShapeInverse.value[i].copy(c.bone.matrixWorld).invert();
        u.hairShapeCenter.value[i].copy(c.center);
        u.hairShapeRadii.value[i].copy(c.radii);
      });
      const scale=motion.unitScale||.98;
      motion.capsules.slice(0,4).forEach((c,i)=>{
        c.a.getWorldPosition(u.hairArmStart.value[i]);c.b.getWorldPosition(u.hairArmEnd.value[i]);
        u.hairArmRadius.value[i]=c.radius*scale+.003;
      });
    };
  });
}
