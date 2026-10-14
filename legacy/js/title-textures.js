import * as THREE from "three";
import { mulberry32 } from "./rng.js";

// Procedural canvas textures for the title film: a colour map plus a matching
// greyscale bump map, so low-poly surfaces read as bark, mud and wet stone.
function canvasPair(size, draw, seed) {
  const random = mulberry32(seed);
  const color = document.createElement("canvas"), bump = document.createElement("canvas");
  color.width = color.height = bump.width = bump.height = size;
  draw(color.getContext("2d"), bump.getContext("2d"), size, random);
  const map = new THREE.CanvasTexture(color); map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bump);
  for (const t of [map, bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, bumpMap };
}

function speckle(g, size, random, count, tones, min, max) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = tones[Math.floor(random() * tones.length)];
    const r = min + random() * (max - min);
    g.beginPath(); g.ellipse(random() * size, random() * size, r, r * (.5 + random() * .7), random() * 3, 0, Math.PI * 2); g.fill();
  }
}

export function barkTextures() {
  return canvasPair(256, (c, b, size, random) => {
    c.fillStyle = "#4a4b47"; c.fillRect(0, 0, size, size);
    b.fillStyle = "#888"; b.fillRect(0, 0, size, size);
    // deep vertical furrows
    for (let i = 0; i < 90; i++) {
      let x = random() * size; const w = 1 + random() * 4, shade = random();
      c.strokeStyle = shade < .5 ? `rgba(20,22,22,${.4 + random() * .4})` : `rgba(110,112,100,${.15 + random() * .2})`;
      b.strokeStyle = shade < .5 ? "rgba(0,0,0,.7)" : "rgba(255,255,255,.4)";
      c.lineWidth = b.lineWidth = w;
      c.beginPath(); b.beginPath(); c.moveTo(x, 0); b.moveTo(x, 0);
      for (let y = 0; y <= size; y += 16) { x += (random() - .5) * 5; c.lineTo(x, y); b.lineTo(x, y); }
      c.stroke(); b.stroke();
    }
    speckle(c, size, random, 60, ["rgba(62,78,58,.35)", "rgba(80,92,70,.25)"], 3, 16); // lichen
  }, 41);
}

export function mudTextures() {
  return canvasPair(512, (c, b, size, random) => {
    c.fillStyle = "#3a3d3a"; c.fillRect(0, 0, size, size);
    b.fillStyle = "#808080"; b.fillRect(0, 0, size, size);
    speckle(c, size, random, 1600, ["rgba(20,22,22,.18)", "rgba(70,68,60,.14)", "rgba(46,54,44,.16)", "rgba(28,34,38,.2)"], 2, 26);
    speckle(b, size, random, 2400, ["rgba(0,0,0,.18)", "rgba(255,255,255,.14)"], 1, 7);
    for (let i = 0; i < 260; i++) { // pebbles
      const x = random() * size, y = random() * size, r = 1 + random() * 3.5;
      c.fillStyle = `rgba(${90 + random() * 40},${90 + random() * 40},${88 + random() * 30},.5)`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      b.fillStyle = "rgba(255,255,255,.7)"; b.beginPath(); b.arc(x, y, r, 0, Math.PI * 2); b.fill();
    }
    for (let i = 0; i < 40; i++) { // boot ruts and drag marks
      c.strokeStyle = "rgba(15,16,17,.18)"; c.lineWidth = 4 + random() * 10;
      b.strokeStyle = "rgba(0,0,0,.3)"; b.lineWidth = c.lineWidth;
      const x = random() * size, y = random() * size;
      for (const g of [c, b]) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (random() - .5) * 40, y + 60, x + (random() - .5) * 30, y + 120); g.stroke(); }
    }
  }, 77);
}

export function stoneTextures() {
  return canvasPair(256, (c, b, size, random) => {
    c.fillStyle = "#6a6d6b"; c.fillRect(0, 0, size, size);
    b.fillStyle = "#808080"; b.fillRect(0, 0, size, size);
    speckle(c, size, random, 900, ["rgba(30,32,32,.2)", "rgba(140,140,130,.15)", "rgba(90,94,92,.2)"], 1, 9);
    speckle(b, size, random, 1400, ["rgba(0,0,0,.25)", "rgba(255,255,255,.2)"], .5, 4);
    speckle(c, size, random, 70, ["rgba(56,74,48,.45)", "rgba(70,88,54,.35)", "rgba(36,46,34,.5)"], 4, 22); // moss
    for (let i = 0; i < 14; i++) { // cracks
      let x = random() * size, y = random() * size, a = random() * 6.28;
      c.strokeStyle = "rgba(15,15,15,.6)"; b.strokeStyle = "rgba(0,0,0,.9)"; c.lineWidth = b.lineWidth = .8 + random();
      c.beginPath(); b.beginPath(); c.moveTo(x, y); b.moveTo(x, y);
      for (let s = 0; s < 12; s++) { a += (random() - .5) * 1.2; x += Math.cos(a) * 6; y += Math.sin(a) * 6; c.lineTo(x, y); b.lineTo(x, y); }
      c.stroke(); b.stroke();
    }
  }, 19);
}
