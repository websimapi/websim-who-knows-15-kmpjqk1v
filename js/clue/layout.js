// Life-size furniture, interactables and loose props. Authored in metres,
// relative to each room's top-left corner, then converted to world metres.
// Shared by the 3D builder, collision, physics and AI.
import { CELL, COLS, ROWS } from "./data.js";

// Room bounds in board squares: [u0, v0, u1, v1].
export const ROOM_BOUNDS = {
  kitchen: [0, 0, 6, 6], art: [8, 0, 16, 7], bathroom: [18, 0, 24, 6], dining: [0, 8, 8, 15],
  cellar: [10, 10, 15, 16], game: [18, 8, 24, 13], library: [17, 14, 24, 20], lounge: [0, 19, 7, 25],
  conference: [8, 18, 16, 25], office: [17, 21, 24, 25],
};
const W = (u, v) => ({ x: (u - COLS / 2) * CELL, z: (v - ROWS / 2) * CELL });
// Room-local metres -> world metres.
export function local(room, x, z) {
  const [u0, v0] = ROOM_BOUNDS[room];
  const o = W(u0, v0);
  return { x: o.x + x, z: o.z + z };
}
export const roomSize = (room) => { const [u0, v0, u1, v1] = ROOM_BOUNDS[room]; return { w: (u1 - u0) * CELL, d: (v1 - v0) * CELL }; };

const PI = Math.PI, HALF = Math.PI / 2;
export const FURNITURE = [];
let seq = 0;
// rot: facing yaw (0 = front faces +z). Only multiples of 90°.
function F(room, type, x, z, w, d, h, o = {}) {
  const p = room === "hallway" ? W(x, z) : local(room, x, z);
  const rot = o.rot || 0;
  const side = Math.abs(Math.sin(rot)) > 0.5;
  const f = { id: o.id || `${type}${seq++}`, room, type, x: p.x, z: p.z, w, d, h, rot, fw: side ? d : w, fd: side ? w : d, solid: true, top: h, ...o };
  f.rot = rot;
  FURNITURE.push(f);
  return f;
}
const chair = (room, x, z, rot, style = "dining", o = {}) => F(room, "chair", x, z, 0.5, 0.5, 0.95, { rot, style, seat: [{ dx: 0, dz: 0, h: 0.47 }], top: 0.47, ...o });
const armchair = (room, x, z, rot, o = {}) => F(room, "armchair", x, z, 0.9, 0.9, 1.0, { rot, seat: [{ dx: 0, dz: 0.05, h: 0.45 }], top: 0.45, ...o });

// ---------- Kitchen 13.2 × 13.2 ----------
F("kitchen", "counter", 6.2, 0.35, 10.4, 0.7, 0.92, { cab: true, id: "k_counter" });
F("kitchen", "stove", 0.45, 4.2, 1.6, 0.9, 0.92, { rot: HALF, stove: true, id: "stove" });
F("kitchen", "hood", 0.3, 4.2, 1.4, 0.6, 0.6, { rot: HALF, solid: false, y: 1.9 });
F("kitchen", "island", 7.4, 6.9, 3.4, 1.4, 0.92, { cab: true, id: "k_island" });
for (const [x, z, r] of [[6.4, 8.0, PI], [8.4, 8.0, PI], [6.4, 5.8, 0], [8.4, 5.8, 0]]) chair("kitchen", x, z, r, "stool");
F("kitchen", "pantry", 12.8, 3.2, 1.8, 0.7, 2.3, { rot: -HALF, cab: true, id: "k_pantry" });
F("kitchen", "dresser", 0.35, 9.4, 2.2, 0.6, 2.1, { rot: HALF, cab: true, id: "k_dresser" });
F("kitchen", "cabinet", 0.35, 2.1, 1.6, 0.55, 1.1, { rot: HALF, cab: true, id: "k_spice_cabinet" });
F("kitchen", "barrel", 12.5, 9.2, 0.75, 0.75, 0.95, { openBarrel: true });
F("kitchen", "barrel", 12.5, 10.2, 0.75, 0.75, 0.95, { openBarrel: true });
F("kitchen", "table", 3.2, 11.4, 1.6, 0.9, 0.78, { style: "rustic" });
F("kitchen", "wallShelf", 2.8, 0.48, 2.3, 0.32, 1.5, { solid: false, y: 1.25 });
F("kitchen", "wallShelf", 10.7, 0.48, 2.1, 0.32, 1.5, { solid: false, y: 1.25 });

// ---------- Art room: easels, wet canvases and a workbench ----------
for (const [x, z, r] of [[3.2, 3.1, 0.2], [7.1, 4.1, -0.3], [12.8, 3.0, 0.35]]) F("art", "easel", x, z, 1.1, 0.85, 2.1, { rot: r });
F("art", "workbench", 9.3, 9.2, 3.5, 1.35, 0.84, { cab: true, id: "art_workbench" });
chair("art", 8.1, 10.6, PI, "stool"); chair("art", 10.4, 10.6, PI, "stool");
F("art", "canvasRack", 16.9, 7.2, 3.5, 0.52, 1.7, { rot: -HALF });
F("art", "paintShelf", 0.5, 7.2, 3.4, 0.55, 1.6, { rot: HALF, cab: true, id: "art_paints" });
F("art", "wardrobe", 0.55, 12.6, 2.35, 0.85, 2.45, { rot: HALF, cab: true, bodyHide: true, id: "art_wardrobe" });
F("art", "sculpture", 15.5, 11.8, 0.9, 0.9, 2.0);
F("art", "rug", 8.8, 8.0, 5.2, 4.4, 0, { solid: false });
F("art", "chandelier", 8.8, 7.7, 0, 0, 0, { solid: false });

// ---------- Bathroom: tiled washroom around the old hidden hatch ----------
F("bathroom", "vanity", 4.0, 0.46, 3.4, 0.82, 0.88, { cab: true, id: "bath_vanity" });
F("bathroom", "cabinet", 7.25, 0.38, 1.35, 0.55, 1.25, { cab: true, id: "bath_linen_cabinet" });
F("bathroom", "bathtub", 10.1, 8.6, 2.8, 1.65, 0.72);
F("bathroom", "toilet", 12.15, 3.2, 0.78, 1.0, 0.82, { rot: -HALF });
F("bathroom", "shower", 0.95, 5.1, 1.75, 1.75, 2.25);
F("bathroom", "towelRack", 12.6, 11.4, 0.8, 0.25, 1.4, { rot: -HALF, solid: false });
F("bathroom", "hamper", 4.0, 10.8, 0.8, 0.8, 0.9);
F("bathroom", "bathMat", 8.5, 10.5, 2.5, 1.0, 0, { solid: false });

// ---------- Dining 17.6 × 15.4 (notch top-right), doors top x 13.2–15.4, right z 8.8–11 ----------
F("dining", "diningTable", 8.2, 8.4, 6.4, 1.6, 0.78);
for (let i = 0; i < 5; i++) { const x = 5.6 + i * 1.3; chair("dining", x, 7.15, 0); chair("dining", x, 9.65, PI); }
chair("dining", 4.4, 8.4, HALF); chair("dining", 12.0, 8.4, -HALF);
F("dining", "sideboard", 0.35, 8.4, 3.0, 0.6, 0.95, { rot: HALF, cab: true, id: "d_sideboard" });
F("dining", "clock", 0.35, 3.6, 0.7, 0.5, 2.3, { rot: HALF });
F("dining", "fireplace", 8.2, 14.9, 2.6, 0.95, 1.6, { rot: PI, fire: "fp_dining", bodyHide: true });
F("dining", "china", 17.25, 5.2, 2.0, 0.55, 2.2, { rot: -HALF, cab: true, id: "d_china" });
F("dining", "storageChest", 3.25, 14.75, 2.45, 0.88, 0.94, { rot: PI, cab: true, bodyHide: true, id: "d_chest" });
F("dining", "servingCart", 14.7, 12.8, 1.2, 0.7, 0.9);
F("dining", "chandelier", 8.2, 8.4, 0, 0, 0, { solid: false });

// ---------- Cellar 11 × 13.2 (accusation table) ----------
F("cellar", "roundTable", 5.5, 6.6, 2.4, 2.4, 0.78);
F("cellar", "wineRack", 5.5, 0.35, 8.4, 0.6, 2.2);
F("cellar", "barrel", 10.3, 3.0, 1.12, 1.12, 1.4, { rot: -HALF, cab: true, bodyHide: true, id: "cellar_barrel_a" });
F("cellar", "barrel", 10.3, 4.5, 1.12, 1.12, 1.4, { rot: -HALF, cab: true, bodyHide: true, id: "cellar_barrel_b" });
F("cellar", "barrel", 10.4, 9.6, 0.8, 0.8, 1.0, { openBarrel: true }); F("cellar", "crate", 0.6, 11.8, 0.9, 0.9, 0.8);
F("cellar", "crate", 0.6, 2.2, 0.9, 0.9, 0.8);
F("cellar", "storageChest", 8.7, 11.85, 2.55, 0.98, 0.95, { rot: PI, cab: true, bodyHide: true, id: "cellar_chest" });
F("cellar", "wardrobe", 0.55, 9.1, 2.15, 0.82, 2.3, { rot: HALF, cab: true, bodyHide: true, id: "cellar_wardrobe" });
// Clear of the west doorway (local z 4.4-6.6): the shelf hangs on the east wall.
F("cellar", "wallShelf", 10.8, 6.8, 2.2, 0.36, 1.6, { rot: -HALF, solid: false, y: 1.1 });
export const TABLE = { ...local("cellar", 5.5, 6.6), seatR: 1.75 };

// ---------- Game room: the existing pool table plus an arcade cabinet ----------
export const POOL = (() => { const f = F("game", "billiardTable", 7.0, 5.4, 2.84, 1.6, 0.8, { pool: true, id: "pool" }); return { x: f.x, z: f.z, w: 2.54, d: 1.27, y: 0.8 }; })();
F("game", "cueRack", 13.0, 5.4, 1.4, 0.2, 1.6, { rot: -HALF });
F("game", "arcade", 12.35, 2.0, 0.9, 0.8, 1.95, { rot: -HALF });
armchair("game", 2.0, 9.1, 0); armchair("game", 4.2, 9.1, 0);
F("game", "sideTable", 3.1, 9.1, 0.6, 0.6, 0.62);
F("game", "bar", 9.6, 0.35, 2.6, 0.6, 1.05, { cab: true, id: "i_bar" });
F("game", "storageChest", 0.55, 5.75, 2.4, 0.9, 0.94, { rot: HALF, cab: true, bodyHide: true, id: "game_chest", push: { door: 8, to: local("game", 0.55, 3.3) } });
F("game", "poolLamp", 7.0, 5.4, 0, 0, 0, { solid: false });
F("game", "dartboard", 0.16, 7.0, 0.7, 0.16, 1.5, { rot: HALF, solid: false, y: 1.15 });

// ---------- Library: extended south reading alcove ----------
F("library", "bookshelf", 15.1, 5.5, 10.4, 0.55, 3.2, { rot: -HALF });
F("library", "bookshelf", 3.5, 12.9, 6.2, 0.5, 3.2, { rot: PI });
F("library", "bookshelf", 13.25, 12.9, 3.0, 0.5, 3.2, { rot: PI });
F("library", "bookshelf", 3.0, 0.3, 5.2, 0.5, 3.2, { cab: true, id: "l_shelfA" });
F("library", "bookshelf", 12.2, 0.3, 5.2, 0.5, 3.2, { cab: true, id: "l_shelfB" });
F("library", "readingTable", 8.6, 5.6, 2.4, 1.2, 0.78);
chair("library", 8.0, 6.6, PI); chair("library", 9.2, 4.6, 0);
F("library", "fireplace", 0.5, 8.8, 2.6, 0.95, 1.6, { rot: HALF, fire: "fp_library", bodyHide: true });
F("library", "storageChest", 7.65, 12.65, 2.0, 0.85, 0.9, { rot: PI, cab: true, bodyHide: true, id: "library_chest", push: { door: 18, to: local("library", 9.9, 12.65) } });
armchair("library", 2.2, 7.6, -HALF); armchair("library", 2.2, 9.9, -HALF);
F("library", "globe", 12.6, 8.4, 0.7, 0.7, 1.15);
F("library", "readingTable", 7.7, 10.6, 1.7, 0.9, 0.78);
F("library", "lamp", 11.6, 11.1, 0.5, 0.5, 1.7);

// ---------- Lounge 15.4 × 13.2, door top x 13.2–15.4 ----------
F("lounge", "fireplace", 0.4, 6.6, 2.2, 0.8, 1.5, { rot: HALF, fire: "fp_lounge", lit: true });
F("lounge", "sofa", 5.0, 6.6, 2.6, 1.0, 0.9, { rot: -HALF, seat: [{ dx: -0.75, dz: 0.1, h: 0.45 }, { dx: 0, dz: 0.1, h: 0.45 }, { dx: 0.75, dz: 0.1, h: 0.45 }], top: 0.45 });
armchair("lounge", 2.6, 3.4, 0); armchair("lounge", 5.4, 10.3, PI);
F("lounge", "coffeeTable", 2.8, 6.6, 0.75, 1.4, 0.44);
F("lounge", "cabinet", 8.0, 12.85, 2.0, 0.6, 1.1, { rot: PI, cab: true, id: "o_cabinet" });
F("lounge", "cabinet", 11.6, 0.4, 1.45, 0.55, 1.15, { cab: true, id: "lounge_side_cabinet" });
F("lounge", "bookshelf", 6.2, 0.3, 4.0, 0.5, 2.4);
F("lounge", "sideTable", 2.6, 1.9, 0.6, 0.6, 0.62);
F("lounge", "lamp", 11.8, 12.6, 0.5, 0.5, 1.7);
F("lounge", "rug", 3.0, 6.6, 3.6, 5.0, 0, { solid: false });
F("lounge", "gramophone", 9.0, 0.7, 0.6, 0.6, 1.25);

// ---------- Conference room: the center hall becomes a meeting space ----------
F("conference", "conferenceTable", 7.5, 8.1, 5.0, 1.7, 0.78);
for (const x of [5.7, 7.0, 8.3, 9.6]) { chair("conference", x, 6.7, 0, "leather"); chair("conference", x, 9.5, PI, "leather"); }
chair("conference", 4.3, 8.1, HALF, "leather"); chair("conference", 10.7, 8.1, -HALF, "leather");
F("conference", "presentationBoard", 6.6, 15.2, 3.3, 0.22, 2.25, { rot: PI, solid: false, y: 0.55 });
F("conference", "credence", 12.7, 11.8, 2.2, 0.55, 0.88, { rot: -HALF, cab: true, id: "conf_credence" });
F("conference", "filing", 15.4, 0.4, 1.2, 0.6, 1.4, { cab: true, id: "conf_filing" });
F("conference", "wardrobe", 0.55, 13.0, 2.45, 0.85, 2.4, { rot: HALF, cab: true, bodyHide: true, id: "conf_archive" });
F("conference", "rug", 7.5, 8.1, 7.5, 5.5, 0, { solid: false });
F("conference", "chandelier", 7.5, 8.1, 0, 0, 0, { solid: false });
F("hallway", "frontDoor", 7.5, 24.9, 2.2, 0.2, 2.8, { solid: true });

// ---------- Office: work surfaces, records and a visitor chair ----------
F("office", "desk", 8.2, 4.4, 2.5, 1.1, 0.78, { cab: true, id: "office_desk" });
chair("office", 8.2, 5.65, PI, "leather");
chair("office", 8.2, 2.95, 0, "leather");
F("office", "typewriter", 8.2, 4.4, 0.72, 0.42, 0.22, { solid: false, y: 0.8 });
F("office", "bookshelf", 15.1, 4.4, 6.4, 0.55, 3.2, { rot: -HALF });
F("office", "fireplace", 4.2, 8.4, 2.2, 0.8, 1.5, { rot: PI, fire: "fp_office" });
armchair("office", 4.2, 6.6, PI);
F("office", "filing", 12.0, 0.35, 1.2, 0.6, 1.4, { cab: true, id: "office_filing" });
F("office", "filing", 13.4, 0.35, 1.2, 0.6, 1.4, { cab: true, id: "office_filing_2" });
F("office", "cabinet", 15.1, 0.4, 1.2, 0.55, 1.2, { cab: true, id: "office_records" });
F("office", "wallShelf", 4.2, 0.4, 2.5, 0.32, 1.2, { solid: false, y: 1.4 });
F("office", "desk", 11.6, 8.35, 1.7, 0.8, 0.78, { rot: PI });
chair("office", 11.6, 7.45, 0, "leather");

// ---------- Hallway decor (board units) ----------
const swordKnight = F("hallway", "armor", 7.75, 0.3, 0.6, 0.5, 1.9);
swordKnight.id = "sword_knight";
F("hallway", "clock", 16.3, 0.25, 0.7, 0.5, 2.3);
F("hallway", "console", 0.25, 6.5, 1.6, 0.45, 0.86, { rot: HALF });
F("hallway", "bench", 23.75, 6.5, 1.6, 0.5, 0.5, { rot: -HALF, seat: [{ dx: -0.4, dz: 0, h: 0.48 }, { dx: 0.4, dz: 0, h: 0.48 }], top: 0.48 });
F("hallway", "roundStand", 13.0, 8.8, 0.9, 0.9, 0.8);
F("hallway", "armor", 0.3, 16.6, 0.6, 0.5, 1.9, { rot: HALF });
F("hallway", "clock", 0.25, 17.6, 0.7, 0.5, 2.3, { rot: HALF });
F("hallway", "console", 23.75, 20.45, 1.6, 0.45, 0.86, { rot: -HALF });
// Keep the palms beside the cellar and library walls, clear of the hall routes and doors.
F("hallway", "palm", 15.45, 13.4, 0.7, 0.7, 2.0);
F("hallway", "palm", 16.6, 17.55, 0.7, 0.7, 2.0);

// ---------- Waste bins (emptied every night) ----------
for (const [room, x, z] of [["kitchen", 0.5, 12.6], ["dining", 0.5, 14.8], ["office", 14.8, 8.2], ["lounge", 14.8, 12.6], ["game", 12.6, 10.4], ["conference", 12.7, 0.5], ["bathroom", 0.6, 10.4]]) {
  F(room, "bin", x, z, 0.42, 0.42, 0.62, { bin: true, id: `bin_${room}` });
}
export const BINS = FURNITURE.filter((f) => f.bin);
// Places an item can be tucked away: inside cupboards, drawers, behind books.
export const STASHES = FURNITURE.filter((f) => f.cab);
export const BODY_HIDES = FURNITURE.filter((f) => f.bodyHide);
export function stashPoint(f, k = 0.5) {
  const s = Math.sin(f.rot), c = Math.cos(f.rot);
  const along = f.type === "workbench" ? -f.w / 2 + 0.65 + (k - 0.5) * 0.42
    : (k - 0.5) * Math.max(0.2, f.w - 0.36);
  // Stashed props rest just inside the door or lid, on a real shelf or base.
  // The front offset keeps them visible and within reach after opening.
  const front = f.type === "barrel" ? 0 : Math.max(0, f.d / 2 - 0.17);
  const shelf = f.type === "storageChest" ? 0.2 : f.type === "wardrobe" ? 0.19
    : f.type === "bookshelf" ? 0.2 : f.type === "barrel" ? 0.18
    : f.type === "pantry" || f.type === "paintShelf" ? 0.61
    : ["counter", "island", "bar", "drinks"].includes(f.type) ? 0.55
    : f.type === "workbench" ? 0.45 : 0.19;
  return { x: f.x + c * along + s * front, z: f.z - s * along + c * front, y: shelf };
}

export const FURN_BY_ID = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));

// Every sittable spot: { id, fid, x, z, yaw, h }.
export const SEATS = [];
for (const f of FURNITURE) {
  if (!f.seat) continue;
  f.seat.forEach((s, i) => {
    const c = Math.cos(f.rot), sn = Math.sin(f.rot);
    // local (dx,dz) rotated by yaw
    const x = f.x + s.dx * c + s.dz * sn, z = f.z - s.dx * sn + s.dz * c;
    SEATS.push({ id: `${f.id}:${i}`, fid: f.id, room: f.room, x, z, yaw: f.rot, h: s.h });
  });
}

// Collision boxes (world AABB + height) for walkers and props.
export const SOLIDS = FURNITURE.filter((f) => f.solid !== false && f.w > 0).map((f) => ({
  id: f.id, x1: f.x - f.fw / 2, x2: f.x + f.fw / 2, z1: f.z - f.fd / 2, z2: f.z + f.fd / 2, y1: f.y || 0, y2: (f.y || 0) + f.h, top: f.top, type: f.type, push: !!f.push,
}));
// Pushable furniture: a chest that slides along its wall between its home
// and a spot in front of a door. `t` 0 = home, 1 = barricading the door.
export const PUSHABLES = FURNITURE.filter((f) => f.push).map((f) => {
  f.push.from = { x: f.x, z: f.z };
  f.push.solid = SOLIDS.find((s) => s.id === f.id);
  f.push.t = 0;
  return f;
});
export function placePushable(f, t) {
  const { from, to, solid } = f.push;
  f.push.t = t;
  f.x = from.x + (to.x - from.x) * t; f.z = from.z + (to.z - from.z) * t;
  Object.assign(solid, { x1: f.x - f.fw / 2, x2: f.x + f.fw / 2, z1: f.z - f.fd / 2, z2: f.z + f.fd / 2 });
}
// Height of the surface under (x,z), for resting props.
export function surfaceAt(x, z) {
  let top = 0;
  for (const s of SOLIDS) if (x > s.x1 && x < s.x2 && z > s.z1 && z < s.z2 && s.type !== "stairs") top = Math.max(top, s.y2);
  return top;
}

// Fixed, believable homes for weapons. The sword sits by a hallway knight.
export const WEAPON_SPOTS = {
  flashlight: local("conference", 12.7, 11.8),
  knife: local("dining", 10.1, 8.4),
  broken_pipe: local("cellar", 0.7, 9.8),
  pistol: local("office", 7.2, 4.4),
  hammer: local("kitchen", 6.0, 6.3),
  kitchen_knife: local("kitchen", 9.4, 0.35),
  rope: { ...W(6.5, 166.5), y: 0.12 },
  two_handed_sword: { ...W(7.65, 0.4), y: 1.1, yaw: Math.PI, stash: "statue:sword_knight" },
};

// Loose props: [kind, room, x, z] (room-local metres; "hallway" = board units).
const PROP_SPOTS = [
  ["pan", "kitchen", 1.6, 0.35], ["pot", "kitchen", 3.0, 0.35], ["plate", "kitchen", 4.6, 0.35], ["plate", "kitchen", 4.9, 0.4], ["cup", "kitchen", 8.0, 0.35],
  ["bottle", "kitchen", 9.6, 0.35], ["apple", "kitchen", 6.9, 6.2], ["apple", "kitchen", 7.1, 6.5], ["bread", "kitchen", 5.6, 6.6], ["jar", "kitchen", 11.0, 0.35],
  ["cup", "kitchen", 3.0, 11.3], ["candle", "kitchen", 3.5, 11.5], ["bucket", "kitchen", 11.4, 12.4],
  ["jar", "art", 8.1, 9.2], ["jar", "art", 9.3, 9.2], ["paper", "art", 10.3, 9.2], ["vase", "art", 10.4, 9.2],
  ["bottle", "bathroom", 4.0, 0.46], ["cup", "bathroom", 5.0, 0.46],
  ["plate", "dining", 5.6, 7.9], ["plate", "dining", 6.9, 7.9], ["plate", "dining", 8.2, 7.9], ["plate", "dining", 9.5, 8.9], ["plate", "dining", 10.8, 8.9],
  ["glass", "dining", 6.2, 8.1], ["glass", "dining", 9.0, 8.7], ["candle", "dining", 7.2, 8.4], ["candle", "dining", 9.2, 8.4], ["vase", "dining", 8.2, 8.4], ["bottle", "dining", 0.35, 9.4],
  ["candle", "cellar", 5.0, 6.2], ["bottle", "cellar", 3.0, 0.35], ["bottle", "cellar", 7.4, 0.35], ["lantern", "cellar", 0.6, 11.8], ["skull", "cellar", 10.4, 3.0],
  ["glass", "game", 10.4, 0.35], ["bottle", "game", 8.8, 0.35], ["ashtray", "game", 3.1, 9.1], ["cue", "game", 12.9, 5.4],
  ["book", "library", 8.0, 5.4], ["book", "library", 8.4, 5.9], ["book", "library", 9.6, 5.5], ["candle", "library", 9.4, 5.9], ["book", "library", 3.0, 0.3], ["book", "library", 12.0, 0.3], ["skull", "library", 0.4, 8.0], ["inkwell", "library", 7.6, 5.7],
  ["book", "lounge", 2.8, 7.1], ["cup", "lounge", 2.7, 6.8], ["pillow", "lounge", 4.8, 6.0], ["pillow", "lounge", 4.8, 7.2], ["log", "lounge", 0.6, 4.6], ["log", "lounge", 0.6, 4.9], ["vase", "lounge", 8.0, 12.85], ["candle", "lounge", 2.6, 1.9],
  ["paper", "conference", 5.7, 8.1], ["paper", "conference", 7.0, 8.1], ["paper", "conference", 8.3, 8.1], ["cup", "conference", 9.6, 8.1], ["box", "conference", 12.7, 11.8],
  ["book", "office", 7.5, 4.4], ["inkwell", "office", 9.1, 4.4], ["lamp", "office", 9.4, 4.4], ["glass", "office", 8.6, 4.4], ["log", "office", 2.8, 8.5], ["paper", "office", 7.8, 4.4], ["box", "office", 12.0, 0.35],
  ["vase", "hallway", 13.0, 8.8], ["candle", "hallway", 0.25, 6.2], ["book", "hallway", 0.25, 6.8], ["vase", "hallway", 23.75, 20.45],
];
export const PROP_RADIUS = {
  pan: 0.13, pot: 0.12, plate: 0.11, cup: 0.05, bottle: 0.065, apple: 0.045, bread: 0.09, jar: 0.07, candle: 0.045, bucket: 0.15, glass: 0.045,
  vase: 0.1, hat: 0.14, teapot: 0.09, book: 0.11, watering: 0.12, lantern: 0.1, skull: 0.1, ashtray: 0.07, cue: 0.07, inkwell: 0.05, pillow: 0.2,
  log: 0.1, umbrella: 0.08, lamp: 0.1, paper: 0.1, box: 0.12,
  rag: 0.07, towel: 0.09, bleach: 0.06, lens: 0.05, coin: 0.018, torch: 0.07, bandage: 0.07,
  flashlight: 0.08, knife: 0.07, broken_pipe: 0.08, pistol: 0.08, hammer: 0.08,
  kitchen_knife: 0.07, rope: 0.1, two_handed_sword: 0.13,
};
export const PROPS = PROP_SPOTS.map(([kind, room, x, z], i) => {
  const p = room === "hallway" ? W(x, z) : local(room, x, z);
  return { id: `p${i}`, kind, x: p.x, z: p.z, r: PROP_RADIUS[kind] || 0.08 };
});
