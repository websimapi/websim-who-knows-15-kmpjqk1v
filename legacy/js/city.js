// Marrowgate: a dense, hand-laid walled city for Act I. Streets, a market
// plaza, half-timbered row houses with jettied upper floors, landmark
// buildings, a keep, gatehouses with crenellated walls, lamps and props.
// Everything is merged into a few meshes so the city stays cheap to draw.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fork } from "./rng.js";
import { HOUSE_LOTS } from "../server.js";

function colorGeo(g, hex) {
  if (g.index) g = g.toNonIndexed();
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

// cobblestone texture, drawn once
function cobbleTexture() {
  const s = 512, cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d");
  g.fillStyle = "#3b3833"; g.fillRect(0, 0, s, s);
  const r = fork(7, "cobble");
  const rows = 12;
  for (let j = 0; j < rows; j++) {
    const h = s / rows, off = (j % 2) * 0.5;
    let x = -off * 40;
    while (x < s) {
      const w = 30 + r() * 26;
      const l = 40 + r() * 34;
      g.fillStyle = `hsl(${30 + r() * 14}, ${8 + r() * 8}%, ${l * 0.62}%)`;
      g.beginPath();
      g.roundRect(x + 2, j * h + 2, w - 4, h - 4, 7);
      g.fill();
      g.fillStyle = "rgba(255,240,210,0.07)";
      g.fillRect(x + 5, j * h + 4, w - 12, 4);
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const PLASTER = ["#c4b394", "#b9a888", "#cbbd9f", "#b39c76", "#c0ad8c", "#a89676", "#c2aa86", "#b5a184", "#a8b0a0", "#c4a88c"];
const STONE = ["#8f877a", "#9a9284", "#7f786d", "#a39b8c"];
const TIMBER = ["#3a2618", "#2f2016", "#4a3020", "#33261c"];
const ROOF = ["#6a3a2a", "#5a2e22", "#4a4038", "#7a4630", "#3d3a3a", "#5f4a3a", "#734031"];

function deedSign() {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const wood = new THREE.Mesh(new THREE.BoxGeometry(1.98, .76, .12),
    new THREE.MeshStandardMaterial({ color: 0x4b3021, roughness: .9 }));
  wood.castShadow = true;
  group.add(wood);
  const lettering = new THREE.Mesh(new THREE.PlaneGeometry(1.86, .65),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  lettering.position.z = .064;
  group.add(lettering);

  let current = null;
  function setName(name) {
    const label = String(name || "Vacant").trim() || "Vacant";
    if (label === current) return;
    current = label;
    ctx.fillStyle = "#33271e"; ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = "#b9975d"; ctx.lineWidth = 5;
    ctx.strokeRect(12, 12, 488, 168);
    ctx.fillStyle = "#b9975d";
    for (const x of [28, 484]) for (const y of [28, 164]) {
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    const words = label.split(/\s+/);
    let lines = [label];
    ctx.font = "bold 62px Georgia, serif";
    if (words.length > 1 && ctx.measureText(label).width > 440) {
      let best = Infinity;
      for (let i = 1; i < words.length; i++) {
        const pair = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
        const width = Math.max(...pair.map(line => ctx.measureText(line).width));
        if (width < best) { best = width; lines = pair; }
      }
    }
    const base = lines.length === 1 ? 62 : 49;
    const maxWidth = Math.max(...lines.map(line => {
      ctx.font = `bold ${base}px Georgia, serif`;
      return ctx.measureText(line).width;
    }));
    const size = Math.min(base, base * 440 / maxWidth);
    ctx.font = `bold ${size}px Georgia, serif`;
    ctx.fillStyle = "#f4e4bb";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    lines.forEach((line, i) => ctx.fillText(line, 256, lines.length === 1 ? 98 : 70 + i * 53));
    texture.needsUpdate = true;
  }
  setName("Vacant");
  return { group, texture, setName };
}

export function buildMarrowgate(world) {
  const M = world.sites.marrowgate, R = M.r;
  const Y = M.flatH;
  const rand = fork(world.seed, "marrowgate-city");
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const solid = [], glass = [], cloth = [];
  const occ = []; // local AABBs [x0, z0, x1, z1]

  const reserve = (x0, z0, x1, z1) => occ.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  const free = (x0, z0, x1, z1, m = 0.15) => {
    if (Math.max(Math.abs(x0), Math.abs(x1), Math.abs(z0), Math.abs(z1)) > R - 1.25) return false;
    for (const o of occ) if (x0 < o[2] - m && x1 > o[0] + m && z0 < o[3] - m && z1 > o[1] + m) return false;
    return true;
  };
  // world-space collider from a local AABB
  const colBox = (x0, z0, x1, z1, h) => world.col.box(M.x + (x0 + x1) / 2, M.z + (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, 0, h).top = Y + h;

  // part helpers in a local frame; `T` places the finished geometry
  const box = (list, w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
    list.push(colorGeo(g.translate(x, y, z), color));
  };
  // everything is built in city-local space (origin = plaza centre at street level)
  const place = (parts, rot, x, z) => parts.map((g) => g.rotateY(rot).translate(x, 0, z));

  // ---------- half-timbered house (local: centred, front faces +z) ----------
  function house(w, d, floors, opt = {}) {
    const S = [], G = [], C = [];
    const wall = opt.wall || pick(PLASTER), tim = opt.timber || pick(TIMBER), roof = opt.roof || pick(ROOF);
    const stoneBase = opt.stone || pick(STONE);
    const fh = 3;
    const residential = !opt.landmark;
    const windows = [], rayHoles = { front: [], back: [] };
    const wallColor = opt.allStone ? stoneBase : (rand() < .5 ? stoneBase : wall);
    // Build actual openings in the masonry. The window pane is a separate
    // transparent mesh so the depth buffer can show actors behind it.
    function faceWall(width, depth, centerZ, baseY, openings, color, front) {
      const faceZ = centerZ + (front ? depth / 2 - .11 : -depth / 2 + .11);
      const cuts = [-width / 2, width / 2, ...openings.flatMap(o => [o.x - o.w / 2, o.x + o.w / 2])].sort((a,b) => a-b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const left = cuts[i], right = cuts[i+1], mid = (left + right) / 2;
        if (right - left < .001) continue;
        const hole = openings.find(o => mid > o.x - o.w / 2 + .001 && mid < o.x + o.w / 2 - .001);
        const spans = hole ? [[0,hole.bottom],[hole.top,fh]] : [[0,fh]];
        for (const [lo,hi] of spans) if (hi - lo > .001) box(S,right-left,hi-lo,.22,mid,baseY+(lo+hi)/2,faceZ,color);
      }
      for (const o of openings) {
        rayHoles[front ? "front" : "back"].push({ min:o.x-o.w/2, max:o.x+o.w/2, y0:baseY+o.bottom, y1:baseY+o.top });
        if (o.door) continue;
        // The pane sits inside the opening; trim and muntins sit in front of it.
        // Separating their planes avoids the flickering/cut-through at the frame.
        const side = front ? 1 : -1;
        const trimZ = faceZ + side*.16;
        const midY = baseY + (o.bottom + o.top) / 2;
        const height = o.top - o.bottom;
        for (const sx of [-1,1]) box(S,.09,height+.08,.12,o.x+sx*(o.w/2-.005),midY,trimZ,tim);
        for (const yy of [o.bottom+.005,o.top-.005]) box(S,o.w+.08,.09,.12,o.x,baseY+yy,trimZ,tim);
        box(S,.045,height-.08,.09,o.x,midY,trimZ,tim);
        box(S,o.w-.08,.045,.09,o.x,midY,trimZ,tim);
        windows.push({ x:o.x, y:midY, z:faceZ+side*.085, w:o.w-.08, h:height-.08 });
      }
    }
    function shellLevel(width, depth, centerZ, baseY, frontOpenings, backOpenings, color) {
      faceWall(width,depth,centerZ,baseY,frontOpenings,color,true);
      faceWall(width,depth,centerZ,baseY,backOpenings,color,false);
      for (const sx of [-1,1]) box(S,.22,fh,depth-.22,sx*(width/2-.11),baseY+fh/2,centerZ,color);
    }
    if (residential) {
      const dx = opt.doorX ?? 0;
      const sx = dx > 0 ? -Math.max(1.55,w/4) : Math.max(1.55,w/4);
      shellLevel(w,d,0,0,
        [{x:dx,w:1.32,bottom:0,top:2.25,door:true}, ...(w>4.5?[{x:sx,w:1.4,bottom:.95,top:2.15}]:[])],
        [{x:0,w:1.05,bottom:1.02,top:2.22}],wallColor);
      for (const side of [-1,1]) box(S,.09,2.25,.14,dx+side*.705,1.125,d/2+.005,tim);
      box(S,1.5,.16,.14,dx,2.29,d/2+.005,tim);
      const rampAngle=Math.atan2(.35,1.1);
      box(S,1.32,.07,1.1,dx,.175,d/2,0x674b33,rampAngle);
    } else box(S,w,fh,d,0,fh/2,0,wallColor);
    if(residential) {
      const dx=opt.doorX??0, gap=1.32, left=-(w+.12)/2, right=(w+.12)/2;
      const leftW=dx-gap/2-left, rightW=right-(dx+gap/2);
      if(leftW>.01) box(S,leftW,.35,d+.12,left+leftW/2,.17,0,"#5d574e");
      if(rightW>.01) box(S,rightW,.35,d+.12,dx+gap/2+rightW/2,.17,0,"#5d574e");
      // Only the sloped threshold needs a cut. Keep the room floor continuous
      // behind it instead of leaving a doorway-width trench through the house.
      box(S,gap,.35,d-.49,dx,.17,-.305,"#5d574e");
    } else box(S,w+.12,.35,d+.12,0,.17,0,"#5d574e");
    // jettied upper floors
    let jw = w, jd = d, jz = 0;
    for (let f = 1; f < floors; f++) {
      const jet = opt.noJetty ? 0 : 0.35;
      jw += jet * 0.6; jd += jet; jz += jet / 2;
      const y0 = f * fh;
      let upper = [];
      if (residential) {
        const nwin = Math.max(1,Math.floor(jw/2.4));
        upper = Array.from({length:nwin},(_,k)=>({x:-jw/2+(k+.5)*jw/nwin,w:.86,bottom:1.05,top:2.14}));
        shellLevel(jw,jd,jz,y0,upper,[{x:0,w:1.05,bottom:1.02,top:2.16}],opt.allStone?stoneBase:wall);
        if(f===1) {
          const stairX=w/2-1.0, x0=stairX-.72, x1=stairX+.72;
          const z0=-d/2+1.03, z1=d/2-.90;
          const west=-jw/2, east=jw/2, north=jz-jd/2, south=jz+jd/2;
          const floorPanels=(height,cy,color)=>{
            const panel=(ax,bx,az,bz)=>{ if(bx>ax && bz>az) box(S,bx-ax,height,bz-az,(ax+bx)/2,cy,(az+bz)/2,color); };
            panel(west,x0,north,south);
            panel(x1,east,north,south);
            panel(x0,x1,north,z0);
            panel(x0,x1,z1,south);
          };
          floorPanels(.2,y0+.02,"#674b33");
          if(!opt.allStone) {
            // Frame the stairwell without putting another slab across it.
            const edgeY=y0+.02;
            for(const x of [x0-.055,x1+.055]) box(S,.11,.24,z1-z0,x,edgeY,(z0+z1)/2,tim);
            for(const z of [z0-.055,z1+.055]) box(S,x1-x0,.24,.11,(x0+x1)/2,edgeY,z,tim);
          }
        } else box(S,jw,.2,jd,0,y0+.02,jz,"#674b33");
      } else box(S,jw,fh,jd,0,y0+fh/2,jz,opt.allStone?stoneBase:wall);
      if (!opt.allStone) {
        // floor beam, corner posts, studs, braces
        if(residential) {
          // These beams project beyond the wall face and leave every floor
          // surface single-layered, including the higher jettied floors.
          const west=-jw/2,east=jw/2,north=jz-jd/2,south=jz+jd/2;
          for(const x of [west-.055,east+.055]) box(S,.11,.24,south-north+.16,x,y0+.02,(north+south)/2,tim);
          for(const z of [north-.055,south+.055]) box(S,east-west+.16,.24,.11,(west+east)/2,y0+.02,z,tim);
        } else box(S, jw + 0.08, 0.22, jd + 0.08, 0, y0 + 0.11, jz, tim);
        for (const sx of [-1, 1]) box(S, 0.2, fh, 0.2, sx * (jw / 2 - 0.05), y0 + fh / 2, jz + jd / 2 - 0.05, tim);
        const studs = Math.max(2, Math.round(jw / 1.5));
        for (let k = 1; k < studs; k++) {
          const studX = -jw / 2 + (k * jw) / studs;
          if (upper.some(o => Math.abs(studX - o.x) < o.w / 2 + 0.12)) continue;
          box(S, 0.14, fh, 0.08, studX, y0 + fh / 2, jz + jd / 2 + 0.02, tim);
        }
        for (const [braceX, angle] of [[-jw / 2 + .75, .6], [jw / 2 - .75, -.6]]) {
          const sweep = Math.sin(Math.abs(angle)) * 1.3 + .08;
          if (upper.some(o => Math.abs(braceX - o.x) < o.w / 2 + sweep)) continue;
          box(S, 0.12, 2.6, 0.08, braceX, y0 + fh / 2, jz + jd / 2 + 0.03, tim, 0, 0, angle);
        }
        // side studs
        for (const sx of [-1, 1]) for (let k = 1; k < 3; k++) box(S, 0.08, fh, 0.14, sx * (jw / 2 + 0.02), y0 + fh / 2, jz - jd / 2 + (k * jd) / 3, tim);
      }
      // windows on this floor
      const nwin = Math.max(1, Math.floor(jw / 2.4));
      for (let k = 0; k < nwin; k++) {
        const wx = -jw / 2 + (k + 0.5) * (jw / nwin);
        const glassColor = rand() < 0.55 ? "#ffcf86" : "#2a3138";
        if (!residential) {
          box(G, 0.85, 1.1, 0.1, wx, y0 + 1.55, jz + jd / 2 + 0.05, glassColor);
          box(S, 1.05, 0.12, 0.2, wx, y0 + 0.95, jz + jd / 2 + 0.1, tim);
        }
        if (rand() < 0.5) for (const sx of [-1, 1]) {
          const shutter = opt.shutter || pick(["#3f5a4a", "#5a3a2a", "#3a4a5e", "#6a5a3a"]);
          if (!residential) box(S, 0.42, 1.15, 0.06, wx + sx * 0.66, y0 + 1.55, jz + jd / 2 + 0.08, shutter);
        }
        if (rand() < 0.25) {
          const flowers = pick(["#a8384a", "#d8a040", "#7a5aa8", "#e0e0d0"]);
          if (!residential) box(C, 0.95, 0.28, 0.3, wx, y0 + 0.82, jz + jd / 2 + 0.25, flowers);
        }
      }
    }
    // ground floor: door + shop window
    if (!residential) box(S, 1.3, 2.25, 0.14, opt.doorX ?? 0, 1.12, d / 2 + 0.05, "#2a1a10");
    if (!residential) box(S, 1.6, 0.22, 0.24, opt.doorX ?? 0, 2.35, d / 2 + 0.08, tim);
    if (w > 4.5) {
      const sx = (opt.doorX ?? 0) > 0 ? -w / 4 : w / 4;
      const glassColor = rand() < 0.7 ? "#ffc878" : "#2a3138";
      if (!residential) {
        box(G, 1.5, 1.2, 0.1, sx, 1.5, d / 2 + 0.05, glassColor);
        box(S, 1.7, 0.14, 0.3, sx, 0.88, d / 2 + 0.12, tim);
      }
      if (opt.awning !== false && rand() < 0.45) {
        const awning = pick(["#8a2a2a", "#2a4a6a", "#5a6a2a", "#7a5a2a"]);
        if (!residential) box(C, 2.1, 0.08, 1.1, sx, 2.6, d / 2 + 0.5, awning, 0.32);
      }
    }
    if (residential && floors > 1) {
      const count = 10, front = d/2-1.0, back = -d/2+1.15, run = (front-back)/count;
      const stairX = w/2-1.0;
      for (let i=0;i<count;i++) {
        const top = .35+(i+1)*(2.77/count);
        box(S,1.08,top-.35,run-.018,stairX,.35+(top-.35)/2,front-(i+.5)*run,"#79583a");
        box(S,1.16,.06,run,stairX,top,front-(i+.5)*run,"#a47b4c");
      }
      for (let i=1;i<count;i+=2) box(S,.08,.7,.08,stairX-.63,.7+i*(2.77/count),front-i*run,"#513c2a");
      const railRun=front-back,railLength=Math.hypot(railRun,2.77);
      box(S,.1,railLength,.1,stairX-.63,.35+2.77/2+.78,(front+back)/2,"#513c2a",Math.atan2(-railRun,2.77));
      box(S,.09,.78,front-back-.8,w/2-1.5,3.52,(front+back)/2+.4,"#513c2a");
    }
    // roof
    const top = floors * fh;
    const side = opt.sideGable ?? rand() < 0.5; // ridge along x (side gable) or z
    const span = side ? jd : jw, len = side ? jw : jd;
    const ov = 0.45;
    const rh = span * (opt.pitch ?? 0.62);
    const ang = Math.atan2(rh, span / 2);
    const run = span / 2 + ov;
    const slabL = run / Math.cos(ang) + 0.1;
    const ymid = top + rh - (run * Math.tan(ang)) / 2;
    for (const s of [-1, 1]) {
      const g = side
        ? new THREE.BoxGeometry(len + ov * 2, 0.2, slabL).rotateX(s * ang).translate(0, ymid + 0.08, jz + (s * run) / 2)
        : new THREE.BoxGeometry(slabL, 0.2, len + ov * 2).rotateZ(-s * ang).translate((s * run) / 2, ymid + 0.08, jz);
      S.push(colorGeo(g, roof));
    }
    // gable end walls
    const sh = new THREE.Shape();
    sh.moveTo(-span / 2, 0); sh.lineTo(span / 2, 0); sh.lineTo(0, rh); sh.closePath();
    const gab = new THREE.ExtrudeGeometry(sh, { depth: len - 0.02, bevelEnabled: false }).translate(0, 0, -(len - 0.02) / 2);
    if (side) gab.rotateY(Math.PI / 2);
    S.push(colorGeo(gab.translate(0, top, jz), opt.allStone ? stoneBase : wall));
    box(S, side ? len + ov * 2 : 0.28, 0.28, side ? 0.28 : len + ov * 2, 0, top + rh + 0.02, jz, "#2c2420"); // ridge cap
    // gable timber triangle on the street face when front-gabled
    if (!side && !opt.allStone) {
      box(S, 0.16, rh * 0.9, 0.1, 0, top + rh * 0.45, jz + jd / 2 + 0.03, tim);
      box(S, span * 0.9, 0.16, 0.1, 0, top + rh * 0.35, jz + jd / 2 + 0.03, tim);
      if (!residential) box(G, 0.6, 0.7, 0.1, 0, top + rh * 0.55, jz + jd / 2 + 0.04, "#ffcf86");
    }
    // chimney
    if (rand() < 0.75) {
      const cx = (rand() - 0.5) * (side ? len * 0.6 : span * 0.4), cz = jz + (side ? -span * 0.2 : (rand() - 0.5) * len * 0.5);
      box(S, 0.8, rh + 1.6, 0.8, cx, top + (rh + 1.6) / 2 + 0.2, cz, pick(STONE));
      box(S, 1.0, 0.2, 1.0, cx, top + rh + 1.9, cz, "#5d574e");
    }
    return { S, G, C, windows, rayHoles, residential, top: top + rh, depth: jd + jz };
  }

  // rot from facing direction
  const ROT = { "+z": 0, "-z": Math.PI, "+x": Math.PI / 2, "-x": -Math.PI / 2 };
  world.cityDoors = [];
  const addDoor = (cx, cz, w, d, face, floors, opt = {}) => {
    const rot = ROT[face], dx = opt.doorX ?? 0;
    const nx = Math.sin(rot), nz = Math.cos(rot);
    const tx = Math.cos(rot), tz = -Math.sin(rot);
    const front = d / 2 + .13;
    const px = M.x + cx + tx * dx + nx * (front + .74);
    const pz = M.z + cz + tz * dx + nz * (front + .74);
    const id = `marrow_door_${world.cityDoors.length}`;
    const landmark = opt.landmark || null;
    const locked = opt.locked ?? (!landmark && (world.cityDoors.length * 17 + 3) % 7 < 2);
    const door = { id, kind: "city_door", pos: new THREE.Vector3(px, Y, pz), label: landmark || opt.propertyName || "Townhouse", landmark,
      property: !!opt.propertyName, theme: opt.theme || null, price: opt.price || 0,
      locked, width: w, depth: d, floors, cx, cz, face, rot, nx, nz, tx, tz, doorX: dx };
    world.cityDoors.push(door);
    world.interactables.push(door);
    const leaf = new THREE.Group();
    const doorPlane = d / 2 - .035;
    leaf.position.set(M.x + cx + tx * (dx - .67) + nx * doorPlane, Y, M.z + cz + tz * (dx - .67) + nz * doorPlane);
    leaf.rotation.y = rot;
    const wood = new THREE.MeshStandardMaterial({ color: locked ? 0x593a27 : 0x6c452c, roughness: .86 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xbca46e, metalness: .72, roughness: .34 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.34, 2.24, .13), wood);
    slab.position.set(.67, 1.12, 0); slab.castShadow = true; leaf.add(slab);
    for (let y of [.22, .77, 1.36, 1.91]) { const band = new THREE.Mesh(new THREE.BoxGeometry(1.34, .055, .018), metal); band.position.set(.67, y, .072); leaf.add(band); }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(.085, 10, 8), metal); knob.position.set(1.03, 1.08, .13); leaf.add(knob);
    world.group.add(leaf); door.leaf = leaf;
    door.collider = world.col.box(M.x+cx+tx*dx+nx*doorPlane,M.z+cz+tz*dx+nz*doorPlane,.67,.08,rot,2.24,Y);
    door.collider.top=Y+2.24;
    if (door.property) {
      const sign = deedSign();
      sign.group.position.set(M.x + cx - tx * 1.67 + nx * (front + .16), Y + 1.71,
        M.z + cz - tz * 1.67 + nz * (front + .16));
      sign.group.rotation.y = rot;
      world.group.add(sign.group);
      door.setSignName = sign.setName;
      (world.citySignTextures ||= []).push(sign.texture);
    }
    return door;
  };
  function putHouse(cx, cz, w, d, face, floors, opt) {
    const h = house(w, d, floors, opt);
    const rot = ROT[face];
    solid.push(...place(h.S, rot, cx, cz));
    glass.push(...place(h.G, rot, cx, cz));
    cloth.push(...place(h.C, rot, cx, cz));
    const sw = face === "+x" || face === "-x";
    const hw = (sw ? d : w) / 2, hd = (sw ? w : d) / 2;
    if (h.residential) {
      const tx = Math.cos(rot), tz = -Math.sin(rot), nx = Math.sin(rot), nz = Math.cos(rot);
      world.cityGlassMaterial ||= new THREE.MeshStandardMaterial({
        color:0xb9d3d0, metalness:.08, roughness:.16, transparent:true, opacity:.16,
        depthWrite:false, side:THREE.DoubleSide,
      });
      for (const pane of h.windows) {
        (world.cityWindowPanes ||= []).push({
          x:M.x+cx+tx*pane.x+nx*pane.z,y:Y+pane.y,z:M.z+cz+tz*pane.x+nz*pane.z,
          rot,w:pane.w,h:pane.h,
        });
      }
      const wallCollider = (lx,lz,cw,cd,holes=[]) => {
        const c = world.col.box(M.x+cx+tx*lx+nx*lz,M.z+cz+tz*lx+nz*lz,cw,cd,rot,floors*3);
        c.top = Y+floors*3;
        c.holes = holes.map(hole=>({axis:"x",...hole,y0:Y+hole.y0,y1:Y+hole.y1}));
        return c;
      };
      wallCollider(0,d/2,w/2,.13,h.rayHoles.front);
      wallCollider(0,-d/2,w/2,.13,h.rayHoles.back);
      wallCollider(-w/2,0,.13,d/2);
      wallCollider(w/2,0,.13,d/2);
      if(floors>1) {
        const railZ=.4;
        const c=wallCollider(w/2-1.5,railZ,.055,(d-2.95)/2);
        c.y0=Y+3.12; c.top=Y+4.05;
      }
      (world.houseFloors ||= []).push({x:M.x+cx,z:M.z+cz,w,d,rot,base:Y+.35,ground:Y,upper:floors>1?Y+3.12:null,doorX:opt.doorX??0,doorWidth:1.32,stairX:w/2-1.0,stairHalf:.54,stairBack:-d/2+1.15,stairFront:d/2-1});
    } else colBox(cx - hw, cz - hd, cx + hw, cz + hd, h.top);
    const door = addDoor(cx, cz, w, d, face, floors, opt);
    door.residential = h.residential;
    return h;
  }

  // ---------- streets & reserved areas ----------
  const MAIN = 4.6, LANE = 2.6, RING = 31, PLAZA = 17;
  reserve(-MAIN, -R, MAIN, R);           // north-south high street
  reserve(-R, -MAIN, R, MAIN);           // east-west high street
  for (const s of [-1, 1]) {
    reserve(s * RING - LANE, -R, s * RING + LANE, R);
    reserve(-R, s * RING - LANE, R, s * RING + LANE);
  }
  reserve(-PLAZA, -PLAZA, PLAZA, PLAZA); // market plaza

  // ---------- landmarks ----------
  const spot = (k, x, z, face = 0) => (world.spots[k] = { x: M.x + x, z: M.z + z, y: Y, face });
  const sign = (k, x, z, label) => world.interactables.push({ id: "sign_" + k, kind: "sign", pos: new THREE.Vector3(M.x + x, Y, M.z + z), label });

  // The Lantern Inn — NW of the plaza, faces the plaza (+z)
  {
    const cx = -15, cz = -23.4, w = 17, d = 11;
    putHouse(cx, cz, w, d, "+z", 3, { wall: "#d8c49c", timber: "#2a1a10", roof: "#5a2a1a", sideGable: true, awning: false, landmark: "The Lantern Inn" });
    reserve(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2 + 0.6);
    // hanging sign + porch lanterns
    box(solid, 0.12, 0.12, 1.6, cx + 4, 3.4, cz + d / 2 + 0.8, "#2a1a10");
    box(cloth, 1.1, 0.8, 0.08, cx + 4, 2.8, cz + d / 2 + 1.5, "#c9973f");
    for (const sx of [-2.4, 2.4]) box(glass, 0.3, 0.42, 0.3, cx + sx, 2.4, cz + d / 2 + 0.4, "#ffb04a");
    for (const x of [cx - 5, cx - 3, cx + 4]) {
      box(solid, 1.6, 0.8, 0.6, x, 0.4, cz + d / 2 + 1.4, "#4a3020");
      colBox(x - .8, cz + d / 2 + 1.1, x + .8, cz + d / 2 + 1.7, .8);
    }
    spot("inn", cx, cz + d / 2 + 3, 0);
    spot("inn2", cx + 5, cz + d / 2 + 3.2, 0);
    sign("inn", cx, cz + d / 2 + 2.2, "The Lantern Inn");
  }
  // Compact Counting-House — NE, stone with columns
  {
    const cx = 15, cz = -23.4, w = 15, d = 11;
    putHouse(cx, cz, w, d, "+z", 3, { allStone: true, stone: "#a8a094", roof: "#5a1f1f", sideGable: true, noJetty: true, awning: false, landmark: "Compact Counting-House", locked: true, doorX: 1.5 });
    reserve(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2 + 2.2);
    for (let k = 0; k < 5; k++) {
      const x = cx - 6 + k * 3;
      solid.push(...place([colorGeo(new THREE.CylinderGeometry(0.32, 0.38, 5.6, 12).translate(0, 2.8, 0), "#cfc8b8")], 0, x, cz + d / 2 + 1.5));
      world.col.circle(M.x + x, M.z + cz + d / 2 + 1.5, 0.4, 5.6);
    }
    box(solid, w, 0.6, 2.6, cx, 5.9, cz + d / 2 + 1.3, "#bfb6a6");
    box(solid, w + 0.6, 0.35, 3.2, cx, 0.17, cz + d / 2 + 1.4, "#8f877a");
    box(cloth, 1.2, 3.2, 0.06, cx - 4.5, 4.2, cz + d / 2 + 0.06, "#7a1f1f");
    box(cloth, 1.2, 3.2, 0.06, cx + 4.5, 4.2, cz + d / 2 + 0.06, "#7a1f1f");
    spot("counting", cx, cz + d / 2 + 4.2, 0);
    sign("counting", cx, cz + d / 2 + 3.4, "Compact Counting-House");
  }
  // Wayfinder Chapel — SW, faces the plaza (-z), bell tower with spire
  {
    const cx = -15, cz = 23.6, w = 12, d = 11.5;
    putHouse(cx, cz, w, d, "-z", 2, { allStone: true, stone: "#d2ccbe", roof: "#3a4a6a", sideGable: false, noJetty: true, pitch: 0.85, awning: false, landmark: "Wayfinder Chapel" });
    reserve(cx - w / 2 - 4.5, cz - d / 2 - 0.6, cx + w / 2, cz + d / 2);
    const tx = cx - w / 2 - 2.2, tz = cz - 1;
    box(solid, 4, 15, 4, tx, 7.5, tz, "#c9c2b2");
    box(solid, 4.4, 0.4, 4.4, tx, 15.1, tz, "#8f877a");
    for (const [ox, oz] of [[0, -2.02], [0, 2.02], [-2.02, 0], [2.02, 0]]) box(glass, ox ? 0.1 : 1, 2, oz ? 0.1 : 1, tx + ox, 12.4, tz + oz, "#2a3550");
    solid.push(...place([colorGeo(new THREE.ConeGeometry(3, 8, 4).rotateY(Math.PI / 4).translate(0, 19.3, 0), "#2f3d58")], 0, tx, tz));
    glass.push(...place([colorGeo(new THREE.OctahedronGeometry(0.45).translate(0, 23.8, 0), "#ffd27a")], 0, tx, tz));
    colBox(tx - 2, tz - 2, tx + 2, tz + 2, 15);
    // rose window
    glass.push(...place([colorGeo(new THREE.CircleGeometry(1.3, 20).translate(0, 7.6, d / 2 + 0.06), "#c9a0ff")], Math.PI, cx, cz));
    spot("chapel", cx, cz - d / 2 - 3, Math.PI);
    sign("chapel", cx, cz - d / 2 - 2.2, "Wayfinder Chapel");
  }
  // Smithy — SE, open forge
  {
    const cx = 15, cz = 23.6, w = 12, d = 10;
    putHouse(cx + 1.5, cz + 1, w - 3, d - 2, "-z", 2, { wall: "#8a7a6a", roof: "#3a3028", stone: "#6f685e", sideGable: true, awning: false, landmark: "Smithy" });
    reserve(cx - w / 2, cz - d / 2 - 2, cx + w / 2, cz + d / 2);
    // lean-to forge
    for (const [px, pz] of [[-5.6, -4.2], [-1.8, -4.2]]) box(solid, 0.25, 3, 0.25, cx + px, 1.5, cz + pz, "#3a2618");
    box(solid, 5.2, 0.15, 4.6, cx - 3.7, 3.05, cz - 2, "#4a4038", -0.18);
    box(solid, 1.8, 1, 1.4, cx - 4.4, 0.5, cz - 1.6, "#5d574e");
    glass.push(...place([colorGeo(new THREE.BoxGeometry(1.2, 0.18, 0.8).translate(0, 1.08, 0), "#ff6a1a")], 0, cx - 4.4, cz - 1.6));
    box(solid, 0.9, 0.7, 0.4, cx - 2.2, 0.35, cz - 2.8, "#26272a"); // anvil
    box(solid, 1.2, 0.18, 0.45, cx - 2.2, 0.78, cz - 2.8, "#3a3b3e");
    box(solid, 1.2, 2.2, 1.2, cx - 4.4, 3.4, cz - 1.0, "#6f685e");
    colBox(cx - 5.4, cz - 2.4, cx - 3.4, cz - 0.9, 1.2);
    colBox(cx - 2.7, cz - 3.0, cx - 1.7, cz - 2.6, 0.9);
    world.forgePos = new THREE.Vector3(M.x + cx - 4.4, Y + 1.5, M.z + cz - 1.6);
    spot("smithy", cx - 1, cz - d / 2 - 3, Math.PI);
    sign("smithy", cx, cz - d / 2 - 2.2, "Smithy");
  }
  // The Warden's Keep — north end of the high street
  {
    const cx = 0, cz = -45.5, w = 22, d = 13;
    box(solid, w, 13, d, cx, 6.5, cz, "#7f786d");
    for (let k = 0; k < 11; k++) box(solid, 1.1, 1.2, d + 0.4, cx - w / 2 + 1 + k * 2, 13.6, cz, "#7f786d");
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = cx + sx * w / 2, tz = cz + sz * d / 2;
      solid.push(...place([colorGeo(new THREE.CylinderGeometry(2.6, 2.9, 17, 14).translate(0, 8.5, 0), "#857f74"), colorGeo(new THREE.ConeGeometry(3.3, 5.5, 14).translate(0, 19.7, 0), "#3d3a3a")], 0, tx, tz));
      world.col.circle(M.x + tx, M.z + tz, 2.8, 17).top = Y + 17;
    }
    box(solid, 4.4, 5.4, 0.6, cx, 2.7, cz + d / 2 + 0.2, "#2a1a10");
    for (let k = 0; k < 6; k++) box(glass, 0.6, 1.6, 0.1, cx - 7.5 + k * 3, 9, cz + d / 2 + 0.06, "#ffcf86");
    for (const sx of [-5, 5]) box(cloth, 1.8, 6, 0.08, cx + sx, 7.5, cz + d / 2 + 0.1, "#8a1f1f");
    colBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 14);
    addDoor(cx, cz, w, d, "+z", 2, { landmark: "The Warden's Keep", locked: true });
    reserve(cx - w / 2 - 3, cz - d / 2 - 3, cx + w / 2 + 3, cz + d / 2 + 3);
    sign("keep", cx, cz + d / 2 + 2, "The Warden's Keep");
  }

  // ---------- row houses along every street frontage ----------
  // These four surveyed plots always get the same door IDs, so a deed can
  // refer to the same building in local saves and every online realm.
  for (const lot of HOUSE_LOTS) {
    const w = 7, d = 7.5;
    reserve(lot.x - w / 2 - .3, lot.z - d / 2 - .3, lot.x + w / 2 + .3, lot.z + d / 2 + .3);
    putHouse(lot.x, lot.z, w, d, lot.face, 2, { propertyName: lot.name, theme: lot.theme, price: lot.price, locked: false,
      wall: lot.theme === "herbalist" ? "#aeb59a" : lot.theme === "scribe" ? "#b7a68b" : "#c4ad8e", awning: false });
  }
  // An unmistakable parchment desk beside the market marks the estate agent.
  box(solid, 1.8, .75, .75, 10, .38, 8, "#64432a");
  box(solid, 1.45, .035, .5, 10, .79, 8, "#d8c39b");
  box(solid, .78, 1.12, .42, 10, 1.48, 8.8, "#31465b");
  box(solid, .43, .51, .43, 10, 2.29, 8.8, "#b89472");
  box(solid, .51, .19, .5, 10, 2.62, 8.8, "#4b392d");
  for (const x of [9.48,10.52]) {
    box(solid, .22, .84, .27, x, 1.43, 8.8, "#31465b");
    box(solid, .2, .75, .23, x, .42, 8.84, "#3d3834");
  }
  box(solid, .08, .62, .08, 10.43, 1.12, 8.0, "#312a25", 0, 0, .42);
  world.interactables.push({ id: "estate_agent", kind: "estate_agent", label: "Speak to the estate agent", pos: new THREE.Vector3(M.x + 10, Y, M.z + 6.8) });
  colBox(9.1, 7.62, 10.9, 8.38, .8);
  // frontage: line along `axis` at `at`; houses extend in direction n; front faces -n
  const fr = [];
  const sides = (axis, c, half) => { fr.push({ axis, at: c - half - 0.1, n: -1 }, { axis, at: c + half + 0.1, n: 1 }); };
  sides("x", 0, MAIN); sides("z", 0, MAIN);
  for (const s of [-1, 1]) { sides("x", s * RING, LANE); sides("z", s * RING, LANE); }
  fr.push({ axis: "x", at: -PLAZA - 0.1, n: -1 }, { axis: "x", at: PLAZA + 0.1, n: 1 }, { axis: "z", at: -PLAZA - 0.1, n: -1 }, { axis: "z", at: PLAZA + 0.1, n: 1 });
  // houses backed onto the inner face of the wall, facing inward
  const wallFr = [{ axis: "x", at: -R + 1.3, n: 1 }, { axis: "x", at: R - 1.3, n: -1 }, { axis: "z", at: -R + 1.3, n: 1 }, { axis: "z", at: R - 1.3, n: -1 }];
  const props = [];
  let houseCount = HOUSE_LOTS.length;
  const layFrontage = (f, inward) => {
    let t = -R + 1.5;
    while (t < R - 1.5) {
      const w = 4.6 + rand() * 3.6, d = 6 + rand() * 3.5;
      const floors = rand() < 0.2 ? 4 : rand() < 0.55 ? 3 : 2;
      const a = t, b = t + w;
      // footprint in local coords (include jetty allowance)
      const n0 = f.at, n1 = f.at + f.n * (d + 0.6);
      const [x0, z0, x1, z1] = f.axis === "x" ? [a, n0, b, n1] : [n0, a, n1, b];
      if (free(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1))) {
        reserve(x0, z0, x1, z1);
        const cn = f.at + f.n * (d / 2 + (inward ? 0 : 0.0));
        const ct = (a + b) / 2;
        // facing: street frontage faces back toward the street (-n); wall frontage faces inward (+n)
        const dir = inward ? f.n : -f.n;
        const face = f.axis === "x" ? (dir > 0 ? "+z" : "-z") : (dir > 0 ? "+x" : "-x");
        // street frontage houses: the jetty grows toward the front, so pull the body back a touch
        const pull = inward ? 0 : 0.35;
        const cx = f.axis === "x" ? ct : cn + f.n * pull, cz = f.axis === "x" ? cn + f.n * pull : ct;
        putHouse(cx, cz, w - 0.1, d, face, floors, { doorX: (rand() - 0.5) * w * 0.4 });
        houseCount++;
        if (rand() < 0.35) props.push({ x: f.axis === "x" ? b + 0.2 : f.at - f.n * 0.9, z: f.axis === "x" ? f.at - f.n * 0.9 : b + 0.2 });
        t = b + (rand() < 0.12 ? 2.2 : 0.05); // occasional alley
      } else t += 1.2;
    }
  };
  for (const f of fr) layFrontage(f, false);
  for (const f of wallFr) layFrontage(f, true);
  // second pass: fill leftover block interiors with courtyard sheds
  for (let k = 0; k < 140; k++) {
    const x = (rand() * 2 - 1) * (R - 4), z = (rand() * 2 - 1) * (R - 4);
    const w = 3.5 + rand() * 2.5, d = 3.5 + rand() * 2;
    if (!free(x - w / 2 - 0.6, z - d / 2 - 0.6, x + w / 2 + 0.6, z + d / 2 + 0.6, 0)) continue;
    reserve(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    putHouse(x, z, w, d, pick(["+z", "-z", "+x", "-x"]), rand() < 0.5 ? 1 : 2, { awning: false });
    houseCount++;
  }
  world.cityHouses = houseCount;

  // ---------- props: barrels, crates, carts ----------
  for (const p of props) {
    if (Math.abs(p.x) > R - 3 || Math.abs(p.z) > R - 3) continue;
    const kind = rand();
    if (kind < 0.5) {
      for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) {
        const ox = (rand() - 0.5) * 1.2, oz = (rand() - 0.5) * 1.2;
        solid.push(...place([colorGeo(new THREE.CylinderGeometry(0.36, 0.32, 0.95, 10).translate(0, 0.47, 0), "#6a4a2c"), colorGeo(new THREE.TorusGeometry(0.36, 0.03, 4, 12).rotateX(Math.PI / 2).translate(0, 0.72, 0), "#2a2a2a"), colorGeo(new THREE.TorusGeometry(0.36, 0.03, 4, 12).rotateX(Math.PI / 2).translate(0, 0.22, 0), "#2a2a2a")], 0, p.x + ox, p.z + oz));
      }
      world.col.circle(M.x + p.x, M.z + p.z, 0.9, 1);
    } else {
      for (let i = 0; i < 2; i++) box(solid, 0.8, 0.8, 0.8, p.x + i * 0.3, 0.4 + i * 0.8, p.z + i * 0.1, "#8a6a40", 0, rand());
      world.col.circle(M.x + p.x, M.z + p.z, 0.7, 1.6);
    }
  }

  // ---------- plaza: fountain, market stalls, trees, notice board ----------
  solid.push(...place([
    colorGeo(new THREE.CylinderGeometry(4.6, 4.9, 0.9, 28).translate(0, 0.45, 0), "#9a9488"),
    colorGeo(new THREE.CylinderGeometry(1.6, 1.8, 1.6, 16).translate(0, 1.4, 0), "#a39b8c"),
    colorGeo(new THREE.CylinderGeometry(2.2, 1.2, 0.35, 16).translate(0, 2.3, 0), "#a39b8c"),
    colorGeo(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 10).translate(0, 3.4, 0), "#a39b8c"),
    colorGeo(new THREE.SphereGeometry(0.6, 12, 10).translate(0, 4.8, 0), "#c9a04a"),
  ], 0, 0, 0));
  world.col.circle(M.x, M.z, 4.9, 1.2);
  world.fountain = new THREE.Vector3(M.x, Y, M.z);
  // A fixed arrival point for characters brought in from another realm.
  const portal = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x756b83, roughness: .8 });
  const veil = new THREE.MeshBasicMaterial({ color: 0x76b8dc, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(.32, 2.8, .42), stone);
    pillar.position.set(side * 1.15, 1.4, 0); portal.add(pillar);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.65, .38, .48), stone);
  lintel.position.y = 2.82; portal.add(lintel);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.6), veil);
  glow.position.y = 1.35; portal.add(glow);
  portal.position.set(M.x - 8, Y, M.z - 1);
  world.group.add(portal);
  world.spots.realmPortal = { x: M.x - 8, z: M.z + 1.8, y: Y };
  const water = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0x3e6e7e, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.85 }));
  water.position.set(M.x, Y + 0.82, M.z);
  world.group.add(water);
  const stallCols = [["#8a2a2a", "#e8dcc0"], ["#2a4a6a", "#e8dcc0"], ["#5a6a2a", "#e0d0a0"], ["#7a5a2a", "#f0e4c8"], ["#5a2a6a", "#e8dcc0"], ["#2a6a5a", "#efe2c4"]];
  const goods = ["#c8432a", "#e0a030", "#6a9a3a", "#8a5a3a", "#d0c8a0", "#a03a6a"];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.31;
    if (Math.abs(Math.sin(a)) < 0.22 || Math.abs(Math.cos(a)) < 0.22) continue; // keep the high streets clear
    const rr = 11.2, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const rot = -a - Math.PI / 2;
    const [c1, c2] = stallCols[k % stallCols.length];
    const parts = [];
    box(parts, 2.8, 0.9, 1.4, 0, 0.45, 0, "#5a3a22");
    for (let g = 0; g < 4; g++) box(parts, 0.5, 0.3, 0.5, -1 + g * 0.66, 1.05, 0, goods[(k + g) % goods.length]);
    for (const sx of [-1.35, 1.35]) for (const sz of [-0.65, 0.65]) box(parts, 0.1, 2.4, 0.1, sx, 1.2, sz, "#3a2618");
    for (let s = 0; s < 5; s++) box(cloth, 0.56, 0.06, 1.9, -1.12 + s * 0.56, 2.45, 0.2, s % 2 ? c1 : c2, 0.22);
    solid.push(...place(parts, rot, x, z));
    // stripes need the same transform
    const last = cloth.splice(cloth.length - 5, 5);
    cloth.push(...place(last, rot, x, z));
    world.col.box(M.x + x, M.z + z, 1.43, .82, -rot, 2.5).top = Y + 2.5;
  }
  const treeG = (x, z) => {
    solid.push(...place([
      colorGeo(new THREE.CylinderGeometry(1.2, 1.3, 0.5, 12).translate(0, 0.25, 0), "#8f877a"),
    ], 0, x, z));
    (world.cityTreePositions ||= []).push([M.x + x, Y + .55, M.z + z, .77, (x + z) * .13]);
    world.col.circle(M.x + x, M.z + z, 1.3, 3);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) treeG(sx * 14.2, sz * 14.2);
  // notice board by the south side of the plaza
  box(solid, 2.4, 1.6, 0.15, 7.5, 1.7, 15, "#5a3a22");
  box(solid, 0.15, 2.6, 0.15, 6.4, 1.3, 15, "#3a2618"); box(solid, 0.15, 2.6, 0.15, 8.6, 1.3, 15, "#3a2618");
  for (let k = 0; k < 5; k++) box(cloth, 0.5, 0.6, 0.02, 6.7 + k * 0.4, 1.7 + (k % 2) * 0.2, 15.09, "#e8dcc0");
  world.col.circle(M.x + 7.5, M.z + 15, 1.2, 2);
  world.interactables.push({ id: "notice", kind: "notice", pos: new THREE.Vector3(M.x + 7.5, Y, M.z + 13.8), label: "Notice board" });

  // ---------- street lamps ----------
  world.cityLamps = [];
  const lamp = (x, z) => {
    box(solid, 0.14, 3.6, 0.14, x, 1.8, z, "#1e1e20");
    box(solid, 0.5, 0.1, 0.1, x + 0.22, 3.55, z, "#1e1e20");
    box(glass, 0.3, 0.4, 0.3, x + 0.42, 3.3, z, "#ffbe62");
    world.col.circle(M.x + x, M.z + z, 0.2, 3.6);
    world.cityLamps.push(new THREE.Vector3(M.x + x + 0.42, Y + 3.3, M.z + z));
  };
  for (let t = -R + 8; t < R - 6; t += 12) {
    if (Math.abs(t) < PLAZA + 2) continue;
    lamp(MAIN - 0.4, t); lamp(-MAIN + 0.4, t + 6);
    lamp(t, MAIN - 0.4); lamp(t + 6, -MAIN + 0.4);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lamp(sx * (PLAZA - 1.2), sz * (PLAZA - 6));

  // ---------- walls, towers, gatehouses ----------
  const gw = 7;
  const wallH = 8.5;
  const wallSeg = (x1, z1, x2, z2) => {
    const L = Math.hypot(x2 - x1, z2 - z1), along = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const t = 2.2;
    box(solid, along ? L : t, wallH + 2, along ? t : L, cx, wallH / 2 - 1, cz, "#8d877c");
    box(solid, along ? L : t + 0.5, 0.35, along ? t + 0.5 : L, cx, wallH - 0.6, cz, "#77716a");
    // Shallow mortar courses break up the long, flat outer wall faces.
    for (let row = 0, y = 1.2; y < wallH - .45; row++, y += 1.35) {
      for (const side of [-1, 1]) {
        const face = side * (t / 2 + .023);
        box(solid, along ? L : .05, .045, along ? .05 : L,
          cx + (along ? 0 : face), y, cz + (along ? face : 0), "#716d64");
        for (let o = -L / 2 + 2.4 + (row % 2) * 2.4; o < L / 2 - .4; o += 4.8)
          box(solid, along ? .045 : .055, 1.22, along ? .055 : .045,
            cx + (along ? o : face), y - .65, cz + (along ? face : o), "#787268");
      }
    }
    const n = Math.floor(L / 1.6);
    for (let k = 0; k < n; k++) {
      const o = -L / 2 + 0.8 + k * 1.6;
      for (const s of [-1, 1]) box(solid, along ? 0.9 : 0.4, 1.1, along ? 0.4 : 0.9, cx + (along ? o : s * (t / 2 - 0.2)), wallH + 0.55, cz + (along ? s * (t / 2 - 0.2) : o), "#8d877c");
    }
    colBox(along ? x1 : cx - t / 2, along ? cz - t / 2 : z1, along ? x2 : cx + t / 2, along ? cz + t / 2 : z2, wallH);
  };
  for (const [sx, sz, ex, ez] of [[-R, -R, R, -R], [R, -R, R, -gw], [R, gw, R, R], [-R, R, -gw, R], [gw, R, R, R], [-R, -R, -R, -gw], [-R, gw, -R, R]]) wallSeg(sx, sz, ex, ez);
  const tower = (x, z, r = 3.4, h = 13) => {
    const towerParts = [
      colorGeo(new THREE.CylinderGeometry(r, r * 1.08, h + 2, 14).translate(0, h / 2 - 1, 0), "#857f74"),
      colorGeo(new THREE.CylinderGeometry(r + 0.35, r + 0.35, 0.5, 14).translate(0, h, 0), "#77716a"),
      colorGeo(new THREE.ConeGeometry(r * 1.3, 5, 14).translate(0, h + 2.7, 0), "#4a3028"),
    ];
    for (let y = 2.4; y < h - .6; y += 2.6) {
      const radius = r * (1.08 - .08 * (y + 1) / (h + 2)) + .035;
      towerParts.push(colorGeo(new THREE.CylinderGeometry(radius, radius, .095, 14).translate(0, y, 0), "#746e65"));
    }
    solid.push(...place(towerParts, 0, x, z));
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4; box(glass, 0.12, 0.9, 0.5, x + Math.cos(a) * r * 1.01, h * 0.6, z + Math.sin(a) * r * 1.01, "#ffcf86", 0, -a); }
    world.col.circle(M.x + x, M.z + z, r, h).top = Y + h;
  };
  for (const [sx, sz] of [[-R, -R], [R, -R], [R, R], [-R, R]]) tower(sx, sz, 4, 15);
  // gatehouses: two towers + a bridge over the passage + banners
  const gate = (ax, az, horiz) => {
    const o = gw + 2.4;
    tower(ax + (horiz ? -o : 0), az + (horiz ? 0 : -o), 3.2, 14);
    tower(ax + (horiz ? o : 0), az + (horiz ? 0 : o), 3.2, 14);
    box(solid, horiz ? gw * 2 + 2 : 3.2, 3.6, horiz ? 3.2 : gw * 2 + 2, ax, 9.5, az, "#857f74");
    for (let k = 0; k < 9; k++) box(solid, horiz ? 0.12 : 0.12, 2.2, horiz ? 0.12 : 0.12, ax + (horiz ? -gw + 1 + k * 1.5 : 0), 8.6, az + (horiz ? 0 : -gw + 1 + k * 1.5), "#26272a"); // raised portcullis
    for (const s of [-1, 1]) box(cloth, horiz ? 1.6 : 0.08, 4.5, horiz ? 0.08 : 1.6, ax + (horiz ? s * 3.5 : (az === 0 ? Math.sign(ax) * 1.7 : 0)), 8.6, az + (horiz ? Math.sign(az) * 1.7 : s * 3.5), "#8a1f1f");
  };
  gate(0, R, true); gate(R, 0, false); gate(-R, 0, false);
  for (const [sx, sz] of [[-R / 2, -R], [R / 2, -R], [-R, -R / 2], [R, -R / 2], [-R, R / 2], [R, R / 2], [-R / 2 - 6, R], [R / 2 + 6, R]]) tower(sx, sz, 2.6, 11);

  // ---------- ground: cobbles over the whole city ----------
  const cob = cobbleTexture();
  cob.repeat.set(R * 2 / 5, R * 2 / 5);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: cob, roughness: 0.92, color: 0xbab2a4 }));
  ground.position.set(M.x, Y + 0.03, M.z);
  ground.receiveShadow = true;
  world.group.add(ground);
  // plaza flagstones (a lighter disc of stone around the fountain)
  const flag = new THREE.Mesh(new THREE.CircleGeometry(PLAZA - 1, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: cob.clone(), roughness: 0.85, color: 0xd8cfbe }));
  flag.material.map.repeat.set(7, 7);
  flag.material.map.needsUpdate = true;
  flag.position.set(M.x, Y + 0.045, M.z);
  flag.receiveShadow = true;
  world.group.add(flag);

  // ---------- meshes ----------
  const solidM = new THREE.Mesh(mergeGeometries(solid), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }));
  solidM.castShadow = solidM.receiveShadow = true;
  const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0xff9a3a, emissiveIntensity: 0.4 });
  const glassM = new THREE.Mesh(mergeGeometries(glass), glassMat);
  const clothM = new THREE.Mesh(mergeGeometries(cloth), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
  clothM.castShadow = true;
  for (const m of [solidM, glassM, clothM]) m.position.set(M.x, Y, M.z);
  world.group.add(solidM, glassM, clothM);
  world.windowMat = glassMat;
  // All panes share color and opacity and do not write depth, so their blend
  // order is immaterial. One instance batch keeps the window count inexpensive.
  const panes=world.cityWindowPanes || [];
  if(panes.length) {
    const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),world.cityGlassMaterial,panes.length);
    const instance=new THREE.Object3D();
    panes.forEach((pane,i)=>{
      instance.position.set(pane.x,pane.y,pane.z);
      instance.rotation.set(0,pane.rot,0);
      instance.scale.set(pane.w,pane.h,1);
      instance.updateMatrix();
      mesh.setMatrixAt(i,instance.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    world.group.add(mesh);
    world.cityWindowPanes = null;
  }

  // ---------- other spots ----------
  spot("gate", -3.5, R - 9, Math.PI);
  spot("gate2", 5, R - 11, Math.PI);
  spot("square", 6, 7);
  spot("wand_table", -10, 7, Math.PI / 2);
  spot("alchemy_table", -16, 8, Math.PI / 2);
  const alchemyWood = new THREE.MeshStandardMaterial({ color: 0x57442e, roughness: .82 });
  const alchemyGlass = new THREE.MeshPhysicalMaterial({ color: 0x76c5a0, roughness: .14, metalness: .05, transparent: true, opacity: .76, transmission: .15 });
  const alchemyTop = new THREE.Mesh(new THREE.BoxGeometry(2.35, .2, 1.3), alchemyWood);
  alchemyTop.position.set(M.x - 16, Y + .97, M.z + 5.5); alchemyTop.castShadow = true; world.group.add(alchemyTop);
  world.col.box(alchemyTop.position.x, alchemyTop.position.z, 1.18, .66, 0, 1.1).top = Y + 1.1;
  for (const dx of [-.92, .92]) for (const dz of [-.48, .48]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.17, .92, .17), alchemyWood);
    leg.position.set(alchemyTop.position.x + dx, Y + .47, alchemyTop.position.z + dz); leg.castShadow = true; world.group.add(leg);
  }
  const flask = new THREE.Mesh(new THREE.SphereGeometry(.23, 16, 12), alchemyGlass);
  flask.position.set(alchemyTop.position.x + .48, Y + 1.23, alchemyTop.position.z); world.group.add(flask);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.072, .072, .26, 12), alchemyGlass);
  neck.position.set(flask.position.x, Y + 1.48, flask.position.z); world.group.add(neck);
  const mortar = new THREE.Mesh(new THREE.CylinderGeometry(.28, .19, .25, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xa79779, roughness: .9, side: THREE.DoubleSide }));
  mortar.position.set(alchemyTop.position.x - .48, Y + 1.19, alchemyTop.position.z); world.group.add(mortar);
  world.interactables.push({ id: "alchemy_table", kind: "alchemy_table", pos: new THREE.Vector3(alchemyTop.position.x, Y, M.z + 7), label: "Use alchemy table" });
  // A small street-side workbench makes the carver visible from the plaza.
  const wandBench = new THREE.Mesh(new THREE.BoxGeometry(2.2, .18, 1.05), new THREE.MeshStandardMaterial({ color: 0x69482e, roughness: .9 }));
  wandBench.position.set(M.x - 10, Y + .95, M.z + 5.1);
  world.col.box(wandBench.position.x, wandBench.position.z, 1.1, .54, 0, 1.1).top = Y + 1.1;
  wandBench.castShadow = true;
  world.group.add(wandBench);
  for (const dx of [-.86, .86]) for (const dz of [-.37, .37]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.14, .92, .14), wandBench.material);
    leg.position.set(wandBench.position.x + dx, Y + .46, wandBench.position.z + dz);
    world.group.add(leg);
  }
  spot("respawn", 0, R - 14);
  // Keep every interaction point on walkable cobbles, including doors beside props.
  for (const door of world.cityDoors) {
    for (let n = 0; n < 5; n++) world.col.resolve(door.pos, .5);
    door.pos.y = Y;
  }
  spot("docks", R + 12, 18, -Math.PI / 2);
  // pier into the river beyond the east gate
  const pier = [];
  box(pier, 16, 0.4, 4, R + 24, 0, 18, "#6a4a30");
  for (let k = 0; k < 6; k++) box(pier, 0.3, 2.4, 0.3, R + 17 + k * 2.8, -1, 16, "#3a2618");
  box(pier, 5, 0.8, 2, R + 30, -0.5, 23, "#4a3020");
  const pierM = new THREE.Mesh(mergeGeometries(pier.map((g) => g.translate(M.x, 0.6, M.z))), solidM.material);
  pierM.castShadow = pierM.receiveShadow = true;
  world.group.add(pierM);

  // walk loops for citizens (world coords)
  const W = (pts) => pts.map(([x, z]) => new THREE.Vector3(M.x + x, Y, M.z + z));
  world.cityWalks = [
    W([[-2, R - 4], [-2, 8], [-12, 12], [-12, -12], [-2, -12], [-2, -34], [2, -34], [2, -12], [12, -12], [12, 12], [2, 8], [2, R - 4]]),
    W([[-R + 4, -2], [-20, -2], [-12, -10], [12, -10], [20, -2], [R - 4, -2], [R - 4, 2], [20, 2], [12, 10], [-12, 10], [-20, 2], [-R + 4, 2]]),
    W([[-RING, -RING + 4], [-RING, RING - 4], [-6, RING], [RING, RING - 2], [RING, -RING + 2], [6, -RING]]),
    W([[9, 9], [-9, 9], [-9, -9], [9, -9]]),
  ];
}
