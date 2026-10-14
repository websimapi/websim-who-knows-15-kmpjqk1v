// Static game data: the mansion floor plan, guests, weapons and nine rooms.

export const CELL = 2.2;            // metres per board square (life-size mansion)
export const WALL_H = 3.6;           // storey height in metres
export const EYE = 1.62;             // first-person eye height
export const COLS = 24, ROWS = 25;

// K kitchen · B art · C bathroom · D dining · X cellar (accusation
// table) · I game · L library · O lounge · H conference · S office · . hallway
export const GRID = [
  "KKKKKK..BBBBBBBB..CCCCCC",
  "KKKKKK..BBBBBBBB..CCCCCC",
  "KKKKKK..BBBBBBBB..CCCCCC",
  "KKKKKK..BBBBBBBB..CCCCCC",
  "KKKKKK..BBBBBBBB..CCCCCC",
  "KKKKKK..BBBBBBBB..CCCCCC",
  "........BBBBBBBB........",
  "........................",
  "DDDDD.............IIIIII",
  "DDDDDDDD..........IIIIII",
  "DDDDDDDD..XXXXX...IIIIII",
  "DDDDDDDD..XXXXX...IIIIII",
  "DDDDDDDD..XXXXX...IIIIII",
  "DDDDDDDD..XXXXX.........",
  "DDDDDDDD..XXXXX..LLLLLLL",
  "..........XXXXX..LLLLLLL",
  ".................LLLLLLL",
  ".................LLLLLLL",
  "........HHHHHHHH.LLLLLLL",
  "OOOOOOO.HHHHHH...LLLLLLL",
  "OOOOOOO.HHHHHH..........",
  "OOOOOOO.HHHHHH...SSSSSSS",
  "OOOOOOO.HHHHHH...SSSSSSS",
  "OOOOOOO.HHHHHH...SSSSSSS",
  "OOOOOOO.HHHHHH...SSSSSSS",
];

// Door = room cell + the hallway cell it opens onto.
export const DOORS = [
  [2, 5, 2, 6], [8, 5, 7, 5], [15, 5, 16, 5], [9, 6, 9, 7], [14, 6, 14, 7], [18, 5, 18, 6],
  [6, 9, 6, 8], [7, 12, 8, 12], [18, 9, 17, 9], [22, 12, 22, 13], [20, 14, 20, 13], [17, 16, 16, 16],
  [6, 19, 6, 18], [11, 18, 11, 17], [12, 18, 12, 17], [15, 18, 16, 18], [13, 20, 14, 20], [17, 21, 17, 20], [21, 19, 21, 20],
  [12, 15, 12, 16], [10, 12, 9, 12],
];

// Underground tunnels: a separate grid laid out far south of the mansion
// (same world units, rows offset by DROW), reached by trapdoor + ladder.
export const DROW = 160;
export const DUNGEON = [
  "UUU##################UUU",
  "UUUUUUU##########UUUUUUU",
  "UUU###U##########U###UUU",
  "#U####U##########U####U#",
  "#U####U##########U####U#",
  "#U####U##UUUUUU##U####U#",
  "#U####UUUUUUUUU##U####U#",
  "#U#######UUUUUUUUU####U#",
  "#U#####UUUUUUUU#######U#",
  "#U#####U#####U########U#",
  "#U#####U#####U########U#",
  "UUU####U#####U#######UUU",
  "UUUUUUUU#####UUUUUUUUUUU",
  "UUU##################UUU",
];
export const DH = DUNGEON.length;
// Trapdoors: mansion cell `top` ↔ dungeon cell `bottom` (absolute rows).
export const HATCHES = [
  { id: "h_kitchen", room: "kitchen", top: [1, 1], bottom: [1, DROW + 1] },
  { id: "h_bathroom", room: "bathroom", top: [21, 1], bottom: [22, DROW + 1] },
  { id: "h_lounge", room: "lounge", top: [1, 23], bottom: [1, DROW + 12] },
  { id: "h_office", room: "office", top: [22, 23], bottom: [22, DROW + 12] },
];
// Legacy name: trapdoor pairs as passages (no longer teleports).
export const PASSAGES = [];
// Wall sconces where the four torches start (dungeon cell + wall side).
export const SCONCES = [
  { c: 0, r: DROW + 0, side: "w" }, { c: 23, r: DROW + 0, side: "e" },
  { c: 0, r: DROW + 13, side: "w" }, { c: 23, r: DROW + 13, side: "e" },
];
// Water a torch can be doused in (world metres; y = surface height).
export const WATER = [];

export const ROOMS = {
  K: { id: "kitchen", name: "Kitchen", floor: "checker", tint: "#d8d2c4", light: 0xffd9a0, weapon: [2, 3] },
  B: { id: "art", name: "Art Room", floor: "parquet", tint: "#aa775b", light: 0xffebcf, weapon: [11, 2] },
  C: { id: "bathroom", name: "Bathroom", floor: "checker", tint: "#b9cfca", light: 0xe3f5ff, weapon: [20, 2] },
  D: { id: "dining", name: "Dining Room", floor: "plank", tint: "#7a4a2c", light: 0xffcf8f, weapon: [2, 13] },
  X: { id: "cellar", name: "The Cellar", floor: "slate", tint: "#3b3530", light: 0xffb36b, weapon: null },
  I: { id: "game", name: "Game Room", floor: "carpet", tint: "#273e4f", light: 0xffe2b0, weapon: [22, 9] },
  L: { id: "library", name: "Library", floor: "plank", tint: "#5a3a26", light: 0xffd49a, weapon: [22, 17] },
  O: { id: "lounge", name: "Lounge", floor: "carpet", tint: "#7e1f26", light: 0xffc28a, weapon: [2, 21] },
  H: { id: "conference", name: "Conference Room", floor: "plank", tint: "#68513c", light: 0xffe8c0, weapon: [11, 23] },
  S: { id: "office", name: "Office", floor: "plank", tint: "#4b392e", light: 0xffd2a4, weapon: [21, 22] },
};
ROOMS.U = { id: "tunnels", name: "the tunnels", floor: "slate", tint: "#2a2622", light: null, weapon: null };
// Real rooms (where murders can happen and accusations point).
export const ROOM_LIST = Object.values(ROOMS).filter((r) => r.id !== "cellar" && r.id !== "tunnels");
export const isRoom = (id) => !!id && id !== "hallway" && id !== "cellar" && id !== "tunnels";
export const ROOM_BY_ID = Object.fromEntries(Object.values(ROOMS).map((r) => [r.id, r]));

export const SUSPECTS = [
  { id: "red", name: "Mara Vale", short: "Mara", color: "#c4162b", start: [7, 24], voice: "en-female",
    soul: "An exacting oral historian. Hears the hesitation in a story before anyone hears the words." },
  { id: "yellow", name: "Ivo Quill", short: "Ivo", color: "#d8a21c", start: [0, 17], voice: "en-male",
    soul: "A clockmaker who trusts mechanisms and records every minute in a pocket notebook." },
  { id: "white", name: "Dr. Elian Frost", short: "Elian", color: "#ece6d6", start: [7, 0], voice: "en-male",
    soul: "A rural physician who notices what the body says when its owner will not." },
  { id: "green", name: "Sera Moss", short: "Sera", color: "#2d8a4a", start: [16, 0], voice: "en-female",
    soul: "An estate surveyor who reads paths, soil, and overlooked exits with unsettling ease." },
  { id: "blue", name: "Tomas Voss", short: "Tomas", color: "#2756c8", start: [23, 6], voice: "en-male",
    soul: "A radio reporter who hears the gap between a public account and a private truth." },
  { id: "violet", name: "Leonie Vesper", short: "Leonie", color: "#7a3d9e", start: [23, 19], voice: "en-female",
    soul: "A photographic conservator who studies light, shadows, and details others dismiss." },
  { id: "copper", name: "Nessa Calder", short: "Nessa", color: "#bc7138", start: [8, 7], voice: "en-female",
    soul: "A locksmith who recognizes a forced entry by the mark it leaves behind." },
  { id: "teal", name: "Basil Reed", short: "Basil", color: "#27998f", start: [16, 16], voice: "en-male",
    soul: "A weather observer who remembers every draft, rain trace, and changing sky." },
];
export const SUSPECT_BY_ID = Object.fromEntries(SUSPECTS.map((s) => [s.id, s]));
// The house butler is not a guest: he never holds a seat, a role or a vote.
export const BUTLER = { id: "butler", name: "Mr. Grimsby", short: "Grimsby", color: "#23232b", voice: "en-male", role: "the mansion's butler",
  soul: "The mansion's butler for forty years. Impeccably polite, quietly contemptuous of the guests, and a practised liar who enjoys watching them believe him." };
SUSPECT_BY_ID.butler = BUTLER;

export const WEAPONS = [
  { id: "flashlight", name: "Flashlight", hands: 1, core: true, home: "conference" },
  { id: "knife", name: "Knife", hands: 1, core: true, home: "dining" },
  { id: "broken_pipe", name: "Broken Pipe", hands: 2, core: true, home: "cellar" },
  { id: "pistol", name: "Pistol", hands: 2, core: true, home: "office" },
  { id: "hammer", name: "Hammer", hands: 1, core: true, home: "kitchen" },
  { id: "kitchen_knife", name: "Kitchen Knife", hands: 1, core: false, home: "kitchen" },
  { id: "rope", name: "Rope", hands: 2, core: false, home: "tunnels" },
  { id: "two_handed_sword", name: "Two-Handed Sword", hands: 2, core: false, home: "hallway" },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const CORE_WEAPONS = WEAPONS.filter((w) => w.core);
export const SECONDARY_WEAPONS = WEAPONS.filter((w) => !w.core);

// Special evidence / tool items (all small enough to pocket).
export const ITEMS = {
  rag: { name: "Rag" },
  towel: { name: "Towel" },
  bleach: { name: "Bleach Spray" },
  lens: { name: "Lens of Truth" },
  coin: { name: "Lucky Coin" },
  torch: { name: "Torch" },
  bandage: { name: "Bandage" },
};
// Objects that need both hands and never fit in a pocket (or a bin).
export const BIG_KINDS = new Set([...WEAPONS.filter((w) => w.hands === 2).map((w) => w.id), "pot", "pan", "bucket", "vase", "watering", "lantern", "pillow", "log", "umbrella", "lamp", "box", "cue", "skull"]);
export const isBig = (kind) => BIG_KINDS.has(kind);
export const itemName = (kind) => WEAPON_BY_ID[kind]?.name || ITEMS[kind]?.name || String(kind || "object").replace(/_/g, " ");

export const DAY_SECONDS = 120;
export const FLICKER_SECONDS = 30;   // lights-flickering phase (killer's window)
export const DRAG_SECONDS = 15;      // how long an unconscious guest can be dragged
export const BODY_DRAG_SECONDS = 30; // each killer's daily corpse-dragging budget
export const POST_KILL_HIDE_SECONDS = 30; // survivors remain in rooms after a kill
export const BODY_SEARCH_SECONDS = 120; // time to discover an unreported body after halls reopen
export const BLEACH_SECONDS = 15;    // pour time in the one bleach bottle
export const GHOST_HOLD = 15;        // seconds a ghost may carry an object each round
export const LAST_DAY = 7;
export const CHECKLIST = 3;

// Every round is a night: 8:00 PM → midnight on the mansion clock.
export function clockLabel(t) {
  const minutes = 20 * 60 + Math.round((t / DAY_SECONDS) * 4 * 60 / 5) * 5;
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export const cellToWorld = (c, r) => ({ x: (c - COLS / 2 + 0.5) * CELL, z: (r - ROWS / 2 + 0.5) * CELL });
export const worldToCell = (x, z) => ({ c: Math.floor(x / CELL + COLS / 2), r: Math.floor(z / CELL + ROWS / 2) });
export function regionAt(c, r) {
  if (r >= DROW && r < DROW + DH && c >= 0 && c < COLS) { const ch = DUNGEON[r - DROW][c]; return ch === "U" ? "U" : null; }
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
  return GRID[r][c];
}
export const underground = (z) => z > (DROW - ROWS / 2 - 2) * CELL;
{
  const at = (c, r, rad, dx = 0, dz = 0) => { const p = cellToWorld(c, r); return { x: p.x + dx, z: p.z + dz, r: rad, y: 0 }; };
  WATER.push(at(11.5, DROW + 6.5, 1.3), at(1, DROW + 6, 0.8), at(16, DROW + 12, 0.8), at(22, DROW + 8, 0.7), at(6, DROW + 3, 0.6));
}
export function roomAtWorld(x, z) {
  const { c, r } = worldToCell(x, z);
  const ch = regionAt(c, r);
  return ch && ch !== "." ? ROOMS[ch].id : ch === "." ? "hallway" : null;
}
export const roomName = (id) => id === "hallway" ? "the hallway" : ROOM_BY_ID[id]?.name || id;
export const personName = (id) => SUSPECT_BY_ID[id]?.name || id;
export const weaponName = (id) => WEAPON_BY_ID[id]?.name || id;
