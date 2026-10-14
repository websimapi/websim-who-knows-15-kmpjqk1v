import { POOL } from './layout.js';

// A close view of the same physical ball everyone else sees in the room.
export class PoolPanel {
  constructor(root, send, onReflection = () => {}) {
    this.send = send; this.onReflection = onReflection; this.angle = -Math.PI / 2; this.power = .3;
    this.el = document.createElement('div'); this.el.className = 'pool-panel hidden';
    this.el.innerHTML = `<div class="pool-heading"><b>☠ Skull pool</b><button class="pool-close" aria-label="Leave pool">✕</button></div><canvas width="640" height="360" aria-label="Pool table. Point toward a pocket to aim."></canvas><div class="pool-controls"><button class="pool-left" aria-label="Aim left">↶</button><button class="pool-right" aria-label="Aim right">↷</button><label>Power <input type="range" min="5" max="100" value="30" aria-label="Shot power"></label><button class="pool-shoot">Shoot</button></div><div class="pool-caption">Point to aim · left/right adjust · up/down power · confirm shoots</div>`;
    root.append(this.el); this.canvas = this.el.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
    this.el.querySelector('.pool-close').onclick = () => this.close();
    this.el.querySelector('.pool-shoot').onclick = () => this.shoot();
    this.el.querySelector('.pool-left').onclick = () => { this.angle -= .035; this.draw(); };
    this.el.querySelector('.pool-right').onclick = () => { this.angle += .035; this.draw(); };
    this.slider = this.el.querySelector('input'); this.slider.oninput = () => { this.power = this.slider.valueAsNumber / 100; this.draw(); };
    const aim = e => { if (this.moving) return; const r = this.canvas.getBoundingClientRect(); const x = (e.clientX - r.left) * 640 / r.width, y = (e.clientY - r.top) * 360 / r.height; const ball = this.point(); this.angle = Math.atan2(y - ball.y, x - ball.x); this.draw(); };
    this.canvas.onpointerdown = e => { this.canvas.setPointerCapture(e.pointerId); aim(e); };
    this.canvas.onpointermove = e => { if (e.buttons || e.pointerType === 'mouse') aim(e); };
  }
  open() { this.active = true; this.reflected = false; this.onReflection('start', { id: 'pool', title: 'Pocket the skull ball', room: 'game' }); this.el.classList.remove('hidden'); this.draw(); }
  finishReflection() { if (this.active && !this.reflected) { this.reflected = true; this.onReflection('complete', { id: 'pool', title: 'Pocket the skull ball', room: 'game' }); } }
  close() { if (this.active && !this.reflected) { this.reflected = true; this.onReflection('abandon', { id: 'pool', title: 'Pocket the skull ball', room: 'game' }); } this.active = false; this.el.classList.add('hidden'); }
  update(snap, row) {
    this.ball = snap.pool?.[0] || this.ball; this.moving = !!snap.poolMoving;
    if (snap.poolShots !== this.shots) { this.shots = snap.poolShots; this.pending = 0; }
    if (this.active && (snap.ph !== 'day' || snap.ot || !row?.[5] || row[16] || row[6] || Math.hypot(row[1] - POOL.x, row[2] - POOL.z) > 3.3)) this.close();
    if (this.active) this.draw();
  }
  point() { const b = this.ball && !this.ball[2] ? this.ball : [POOL.x, POOL.z]; return { x: 50 + ((b[0] - POOL.x) / POOL.w + .5) * 540, y: 45 + ((b[1] - POOL.z) / POOL.d + .5) * 270 }; }
  shoot() {
    if (this.moving || performance.now() < (this.pending || 0)) return;
    this.pending = performance.now() + 800;
    this.send({ type: 'pool', dx: Math.cos(this.angle), dz: Math.sin(this.angle), power: this.power });
  }
  input(inp) {
    if (inp.back) { this.close(); return true; }
    if (inp.left) this.angle -= .035;
    if (inp.right) this.angle += .035;
    if (inp.up || inp.down) { this.power = Math.max(.05, Math.min(1, this.power + (inp.up ? .05 : -.05))); this.slider.value = Math.round(this.power * 100); }
    if (inp.confirm) this.shoot();
    return true;
  }
  draw() {
    const g = this.ctx; g.clearRect(0, 0, 640, 360);
    g.fillStyle = '#4c3021'; g.fillRect(25, 20, 590, 320);
    g.fillStyle = '#1f614c'; g.fillRect(50, 45, 540, 270);
    g.strokeStyle = '#bba36c'; g.lineWidth = 3; g.strokeRect(38, 32, 564, 296);
    for (const x of [50, 320, 590]) for (const y of [45, 315]) { g.beginPath(); g.arc(x, y, 20, 0, Math.PI * 2); g.fillStyle = '#101210'; g.fill(); }
    const ball = this.point();
    if (!this.moving) {
      g.setLineDash([6, 7]); g.strokeStyle = '#ecdd9aa0'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ball.x, ball.y); g.lineTo(ball.x + Math.cos(this.angle) * 260, ball.y + Math.sin(this.angle) * 260); g.stroke(); g.setLineDash([]);
      g.strokeStyle = '#cca16d'; g.lineWidth = 5; g.beginPath(); g.moveTo(ball.x - Math.cos(this.angle) * 24, ball.y - Math.sin(this.angle) * 24); g.lineTo(ball.x - Math.cos(this.angle) * (65 + this.power * 45), ball.y - Math.sin(this.angle) * (65 + this.power * 45)); g.stroke();
    }
    g.beginPath(); g.arc(ball.x, ball.y, 14, 0, Math.PI * 2); g.fillStyle = '#ebe4cf'; g.fill();
    g.fillStyle = '#1d2722'; g.font = 'bold 24px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('☠', ball.x, ball.y + 1);
    const button = this.el.querySelector('.pool-shoot'); button.disabled = this.moving || performance.now() < (this.pending || 0); button.textContent = this.moving ? 'Rolling…' : this.ball?.[2] ? 'Play again' : 'Shoot';
  }
}
