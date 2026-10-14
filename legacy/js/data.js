// Authored game data for Act I. See README: ancestries, classes, spells,
// enemies, NPC cards, quests and the deed table all live here.

export const ATTRS = ["might", "finesse", "vigor", "intellect", "instinct", "presence"];
export const ATTR_SHORT = { might: "MIG", finesse: "FIN", vigor: "VIG", intellect: "INT", instinct: "INS", presence: "PRE" };
export const mod = (score) => Math.floor((score - 10) / 2);
export const profBonus = (lvl) => 2 + Math.floor((Math.max(1, lvl) - 1) / 4);
export const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUDGET = 27;
export const XP_TABLE = [0, 0, 300, 900, 2700, 6500]; // xp needed for level n (Act I cap 5)

// ---------- Ancestries (10 × 2–3 lineages) ----------
// `look` drives the procedural rig: proportions, ears, markings and palettes.
export const ANCESTRIES = {
  valeborn: {
    name: "Vale-born", trait: "Roadwise: +2 on the first social or navigation check in a new region.",
    lineages: { hearth: "Hearth Vale", high: "High Vale" },
    look: { eyeColor: "#5a3a22", height: 1, build: 1, frame: 1, head: 1, eyes: 1, ears: "round", face: { cheek: 1, brow: 1, jaw: 1, nose: 1 }, skins: ["#e9c4a4", "#c99a7a", "#a87455", "#7a4f37", "#55392a"], hairs: ["#2b1d14", "#5a3a22", "#9b6a3a", "#d6b072", "#1a1a1a"] },
  },
  bronzeborn: {
    name: "Bronzeborn", trait: "Stone Stance: resist forced movement; +2 vs stagger.",
    lineages: { deepdelver: "Deepdelver", redridge: "Redridge" },
    look: { eyeColor: "#8a6a2a", height: 0.9, build: 1.18, frame: 1.12, head: 1.05, eyes: 0.95, ears: "round", face: { width: 1.15, length: 0.91, cheek: 1.12, brow: 1.65, jaw: 1.35, nose: 1.25, eyeSpread: 0.94 }, skins: ["#b98b62", "#9a6c48", "#7b5236", "#c79c71"], hairs: ["#3a2412", "#7a3b1c", "#a0522d", "#2a2a2a"], markings: "bronze" },
  },
  thornkin: {
    name: "Thornkin", trait: "Green Memory: identify plants; +2 vs natural poison.",
    lineages: { mossheart: "Mossheart", briarheart: "Briarheart" },
    look: { eyeColor: "#4a7a3a", height: 1.02, build: 0.95, frame: 0.94, head: 1, eyes: 1.05, ears: "pointed", face: { width: 0.91, length: 1.08, cheek: 1.2, brow: 0.88, jaw: 0.78, nose: 0.82, eyeSpread: 1.08 }, skins: ["#9fae7c", "#7d8f5c", "#b7a77e", "#6c7a4f"], hairs: ["#3f5a2a", "#6b7f2f", "#8a4f2a", "#c9a24a"], markings: "bark", hairLeaf: true },
  },
  saltborn: {
    name: "Saltborn", trait: "Tide Lungs: no slow penalty in shallow water.",
    lineages: { reefkin: "Reefkin", marshkin: "Marshkin" },
    look: { eyeColor: "#2f6a8a", height: 1.0, build: 1.0, frame: 0.98, head: 1, eyes: 1.08, ears: "fin", face: { width: 1.03, length: 1.04, depth: 0.93, cheek: 1.17, brow: 0.74, jaw: 0.82, nose: 0.68, eyeSpread: 1.12 }, skins: ["#a9c2c4", "#86a6ab", "#c7b9a3", "#6f8b91"], hairs: ["#1f3f4a", "#2f5f6a", "#d7e3e0", "#11262c"], markings: "scales" },
  },
  cindrel: {
    name: "Cindrel", trait: "Ember Skin: reduce minor fire and cold exposure.",
    lineages: { coalmarked: "Coalmarked", glassmarked: "Glassmarked" },
    look: { eyeColor: "#a03a2a", height: 1.0, build: 1.0, frame: 1.02, head: 1, eyes: 1, ears: "pointed", face: { width: 0.95, length: 1.03, depth: 1.06, cheek: 1.08, brow: 1.25, jaw: 0.95, nose: 1.18, eyeSpread: 0.98 }, skins: ["#8a5a4a", "#6e3f35", "#a9705a", "#4e2c26"], hairs: ["#1b1110", "#5a1b10", "#c0471f", "#e8a040"], markings: "embers" },
  },
  gloamling: {
    name: "Gloamling", trait: "Low-Light Sight: see detail in dim light.",
    lineages: { vaultling: "Vaultling", dusklight: "Dusklight" },
    look: { eyeColor: "#6a6a7a", height: 0.8, build: 0.95, frame: 0.85, head: 1.16, eyes: 1.4, ears: "tall", face: { width: 1.09, length: 0.86, depth: 0.9, cheek: 0.9, brow: 0.56, jaw: 0.65, nose: 0.62, eyeSpread: 1.16 }, skins: ["#b6aac6", "#958aa8", "#d2c6cf", "#7a6f8c"], hairs: ["#e8e4f0", "#4b3f66", "#22202a", "#8b7fb0"] },
  },
  skyrill: {
    name: "Skyrill", trait: "Sure Step: reduced risk on short drops and ledges.",
    lineages: { ridgewing: "Ridgewing", cloudstep: "Cloudstep" },
    look: { eyeColor: "#2f6a8a", height: 1.1, build: 0.86, frame: 0.84, head: 0.96, eyes: 1.05, ears: "pointed", face: { width: 0.85, length: 1.14, depth: 0.94, cheek: 1.22, brow: 0.7, jaw: 0.67, nose: 1.06, eyeSpread: 1.03 }, skins: ["#efd9c4", "#d9b9a0", "#c09a82", "#f3e6da"], hairs: ["#f2efe6", "#c7c2b0", "#6c8aa8", "#3b4c63"], markings: "feather" },
  },
  drakesworn: {
    name: "Drakesworn", trait: "Elemental Breath: short-range burst (recharges between fights).",
    lineages: { ashscale: "Ashscale", rimecrest: "Rimecrest", stormcrest: "Stormcrest" },
    look: { eyeColor: "#8a6a2a", height: 1.08, build: 1.12, frame: 1.1, head: 1.04, eyes: 0.95, ears: "frill", face: { width: 1.12, length: 1.13, depth: 1.15, cheek: 1.25, brow: 1.5, jaw: 1.3, nose: 0.4, eyeSpread: 1.13, muzzle: 1 }, skins: ["#8f6b4a", "#6f7f8a", "#7a5a6a", "#a08a5a"], hairs: ["#2a2420", "#5a4a3a", "#203040", "#702a2a"], markings: "scales", crest: true },
  },
  hollowed: {
    name: "Hollowed", trait: "Unquiet Sense: detect route distortions; +2 vs fear.",
    lineages: { nearwake: "Nearwake", farwake: "Farwake" },
    look: { eyeColor: "#6a6a7a", height: 1.0, build: 0.92, frame: 0.91, head: 1, eyes: 1.05, ears: "round", face: { width: 0.92, length: 1.1, depth: 0.93, cheek: 1.13, brow: 0.82, jaw: 0.72, nose: 0.9, eyeSpread: 0.98 }, skins: ["#d8d3cc", "#b9b4ae", "#a5a7ad", "#e6e0d8"], hairs: ["#e8e8e8", "#8a8a8a", "#2a2a30", "#5a6070"], markings: "veins", eyeGlow: "#9fc8ff" },
  },
  rookfolk: {
    name: "Rookfolk", trait: "Quick Exchange: swap items and interact faster.",
    lineages: { blackwing: "Blackwing", palecrest: "Palecrest" },
    look: { eyeColor: "#2a2a2a", height: 0.92, build: 0.9, frame: 0.9, head: 1.04, eyes: 1.12, ears: "tuft", face: { width: 0.94, length: 0.98, depth: 1.01, cheek: 1.16, brow: 1.18, jaw: 0.74, nose: 0.45, eyeSpread: 1.13, beak: 1 }, skins: ["#d9c1a7", "#b39274", "#8d6e55", "#e8d6c2"], hairs: ["#151518", "#2b2f3a", "#e9e4da", "#6a5a4a"], hairFeather: true },
  },
};

// ---------- Backgrounds ----------
export const BACKGROUNDS = {
  road_orphan: { name: "Road Orphan", skills: ["survival", "contacts"] },
  charter_clerk: { name: "Charter Clerk", skills: ["appraisal", "persuasion"] },
  field_medic: { name: "Field Medic", skills: ["medicine", "insight"] },
  disgraced_guard: { name: "Disgraced Guard", skills: ["intimidation", "tactics"] },
  pilgrim: { name: "Pilgrim", skills: ["rites", "insight"] },
  tunnel_scout: { name: "Tunnel Scout", skills: ["stealth", "navigation"] },
  tavern_performer: { name: "Tavern Performer", skills: ["performance", "persuasion"] },
  workshop_apprentice: { name: "Workshop Apprentice", skills: ["repair", "investigation"] },
  border_diplomat: { name: "Border Diplomat", skills: ["persuasion", "deception"] },
  hedge_naturalist: { name: "Hedge Naturalist", skills: ["tracking", "herbalism", "animal handling"] },
  debt_runner: { name: "Debt Runner", skills: ["deception", "lockwork"] },
  quiet_novice: { name: "Quiet Novice", skills: ["insight", "arcana"] },
};

// Dialogue skill → attribute.
export const SKILL_ATTR = { persuasion: "presence", intimidation: "presence", deception: "presence", insight: "instinct", "animal handling": "instinct", none: "presence" };

// ---------- Classes ----------
// Only the four Act I classes are playable; the rest are shown as planned.
export const CLASSES = {
  vanguard: {
    name: "Vanguard", die: 10, primary: ["might", "vigor"], resource: { name: "Tempo", max: 5, start: 0, color: "#e3b866" },
    prof: ["guard", "fortitude"], armour: 6, shield: 2, finCap: 1, playable: true, weapon: "blade",
    preset: { might: 15, finesse: 12, vigor: 14, intellect: 8, instinct: 10, presence: 12 },
    abilities: ["strike", "shield_bash", "cleave", "brace"],
    gear: { body: "plate", primary: "#7b8794", trim: "#c9a04a" },
  },
  reaver: { name: "Reaver", die: 12, primary: ["might", "vigor"], playable: false },
  oathkeeper: { name: "Oathkeeper", die: 10, primary: ["might", "presence"], playable: false },
  trailblazer: {
    name: "Trailblazer", die: 10, primary: ["finesse", "instinct"], resource: { name: "Aim", max: 5, start: 0, color: "#9fd36b" },
    prof: ["reflex", "guard"], armour: 3, shield: 0, finCap: 3, playable: true, weapon: "bow",
    preset: { might: 10, finesse: 15, vigor: 13, intellect: 8, instinct: 14, presence: 10 },
    abilities: ["longshot", "briar_lash", "root_snare", "pinning_shot"],
    gear: { body: "leather", primary: "#5d6b3a", trim: "#8a5a32" },
  },
  shade: { name: "Shade", die: 8, primary: ["finesse", "intellect"], playable: false },
  arcanist: {
    name: "Arcanist", die: 6, primary: ["intellect"], resource: { name: "Aether", max: 10, start: 10, color: "#6fb7ff", regen: 0.5 },
    prof: ["resolve", "reflex"], armour: 0, shield: 0, finCap: 5, playable: true, weapon: "staff", strain: true,
    preset: { might: 8, finesse: 14, vigor: 13, intellect: 15, instinct: 12, presence: 10 },
    abilities: ["spark_lance", "blue_needle", "mote_screen", "coil_cage"],
    gear: { body: "robe", primary: "#3e4a7a", trim: "#d6b56a" },
  },
  wildspeaker: { name: "Wildspeaker", die: 8, primary: ["instinct"], playable: false },
  cantor: { name: "Cantor", die: 8, primary: ["presence"], playable: false },
  lifekeeper: {
    name: "Lifekeeper", die: 8, primary: ["instinct", "presence"], resource: { name: "Grace", max: 100, start: 40, color: "#ffe39a", regen: 1 },
    prof: ["resolve", "fortitude"], armour: 4, shield: 2, finCap: 2, playable: true, weapon: "mace",
    preset: { might: 12, finesse: 10, vigor: 13, intellect: 8, instinct: 15, presence: 14 },
    abilities: ["searing_mote", "mending_word", "stitch_flesh", "sunlance"],
    gear: { body: "mail", primary: "#d9d2c0", trim: "#c9a04a" },
  },
  binder: { name: "Binder", die: 8, primary: ["presence"], playable: false },
  pugilist: { name: "Pugilist", die: 8, primary: ["finesse", "instinct"], playable: false },
  tinker: { name: "Tinker", die: 8, primary: ["intellect", "finesse"], playable: false },
};

// ---------- Abilities ----------
// kind: melee | ranged | spell (attack vs Guard) | save (target tests a defence) | heal | buff
// timing: wind-up / recovery seconds. cost: resource. gain: resource on hit.
export const ABILITIES = {
  // Vanguard
  strike: { name: "Strike", icon: "⚔", kind: "melee", attr: "might", dmg: "1d8", type: "physical", range: 2.2, windup: 0.25, recover: 0.45, gain: 1 },
  shield_bash: { name: "Shield Bash", icon: "⛨", kind: "save", specialRoll: true, def: "fortitude", attr: "might", dmg: "1d4", type: "physical", range: 2.2, windup: 0.3, recover: 0.6, cost: 2, status: { staggered: 1.6 }, cooldown: 4 },
  cleave: { name: "Cleave", icon: "☄", kind: "melee", specialRoll: true, attr: "might", dmg: "2d6", type: "physical", range: 2.8, arc: true, windup: 0.5, recover: 0.7, cost: 3, cooldown: 6 },
  brace: { name: "Brace", icon: "🛡", kind: "buff", self: true, buff: { guard: 2, dur: 6 }, windup: 0.1, recover: 0.3, cost: 1, cooldown: 8 },
  // Trailblazer
  longshot: { name: "Longbow", icon: "➶", kind: "ranged", attr: "finesse", dmg: "1d8", type: "physical", range: 30, windup: 0.5, recover: 0.6, gain: 1, projectile: "arrow" },
  briar_lash: { name: "Briar Lash", icon: "❦", kind: "spell", attr: "instinct", dmg: "1d6", type: "piercing", range: 9, windup: 0.3, recover: 0.5, pull: 1, projectile: "thorn" },
  root_snare: { name: "Root Snare", icon: "⸙", kind: "save", specialRoll: true, def: "reflex", attr: "instinct", dmg: "", type: "verdant", range: 18, aoe: 3, windup: 0.4, recover: 0.6, cost: 2, status: { slowed: 4 }, cooldown: 6 },
  pinning_shot: { name: "Pinning Shot", icon: "↯", kind: "ranged", specialRoll: true, attr: "finesse", dmg: "2d8", type: "physical", range: 30, windup: 0.7, recover: 0.7, cost: 3, status: { pinned: 2 }, projectile: "arrow", cooldown: 5 },
  // Arcanist
  spark_lance: { name: "Spark Lance", icon: "✦", kind: "spell", attr: "intellect", dmg: "1d10", type: "fire", range: 24, windup: 0.45, recover: 0.5, projectile: "fire" },
  blue_needle: { name: "Blue Needle", icon: "✧", kind: "spell", attr: "intellect", dmg: "1d6", type: "force", range: 24, windup: 0.18, recover: 0.3, cost: 1, strain: 1, projectile: "force", interrupt: true },
  mote_screen: { name: "Mote Screen", icon: "◈", kind: "buff", self: true, buff: { guard: 2, dur: 6, absorb: 1 }, windup: 0.1, recover: 0.3, cost: 2, strain: 2, cooldown: 6 },
  coil_cage: { name: "Coil Cage", icon: "◎", kind: "save", specialRoll: true, def: "reflex", attr: "intellect", dmg: "", type: "force", range: 20, windup: 0.6, recover: 0.6, cost: 3, strain: 3, status: { pinned: 3 }, minLevel: 3, cooldown: 8 },
  // Lifekeeper
  searing_mote: { name: "Searing Mote", icon: "☀", kind: "save", def: "reflex", attr: "instinct", dmg: "1d8", type: "radiant", range: 18, windup: 0.4, recover: 0.5, gain: 6 },
  mending_word: { name: "Mending Word", icon: "✚", kind: "heal", attr: "instinct", heal: "1d4", range: 18, windup: 0.2, recover: 0.4, gain: 4, cooldown: 6 },
  stitch_flesh: { name: "Stitch Flesh", icon: "❤", kind: "heal", attr: "instinct", heal: "1d8", addMod: true, range: 3, windup: 0.6, recover: 0.6, cost: 30, cooldown: 3 },
  sunlance: { name: "Sunlance", icon: "☼", kind: "spell", specialRoll: true, attr: "instinct", dmg: "2d8", type: "radiant", range: 24, windup: 0.6, recover: 0.6, cost: 35, minLevel: 3, projectile: "radiant", cooldown: 4 },
  // enemies / generic
  bite: { name: "Bite", kind: "melee", dmg: "1d4", type: "physical", range: 1.6, windup: 0.3, recover: 0.6 },
  slash: { name: "Slash", kind: "melee", dmg: "1d6", type: "physical", range: 2.1, windup: 0.4, recover: 0.7 },
  shoot: { name: "Shoot", kind: "ranged", dmg: "1d8", type: "physical", range: 22, windup: 0.7, recover: 1.0, projectile: "arrow" },
  maul: { name: "Maul", kind: "melee", dmg: "1d8", type: "physical", range: 1.9, windup: 0.35, recover: 0.6 },
  tusk_gore: { name: "Tusk Gore", kind: "melee", dmg: "1d6", type: "piercing", range: 1.9, windup: 0.4, recover: 0.75 },
  antler_rake: { name: "Antler Rake", kind: "melee", dmg: "1d8", type: "physical", range: 2.2, windup: 0.55, recover: 0.85 },
  sword: { name: "Sword", kind: "melee", dmg: "1d8", type: "physical", range: 2.2, windup: 0.4, recover: 0.6 },
  warden_slam: { name: "Slam", kind: "save", def: "reflex", dc: 14, dmg: "2d8", type: "force", range: 4.5, aoe: 4.5, windup: 1.3, recover: 1.2, telegraph: true, hold: true, cooldown: 9 },
  warden_lash: { name: "Lash", kind: "melee", dmg: "2d8", type: "physical", range: 3.2, windup: 0.6, recover: 0.8 },
  hollow_weapon: { name: "Scavenged strike", kind: "melee", dmg: "2d10", type: "physical", range: 3.4, windup: 0.55, recover: .8 },
  hollow_throw: { name: "Thrown scavenged weapon", kind: "ranged", dmg: "2d8", type: "physical", range: 13, projectile: "blade", windup: .7, recover: 1, cooldown: 5 },
  hollow_hex: { name: "Grave hex", kind: "spell", dmg: "2d6", type: "force", range: 16, projectile: "force", windup: .95, recover: 1.15, cooldown: 7, status: { slowed: 2.5 } },
};

// ---------- Enemies ----------
export const ENEMIES = {
  hollow: { name: "The Hollow", level: 4, hp: 88, guard: 15, atk: 7, dmgBonus: 4, ability: "warden_lash", special: "warden_slam", speed: 1.55, xp: 660, boss: true, defs: { reflex: 13, fortitude: 16, resolve: 15 } },
  gloam_rat: { name: "Gloam-rat", level: 1, hp: 7, guard: 11, atk: 3, dmgBonus: 0, ability: "bite", speed: 4.6, rig: "rat", xp: 25, defs: { reflex: 12, fortitude: 10, resolve: 9 } },
  brigand: { name: "Road-brigand", level: 2, hp: 16, guard: 13, atk: 4, dmgBonus: 2, ability: "slash", speed: 3.6, rig: "human", xp: 60, surrender: 0.25, defs: { reflex: 12, fortitude: 12, resolve: 11 }, look: { gear: "#5b4632", trim: "#2c241c", body: "leather" } },
  brigand_archer: { name: "Brigand archer", level: 2, hp: 12, guard: 12, atk: 4, dmgBonus: 0, ability: "shoot", speed: 3.6, rig: "human", xp: 60, ranged: true, defs: { reflex: 13, fortitude: 11, resolve: 11 }, look: { gear: "#4c5532", trim: "#2c241c", body: "leather" } },
  fen_hound: { name: "Fen-hound", level: 3, hp: 22, guard: 13, atk: 5, dmgBonus: 2, ability: "maul", speed: 5.4, rig: "hound", xp: 110, defs: { reflex: 13, fortitude: 13, resolve: 10 } },
  bristleback: { name: "Bristleback", level: 2, hp: 23, guard: 12, atk: 4, dmgBonus: 2, ability: "tusk_gore", speed: 4.1, rig: "boar", xp: 70, defs: { reflex: 10, fortitude: 14, resolve: 10 } },
  briar_stag: { name: "Briar stag", level: 3, hp: 29, guard: 13, atk: 5, dmgBonus: 2, ability: "antler_rake", speed: 5.1, rig: "stag", xp: 115, defs: { reflex: 14, fortitude: 12, resolve: 12 } },
  sellsword: { name: "Compact sellsword", level: 3, hp: 26, guard: 15, atk: 5, dmgBonus: 3, ability: "sword", speed: 3.5, rig: "human", xp: 120, block: 0.2, defs: { reflex: 12, fortitude: 14, resolve: 12 }, look: { gear: "#6a2a2a", trim: "#c9a04a", body: "plate" } },
  city_guard: { name: "City guard", level: 3, hp: 24, guard: 15, atk: 5, dmgBonus: 2, ability: "sword", speed: 4.4, rig: "human", xp: 0, block: 0.15, defs: { reflex: 12, fortitude: 14, resolve: 13 }, look: { gear: "#3a4a6a", trim: "#c9a04a", body: "plate" } },
  mire_warden: { name: "The Mire Warden", level: 5, hp: 120, guard: 15, atk: 7, dmgBonus: 4, ability: "warden_lash", special: "warden_slam", speed: 3.2, rig: "warden", xp: 900, boss: true, defs: { reflex: 12, fortitude: 16, resolve: 15 } },
  drowned_thrall: { name: "Drowned thrall", level: 2, hp: 19, guard: 12, atk: 4, dmgBonus: 1, ability: "slash", speed: 3.1, xp: 75, defs: { reflex: 10, fortitude: 13, resolve: 9 }, look: { gear: "#37505a", trim: "#83b5b4", body: "mail" } },
  ash_crawler: { name: "Ash crawler", level: 3, hp: 17, guard: 13, atk: 5, dmgBonus: 1, ability: "bite", speed: 4.5, xp: 90, defs: { reflex: 14, fortitude: 11, resolve: 8 }, look: { gear: "#4c3026", trim: "#d28152", body: "leather" } },
  root_matriarch: { name: "The Root Matriarch", level: 4, hp: 86, guard: 14, atk: 6, dmgBonus: 3, ability: "maul", special: "warden_slam", speed: 4.4, xp: 600, boss: true, defs: { reflex: 13, fortitude: 15, resolve: 13 } },
  tide_keeper: { name: "The Tide Keeper", level: 4, hp: 92, guard: 14, atk: 6, dmgBonus: 3, ability: "warden_lash", special: "warden_slam", speed: 3.2, xp: 650, boss: true, defs: { reflex: 11, fortitude: 15, resolve: 15 }, look: { gear: "#2c4b59", trim: "#8ed8d5", body: "robe" } },
  glass_smith: { name: "The Glass Smith", level: 5, hp: 108, guard: 15, atk: 7, dmgBonus: 3, ability: "sword", special: "warden_slam", speed: 3.5, xp: 750, boss: true, defs: { reflex: 12, fortitude: 16, resolve: 14 }, look: { gear: "#4d2d25", trim: "#ff9d65", body: "plate" } },
};
export const UNIQUE_MODS = {
  swift: { name: "Swift", speed: 1.5 },
  stoneskin: { name: "Stoneskin", guard: 3 },
  ember: { name: "Ember-touched", fire: true },
  frenzied: { name: "Frenzied", haste: 0.6 },
};

// ---------- Deeds (ΔM) ----------
export const DEEDS = {
  spare: { name: "Spared a surrendering enemy", dm: 6 },
  give_supplies: { name: "Gave scarce supplies to those in need", dm: 8 },
  heal_civilian: { name: "Healed a wounded civilian", dm: 3 },
  keep_promise: { name: "Kept a costly promise", dm: 5 },
  expose_lie: { name: "Exposed a lie to protect an innocent", dm: 4 },
  kill_surrendered: { name: "Killed a surrendered enemy", dm: -8 },
  threaten: { name: "Threatened someone defenceless", dm: -4 },
  steal: { name: "Stole from a civilian", dm: -3 },
  break_promise: { name: "Broke a promise for profit", dm: -6 },
  attack_civilian: { name: "Attacked a non-hostile civilian", dm: -12 },
  sell_medicine: { name: "Sold the Brightwell medicine to the Compact", dm: -15 },
  return_medicine: { name: "Returned the Brightwell medicine", dm: 15 },
  join_brigands: { name: "Swore to help the brigands profit from stolen medicine", dm: -10 },
  forgive_debt: { name: "Forgave the ferryman's debt", dm: 5 },
  collect_debt: { name: "Squeezed the ferryman for his debt", dm: -5 },
};

export const MORAL_STAGES = [
  { min: -100, max: -76, name: "Monstrous" },
  { min: -75, max: -46, name: "Dreaded" },
  { min: -45, max: -16, name: "Hardening" },
  { min: -15, max: 15, name: "Wayward" },
  { min: 16, max: 45, name: "Merciful" },
  { min: 46, max: 75, name: "Radiant" },
  { min: 76, max: 100, name: "Sainted" },
];
export const RENOWN_TITLES = [[0, "Unknown"], [300, "Noticed"], [1000, "Known"], [2500, "Respected"], [5000, "Famed"], [10000, "Legendary"]];

// ---------- Hair presets ----------
export const HAIR_STYLES = {
  bald: { name: "Bald" },
  crop: { name: "Crop", length: 0.07, volume: 0.25, curl: 0, stiff: 0.9, fringe: 0.2 },
  sidepart: { name: "Side part", length: 0.15, volume: 0.4, curl: 0.04, stiff: 0.72, fringe: 0.62, sweep: 0.85 },
  swept: { name: "Swept", length: 0.16, volume: 0.5, curl: 0.05, stiff: 0.65, fringe: 0.6, sweep: 0.7 },
  bob: { name: "Bob", length: 0.19, volume: 0.45, curl: 0.05, stiff: 0.48, fringe: 0.8 },
  layered: { name: "Layered", length: 0.31, volume: 0.48, curl: 0.14, stiff: 0.38, fringe: 0.5 },
  long: { name: "Long", length: 0.5, volume: 0.35, curl: 0.1, stiff: 0.2, fringe: 0.4 },
  waves: { name: "Waves", length: 0.39, volume: 0.55, curl: 0.42, stiff: 0.33, fringe: 0.45 },
  ponytail: { name: "Ponytail", length: 0.42, volume: 0.25, curl: 0.05, stiff: 0.3, fringe: 0.2, tie: "pony" },
  twin: { name: "Twin braids", length: 0.48, volume: 0.25, curl: 0, stiff: 0.3, fringe: 0.3, tie: "twin" },
  bun: { name: "Bun", length: 0.3, volume: 0.25, curl: 0, stiff: 0.85, fringe: 0.1, tie: "bun" },
  mohawk: { name: "Crest", length: 0.2, volume: 1.0, curl: 0, stiff: 0.95, fringe: 0, crest: true },
  curls: { name: "Curls", length: 0.2, volume: 0.9, curl: 0.85, stiff: 0.6, fringe: 0.5 },
  wild: { name: "Wild", length: 0.34, volume: 0.8, curl: 0.4, stiff: 0.35, fringe: 0.6 },
};
export const BEARD_STYLES = {
  none: { name: "None" },
  stubble: { name: "Stubble", length: 0.012, volume: 0.1, curl: 0, stiff: 1 },
  short: { name: "Short", length: 0.05, volume: 0.25, curl: 0.2, stiff: 0.8 },
  full: { name: "Full", length: 0.13, volume: 0.35, curl: 0.25, stiff: 0.45 },
  long: { name: "Long", length: 0.26, volume: 0.3, curl: 0.15, stiff: 0.25 },
};

// ---------- NPC cards ----------
// voice: TTS code. tags: allowed outcome tags. fallback: authored line + options.
export const NPCS = {
  alchemist: {
    name: "Mira Fenwick", role: "Marrowgate alchemist", shop: true, ancestry: "thornkin", city: "marrowgate", spot: "alchemy_table", voice: "en-female",
    greeting: "The table is for apprentices. Bring me moonleaf, a dusk mushroom, and wild berries; I will teach you to bind them into a healing draught.",
    personality: "Careful, dryly amused, generous with anyone willing to learn.", wants: "An apprentice who understands fresh ingredients.", never: "Lets an untrained visitor use the alchemy table.",
    secrets: "The right mixture heals without the bitterness of raw moonleaf.",
    tags: ["alchemy:start", "alchemy:skip", "alchemy:complete", "talk", "end"],
    look: { sex: .2, hair: { style: "bun", color: "#486143" }, gear: "#445947", trim: "#c7a265", body: "robe", skin: "#9fae7c" },
  },
  carver: {
    name: "Master Elian", role: "Wand carver of Marrowgate", ancestry: "hollowed", city: "marrowgate", spot: "wand_table", voice: "en-male",
    greeting: "A branch remembers how it grew. Bring me a straight stick from beyond these walls, and I will show you what it can become.",
    personality: "Patient, exacting, fascinated by how a person's choices shape magic.", wants: "To teach a worthy caster to listen to the grain.", never: "Carves a wand for someone unable to channel it.", secrets: "Every finished wand answers to one singular spell.", tags: ["talk", "end"],
    look: { sex: .8, hair: { style: "long", color: "#b8b3bb" }, beard: { style: "short", color: "#b8b3bb" }, gear: "#372e53", trim: "#b79060", body: "robe", skin: "#c6b9ae", height: 1.02 },
  },
  ilse: {
    name: "Captain Ilse Varn", role: "Marrowgate gate warden", ancestry: "valeborn", city: "marrowgate", spot: "gate", voice: "en-female", greeting: "Keep to the road and tell me what you saw. I have lost enough patrols to guesses.",
    personality: "Weary, honest, stretched thin. Respects plain speech.", wants: "The road reopened and fewer bodies in the ravines.", never: "Takes a bribe.",
    secrets: "She suspects the Compact paid the brigands at Gallowmere Watch.",
    tags: ["talk", "advance:marrowgate", "end"], look: { sex: 0.15, hair: { style: "ponytail", color: "#5a3a22" }, gear: "#4c5a6a", trim: "#b8a070", body: "plate", skin: "#c99a7a", height: 1.02 },
  },
  orrin: {
    name: "Factor Dace Orrin", role: "Meridian Compact factor", shop: true, ancestry: "valeborn", city: "marrowgate", spot: "counting", voice: "en-male", greeting: "A difficult season makes every bargain more valuable. Tell me what you need, and we may both leave satisfied.",
    personality: "Smooth, courteous, ruthless about margins. Never raises his voice.", wants: "The medicine crates, to sell to Brightwell at ten times the price.", never: "Admits the Compact hired brigands.",
    secrets: "He paid the Gallowmere brigands to 'find' the caravan.",
    tags: ["talk", "sell_medicine", "split_medicine", "deed:threaten", "end"], look: { sex: 0.85, hair: { style: "swept", color: "#9a9590" }, beard: { style: "short", color: "#9a9590" }, gear: "#3a2a4a", trim: "#d6b56a", body: "robe", skin: "#e4bd9c" },
  },
  maud: {
    name: "Elder Maud", role: "Brightwell elder", ancestry: "valeborn", city: "brightwell", spot: "green", voice: "en-female", greeting: "The sick-house needs medicine, not another promise. If you have news of the caravan, speak plainly.",
    personality: "Stubborn, warm, sharp-tongued with the powerful.", wants: "The medicine returned before more children sicken.", never: "Begs.",
    secrets: "She has already promised the village's seed grain to pay for medicine if she must.",
    tags: ["talk", "advance:brightwell", "return_medicine", "split_medicine", "deed:give_supplies", "end"], look: { sex: 0.1, hair: { style: "bun", color: "#d8d4cc" }, gear: "#6a5a3a", trim: "#9a8a6a", body: "robe", skin: "#d9b9a0", height: 0.94 },
  },
  tobin: {
    name: "Tobin", role: "Brightwell healer", ancestry: "thornkin", city: "brightwell", spot: "sick", voice: "en-male", greeting: "Mind the dust on your boots. The fever follows the road, and I have too few hands to spare.",
    personality: "Exhausted, gentle, quietly furious.", wants: "Medicine and an extra pair of hands.", never: "Turns away a patient.",
    secrets: "Greyfever spreads from the old road dust.",
    tags: ["talk", "deed:heal_civilian", "end"], look: { sex: 0.8, hair: { style: "curls", color: "#3f5a2a" }, gear: "#5a6a4a", trim: "#8a7a5a", body: "robe" },
  },
  hesper: {
    name: "Hesper", role: "Keeper of the Lantern Inn", shop: true, ancestry: "rookfolk", city: "marrowgate", spot: "inn", voice: "en-female", greeting: "A room, a rumor, or a warm fire? The Lantern has all three, though only one comes free.",
    personality: "Chatty, perceptive, collects rumors like coins.", wants: "Paying guests and good stories.", never: "Reveals who sleeps upstairs.",
    secrets: "A cartographer left an unpaid tab and a missing folio.",
    tags: ["talk", "rest", "quest:folio", "end"], look: { sex: 0.2, hair: { style: "wild", color: "#151518" }, gear: "#7a3a2a", trim: "#d9c1a7", body: "robe" },
  },
  coll: {
    name: "Coll the Ferryman", role: "Marrowgate docks ferryman", ancestry: "saltborn", city: "marrowgate", spot: "docks", voice: "en-male", greeting: "River still runs, even when the road breaks. Mind your footing if you have business with me.",
    personality: "Proud, ashamed, talks to his boat.", wants: "Time to pay a debt he owes to whoever holds it.", never: "Abandons his boat.",
    secrets: "His debt note was bought by the Compact.",
    tags: ["talk", "forgive_debt", "collect_debt", "deed:threaten", "end"], look: { sex: 0.9, hair: { style: "crop", color: "#1f3f4a" }, beard: { style: "full", color: "#1f3f4a" }, gear: "#3a4a5a", trim: "#6a5a4a", body: "leather" },
  },
  bram: {
    name: "Bram Hollis", role: "Compact deserter", ancestry: "bronzeborn", city: "gallowmere", spot: "cell", voice: "en-male", greeting: "I left the red coat behind. That is all I can say until I know what you intend to do with me.",
    personality: "Frightened, practical, honest when cornered.", wants: "To live, and to never wear Compact red again.", never: "Fights the party.",
    secrets: "He knows Orrin ordered the caravan taken.",
    tags: ["talk", "deed:spare", "deed:kill_surrendered", "recruit", "deed:expose_lie", "end"], look: { sex: 0.9, hair: { style: "crop", color: "#7a3b1c" }, beard: { style: "short", color: "#7a3b1c" }, gear: "#6a2a2a", trim: "#3a2a20", body: "leather" },
  },
  bandit_captain: {
    name: "Captain Rafe Vell", role: "Gallowmere brigand captain", ancestry: "valeborn", city: "gallowmere", voice: "en-male",
    greeting: "Hold there. Those crates belong to the people who took them, and my crew is tired of being called thieves by strangers.",
    personality: "Wary, theatrical, protective of the people under his command.", wants: "To leave Gallowmere alive and keep his crew paid.",
    never: "Admits who hired the crew without a compelling reason.", secrets: "Factor Orrin paid the crew to seize the medicine caravan.",
    tags: ["talk", "parley:persuade", "parley:intimidate", "parley:deceive", "parley:join", "parley:turncoat", "fight", "end"],
  },
  wenna: {
    name: "Wenna Ashdown", role: "Wayfinder Chapel keeper", ancestry: "hollowed", city: "marrowgate", spot: "chapel", voice: "en-female", greeting: "The Wayshrines are dark, but the road has not forgotten us. Come closer and tell me what you have seen.",
    personality: "Calm, precise, faintly amused by mortality.", wants: "The Wayshrines relit.", never: "Lies about the Unmooring.",
    secrets: "The Mire Warden was once the road's guardian spirit.",
    tags: ["talk", "rest", "heal", "end"], look: { sex: 0.15, hair: { style: "long", color: "#e8e8e8" }, gear: "#d0ccc0", trim: "#7a8aa0", body: "robe" },
  },
  // Companions (recruitable)
  edda: {
    name: "Edda Vale", role: "Ex-road guard (Vanguard, Sentinel)", ancestry: "valeborn", city: "marrowgate", spot: "inn2", voice: "en-female", companion: "vanguard", greeting: "If you have a plan, say it straight. If you have a promise, show me who it protects.",
    personality: "Practical, dryly funny, distrustful of grand promises.", wants: "Someone who protects people for their own sake.", never: "Uses civilians as a moral prop.",
    secrets: "She was scapegoated for disobeying an order to abandon a hamlet.",
    tags: ["talk", "recruit", "end"], look: { sex: 0.2, hair: { style: "bob", color: "#9b6a3a" }, gear: "#7b8794", trim: "#c9a04a", body: "plate", skin: "#c99a7a" },
  },
  oren: {
    name: "Sister Oren", role: "Gloamling Lifekeeper", ancestry: "gloamling", city: "brightwell", spot: "sick2", voice: "en-female", companion: "lifekeeper", greeting: "There are people here the sanctuaries never counted. I intend to help them anyway.",
    personality: "Kind without being submissive; uncomfortable with unearned absolution.", wants: "Medicine for the villages the sanctuaries ignore.", never: "Charges for healing.",
    secrets: "She carries the stolen sanctuary ledgers.",
    tags: ["talk", "recruit", "end"], look: { sex: 0.1, hair: { style: "twin", color: "#e8e4f0" }, gear: "#d9d2c0", trim: "#8b7fb0", body: "mail" },
  },
  tamsin: {
    name: "Tamsin", role: "Skyrill Trailblazer, Longshot", ancestry: "skyrill", city: "marrowgate", spot: "gate2", voice: "en-female", companion: "trailblazer", greeting: "Point me toward a real route and I can run it. Spare me a plan made of fog.",
    personality: "Competitive, bright, impatient with vague plans.", wants: "A route worth running and a map that tells the truth.", never: "Follows an outdated map twice.",
    secrets: "She lost a whole caravan in a whiteout.",
    tags: ["talk", "recruit", "end"], look: { sex: 0.15, hair: { style: "swept", color: "#f2efe6" }, gear: "#5d6b3a", trim: "#8a5a32", body: "leather" },
  },
  varo: {
    name: "Varo Cinder", role: "Cindrel Arcanist, Emberwright", ancestry: "cindrel", city: "marrowgate", spot: "smithy", voice: "en-male", companion: "arcanist", greeting: "I can explain the heat in that fracture. Whether I can make it safe is a harder question.",
    personality: "Curious, self-aware, easily absorbed in a problem.", wants: "To learn whether his heat-craft can be made safe.", never: "Hides a fire he started.",
    secrets: "His heat-magic once caused a deadly district fire.",
    tags: ["talk", "recruit", "end"], look: { sex: 0.85, hair: { style: "mohawk", color: "#c0471f" }, gear: "#3e4a7a", trim: "#d6b56a", body: "robe" },
  },
};

export const FALLBACK = {
  default: { line: "The road's been strange lately. Mind yourself out there.", options: [
    { text: "What's happened here?", tone: "neutral", tag: "talk" },
    { text: "Can I help with anything?", tone: "kind", tag: "talk" },
    { text: "Farewell.", tone: "leave", tag: "end" },
  ] },
};

// ---------- Quests ----------
export const QUEST_TEXT = {
  alchemy: { name: "The First Draught", steps: { open: "Gather fresh moonleaf, a dusk mushroom, and wild berries; return to Mira in Marrowgate.", done: "Alchemy learned. Use Mira's table to brew healing draughts." } },
  bitter_medicine: {
    name: "Bitter Medicine",
    steps: {
      wake: "Survive the collapse. Follow the old road to Marrowgate.",
      marrowgate: "Speak with Captain Ilse Varn at Marrowgate's gate.",
      brightwell: "Go to Brightwell and speak with Elder Maud.",
      gallowmere: "Recover the medicine crates from Gallowmere Watch.",
      choice: "Decide who receives the medicine: Elder Maud or Factor Orrin.",
      sunken: "Follow the collapse into the Sunken Mile and face what waits below.",
      done: "Act I complete. The Broken Mile is quiet — for now.",
    },
  },
  ferryman: { name: "The Ferryman's Debt", steps: { open: "Coll at the Marrowgate docks owes the Compact. Collect, or forgive.", done: "Settled." } },
  wolves: { name: "Wolves at the Well", steps: { open: "Drive off the fen-hound pack near Brightwell.", done: "The well is safe." } },
  folio: { name: "The Cartographer's Lost Folio", steps: { open: "Find the lost folio in a cache marked on Hesper's sketch.", done: "The Sunken Mile entrance is marked." } },
  shrines: { name: "A Light for the Shrine", steps: { open: "Light all four Wayshrines.", done: "All shrines burn. +1 Fortune." } },
  deserter: { name: "The Deserter", steps: { open: "A Compact deserter is held at Gallowmere Watch.", done: "His fate is decided." } },
};
