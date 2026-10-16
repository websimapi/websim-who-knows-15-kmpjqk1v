// Shared host and movement prediction. Metre-scale upright capsules on the floor.
import {collide,losClear} from './nav.js';
export const BODY_RADIUS=.30;
const blocks=b=>b&&b.alive!==false&&b.alive!==0&&!b.ko&&!b.climbing;
const fixed=b=>!!(b.seat||b.convo||b.chat||b.bodyFixed);
export function moveBody(body,x,z,bodies,doors,{push=true}={}){
  const changes=new Set(),startX=body.x,startZ=body.z;
  function place(b,tx,tz,chain){
    const fromX=b.x,fromZ=b.z;let p=collide(tx,tz,BODY_RADIUS,doors);
    for(let pass=0;pass<5;pass++)for(const o of bodies){
      if(o===b||!blocks(o)||chain.includes(o))continue;
      let dx=p.x-o.x,dz=p.z-o.z,d=Math.hypot(dx,dz),r=BODY_RADIUS*2;
      if(d>=r-.0001||!losClear(b.x,b.z,o.x,o.z,doors))continue;
      if(d<.00001){dx=(String(b.id)<String(o.id)?-1:1);dz=0;d=1;}
      const nx=dx/d,nz=dz/d,overlap=r-Math.hypot(p.x-o.x,p.z-o.z);
      if(push&&!fixed(o)&&chain.length<3){
        // Both bodies yield. A wall, chair or conversation partner takes no shove.
        const amount=Math.min(.07,overlap*.6);
        place(o,o.x-nx*amount,o.z-nz*amount,[...chain,b]);
      }
      dx=p.x-o.x;dz=p.z-o.z;d=Math.hypot(dx,dz);
      if(d<r){const ax=d>.00001?dx/d:nx,az=d>.00001?dz/d:nz;p=collide(p.x+ax*(r-d+.0002),p.z+az*(r-d+.0002),BODY_RADIUS,doors);}
    }
    // If constrained by a wall and another body, keep the previous safe position.
    if(bodies.some(o=>o!==b&&blocks(o)&&!chain.includes(o)&&Math.hypot(p.x-o.x,p.z-o.z)<BODY_RADIUS*2-.012&&losClear(p.x,p.z,o.x,o.z,doors))){p={x:fromX,z:fromZ};}
    b.x=p.x;b.z=p.z;if(Math.hypot(b.x-fromX,b.z-fromZ)>.0001)changes.add(b);
  }
  const dx=x-startX,dz=z-startZ,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.10));
  for(let i=1;i<=steps;i++)place(body,body.x+dx/steps,body.z+dz/steps,[]);
  return {x:body.x,z:body.z,changed:[...changes]};
}
