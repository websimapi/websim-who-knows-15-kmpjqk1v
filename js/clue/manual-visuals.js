// Casebook visuals are lazy. Room plans use the live grid and furniture data;
// object and guest portraits use the game meshes.
import * as THREE from "three";
import { propMesh } from "./props3d.js";
import { loadKit, Avatar } from "./avatars.js";
import { SUSPECT_BY_ID, BUTLER, WEAPON_BY_ID, CELL, COLS, GRID, DUNGEON, DROW, DH, ROOMS, DOORS, HATCHES } from "./data.js";
import { ROOM_BOUNDS, PROP_RADIUS, FURNITURE } from "./layout.js";

const cache = new Map();
let renderer;

function graphics(width, height) {
  renderer ??= new THREE.WebGLRenderer({ alpha: false, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  return renderer;
}

function snapshot(scene, camera, width, height) {
  const output = graphics(width, height);
  output.render(scene, camera);
  return output.domElement.toDataURL("image/png");
}

function studioScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x251b1c);
  scene.add(new THREE.HemisphereLight(0xfff1d7, 0x5a4350, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd99b, 1.4);
  rim.position.set(4, 3, -5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xacc9df, 1.3);
  fill.position.set(1, -1, 6);
  scene.add(fill);
  return scene;
}

function objectImage(kind) {
  const scene = studioScene();
  const mesh = propMesh({ kind, r: PROP_RADIUS[kind] || 0.08, weapon: !!WEAPON_BY_ID[kind] });
  if (mesh.userData.halo) mesh.userData.halo.visible = false;
  mesh.userData.torch?.children.forEach((sprite) => { sprite.scale.set(sprite.userData.s, sprite.userData.s * 1.8, 1); });
  scene.add(mesh);
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  mesh.position.sub(center);
  const scale = 1.24 / Math.max(size.x, size.y, size.z, 0.01);
  mesh.scale.setScalar(scale);
  const camera = new THREE.OrthographicCamera(-0.85, 0.85, 0.85, -0.85, 0.01, 20);
  camera.position.set(1.1, 2.8, 4.8);
  camera.lookAt(0, 0, 0);
  return snapshot(scene, camera, WEAPON_BY_ID[kind] ? 320 : 144, WEAPON_BY_ID[kind] ? 320 : 144);
}

function planCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 440;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas previews unavailable");
  ctx.fillStyle = "#17191b";
  ctx.fillRect(0, 0, 640, 440);
  return { canvas, ctx };
}

function fitPlan(x0, z0, x1, z1) {
  const scale = Math.min(586 / (x1 - x0), 386 / (z1 - z0));
  const left = (640 - (x1 - x0) * scale) / 2;
  const top = (440 - (z1 - z0) * scale) / 2;
  return { scale, point: (x, z) => [left + (x - x0) * scale, top + (z - z0) * scale] };
}

function rounded(ctx, x, y, w, h, r, fill, stroke = null) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawFurniture(ctx, f, plan) {
  if (!f.w || !f.d || f.type === "frontDoor") return;
  const [x, z] = plan.point(f.x / CELL + COLS / 2, f.z / CELL + ROWS / 2);
  const unit = plan.scale / CELL;
  const w = Math.max(2, f.w * unit), d = Math.max(2, f.d * unit);
  ctx.save();
  ctx.translate(x, z);
  ctx.rotate(-f.rot);
  ctx.shadowColor = "#09070699";
  ctx.shadowBlur = f.solid === false ? 0 : 7;
  ctx.shadowOffsetY = f.solid === false ? 0 : 3;
  const t = f.type;
  if (t === "rug" || t === "bathMat") {
    rounded(ctx, -w / 2, -d / 2, w, d, 5, t === "bathMat" ? "#d9e5df" : "#79474b", "#d8bb79");
  } else if (t === "billiardTable") {
    rounded(ctx, -w / 2, -d / 2, w, d, 8, "#3d2519", "#ad8750");
    rounded(ctx, -w / 2 + 8, -d / 2 + 8, w - 16, d - 16, 4, "#2e7651");
    ctx.fillStyle = "#e8dec3";
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-w * 0.27 + i * w * 0.13, (i % 2) * 6 - 3, 3, 0, Math.PI * 2); ctx.fill(); }
  } else if (t === "bathtub") {
    rounded(ctx, -w / 2, -d / 2, w, d, d * 0.42, "#f4f0e8", "#bac4c5");
    rounded(ctx, -w / 2 + 9, -d / 2 + 9, w - 18, d - 18, d * 0.36, "#8ab4b9");
  } else if (t === "vanity") {
    rounded(ctx, -w / 2, -d / 2, w, d, 5, "#ece9e1", "#b8b1a4");
    ctx.fillStyle = "#9dbfca";
    for (const sx of [-w * 0.25, w * 0.25]) { ctx.beginPath(); ctx.ellipse(sx, 0, w * 0.12, d * 0.27, 0, 0, Math.PI * 2); ctx.fill(); }
  } else if (t === "toilet") {
    rounded(ctx, -w * 0.48, -d * 0.48, w * 0.96, d * 0.36, 4, "#e6e4dc");
    ctx.beginPath(); ctx.ellipse(0, d * 0.12, w * 0.4, d * 0.36, 0, 0, Math.PI * 2); ctx.fillStyle = "#f4f2eb"; ctx.fill(); ctx.strokeStyle = "#b9c4c4"; ctx.stroke();
  } else if (t === "shower") {
    rounded(ctx, -w / 2, -d / 2, w, d, 3, "#a8c9cc", "#e9f5f2");
    ctx.strokeStyle = "#d8eff1"; ctx.beginPath(); ctx.moveTo(-w * 0.4, -d * 0.4); ctx.lineTo(w * 0.4, d * 0.4); ctx.stroke();
  } else if (t === "arcade") {
    rounded(ctx, -w / 2, -d / 2, w, d, 4, "#182d47", "#37cfdb");
    rounded(ctx, -w * 0.3, -d * 0.28, w * 0.6, d * 0.4, 2, "#50ccdb");
    ctx.fillStyle = "#ef80b6"; ctx.beginPath(); ctx.arc(0, d * 0.28, 3, 0, Math.PI * 2); ctx.fill();
  } else if (t === "easel") {
    ctx.strokeStyle = "#755033"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-w / 2, d / 2); ctx.lineTo(0, -d / 2); ctx.lineTo(w / 2, d / 2); ctx.stroke();
    rounded(ctx, -w * 0.3, -d * 0.27, w * 0.6, d * 0.55, 2, "#ede1bd", "#9d7149");
    ctx.fillStyle = "#b15d64"; ctx.fillRect(-w * 0.17, -d * 0.1, w * 0.22, d * 0.19);
  } else if (t === "wardrobe" || t === "storageChest") {
    rounded(ctx, -w / 2, -d / 2, w, d, 4, t === "wardrobe" ? "#4e3120" : "#825631", "#d0ab6e");
    ctx.strokeStyle = "#caa96e"; ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2 + 5, -d / 2 + 4, w - 10, d - 8);
    ctx.beginPath(); ctx.moveTo(0, -d / 2 + 4); ctx.lineTo(0, d / 2 - 4); ctx.stroke();
    ctx.fillStyle = "#d5ba80";
    for (const sx of [-w * 0.12, w * 0.12]) { ctx.beginPath(); ctx.arc(sx, d * 0.18, 2.5, 0, Math.PI * 2); ctx.fill(); }
  } else if (["diningTable", "conferenceTable", "readingTable", "workbench", "desk", "table", "island"].includes(t)) {
    rounded(ctx, -w / 2, -d / 2, w, d, 5, t === "island" ? "#d9d0bd" : t === "conferenceTable" ? "#55402d" : "#815937", "#c6a77a");
    ctx.strokeStyle = "#e7d2ab88"; ctx.lineWidth = 1; ctx.strokeRect(-w / 2 + 5, -d / 2 + 5, w - 10, d - 10);
  } else if (["chair", "armchair", "sofa", "settee", "bench"].includes(t)) {
    rounded(ctx, -w / 2, -d / 2, w, d, Math.min(7, d / 4), t === "chair" ? "#6d4534" : "#814f4b", "#d6ad76");
    ctx.fillStyle = "#d3a77f"; ctx.fillRect(-w * 0.38, -d * 0.4, w * 0.76, Math.max(2, d * 0.12));
  } else if (["bookshelf", "canvasRack", "wineRack", "paintShelf", "wallShelf", "cueRack"].includes(t)) {
    rounded(ctx, -w / 2, -d / 2, w, d, 2, "#5f412d", "#b18e5f");
    ctx.strokeStyle = t === "canvasRack" ? "#e6d7b8" : "#c5a777"; ctx.lineWidth = 2;
    for (let n = -w / 2 + 6; n < w / 2 - 3; n += 8) { ctx.beginPath(); ctx.moveTo(n, -d / 2 + 2); ctx.lineTo(n, d / 2 - 2); ctx.stroke(); }
  } else if (t === "fireplace" || t === "stove") {
    rounded(ctx, -w / 2, -d / 2, w, d, 3, t === "stove" ? "#242324" : "#9b8f80");
    ctx.fillStyle = t === "stove" ? "#bf7761" : "#e47e43"; ctx.fillRect(-w * 0.3, -d * 0.2, w * 0.6, d * 0.4);
  } else if (["roundTable", "teatable", "sideTable", "coffeeTable"].includes(t)) {
    ctx.beginPath(); ctx.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2); ctx.fillStyle = "#845c3b"; ctx.fill(); ctx.strokeStyle = "#c9a77a"; ctx.stroke();
  } else if (["sculpture", "statue", "palm", "globe", "pillar", "hamper"].includes(t)) {
    ctx.beginPath(); ctx.arc(0, 0, Math.max(4, Math.min(w, d) * 0.43), 0, Math.PI * 2); ctx.fillStyle = t === "palm" ? "#587d55" : "#d3c5ae"; ctx.fill(); ctx.strokeStyle = "#8a7254"; ctx.stroke();
  } else {
    rounded(ctx, -w / 2, -d / 2, w, d, 3, "#856547", "#c09a69");
  }
  ctx.restore();
}

function roomImage(id) {
  const { canvas, ctx } = planCanvas();
  if (id === "tunnels") {
    const plan = fitPlan(0, 0, COLS, DH);
    for (let r = 0; r < DH; r++) for (let c = 0; c < COLS; c++) {
      const [x, y] = plan.point(c, r);
      ctx.fillStyle = DUNGEON[r][c] === "U" ? "#766751" : "#252424";
      ctx.fillRect(x, y, plan.scale + 0.5, plan.scale + 0.5);
      if (DUNGEON[r][c] === "U") { ctx.strokeStyle = "#a7956a66"; ctx.strokeRect(x + 1, y + 1, plan.scale - 2, plan.scale - 2); }
    }
    for (const hatch of HATCHES) {
      const [x, y] = plan.point(hatch.bottom[0] + 0.5, hatch.bottom[1] - DROW + 0.5);
      ctx.fillStyle = "#d5b36f"; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    }
    return canvas.toDataURL("image/png");
  }
  const bounds = ROOM_BOUNDS[id];
  if (!bounds) throw new Error(`Unknown room: ${id}`);
  const [x0, z0, x1, z1] = bounds;
  const plan = fitPlan(x0, z0, x1, z1);
  const ch = Object.keys(ROOMS).find((key) => ROOMS[key].id === id);
  const doorSet = new Set(DOORS.map(([a, b, c, d]) => `${a},${b}|${c},${d}`));
  const isDoor = (a, b, c, d) => doorSet.has(`${a},${b}|${c},${d}`) || doorSet.has(`${c},${d}|${a},${b}`);
  for (let r = z0; r < z1; r++) for (let c = x0; c < x1; c++) {
    if (GRID[r]?.[c] !== ch) continue;
    const [x, y] = plan.point(c, r), size = plan.scale;
    ctx.fillStyle = ROOMS[ch].tint; ctx.fillRect(x, y, size + 0.5, size + 0.5);
    ctx.strokeStyle = "#332d2c28"; ctx.lineWidth = 1;
    if (ROOMS[ch].floor === "checker") {
      ctx.fillStyle = "#ffffff24";
      if ((c + r) % 2) ctx.fillRect(x, y, size, size);
    } else {
      ctx.beginPath(); ctx.moveTo(x + 2, y + size * 0.5); ctx.lineTo(x + size - 2, y + size * 0.5); ctx.stroke();
    }
  }
  const furnishings = FURNITURE.filter((f) => f.room === id && f.w > 0 && f.d > 0);
  furnishings.sort((a, b) => Number(["rug", "bathMat"].includes(b.type)) - Number(["rug", "bathMat"].includes(a.type)) || (a.y || 0) - (b.y || 0));
  for (const f of furnishings) drawFurniture(ctx, f, plan);
  ctx.lineWidth = Math.max(3, plan.scale * 0.075); ctx.lineCap = "square"; ctx.strokeStyle = "#e0c598";
  const edge = (c, r, dc, dr, ax, ay, bx, by) => {
    if (GRID[r + dr]?.[c + dc] === ch) return;
    if (isDoor(c, r, c + dc, r + dr)) {
      ctx.save(); ctx.strokeStyle = "#b99452"; ctx.lineWidth = Math.max(2, plan.scale * 0.035); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
    } else { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
  };
  for (let r = z0; r < z1; r++) for (let c = x0; c < x1; c++) {
    if (GRID[r]?.[c] !== ch) continue;
    const [x, y] = plan.point(c, r), s = plan.scale;
    edge(c, r, 0, -1, x, y, x + s, y);
    edge(c, r, 1, 0, x + s, y, x + s, y + s);
    edge(c, r, 0, 1, x, y + s, x + s, y + s);
    edge(c, r, -1, 0, x, y, x, y + s);
  }
  for (const hatch of HATCHES.filter((h) => h.room === id)) {
    const [x, y] = plan.point(hatch.top[0] + 0.5, hatch.top[1] + 0.5);
    const s = Math.max(11, plan.scale * 0.45);
    rounded(ctx, x - s / 2, y - s / 2, s, s, 2, "#6e4a30", "#d5af73");
    ctx.strokeStyle = "#d5af73"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - s * 0.26, y); ctx.lineTo(x + s * 0.26, y); ctx.stroke();
  }
  return canvas.toDataURL("image/png");
}

async function guestImage(id, ghost) {
  const suspect = id==='butler'?BUTLER:SUSPECT_BY_ID[id];
  const kit = await loadKit([id]);
  // Authored guests must show their actual replacement model, never a fallback robot.
  if (["blue", "violet", "white", "green", "red", "yellow", "copper", "teal", "butler"].includes(id) && !kit.variants?.[id]) throw new Error("Character model unavailable: " + id);
  const scene = studioScene();
  const avatar = new Avatar(kit, suspect);
  avatar.update(0.15, { x: 0, z: 0, yaw: 0, mv: 0, alive: !ghost, anim: null, seat: null }, true);
  scene.add(avatar.root);
  const camera = new THREE.PerspectiveCamera(30, 320 / 440, 0.1, 30);
  camera.position.set(0, 1.12, 4.1);
  camera.lookAt(0, 0.95, 0);
  try{return snapshot(scene, camera, 320, 440);}finally{avatar.dispose();renderer?.renderLists.dispose();}
}

export async function manualImage(key) {
  if (cache.has(key)) return cache.get(key);
  const [type, id] = key.split(":");
  const image = type === "prop" ? objectImage(id)
    : type === "room" ? roomImage(id)
    : type === "guest" || type === "ghost" ? await guestImage(id, type === "ghost")
    : null;
  if (image) cache.set(key, image);
  return image;
}
