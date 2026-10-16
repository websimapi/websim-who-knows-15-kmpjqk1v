// Visemes follow the audio actually playing on this client. Inner thoughts are silent faces.
import { speechPose } from './audio.js';
export class LipMotion {
  constructor(model,id){this.id=id;this.meshes=[];model.traverse(o=>{if(o.morphTargetDictionary?.viseme_aa!==undefined)this.meshes.push(o);});}
  update(dt,enabled=true){
    const pose=enabled?(this.previewPose||speechPose(this.id)):{};
    this.activity=0;
    for(const mesh of this.meshes)for(const [name,index]of Object.entries(mesh.morphTargetDictionary)){
      if(!name.startsWith('viseme_'))continue;
      const target=pose[name.slice(7)]||0,current=mesh.morphTargetInfluences[index]||0;
      mesh.morphTargetInfluences[index]=current+(target-current)*(1-Math.exp(-dt*(target>current?32:20)));
      this.activity=Math.max(this.activity,mesh.morphTargetInfluences[index]);
    }
    this.peakActivity=Math.max(this.peakActivity||0,this.activity);
    if(this.previewDiagnostics){document.body.dataset.lipMeshes=String(this.meshes.length);document.body.dataset.lipActivity=this.activity.toFixed(3);document.body.dataset.lipPeak=this.peakActivity.toFixed(3);}
  }
}
