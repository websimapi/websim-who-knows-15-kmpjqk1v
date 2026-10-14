// Daily work belongs to the match, including AI guests and remote players.
// Humans finish a task by playing its mini-game (task-ui.js) and sending
// `taskDone`; AI guests step through it with `workTask`.
import { local, POOL, surfaceAt, ROOM_BOUNDS } from './layout.js';
import { roomAtWorld } from './data.js';
import { losClear, randomPointIn } from './nav.js';
import { bumpTrust } from './ai.js';
import { spawnLooseItem } from './items.js';

const station = (id, icon, title, room, x, z, y, steps, verb, extra = {}) => ({ id, icon, title, room, ...local(room, x, z), y, steps, verb, stand: [0, 1.05], ...extra });
export const TASKS = [
  { id: 'grime', icon: '✧', title: 'Clean a dirt stain', room: null, steps: 1, verb: 'Clean the dirt stain', how: 'Find the dirt on the floor. Pour bleach over it, then wipe the wet patch with a rag.' },
  { id: 'pool', icon: '☠', title: 'Pocket the skull ball', room: 'game', ...POOL, steps: 1, verb: 'Play skull pool', stand: [0, 1.25],
    how: 'Line up the cue and sink the skull ball in any pocket.' },
  station('lettuce', '🥬', 'Chop the lettuce', 'kitchen', 7.5, 6.9, 1.0, 6, 'Chop the lettuce', { tool: 'kitchen_knife',
    how: 'Hold the Kitchen Knife and cut the lettuce directly on the kitchen island.' }),
  station('darts', '◎', 'Score 60 at darts', 'game', 0.3, 7.0, 1.9, 3, 'Throw darts', { stand: [1.9, 0],
    how: 'The aim drifts. Throw three darts and score 60 or more. Bull 50, inner 25, rings 20, 10, 5.' }),
  station('paint', '🖌', 'Paint a picture', 'art', 7.1, 4.1, 1.375, 5, 'Paint at the easel', { stand: [-0.35, 1.15],
    how: 'Brush the canvas on the easel. The paint takes on a life of its own and the finished picture hangs there for everyone.' }),
  station('bathroom', '🧽', 'Clean the bathroom', 'bathroom', 4.0, 0.46, 0.9, 6, 'Scrub the bathroom', { tool: 'rag', stand: [0, 1.1],
    how: 'A rag is left in the bathroom for you. Hold it and scrub every patch of grime off the mirror and vanity.' }),
  station('defrag', '▦', 'Defragment the computer', 'office', 8.8, 4.4, 0.78, 5, 'Use the computer', { stand: [-0.6, 1.25],
    how: 'Click every red fragment to pull it back into place, then let the defrag run to the end.' }),
  station('clock', '◷', 'Set the clock', 'dining', 0.6, 3.6, 1.4, 4, 'Set the clock', { stand: [1, 0],
    how: 'Drag the clock hand to the green mark on its face.' }),
  station('books', '▤', 'Sort the books', 'library', 8.6, 5.6, 0.81, 4, 'Sort the books',
    { how: 'Pick two books on the reading table to swap them. Sort from shortest to tallest.' }),
  station('papers', '▱', 'Arrange the papers', 'conference', 7.5, 8.1, 0.79, 4, 'Arrange the papers',
    { how: 'Pick up the scattered pages in order, 1 to 5.' }),
  station('music', '♫', 'Wind the gramophone', 'lounge', 9.0, 0.7, 1.1, 5, 'Wind the gramophone',
    { how: 'Turn the crank in circles until the spring is wound.' }),
];
export const TASK_BY_ID = Object.fromEntries(TASKS.map(t => [t.id, t]));
export const TOOL_NAME = { kitchen_knife: 'the Kitchen Knife', rag: 'a Rag' };

export const TaskMethods = {
  spawnGrimeTask(c) {
    const rooms = Object.keys(ROOM_BOUNDS);
    const room = rooms[Math.floor(Math.random() * rooms.length)];
    let point = randomPointIn(room);
    for (let i = 0; i < 80; i++) {
      const p = randomPointIn(room);
      if (roomAtWorld(p.x, p.z) === room && surfaceAt(p.x, p.z) < .05) { point = p; break; }
    }
    const stain = this.addStain({ ...point, r: .48, rot: Math.random() * 6.28, k: 3, e: 1 });
    c.task.stain = stain.id;
    c.task.room = room;
    let nearby = point;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI * 2 / 16;
      const p = { x: point.x + Math.cos(a) * 1.1, z: point.z + Math.sin(a) * 1.1 };
      if (roomAtWorld(p.x,p.z) === room && surfaceAt(p.x,p.z) < .05) { nearby = p; break; }
    }
    spawnLooseItem(this, 'bleach', nearby);
    spawnLooseItem(this, 'rag', { x: nearby.x + .4, z: nearby.z });
  },
  checkGrimeTasks() {
    for (const c of this.chars.values()) if (c.task?.id === 'grime' && !c.task.complete) {
      const stain = this.stains.find(s => s.id === c.task.stain);
      if (stain?.s === 3) this.completeTask(c, 'grime');
    }
  },
  assignTasks() {
    this.taskScene = {};
    this.taskSettledDay = null;
    for (const c of this.chars.values()) {
      c.workProgress = {}; c.taskActionAt = -99;
      const available = TASKS.filter(t => t.id !== c.task?.id);
      c.task = !c.alive || c.isKiller ? null : { day: this.day, id: Math.random() < 0.2 ? 'none' : available[Math.floor(Math.random() * available.length)].id, complete: false };
      if (c.task?.id === 'bathroom') this.spawnTaskRag();
      if (c.task?.id === 'grime') this.spawnGrimeTask(c);
      this.sendTask(c);
    }
    if ([...this.chars.values()].some((c) => c.task?.id === 'bathroom')) {
      this.taskScene.bathroom = { active: true, progress: 0, at: this.time };
    }
  },
  // Whoever has to clean the bathroom finds a rag waiting on the vanity.
  spawnTaskRag() {
    const t = TASK_BY_ID.bathroom;
    const waiting = this.props.list.some(p => p.kind === 'rag' && !p.used && !p.gone && !p.holder && !p.stash && Math.hypot(p.x - t.x, p.z - t.z) < 3);
    if (!waiting) spawnLooseItem(this, 'rag', { x: t.x + 0.9 + Math.random() * 0.4, z: t.z });
  },
  cleanupComplete() {
    // Wiped blood is still a stain until it has been bleached and dried.
    return !this.stains.some(s => s.k !== 3 && s.s !== 3) && this.bodies.every(b => b.found || b.hideSpot || b.concealed);
  },
  taskStatus(c) {
    if (!c.alive) return null;
    if (c.isKiller) return { day: this.day, id: this.isKillDay() ? 'kill' : 'cleanup', complete: this.isKillDay() ? this.killedToday : this.cleanupComplete(), required: this.isKillDay(), progress: c.workProgress || {} };
    return c.task ? { ...c.task, progress: c.workProgress || {} } : null;
  },
  sendTask(c) { this.toSeat(c.id, { type: 'task', task: this.taskStatus(c) }); },
  updateTasks() {
    for (const c of this.activeKillers()) {
      const state = this.taskStatus(c), key = `${state.day}:${state.id}:${state.complete}`;
      if (c.taskStatusKey !== key) { c.taskStatusKey = key; this.sendTask(c); }
    }
  },
  completeTask(c, id) {
    if (!c?.alive || c.isKiller || c.task?.id !== id || c.task.day !== this.day || c.task.complete || this.taskSettledDay === this.day) return;
    c.task.complete = true;
    for (const other of this.living()) if (other !== c && !other.isKiller) bumpTrust(other, c.id, 1);
    this.sendTask(c);
    this.toast(c, `${TASK_BY_ID[id].title} complete · +1 trust with the other saviors.`);
  },
  settleTasks() {
    if (this.taskSettledDay === this.day) return;
    this.taskSettledDay = this.day;
    for (const c of this.living()) {
      if (c.isKiller || !c.task || c.task.day !== this.day || c.task.id === 'none' || c.task.complete) continue;
      const loss = 1 + Math.floor(Math.random() * 4);
      for (const other of this.living()) if (other !== c && !other.isKiller) bumpTrust(other, c.id, -loss);
      this.toSeat(c.id, { type: 'toast', text: `Unfinished: ${TASK_BY_ID[c.task.id].title}. 1d4 rolled ${loss} · −${loss} trust with the other saviors.` });
    }
  },
  toolInHand(c, kind) { return this.handIds(c).map(pid => this.props.byId.get(pid)).find(p => p?.kind === kind && !p.used) || null; },
  canWork(c, task) {
    if (!task || task.id === 'pool' || task.id === 'grime' || !c.alive || c.ko || c.convo || this.phase !== 'day' || this.overtime) return false;
    if (Math.hypot(c.x - task.x, c.z - task.z) > 2.9 || !losClear(c.x, c.z, task.x, task.z, this.doors)) return false;
    if (task.tool && !this.toolInHand(c, task.tool)) { this.toast(c, `Hold ${TOOL_NAME[task.tool]} to ${task.title.toLowerCase()}.`); return false; }
    return true;
  },
  setScene(id, progress, extra = {}) { this.taskScene[id] = { ...this.taskScene[id], progress, at: this.time, ...extra }; },
  finishWork(c, task) {
    c.workProgress[task.id] = task.steps;
    this.sendTask(c);
    this.completeTask(c, task.id);
    if (c.isKiller || c.task?.id !== task.id) this.toast(c, `${task.title} complete.`);
  },
  // A human finished the mini-game.
  taskDone(c, a) {
    const task = TASK_BY_ID[a.id];
    if (!this.canWork(c, task)) return false;
    c.workProgress ||= {};
    if ((c.workProgress[task.id] || 0) >= task.steps) return false;
    const extra = {};
    if (task.id === 'paint' && typeof a.url === 'string' && /^https:\/\//.test(a.url) && a.url.length < 800) this.painting = { url: a.url, by: c.id, title: String(a.title || '').slice(0, 60) };
    if (task.id === 'darts') extra.score = Math.max(0, Math.min(150, a.score | 0));
    this.setScene(task.id, 1, extra);
    c.anim = 'agree'; c.animUntil = this.time + 0.6;
    this.finishWork(c, task);
    return true;
  },
  taskStep(c, a) {
    const task = TASK_BY_ID[a.id];
    if (!this.canWork(c, task) || (c.workProgress?.[a.id] || 0) >= task.steps) return false;
    const progress = Math.max(0, Math.min(1, Number(a.progress) || 0));
    const extra = {};
    if (task.id === 'darts') {
      extra.darts = Array.isArray(a.darts) ? a.darts.slice(0, 3).map(d => ({ x: Math.max(-.32, Math.min(.32, Number(d.x) || 0)), y: Math.max(-.32, Math.min(.32, Number(d.y) || 0)), s: Math.max(0, Math.min(50, Number(d.s) || 0)) })) : [];
      extra.score = extra.darts.reduce((n, d) => n + d.s, 0);
    }
    if (task.id === 'clock' && Number.isFinite(a.angle)) extra.angle = Math.max(-Math.PI * 20, Math.min(Math.PI * 20, a.angle));
    this.setScene(task.id, progress, extra);
    c.anim = task.id === 'darts' ? 'dart' : task.id; c.animUntil = this.time + .65;
    return true;
  },
  // AI guests (and the butler-free fallback) do the work a step at a time.
  workTask(c, id) {
    const task = TASK_BY_ID[id];
    if (!this.canWork(c, task)) return false;
    if (this.time - (c.taskActionAt ?? -99) < 0.45) return false;
    c.taskActionAt = this.time;
    c.workProgress ||= {};
    const count = c.workProgress[id] || 0;
    if (count >= task.steps) return false;
    c.workProgress[id] = count + 1;
    const extra = id === 'darts' ? { darts: [...(this.taskScene.darts?.darts || []), { x: (Math.random()-.5)*.16, y: (Math.random()-.5)*.16, s: 20 }].slice(0,3), score: (count+1)*20 } : {};
    this.setScene(id, (count + 1) / task.steps, extra);
    c.anim = id === 'darts' ? 'dart' : id; c.animUntil = this.time + 0.45;
    this.sendTask(c);
    if (count + 1 === task.steps) this.finishWork(c, task);
    return true;
  },
  pursueTask(c) {
    const task = c.task && TASK_BY_ID[c.task.id];
    if (task?.id === 'grime') {
      const stain = this.stains.find(s => s.id === c.task.stain);
      if (!stain || stain.s === 3) return false;
      const needed = stain.s === 2 ? 'rag' : 'bleach';
      if (needed === 'rag' && c.pouring) this.useItem(c, 'bleach');
      if (!this.toolInHand(c, needed)) {
        const mine = this.allIds(c).map(pid => this.props.byId.get(pid)).find(p => p?.kind === needed && !p.used && (needed !== 'bleach' || p.left > 0));
        if (mine) this.draw(c, mine.id); else this.fetchItem(c, [needed]);
      } else if (Math.hypot(c.x - stain.x, c.z - stain.z) > .45) this.goTo(c, stain.x, stain.z, { reach: .35 });
      else if (needed === 'bleach') { if (!c.pouring) this.useItem(c, 'bleach'); }
      else this.useItem(c, 'rag');
      c.wait = .6;
      return true;
    }
    if (!task || c.task.complete || this.overtime) return false;
    if (task.tool && !this.toolInHand(c, task.tool)) {
      const mine = this.allIds(c).map(pid => this.props.byId.get(pid)).find(p => p?.kind === task.tool && !p.used);
      if (mine) { this.draw(c, mine.id); return true; }
      if (task.tool === 'kitchen_knife') {
        const knife = this.props.byId.get(task.tool);
        if (!knife || knife.holder && knife.holder !== c.id || knife.hidden || knife.atBody) return false;
        if (c.hands.every(Boolean)) this.release(c, { x: 0, y: 0, z: 0 });
        this.goTo(c, knife.x, knife.z + 0.8, { reach: 2, arrive: () => this.grab(c, knife.id) });
        return true;
      }
      return this.fetchItem(c, [task.tool]);
    }
    const close = Math.hypot(c.x - task.x, c.z - task.z) < 2.5;
    if (!close) {
      // Approach the usable side of each station.
      const [dx, dz] = task.stand || [0, 1.05];
      this.goTo(c, task.x + dx, task.z + dz, { reach: 1.4, arrive: () => { c.wait = 0.2; } });
    } else if (task.id === 'pool') {
      if (!this.pool.moving) {
        if (this.pool.balls[0].in) this.pool.rack();
        const ball = this.pool.balls[0], pockets = this.pool.pockets();
        const [x, z] = pockets.sort((a, b) => Math.hypot(a[0] - ball.x, a[1] - ball.z) - Math.hypot(b[0] - ball.x, b[1] - ball.z))[0];
        this.poolShot(c, x - ball.x + (Math.random() - .5) * .035, z - ball.z, .25);
      }
    } else this.workTask(c, task.id);
    c.wait = 0.6;
    return true;
  },
};
