// What a witness actually saw someone doing, in plain words the dialogue
// model may lean on. Every phrase is derived from match state at the moment
// of sighting, so it can color a line without inventing evidence.
import { FURNITURE, ROOM_BOUNDS, local, roomSize, SEATS } from "./layout.js";
import { itemName, roomName, SUSPECT_BY_ID } from "./data.js";
import { DOOR_LIST, losClear } from "./nav.js";

const words = (type) => type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
const SKIP = new Set(["chandelier", "poolLamp", "rug", "lamp"]);

export function nearestFurniture(p, within = 1.6) {
  let best = null, bd = within;
  for (const f of FURNITURE) {
    if (f.room !== p.room || SKIP.has(f.type)) continue;
    const dx = Math.max(Math.abs(p.x - f.x) - (f.fw || 0) / 2, 0), dz = Math.max(Math.abs(p.z - f.z) - (f.fd || 0) / 2, 0);
    const d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function inCorner(p) {
  if (!ROOM_BOUNDS[p.room]) return false;
  const o = local(p.room, 0, 0), { w, d } = roomSize(p.room);
  const nearX = Math.min(p.x - o.x, o.x + w - p.x), nearZ = Math.min(p.z - o.z, o.z + d - p.z);
  return nearX < 1.4 && nearZ < 1.4;
}

const direction = (dx, dz) => Math.abs(dx) > Math.abs(dz) ? dx > 0 ? "east" : "west" : dz > 0 ? "south" : "north";
const gazeDot = (p, x, y, z) => {
  const dx = x - p.x, dz = z - p.z, dy = y - 1.6;
  const length = Math.hypot(dx, dy, dz) || 1;
  const pitch = p.pitch || 0;
  return (Math.sin(p.yaw) * Math.cos(pitch) * dx + Math.cos(p.yaw) * Math.cos(pitch) * dz + Math.sin(pitch) * dy) / length;
};

// An observer may name a gaze target only when both the person's face and
// target are visible. Facing a thing is still not evidence of intent.
export function visibleGaze(match, observer, p) {
  if (!observer || match.perceive(observer, p) < 0.5) return null;
  let best = null, score = 0.92;
  const consider = (x, y, z, label, room = p.room) => {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 0.8 || d > 7 || !losClear(p.x, p.z, x, z, match.doors)) return;
    if (match.perceiveAt(observer, x, z, room) < 0.2) return;
    const dot = gazeDot(p, x, y, z) - d * 0.002;
    if (dot > score) { score = dot; best = label; }
  };
  for (const other of match.living()) {
    if (other === p || other.room !== p.room) continue;
    if (other === observer || match.sees(observer, other)) consider(other.x, 1.5, other.z, SUSPECT_BY_ID[other.id]?.short || other.id, other.room);
  }
  for (const item of match.props.list) {
    if (item.hidden || item.gone || item.holder || item.stash || item.atBody || item.room !== p.room) continue;
    consider(item.x, item.y || 0.7, item.z, `the ${itemName(item.kind)}`, item.room);
  }
  for (const f of FURNITURE) {
    if (f.room !== p.room || SKIP.has(f.type)) continue;
    consider(f.x, Math.min(1.5, f.h || 0.9), f.z, `the ${words(f.type)}`, f.room);
  }
  for (const door of DOOR_LIST) {
    if (p.room !== "hallway" && door.room !== p.room) continue;
    consider(door.mid.x, 1.5, door.mid.z, p.room === "hallway" ? `the ${roomName(door.room)} doorway` : "the doorway", p.room);
  }
  return best ? `head turned toward ${best}` : `head turned ${direction(Math.sin(p.yaw), Math.cos(p.yaw))}`;
}

export function movementHeading(match, observer, p, dx, dz) {
  const len = Math.hypot(dx, dz);
  if (!observer || len < 0.4) return null;
  let best = null, bestD = Infinity;
  for (const door of DOOR_LIST) {
    if (p.room !== "hallway" && door.room !== p.room) continue;
    const vx = door.mid.x - p.x, vz = door.mid.z - p.z, d = Math.hypot(vx, vz);
    if (d < 0.6 || d > 5.5 || (dx * vx + dz * vz) / (len * d) < 0.8) continue;
    if (match.perceiveAt(observer, door.mid.x, door.mid.z, p.room) < 0.2) continue;
    if (d < bestD) { bestD = d; best = p.room === "hallway" ? `the ${roomName(door.room)} doorway` : "the doorway"; }
  }
  return best ? `toward ${best}` : direction(dx, dz);
}

// Short present-participle phrase: "standing still in the corner, holding the Rope".
export function describeActivity(match, p, observer = null, move = null) {
  const bits = [];
  const held = match.handIds(p).map((id) => match.props.byId.get(id)).filter(Boolean);
  if (p.seat) {
    const seat = SEATS.find((s) => s.id === p.seat);
    const f = seat && FURNITURE.find((x) => x.id === seat.fid);
    bits.push(`sitting on the ${f ? words(f.type) : "seat"}`);
  } else if (p.convo || p.chat) {
    const other = match.convos?.get?.(p.convo);
    const partner = other ? (other.a === p.id ? other.b : other.a) : null;
    bits.push(partner && SUSPECT_BY_ID[partner] ? `deep in conversation with ${SUSPECT_BY_ID[partner].short}` : "talking with someone");
  } else if (p.mv > 3) bits.push(`running${move ? ` ${movementHeading(match, observer, p, move.dx, move.dz) || ""}` : ""}`.trim());
  else if (p.mv > 0.2) bits.push(`walking${move ? ` ${movementHeading(match, observer, p, move.dx, move.dz) || ""}` : ""}`.trim());
  else {
    const f = nearestFurniture(p);
    if (inCorner(p) && !f) bits.push("standing in the corner, staring off");
    else if (f) bits.push(`lingering by the ${words(f.type)}`);
    else bits.push("just standing there");
  }
  if (p.anim && match.time < (p.animUntil || 0) && /agree|work|chop/i.test(p.anim)) bits.push("busy with some chore");
  if (held.length) bits.push(`holding the ${held.map((h) => itemName(h.kind)).join(" and the ")}`);
  const gaze = visibleGaze(match, observer, p);
  if (gaze) bits.push(gaze);
  if (p.wound) bits.push("looking unwell");
  return bits.join(", ");
}
