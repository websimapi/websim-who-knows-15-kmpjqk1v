// Among Us style mini-games for daily tasks. The panel is local to one
// player; finishing sends `taskDone` and the host checks the player is
// still at the station with the right tool.
import { TASK_BY_ID } from './tasks.js';
import { SUSPECT_BY_ID } from './data.js';
import { sfx } from './audio.js';

const W = 640, H = 360, TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = (l) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const shuffled = (n) => { let a; do a = shuffle([...Array(n).keys()]); while (a.every((v, i) => v === i)); return a; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function text(g, s, x, y, size = 18, color = '#efe3c4', align = 'center', font = 'Georgia, serif') {
  g.font = `${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
}

// ---------- lettuce: swipe down through each dotted line ----------
function lettuce() {
  const lines = [...Array(6)].map((_, i) => ({ x: 320 + (i - 2.5) * 46, cut: 0 }));
  let stroke = null, sel = 0;
  const cut = (l) => { if (l.cut) return; l.cut = 1; sfx('chop'); };
  return {
    caption: 'Swipe down through each dotted line',
    get done() { return lines.every(l => l.cut); },
    status: () => `${lines.filter(l => l.cut).length} / 6 cuts`,
    down(x, y) { stroke = { x0: x, sx: x, n: 1, y0: y, y1: y }; },
    move(x, y) { if (!stroke) return; stroke.sx += x; stroke.n++; stroke.y0 = Math.min(stroke.y0, y); stroke.y1 = Math.max(stroke.y1, y); },
    up() {
      if (!stroke) return;
      const mx = stroke.sx / stroke.n;
      if (stroke.y1 - stroke.y0 > 140) { const l = lines.filter(l => !l.cut).sort((a, b) => Math.abs(a.x - mx) - Math.abs(b.x - mx))[0]; if (l && Math.abs(l.x - mx) < 26) cut(l); }
      stroke = null;
    },
    key(inp) {
      if (inp.left) sel = (sel + 5) % 6; if (inp.right) sel = (sel + 1) % 6;
      if (inp.confirm) cut(lines[sel]);
      return true;
    },
    draw(g) {
      g.fillStyle = '#7b5634'; g.fillRect(70, 40, 500, 290); g.fillStyle = '#8d6640'; for (let i = 0; i < 9; i++) g.fillRect(70, 48 + i * 32, 500, 3);
      g.save(); g.beginPath(); g.ellipse(320, 185, 170, 118, 0, 0, TAU); g.clip();
      g.fillStyle = '#86c24a'; g.fillRect(140, 60, 360, 260);
      g.strokeStyle = '#c9e690'; g.lineWidth = 3;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(320, 185, 160 - i * 17, 110 - i * 12, 0, 0, TAU); g.stroke(); }
      g.fillStyle = '#5f9a2c'; for (let i = 0; i < 40; i++) { const a = i * 2.4, r = 30 + (i * 37) % 120; g.beginPath(); g.arc(320 + Math.cos(a) * r, 185 + Math.sin(a) * r * .7, 6, 0, TAU); g.fill(); }
      g.restore();
      lines.forEach((l, i) => {
        if (l.cut) { g.fillStyle = '#5d3f24'; g.fillRect(l.x - 4, 60, 8, 250); }
        else { g.setLineDash([8, 8]); g.strokeStyle = sel === i ? '#ffffff' : '#fff8d0aa'; g.lineWidth = 3; g.beginPath(); g.moveTo(l.x, 62); g.lineTo(l.x, 308); g.stroke(); g.setLineDash([]); }
      });
    },
  };
}

// ---------- darts: three throws, 60 or more ----------
function darts() {
  const C = { x: 320, y: 180 }, R = 150;
  let darts = [], t0 = performance.now(), resetAt = 0, won = false;
  const aim = () => { const t = (performance.now() - t0) / 1000; return { x: C.x + Math.sin(t * 1.7) * 95 + Math.sin(t * 3.3) * 38, y: C.y + Math.cos(t * 1.3) * 75 + Math.sin(t * 2.6) * 32 }; };
  const score = (p) => { const r = Math.hypot(p.x - C.x, p.y - C.y); return r < 12 ? 50 : r < 30 ? 25 : r < 70 ? 20 : r < 112 ? 10 : r < R ? 5 : 0; };
  const total = () => darts.reduce((s, d) => s + d.s, 0);
  const thrw = () => {
    if (darts.length >= 3 || won) return;
    const p = aim(); darts.push({ ...p, s: score(p) }); sfx('dart');
    if (darts.length === 3) { if (total() >= 60) won = true; else resetAt = performance.now() + 1400; }
  };
  return {
    caption: 'Click to throw · 3 darts · score 60',
    get done() { return won; },
    get score() { return total(); },
    status: () => `Score ${total()}${darts.length === 3 && !won ? ' — not enough, try again' : ''}`,
    down: thrw, key(inp) { if (inp.confirm) thrw(); return true; },
    draw(g) {
      if (resetAt && performance.now() > resetAt) { darts = []; resetAt = 0; }
      g.fillStyle = '#3a2a1f'; g.fillRect(0, 0, W, H);
      const rings = [[R + 14, '#1a1a1a'], [R, '#d9c9a0'], [112, '#2e7d4f'], [70, '#c7372f'], [30, '#2e7d4f'], [12, '#c7372f']];
      for (const [r, c] of rings) { g.beginPath(); g.arc(C.x, C.y, r, 0, TAU); g.fillStyle = c; g.fill(); }
      g.strokeStyle = '#00000055'; g.lineWidth = 1.5;
      for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; g.beginPath(); g.moveTo(C.x + Math.cos(a) * 30, C.y + Math.sin(a) * 30); g.lineTo(C.x + Math.cos(a) * R, C.y + Math.sin(a) * R); g.stroke(); }
      for (const d of darts) {
        g.strokeStyle = '#b8b8b8'; g.lineWidth = 3; g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x + 18, d.y - 22); g.stroke();
        g.fillStyle = '#e8c547'; g.beginPath(); g.moveTo(d.x + 14, d.y - 18); g.lineTo(d.x + 30, d.y - 26); g.lineTo(d.x + 22, d.y - 34); g.fill();
        text(g, String(d.s), d.x - 14, d.y + 12, 14, '#fff');
      }
      if (darts.length < 3 && !won) { const a = aim(); g.strokeStyle = '#ffffffdd'; g.lineWidth = 2; g.beginPath(); g.arc(a.x, a.y, 14, 0, TAU); g.moveTo(a.x - 22, a.y); g.lineTo(a.x + 22, a.y); g.moveTo(a.x, a.y - 22); g.lineTo(a.x, a.y + 22); g.stroke(); }
      for (let i = 0; i < 3; i++) text(g, i < darts.length ? '·' : '➶', 560 + i * 22, 40, 22, '#e8c547');
      text(g, String(total()), 80, 40, 30, total() >= 60 ? '#9be37a' : '#efe3c4');
    },
  };
}

// ---------- paint: brush a sketch, the AI finishes it ----------
const SUBJECTS = ['A storm over the moors', 'The mansion at midnight', 'A raven on a skull', 'A vase of black roses', 'The lake at dawn', 'A portrait of a masked stranger'];
function paint(panel) {
  const rect = { x: 200, y: 22, w: 240, h: 316 }, COLS = 12, ROWS = 16;
  const sketch = document.createElement('canvas'); sketch.width = rect.w; sketch.height = rect.h;
  const sg = sketch.getContext('2d'); sg.fillStyle = '#f2ead6'; sg.fillRect(0, 0, rect.w, rect.h);
  const covered = new Set(), palette = ['#2b3a67', '#a3302b', '#d9a441', '#3e7a46', '#1d1a19', '#e8dfcc'];
  let color = palette[0], last = null, phase = 'name', subject = '', img = null, reveal = 0, url = null, failed = false, finished = false, startedAt = 0;
  const cover = () => covered.size / (COLS * ROWS);
  const choose = (s) => { subject = s.trim() || SUBJECTS[0]; phase = 'brush'; panel.hideExtra(); };
  panel.extra(`<form class="tp-paint"><input maxlength="60" placeholder="What will you paint?" aria-label="Subject"><button>Paint</button></form><div class="tp-chips">${shuffle(SUBJECTS).slice(0, 3).map(s => `<button type="button">${s}</button>`).join('')}</div>`, (el) => {
    const input = el.querySelector('input');
    el.querySelector('form').onsubmit = (e) => { e.preventDefault(); choose(input.value); };
    el.querySelectorAll('.tp-chips button').forEach(b => b.onclick = () => choose(b.textContent));
    setTimeout(() => input.focus(), 50);
  });
  const generate = async () => {
    phase = 'gen'; startedAt = performance.now();
    const who = SUSPECT_BY_ID[panel.me]?.name || 'a guest';
    try {
      const res = await window.websim.imageGen({
        prompt: `An oil painting on canvas of ${subject}. Painted by ${who}, a guest in a gloomy 1920s mansion. Rich visible brushwork, moody gothic palette, follow the colours and composition of the rough sketch.`,
        width: 768, height: 1024, image_inputs: [{ url: sketch.toDataURL('image/jpeg', 0.8) }],
      });
      url = res?.url || null;
      if (!url) throw new Error('no image');
      img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { phase = 'reveal'; }; img.onerror = () => { failed = true; phase = 'reveal'; }; img.src = url;
    } catch { failed = true; url = null; phase = 'reveal'; }
  };
  const dab = (x, y) => {
    if (phase !== 'brush') return;
    const lx = x - rect.x, ly = y - rect.y;
    if (lx < 0 || ly < 0 || lx > rect.w || ly > rect.h) { last = null; return; }
    sg.strokeStyle = color; sg.lineWidth = 22; sg.lineCap = 'round'; sg.globalAlpha = 0.85;
    sg.beginPath(); sg.moveTo(last ? last.x : lx, last ? last.y : ly); sg.lineTo(lx, ly); sg.stroke(); sg.globalAlpha = 1;
    last = { x: lx, y: ly };
    for (const [dx, dy] of [[0, 0], [-9, 0], [9, 0], [0, -9], [0, 9]]) covered.add(`${Math.floor((lx + dx) / rect.w * COLS)},${Math.floor((ly + dy) / rect.h * ROWS)}`);
    if (cover() >= 0.55) generate();
  };
  const pickColor = (x, y) => { palette.forEach((c, i) => { if (Math.hypot(x - 110, y - (60 + i * 46)) < 18) color = c; }); };
  return {
    hold: true, nameField: () => phase === 'name',
    get caption() { return phase === 'name' ? 'Choose what to paint' : phase === 'brush' ? 'Brush colour across the whole canvas' : phase === 'gen' ? 'The paint begins to move on its own…' : 'Finished'; },
    get done() { return finished; },
    get url() { return url; }, get title() { return subject; },
    status: () => phase === 'brush' ? `${Math.min(100, Math.round(cover() / 0.55 * 100))}% painted` : phase === 'gen' ? `${Math.min(99, Math.round((performance.now() - startedAt) / 110))}%` : subject,
    down(x, y) { pickColor(x, y); last = null; dab(x, y); },
    move(x, y, held) { if (held) dab(x, y); },
    up() { last = null; },
    draw(g) {
      g.fillStyle = '#2c241d'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#5c4430'; g.fillRect(rect.x - 10, rect.y - 8, rect.w + 20, rect.h + 16);
      g.drawImage(sketch, rect.x, rect.y);
      if (phase === 'gen') { const t = performance.now() / 300; g.fillStyle = `rgba(30,20,10,${0.25 + Math.sin(t) * 0.1})`; g.fillRect(rect.x, rect.y, rect.w, rect.h); text(g, '✦', rect.x + rect.w / 2 + Math.sin(t) * 60, rect.y + rect.h / 2 + Math.cos(t * 1.3) * 90, 30, '#ffe7a8'); }
      if (phase === 'reveal') {
        reveal = Math.min(1, reveal + 0.02);
        if (img && !failed) { g.globalAlpha = reveal; g.drawImage(img, rect.x, rect.y, rect.w, rect.h); g.globalAlpha = 1; }
        if (reveal >= 1 && !finished) finished = true;
      }
      if (phase === 'brush') palette.forEach((c, i) => { g.beginPath(); g.arc(110, 60 + i * 46, 16, 0, TAU); g.fillStyle = c; g.fill(); if (c === color) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); } });
      if (subject) text(g, `“${subject}”`, 540, 180, 16, '#e9d9b0');
    },
  };
}

// ---------- bathroom: scrub the grime away ----------
function bathroom() {
  const spots = [
    ...[...Array(3)].map(() => ({ x: rand(250, 390), y: rand(50, 120), r: rand(22, 32) })),
    ...[...Array(2)].map(() => ({ x: rand(240, 400), y: rand(180, 205), r: rand(22, 30) })),
    ...[...Array(3)].map(() => ({ x: rand(90, 550), y: rand(275, 330), r: rand(28, 40) })),
  ].map(s => ({ ...s, hp: 1, dots: [...Array(7)].map(() => [rand(-.6, .6), rand(-.6, .6), rand(.3, .7)]) }));
  let last = null, cur = null;
  return {
    hold: true, caption: 'Hold and scrub every patch of grime',
    get done() { return spots.every(s => s.hp <= 0); },
    status: () => `${spots.filter(s => s.hp <= 0).length} / ${spots.length} clean`,
    down(x, y) { last = { x, y }; },
    move(x, y, held) {
      cur = { x, y };
      if (!held) { last = null; return; }
      const d = last ? Math.hypot(x - last.x, y - last.y) : 0; last = { x, y };
      for (const s of spots) if (s.hp > 0 && Math.hypot(x - s.x, y - s.y) < s.r + 16) { s.hp -= d / 420; if (s.hp <= 0) { s.hp = 0; sfx('card'); } else if (Math.random() < d / 200) sfx('scrub', .35); }
    },
    up() { last = null; },
    draw(g) {
      g.fillStyle = '#cfd8d3'; g.fillRect(0, 0, W, 250);
      g.strokeStyle = '#b4c0ba'; g.lineWidth = 1; for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 250); g.stroke(); } for (let y = 0; y < 250; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.fillStyle = '#8a6d3b'; g.fillRect(222, 26, 196, 122); g.fillStyle = '#a9c4cc'; g.fillRect(230, 34, 180, 106);
      g.fillStyle = '#ffffff55'; g.beginPath(); g.moveTo(250, 34); g.lineTo(290, 34); g.lineTo(240, 120); g.lineTo(230, 120); g.fill();
      g.fillStyle = '#efefe9'; g.fillRect(200, 165, 240, 60); g.fillStyle = '#d9dcd6'; g.beginPath(); g.ellipse(320, 192, 90, 20, 0, 0, TAU); g.fill();
      g.fillStyle = '#b8b39a'; g.fillRect(314, 156, 12, 14);
      g.fillStyle = '#e9e4da'; g.fillRect(0, 250, W, 110);
      for (let x = 0; x < W; x += 50) for (let y = 250; y < H; y += 50) if (((x + y) / 50) % 2) { g.fillStyle = '#d3cdbf'; g.fillRect(x, y, 50, 50); }
      for (const s of spots) if (s.hp > 0) for (const [dx, dy, k] of s.dots) { g.beginPath(); g.arc(s.x + dx * s.r, s.y + dy * s.r, s.r * k, 0, TAU); g.fillStyle = `rgba(92,80,40,${0.55 * s.hp})`; g.fill(); }
      if (cur) { g.fillStyle = '#d8d0b8'; g.save(); g.translate(cur.x, cur.y); g.rotate(0.3); g.fillRect(-20, -14, 40, 28); g.strokeStyle = '#a99f84'; g.strokeRect(-20, -14, 40, 28); g.restore(); }
    },
  };
}

// ---------- defrag: pull fragments home, then let it run ----------
function defrag() {
  const COLS = 20, ROWS = 9, S = 26, X0 = 60, Y0 = 52;
  const N = COLS * ROWS, cells = Array(N).fill(0);
  for (let i = 0; i < 70; i++) cells[i] = 1;
  const holes = shuffle([...Array(70).keys()]).slice(0, 12).sort((a, b) => a - b);
  holes.forEach(i => cells[i] = 0);
  shuffle([...Array(N - 80).keys()].map(i => i + 80)).slice(0, 12).forEach(i => cells[i] = 2);
  let runT = 0, finished = false, sel = 0;
  const reds = () => cells.map((v, i) => v === 2 ? i : -1).filter(i => i >= 0);
  const pull = (i) => { if (cells[i] !== 2) return; const h = cells.indexOf(0); cells[i] = 0; cells[h] = 3; sfx('beep', .5); if (!reds().length) runT = performance.now(); };
  const at = (x, y) => { const c = Math.floor((x - X0) / S), r = Math.floor((y - Y0) / S); return c >= 0 && r >= 0 && c < COLS && r < ROWS ? r * COLS + c : -1; };
  return {
    caption: 'Click each red fragment',
    get done() { return finished; },
    status: () => runT ? `Defragmenting… ${Math.min(100, Math.round((performance.now() - runT) / 45))}%` : `${reds().length} fragments left`,
    down(x, y) { const i = at(x, y); if (i >= 0) pull(i); },
    key(inp) { const r = reds(); if (!r.length) return true; if (inp.left || inp.up) sel = (sel + r.length - 1) % r.length; if (inp.right || inp.down) sel = (sel + 1) % r.length; if (inp.confirm) pull(r[sel % r.length]); return true; },
    draw(g) {
      g.fillStyle = '#0000a8'; g.fillRect(0, 0, W, H);
      text(g, 'DISK DEFRAGMENTER  —  DRIVE C:', 320, 24, 16, '#ffff55', 'center', 'monospace');
      const p = runT ? Math.min(1, (performance.now() - runT) / 4500) : 0;
      if (p >= 1) finished = true;
      const r = reds();
      for (let i = 0; i < N; i++) {
        const x = X0 + (i % COLS) * S, y = Y0 + Math.floor(i / COLS) * S, v = cells[i];
        const scan = runT && i < p * 82;
        g.fillStyle = v === 2 ? '#ff5555' : v ? (scan ? '#55ffff' : v === 3 ? '#55ff55' : '#aaaaaa') : '#000060';
        g.fillRect(x + 2, y + 2, S - 4, S - 4);
        if (v === 2 && r[sel % r.length] === i) { g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, S - 2, S - 2); }
      }
      g.fillStyle = '#000060'; g.fillRect(60, 300, 520, 20); g.fillStyle = '#55ffff'; g.fillRect(60, 300, 520 * p, 20);
      text(g, runT ? 'Do not turn off the machine' : 'Fragmented files slow the machine', 320, 340, 14, '#ffffff', 'center', 'monospace');
    },
  };
}

// ---------- clock: drag the minute hand to the time on the card ----------
function clock() {
  const C = { x: 260, y: 180 }, R = 135;
  const target = (Math.floor(rand(1, 12)) * 60 + Math.floor(rand(0, 12)) * 5);
  let total = ((target + 180 + Math.floor(rand(0, 6)) * 60 + 25) % 720), drag = null, finished = false, okAt = 0;
  const fmt = (m) => { const h = Math.floor(((m % 720) + 720) % 720 / 60) || 12; return `${h}:${String(Math.round(((m % 60) + 60) % 60)).padStart(2, '0')}`; };
  const near = () => { const d = (((total - target) % 720) + 720) % 720; return Math.min(d, 720 - d) <= 2; };
  const check = () => { if (near() && !okAt) { okAt = performance.now(); total = target; sfx('card'); } };
  return {
    caption: 'Drag the minute hand to the time on the card',
    get done() { return finished; },
    status: () => `Showing ${fmt(total)}`,
    down(x, y) { drag = Math.atan2(y - C.y, x - C.x); },
    move(x, y, held) {
      if (!held || drag == null || okAt) return;
      const a = Math.atan2(y - C.y, x - C.x); total += wrap(a - drag) / TAU * 60; drag = a;
    },
    up() { drag = null; check(); },
    key(inp) { if (okAt) return true; if (inp.left || inp.down) total -= 5; if (inp.right || inp.up) total += 5; total = Math.round(total / 5) * 5; check(); return true; },
    draw(g) {
      if (okAt && performance.now() - okAt > 700) finished = true;
      g.fillStyle = '#2b1e15'; g.fillRect(0, 0, W, H);
      g.beginPath(); g.arc(C.x, C.y, R + 12, 0, TAU); g.fillStyle = '#7a5530'; g.fill();
      g.beginPath(); g.arc(C.x, C.y, R, 0, TAU); g.fillStyle = '#efe6cf'; g.fill();
      for (let i = 1; i <= 12; i++) { const a = i / 12 * TAU - Math.PI / 2; text(g, ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i - 1], C.x + Math.cos(a) * (R - 22), C.y + Math.sin(a) * (R - 22), 15, '#2b1e15'); }
      const hand = (a, len, w, c) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(C.x, C.y); g.lineTo(C.x + Math.cos(a) * len, C.y + Math.sin(a) * len); g.stroke(); };
      hand(total / 720 * TAU - Math.PI / 2, 70, 7, '#2b1e15');
      hand(total / 60 * TAU - Math.PI / 2, 112, 4, okAt ? '#2e7d4f' : '#5a2a1a');
      g.beginPath(); g.arc(C.x, C.y, 7, 0, TAU); g.fillStyle = '#b79550'; g.fill();
      g.fillStyle = '#e8dcc0'; g.fillRect(450, 120, 140, 120); g.strokeStyle = '#7a5530'; g.lineWidth = 3; g.strokeRect(450, 120, 140, 120);
      text(g, 'Set to', 520, 150, 16, '#5a2a1a'); text(g, fmt(target), 520, 195, 36, '#2b1e15');
    },
  };
}

// ---------- books: swap into height order ----------
function books() {
  const H0 = [118, 140, 160, 182, 204, 226], cols = ['#704334', '#365b47', '#304863', '#8c7441', '#5b3654', '#7d5a2a'];
  let order = shuffled(6), sel = -1, cur = 0;
  const X = (i) => 160 + i * 56;
  const pick = (i) => { if (sel < 0) { sel = i; return; } if (sel !== i) { [order[sel], order[i]] = [order[i], order[sel]]; sfx('card'); } sel = -1; };
  return {
    caption: 'Click two books to swap · shortest to tallest',
    get done() { return order.every((v, i) => v === i); },
    status: () => `${order.filter((v, i) => v === i).length} / 6 in place`,
    down(x) { const i = Math.floor((x - 160) / 56); if (i >= 0 && i < 6) pick(i); },
    key(inp) { if (inp.left) cur = (cur + 5) % 6; if (inp.right) cur = (cur + 1) % 6; if (inp.confirm) pick(cur); return true; },
    draw(g) {
      g.fillStyle = '#3a2618'; g.fillRect(0, 0, W, H); g.fillStyle = '#6b4a2e'; g.fillRect(120, 300, 400, 18); g.fillRect(120, 40, 14, 278); g.fillRect(506, 40, 14, 278);
      order.forEach((b, i) => {
        const h = H0[b], lift = sel === i ? 18 : 0;
        g.fillStyle = cols[b]; g.fillRect(X(i), 300 - h - lift, 50, h);
        g.fillStyle = '#c9a85c'; g.fillRect(X(i) + 6, 300 - h - lift + 14, 38, 4); g.fillRect(X(i) + 6, 300 - lift - 22, 38, 4);
        if (cur === i) { g.strokeStyle = '#fff8'; g.lineWidth = 2; g.strokeRect(X(i) - 2, 300 - h - lift - 2, 54, h + 4); }
      });
    },
  };
}

// ---------- papers: pick up pages in order ----------
function papers() {
  const pages = shuffle([1, 2, 3, 4, 5]).map((n, i) => ({ n, x: 110 + i * 78 + rand(-15, 15), y: rand(110, 250), a: rand(-.5, .5), taken: false }));
  let next = 1, shake = 0, cur = 0;
  const hit = (x, y) => [...pages].reverse().find(p => !p.taken && Math.abs(x - p.x) < 42 && Math.abs(y - p.y) < 54);
  const take = (p) => { if (!p) return; if (p.n === next) { p.taken = true; next++; sfx('card'); } else shake = performance.now(); };
  return {
    caption: 'Pick up the pages in order, 1 to 5',
    get done() { return next > 5; },
    status: () => `Next: page ${Math.min(next, 5)}`,
    down(x, y) { take(hit(x, y)); },
    key(inp) { const left = pages.filter(p => !p.taken); if (!left.length) return true; if (inp.left) cur = (cur + left.length - 1) % left.length; if (inp.right) cur = (cur + 1) % left.length; if (inp.confirm) take(left[cur % left.length]); return true; },
    draw(g) {
      g.fillStyle = '#4a2f1e'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#2d1c11'; for (let y = 10; y < H; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + 6); g.stroke(); }
      const dx = shake && performance.now() - shake < 300 ? Math.sin(performance.now() / 20) * 5 : 0;
      const left = pages.filter(p => !p.taken);
      for (const p of pages) {
        const stacked = p.taken, x = stacked ? 560 : p.x + dx, y = stacked ? 180 - p.n * 3 : p.y;
        g.save(); g.translate(x, y); g.rotate(stacked ? 0.03 * p.n : p.a);
        g.fillStyle = '#ece3cc'; g.fillRect(-40, -52, 80, 104); g.strokeStyle = '#b9ab88'; g.strokeRect(-40, -52, 80, 104);
        g.fillStyle = '#9a8e72'; for (let i = 0; i < 6; i++) g.fillRect(-30, -20 + i * 10, 60, 2);
        text(g, String(p.n), 0, -36, 20, '#3a2a1a');
        if (!stacked && left[cur % Math.max(1, left.length)] === p) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(-42, -54, 84, 108); }
        g.restore();
      }
    },
  };
}

// ---------- gramophone: crank it round ----------
function music() {
  const C = { x: 470, y: 230 }, TURNS = 5;
  let wound = 0, last = null, spin = 0, finishedAt = 0;
  return {
    caption: 'Turn the crank in circles',
    get done() { return finishedAt && performance.now() - finishedAt > 1200; },
    status: () => `${Math.min(100, Math.round(wound / TURNS * 100))}% wound`,
    down(x, y) { last = Math.atan2(y - C.y, x - C.x); },
    move(x, y, held) { if (!held || last == null || finishedAt) return; const a = Math.atan2(y - C.y, x - C.x), d = wrap(a - last); if (d > 0) wound += d / TAU; last = a; if (wound >= TURNS && !finishedAt) { finishedAt = performance.now(); sfx('card'); } },
    up() { last = null; },
    key(inp) { if (finishedAt) return true; if (inp.right || inp.confirm || inp.down) wound += 0.25; if (wound >= TURNS) finishedAt = performance.now(); return true; },
    draw(g) {
      g.fillStyle = '#2a1d15'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#6b4a2e'; g.fillRect(120, 230, 300, 90);
      spin += finishedAt ? 0.12 : 0;
      g.beginPath(); g.ellipse(260, 225, 120, 34, 0, 0, TAU); g.fillStyle = '#111'; g.fill();
      g.strokeStyle = '#333'; for (let r = 30; r < 115; r += 12) { g.beginPath(); g.ellipse(260, 225, r, r * .28, 0, 0, TAU); g.stroke(); }
      g.beginPath(); g.ellipse(260, 225, 22, 7, 0, 0, TAU); g.fillStyle = '#a3302b'; g.fill();
      g.fillStyle = '#b79550'; g.beginPath(); g.moveTo(330, 210); g.quadraticCurveTo(360, 120, 300, 40); g.lineTo(200, 30); g.quadraticCurveTo(280, 120, 318, 214); g.fill();
      const a = wound * TAU;
      g.strokeStyle = '#b79550'; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(420, 270); g.lineTo(C.x, C.y); g.lineTo(C.x + Math.cos(a) * 55, C.y + Math.sin(a) * 55); g.stroke();
      g.beginPath(); g.arc(C.x + Math.cos(a) * 55, C.y + Math.sin(a) * 55, 11, 0, TAU); g.fillStyle = '#3a2618'; g.fill();
      g.setLineDash([4, 8]); g.strokeStyle = '#ffffff44'; g.lineWidth = 2; g.beginPath(); g.arc(C.x, C.y, 55, 0, TAU); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#000a'; g.fillRect(560, 60, 24, 240); g.fillStyle = '#d9a441'; const f = Math.min(1, wound / TURNS); g.fillRect(560, 300 - 240 * f, 24, 240 * f);
      if (finishedAt) for (let i = 0; i < 4; i++) { const t = (performance.now() - finishedAt) / 600 + i * .6; text(g, '♪', 250 + Math.sin(t * 2) * 40 + i * 20, 40 + 60 * (t % 2), 26, '#ffe7a8'); }
    },
  };
}

const GAMES = { lettuce, darts, paint, bathroom, defrag, clock, books, papers, music };

export class TaskPanel {
  constructor(root, send, onReflection = () => {}) {
    this.send = send; this.onReflection = onReflection;
    this.el = document.createElement('div'); this.el.className = 'pool-panel task-panel hidden';
    this.el.innerHTML = `<div class="pool-heading"><b class="tp-title"></b><button class="pool-close" aria-label="Leave task">✕</button></div><div class="tp-stage"><canvas width="${W}" height="${H}"></canvas><div class="tp-extra hidden"></div><div class="tp-done hidden">Done</div></div><div class="pool-caption"><span class="tp-cap"></span> · <b class="tp-status"></b></div>`;
    root.append(this.el);
    this.canvas = this.el.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
    this.el.querySelector('.pool-close').onclick = () => this.close();
    const pt = (e) => { const r = this.canvas.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    this.canvas.onpointerdown = (e) => { if (!this.game) return; this.canvas.setPointerCapture(e.pointerId); this.held = true; const [x, y] = pt(e); this.cur = { x, y }; this.game.down?.(x, y); this.game.move?.(x, y, true); };
    this.canvas.onpointermove = (e) => { if (!this.game) return; const [x, y] = pt(e); this.cur = { x, y }; this.game.move?.(x, y, this.held); };
    this.canvas.onpointerup = this.canvas.onpointercancel = (e) => { if (!this.game) return; this.held = false; const [x, y] = pt(e); this.game.up?.(x, y); };
  }
  extra(html, bind) { const el = this.el.querySelector('.tp-extra'); el.innerHTML = html; el.classList.remove('hidden'); bind?.(el); }
  hideExtra() { const el = this.el.querySelector('.tp-extra'); el.classList.add('hidden'); el.innerHTML = ''; document.activeElement?.blur?.(); }
  open(id, me) {
    const make = GAMES[id]; if (!make) return;
    this.id = id; this.me = me; this.task = TASK_BY_ID[id]; this.sent = false; this.held = false; this.cur = { x: W / 2, y: H / 2 };
    this.hideExtra(); this.el.querySelector('.tp-done').classList.add('hidden');
    this.game = make(this);
    this.el.querySelector('.tp-title').textContent = `${this.task.icon} ${this.task.title}`;
    this.active = true; this.el.classList.remove('hidden');
    this.onReflection('start', this.task);
    const loop = () => { if (!this.active) return; this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  close() {
    if (this.active) this.onReflection(this.sent ? 'complete' : 'abandon', this.task);
    this.active = false; this.game = null; this.el.classList.add('hidden'); this.hideExtra();
  }
  update(snap, row) {
    if (!this.active || !this.task) return;
    if (snap.ph !== 'day' || snap.ot || !row?.[5] || row[16] || row[6] || Math.hypot(row[1] - this.task.x, row[2] - this.task.z) > 3.2) this.close();
  }
  input(inp) {
    if (!this.game) return true;
    if (inp.back) { this.close(); return true; }
    if (this.game.nameField?.() && document.activeElement?.tagName === 'INPUT') return true;
    if (this.game.key) { this.game.key(inp); return true; }
    // Virtual cursor for keyboard and gamepad.
    const c = this.cur, step = 22;
    if (inp.left) c.x -= step; if (inp.right) c.x += step; if (inp.up) c.y -= step; if (inp.down) c.y += step;
    c.x = Math.max(0, Math.min(W, c.x)); c.y = Math.max(0, Math.min(H, c.y));
    if (this.game.hold) { if (inp.confirm) { this.held = !this.held; if (this.held) this.game.down?.(c.x, c.y); else this.game.up?.(c.x, c.y); } this.game.move?.(c.x, c.y, this.held); }
    else if (inp.confirm) { this.game.down?.(c.x, c.y); this.game.up?.(c.x, c.y); }
    return true;
  }
  draw() {
    const g = this.ctx, game = this.game; if (!game) return;
    g.clearRect(0, 0, W, H); game.draw(g);
    if (!game.key && this.cur && !matchMedia('(pointer: fine)').matches) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(this.cur.x, this.cur.y, 8, 0, TAU); g.stroke(); }
    this.el.querySelector('.tp-cap').textContent = game.caption;
    this.el.querySelector('.tp-status').textContent = game.status?.() || '';
    if (game.done && !this.sent) {
      this.sent = true; sfx('done');
      this.el.querySelector('.tp-done').classList.remove('hidden');
      const msg = { type: 'taskDone', id: this.id };
      if (this.id === 'paint') { msg.url = game.url; msg.title = game.title; }
      if (this.id === 'darts') msg.score = game.score;
      setTimeout(() => { this.send(msg); this.close(); }, this.id === 'paint' ? 2200 : 800);
    }
  }
}
