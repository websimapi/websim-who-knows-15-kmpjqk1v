// Shared fixture identities and illumination estimates used by rendering and perception.
import {cellToWorld,roomAtWorld} from './data.js';
import {ROOM_BOUNDS,FURNITURE,local,roomSize} from './layout.js';
import {DOOR_LIST,DOOR_W,losClear} from './nav.js';
export const LIGHT_SWITCHES=Object.keys(ROOM_BOUNDS).concat('hallway').map(room=>{
  const door=DOOR_LIST.find(d=>d.cells.some(([c,r])=>{const p=cellToWorld(c,r);return roomAtWorld(p.x,p.z)===room;}));
  let x,z,nx=1,nz=0;
  if(door){
    const cell=door.cells.map(([c,r])=>cellToWorld(c,r)).find(p=>roomAtWorld(p.x,p.z)===room),dx=cell.x-door.mid.x,dz=cell.z-door.mid.z,l=Math.hypot(dx,dz);nx=dx/l;nz=dz/l;
    x=door.mid.x+door.e.x*(DOOR_W/2+.22)+nx*.115;z=door.mid.z+door.e.z*(DOOR_W/2+.22)+nz*.115;
  }else{const p=local(room,.12,roomSize(room).d*.5);x=p.x;z=p.z;}
  return{id:'room:'+room,room,x,y:1.22,z,nx,nz};
});
export const FLOOR_LAMPS=FURNITURE.filter(f=>f.type==='lamp');
export const fixtureOn=(off,id)=>!off?.[id];
export function illuminationAt(x,z,{off={},props=[],fires=[],doors=[]}={}){
 const room=roomAtWorld(x,z);
 let value=room==='tunnels' ? .012 : fixtureOn(off,'room:'+room) ? .88 : .025;
 const contribution=(sx,sz,power)=>{const d=Math.hypot(x-sx,z-sz);if(d<7&&roomAtWorld(sx,sz)===room&&losClear(x,z,sx,sz,doors))value+=power/(1+(d/1.8)**2);};
 for(const f of FLOOR_LAMPS)if(fixtureOn(off,'lamp:'+f.id))contribution(f.x,f.z,.65);
 for(const p of props)if(!p.hidden&&!p.gone&&!p.pocket){if(p.kind==='lamp'&&fixtureOn(off,'prop:'+p.id))contribution(p.x,p.z,.7);else if(p.lit)contribution(p.x,p.z,.65);}
 for(const f of FURNITURE)if(f.fire&&fires.includes(f.fire))contribution(f.x,f.z,.65);
 return Math.min(1,value);
}
export function snapshotLighting(snap,objects){
 const props=objects?[...objects.values()].filter(g=>g.userData.p).map(g=>({id:g.userData.p.id,kind:g.userData.p.kind,x:g.position.x,z:g.position.z,hidden:!g.visible,lit:g.userData.lit})):[];
 return{off:snap?.lightsOff||{},props,fires:snap?.fires||[],doors:snap?.doors||[]};
}
