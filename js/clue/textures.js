// Canvas-painted textures for floors, the hallway squares, labels and wallpaper.
import * as THREE from "three";

function canvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const noise = (g, w, h, a = 0.06, n = 1600) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * a})` : `rgba(255,255,255,${Math.random() * a * 0.7})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
};
const shade = (hex, f) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
};

export function floorTexture(style, tint) {
  const t = canvas(256, 256, (g, w, h) => {
    if (style === "checker") {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const px = x * 64, py = y * 64, dark = (x + y) % 2;
        const gr = g.createLinearGradient(px, py, px + 64, py + 64);
        gr.addColorStop(0, dark ? "#343139" : "#f6f0e1");
        gr.addColorStop(1, dark ? "#111217" : "#c8c2b6");
        g.fillStyle = gr; g.fillRect(px, py, 64, 64);
        g.save(); g.beginPath(); g.rect(px + 2, py + 2, 60, 60); g.clip();
        for (let i = 0; i < 5; i++) {
          const sx = px - 25 + Math.random() * 90, sy = py + Math.random() * 64;
          g.strokeStyle = dark ? "rgba(132,150,165,.12)" : "rgba(95,105,104,.19)";
          g.lineWidth = 0.5 + Math.random() * 1.3;
          g.beginPath(); g.moveTo(sx, sy); g.bezierCurveTo(sx + 12, sy - 8, sx + 33, sy + 9, sx + 70, sy - 5); g.stroke();
        }
        g.restore();
        g.strokeStyle = "rgba(15,12,11,.68)"; g.lineWidth = 2; g.strokeRect(px + 1, py + 1, 62, 62);
        g.fillStyle = "rgba(255,255,255,.13)"; g.fillRect(px + 3, py + 3, 58, 1);
      }
      noise(g, w, h, 0.055, 2600);
    } else if (style === "parquet") {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        g.fillStyle = shade(tint, 0.82 + Math.random() * 0.3);
        const horiz = (x + y) % 2;
        g.fillRect(x * 32, y * 32, 32, 32);
        g.strokeStyle = "rgba(40,20,5,.45)"; g.lineWidth = 1;
        for (let k = 1; k < 4; k++) { g.beginPath(); if (horiz) { g.moveTo(x * 32, y * 32 + k * 8); g.lineTo(x * 32 + 32, y * 32 + k * 8); } else { g.moveTo(x * 32 + k * 8, y * 32); g.lineTo(x * 32 + k * 8, y * 32 + 32); } g.stroke(); }
      }
      noise(g, w, h, 0.07);
    } else if (style === "plank") {
      for (let y = 0; y < 8; y++) {
        const off = (y * 97) % 256;
        for (let x = -1; x < 3; x++) { g.fillStyle = shade(tint, 0.8 + Math.random() * 0.35); g.fillRect(x * 128 + off % 128, y * 32, 128, 32); g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x * 128 + off % 128, y * 32, 2, 32); }
        g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(0, y * 32, 256, 2);
      }
      for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(30,15,5,${Math.random() * 0.18})`; g.beginPath(); const y = Math.random() * 256; g.moveTo(0, y); g.bezierCurveTo(80, y + 3, 170, y - 3, 256, y + 1); g.stroke(); }
    } else if (style === "stone") {
      g.fillStyle = shade(tint, 0.9); g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = shade(tint, 0.75 + Math.random() * 0.35); g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58); }
      noise(g, w, h, 0.12, 2400);
    } else if (style === "slate") {
      g.fillStyle = "#2a2622"; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = shade("#4a4038", 0.7 + Math.random() * 0.45); g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
      noise(g, w, h, 0.14, 2400);
    } else if (style === "carpet") {
      g.fillStyle = tint; g.fillRect(0, 0, w, h);
      g.strokeStyle = shade(tint, 1.45); g.lineWidth = 3;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const cx = x * 64 + 32, cy = y * 64 + 32;
        g.beginPath(); g.moveTo(cx, cy - 18); g.lineTo(cx + 18, cy); g.lineTo(cx, cy + 18); g.lineTo(cx - 18, cy); g.closePath(); g.stroke();
        g.fillStyle = shade(tint, 1.6); g.fillRect(cx - 3, cy - 3, 6, 6);
      }
      noise(g, w, h, 0.1, 5000);
    } else if (style === "marble") {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? "#cfc6b6" : "#f1ede4"; g.fillRect(x * 128, y * 128, 128, 128); }
      for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(110,100,90,${0.08 + Math.random() * 0.12})`; g.lineWidth = Math.random() * 2; g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.4) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// The classic board's hallway squares: buttery yellow tiles with dark seams.
export function hallwayTexture() {
  const t = canvas(128, 128, (g, w, h) => {
    g.fillStyle = "#2a2015"; g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#e8c76a"); grad.addColorStop(1, "#d6ae4c");
    g.fillStyle = grad; g.fillRect(4, 4, w - 8, h - 8);
    g.strokeStyle = "rgba(255,240,190,.5)"; g.lineWidth = 2; g.strokeRect(8, 8, w - 16, h - 16);
    noise(g, w, h, 0.07, 500);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function wallpaperTexture(base) {
  const t = canvas(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = shade(base, 1.18);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const cx = x * 32 + (y % 2) * 16 + 8, cy = y * 32 + 16;
      g.beginPath(); g.ellipse(cx, cy, 4, 8, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = shade(base, 0.55); g.fillRect(0, h - 70, w, 70);
    g.fillStyle = shade(base, 1.4); g.fillRect(0, h - 74, w, 4);
    noise(g, w, h, 0.05, 400);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function labelTexture(text, { color = "rgba(30,18,10,.55)", font = "700 72px Georgia, serif", w = 1024, h = 160, stroke = null } = {}) {
  return canvas(w, h, (g) => {
    g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 8; g.strokeText(text, w / 2, h / 2); }
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2);
  });
}

export function doorPlaqueTexture(text) {
  return canvas(512, 128, (g, w, h) => {
    const gold = g.createLinearGradient(0, 0, 0, h);
    gold.addColorStop(0, "#f0d99c"); gold.addColorStop(0.5, "#c79d51"); gold.addColorStop(1, "#8d672e");
    g.fillStyle = gold; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#593d1e"; g.lineWidth = 5; g.strokeRect(9, 9, w - 18, h - 18);
    g.strokeStyle = "#ffe6aa"; g.lineWidth = 2; g.strokeRect(17, 17, w - 34, h - 34);
    let size = 62;
    do { g.font = `700 ${size--}px Georgia, serif`; } while (g.measureText(text).width > w - 68 && size > 30);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#332315"; g.fillText(text, w / 2, h / 2 + 3);
  });
}

export function feltTexture() {
  const t = canvas(256, 128, (g, w, h) => { g.fillStyle = "#1d6b3c"; g.fillRect(0, 0, w, h); noise(g, w, h, 0.1, 3000); });
  return t;
}

export function booksTexture() {
  const t = canvas(256, 256, (g, w, h) => {
    g.fillStyle = "#2a1a10"; g.fillRect(0, 0, w, h);
    const cols = ["#7b2026", "#2c4a6e", "#3d5e2f", "#8a6a2a", "#4b2b52", "#222", "#6e4a2c"];
    for (let shelf = 0; shelf < 4; shelf++) {
      let x = 4;
      while (x < w - 6) {
        const bw = 6 + Math.random() * 10, bh = 40 + Math.random() * 18;
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.fillRect(x, shelf * 64 + 62 - bh, bw, bh);
        g.fillStyle = "rgba(255,220,150,.35)"; g.fillRect(x + 1, shelf * 64 + 62 - bh + 6, bw - 2, 2);
        x += bw + 1;
      }
      g.fillStyle = "#4a2f1c"; g.fillRect(0, shelf * 64 + 60, w, 4);
    }
  });
  return t;
}

// ---------- realistic surfaces ----------
const cache = new Map();
const memo = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };

// Wall coverings. Texture spans 1.6 m wide × full storey height (v 0..1).
export function wallTexture(style, base) {
  return memo(`wall|${style}|${base}`, () => {
    const t = canvas(256, 576, (g, w, h) => {
      const dado = h * (1 - 0.95 / 3.6); // top of the wainscot (y = 0.95 m)
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      if (style === "damask") {
        g.fillStyle = shade(base, 1.22);
        for (let y = 0; y < 9; y++) for (let x = 0; x < 3; x++) {
          const cx = x * 96 + (y % 2) * 48, cy = y * 56 + 20;
          g.beginPath(); g.moveTo(cx, cy - 18); g.bezierCurveTo(cx + 18, cy - 10, cx + 14, cy + 10, cx, cy + 20); g.bezierCurveTo(cx - 14, cy + 10, cx - 18, cy - 10, cx, cy - 18); g.fill();
          g.fillRect(cx - 1, cy - 26, 2, 52);
        }
      } else if (style === "stripe") {
        for (let x = 0; x < w; x += 32) { g.fillStyle = shade(base, 1.15); g.fillRect(x, 0, 12, dado); g.fillStyle = shade(base, 0.9); g.fillRect(x + 14, 0, 2, dado); }
      } else if (style === "panel") {
        g.fillStyle = shade(base, 0.85);
        for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
          const px = x * 128 + 14, py = y * (dado / 2) + 18, pw = 100, ph = dado / 2 - 36;
          g.fillRect(px, py, pw, ph);
          g.strokeStyle = shade(base, 1.35); g.lineWidth = 3; g.strokeRect(px + 2, py + 2, pw - 4, ph - 4);
          g.strokeStyle = shade(base, 0.55); g.lineWidth = 2; g.strokeRect(px - 2, py - 2, pw + 4, ph + 4);
        }
      } else if (style === "tile") {
        for (let y = 0; y < dado; y += 18) for (let x = (y / 18) % 2 ? -18 : 0; x < w; x += 36) {
          g.fillStyle = shade(base, 0.93 + Math.random() * 0.1); g.fillRect(x + 1, y + 1, 34, 16);
        }
      } else if (style === "brick") {
        for (let y = 0; y < h; y += 24) for (let x = (y / 24) % 2 ? -32 : 0; x < w; x += 64) {
          g.fillStyle = shade(base, 0.75 + Math.random() * 0.45); g.fillRect(x + 2, y + 2, 60, 20);
        }
      }
      // Age: water stains and grime towards the top and bottom.
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "rgba(0,0,0,.35)"); gr.addColorStop(0.15, "rgba(0,0,0,0)"); gr.addColorStop(0.8, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.3)");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(40,30,15,${Math.random() * 0.1})`; const x = Math.random() * w; g.fillRect(x, 0, 4 + Math.random() * 14, Math.random() * dado * 0.6); }
      noise(g, w, h, 0.06, 2500);
      if (style !== "brick") {
        // Wainscot + chair rail + skirting.
        g.fillStyle = "#2c1a0f"; g.fillRect(0, dado, w, h - dado);
        for (let x = 0; x < w; x += 128) { g.fillStyle = "#3a2414"; g.fillRect(x + 10, dado + 16, 108, h - dado - 46); g.strokeStyle = "rgba(255,210,150,.12)"; g.lineWidth = 2; g.strokeRect(x + 12, dado + 18, 104, h - dado - 50); }
        g.fillStyle = "#4b2f1a"; g.fillRect(0, dado - 6, w, 10);
        g.fillStyle = "rgba(255,220,170,.25)"; g.fillRect(0, dado - 6, w, 2);
        g.fillStyle = "#1b0f08"; g.fillRect(0, h - 22, w, 22);
        // Crown moulding.
        g.fillStyle = "#d9cdb4"; g.fillRect(0, 0, w, 10); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 10, w, 3);
        noise(g, w, h, 0.04, 800);
      }
    });
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}

export function plasterTexture() {
  return memo("plaster", () => {
    const t = canvas(256, 256, (g, w, h) => {
      g.fillStyle = "#b9b0a0"; g.fillRect(0, 0, w, h);
      noise(g, w, h, 0.08, 6000);
      for (let i = 0; i < 6; i++) { g.strokeStyle = `rgba(60,50,40,${0.05 + Math.random() * 0.08})`; g.lineWidth = 1; g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
      for (let i = 0; i < 4; i++) { const r = g.createRadialGradient(Math.random() * w, Math.random() * h, 0, Math.random() * w, Math.random() * h, 60); r.addColorStop(0, "rgba(90,70,40,.12)"); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, w, h); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

export function stoneWallTexture() {
  return memo("stonewall", () => {
    const t = canvas(512, 512, (g, w, h) => {
      g.fillStyle = "#2a2826"; g.fillRect(0, 0, w, h);
      let y = 0;
      while (y < h) {
        const bh = 34 + Math.random() * 20;
        let x = -Math.random() * 60;
        while (x < w) { const bw = 60 + Math.random() * 70; g.fillStyle = shade("#6d675f", 0.55 + Math.random() * 0.45); g.fillRect(x + 3, y + 3, bw - 6, bh - 6); x += bw; }
        y += bh;
      }
      noise(g, w, h, 0.18, 9000);
      for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(40,60,30,${Math.random() * 0.25})`; g.beginPath(); g.ellipse(Math.random() * w, h - Math.random() * 120, 10 + Math.random() * 40, 6 + Math.random() * 20, 0, 0, 7); g.fill(); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

export function woodTexture(tint = "#5b3820") {
  return memo(`wood|${tint}`, () => {
    const t = canvas(512, 512, (g, w, h) => {
      g.fillStyle = tint; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 200; i++) { g.strokeStyle = `rgba(${Math.random() < 0.5 ? "20,10,4" : "255,220,170"},${Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 18, w * 0.7, y + (Math.random() - 0.5) * 18, w, y); g.stroke(); }
      noise(g, w, h, 0.05, 4500);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

export function fabricTexture(tint = "#5a1520") {
  return memo(`fabric|${tint}`, () => {
    const t = canvas(256, 256, (g, w, h) => {
      g.fillStyle = tint; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) {
        g.strokeStyle = "rgba(255,206,174,.035)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 20); g.stroke();
      }
      for (let x = 0; x < w; x += 4) {
        g.strokeStyle = "rgba(8,0,5,.11)"; g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 20, h); g.stroke();
      }
      for (let y = 32; y < h; y += 64) for (let x = 32; x < w; x += 64) {
        g.strokeStyle = "rgba(230,152,112,.095)"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, y - 20); g.bezierCurveTo(x + 16, y - 5, x + 16, y + 5, x, y + 20); g.bezierCurveTo(x - 16, y + 5, x - 16, y - 5, x, y - 20); g.stroke();
        g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fillStyle = "rgba(20,2,6,.16)"; g.fill();
      }
      noise(g, w, h, 0.09, 5000);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

export function herringboneTexture(tint = "#5e3d24") {
  return memo(`herring|${tint}`, () => {
    const t = canvas(256, 256, (g, w, h) => {
      g.fillStyle = "#1a0f08"; g.fillRect(0, 0, w, h);
      g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.translate(-w, -h);
      for (let y = 0; y < h * 2; y += 32) for (let x = 0; x < w * 2; x += 32) {
        g.fillStyle = shade(tint, 0.75 + Math.random() * 0.4);
        if (((x + y) / 32) % 2) g.fillRect(x + 1, y + 1, 62, 14); else g.fillRect(x + 1, y + 1, 14, 62);
      }
      g.restore();
      noise(g, w, h, 0.08, 3000);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

export function runnerTexture() {
  return memo("runner", () => {
    const t = canvas(128, 256, (g, w, h) => {
      g.fillStyle = "#4a1018"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#c79a4a"; g.fillRect(6, 0, 4, h); g.fillRect(w - 10, 0, 4, h);
      g.strokeStyle = "#2a3a5a"; g.lineWidth = 3;
      for (let y = 16; y < h; y += 64) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w - 24, y + 32); g.lineTo(w / 2, y + 64); g.lineTo(24, y + 32); g.closePath(); g.stroke(); }
      noise(g, w, h, 0.12, 3000);
    });
    t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

export function glowTexture() {
  return memo("glow", () => canvas(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }));
}

export function windowRainTexture() {
  return memo("window-rain", () => canvas(256, 512, (g, w, h) => {
    g.fillStyle = "rgba(130,168,205,.28)"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * w, y = Math.random() * h, length = 8 + Math.random() * 72;
      g.strokeStyle = `rgba(207,226,246,${0.12 + Math.random() * 0.34})`;
      g.lineWidth = 0.4 + Math.random() * 1.1;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x - 1, y + length * 0.4, x + 2, y + length * 0.7, x, y + length); g.stroke();
      g.fillStyle = `rgba(230,240,255,${0.15 + Math.random() * 0.35})`;
      g.beginPath(); g.ellipse(x, y + length, 1 + Math.random() * 1.4, 2 + Math.random() * 2.5, 0, 0, Math.PI * 2); g.fill();
    }
    const edge = g.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, "rgba(3,10,22,.5)"); edge.addColorStop(0.18, "rgba(3,10,22,0)"); edge.addColorStop(0.82, "rgba(3,10,22,0)"); edge.addColorStop(1, "rgba(3,10,22,.5)");
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
  }));
}

export function flameTexture() {
  return memo("flame", () => canvas(64, 128, (g, w, h) => {
    const r = g.createRadialGradient(32, 96, 2, 32, 80, 60);
    r.addColorStop(0, "rgba(255,250,210,1)"); r.addColorStop(0.25, "rgba(255,180,60,.95)"); r.addColorStop(0.6, "rgba(220,70,10,.5)"); r.addColorStop(1, "rgba(120,20,0,0)");
    g.fillStyle = r;
    g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(60, 50, 60, 120, 32, 124); g.bezierCurveTo(4, 120, 4, 50, 32, 4); g.fill();
  }));
}

export function paintingTexture(seed = 0) {
  return memo(`paint|${seed}`, () => canvas(128, 160, (g, w, h) => {
    const pal = [["#2b2a20", "#6a5a3a", "#c9b07a"], ["#1d2228", "#3d4a52", "#a0957a"], ["#2a1a14", "#5a2a20", "#d0a070"], ["#14181a", "#2e3a30", "#8a8a6a"]][seed % 4];
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, pal[1]); gr.addColorStop(1, pal[0]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (seed % 2 === 0) { // portrait
      g.fillStyle = pal[0]; g.beginPath(); g.ellipse(64, 150, 46, 50, 0, 0, 7); g.fill();
      g.fillStyle = pal[2]; g.beginPath(); g.ellipse(64, 70, 22, 28, 0, 0, 7); g.fill();
      g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(52, 64, 7, 4); g.fillRect(69, 64, 7, 4);
    } else { // landscape
      g.fillStyle = pal[2]; g.beginPath(); g.arc(90, 50, 14, 0, 7); g.fill();
      g.fillStyle = pal[0]; g.beginPath(); g.moveTo(0, 120); for (let x = 0; x <= w; x += 16) g.lineTo(x, 100 + Math.sin(x * 0.07 + seed) * 14); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    }
    noise(g, w, h, 0.15, 2500);
    g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 10; g.strokeRect(0, 0, w, h);
  }));
}
