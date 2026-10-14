import * as THREE from 'three';
import { TASKS } from './tasks.js';
import { POOL } from './layout.js';

function grimeTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  let seed = 19;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (const [x, y, rx, ry, angle] of [[70, 79, 49, 63, -.3], [158, 132, 38, 70, .22], [99, 185, 55, 26, -.15]]) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(rx, ry);
    const haze = ctx.createRadialGradient(-.1, -.15, .04, 0, 0, 1);
    haze.addColorStop(0, 'rgba(62,59,41,.43)');
    haze.addColorStop(.45, 'rgba(75,73,51,.23)');
    haze.addColorStop(1, 'rgba(86,83,59,0)');
    ctx.fillStyle = haze; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  for (let i = 0; i < 130; i++) {
    const x = 24 + random() * 208, y = 22 + random() * 210;
    const r = .4 + random() * (i % 8 ? 2.2 : 4.8);
    ctx.fillStyle = `rgba(55,52,37,${.06 + random() * .25})`;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (.3 + random()), random() * 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const x = 35 + random() * 180, y = 25 + random() * 160;
    const length = 10 + random() * 54;
    ctx.strokeStyle = `rgba(65,62,44,${.06 + random() * .14})`;
    ctx.lineWidth = 1 + random() * 4;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 4, y + length * .3, x + 5, y + length * .7, x + random() * 8 - 4, y + length);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 18; i++) {
    const x = 30 + random() * 190, y = 25 + random() * 205;
    ctx.strokeStyle = `rgba(0,0,0,${.08 + random() * .25})`;
    ctx.lineWidth = 1 + random() * 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5 + random() * 24, y - 4 + random() * 12); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Work stays in the house: every station visibly changes as tasks progress.
export function buildTaskObjects() {
  const root = new THREE.Group(), stations = new Map(), targets = new Map(); let painter = null, mirrorGrime = null;
  const mat = color => new THREE.MeshStandardMaterial({ color, roughness: .8 });
  const wood = mat(0x98663c), green = mat(0x6aaf36), pale = mat(0xb3ce74), paper = mat(0xe7dcc3), brass = mat(0xb79550);
  const box = (g, w, h, d, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  for (const task of TASKS.filter(t => t.id !== 'pool')) {
    const g = new THREE.Group(); g.position.set(task.x, task.y, task.z); root.add(g);
    const parts = []; let update = () => {}, paint = null;
    const hits = []; targets.set(task.id, hits);
    const target = (mesh, index) => { mesh.userData.taskIndex = index; hits.push(mesh); return mesh; };
    if (task.id === 'lettuce') {
      box(g, .76, .035, .5, wood, 0, -.055);
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 7), i % 2 ? green : pale); m.scale.set(1, .75, .75); m.position.set(-.29 + i * .115, .035 + i * .008, Math.sin(i * 2.4) * .065); g.add(m); parts.push(target(m, i)); }
      const chopped = [];
      for (let i = 0; i < 18; i++) chopped.push(box(g, .065, .025, .035, i % 2 ? green : pale, -.28 + i % 6 * .1, -.02, -.13 + Math.floor(i / 6) * .12));
      update = p => { parts.forEach((m, i) => m.visible = i >= Math.floor(p * 6)); chopped.forEach((m, i) => m.visible = i < Math.floor(p * 18)); };
    } else if (task.id === 'books') {
      for (let i = 0; i < 4; i++) parts.push(target(box(g, .18, .22 + i * .075, .07, mat([0x704334, 0x365b47, 0x304863, 0x8c7441][i]), (i - 1.5) * .25, (.22 + i*.075)/2, 0), i));
      update = (p, state, local) => parts.forEach((m, i) => { const order = local?.id === 'books' ? local.order : p >= 1 ? [0, 1, 2, 3] : [2, 0, 3, 1]; const slot = order.indexOf(i); m.position.set((slot - 1.5) * .25, (.22+i*.075)/2, 0); m.rotation.y = local?.id === 'books' && local.selectedBook === slot ? .3 : 0; });
    } else if (task.id === 'papers') {
      for (let i = 0; i < 5; i++) {
        const m = target(box(g, .22, .006, .3, paper, (i - 2) * .22, i * .008, (i % 2) * .1), i); parts.push(m);
        const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'); c.fillStyle = '#eee6ce'; c.fillRect(0,0,64,64); c.fillStyle = '#493c31'; c.font = 'bold 38px Georgia'; c.textAlign = 'center'; c.fillText(String(i + 1),32,46);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(.15,.15), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide })); label.rotation.x = -Math.PI/2; label.position.y = .006; m.add(label);
      }
      update = (p, state, local) => parts.forEach((m, i) => { const done = local?.id === 'papers' ? local.cleared?.includes(i) : i < Math.round(p * 5); m.visible = !done; });
    } else if (task.id === 'darts') {
      g.rotation.y = Math.PI / 2;
      const board = new THREE.Mesh(new THREE.CircleGeometry(.32, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .001, side: THREE.DoubleSide, depthWrite: false }));
      board.position.z = .06; g.add(target(board, 0));
      const aim = new THREE.Group(); g.add(aim);
      const ring = new THREE.Mesh(new THREE.RingGeometry(.025, .029, 24), new THREE.MeshBasicMaterial({ color: 0xfff3d2, side: THREE.DoubleSide, depthTest: false })); aim.add(ring);
      const h = box(aim, .085, .004, .003, new THREE.MeshBasicMaterial({ color: 0xfff3d2, depthTest: false }));
      const v = box(aim, .004, .085, .003, h.material);
      aim.position.z = .12; aim.renderOrder = 20;
      for (let i = 0; i < 3; i++) {
        const d = new THREE.Group(); g.add(d); parts.push(d);
        d.position.set(0, 0, .085);
        const shaft = box(d, 0.012, 0.012, .20, mat(0x9a9a9a), 0, 0, .1); shaft.castShadow = false;
        box(d, 0.05, 0.05, 0.004, mat([0xc7372f, 0x2e7d4f, 0xe8c547][i]), 0, 0, .2);
      }
      const dartBorn = [];
      update = (p, state, local) => {
        const shown = local?.id === 'darts' ? local.darts : state?.darts;
        parts.forEach((m, i) => {
          const d = shown?.[i]; m.visible = !!d;
          if (d) { if (!dartBorn[i]) dartBorn[i]=performance.now(); const u=Math.min(1,(performance.now()-dartBorn[i])/260); m.position.set(d.x,d.y,.085+(1-u)*1.2); }
          else dartBorn[i]=0;
        });
        aim.visible = local?.id === 'darts' && !local.collect && local.darts.length < 3;
        if (aim.visible) aim.position.set(local.aim.x, local.aim.y, .12);
      };
    } else if (task.id === 'paint') {
      g.rotation.y = -0.3;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.71, 0.96), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
      pic.position.z = 0.045; pic.visible = true; g.add(target(pic, 0));
      const sketch = document.createElement('canvas'); sketch.width = 256; sketch.height = 320;
      const sg = sketch.getContext('2d'); sg.fillStyle = '#eee4cf'; sg.fillRect(0,0,256,320);
      const sketchTex = new THREE.CanvasTexture(sketch); sketchTex.colorSpace = THREE.SRGBColorSpace;
      pic.material.map = sketchTex; pic.material.needsUpdate = true;
      let revision = -1, shownPaint = null;
      update = (p, state, local) => {
        if (local?.id !== 'paint' || !local.sketch) return;
        if (local !== shownPaint || local.paintRevision !== revision) { shownPaint=local; revision=local.paintRevision; sg.clearRect(0,0,256,320); sg.drawImage(local.sketch,0,0,256,320); sketchTex.needsUpdate = true; }
      };
      let url = null, finishedTexture = null, working = false;
      const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
      paint = (u, editing) => {
        working = !!editing;
        if (u !== url) {
          url = u; if (finishedTexture) finishedTexture.dispose(); finishedTexture = null;
          if (u) loader.load(u, (t) => {
            if (url !== u) { t.dispose(); return; }
            t.colorSpace = THREE.SRGBColorSpace; finishedTexture = t;
            if (!working) { pic.material.map = t; pic.material.needsUpdate = true; }
          });
        }
        const map = working ? sketchTex : finishedTexture || sketchTex;
        if (pic.material.map !== map) { pic.material.map = map; pic.material.needsUpdate = true; }
      };
    } else if (task.id === 'bathroom') {
      const grime = new THREE.MeshBasicMaterial({ map: grimeTexture(), transparent: true, opacity: .95, depthWrite: false, side: THREE.DoubleSide });
      mirrorGrime = new THREE.Group(); g.add(mirrorGrime);
      const smear = (w, h, x, y, z, floor = false, angle = 0, parent = g) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), grime.clone());
        m.position.set(x, y, z);
        m.rotation.set(floor ? -Math.PI / 2 : 0, 0, angle);
        m.renderOrder = 2;
        parent.add(m); target(m, parts.length); parts.push(m);
      };
      // A few streaks on the left mirror, in front of the live reflection.
      smear(.31, .45, -1.09, .96, -.325, false, -.16, mirrorGrime);
      smear(.22, .38, -.61, 1.12, -.325, false, .13, mirrorGrime);
      smear(.26, .24, -.86, .58, -.325, false, .35, mirrorGrime);
      // The rest sits directly on the actual vanity and basin surfaces.
      smear(.27, .21, -.55, .006, .05, true, -.2);
      smear(.24, .18, .16, .006, -.05, true, .25);
      smear(.22, .17, .78, .006, .08, true, -.4);
      update = (p, state, local) => { g.visible = !!state?.active && p < 1; parts.forEach((m, i) => { m.visible = !(local?.id === 'bathroom' ? local.cleared?.includes(i) : i < Math.floor(p * 6)); m.material.opacity = .95 * (local?.id === 'bathroom' ? 1-Math.min(1,(local.scrubbed?.[i]||0)/85) : 1); }); };
    } else if (task.id === 'defrag') {
      g.rotation.y = 0;
      const beige = mat(0xd8cfb4), dark = mat(0x2b2b2b);
      box(g, .44, .38, .4, beige, 0, .2, .05); box(g, .3, .05, .26, beige, 0, .025, .05);
      box(g, .2, .46, .44, beige, .62, .23, .05); box(g, .5, .03, .17, dark, 0, .015, .34);
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 96; const cg = cv.getContext('2d');
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(.34, .26), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); screen.position.set(0, .22, .252); g.add(target(screen, 0));
      let last = '';
      update = (p, state, local) => {
        const key = String(p) + ':' + (local?.id === 'defrag' ? local.cleared?.join(',') + ':' + (local.runAt ? Math.floor((performance.now()-local.runAt)/100) : '') : '');
        if (key === last) return; last = key;
        cg.fillStyle = '#0000a8'; cg.fillRect(0, 0, 128, 96);
        const red = Array.from({length:60},(_,i)=>i).filter(i=>(i*7)%5===0);
        const repaired = local?.id === 'defrag' ? local.cleared : red.slice(0,Math.round(p*12));
        const run = local?.id === 'defrag' && local.runAt ? Math.min(1,(performance.now()-local.runAt)/3200) : p>=1 ? 1 : 0;
        for (let i = 0; i < 60; i++) { cg.fillStyle = red.includes(i) && !repaired?.includes(i) ? '#ff5555' : i/60<run ? '#55ffff' : repaired?.includes(i) ? '#55ff55' : '#aaaaaa'; cg.fillRect(8 + (i % 12) * 9.5, 10 + Math.floor(i / 12) * 11, 8, 9); }
        cg.fillStyle = '#000060'; cg.fillRect(8, 74, 112, 10); cg.fillStyle = '#55ffff'; cg.fillRect(8, 74, 112 * p, 10);
        tex.needsUpdate = true;
      };
    } else {
      const crank = new THREE.Group(); g.add(crank);
      if (task.id === 'clock') {
        g.rotation.y = Math.PI / 2;
        const face = new THREE.Mesh(new THREE.CircleGeometry(.27, 32), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, side: THREE.DoubleSide })); face.position.z = .025; g.add(target(face, 0));
        const marker = new THREE.Mesh(new THREE.SphereGeometry(.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0x59a86e })); marker.position.set(.19,0,.047); g.add(marker);
        const hand = box(crank, .19, .018, .015, brass, .09,0,.045);
        update = (p,state,local) => { crank.rotation.z = local?.id === 'clock' ? local.angle : state?.angle ?? p * Math.PI * 2; };
      } else {
        target(box(crank, .18, .028, .028, brass), 0); target(box(crank, .03, .085, .035, brass, .075, .03), 0);
        update = (p,state,local) => { crank.rotation.z = (local?.id === 'music' ? local.turns : p * 5) * Math.PI * 2; };
      }
      if (task.id === 'music') crank.position.set(.25, -.16, 0);
    }
    update(0); stations.set(task.id, update); if (paint) painter = paint;
  }
  const poolAim = new THREE.Group(); root.add(poolAim);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(.007,.007,1,8),new THREE.MeshBasicMaterial({color:0xe8dba6,transparent:true,opacity:.65,depthTest:false})); poolAim.add(line);
  const cue = new THREE.Mesh(new THREE.CylinderGeometry(.012,.02,1.2,10),mat(0xb68a55)); poolAim.add(cue);
  const ray = new THREE.Raycaster();
  return { root, mirrorGrime, local: null,
    hit(id, cam, x, y, rect) {
      const meshes = targets.get(id) || [];
      if (!meshes.length) return null;
      ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -((y - rect.top) / rect.height * 2 - 1)), cam);
      const found = ray.intersectObjects(meshes, true)[0];
      return found ? { index: found.object.userData.taskIndex ?? found.object.parent?.userData.taskIndex ?? 0, uv: found.uv, point: found.point } : null;
    },
    update(scene = {}, painting = null) {
      const work=this.local;
      for (const [id, update] of stations) update(scene[id]?.progress || 0, scene[id], this.local);
      painter?.(painting, work?.id === 'paint');
      poolAim.visible=work?.id==='pool' && !work.moving;
      if (poolAim.visible) {
        const bx=work.ball?.[0]??POOL.x,bz=work.ball?.[1]??POOL.z,dx=Math.cos(work.angle),dz=Math.sin(work.angle);
        line.position.set(bx+dx*.55,POOL.y+.04,bz+dz*.55);
        line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx,0,dz));
        cue.position.set(bx-dx*(.68+work.power*.15),POOL.y+.12,bz-dz*(.68+work.power*.15));
        cue.quaternion.copy(line.quaternion);
      }
    }
  };
}

export function skullBallTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const g = canvas.getContext('2d'); g.fillStyle = '#e6dfc8'; g.fillRect(0, 0, 256, 128);
  // Two painted skulls stay legible as the ball turns.
  for (const x of [64, 192]) {
    g.fillStyle = '#22251d'; g.beginPath(); g.ellipse(x - 13, 56, 9, 12, -.25, 0, Math.PI * 2); g.ellipse(x + 13, 56, 9, 12, .25, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x, 66); g.lineTo(x - 5, 78); g.lineTo(x + 5, 78); g.fill();
    for (let i = -2; i <= 2; i++) g.fillRect(x + i * 7 - 2, 84, 4, 11);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
