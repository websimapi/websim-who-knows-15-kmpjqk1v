// Three authored cave kits. Geometry and encounter coordinates are deterministic
// for a world seed; the world and combat systems own collision and actors.
import * as THREE from "three";
import { fork } from "./rng.js";

export const CAVES = [
  { id: "root", name: "Rootwake Den", origin: 1800, stone: 0x343c32, floor: 0x262d27, accent: 0x8ccd84, boss: "root_matriarch", mobs: ["gloam_rat", "fen_hound", "briar_stag"], reward: "root_heart", line: "The roots remember every footfall." },
  { id: "tide", name: "Drowned Reliquary", origin: 2200, stone: 0x31434b, floor: 0x202e35, accent: 0x8ed8d5, boss: "tide_keeper", mobs: ["gloam_rat", "drowned_thrall", "drowned_thrall"], reward: "tide_pearl", line: "The dead keep a ledger beneath the water." },
  { id: "glass", name: "Emberglass Hollow", origin: 2600, stone: 0x463931, floor: 0x2b2424, accent: 0xff9d65, boss: "glass_smith", mobs: ["ash_crawler", "ash_crawler", "sellsword"], reward: "emberglass_core", line: "A furnace still breathes under the hill." },
];

function stoneTexture(seed) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  let n = seed >>> 0;
  const random = () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
  ctx.fillStyle = "#c9c5bd"; ctx.fillRect(0,0,256,256);
  for (let i = 0; i < 3600; i++) {
    const v = Math.floor(70 + random()*140);
    ctx.fillStyle = `rgba(${v},${v},${v},${.08 + random()*.2})`;
    const s = 1+random()*5; ctx.fillRect(random()*256,random()*256,s,s);
  }
  ctx.strokeStyle = "rgba(35,30,28,.25)"; ctx.lineWidth = 1;
  for (let i=0;i<12;i++) {
    ctx.beginPath(); let x=random()*256,y=random()*256;ctx.moveTo(x,y);
    for(let j=0;j<4;j++){x+=(random()-.5)*65;y+=(random()-.5)*65;ctx.lineTo(x,y);} ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5,2.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildCaves(world) {
  const { group, col, spots, interactables, spawns, sites } = world;
  const r = fork(world.seed, "three-caves");
  // Cave mouths belong to the remote wilderness, off the city roads.
  const approaches = [
    { x: -350, z: -345 },
    { x: 350, z: 345 },
    { x: 350, z: -345 },
  ];
  const landing = (base) => {
    let best = { ...base }, score = Infinity, fallback = { ...base }, fallbackScore = Infinity;
    for (let ring = 0; ring <= 10; ring++) for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, d = ring * 7;
      const x = Math.max(-350, Math.min(350, base.x + Math.cos(a)*d));
      const z = Math.max(-345, Math.min(345, base.z + Math.sin(a)*d));
      const h = world.heightAt(x,z), out = world.heightAt(x,z-6);
      if (h < 1.5 || out < 1.5 || world.inCity(x,z) || world.roadDist(x,z) < 24 ||
          Object.values(sites).some((site) => site?.r && Math.hypot(x-site.x,z-site.z) < site.r + 95)) continue;
      const blocked = col.near(x,z,8).filter(c => !c.disabled && Math.hypot(c.x-x,c.z-z) < 6 + (c.r || Math.max(c.hw || 0,c.hd || 0))).length;
      const s = world.slopeAt(x,z) + world.slopeAt(x,z-6) + Math.abs(h-out)*.1 + d*.008 + blocked*3;
      if (s < fallbackScore) { fallbackScore = s; fallback = { x, z }; }
      if (blocked || h > 58 || world.roadDist(x,z) < 38 || world.slopeAt(x,z) > .63 || world.slopeAt(x,z-6) > .63) continue;
      if (s < score) { score=s; best={x,z}; }
    }
    return score < Infinity ? best : fallback;
  };
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  const crystalGeo = new THREE.OctahedronGeometry(1, 0);
  const woodGeo = new THREE.CylinderGeometry(.18, .28, 1, 6);
  const flameGeo = new THREE.SphereGeometry(.16, 8, 6);
  CAVES.forEach((cave, ci) => {
    const x = cave.origin, y = 0;
    const grain = stoneTexture(world.seed + ci * 7919);
    (world.caveTextures ||= []).push(grain);
    const stone = new THREE.MeshStandardMaterial({ color: cave.stone, map: grain, bumpMap: grain, bumpScale: .11, roughness: .91, metalness: .04 });
    const floor = new THREE.MeshStandardMaterial({ color: cave.floor, map: grain, bumpMap: grain, bumpScale: .08, roughness: .97, side: THREE.DoubleSide });
    const glow = new THREE.MeshStandardMaterial({ color: cave.accent, emissive: cave.accent, emissiveIntensity: 1.6, roughness: .28 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x050609, side: THREE.DoubleSide });
    const water = new THREE.MeshPhysicalMaterial({ color: cave.id === "tide" ? 0x23596b : cave.id === "root" ? 0x254633 : 0x5e2d1c, metalness: .25, roughness: .18, transparent: true, opacity: .78, side: THREE.DoubleSide, depthWrite: false });
    (world.caveMaterials ||= []).push(stone, floor, glow, dark, water);
    const entrance = landing(approaches[ci]);
    const h = world.heightAt(entrance.x, entrance.z);
    cave.out = { x: entrance.x, z: entrance.z - 6 };
    cave.inside = { x, z: 5 };
    cave.bossPos = { x, z: 124 };
    // A weathered, layered cave mouth with an accessible center.
    const arch = new THREE.Group();
    arch.position.set(entrance.x, h, entrance.z);
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * i / 10;
      const rx = Math.cos(a) * 4.15, ry = Math.sin(a) * 4.4;
      const b = new THREE.Mesh(rockGeo, stone);
      b.position.set(rx, Math.max(.25, ry), 0);
      b.scale.set(1.05 + r() * .35, .85 + r() * .45, 1.2 + r() * .55);
      arch.add(b);
    }
    const black = new THREE.Mesh(new THREE.CircleGeometry(3.5, 24), dark);
    black.position.set(0, 1.9, .55); arch.add(black);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.4, .35, .45), stone);
    lintel.position.set(0, 4.4, -.3); arch.add(lintel);
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(rockGeo, stone);
      b.position.set((r() - .5) * 13, .25, (r() - .5) * 8 - 3);
      b.scale.set(.4 + r(), .2 + r() * .55, .45 + r()); arch.add(b);
    }
    group.add(arch);
    interactables.push({ id: `cave_enter_${cave.id}`, kind: "portal", cave: cave.id, pos: new THREE.Vector3(entrance.x, world.heightAt(entrance.x, entrance.z - 1.3), entrance.z - 1.3), label: `Enter ${cave.name}` });
    // Useful supplies sit at each entrance and persist after collection.
    const branch = new THREE.Mesh(woodGeo, new THREE.MeshStandardMaterial({ color: 0x70533a, roughness: 1 }));
    branch.position.set(entrance.x + 5, h + .2, entrance.z - 3); branch.rotation.z = Math.PI / 2; branch.scale.set(1, 2.4, 1); group.add(branch);
    interactables.push({ id: `cave_wood_${cave.id}`, kind: "cave_supply", cave: cave.id, item: "drywood", mesh: branch, pos: branch.position.clone(), label: "Gather dry wood" });
    const oil = new THREE.Mesh(new THREE.CylinderGeometry(.24, .3, .65, 8), new THREE.MeshStandardMaterial({ color: 0x96794a, metalness: .35, roughness: .5 }));
    oil.position.set(entrance.x - 5, h + .35, entrance.z - 3); group.add(oil);
    interactables.push({ id: `cave_oil_${cave.id}`, kind: "cave_supply", cave: cave.id, item: "lantern_oil", mesh: oil, pos: oil.position.clone(), label: "Take lamp oil" });

    // Five chambers along a legible spine; a side alcove at the midpoint.
    // Open crossings between chambers maintain sight lines and navigation.
    const rooms = [8, 35, 63, 92, 124];
    const cell = new THREE.Group(); group.add(cell);
    const add = (geo, mat, px, py, pz, sx=1, sy=1, sz=1) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; cell.add(m); return m;
    };
    rooms.forEach((z, ri) => {
      const size = ri === 4 ? 24 : ri === 0 ? 20 : 18 + (ri % 2) * 2;
      const half = size / 2;
      add(new THREE.PlaneGeometry(size, size), floor, x, -.08, z).rotation.x = -Math.PI / 2;
      const wall = (px, pz, sx, sz) => { add(new THREE.BoxGeometry(sx, 5.5, sz), stone, px, 2.75, pz); col.box(px, pz, sx/2, sz/2, 0, 5.5); };
      wall(x-half, z, 1.4, size); wall(x+half, z, 1.4, size);
      // 6m doorway cut into both end walls.
      for (const zz of [z-half, z+half]) { wall(x-half/2-1.5, zz, half-3, 1.4); wall(x+half/2+1.5, zz, half-3, 1.4); }
      // Rough columns, crystals, roots and broken masonry make each chamber distinct.
      for (let j = 0; j < 12; j++) {
        const px = x + (r()-.5) * (size-5), pz = z + (r()-.5) * (size-5);
        if (Math.abs(px-x) < 3.5 && Math.abs(pz-z) < 5) continue;
        if (cave.id === "root") {
          const trunk = add(new THREE.CylinderGeometry(.18, .45, 3+r()*2, 6), stone, px, 1.5, pz);
          trunk.rotation.z = (r()-.5)*.55;
          add(new THREE.ConeGeometry(.5+r()*.5, 1.3+r(), 6), glow, px+.2, .55, pz, 1,.3,1);
        } else if (cave.id === "tide") {
          add(new THREE.CylinderGeometry(.28,.36,1.4,7), stone, px, .65, pz);
          if (j % 3 === 0) add(crystalGeo, glow, px, 1.65, pz, .16,.4,.16);
        } else {
          add(crystalGeo, j % 3 ? stone : glow, px, .8, pz, .45+r()*.5, .9+r(), .45+r()*.5);
          if (j % 4 === 0) add(new THREE.BoxGeometry(1.5,.22,1.5), glow, px, -.01, pz).material.emissiveIntensity = .65;
        }
      }
      // Pooling water, sap or molten seams catch the entrance light and torch.
      if (ri > 0) {
        const pool = add(new THREE.CircleGeometry(2.1 + ri*.3, 24), water, x-5.4, -.03, z+3.5);
        pool.rotation.x = -Math.PI/2; pool.scale.y = .6;
        for(let j=0;j<3;j++) {
          const shard = add(crystalGeo, glow, x-5.8+j*.55, .28, z+3.3+j*.25, .1,.28,.1);
          shard.rotation.z = (r()-.5)*.35;
        }
      }
      // Overhead ribs imply a ceiling while leaving the camera unobstructed.
      for (let j = 0; j < 3; j++) {
        const zz = z - half + 3 + j * (size-6)/2;
        add(new THREE.CylinderGeometry(.19,.33, size-3, 6), stone, x, 5.2, zz).rotation.z = Math.PI/2;
      }
      if (ri === 0 || ri === 4) {
        const lamp = new THREE.PointLight(cave.accent, ri === 0 ? 16 : 7, ri === 0 ? 18 : 10, 2);
        lamp.userData.baseIntensity = lamp.intensity;
        lamp.position.set(x+half-2, 3.3, z); group.add(lamp); world.lights.push(lamp);
        add(flameGeo, glow, x+half-2, 3.25, z, .9,1.2,.9);
      }
      if (ri === 4) {
        // The boss altar is unique in silhouette in each cave.
        if (cave.id === "root") {
          for(let j=0;j<7;j++) { const a=j*Math.PI*2/7;
            const root=add(new THREE.ConeGeometry(.5,3.4+j%2,7),stone,x+Math.cos(a)*7,1.6,z+Math.sin(a)*7);
            root.rotation.z = Math.sin(a)*.35;
          }
          add(new THREE.TorusGeometry(4,.4,8,24),glow,x,.28,z).rotation.x=Math.PI/2;
        } else if (cave.id === "tide") {
          for(let j=0;j<6;j++) { const a=j*Math.PI/3;
            add(new THREE.CylinderGeometry(.3,.46,4.6,8),stone,x+Math.cos(a)*7,2.2,z+Math.sin(a)*7);
            add(crystalGeo,glow,x+Math.cos(a)*7,4.65,z+Math.sin(a)*7,.22,.52,.22);
          }
          add(new THREE.CylinderGeometry(3.2,3.5,.4,20),stone,x,.15,z);
        } else {
          for(let j=0;j<8;j++) { const a=j*Math.PI/4;
            const shard=add(crystalGeo,j%2?glow:stone,x+Math.cos(a)*7,1.7,z+Math.sin(a)*7,.8,2.5,.8);
            shard.rotation.z=Math.sin(a)*.28;
          }
          add(new THREE.CylinderGeometry(3.4,3.6,.45,12),stone,x,.18,z);
        }
      }
      if (ri > 0 && ri < 4) spawns.push({ id: `cave_${cave.id}_${ri}`, kind: cave.mobs[ri-1], pos: [x, z], n: ri === 2 ? 3 : 2, radius: 3.4, dungeon: true });
    });
    for (let i = 0; i < rooms.length-1; i++) {
      const z0 = rooms[i]+9, z1 = rooms[i+1]-9;
      const len = z1-z0;
      add(new THREE.PlaneGeometry(7.5, len+1), floor, x, -.1, (z0+z1)/2).rotation.x = -Math.PI/2;
      for (const side of [-1,1]) {
        add(new THREE.BoxGeometry(1.2,5,len+1), stone, x+side*4.4, 2.5, (z0+z1)/2);
        col.box(x+side*4.4, (z0+z1)/2, .6, (len+1)/2, 0, 5);
      }
    }
    // A clue and small cache in the sheltered side of the third chamber.
    const clue = new THREE.Group(); clue.position.set(x+7,0,63); group.add(clue);
    if (cave.id === "root") {
      for(let j=0;j<4;j++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.55+j*.13,.08,5,20),stone); ring.rotation.x=Math.PI/2;ring.position.y=.12+j*.06;clue.add(ring); }
      for(let j=0;j<3;j++) { const egg=new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),glow);egg.scale.y=1.35;egg.position.set((j-1)*.32,.4,.08*(j%2));clue.add(egg); }
    } else if (cave.id === "tide") {
      const slate=new THREE.Mesh(new THREE.BoxGeometry(1.4,.18,.95),stone);slate.position.y=.36;clue.add(slate);
      for(let j=0;j<5;j++) { const mark=new THREE.Mesh(new THREE.BoxGeometry(.9-j*.09,.02,.035),glow);mark.position.set(-.13,.47,-.31+j*.14);clue.add(mark); }
    } else {
      const vent=new THREE.Mesh(new THREE.CylinderGeometry(.75,.85,.32,12),stone);vent.position.y=.2;clue.add(vent);
      for(let j=-2;j<=2;j++) { const bar=new THREE.Mesh(new THREE.BoxGeometry(.09,.08,1.25),glow);bar.position.set(j*.23,.41,0);clue.add(bar); }
    }
    interactables.push({ id: `cave_clue_${cave.id}`, kind: "cave_clue", cave: cave.id, pos: clue.position.clone(), label: cave.id === "root" ? "Examine the wounded nest" : cave.id === "tide" ? "Read the ferryman's ledger" : "Examine the cooling forge" });
    const chest = new THREE.Group(); chest.position.set(x+7,0,128); group.add(chest);
    const timber = new THREE.MeshStandardMaterial({ color: 0x58432c, metalness: .25, roughness: .55 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2,1.0,1.25), timber); base.position.y=.5; chest.add(base);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.2,.25,1.4),stone); lid.position.y=1.12; chest.add(lid);
    for (const side of [-.75,.75]) { const band=new THREE.Mesh(new THREE.BoxGeometry(.14,1.22,1.35),glow);band.position.set(side,.65,0);chest.add(band); }
    const seal=new THREE.Mesh(crystalGeo,glow); seal.position.set(0,.75,.7);seal.scale.set(.22,.32,.12);chest.add(seal);
    interactables.push({ id: `cave_chest_${cave.id}`, kind: "cave_chest", cave: cave.id, pos: new THREE.Vector3(x+7,0,128), label: `Open ${cave.name} reliquary` });
    spawns.push({ id: `cave_boss_${cave.id}`, kind: cave.boss, pos: [x, 124], n: 1, radius: 0, dungeon: true, boss: true, cave: cave.id });
    const exit = new THREE.Mesh(new THREE.TorusGeometry(2.6,.5,7,14,Math.PI), stone);
    exit.position.set(x,2.2,-1.5); group.add(exit);
    interactables.push({ id: `cave_exit_${cave.id}`, kind: "portal", cave: cave.id, pos: new THREE.Vector3(x,0,1), label: "Return to the surface" });
  });
}
