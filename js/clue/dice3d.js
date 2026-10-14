// A 3D twenty-sided die that tumbles onto the rolled number, with the
// result spelled out underneath. Shown inside a player's HUD.
import * as THREE from "three";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// One numbered triangle texture per face.
function faceTexture(n) {
  const S = 128, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d");
  g.fillStyle = "#e9dfc6"; g.fillRect(0, 0, S, S);
  g.strokeStyle = "rgba(90,60,30,.35)"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(S * 0.5, S * 0.07); g.lineTo(S * 0.07, S * 0.82); g.lineTo(S * 0.93, S * 0.82); g.closePath(); g.stroke();
  g.fillStyle = n === 20 ? "#8a0f12" : n === 1 ? "#3a3a3a" : "#2a1a10";
  g.font = `bold ${n > 9 ? 40 : 46}px Georgia, serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(String(n), S * 0.5, S * 0.58);
  if (n === 6 || n === 9) g.fillRect(S * 0.42, S * 0.73, S * 0.16, 4);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let FACES = null;
function buildDie() {
  let geo = new THREE.IcosahedronGeometry(1, 0);
  if (geo.index) geo = geo.toNonIndexed();
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const info = [];
  geo.clearGroups();
  for (let f = 0; f < 20; f++) {
    // Top vertex of the number = first vertex of the triangle.
    uv.set([0.5, 0.93, 0.07, 0.18, 0.93, 0.18], f * 6);
    geo.addGroup(f * 3, 3, f);
    const a = new THREE.Vector3().fromBufferAttribute(pos, f * 3), b = new THREE.Vector3().fromBufferAttribute(pos, f * 3 + 1), c = new THREE.Vector3().fromBufferAttribute(pos, f * 3 + 2);
    const cen = a.clone().add(b).add(c).divideScalar(3);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    if (n.dot(cen) < 0) n.negate();
    info.push({ n, up: a.clone().sub(cen).normalize() });
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  FACES ??= Array.from({ length: 20 }, (_, i) => new THREE.MeshStandardMaterial({ map: faceTexture(i + 1), roughness: 0.35, metalness: 0.05, flatShading: true }));
  return { mesh: new THREE.Mesh(geo, FACES), info };
}

// Orientation that shows face index f square-on to the camera (+z), number upright.
function faceUp(info) {
  const q = new THREE.Quaternion().setFromUnitVectors(info.n, new THREE.Vector3(0, 0, 1));
  const up = info.up.clone().applyQuaternion(q);
  const spin = Math.atan2(-up.x, up.y);
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin).multiply(q);
}

export function rollDice(root, { roll, bonus = 0, dc, success, head, result }) {
  const box = document.createElement("div");
  box.className = `dice ${success ? "ok" : "fail"}`;
  box.innerHTML = `<div class="dice-h">${head}</div><div class="dice-c"></div><div class="dice-r"></div>`;
  root.append(box);
  const W = 200;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.setSize(W, W);
  r.outputColorSpace = THREE.SRGBColorSpace;
  box.querySelector(".dice-c").append(r.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  cam.position.set(0, 0, 5.2);
  scene.add(new THREE.HemisphereLight(0xfff2dd, 0x2a1a10, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 3, 4); scene.add(key);
  const { mesh, info } = buildDie();
  scene.add(mesh);
  const target = faceUp(info[Math.max(1, Math.min(20, roll)) - 1]);
  const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const turns = Math.PI * 2 * (3 + Math.random() * 2);
  const ROLL = 1.5;
  const t0 = performance.now();
  let raf = 0, shown = false;
  const tmp = new THREE.Quaternion();
  const frame = () => {
    const t = (performance.now() - t0) / 1000;
    const u = Math.min(1, t / ROLL), e = 1 - Math.pow(1 - u, 3);
    tmp.setFromAxisAngle(axis, turns * (1 - e));
    mesh.quaternion.copy(tmp).multiply(target);
    // Hop: bounces that die away as it settles.
    mesh.position.y = Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) * 0.9;
    mesh.position.x = (1 - e) * -1.2;
    r.render(scene, cam);
    if (u >= 1 && !shown) {
      shown = true;
      const nat = roll === 20 ? " · natural 20!" : roll === 1 ? " · natural 1" : "";
      box.querySelector(".dice-r").innerHTML = `<b>${roll}</b>${bonus ? ` + ${bonus}` : ""} = <b>${roll + bonus}</b> vs ${dc}${nat}<br><span>${esc(result)}</span>`;
      box.classList.add("done");
    }
    if (t < 5.2) raf = requestAnimationFrame(frame);
    else { box.remove(); r.dispose(); r.forceContextLoss(); }
  };
  raf = requestAnimationFrame(frame);
}
