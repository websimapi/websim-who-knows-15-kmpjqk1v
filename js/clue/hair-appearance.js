// Stable screen-space coverage for subpixel fibers, without temporal dithering.
import * as THREE from 'three';
export function installHairAppearance(model){
  model.traverse(mesh=>{
    if(!mesh.isMesh||!/Hair_Strands|Bun_Fibers/.test(mesh.name))return;
    const geometry=mesh.geometry,ids=geometry.getAttribute('_hair_id'),arcs=geometry.getAttribute('_hair_arc'),position=geometry.getAttribute('position');
    if(!ids||!arcs||!position)return;
    // Each ring is a two-sided ribbon in the game LOD. Store the offset from
    // its center once per shared geometry, not once per avatar/frame.
    if(!geometry.getAttribute('_hair_offset')){
      const rings=new Map(),fibers=new Map(),offsets=new Float32Array(position.count*3),tangents=new Float32Array(position.count*3),across=new Float32Array(position.count);
      for(let i=0;i<position.count;i++){const key=ids.getX(i)+':'+arcs.getX(i);let ring=rings.get(key);if(!ring){ring=[];rings.set(key,ring);}ring.push(i);}
      for(const ring of rings.values()){
        const center=new THREE.Vector3();for(const i of ring)center.add(new THREE.Vector3().fromBufferAttribute(position,i));center.multiplyScalar(1/ring.length);
        const id=ids.getX(ring[0]);if(!fibers.has(id))fibers.set(id,[]);fibers.get(id).push({center,ring,arc:arcs.getX(ring[0])});
        for(let j=0;j<ring.length;j++){const i=ring[j];offsets[i*3]=position.getX(i)-center.x;offsets[i*3+1]=position.getY(i)-center.y;offsets[i*3+2]=position.getZ(i)-center.z;across[i]=j%2?1:-1;}
      }
      for(const fiber of fibers.values()){fiber.sort((a,b)=>a.arc-b.arc);fiber.forEach((r,j)=>{const tangent=fiber[Math.min(fiber.length-1,j+1)].center.clone().sub(fiber[Math.max(0,j-1)].center).normalize();for(const i of r.ring)tangent.toArray(tangents,i*3);});}
      geometry.setAttribute('_hair_tangent',new THREE.BufferAttribute(tangents,3));
      geometry.setAttribute('_hair_offset',new THREE.BufferAttribute(offsets,3));geometry.setAttribute('_hair_across',new THREE.BufferAttribute(across,1));
    }
    const viewport=new THREE.Vector4(),uniforms={hairViewport:{value:new THREE.Vector2(1,1)}};
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      material.roughness=Math.max(.60,material.roughness);material.metalness=0;material.envMapIntensity=.18;
      material.alphaToCoverage=true;material.alphaTest=.01;material.transparent=false;material.depthWrite=true;
      const previous=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);
      material.onBeforeCompile=shader=>{
        previous.call(material,shader);Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='attribute vec3 _hair_offset;\nattribute vec3 _hair_tangent;\nvarying vec3 vFiberTangent;\nattribute float _hair_across;\nuniform vec2 hairViewport;\nvarying float vFiberCoverage;\nvarying float vFiberAcross;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
vec3 fiberOffset=_hair_offset;vec3 fiberTangent=_hair_tangent;
#ifdef USE_SKINNING
mat4 fiberSkin=skinWeight.x*boneMatX+skinWeight.y*boneMatY+skinWeight.z*boneMatZ+skinWeight.w*boneMatW;
fiberOffset=(bindMatrixInverse*fiberSkin*bindMatrix*vec4(fiberOffset,0.0)).xyz;
fiberTangent=(bindMatrixInverse*fiberSkin*bindMatrix*vec4(fiberTangent,0.0)).xyz;
#endif
vec3 viewFiber=mat3(modelViewMatrix)*fiberTangent;vFiberTangent=viewFiber/max(length(viewFiber),0.000001);
vec4 fiberCenterView=modelViewMatrix*vec4(transformed-fiberOffset,1.0);
vec4 fiberCenter=projectionMatrix*fiberCenterView;
vFiberCoverage=1.0;vFiberAcross=_hair_across;
if(fiberCenter.w>0.0001){
 vec4 fiberTip=projectionMatrix*vec4(fiberCenterView.xyz+viewFiber*.01,1.0);
 vec2 tangentPixels=(fiberTip.xy/fiberTip.w-fiberCenter.xy/fiberCenter.w)*hairViewport;
 vec2 tangent2=length(tangentPixels)>0.00001?normalize(tangentPixels):vec2(0.0,1.0);
 vec2 fiberSide=vec2(-tangent2.y,tangent2.x);
 float radiusPixels=length(mat3(modelViewMatrix)*fiberOffset)*abs(projectionMatrix[1][1])*hairViewport.y*.5/fiberCenter.w;
 float stableWidth=max(radiusPixels,.55);
 vFiberCoverage=clamp(radiusPixels/.55,.28,1.0);
 gl_Position.xy=(fiberCenter.xy/fiberCenter.w+fiberSide*_hair_across*stableWidth*2.0/hairViewport)*gl_Position.w;
}`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a=diffuseColor.a;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
vec3 fiberT=vFiberTangent/max(length(vFiberTangent),0.000001);
vec3 fiberFacing=vViewPosition-fiberT*dot(vViewPosition,fiberT);
if(length(fiberFacing)>0.00001)normal=normalize(mix(normal,normalize(fiberFacing),.85));`);
        shader.fragmentShader='varying vec3 vFiberTangent;\nvarying float vFiberCoverage;\nvarying float vFiberAcross;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`float fiberEdge=1.0-smoothstep(.65,1.0,abs(vFiberAcross));
diffuseColor.a*=clamp(vFiberCoverage*fiberEdge,0.0,1.0);
#include <alphatest_fragment>`);
      };
      material.customProgramCacheKey=()=>cache()+'|fiber-coverage-v3';material.needsUpdate=true;
    }
    const before=mesh.onBeforeRender;
    mesh.onBeforeRender=function(renderer,...args){before?.call(this,renderer,...args);renderer.getCurrentViewport(viewport);uniforms.hairViewport.value.set(Math.max(1,viewport.z),Math.max(1,viewport.w));};
  });
}
