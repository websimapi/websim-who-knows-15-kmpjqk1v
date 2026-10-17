// The Unwritten Roads — backend: saves/characters in SQLite, persistent
// realms (the shared Main Realm + player-hosted realms, public or private)
// and a realtime room that runs every realm: positions, chat, server-checked
// inventories, trades and theft.

// ---------- shared rules (also imported by the browser via js/items.js) ----------
export const ITEMS = {
  healing_draught: { name: "Healing draught", glyph: "✚", color: "#c8473a", value: 12, weight: .6, heal: 8, desc: "Restores 8 health." },
  bread: { name: "Travel bread", glyph: "◒", color: "#c9973f", value: 3, weight: .35, heal: 3, desc: "Restores 3 health." },
  lockpick: { name: "Lockpick", glyph: "⚷", color: "#9a9a9a", value: 8, weight: .1, desc: "Opens locked city doors or helps with theft. Used up on an attempt." },
  lantern_oil: { name: "Lantern oil", glyph: "◍", color: "#e0a030", value: 4, weight: .7, desc: "Trade good." },
  wolf_pelt: { name: "Wolf pelt", glyph: "≋", color: "#8a7a62", value: 10, weight: 1.5, desc: "Trade good." },
  copper_trinket: { name: "Copper trinket", glyph: "✦", color: "#c87a3a", value: 6, weight: .2, desc: "Trade good." },
  silver_ring: { name: "Silver ring", glyph: "◯", color: "#d8d8e0", value: 30, weight: .05, desc: "Valuable." },
  greyfever_tonic: { name: "Greyfever tonic", glyph: "⚗", color: "#7ac8a0", value: 20, weight: .6, heal: 12, desc: "Restores 12 health." },
  road_map: { name: "Old road map", glyph: "▤", color: "#d9c9a0", value: 6, weight: .15, desc: "Trade good." },
  wild_berries: { name: "Wild berries", glyph: "●", color: "#bb3e4c", value: 3, weight: .15, heal: 2, desc: "Restores 2 health." },
  moonleaf: { name: "Moonleaf", glyph: "❧", color: "#80b978", value: 7, weight: .12, heal: 4, desc: "Restores 4 health." },
  dusk_mushroom: { name: "Dusk mushroom", glyph: "♣", color: "#c78c58", value: 5, weight: .2, heal: 3, desc: "Restores 3 health." },
  drywood: { name: "Dry wood", glyph: "⌁", color: "#ac8158", value: 2, weight: 1.2, desc: "Crafting: combine with lamp oil for a torch." },
  carving_stick: { name: "Carving stick", glyph: "╱", color: "#bd9b70", value: 0, weight: .3, desc: "A straight branch gathered on the old road. A wand carver can work it." },
  torch: { name: "Road torch", glyph: "♨", color: "#ffb458", value: 12, weight: .9, desc: "Equip to see farther in dark caves." },
  root_heart: { name: "Root heart", glyph: "❦", color: "#9dd786", value: 65, weight: 1.1, desc: "A living token of the Rootwake Den." },
  tide_pearl: { name: "Tide pearl", glyph: "◉", color: "#9fdade", value: 70, weight: .4, desc: "A memory recovered from the drowned reliquary." },
  emberglass_core: { name: "Emberglass core", glyph: "✧", color: "#f59b6c", value: 80, weight: 2.2, desc: "A furnace heart, cool enough to carry." },
  warden_seal: { name: "Warden's seal", glyph: "✥", color: "#91c9a4", value: 85, weight: .7, desc: "The old road's broken oath, now in your hands." },
  iron_sword: { name: "Iron sword", glyph: "⚔", color: "#b6c6cf", value: 34, weight: 3.1, weapon: true, slot: "weapon", model: "blade", attack: 1, desc: "An intact blade. +1 to attacks." },
  hunting_spear: { name: "Hunting spear", glyph: "♩", color: "#d4b98b", value: 24, weight: 2.5, weapon: true, slot: "weapon", model: "spear", attack: 1, desc: "A balanced spear. +1 to attacks." },
  bandit_dagger: { name: "Bandit dagger", glyph: "⟡", color: "#bac6c7", value: 15, weight: 1.0, weapon: true, slot: "weapon", model: "dagger", desc: "A serviceable short blade." },
  rusted_axe: { name: "Rusted axe", glyph: "⚒", color: "#ab9a87", value: 20, weight: 3.8, weapon: true, slot: "weapon", model: "axe", finish: "rusted", attack: 1, desc: "Heavy enough to hurt even in poor condition. +1 to attacks." },
  oak_staff: { name: "Oak staff", glyph: "♜", color: "#b1906a", value: 18, weight: 2.2, weapon: true, slot: "weapon", model: "staff", desc: "A sturdy caster's staff." },
  ash_bow: { name: "Ash bow", glyph: "⌒", color: "#c5aa7e", value: 28, weight: 1.8, weapon: true, slot: "weapon", model: "bow", attack: 1, desc: "A flexible hunting bow. +1 to attacks." },
  steel_longsword: { name: "Steel longsword", glyph: "⚔", color: "#c7d4d8", value: 58, weight: 3.2, weapon: true, slot: "weapon", model: "longsword", attack: 1, desc: "A long blade with a full, unbroken point. +1 to attacks." },
  mercenary_shortsword: { name: "Mercenary shortsword", glyph: "⚔", color: "#b7c2c5", value: 32, weight: 1.9, weapon: true, slot: "weapon", model: "shortsword", attack: 1, desc: "A quick, close-fighting blade. +1 to attacks." },
  duelist_rapier: { name: "Duelist rapier", glyph: "⚔", color: "#cbd5d7", value: 68, weight: 1.6, weapon: true, slot: "weapon", model: "rapier", attack: 1, desc: "A narrow thrusting blade with a swept guard. +1 to attacks." },
  curved_scimitar: { name: "Curved scimitar", glyph: "⚔", color: "#c7bca4", value: 52, weight: 2.2, weapon: true, slot: "weapon", model: "scimitar", attack: 1, desc: "A broad curved edge. +1 to attacks." },
  twohand_greatsword: { name: "Two-hand greatsword", glyph: "⚔", color: "#a9bbc7", value: 90, weight: 5.7, weapon: true, slot: "weapon", model: "greatsword", attack: 1, desc: "A heavy blade with an extended grip. +1 to attacks." },
  redridge_greataxe: { name: "Redridge greataxe", glyph: "⚒", color: "#b8a595", value: 85, weight: 5.9, weapon: true, slot: "weapon", model: "greataxe", attack: 1, desc: "Twin edges forged for a broad swing. +1 to attacks." },
  forged_warhammer: { name: "Forged warhammer", glyph: "⚒", color: "#aeb7b8", value: 54, weight: 3.5, weapon: true, slot: "weapon", model: "warhammer", attack: 1, desc: "A balanced hammer with a piercing pick. +1 to attacks." },
  chain_flail: { name: "Chain flail", glyph: "⚒", color: "#aeb8b7", value: 61, weight: 3.1, weapon: true, slot: "weapon", model: "flail", attack: 1, desc: "A linked iron head. +1 to attacks." },
  spiked_morningstar: { name: "Spiked morningstar", glyph: "⚒", color: "#b6b6af", value: 56, weight: 3.4, weapon: true, slot: "weapon", model: "morningstar", attack: 1, desc: "A flanged, spiked head. +1 to attacks." },
  reach_glaive: { name: "Reach glaive", glyph: "♩", color: "#bdc6c7", value: 76, weight: 5.2, weapon: true, slot: "weapon", model: "glaive", attack: 1, desc: "A long polearm with a sweeping blade. +1 to attacks." },
  watch_halberd: { name: "Watch halberd", glyph: "♩", color: "#c6c8c1", value: 82, weight: 5.8, weapon: true, slot: "weapon", model: "halberd", attack: 1, desc: "An axe, hook and spear point on one shaft. +1 to attacks." },
  tide_trident: { name: "Tide trident", glyph: "♆", color: "#97bac1", value: 73, weight: 3.8, weapon: true, slot: "weapon", model: "trident", attack: 1, desc: "Three strong tines for water or shore. +1 to attacks." },
  ash_longbow: { name: "Ash longbow", glyph: "⌒", color: "#cbaa7d", value: 65, weight: 1.9, weapon: true, slot: "weapon", model: "longbow", attack: 1, desc: "A tall stave bow. +1 to attacks." },
  ridge_recurve: { name: "Ridge recurve", glyph: "⌒", color: "#b99160", value: 62, weight: 1.6, weapon: true, slot: "weapon", model: "recurve", attack: 1, desc: "Reflexed limbs give a compact draw. +1 to attacks." },
  light_crossbow: { name: "Light crossbow", glyph: "⌒", color: "#9f8a70", value: 68, weight: 3.4, weapon: true, slot: "weapon", model: "crossbow", attack: 1, desc: "A short stock and steel bow. +1 to attacks." },
  road_shield: { name: "Road shield", glyph: "⛨", color: "#a78c68", value: 12, weight: 2.4, slot: "shield", guard: 2, desc: "A sturdy travel shield. +2 Guard when equipped." },
  iron_shield: { name: "Iron shield", glyph: "⛨", color: "#aebdc4", value: 48, weight: 3.8, slot: "shield", guard: 3, desc: "A reinforced shield. +3 Guard when equipped." },
  leather_vest: { name: "Leather vest", glyph: "▣", color: "#9e7952", value: 28, weight: 3.2, slot: "armor", body: "leather", gear: "#76573c", trim: "#a9875a", guard: 1, desc: "Road-worn protection. +1 Guard." },
  mail_coat: { name: "Mail coat", glyph: "▦", color: "#b7b9b3", value: 55, weight: 7.2, slot: "armor", body: "mail", gear: "#777d82", trim: "#c5a978", guard: 2, desc: "Interlinked rings. +2 Guard." },
  studded_leathers: { name: "Studded leathers", glyph: "▣", color: "#8f7558", value: 48, weight: 3.5, slot: "armor", body: "leather", style: "studded", gear: "#694b35", trim: "#c39b67", guard: 2, desc: "Reinforced leather with riveted panels. +2 Guard." },
  riveted_mail: { name: "Riveted mail", glyph: "▦", color: "#a9b2b5", value: 79, weight: 8.1, slot: "armor", body: "mail", style: "riveted", gear: "#596b77", trim: "#d7bb84", guard: 3, desc: "Close-linked rings under a road tabard. +3 Guard." },
  bronze_breastplate: { name: "Bronze breastplate", glyph: "▣", color: "#bfa777", value: 92, weight: 6.4, slot: "armor", body: "plate", style: "breastplate", gear: "#94794f", trim: "#dfbf7c", guard: 3, desc: "A chased bronze cuirass. +3 Guard." },
  warden_halfplate: { name: "Warden half-plate", glyph: "▣", color: "#9eafb6", value: 120, weight: 9.2, slot: "armor", body: "plate", style: "warden", gear: "#647984", trim: "#d4b877", guard: 4, desc: "Layered road-warden steel. +4 Guard." },
  scholar_robes: { name: "Scholar robes", glyph: "▣", color: "#7488a8", value: 46, weight: 1.5, slot: "armor", body: "robe", style: "scholar", gear: "#455a7c", trim: "#cbb98d", guard: 1, desc: "Woven robes with embroidered wards. +1 Guard." },
  iron_helm: { name: "Iron helm", glyph: "♜", color: "#b6c6cf", value: 32, weight: 2.1, slot: "helmet", guard: 1, helmetColor: "#8999a4", desc: "Protects the head. +1 Guard, even when hidden." },
  leather_hood: { name: "Leather hood", glyph: "◕", color: "#a18363", value: 15, weight: .8, slot: "helmet", guard: 1, helmetColor: "#76573c", desc: "A fitted hood. +1 Guard, even when hidden." },
  mail_coif: { name: "Mail coif", glyph: "◕", color: "#a3aeb3", value: 34, weight: 1.7, slot: "helmet", guard: 1, helmetColor: "#929da3", desc: "Linked rings protect the head. +1 Guard." },
  warden_sallet: { name: "Warden sallet", glyph: "♜", color: "#a6b4bc", value: 52, weight: 2.4, slot: "helmet", guard: 2, helmetColor: "#7e929e", desc: "A reinforced steel helm. +2 Guard." },
  crest_helm: { name: "Crest helm", glyph: "♜", color: "#c3b091", value: 64, weight: 2.7, slot: "helmet", guard: 2, helmetColor: "#a48b66", desc: "A chased helm with a raised crest. +2 Guard." },
  road_blade: { name: "Road blade", glyph: "⚔", color: "#aeb9bd", value: 8, weight: 1.8, weapon: true, slot: "weapon", model: "blade", finish: "worn", desc: "Your starting sword." },
  road_bow: { name: "Road bow", glyph: "⌒", color: "#bfa276", value: 8, weight: 1.2, weapon: true, slot: "weapon", model: "bow", desc: "Your starting bow." },
  road_staff: { name: "Road staff", glyph: "♜", color: "#b1906a", value: 8, weight: 1.6, weapon: true, slot: "weapon", model: "staff", desc: "Your starting staff." },
  road_mace: { name: "Road mace", glyph: "⚒", color: "#b7b2a6", value: 8, weight: 2, weapon: true, slot: "weapon", model: "mace", desc: "Your starting mace." },
  vanguard_plate: { name: "Vanguard plate", glyph: "▣", color: "#9aa8b3", value: 10, weight: 4, slot: "armor", body: "plate", desc: "Your starting armor." },
  trail_leathers: { name: "Trail leathers", glyph: "▣", color: "#9a805c", value: 10, weight: 2, slot: "armor", body: "leather", desc: "Your starting armor." },
  arcanist_robes: { name: "Arcanist robes", glyph: "▣", color: "#7886a8", value: 10, weight: 1, slot: "armor", body: "robe", desc: "Your starting robes." },
  lifekeeper_mail: { name: "Lifekeeper mail", glyph: "▦", color: "#c0b8a9", value: 10, weight: 3, slot: "armor", body: "mail", desc: "Your starting armor." },
  gloam_fang: { name: "Gloam fang", glyph: "⌁", color: "#b5ac9c", value: 3, weight: .15, desc: "A curved black tooth." },
  bone_shard: { name: "Bone shard", glyph: "⌖", color: "#b9baa7", value: 4, weight: .35, desc: "Recovered from a fallen creature." },
  boar_tusk: { name: "Boar tusk", glyph: "☽", color: "#c8bd9e", value: 9, weight: .7, desc: "A polished tusk." },
  stag_antler: { name: "Stag antler", glyph: "♆", color: "#c5af8b", value: 16, weight: 1.5, desc: "A branching trophy." },
  hollow_antler: { name: "Hollow antler", glyph: "♆", color: "#a9bbba", value: 90, weight: 2, desc: "A dreadful remnant of the night hunter." },
};
export const STARTER = { healing_draught: 2, bread: 3, lockpick: 1 };
export const STARTER_EQUIPMENT = {
  vanguard: { weapon: "road_blade", armor: "vanguard_plate", shield: "road_shield" },
  trailblazer: { weapon: "road_bow", armor: "trail_leathers" },
  arcanist: { weapon: "road_staff", armor: "arcanist_robes" },
  lifekeeper: { weapon: "road_mace", armor: "lifekeeper_mail", shield: "road_shield" },
};
export const LOOTABLE = ["bread", "lantern_oil", "wolf_pelt", "copper_trinket", "silver_ring", "road_map", "healing_draught", "lockpick", "root_heart", "tide_pearl", "emberglass_core", "warden_seal"];
export const SHOP = ["healing_draught", "bread", "lockpick", "lantern_oil", "greyfever_tonic", "road_map", "iron_sword", "steel_longsword", "mercenary_shortsword", "duelist_rapier", "curved_scimitar", "twohand_greatsword", "bandit_dagger", "rusted_axe", "redridge_greataxe", "forged_warhammer", "chain_flail", "spiked_morningstar", "hunting_spear", "reach_glaive", "watch_halberd", "tide_trident", "oak_staff", "ash_bow", "ash_longbow", "ridge_recurve", "light_crossbow", "road_shield", "iron_shield", "leather_vest", "studded_leathers", "mail_coat", "riveted_mail", "bronze_breastplate", "warden_halfplate", "scholar_robes", "iron_helm", "leather_hood", "mail_coif", "warden_sallet", "crest_helm"];
export const MAIN_REALM = { id: "MAIN", name: "The Main Realm", seed: 1337 };
export const buyPrice = (k) => Math.ceil(ITEMS[k].value * 1.5);
export const sellPrice = (k) => Math.max(1, Math.floor(ITEMS[k].value * 0.5));
export function inventoryWeight(inv) { return Object.entries(inv || {}).reduce((sum, [key, n]) => sum + (ITEMS[key]?.weight || 0) * Math.max(0, Number(n) || 0), 0); }
export function carryCapacity(sheet) {
  const ancestry = { valeborn: 1, bronzeborn: 1.18, thornkin: 1.02, saltborn: 1.03, cindrel: .98, drakesworn: 1.13, skyrill: 1.06, gloamling: .77, rookfolk: .86, hollowed: .94 }[sheet?.ancestry] || 1;
  const cls = { vanguard: 12, trailblazer: 4, lifekeeper: 6, arcanist: 0 }[sheet?.class || sheet?.cls] || 0;
  const might = Math.max(3, Math.min(20, Number(sheet?.attrs?.might) || 10));
  const vigor = Math.max(3, Math.min(20, Number(sheet?.attrs?.vigor) || 10));
  const height = Math.max(.75, Math.min(1.3, Number(sheet?.look?.height) || 1));
  const build = Math.max(.8, Math.min(1.25, Number(sheet?.look?.build) || 1));
  return Math.round((12 + might * 2 + vigor * .55 + cls) * ancestry * height * build * 10) / 10;
}
export function fitCount(inv, sheet, key, count = 1) {
  const weight = ITEMS[key]?.weight;
  if (!weight || !Number.isFinite(weight)) return 0;
  return Math.max(0, Math.min(Math.floor(count), Math.floor((carryCapacity(sheet) - inventoryWeight(inv) + 1e-6) / weight)));
}
export function shopExchange(state, sheet, buying, selling, goldOffered = null) {
  if (!buying || !selling || typeof buying !== "object" || typeof selling !== "object"
    || Array.isArray(buying) || Array.isArray(selling)) return null;
  const bought = Object.entries(buying), sold = Object.entries(selling);
  if ((!bought.length && !sold.length) || bought.length + sold.length > 80) return null;
  if (goldOffered !== null && (!Number.isSafeInteger(goldOffered) || goldOffered < 0 || goldOffered > (Number(state.gold) || 0))) return null;
  const validCount = n => Number.isSafeInteger(n) && n > 0 && n <= 99;
  if (bought.some(([k,n]) => !SHOP.includes(k) || !validCount(n))
    || sold.some(([k,n]) => !ITEMS[k] || !validCount(n)
      || n > (state.inv?.[k] || 0) - (state.equipment?.[ITEMS[k].slot] === k ? 1 : 0))) return null;
  const inv = { ...state.inv };
  let sellTotal = 0, buyTotal = 0;
  for (const [k,n] of sold) { inv[k] -= n; if (!inv[k]) delete inv[k]; sellTotal += sellPrice(k) * n; }
  for (const [k,n] of bought) { inv[k] = (inv[k] || 0) + n; buyTotal += buyPrice(k) * n; }
  const offered = goldOffered === null ? Math.max(0, buyTotal - sellTotal) : goldOffered;
  if (sellTotal + offered < buyTotal || offered > (Number(state.gold) || 0)) return null;
  const change = sellTotal + offered - buyTotal;
  const gold = (Number(state.gold) || 0) - offered + change;
  if (gold < 0 || inventoryWeight(inv) > carryCapacity(sheet) + 1e-6) return null;
  return { inv, gold, change };
}
export const HOLLOW_CAPACITY = 100000;
export function corpseLoot(kind, id) {
  let h = 2166136261;
  for (const c of `${kind}:${id}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const roll = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  const humans = ["npc", "brigand", "brigand_archer", "sellsword", "city_guard", "drowned_thrall", "mire_warden", "tide_keeper", "glass_smith"];
  const human = humans.includes(kind);
  const items = {};
  const add = (key, n = 1) => { items[key] = (items[key] || 0) + n; };
  if (human) {
    add(roll() < .43 ? "bread" : "copper_trinket");
    if (roll() < .28) add("lockpick");
  } else if (kind === "hollow") add("hollow_antler");
  else if (kind === "gloam_rat" || kind === "ash_crawler") add(kind === "gloam_rat" ? "gloam_fang" : "bone_shard", 1 + Math.floor(roll() * 2));
  else if (kind === "bristleback") add("boar_tusk");
  else if (kind === "briar_stag") add("stag_antler");
  else if (kind === "fen_hound" || kind === "root_matriarch") add("wolf_pelt");
  else add("bone_shard");
  if (kind === "root_matriarch" || kind === "tide_keeper" || kind === "glass_smith" || kind === "mire_warden") add(roll() < .5 ? "silver_ring" : "greyfever_tonic");
  return { items, gold: human ? Math.floor(roll() * 9) + 2 : 0, human };
}
export function corpseEquipment(kind, look = {}) {
  if (!["npc", "brigand", "brigand_archer", "sellsword", "city_guard", "drowned_thrall", "mire_warden", "tide_keeper", "glass_smith"].includes(kind)) return {};
  const weapons = { blade: "iron_sword", longsword: "steel_longsword", greatsword: "twohand_greatsword", shortsword: "mercenary_shortsword", rapier: "duelist_rapier", scimitar: "curved_scimitar", dagger: "bandit_dagger", axe: "rusted_axe", greataxe: "redridge_greataxe", warhammer: "forged_warhammer", mace: "road_mace", morningstar: "spiked_morningstar", flail: "chain_flail", spear: "hunting_spear", glaive: "reach_glaive", halberd: "watch_halberd", trident: "tide_trident", bow: "ash_bow", longbow: "ash_longbow", recurve: "ridge_recurve", crossbow: "light_crossbow", staff: "oak_staff" };
  const armor = { plate: kind === "city_guard" ? "warden_halfplate" : "bronze_breastplate", mail: "mail_coat", leather: "leather_vest", robe: "scholar_robes" };
  const equipped = {};
  if (weapons[look.weapon]) equipped.weapon = weapons[look.weapon];
  if (armor[look.body]) equipped.armor = armor[look.body];
  if (look.shield === true) equipped.shield = "iron_shield";
  if (look.helmet) equipped.helmet = ITEMS[look.helmet]?.slot === "helmet" ? look.helmet : "iron_helm";
  return equipped;
}
export function stripCorpseEquipment(record, key) {
  if (!record?.equipment) return;
  for (const slot of ["weapon", "shield", "armor", "helmet", "wand"]) {
    if (record.equipment[slot] === key) delete record.equipment[slot];
  }
}
const amod = (s) => Math.floor(((Number(s) || 10) - 10) / 2);
// d20 + Finesse + level (+2 lockpick) against 14 + target's Instinct + level.
// Two level-1 characters: roughly a 25-35% chance — most attempts fail.
export function stealOdds(thief, victim, pick = false) {
  const bonus = amod(thief?.attrs?.finesse) + (thief?.level || 1) + (pick ? 2 : 0);
  const dc = 14 + amod(victim?.attrs?.instinct) + (victim?.level || 1);
  const need = dc - bonus; // natural roll needed
  const chance = Math.max(0.05, Math.min(0.95, (21 - Math.max(2, need)) / 20));
  return { bonus, dc, chance };
}

// Shared deterministic horses. The same sites and coats appear in local saves
// and in every visitor's view of a realm; ownership lives only on the horse.
const HORSE_CENTERS = [[-105, 150, 1], [145, -180, 1], [-290, 190, 1], [295, 190, 1]];
const HORSE_COATS = ["#9a6745", "#ded2b8", "#514b47", "#b98c55", "#ebe1cb", "#755044", "#a88f74", "#665c54", "#c59b78"];
const HORSE_PATTERNS = ["blaze", "none", "socks", "pinto", "star", "none", "appaloosa", "blaze", "socks"];
function horseRandom(seed, salt) {
  let h = 2166136261;
  for (const c of salt) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = (Number(seed) ^ h) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function wildHorses(seed) {
  const rand = horseRandom(seed, "wild-horses");
  const horses = [];
  for (const [cx, cz, count] of HORSE_CENTERS) for (let i = 0; i < count; i++) {
    const n = horses.length, angle = rand() * Math.PI * 2, radius = count > 1 ? 4 + rand() * 7 : rand() * 12;
    const x = Math.round(cx + Math.cos(angle) * radius), z = Math.round(cz + Math.sin(angle) * radius);
    horses.push({ id: `h${n}`, x, z, home_x: x, home_z: z, coat: HORSE_COATS[n], pattern: HORSE_PATTERNS[n],
      tamed: 0, name: "", owner_user_id: null, owner_name: "", bond: 0, hp: 24, dead_until: 0, rider_user_id: null });
  }
  return horses;
}
export function startHorseFlee(horse, from, now = Date.now(), distance = 13) {
  const dx = horse.x - from.x, dz = horse.z - from.z, angle = Math.atan2(dx, dz) + (Math.random() - .5) * .42;
  horse.fleeTarget = { x: Math.max(-380, Math.min(380, horse.x + Math.sin(angle) * distance)),
    z: Math.max(-380, Math.min(380, horse.z + Math.cos(angle) * distance)) };
  horse.wanderTarget = null;
  horse.spookUntil = now + 11000;
}
export function stepWildHorse(horse, dt, now = Date.now(), players = []) {
  if (horse.tamed || horse.rider || horse.rider_user_id || horse.deadUntil > now || horse.dead_until > now) return false;
  if (horse.wanderAt == null) horse.wanderAt = now + 1500 + Math.random() * 2200;
  if (!horse.fleeTarget && now > (horse.spookUntil || 0)) {
    const nearby = players.find(p => p && Math.hypot(horse.x - p.x, horse.z - p.z) < 3.2);
    if (nearby && Math.random() < dt * .07) startHorseFlee(horse, nearby, now, 9);
  }
  if (!horse.fleeTarget && !horse.wanderTarget && now >= (horse.wanderAt || 0)) {
    const angle = Math.random() * Math.PI * 2, radius = 2.5 + Math.random() * 5;
    horse.wanderTarget = { x: Math.max(-380, Math.min(380, horse.home_x + Math.sin(angle) * radius)),
      z: Math.max(-380, Math.min(380, horse.home_z + Math.cos(angle) * radius)) };
  }
  const fleeing = !!horse.fleeTarget, target = horse.fleeTarget || horse.wanderTarget;
  if (!target) { horse.gaitSpeed = 0; return false; }
  const dx = target.x - horse.x, dz = target.z - horse.z, distance = Math.hypot(dx, dz);
  if (distance < .25) {
    horse.fleeTarget = null; horse.wanderTarget = null;
    horse.wanderAt = now + (fleeing ? 4500 : 2200) + Math.random() * 3000;
    horse.gaitSpeed = 0;
    return false;
  }
  const speed = fleeing ? 8.8 : 2.05, step = Math.min(distance, speed * Math.max(0, dt));
  horse.x += dx / distance * step; horse.z += dz / distance * step;
  horse.heading = Math.atan2(dx, dz); horse.gaitSpeed = speed;
  return step > 0;
}
export function horseStableSpots(seed) {
  const horseRandomRef = horseRandom(seed, "layout");
  const j = (v) => (horseRandomRef() * 2 - 1) * v;
  const m = { x: j(40), z: -60 + j(40) };
  const b = { x: 230 + j(40), z: j(90) };
  const g = { x: -230 + j(40), z: -80 + j(90) };
  return { marrowgate: { x: m.x + 15, z: m.z + 74 }, brightwell: { x: b.x + 48, z: b.z + 5 },
    gallowmere: { x: g.x + 54, z: g.z + 3 } };
}

export const HOUSE_LOTS = [
  { id: "marrow_door_5", name: "Weaver's Nook", x: -22, z: -41, face: "+z", price: 90, theme: "weaver" },
  { id: "marrow_door_6", name: "Apothecary Cottage", x: 22, z: -41, face: "+z", price: 115, theme: "herbalist" },
  { id: "marrow_door_7", name: "Scribe's House", x: -22, z: 41, face: "-z", price: 130, theme: "scribe" },
  { id: "marrow_door_8", name: "Copper Hearth", x: 22, z: 41, face: "-z", price: 150, theme: "merchant" },
];
export function houseLot(seed, id) {
  const lot = HOUSE_LOTS.find(x => x.id === id);
  if (!lot) return null;
  const random = horseRandom(seed, "layout");
  const j = v => (random() * 2 - 1) * v;
  const x = j(40), z = -60 + j(40);
  return { ...lot, doorX: x + lot.x, doorZ: z + lot.z + (lot.face === "+z" ? 4.62 : -4.62), agentX: x + 10, agentZ: z + 8 };
}

export const WILDLIFE = {
  cat: { name: "Cat", hp: 10, dc: 11, fighter: false },
  rat: { name: "Rat", hp: 6, dc: 9, fighter: false },
  bat: { name: "Bat", hp: 8, dc: 13, fighter: true },
  dog: { name: "Dog", hp: 18, dc: 12, fighter: true },
};
export function animalHandlingBonus(attrs, background, level = 1) {
  const instinct = Math.floor(((Number(attrs?.instinct) || 10) - 10) / 2);
  return instinct + (background === "hedge_naturalist" ? 2 + Math.floor((Math.max(1, level) - 1) / 4) : 0);
}
export function wildCreatures(seed) {
  const random = horseRandom(seed, "town-wildlife");
  const stables = horseStableSpots(seed);
  const types = ["cat", "rat", "dog", "bat"];
  const pets = [];
  for (const [site, center] of Object.entries(stables)) for (let i = 0; i < types.length; i++) {
    const angle = (site === "marrowgate" ? .4 : site === "brightwell" ? 1.9 : 3.5) + i * 2.39996 + random() * .25;
    const radius = 22 + i * 9 + random() * 5;
    const x = Math.round(center.x + Math.cos(angle) * radius), z = Math.round(center.z + Math.sin(angle) * radius);
    const kind = types[(i + (site === "brightwell" ? 1 : site === "gallowmere" ? 2 : 0)) % types.length];
    pets.push({ id: `p_${site}_${i}`, kind, x, z, homeX: x, homeZ: z, hp: WILDLIFE[kind].hp, owner: null, ownerName: "", dead: false });
  }
  return pets;
}


export const schema = `
  CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, user_id TEXT, username TEXT, name TEXT, data TEXT, updated_at INTEGER);
  CREATE TABLE IF NOT EXISTS saves (id TEXT PRIMARY KEY, user_id TEXT, character_id TEXT, seed INTEGER, data TEXT, updated_at INTEGER);
  CREATE INDEX IF NOT EXISTS saves_user ON saves (user_id);
  CREATE INDEX IF NOT EXISTS chars_user ON characters (user_id);
  CREATE TABLE IF NOT EXISTS realms (id TEXT PRIMARY KEY, user_id TEXT, username TEXT, name TEXT, visibility TEXT, pass_hash TEXT, seed INTEGER, created_at INTEGER);
  CREATE INDEX IF NOT EXISTS realms_user ON realms (user_id);
  CREATE TABLE IF NOT EXISTS realm_chars (realm_id TEXT, user_id TEXT, username TEXT, name TEXT, inv TEXT, gold INTEGER, x REAL, z REAL, bounty INTEGER DEFAULT 0, updated_at INTEGER, PRIMARY KEY (realm_id, user_id));
  CREATE TABLE IF NOT EXISTS realm_equipment (realm_id TEXT, user_id TEXT, equipment TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (realm_id, user_id));
  CREATE TABLE IF NOT EXISTS realm_pvp (realm_id TEXT, user_id TEXT, hostile INTEGER NOT NULL DEFAULT 0, skull_until INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (realm_id, user_id));
  CREATE TABLE IF NOT EXISTS realm_cave_rewards (realm_id TEXT, user_id TEXT, cave_id TEXT, PRIMARY KEY (realm_id, user_id, cave_id));
  CREATE TABLE IF NOT EXISTS realm_alchemy (realm_id TEXT, user_id TEXT, character_id TEXT, status TEXT NOT NULL DEFAULT 'locked', fresh TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (realm_id, user_id, character_id));
  CREATE TABLE IF NOT EXISTS realm_ground_items (id TEXT PRIMARY KEY, realm_id TEXT NOT NULL, user_id TEXT NOT NULL, item_key TEXT NOT NULL, x REAL NOT NULL, z REAL NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS realm_houses (realm_id TEXT NOT NULL, door_id TEXT NOT NULL, user_id TEXT, owner_slot INTEGER, character_id TEXT, owner_name TEXT, state TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL, PRIMARY KEY(realm_id,door_id));
  CREATE UNIQUE INDEX IF NOT EXISTS realm_houses_one_deed ON realm_houses(user_id,owner_slot) WHERE user_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS realm_horses (realm_id TEXT, horse_id TEXT, user_id TEXT, x REAL, z REAL, home_x REAL, home_z REAL, coat TEXT, pattern TEXT, tamed INTEGER, name TEXT, owner_user_id TEXT, owner_name TEXT, bond INTEGER, hp INTEGER, dead_until INTEGER, updated_at INTEGER, PRIMARY KEY (realm_id, horse_id));
  CREATE TABLE IF NOT EXISTS realm_horse_looks (realm_id TEXT, horse_id TEXT, user_id TEXT NOT NULL, look TEXT NOT NULL, PRIMARY KEY (realm_id, horse_id));
  CREATE TABLE IF NOT EXISTS realm_pets (realm_id TEXT, pet_id TEXT, data TEXT NOT NULL, updated_at INTEGER, PRIMARY KEY (realm_id, pet_id));
  CREATE INDEX IF NOT EXISTS realm_horses_owner ON realm_horses (owner_user_id);
  CREATE TABLE IF NOT EXISTS realm_hollows (realm_id TEXT, hollow_id TEXT, loot TEXT NOT NULL DEFAULT '{}', updated_at INTEGER, PRIMARY KEY (realm_id, hollow_id));
  CREATE TABLE IF NOT EXISTS realm_corpses (realm_id TEXT, corpse_id TEXT, user_id TEXT, data TEXT NOT NULL, updated_at INTEGER, PRIMARY KEY (realm_id, corpse_id));
  CREATE INDEX IF NOT EXISTS realm_corpses_realm ON realm_corpses (realm_id, updated_at);
  CREATE TABLE IF NOT EXISTS realm_log (id INTEGER PRIMARY KEY AUTOINCREMENT, realm_id TEXT, user_id TEXT, username TEXT, text TEXT, created_at INTEGER);
  CREATE INDEX IF NOT EXISTS realm_log_realm ON realm_log (realm_id, created_at);
  CREATE TABLE IF NOT EXISTS npc_memories (user_id TEXT, character_id TEXT, npc_key TEXT, data TEXT, updated_at INTEGER, PRIMARY KEY (user_id, character_id, npc_key));
  CREATE TABLE IF NOT EXISTS dialogue_cache (user_id TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, key));
  CREATE TABLE IF NOT EXISTS carved_wands (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, character_id TEXT NOT NULL, realm_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS carved_wands_owner ON carved_wands (user_id, character_id, realm_id);
`;

const json = (d, s = 200) => Response.json(d, { status: s });

function wandStats(level, roll, strokes) {
  const craft = Math.min(5, Math.floor(strokes.length / 5));
  return { roll, level, power: Math.max(1, Math.floor(roll / 4) + level * 2 + craft), focus: Math.max(1, Math.floor((roll + 2) / 5) + level), reach: 12 + Math.floor(roll / 5) + level * 2 };
}
async function makeWand(env, { id, cls, level, roll, path }) {
  const stats = wandStats(level, roll, path.strokes);
  const prompt = `Create one singular combat spell for a fantasy wand. The carver used ${path.wood} and these successive tools: ${path.strokes.map(s => s.tool + '@' + Math.round(s.x * 100)).join(', ')}. After carving, the wizard asked three questions. The caster answered, in order: ${path.answers.map((a, i) => `${i + 1}: ${a}`).join(' | ')}. Their class is ${cls}. Their d20 carving roll is ${roll} and level is ${level}. Make the spell reflect all three answers and the carving. Produce JSON: {"name":"2-4 evocative words","description":"one sentence about how it casts","element":"fire|force|radiant|verdant|shadow|frost","form":"dart|spiral|ring|arc|bloom","effect":"damage|slow|pin|sunder","color":"#RRGGBB"}. Be imaginative and specific. Do not use names from standard RPG spells. No prose outside JSON.`;
  const response = await env.AI.chat({ messages: [{ role: "user", content: prompt }], json: true });
  const raw = JSON.parse(response.content);
  const pick = (v, allowed, fallback) => allowed.includes(v) ? v : fallback;
  const spell = {
    id: `wand_${id.replaceAll('-', '')}`, name: String(raw.name || "Unnamed Working").slice(0, 48), description: String(raw.description || "The carved grain releases its held magic.").slice(0, 220),
    element: pick(raw.element, ["fire","force","radiant","verdant","shadow","frost"], "force"),
    form: pick(raw.form, ["dart","spiral","ring","arc","bloom"], "dart"),
    effect: pick(raw.effect, ["damage","slow","pin","sunder"], "damage"),
    color: /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : "#92bfff",
  };
  // A stable casting signature combines every branch and cut with this wand's identity.
  let signature = 2166136261;
  for (const c of JSON.stringify(path) + id) { signature ^= c.charCodeAt(0); signature = Math.imul(signature, 16777619); }
  const unit = n => ((signature >>> n) & 255) / 255;
  spell.motion = { bend: .05 + unit(0) * .42, frequency: 6 + unit(8) * 14, spin: (unit(16) - .5) * 9, speed: 18 + unit(24) * 16 };
  return { id, name: `${path.wood[0].toUpperCase()}${path.wood.slice(1)} Wand`, wood: path.wood, strokes: path.strokes, answers: path.answers, stats, spell, createdAt: Date.now() };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userId = request.headers.get("x-websim-user-id");
    const username = request.headers.get("x-websim-username") || "";
    const anon = request.headers.get("x-websim-user-is-anonymous") === "true";
    const need = () => (!userId || anon ? json({ error: "Sign in to save online" }, 401) : null);

    if (url.pathname === "/api/wand-local" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const path = body?.path;
      if (!path || !["arcanist","lifekeeper"].includes(body.cls) || !["walnut","oak","mahogany","ash","ebony"].includes(path.wood)
        || !Array.isArray(path.strokes) || path.strokes.length < 3 || path.strokes.length > 40
        || !path.strokes.every(x => ["gouge","chisel","scrape","brand","polish"].includes(x.tool) && Number.isFinite(x.x) && x.x >= 0 && x.x <= 1)
        || !Array.isArray(path.answers) || path.answers.length !== 3 || path.answers.some(x => typeof x !== "string" || x.length > 120)) return json({ error: "The carving is unfinished." }, 400);
      try {
        const wand = await makeWand(env, { id: crypto.randomUUID(), cls: body.cls, level: clampInt(body.level, 1, 5), roll: clampInt(body.roll, 1, 20), path });
        return json({ wand });
      } catch (error) { console.warn("Local wand magic failed", error); return json({ error: "The magic would not settle. Try again." }, 503); }
    }

    if (url.pathname === "/api/dialogue-cache/export" && request.method === "GET") {
      if (need()) return need();
      const after = String(url.searchParams.get("after") || "");
      if (after && !/^[0-9a-f]{64}$/.test(after)) return json({ error: "Bad cache cursor" }, 400);
      const { results } = await env.DB.prepare("SELECT key, data, updated_at FROM dialogue_cache WHERE user_id = ? AND key > ? ORDER BY key LIMIT 50")
        .bind(userId, after).all();
      return json({ entries: results.map((row) => ({ key: row.key, value: safe(row.data), updated_at: row.updated_at })), next: results.length === 50 ? results[49].key : null });
    }
    if (url.pathname === "/api/dialogue-cache" && (request.method === "GET" || request.method === "PUT")) {
      if (need()) return need();
      if (request.method === "GET") {
        const key = String(url.searchParams.get("key") || "");
        if (!/^[0-9a-f]{64}$/.test(key)) return json({ error: "Bad cache key" }, 400);
        const row = await env.DB.prepare("SELECT data FROM dialogue_cache WHERE user_id = ? AND key = ?").bind(userId, key).first();
        return row ? json({ value: safe(row.data) }) : json({ error: "Cache miss" }, 404);
      }
      const body = await request.json().catch(() => null);
      const key = String(body?.key || "");
      const value = body?.value;
      const data = JSON.stringify(value);
      if (!/^[0-9a-f]{64}$/.test(key) || !value || typeof value.npc_line !== "string" || !Array.isArray(value.options)
        || value.options.length < 2 || value.options.length > 5 || !value.options.every((option) =>
          option && typeof option.text === "string" && typeof option.tag === "string") || data.length > 12000) {
        return json({ error: "Bad dialogue cache entry" }, 400);
      }
      await env.DB.prepare("INSERT INTO dialogue_cache (user_id, key, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO NOTHING")
        .bind(userId, key, data, Date.now()).run();
      return json({ ok: true });
    }

    if (url.pathname === "/api/load" && request.method === "GET") {
      if (need()) return need();
      const { results } = await env.DB.prepare("SELECT id, character_id, seed, data, updated_at FROM saves WHERE user_id = ? ORDER BY updated_at DESC LIMIT 12").bind(userId).all();
      return json({ saves: results.map((r) => ({ id: r.id, seed: r.seed, updated_at: r.updated_at, data: safe(r.data) })) });
    }
    if (url.pathname === "/api/realm-progress" && request.method === "GET") {
      if (need()) return need();
      const characterId = String(url.searchParams.get("character") || "");
      if (!/^[a-zA-Z0-9_-]{2,48}$/.test(characterId)) return json({ error: "Bad character" }, 400);
      const rows = (await env.DB.prepare("SELECT rc.realm_id, rc.name AS character_name, rc.inv, rc.gold, rc.bounty, rc.updated_at, r.name AS realm_name, r.seed AS realm_seed, re.equipment, ra.status AS alchemy, ra.fresh AS alchemy_fresh FROM realm_chars rc LEFT JOIN realms r ON r.id = rc.realm_id LEFT JOIN realm_equipment re ON re.realm_id = rc.realm_id AND re.user_id = rc.user_id LEFT JOIN realm_alchemy ra ON ra.realm_id = rc.realm_id AND ra.user_id = rc.user_id AND ra.character_id = ? WHERE rc.user_id = ? ORDER BY rc.updated_at DESC")
        .bind(characterId, userId).all()).results;
      const realms = [];
      for (const row of rows) {
        const wands = (await env.DB.prepare("SELECT data FROM carved_wands WHERE user_id = ? AND character_id = ? AND realm_id = ? ORDER BY created_at")
          .bind(userId, characterId, row.realm_id).all()).results.map((wand) => safe(wand.data)).filter(Boolean);
        const horses = (await env.DB.prepare("SELECT h.*, l.look FROM realm_horses h LEFT JOIN realm_horse_looks l ON l.realm_id=h.realm_id AND l.horse_id=h.horse_id WHERE h.realm_id=? AND h.owner_user_id=?")
          .bind(row.realm_id, userId).all()).results.map(horse => ({ ...horse, look: safe(horse.look) || null }));
        const pets = (await env.DB.prepare("SELECT data FROM realm_pets WHERE realm_id=?")
          .bind(row.realm_id).all()).results.map(pet => safe(pet.data)).filter(pet => pet?.owner === userId);
        realms.push({ id: row.realm_id, name: row.realm_id === MAIN_REALM.id ? MAIN_REALM.name : row.realm_name || row.realm_id,
          characterName: row.character_name, inv: safe(row.inv) || {}, gold: row.gold, bounty: row.bounty,
          equipment: safe(row.equipment) || {}, alchemy: row.alchemy || "locked", alchemyFresh: safe(row.alchemy_fresh) || {},
          wands, horses, pets, updated_at: row.updated_at });
      }
      return json({ realms });
    }
    if (url.pathname === "/api/save" && request.method === "POST") {
      if (need()) return need();
      const body = await request.json().catch(() => null);
      if (!body?.id || !body?.data) return json({ error: "Bad save" }, 400);
      if (body.data.mode === "local" || body.data.onlineOrigin) return json({ error: "Local profiles cannot move into online realms" }, 400);
      const text = JSON.stringify(body.data);
      if (text.length > 2000000) return json({ error: "Save too large" }, 413);
      const now = Date.now();
      const ch = body.data.char || {};
      await env.DB.batch([
        env.DB.prepare("INSERT INTO saves (id, user_id, character_id, seed, data, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, seed = excluded.seed, updated_at = excluded.updated_at WHERE saves.user_id = excluded.user_id")
          .bind(String(body.id), userId, String(body.id), Number(body.data.seed) || 0, text, now),
        env.DB.prepare("INSERT INTO characters (id, user_id, username, name, data, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, name = excluded.name, updated_at = excluded.updated_at WHERE characters.user_id = excluded.user_id")
          .bind(String(body.id), userId, username, String(ch.name || "").slice(0, 20), JSON.stringify(ch), now),
      ]);
      return json({ ok: true, updated_at: now });
    }
    if (url.pathname === "/api/save" && request.method === "DELETE") {
      if (need()) return need();
      const id = url.searchParams.get("id");
      await env.DB.batch([
        env.DB.prepare("DELETE FROM saves WHERE id = ? AND user_id = ?").bind(id, userId),
        env.DB.prepare("DELETE FROM characters WHERE id = ? AND user_id = ?").bind(id, userId),
        env.DB.prepare("DELETE FROM npc_memories WHERE character_id = ? AND user_id = ?").bind(id, userId),
        env.DB.prepare("DELETE FROM carved_wands WHERE character_id = ? AND user_id = ?").bind(id, userId),
        env.DB.prepare("UPDATE realm_houses SET user_id=NULL,owner_slot=NULL,character_id=NULL,owner_name=NULL,state=?,updated_at=? WHERE user_id=? AND (character_id=? OR character_id=?)")
          .bind(JSON.stringify({ lootTaken: true, chest: {}, decor: [], unbarredUntil: 0 }), Date.now(), userId, id, `${id}:coop`),
      ]);
      return json({ ok: true });
    }
    const npcMemory = /^\/api\/npc-memory\/([a-z_0-9]+)\/Memory\.json$/.exec(url.pathname);
    if (npcMemory && (request.method === "GET" || request.method === "PUT")) {
      if (need()) return need();
      const npc = npcMemory[1];
      const validNpc = ["ilse", "orrin", "maud", "tobin", "hesper", "coll", "bram", "bandit_captain", "wenna", "edda", "oren", "tamsin", "varo"].includes(npc)
        || /^citizen_(?:[0-9]|1[0-5])$/.test(npc);
      const character = String(url.searchParams.get("character") || "");
      if (!validNpc || !/^[a-zA-Z0-9_-]{2,48}$/.test(character)) return json({ error: "Bad NPC memory path" }, 400);
      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT data FROM npc_memories WHERE user_id = ? AND character_id = ? AND npc_key = ?")
          .bind(userId, character, npc).first();
        return json({ memory: row ? safe(row.data) : null });
      }
      const body = await request.json().catch(() => null);
      const memory = body?.memory;
      const data = JSON.stringify(memory);
      if (!memory || memory.version !== 1 || !Array.isArray(memory.events) || memory.events.length > 12 || data.length > 24000) return json({ error: "Bad NPC memory" }, 400);
      await env.DB.prepare("INSERT INTO npc_memories (user_id, character_id, npc_key, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, character_id, npc_key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
        .bind(userId, character, npc, data, Date.now()).run();
      return json({ ok: true });
    }
    if (url.pathname === "/api/characters" && request.method === "GET") {
      if (need()) return need();
      const { results } = await env.DB.prepare("SELECT id, name, data, updated_at FROM characters WHERE user_id = ? ORDER BY updated_at DESC LIMIT 12").bind(userId).all();
      return json({ characters: results.map((r) => ({ id: r.id, name: r.name, updated_at: r.updated_at, data: safe(r.data) })) });
    }
    // ---------- realms ----------
    if (url.pathname === "/api/realms" && request.method === "GET") {
      const pub = (await env.DB.prepare("SELECT id, name, username, visibility, seed, created_at FROM realms WHERE visibility = 'public' ORDER BY created_at DESC LIMIT 40").all()).results;
      const mine = userId && !anon ? (await env.DB.prepare("SELECT id, name, username, visibility, seed, created_at FROM realms WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all()).results : [];
      return json({ main: MAIN_REALM, public: pub, mine, signedIn: !!userId && !anon });
    }
    if (url.pathname === "/api/realms/info" && request.method === "GET") {
      const id = String(url.searchParams.get("id") || "").toUpperCase();
      if (id === MAIN_REALM.id) return json({ realm: { ...MAIN_REALM, visibility: "public" } });
      const r = await env.DB.prepare("SELECT id, name, username, visibility, seed FROM realms WHERE id = ?").bind(id).first();
      return r ? json({ realm: r }) : json({ error: "No realm with that code" }, 404);
    }
    if (url.pathname === "/api/realms" && request.method === "POST") {
      if (need()) return need();
      const b = await request.json().catch(() => ({}));
      const name = String(b.name || "").trim().slice(0, 32) || username + "'s realm";
      const vis = b.visibility === "private" ? "private" : "public";
      const pass = String(b.password || "");
      if (vis === "private" && pass.length < 3) return json({ error: "Private realms need a password (3+ characters)" }, 400);
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM realms WHERE user_id = ?").bind(userId).first("n");
      if (n >= 5) return json({ error: "You can host up to 5 realms" }, 400);
      const id = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
      const seed = 100000 + Math.floor(Math.random() * 900000);
      await env.DB.prepare("INSERT INTO realms (id, user_id, username, name, visibility, pass_hash, seed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, userId, username, name, vis, vis === "private" ? await hashPass(id, pass) : null, seed, Date.now()).run();
      return json({ realm: { id, name, username, visibility: vis, seed } });
    }
    if (url.pathname === "/api/realms" && request.method === "PATCH") {
      if (need()) return need();
      const b = await request.json().catch(() => ({}));
      const r = await env.DB.prepare("SELECT * FROM realms WHERE id = ? AND user_id = ?").bind(String(b.id || ""), userId).first();
      if (!r) return json({ error: "Not your realm" }, 403);
      const vis = b.visibility === "private" ? "private" : b.visibility === "public" ? "public" : r.visibility;
      let hash = vis === "public" ? null : r.pass_hash;
      if (vis === "private" && b.password) hash = await hashPass(r.id, String(b.password));
      if (vis === "private" && !hash) return json({ error: "Set a password to make the realm private" }, 400);
      const name = b.name ? String(b.name).trim().slice(0, 32) : r.name;
      await env.DB.prepare("UPDATE realms SET name = ?, visibility = ?, pass_hash = ? WHERE id = ?").bind(name, vis, hash, r.id).run();
      return json({ ok: true, realm: { id: r.id, name, visibility: vis, seed: r.seed } });
    }
    if (url.pathname === "/api/realms" && request.method === "DELETE") {
      if (need()) return need();
      const id = String(url.searchParams.get("id") || "");
      const r = await env.DB.prepare("SELECT id FROM realms WHERE id = ? AND user_id = ?").bind(id, userId).first();
      if (!r) return json({ error: "Not your realm" }, 403);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM realms WHERE id = ?").bind(id),
        env.DB.prepare("DELETE FROM realm_chars WHERE realm_id = ?").bind(id),
        env.DB.prepare("DELETE FROM realm_horses WHERE realm_id = ?").bind(id),
        env.DB.prepare("DELETE FROM realm_horse_looks WHERE realm_id = ?").bind(id),
        env.DB.prepare("DELETE FROM realm_houses WHERE realm_id = ?").bind(id),
        env.DB.prepare("DELETE FROM realm_hollows WHERE realm_id = ?").bind(id),
        env.DB.prepare("DELETE FROM realm_corpses WHERE realm_id = ?").bind(id),
        env.DB.prepare("DELETE FROM realm_log WHERE realm_id = ?").bind(id),
      ]);
      horsesByRealm.delete(id);
      return json({ ok: true });
    }
    if (url.pathname === "/api/realms/log" && request.method === "GET") {
      const id = String(url.searchParams.get("id") || "").toUpperCase();
      if (id !== MAIN_REALM.id) {
        const r = await env.DB.prepare("SELECT visibility, user_id FROM realms WHERE id = ?").bind(id).first();
        if (!r || (r.visibility === "private" && r.user_id !== userId)) return json({ error: "Not allowed" }, 403);
      }
      const { results } = await env.DB.prepare("SELECT username, text, created_at FROM realm_log WHERE realm_id = ? ORDER BY created_at DESC LIMIT 30").bind(id).all();
      return json({ log: results });
    }
    return json({ error: "Not found" }, 404);
  },
};
async function hashPass(id, pass) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ur-realm:" + id + ":" + pass));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safe(t) { try { return JSON.parse(t); } catch { return null; } }

// ---------- realtime realms ----------
// Hot state lives in memory; inventories/gold/positions write through to realm_chars.
const players = new Map(); // conn.id → player
const trades = new Map();  // trade id → { a, b, offer: {id: {items, gold}}, ok: {id: bool}, open }
const horsesByRealm = new Map(); // realm → Map(horse id → shared horse)
let lastHorseTick = Date.now();
const petsByRealm = new Map(); // realm → Map(pet id → shared pet)
const horseAlerts = new Map(); // realm:horse:user → alert expiry
const hollowQueues = new Map(); // serialize changes to one Hollow's shared pack
async function lockHollow(realm, id) {
  const key = `${realm}:${id}`, previous = hollowQueues.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  hollowQueues.set(key, current);
  await previous;
  return () => { release(); if (hollowQueues.get(key) === current) hollowQueues.delete(key); };
}
const MAX_SPEED = 14;      // m/s, generous (sprint + lag)
const q = (v) => Math.round(v * 10) / 10;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.floor(Number(v) || 0)));
let TID = 1;

function realmPlayers(realm) { return [...players.values()].filter((p) => p.realm === realm); }
function horseView(h) { return { id: h.id, x: q(h.x), z: q(h.z), heading: h.heading || 0, gaitSpeed: h.gaitSpeed || 0,
  coat: h.coat, pattern: h.pattern, look: h.look || null,
  tamed: !!h.tamed, name: h.name || "", owner: h.owner_user_id || null, ownerName: h.owner_name || "",
  bond: h.bond || 0, hp: h.hp, deadUntil: h.dead_until || 0, rider: h.rider_user_id || null }; }
async function loadHorses(env, realm, seed) {
  if (horsesByRealm.has(realm)) return horsesByRealm.get(realm);
  let rows = (await env.DB.prepare("SELECT * FROM realm_horses WHERE realm_id = ? ORDER BY horse_id").bind(realm).all()).results;
  if (!rows.length) {
    const fresh = wildHorses(seed);
    await env.DB.batch(fresh.map((h) => env.DB.prepare("INSERT OR IGNORE INTO realm_horses (realm_id, horse_id, user_id, x, z, home_x, home_z, coat, pattern, tamed, name, owner_user_id, owner_name, bond, hp, dead_until, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, '', NULL, '', 0, 24, 0, ?)")
      .bind(realm, h.id, h.x, h.z, h.home_x, h.home_z, h.coat, h.pattern, Date.now())));
    rows = (await env.DB.prepare("SELECT * FROM realm_horses WHERE realm_id = ? ORDER BY horse_id").bind(realm).all()).results;
  }
  const map = new Map(rows.filter(row => Number(row.horse_id.slice(1)) < 4 || row.tamed || row.owner_user_id).map((row) => {
    const h = { ...row, id: row.horse_id, rider_user_id: null };
    if (h.dead_until && h.dead_until <= Date.now()) { h.dead_until = 0; h.hp = 24; h.x = h.home_x; h.z = h.home_z; }
    return [h.id, h];
  }));
  const looks = (await env.DB.prepare("SELECT horse_id, look FROM realm_horse_looks WHERE realm_id = ?").bind(realm).all()).results;
  for (const row of looks) { const horse = map.get(row.horse_id); if (horse) horse.look = safe(row.look); }
  horsesByRealm.set(realm, map);
  return map;
}
async function persistHorse(env, realm, h) {
  await env.DB.prepare("UPDATE realm_horses SET user_id = ?, x = ?, z = ?, coat = ?, pattern = ?, tamed = ?, name = ?, owner_user_id = ?, owner_name = ?, bond = ?, hp = ?, dead_until = ?, updated_at = ? WHERE realm_id = ? AND horse_id = ?")
    .bind(h.user_id, h.x, h.z, h.coat, h.pattern, h.tamed ? 1 : 0, h.name || "", h.owner_user_id, h.owner_name || "", h.bond || 0,
      h.hp, h.dead_until || 0, Date.now(), realm, h.id).run();
}
function announceHorse(room, realm, h) { room.broadcast({ type: "horse_update", realm, horse: horseView(h) }); }
async function loadPets(env, realm, seed) {
  if (petsByRealm.has(realm)) return petsByRealm.get(realm);
  const pets = new Map(wildCreatures(seed).map(p => [p.id, p]));
  const rows = (await env.DB.prepare("SELECT pet_id,data FROM realm_pets WHERE realm_id=?").bind(realm).all()).results;
  for (const row of rows) {
    const saved = safe(row.data), base = pets.get(row.pet_id);
    if (base && saved) pets.set(row.pet_id, saved.owner
      ? { ...base, ...saved, id: base.id, kind: WILDLIFE[saved.kind] ? saved.kind : base.kind }
      : { ...base, hp: saved.hp ?? base.hp, dead: !!saved.dead, id: base.id });
    else if (saved?.owner && WILDLIFE[saved.kind] && /^p_(marrowgate|brightwell|gallowmere)_[4-6]$/.test(row.pet_id)) pets.set(row.pet_id, saved);
  }
  petsByRealm.set(realm, pets);
  return pets;
}
async function persistPet(env, realm, pet) {
  await env.DB.prepare("INSERT INTO realm_pets (realm_id,pet_id,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(realm_id,pet_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at")
    .bind(realm, pet.id, JSON.stringify(pet), Date.now()).run();
}
function announcePet(room, realm, pet) { room.broadcast({ type: "pet_update", realm, pet }); }
async function releaseRider(env, room, p) {
  const h = horsesByRealm.get(p.realm)?.get(p.ridingHorse);
  if (!h || h.rider_user_id !== p.userId) return;
  h.rider_user_id = null; p.ridingHorse = null;
  await persistHorse(env, p.realm, h); announceHorse(room, p.realm, h);
}
function cleanEquipment(equipment, inv) {
  const out = { hideHelmet: !!equipment?.hideHelmet, shieldMigrated: !!equipment?.shieldMigrated };
  for (const slot of ["weapon", "shield", "armor", "helmet"]) {
    const key = equipment?.[slot];
    if (ITEMS[key]?.slot === slot && (inv?.[key] || 0) > 0) out[slot] = key;
  }
  if (typeof equipment?.wand === "string" && equipment.wand.length <= 48) out.wand = equipment.wand;
  return out;
}
function pub(p) { return { id: p.id, userId: p.userId, name: p.name, username: p.username, look: p.look, equipment: cleanEquipment(p.equipment, p.inv), cls: p.cls, level: p.level, attrs: p.attrs, bounty: p.bounty, hostile: !!p.hostile, skullUntil: skullActive(p) ? p.skullUntil : 0, x: q(p.x), y: q(p.y), z: q(p.z), ride: p.ridingHorse }; }
function send(p, msg) { try { p.conn.send(msg); } catch (e) { console.warn("send failed", e?.message); } }
function cleanInv(inv, limit = 999) {
  const out = {};
  for (const [k, n] of Object.entries(inv || {})) if (ITEMS[k] && n > 0) out[k] = clampInt(n, 0, limit);
  return out;
}
async function persist(env, p) {
  if (!p) return;
  await env.DB.prepare("UPDATE realm_chars SET inv = ?, gold = ?, x = ?, z = ?, bounty = ?, name = ?, updated_at = ? WHERE realm_id = ? AND user_id = ?")
    .bind(JSON.stringify(p.inv), p.gold, p.x, p.z, p.bounty, p.name, Date.now(), p.realm, p.userId).run();
}
async function logRealm(env, p, text) {
  await env.DB.prepare("INSERT INTO realm_log (realm_id, user_id, username, text, created_at) VALUES (?, ?, ?, ?, ?)").bind(p.realm, p.userId, p.username, text.slice(0, 200), Date.now()).run();
}
function invMsg(p, extra = {}) {
  const valid = cleanEquipment(p.equipment, p.inv);
  if (JSON.stringify(valid) !== JSON.stringify(p.equipment)) p.equipmentDirty = true;
  p.equipment = valid;
  return { type: "inv", inv: p.inv, equipment: p.equipment, gold: p.gold, bounty: p.bounty, ...extra };
}
const SKULL_MS = 7 * 60 * 1000;
const skullActive = (p, now = Date.now()) => (p.skullUntil || 0) > now;
async function persistPvp(env, p) {
  await env.DB.prepare("INSERT INTO realm_pvp (realm_id,user_id,hostile,skull_until) VALUES (?,?,?,?) ON CONFLICT(realm_id,user_id) DO UPDATE SET hostile=excluded.hostile,skull_until=excluded.skull_until")
    .bind(p.realm, p.userId, p.hostile ? 1 : 0, p.skullUntil || 0).run();
}
async function dropPlayer(env, room, p, { hollowId = null, hollowPos = null, killer = null } = {}) {
  if (p.deathPending || Date.now() - (p.deathAt || 0) < 3500) return;
  p.deathPending = true;
  const now = Date.now();
  const id = `c_${now.toString(36)}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const items = cleanInv(p.inv, 100000), gold = p.gold;
  const validHollow = /^hollow-(?:wilds|dungeon-[a-z0-9]+)(?:-[a-z0-9]+)?$/.test(hollowId || "") ? hollowId : null;
  let unlock = null;
  try {
    const wandRows = (await env.DB.prepare("SELECT id,data FROM carved_wands WHERE realm_id=? AND user_id=? AND character_id=?")
      .bind(p.realm, p.userId, p.characterId).all()).results;
    const wands = wandRows.map(row => safe(row.data)).filter(Boolean);
    unlock = validHollow ? await lockHollow(p.realm, validHollow) : null;
    let hollowUpdate = null;
    const record = { id, kind: validHollow ? "player_skeleton" : "player_body", name: `${p.name}'s body`.slice(0, 48),
      x: p.x, z: p.z, yaw: p.yaw, spawn: null, items: validHollow ? {} : items, gold: validHollow ? 0 : gold,
      wands: validHollow ? [] : wands, human: !validHollow, disturbed: true, devoured: !!validHollow,
      ownerId: p.userId, killerId: killer?.userId || null, createdAt: now, look: p.look, equipment: { ...p.equipment } };
    const updates = [];
    if (validHollow) {
      const row = await env.DB.prepare("SELECT loot FROM realm_hollows WHERE realm_id=? AND hollow_id=?").bind(p.realm, validHollow).first();
      const old = safe(row?.loot) || {}, loot = cleanInv(old, 100000);
      for (const [key, count] of Object.entries(items)) loot[key] = (loot[key] || 0) + count;
      loot.$gold = Math.min(1e12, (Number(old.$gold) || 0) + gold);
      loot.$wands = [...(old.$wands || []), ...wands];
      loot.$x = hollowPos && dist(p, hollowPos) < 15 ? hollowPos.x : p.x;
      loot.$z = hollowPos && dist(p, hollowPos) < 15 ? hollowPos.z : p.z;
      updates.push(env.DB.prepare("INSERT INTO realm_hollows (realm_id,hollow_id,loot,updated_at) VALUES (?,?,?,?) ON CONFLICT(realm_id,hollow_id) DO UPDATE SET loot=excluded.loot,updated_at=excluded.updated_at")
        .bind(p.realm, validHollow, JSON.stringify(loot), now));
      hollowUpdate = { type: "hollow_update", realm: p.realm, hollow: validHollow, hasLoot: true, gear: loot, pos: { x: loot.$x, z: loot.$z } };
    }
    updates.push(env.DB.prepare("UPDATE realm_chars SET inv='{}',gold=0,updated_at=? WHERE realm_id=? AND user_id=?").bind(now, p.realm, p.userId));
    updates.push(env.DB.prepare("UPDATE realm_equipment SET equipment=? WHERE realm_id=? AND user_id=?")
      .bind(JSON.stringify({ hideHelmet: !!p.equipment?.hideHelmet, shieldMigrated: true }), p.realm, p.userId));
    updates.push(env.DB.prepare("INSERT INTO realm_corpses (realm_id,corpse_id,user_id,data,updated_at) VALUES (?,?,?,?,?)")
      .bind(p.realm, id, p.userId, JSON.stringify(record), now));
    for (const wand of wands) updates.push(env.DB.prepare("UPDATE carved_wands SET character_id=? WHERE id=? AND user_id=?")
      .bind(`${validHollow ? 'hollow' : 'corpse'}:${validHollow || id}`, wand.id, p.userId));
    await env.DB.batch(updates);
    if (hollowUpdate) room.broadcast(hollowUpdate);
    p.inv = {}; p.gold = 0; p.equipment = { hideHelmet: !!p.equipment?.hideHelmet, shieldMigrated: true };
    p.hp = 0; p.downed = true; p.deathAt = now; p.pvpHpLock = now + 3500;
    send(p, invMsg(p));
    send(p, { type: "player_death", killer: killer?.name || null, hollow: !!validHollow });
    room.broadcast({ type: "corpse_update", realm: p.realm, corpse: record });
    room.broadcast({ type: "member", realm: p.realm, player: pub(p) }, { except: [p.id] });
  } finally { unlock?.(); p.deathPending = false; }
}
function closeTrade(t, reason) {
  if (!t) return;
  trades.delete(t.id);
  for (const id of [t.a, t.b]) { const p = players.get(id); if (p && p.trade === t.id) { p.trade = null; send(p, { type: "trade_closed", reason }); } }
}
function tradeView(t) {
  for (const id of [t.a, t.b]) {
    const p = players.get(id), other = id === t.a ? t.b : t.a;
    if (p) send(p, { type: "trade_update", tid: t.id, open: t.open, mine: t.offer[id], theirs: t.offer[other], okMine: !!t.ok[id], okTheirs: !!t.ok[other] });
  }
}
function hasOffer(p, o) {
  if (!o) return true;
  if (o.gold > p.gold) return false;
  for (const [k, n] of Object.entries(o.items)) if ((p.inv[k] || 0) - (p.equipment[ITEMS[k]?.slot] === k ? 1 : 0) < n) return false;
  return true;
}
function move(from, to, o) {
  from.gold -= o.gold; to.gold += o.gold;
  for (const [k, n] of Object.entries(o.items)) { from.inv[k] -= n; if (!from.inv[k]) delete from.inv[k]; to.inv[k] = (to.inv[k] || 0) + n; }
}
function tradeFits(receiver, outgoing, incoming) {
  const bag = { ...receiver.inv };
  for (const [k,n] of Object.entries(outgoing.items)) { bag[k] = Math.max(0,(bag[k]||0)-n); if (!bag[k]) delete bag[k]; }
  for (const [k,n] of Object.entries(incoming.items)) bag[k] = (bag[k]||0)+n;
  return inventoryWeight(bag) <= carryCapacity({ class:receiver.cls, ancestry:receiver.ancestry, attrs:receiver.attrs, look:receiver.look });
}

const HOUSE_LOOT = ["silver_ring", "lantern_oil", "lockpick", "road_map"];
const HOUSE_DECOR = new Set(["chair", "table", "shelf", "rug", "lamp", "chest"]);
function housePublic(row) {
  const state = safe(row.state) || {};
  return { id: row.door_id, ownerUserId: row.user_id || null, ownerSlot: row.owner_slot || null,
    characterId: row.character_id || null, ownerName: row.owner_name || null,
    lootTaken: !!state.lootTaken, decor: Array.isArray(state.decor) ? state.decor : [], unbarredUntil: state.unbarredUntil || 0 };
}
async function houseActor(env, me, m) {
  if (m.slot !== 2) return { slot: 1, id: me.characterId, name: me.name, inv: me.inv, gold: me.gold,
    equipment: me.equipment, sheet: { class: me.cls, ancestry: me.ancestry, attrs: me.attrs, look: me.look },
    x: me.x, z: me.z, save: async function () { me.inv = this.inv; me.gold = this.gold; await persist(env, me); me.conn.send(invMsg(me)); } };
  const id = String(m.characterId || "").slice(0, 64);
  if (!id || id === me.characterId) return null;
  const pos = m.actorPos || {};
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  if (id === `${me.characterId}:coop`) return { slot: 2, id, name: "Player 2", inv: me.inv, gold: me.gold,
    equipment: me.equipment, sheet: { class: me.cls, ancestry: me.ancestry, attrs: me.attrs, look: me.look }, x: pos.x, z: pos.z,
    save: async function () { me.inv = this.inv; me.gold = this.gold; await persist(env,me); me.conn.send(invMsg(me)); } };
  const row = await env.DB.prepare("SELECT data FROM saves WHERE id=? AND user_id=?").bind(id, me.userId).first();
  const data = safe(row?.data);
  if (!data?.char || !data?.state) return null;
  const actor = { slot: 2, id, name: String(data.char.name || "Player 2").slice(0, 24), inv: cleanInv(data.state.inv),
    gold: clampInt(data.state.gold || 0, 0, 1e7), equipment: data.state.equipment || {}, sheet: data.char,
    x: pos.x, z: pos.z };
  actor.save = async () => {
    data.state.inv = actor.inv; data.state.gold = actor.gold;
    await env.DB.prepare("UPDATE saves SET data=?,updated_at=? WHERE id=? AND user_id=?").bind(JSON.stringify(data), Date.now(), id, me.userId).run();
    me.conn.send({ type: "house_actor", slot: 2, characterId: id, inv: actor.inv, gold: actor.gold });
  };
  return actor;
}

export const room = {
  tickMs: 100,
  async onConnect(conn) {
    conn.send({ type: "hello", id: conn.id, username: conn.username || null, signedIn: conn.identity === "user" });
  },
  async onMessage(conn, raw, room, env) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    let me = players.get(conn.id);
    if (m.type === "join") {
      if (conn.identity !== "user") { conn.send({ type: "denied", reason: "Sign in to websim to play online — your inventory is saved to your account." }); return; }
      const rid = String(m.realm || MAIN_REALM.id).toUpperCase().slice(0, 8);
      let R;
      if (rid === MAIN_REALM.id) R = { ...MAIN_REALM, user_id: null, visibility: "public" };
      else {
        R = await env.DB.prepare("SELECT id, name, user_id, username, visibility, pass_hash, seed FROM realms WHERE id = ?").bind(rid).first();
        if (!R) { conn.send({ type: "denied", reason: "That realm no longer exists." }); return; }
        if (R.visibility === "private" && R.user_id !== conn.userId && (await hashPass(R.id, String(m.password || ""))) !== R.pass_hash) {
          conn.send({ type: "denied", reason: "Wrong realm password.", needPassword: true }); return;
        }
      }
      // one live presence per account per realm
      for (const p of realmPlayers(R.id)) if (p.userId === conn.userId && p.id !== conn.id) {
        closeTrade(trades.get(p.trade), "left");
        await releaseRider(env, room, p);
        await persist(env, p);
        players.delete(p.id);
        room.broadcast({ type: "left", realm: R.id, id: p.id });
      }
      if (me) { closeTrade(trades.get(me.trade), "left"); await releaseRider(env, room, me); await persist(env, me); players.delete(conn.id); room.broadcast({ type: "left", realm: me.realm, id: conn.id }); }
      const c = m.char || {};
      const name = room.censor(String(c.name || conn.username || "Wayfarer")).slice(0, 20);
      let row = await env.DB.prepare("SELECT inv, gold, x, z, bounty FROM realm_chars WHERE realm_id = ? AND user_id = ?").bind(R.id, conn.userId).first();
      const equipmentRow = await env.DB.prepare("SELECT equipment FROM realm_equipment WHERE realm_id = ? AND user_id = ?").bind(R.id, conn.userId).first();
      const pvpRow = await env.DB.prepare("SELECT hostile,skull_until FROM realm_pvp WHERE realm_id=? AND user_id=?").bind(R.id, conn.userId).first();
      const alchemyRow = await env.DB.prepare("SELECT status,fresh FROM realm_alchemy WHERE realm_id=? AND user_id=? AND character_id=?").bind(R.id, conn.userId, String(c.id || "").slice(0,48)).first();
      if (!row) {
        row = { inv: JSON.stringify(STARTER), gold: 25, x: null, z: null, bounty: 0 };
        await env.DB.prepare("INSERT INTO realm_chars (realm_id, user_id, username, name, inv, gold, x, z, bounty, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?)")
          .bind(R.id, conn.userId, conn.username, name, row.inv, 25, Date.now()).run();
      }
      let storedEquipment = safe(equipmentRow?.equipment) || {};
      if (!equipmentRow) {
        const starter = STARTER_EQUIPMENT[c.cls] || {};
        const starterInv = cleanInv(safe(row.inv) || {});
        for (const key of Object.values(starter)) if (!starterInv[key]) starterInv[key] = 1;
        row.inv = JSON.stringify(starterInv);
        storedEquipment = { ...starter, shieldMigrated: true };
        await env.DB.prepare("UPDATE realm_chars SET inv = ? WHERE realm_id = ? AND user_id = ?").bind(row.inv, R.id, conn.userId).run();
        await env.DB.prepare("INSERT INTO realm_equipment (realm_id, user_id, equipment) VALUES (?, ?, ?)").bind(R.id, conn.userId, JSON.stringify(storedEquipment)).run();
      } else if (!storedEquipment.shieldMigrated) {
        const starterShield = STARTER_EQUIPMENT[c.cls]?.shield;
        const inv = cleanInv(safe(row.inv) || {});
        if (starterShield && !storedEquipment.shield && !inv[starterShield]) {
          inv[starterShield] = 1;
          storedEquipment.shield = starterShield;
          row.inv = JSON.stringify(inv);
          await env.DB.prepare("UPDATE realm_chars SET inv = ? WHERE realm_id = ? AND user_id = ?").bind(row.inv, R.id, conn.userId).run();
        }
        storedEquipment.shieldMigrated = true;
        await env.DB.prepare("UPDATE realm_equipment SET equipment = ? WHERE realm_id = ? AND user_id = ?").bind(JSON.stringify(storedEquipment), R.id, conn.userId).run();
      }
      const attrs = {};
      for (const k of ["might", "finesse", "vigor", "intellect", "instinct", "presence"]) attrs[k] = clampInt(c.attrs?.[k] ?? 10, 3, 20);
      me = {
        id: conn.id, conn, userId: conn.userId, username: conn.username, realm: R.id, realmSeed: R.seed, characterId: String(c.id || "").slice(0,48), name, look: c.look || {}, ancestry: String(c.ancestry || "valeborn").slice(0,20), cls: String(c.cls || "").slice(0, 20),
        level: clampInt(c.level || 1, 1, 5), background: String(c.background || "").slice(0,32), attrs, inv: cleanInv(safe(row.inv) || {}), equipment: cleanEquipment(storedEquipment, cleanInv(safe(row.inv) || {})), gold: clampInt(row.gold, 0, 1e7), bounty: clampInt(row.bounty, 0, 999),
        hostile: !!pvpRow?.hostile, skullUntil: Number(pvpRow?.skull_until) > Date.now() ? Number(pvpRow.skull_until) : 0,
        x: row.x ?? (Number(m.x) || 0), y: Number(m.y) || 0, z: row.z ?? (Number(m.z) || 0), yaw: 0, hp: 1, maxHp: 1, M: 0, city: false,
        last: Date.now(), dirty: true, stealAt: 0, horseAt: 0, horseMoveAt: 0, horseBondTravel: 0, ridingHorse: null, chatAt: 0, lootGold: 40, lootAt: 0, gathered: new Set(), trade: null,
        alchemy: alchemyRow?.status || "locked", alchemyFresh: safe(alchemyRow?.fresh) || {},
      };
      players.set(conn.id, me);
      const horses = await loadHorses(env, R.id, R.seed);
      const pets = await loadPets(env, R.id, R.seed);
      const hollowRows = (await env.DB.prepare("SELECT hollow_id, loot FROM realm_hollows WHERE realm_id = ? AND loot != '{}' ORDER BY hollow_id").bind(R.id).all()).results;
      const corpses = [];
      for (let offset = 0; ; offset += 100) {
        const rows = (await env.DB.prepare("SELECT data FROM realm_corpses WHERE realm_id = ? ORDER BY updated_at LIMIT 100 OFFSET ?").bind(R.id,offset).all()).results;
        corpses.push(...rows.map(row => safe(row.data)).filter(Boolean));
        if (rows.length < 100) break;
      }
      const wandRows = (await env.DB.prepare("SELECT data FROM carved_wands WHERE user_id = ? AND character_id = ? AND realm_id = ? ORDER BY created_at").bind(me.userId, me.characterId, R.id).all()).results;
      const groundRows = (await env.DB.prepare("SELECT id,item_key,x,z FROM realm_ground_items WHERE realm_id=? ORDER BY created_at DESC LIMIT 200").bind(R.id).all()).results;
      const houseRows = (await env.DB.prepare("SELECT * FROM realm_houses WHERE realm_id=?").bind(R.id).all()).results;
      if (me.equipment.wand && !wandRows.some(row => safe(row.data)?.id === me.equipment.wand)) delete me.equipment.wand;
      conn.send({ type: "joined", realm: { id: R.id, name: R.name, seed: R.seed, owner: R.user_id === conn.userId, host: R.username || null, visibility: R.visibility }, id: conn.id,
        members: realmPlayers(R.id).filter((p) => p.id !== conn.id).map(pub), inv: me.inv, equipment: me.equipment, gold: me.gold, bounty: me.bounty, hostile: me.hostile, skullUntil: me.skullUntil, pos: row.x == null ? null : { x: row.x, z: row.z },
        horses: [...horses.values()].map(horseView), pets: [...pets.values()], hollowLootIds: hollowRows.map((h) => h.hollow_id), hollowGear: Object.fromEntries(hollowRows.map(h => [h.hollow_id, safe(h.loot) || {}])), corpses: corpses.slice(0, 25), wands: wandRows.map(row => safe(row.data)).filter(Boolean), groundItems: groundRows.map(row => ({ id: row.id, key: row.item_key, x: row.x, z: row.z })), houses: houseRows.map(housePublic), alchemy: me.alchemy, alchemyFresh: me.alchemyFresh, userId: me.userId });
      for (let i = 25; i < corpses.length; i += 25) conn.send({ type: "corpse_snapshot", corpses: corpses.slice(i,i+25) });
      room.broadcast({ type: "member", realm: R.id, player: pub(me) }, { except: [conn.id] });
      return;
    }
    if (!me) return;
    const R = me.realm;
    const target = () => { const t = players.get(String(m.to || "")); return t && t.realm === R && t.id !== me.id ? t : null; };
    const sheet = { class: me.cls, ancestry: me.ancestry, attrs: me.attrs, look: me.look };
    if (m.type === "house_action") {
      const request = String(m.request || "").slice(0, 60), id = String(m.door || "");
      const lot = houseLot(me.realmSeed, id);
      const reply = (extra) => conn.send({ type: "house_result", request, door: id, ...extra });
      if (!lot) { reply({ reason: "That is not a registered property." }); return; }
      const actor = await houseActor(env, me, m);
      if (!actor) { reply({ reason: "This character cannot hold a deed here." }); return; }
      const nearDoor = Math.hypot(actor.x - lot.doorX, actor.z - lot.doorZ) <= 4.5;
      const nearAgent = Math.hypot(actor.x - lot.agentX, actor.z - lot.agentZ) <= 4.5;
      const insideKey = actor.slot === 2 ? "coopInsideHouse" : "insideHouse";
      const inside = me[insideKey] === id;
      let row = await env.DB.prepare("SELECT * FROM realm_houses WHERE realm_id=? AND door_id=?").bind(R,id).first();
      if (!row) {
        await env.DB.prepare("INSERT OR IGNORE INTO realm_houses (realm_id,door_id,state,updated_at) VALUES (?,?,?,?)").bind(R,id,"{}",Date.now()).run();
        row = await env.DB.prepare("SELECT * FROM realm_houses WHERE realm_id=? AND door_id=?").bind(R,id).first();
      }
      const state = safe(row.state) || {};
      state.chest ||= {};
      state.decor ||= [];
      const owner = row.user_id === me.userId && row.character_id === actor.id && row.owner_slot === actor.slot;
      const publish = async () => {
        await env.DB.prepare("UPDATE realm_houses SET state=?,updated_at=? WHERE realm_id=? AND door_id=?").bind(JSON.stringify(state),Date.now(),R,id).run();
        row = await env.DB.prepare("SELECT * FROM realm_houses WHERE realm_id=? AND door_id=?").bind(R,id).first();
        room.broadcast({ type: "house_update", realm: R, house: housePublic(row) });
      };
      const op = String(m.op || "");
      if (op === "knock") {
        if (!nearDoor || !row.user_id) { reply({ reason: "No one answers." }); return; }
        for (const p of realmPlayers(R)) if (p.userId === row.user_id) send(p, { type: "house_knock", realm: R, door: id, name: actor.name });
        reply({ ok: true, op }); return;
      }
      if (op === "purchase") {
        if (!nearAgent) { reply({ reason: "Speak to the estate agent in the market." }); return; }
        if (row.user_id) { reply({ reason: "That house has already been sold." }); return; }
        if (actor.gold < lot.price) { reply({ reason: "You need " + lot.price + " gold for this deed." }); return; }
        const existing = await env.DB.prepare("SELECT door_id FROM realm_houses WHERE user_id=? AND owner_slot=?").bind(me.userId,actor.slot).first();
        if (existing) { reply({ reason: "This account already holds a deed for this player slot." }); return; }
        let result;
        try {
          result = await env.DB.prepare("UPDATE realm_houses SET user_id=?,owner_slot=?,character_id=?,owner_name=?,updated_at=? WHERE realm_id=? AND door_id=? AND user_id IS NULL")
            .bind(me.userId,actor.slot,actor.id,actor.name,Date.now(),R,id).run();
        } catch { reply({ reason: "This account already holds a deed." }); return; }
        if (!result?.meta?.changes) { reply({ reason: "That house was just sold." }); return; }
        actor.gold -= lot.price;
        state.unbarredUntil = 0;
        await actor.save();
        await publish();
        reply({ ok: true, op, house: housePublic(row), gold: actor.gold, chest: state.chest });
        return;
      }
      if (op === "enter") {
        if (!nearDoor) { reply({ reason: "The door is out of reach." }); return; }
        const passKey = actor.slot === 2 ? "coopHousePass" : "housePass";
        const pass = me[passKey];
        if (row.user_id && !owner && !(state.unbarredUntil > Date.now()) && !(pass?.door === id && pass.until > Date.now())) {
          reply({ reason: "A tier 3 lock bars this door." }); return;
        }
        if (pass?.door === id) me[passKey] = null;
        me[insideKey] = id;
        reply({ ok: true, op, house: housePublic(row), chest: owner ? state.chest : null });
        return;
      }
      if (op === "leave") { if (inside) me[insideKey] = null; reply({ ok: true, op }); return; }
      if (op === "pick" || op === "force") {
        if (!nearDoor || !row.user_id || owner) { reply({ reason: "There is no barred deed door to pick." }); return; }
        if (op === "pick" && !actor.inv.lockpick) { reply({ reason: "You need a lockpick." }); return; }
        if (op === "pick") { actor.inv.lockpick--; if (!actor.inv.lockpick) delete actor.inv.lockpick; }
        const nat = 1 + Math.floor(Math.random() * 20), bonus = amod(actor.sheet.attrs?.[op === "pick" ? "finesse" : "might"]), dc = op === "pick" ? 22 : 24;
        const total = nat + bonus, success = nat === 20 || (nat !== 1 && total >= dc);
        const roll = { nat, bonus, dc, total, success, crit: nat === 20, fumble: nat === 1, margin: total-dc, adv: 0 };
        await actor.save();
        if (success) me[actor.slot === 2 ? "coopHousePass" : "housePass"] = { door: id, until: Date.now() + 30000 };
        else me[actor.slot === 2 ? "coopGuardPending" : "guardPending"] = id;
        reply({ ok: true, op, roll, guard: !success, house: housePublic(row) });
        return;
      }
      if (op === "guard_reply") {
        const pendingKey = actor.slot === 2 ? "coopGuardPending" : "guardPending";
        if (me[pendingKey] !== id) { reply({ reason: "The watch has already moved on." }); return; }
        me[pendingKey] = null;
        const choice = String(m.choice || "");
        let attack = false, line = "";
        const warningsKey = actor.slot === 2 ? "coopHouseWarnings" : "houseWarnings";
        if (choice === "leave") {
          me[warningsKey] = (me[warningsKey] || 0) + 1;
          attack = me[warningsKey] > 1;
          line = attack ? "The guard recognizes you and calls for help." : "The guard lets you leave with a warning.";
        } else if (choice === "fine" && actor.gold >= 20) {
          actor.gold -= 20; await actor.save(); line = "The guard pockets the fine and sends you away.";
        } else if (choice === "persuade" || choice === "deceive") {
          const dc = choice === "persuade" ? 15 : 17;
          const nat = 1 + Math.floor(Math.random() * 20), total = nat + amod(actor.sheet.attrs?.presence);
          attack = !(nat === 20 || (nat !== 1 && total >= dc));
          line = attack ? "The guard sees through your story. To arms!" : "The guard accepts your explanation and lets you go.";
          reply({ ok: true, op, attack, line, roll: { nat, bonus: amod(actor.sheet.attrs?.presence), dc, total, success: !attack } });
          if (attack && actor.slot === 1) { me.bounty += 10; await persist(env,me); conn.send(invMsg(me)); }
          return;
        } else { attack = true; line = "The guard draws steel!"; }
        if (attack && actor.slot === 1) { me.bounty += 10; await persist(env,me); conn.send(invMsg(me)); }
        reply({ ok: true, op, attack, line, gold: actor.gold });
        return;
      }
      if (op === "unbar" || op === "bar") {
        if (!owner || !inside) { reply({ reason: "Only the owner can work the inside bolt." }); return; }
        state.unbarredUntil = op === "unbar" ? Date.now() + 60000 : 0;
        await publish(); reply({ ok: true, op, house: housePublic(row) }); return;
      }
      if (op === "loot") {
        if (!inside || row.user_id || state.lootTaken) { reply({ reason: "The abandoned chest has been emptied." }); return; }
        const key = HOUSE_LOOT[HOUSE_LOTS.findIndex(l => l.id === id)];
        if (!fitCount(actor.inv,actor.sheet,key)) { reply({ reason: "Your pack is too full." }); return; }
        state.lootTaken = true;
        const claimed = await env.DB.prepare("UPDATE realm_houses SET state=?,updated_at=? WHERE realm_id=? AND door_id=? AND user_id IS NULL AND COALESCE(json_extract(state,'$.lootTaken'),0)=0")
          .bind(JSON.stringify(state),Date.now(),R,id).run();
        if (!claimed?.meta?.changes) { reply({ reason: "Someone opened the chest first." }); return; }
        actor.inv[key] = (actor.inv[key] || 0) + 1;
        await actor.save(); await publish();
        reply({ ok: true, op, item: key, house: housePublic(row) }); return;
      }
      if (op === "deposit" || op === "withdraw") {
        if (!inside || !owner) { reply({ reason: "Only the deed holder may use this chest." }); return; }
        const key = String(m.key || "");
        if (!ITEMS[key]) { reply({ reason: "That item cannot be stored." }); return; }
        if (op === "deposit") {
          if ((actor.inv[key] || 0) <= (actor.equipment[ITEMS[key].slot] === key ? 1 : 0)) { reply({ reason: "You have no loose copy of that item." }); return; }
          actor.inv[key]--; if (!actor.inv[key]) delete actor.inv[key];
          state.chest[key] = (state.chest[key] || 0) + 1;
        } else {
          if (!state.chest[key] || !fitCount(actor.inv,actor.sheet,key)) { reply({ reason: "That item is unavailable or too heavy." }); return; }
          state.chest[key]--; if (!state.chest[key]) delete state.chest[key];
          actor.inv[key] = (actor.inv[key] || 0) + 1;
        }
        await actor.save(); await publish(); reply({ ok: true, op, chest: state.chest, house: housePublic(row) }); return;
      }
      if (op === "decor") {
        if (!inside || !owner) { reply({ reason: "Only the deed holder can arrange this room." }); return; }
        const action = String(m.action || ""), type = String(m.decorType || ""), index = Number(m.index);
        if (action === "display") {
          const key = String(m.key || "");
          if (!ITEMS[key] || state.decor.length >= 12 || (actor.inv[key] || 0) <= (actor.equipment[ITEMS[key].slot] === key ? 1 : 0)) { reply({ reason: "That item cannot be displayed." }); return; }
          actor.inv[key]--; if (!actor.inv[key]) delete actor.inv[key];
          state.decor.push({ type: "display", itemKey: key, x: 0, z: -1.3, rot: 0 });
          await actor.save();
        } else if (action === "add") {
          if (!HOUSE_DECOR.has(type) || state.decor.length >= 12) { reply({ reason: "There is no room for more furniture." }); return; }
          state.decor.push({ type, x: 0, z: -1.3, rot: 0 });
        } else if (action === "move" || action === "turn") {
          if (!Number.isSafeInteger(index) || !state.decor[index]) { reply({ reason: "That furnishing is gone." }); return; }
          const entry = state.decor[index];
          if (action === "turn") entry.rot = ((entry.rot || 0) + 1) % 4;
          else { entry.x = Math.max(-2.3,Math.min(2.3,entry.x + Math.max(-1,Math.min(1,Number(m.dx) || 0)) * .45));
            entry.z = Math.max(-2.3,Math.min(1,entry.z + Math.max(-1,Math.min(1,Number(m.dz) || 0)) * .45)); }
        } else if (action === "remove" && Number.isSafeInteger(index) && state.decor[index]) {
          const removed = state.decor[index];
          if (removed.type === "display" && ITEMS[removed.itemKey]) {
            if (!fitCount(actor.inv,actor.sheet,removed.itemKey)) { reply({ reason: "Your pack is too full to reclaim the display." }); return; }
            actor.inv[removed.itemKey] = (actor.inv[removed.itemKey] || 0) + 1;
            await actor.save();
          }
          state.decor.splice(index,1);
        }
        else { reply({ reason: "Choose a furnishing first." }); return; }
        await publish(); reply({ ok: true, op, house: housePublic(row) }); return;
      }
      reply({ reason: "Unknown house action." }); return;
    }
    if (m.type === "item_drop") {
      const key = String(m.key || "");
      const x = Number(m.x), z = Number(m.z);
      if (!ITEMS[key] || !(me.inv[key] > (me.equipment[ITEMS[key].slot] === key ? 1 : 0)) || !Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x-me.x,z-me.z) > 3) return;
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM realm_ground_items WHERE realm_id=?").bind(R).first();
      if ((count?.n || 0) >= 200) { conn.send({ type: "alchemy_result", reason: "There are too many dropped items in this realm." }); return; }
      const id = crypto.randomUUID();
      me.inv[key]--; if (!me.inv[key]) delete me.inv[key];
      await env.DB.prepare("INSERT INTO realm_ground_items (id,realm_id,user_id,item_key,x,z,created_at) VALUES (?,?,?,?,?,?,?)").bind(id,R,me.userId,key,x,z,Date.now()).run();
      await persist(env,me); conn.send(invMsg(me));
      room.broadcast({ type: "ground_item", realm: R, op: "add", item: { id,key,x,z } }); return;
    }
    if (m.type === "item_pickup") {
      const id = String(m.id || "");
      const row = await env.DB.prepare("SELECT item_key,x,z FROM realm_ground_items WHERE id=? AND realm_id=?").bind(id,R).first();
      if (!row || Math.hypot(me.x-row.x,me.z-row.z) > 3.5 || !fitCount(me.inv,sheet,row.item_key)) return;
      const result = await env.DB.prepare("DELETE FROM realm_ground_items WHERE id=? AND realm_id=?").bind(id,R).run();
      if (!result?.meta?.changes) return;
      me.inv[row.item_key] = (me.inv[row.item_key] || 0) + 1;
      await persist(env,me); conn.send(invMsg(me));
      room.broadcast({ type: "ground_item", realm: R, op: "remove", id }); return;
    }
    if (m.type === "alchemy_start") {
      if (me.alchemy !== "locked" || !me.city) return;
      me.alchemy = "open"; me.alchemyFresh = {};
      await env.DB.prepare("INSERT INTO realm_alchemy (realm_id,user_id,character_id,status,fresh) VALUES (?,?,?,?,?) ON CONFLICT(realm_id,user_id,character_id) DO UPDATE SET status=excluded.status,fresh=excluded.fresh")
        .bind(R, me.userId, me.characterId, "open", "{}").run();
      conn.send({ type: "alchemy_result", started: true }); return;
    }
    if (m.type === "alchemy_roll") {
      const eligible = ["lifekeeper","arcanist"].includes(me.cls) || me.ancestry === "thornkin";
      if (me.alchemy !== "open" || !me.city || !eligible || !["moonleaf","dusk_mushroom","wild_berries"].every(k => (me.inv[k] || 0) > 0)) {
        conn.send({ type: "alchemy_roll" }); return;
      }
      const bonus = Math.floor((amod(me.attrs.intellect) + amod(me.attrs.instinct)) / 2) + 2;
      const nat = 1 + Math.floor(Math.random() * 20), dc = 12, total = nat + bonus;
      const crit = nat === 20, fumble = nat === 1, success = crit || (!fumble && total >= dc);
      me.alchemyPassed = success;
      conn.send({ type: "alchemy_roll", roll: { nat, bonus, dc, total, success, crit, fumble, margin: total-dc, adv: 0 } }); return;
    }
    if (m.type === "city_lockpick") {
      const id = String(m.door || "");
      const reroll = !!m.reroll && me.lastLockId === id && !me.lastLockRerolled && Date.now() - (me.lastLockAt || 0) < 30000;
      if (!me.city || !/^marrow_door_\d{1,3}$/.test(id) || (!reroll && (me.inv.lockpick || 0) < 1)) {
        conn.send({ type: "city_lockpick", door: id, reason: "You need a lockpick at a city door." }); return;
      }
      const n = Number(id.slice("marrow_door_".length));
      if (n > 300) { conn.send({ type: "city_lockpick", door: id, reason: "That latch is out of reach." }); return; }
      if (reroll) me.lastLockRerolled = true;
      else { me.inv.lockpick--; if (!me.inv.lockpick) delete me.inv.lockpick; me.lastLockId = id; me.lastLockAt = Date.now(); me.lastLockRerolled = false; }
      const bonus = amod(me.attrs.finesse), dc = n === 1 || n === 4 ? 15 : 12;
      const nat = 1 + Math.floor(Math.random() * 20), total = nat + bonus;
      const crit = nat === 20, fumble = nat === 1, success = crit || (!fumble && total >= dc);
      if (!reroll) { await persist(env, me); conn.send(invMsg(me)); }
      conn.send({ type: "city_lockpick", door: id, roll: { nat, bonus, dc, total, success, crit, fumble, margin: total-dc, adv: 0 } });
      return;
    }
    if (m.type === "alchemy_complete" || m.type === "alchemy_craft") {
      const recipe = ["moonleaf", "dusk_mushroom", "wild_berries"];
      if (!me.city || !recipe.every(k => (me.inv[k] || 0) > 0)) { conn.send({ type: "alchemy_result", reason: "Bring all three ingredients to Mira's table." }); return; }
      if (inventoryWeight(me.inv) - recipe.reduce((sum,k) => sum + ITEMS[k].weight,0) + ITEMS.healing_draught.weight > carryCapacity(sheet) + 1e-6) { conn.send({ type: "alchemy_result", reason: "Your pack is too heavy for the draught." }); return; }
      if (m.type === "alchemy_complete") {
        if (me.alchemy !== "open") return;
        const eligible = ["lifekeeper","arcanist"].includes(me.cls) || me.ancestry === "thornkin";
        if (m.skip ? !eligible || !me.alchemyPassed : !recipe.every(k => (me.alchemyFresh[k] || 0) > 0)) { conn.send({ type: "alchemy_result", reason: "Mira asks for newly gathered ingredients." }); return; }
        me.alchemyPassed = false;
        me.alchemy = "done";
        await env.DB.prepare("UPDATE realm_alchemy SET status='done' WHERE realm_id=? AND user_id=? AND character_id=?").bind(R,me.userId,me.characterId).run();
      } else if (me.alchemy !== "done") return;
      for (const k of recipe) { me.inv[k]--; if (!me.inv[k]) delete me.inv[k]; }
      me.inv.healing_draught = (me.inv.healing_draught || 0) + 1;
      await persist(env, me);
      conn.send(invMsg(me, { brewed: "healing_draught" }));
      if (m.type === "alchemy_complete") conn.send({ type: "alchemy_result", learned: true });
      return;
    }

    if (m.type === "quest_turnin") {
      const item = String(m.item || ""), questId = String(m.questId || "");
      const gatherable = ["wild_berries", "moonleaf", "dusk_mushroom", "carving_stick"];
      const saved = await env.DB.prepare("SELECT data FROM saves WHERE id=? AND user_id=?").bind(me.characterId, me.userId).first();
      const quest = safe(saved?.data)?.state?.generatedQuests?.[questId];
      if (!/^sq_[a-z0-9]+_[a-z0-9]+$/.test(questId) || !gatherable.includes(item) || (me.inv[item] || 0) < 1
        || !quest || quest.item !== item || quest.node !== "return" || quest.status !== "open" || !quest.contacts?.includes(quest.branch)) {
        conn.send({ type: "quest_result", questId, ok: false, reason: "The quest handoff or requested item is unavailable." }); return;
      }
      me.inv[item]--; if (!me.inv[item]) delete me.inv[item];
      await persist(env, me);
      conn.send(invMsg(me));
      conn.send({ type: "quest_result", questId, ok: true });
      return;
    }

    if (m.type === "player_death") {
      const hollow = String(m.hollow || "");
      await dropPlayer(env, room, me, { hollowId: hollow, hollowPos: { x: Number(m.hollowX), z: Number(m.hollowZ) } });
      return;
    }
    if (m.type === "hostile") {
      me.hostile = !!m.enabled;
      await persistPvp(env, me);
      conn.send({ type: "pvp_state", hostile: me.hostile, skullUntil: me.skullUntil });
      room.broadcast({ type: "member", realm: R, player: pub(me) }, { except: [me.id] });
      return;
    }
    if (m.type === "pvp_attack") {
      const t = target(), now = Date.now();
      const style = { vanguard: { range: 3.3, cooldown: 800, base: 6, attr: "might" }, trailblazer: { range: 29, cooldown: 1100, base: 5, attr: "finesse" },
        arcanist: { range: 23, cooldown: 1000, base: 5, attr: "intellect" }, lifekeeper: { range: 20, cooldown: 1050, base: 4, attr: "instinct" } }[me.cls];
      if (!t || !style || (!me.hostile && !t.hostile && !skullActive(t)) || me.hp <= 0 || me.downed || t.hp <= 0 || t.downed
        || now - (me.pvpAt || 0) < style.cooldown || now - me.last > 3000 || now - t.last > 3000 || dist(me, t) > style.range + 1) return;
      me.pvpAt = now;
      const weapon = ITEMS[me.equipment.weapon];
      const bonus = me.level + amod(me.attrs[style.attr]) + (weapon?.attack || 0);
      const guard = 10 + ({ vanguard: 6, trailblazer: 3, arcanist: 0, lifekeeper: 4 }[t.cls] || 0)
        + Math.min(3, amod(t.attrs.finesse)) + (ITEMS[t.equipment.armor]?.guard || 0) + (ITEMS[t.equipment.shield]?.guard || 0) + (ITEMS[t.equipment.helmet]?.guard || 0);
      const roll = 1 + Math.floor(Math.random() * 20);
      const hit = roll === 20 || (roll !== 1 && roll + bonus >= guard);
      const damage = hit ? Math.max(1, style.base + Math.floor(Math.random() * 4) + Math.max(0, amod(me.attrs[style.attr])) + (roll === 20 ? 3 : 0)) : 0;
      if (hit) { t.hp = Math.max(0, t.hp - damage); t.pvpHpLock = now + 1500; t.dirty = true; }
      room.broadcast({ type: "pvp_hit", realm: R, from: me.id, to: t.id, attacker: me.name, victim: t.name, hit, roll, damage, hp: t.hp });
      if (hit && (skullActive(me, now) || t.hp <= 0)) {
        me.skullUntil = now + SKULL_MS;
        await persistPvp(env, me);
        conn.send({ type: "pvp_state", hostile: me.hostile, skullUntil: me.skullUntil });
        room.broadcast({ type: "member", realm: R, player: pub(me) }, { except: [me.id] });
      }
      if (t.hp <= 0 && hit) {
        await dropPlayer(env, room, t, { killer: me });
        room.broadcast({ type: "pvp_kill", realm: R, killer: me.id, victim: t.id, name: me.name, target: t.name });
      }
      return;
    }

    if (m.type === "carve_wand") {
      const fail = (reason) => conn.send({ type: "wand_result", error: reason });
      const charRow = me.characterId && await env.DB.prepare("SELECT data FROM characters WHERE id = ? AND user_id = ?").bind(me.characterId, me.userId).first();
      const savedChar = safe(charRow?.data);
      if (!savedChar || !["arcanist", "lifekeeper"].includes(savedChar.class) || savedChar.class !== me.cls) { fail("Only Arcanists and Lifekeepers may carve wands."); return; }
      const layout = horseRandom(me.realmSeed, "layout");
      const wizardX = (layout() * 2 - 1) * 40 - 10;
      const wizardZ = -60 + (layout() * 2 - 1) * 40 + 7;
      if (Math.hypot(me.x - wizardX, me.z - wizardZ) > 8) { fail("Return to Elian's table in Marrowgate."); return; }
      if (!(me.inv.carving_stick > 0)) { fail("Bring a straight stick from the overworld."); return; }
      const path = m.path;
      if (!path || !["walnut","oak","mahogany","ash","ebony"].includes(path.wood) || !Array.isArray(path.strokes) || path.strokes.length < 3 || path.strokes.length > 40 || !path.strokes.every(x => ["gouge","chisel","scrape","brand","polish"].includes(x.tool) && Number.isFinite(x.x) && x.x >= 0 && x.x <= 1) || !Array.isArray(path.answers) || path.answers.length !== 3 || path.answers.some(x => typeof x !== "string" || x.length > 120)) { fail("The carving is unfinished."); return; }
      me.inv.carving_stick--; if (!me.inv.carving_stick) delete me.inv.carving_stick;
      await persist(env, me); conn.send(invMsg(me));
      const roll = clampInt(m.roll, 1, 20);
      const level = clampInt(savedChar.level || 1, 1, 5);
      const id = crypto.randomUUID();
      try {
        const wand = await makeWand(env, { id, userId: me.userId, characterId: me.characterId, realmId: R, cls: savedChar.class, level, roll, path });
        await env.DB.prepare("INSERT INTO carved_wands (id, user_id, character_id, realm_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, me.userId, me.characterId, R, JSON.stringify(wand), Date.now()).run();
        conn.send({ type: "wand_result", wand });
      } catch (error) {
        me.inv.carving_stick = (me.inv.carving_stick || 0) + 1;
        await persist(env, me); conn.send(invMsg(me));
        fail("The magic would not settle. Your stick was returned; try again.");
        console.warn("Wand carving failed", error);
      }
      return;
    }

    if (m.type === "corpse_create") {
      const c = m.corpse || {}, id = String(c.id || ""), kind = String(c.kind || "");
      const allowed = ["npc","wild_pet","gloam_rat","fen_hound","bristleback","briar_stag","ash_crawler","brigand","brigand_archer","sellsword","city_guard","drowned_thrall","mire_warden","root_matriarch","tide_keeper","glass_smith","hollow"];
      if (!/^c_[a-z0-9_]{8,55}$/.test(id) || !allowed.includes(kind) || !Number.isFinite(c.x) || !Number.isFinite(c.z) || dist(me, c) > 100) return;
      if (Date.now() - (me.corpseWindowAt || 0) > 10000) { me.corpseWindowAt = Date.now(); me.corpseWindowCount = 0; }
      if (++me.corpseWindowCount > 25) return;
      const hollowId = kind === "hollow" && /^hollow-(?:wilds|dungeon-[a-z0-9]+)(?:-[a-z0-9]+)?$/.test(String(c.hollowId || "")) ? String(c.hollowId) : null;
      const unlock = hollowId ? await lockHollow(R,hollowId) : null;
      try {
      const old = await env.DB.prepare("SELECT corpse_id FROM realm_corpses WHERE realm_id=? AND corpse_id=?").bind(R,id).first();
      if (old) return;
      const loot = corpseLoot(kind,id);
      const look = c.look && typeof c.look === "object" && JSON.stringify(c.look).length <= 2500 ? c.look : {};
      const equipment = corpseEquipment(kind, look);
      for (const key of Object.values(equipment)) loot.items[key] = (loot.items[key] || 0) + 1;
      let stolenWands = [];
      if (hollowId) {
        const h = await env.DB.prepare("SELECT loot FROM realm_hollows WHERE realm_id=? AND hollow_id=?").bind(R,hollowId).first();
        const stash = safe(h?.loot) || {};
        for (const [key,n] of Object.entries(cleanInv(stash, 100000))) loot.items[key] = (loot.items[key]||0)+n;
        loot.gold += clampInt(stash.$gold || 0,0,1e12);
        stolenWands = Array.isArray(stash.$wands) ? stash.$wands : [];
      }
      const record = { id, kind, name: String(c.name || kind).slice(0,48), x:c.x, z:c.z, yaw:Number(c.yaw)||0, spawn:String(c.spawn||"").slice(0,64), npc: kind === "npc" && /^[a-z][a-z0-9_]{0,39}$/.test(String(c.npc || "")) ? String(c.npc) : null, look, equipment, items:loot.items, gold:loot.gold, wands:stolenWands, human:loot.human, disturbed:false, devoured:false, createdAt:Date.now(), hollowId };
      const insert = env.DB.prepare("INSERT INTO realm_corpses (realm_id,corpse_id,user_id,data,updated_at) VALUES (?,?,?,?,?)").bind(R,id,me.userId,JSON.stringify(record),Date.now());
      if (hollowId) {
        await env.DB.batch([insert,env.DB.prepare("DELETE FROM realm_hollows WHERE realm_id=? AND hollow_id=?").bind(R,hollowId),
          ...stolenWands.map(w => env.DB.prepare("UPDATE carved_wands SET character_id=? WHERE id=? AND realm_id=?").bind(`corpse:${id}`,w.id,R))]);
        room.broadcast({ type:"hollow_update", realm:R, hollow:hollowId, hasLoot:false });
      } else await insert.run();
      room.broadcast({ type:"corpse_update", realm:R, corpse:record });
      return;
      } finally { unlock?.(); }
    }
    if (m.type === "corpse_loot" || m.type === "corpse_devour") {
      const id = String(m.id || ""); if (!/^c_[a-z0-9_]{8,55}$/.test(id)) return;
      const row = await env.DB.prepare("SELECT data FROM realm_corpses WHERE realm_id=? AND corpse_id=?").bind(R,id).first();
      const c = safe(row?.data); if (!c || dist(me,c)>(m.type === "corpse_devour" ? 160 : 4.5)) return;
      const beforeInv = { ...me.inv }, beforeGold = me.gold;
      let hollowCache = null, devourHollow = null, unlock = null, takenWands = [];
      try {
      if (m.type === "corpse_loot") {
        const key = String(m.key || ""); if (key !== "all" && key !== "gold" && !ITEMS[key] && !/^wand:[a-f0-9-]{36}$/.test(key)) return;
        let tookLoot = false;
        if ((key === "all" || key === "gold") && c.gold > 0) {
          const takenGold = Math.min(c.gold, Math.max(0, 1e7 - me.gold));
          if (takenGold) { me.gold += takenGold; c.gold -= takenGold; tookLoot = true; }
        }
        for (const k of key === "all" ? Object.keys(c.items||{}) : key === "gold" || key.startsWith("wand:") ? [] : [key]) {
          const n = fitCount(me.inv,sheet,k,c.items[k]||0);
          if (n) { me.inv[k] = (me.inv[k]||0)+n; c.items[k]-=n; if (!c.items[k]) delete c.items[k]; stripCorpseEquipment(c, k); tookLoot = true; }
        }
        if (key === "all" || key.startsWith("wand:")) {
          takenWands = (c.wands || []).filter(w => key === "all" || w.id === key.slice(5));
          if (takenWands.length) { c.wands = (c.wands || []).filter(w => !takenWands.includes(w)); for (const wand of takenWands) stripCorpseEquipment(c, wand.id); tookLoot = true; }
        }
        if (!tookLoot) return;
        c.disturbed = true;
      }
      if (m.type === "corpse_devour") {
        const hollowId = String(m.hollow || "");
        if (c.devoured || !/^hollow-(?:wilds|dungeon-[a-z0-9]+)(?:-[a-z0-9]+)?$/.test(hollowId)) return;
        unlock = await lockHollow(R,hollowId);
        const h = await env.DB.prepare("SELECT loot FROM realm_hollows WHERE realm_id=? AND hollow_id=?").bind(R,hollowId).first();
        const stash = safe(h?.loot)||{}, cache = cleanInv(stash, 100000);
        if (stash.$gold) cache.$gold = clampInt(stash.$gold,0,1e12);
        cache.$wands = [...(Array.isArray(stash.$wands) ? stash.$wands : []), ...(c.wands || [])];
        cache.$x = c.x; cache.$z = c.z;
        for (const [k,n] of Object.entries(c.items||{})) {
          if (!ITEMS[k] || n <= 0) continue;
          cache[k] = (cache[k] || 0) + n;
          delete c.items[k];
        }
        if (c.gold) cache.$gold = Math.min(1e12,(cache.$gold||0)+c.gold);
        c.gold = 0; c.wands = []; c.devoured = true;
        c.kind = "player_skeleton"; c.human = false;
        hollowCache = cache; devourHollow = hollowId;
      }
      const changed = await env.DB.prepare("UPDATE realm_corpses SET data=?,updated_at=? WHERE realm_id=? AND corpse_id=? AND data=?")
        .bind(JSON.stringify(c),Date.now(),R,id,row.data).run();
      if (!(changed.meta?.changes>0)) { me.inv = beforeInv; me.gold = beforeGold; conn.send({ type:"corpse_result", reason:"That body was searched by someone else." }); return; }
      if (hollowCache) {
        await env.DB.prepare("INSERT INTO realm_hollows (realm_id,hollow_id,loot,updated_at) VALUES (?,?,?,?) ON CONFLICT(realm_id,hollow_id) DO UPDATE SET loot=excluded.loot,updated_at=excluded.updated_at")
          .bind(R,devourHollow,JSON.stringify(hollowCache),Date.now()).run();
        room.broadcast({ type:"hollow_update", realm:R, hollow:devourHollow, hasLoot:!!Object.keys(hollowCache).length, gear:hollowCache });
        for (const wand of hollowCache.$wands || []) await env.DB.prepare("UPDATE carved_wands SET character_id=? WHERE id=? AND realm_id=?")
          .bind(`hollow:${devourHollow}`,wand.id,R).run();
      }
      if (m.type === "corpse_loot") {
        for (const wand of takenWands) await env.DB.prepare("UPDATE carved_wands SET user_id=?,character_id=? WHERE id=? AND realm_id=? AND character_id=?")
          .bind(me.userId,me.characterId,wand.id,R,`corpse:${id}`).run();
        await persist(env,me); conn.send(invMsg(me));
        for (const wand of takenWands) conn.send({ type:"wand_looted", wand });
      }
      room.broadcast({ type:"corpse_update", realm:R, corpse:c });
      return;
      } finally { unlock?.(); }
    }

    if (m.type === "hollow_throw") {
      const id = String(m.hollow || ""), key = String(m.key || "");
      if (!/^hollow-(?:wilds|dungeon-[a-z0-9]+)(?:-[a-z0-9]+)?$/.test(id) || !ITEMS[key]?.weapon || Date.now()-(me.hollowThrowAt||0)<400) return;
      const unlock = await lockHollow(R,id);
      try {
      const row = await env.DB.prepare("SELECT loot FROM realm_hollows WHERE realm_id=? AND hollow_id=?").bind(R,id).first();
      const stash = safe(row?.loot)||{}, loot = cleanInv(stash, 100000);
      if (stash.$gold) loot.$gold = clampInt(stash.$gold,0,1e12);
      if (stash.$wands) loot.$wands = stash.$wands;
      if (Number.isFinite(stash.$x) && Number.isFinite(stash.$z)) { loot.$x = stash.$x; loot.$z = stash.$z; }
      if (!loot[key]) return;
      loot[key]--; if (!loot[key]) delete loot[key];
      const changed = await env.DB.prepare("UPDATE realm_hollows SET loot=?,updated_at=? WHERE realm_id=? AND hollow_id=? AND loot=?")
        .bind(JSON.stringify(loot),Date.now(),R,id,row.loot).run();
      if (!(changed.meta?.changes>0)) return;
      me.hollowThrowAt = Date.now();
      room.broadcast({ type:"hollow_update", realm:R, hollow:id, hasLoot:!!Object.keys(loot).length, gear:loot });
      return;
      } finally { unlock(); }
    }
    if (m.type === "hollow_death") {
      const id = String(m.hollow || "");
      await dropPlayer(env, room, me, { hollowId: id, hollowPos: m.remains });
      return;
    }

    if (m.type === "state") {
      const now = Date.now();
      const dt = Math.max(0.05, (now - me.last) / 1000);
      const d = Math.hypot((Number(m.x) || 0) - me.x, (Number(m.z) || 0) - me.z);
      if (d <= MAX_SPEED * dt + 2 || m.teleport) { me.x = Number(m.x) || 0; me.y = Number(m.y) || 0; me.z = Number(m.z) || 0; }
      me.yaw = Number(m.yaw) || 0;
      if (now >= (me.pvpHpLock || 0)) me.hp = Math.max(0, Number(m.hp) || 0);
      me.maxHp = Math.max(1, Number(m.maxHp) || 1);
      me.speed = Math.min(12, Number(m.speed) || 0); me.M = Math.max(-100, Math.min(100, Number(m.M) || 0)); me.downed = !!m.downed; me.city = !!m.city;
      if (m.level) me.level = clampInt(m.level, 1, 5);
      me.last = now; me.dirty = true;
      return;
    }
    if (m.type === "chat") {
      const now = Date.now();
      if (now - me.chatAt < 700) return;
      me.chatAt = now;
      const text = room.censor(String(m.text || "")).trim().slice(0, 160);
      if (text) room.broadcast({ type: "chat", realm: R, from: me.id, name: me.name, text });
      return;
    }
    if (m.type === "event") {
      const e = m.e || {};
      if (e.kind === "roll") {
        const nat = Number(e.nat);
        if (!(nat >= 1 && nat <= 20) || Math.abs(Number(e.bonus) || 0) > 20) return;
        if ((Number(e.total) || 0) !== nat + (Number(e.bonus) || 0)) return;
      }
      if (e.kind === "anim" && typeof e.name !== "string") return;
      room.broadcast({ type: "event", from: conn.id, realm: R, e: { kind: String(e.kind || "").slice(0, 12), name: String(e.name || "").slice(0, 20), nat: e.nat, bonus: e.bonus, total: e.total, dc: e.dc, text: e.text ? room.censor(String(e.text)).slice(0, 120) : undefined } }, { except: [conn.id] });
      return;
    }
    if (m.type === "look") { me.look = m.look || {}; room.broadcast({ type: "member", realm: R, player: pub(me) }, { except: [conn.id] }); return; }
    if (m.type === "equip" && ["weapon", "shield", "armor", "helmet"].includes(m.slot)) {
      const key = m.key == null ? null : String(m.key);
      if (key && (ITEMS[key]?.slot !== m.slot || !(me.inv[key] > 0))) return;
      if (key) me.equipment[m.slot] = key; else delete me.equipment[m.slot];
      me.equipment = cleanEquipment(me.equipment, me.inv);
      await env.DB.prepare("INSERT INTO realm_equipment (realm_id, user_id, equipment) VALUES (?, ?, ?) ON CONFLICT(realm_id, user_id) DO UPDATE SET equipment = excluded.equipment")
        .bind(R, me.userId, JSON.stringify(me.equipment)).run();
      conn.send(invMsg(me));
      room.broadcast({ type: "member", realm: R, player: pub(me) }, { except: [conn.id] });
      return;
    }
    if (m.type === "helmet_visibility") {
      me.equipment.hideHelmet = !!m.hidden;
      await env.DB.prepare("INSERT INTO realm_equipment (realm_id, user_id, equipment) VALUES (?, ?, ?) ON CONFLICT(realm_id, user_id) DO UPDATE SET equipment = excluded.equipment")
        .bind(R, me.userId, JSON.stringify(me.equipment)).run();
      conn.send(invMsg(me));
      room.broadcast({ type: "member", realm: R, player: pub(me) }, { except: [conn.id] });
      return;
    }
    if (m.type === "wand_equip") {
      const id = m.id == null ? null : String(m.id).slice(0, 48);
      if (id) {
        const owned = await env.DB.prepare("SELECT id FROM carved_wands WHERE id = ? AND user_id = ? AND character_id = ? AND realm_id = ?")
          .bind(id, me.userId, me.characterId, R).first();
        if (!owned) return;
        me.equipment.wand = id;
      } else delete me.equipment.wand;
      await env.DB.prepare("INSERT INTO realm_equipment (realm_id, user_id, equipment) VALUES (?, ?, ?) ON CONFLICT(realm_id, user_id) DO UPDATE SET equipment = excluded.equipment")
        .bind(R, me.userId, JSON.stringify(me.equipment)).run();
      conn.send(invMsg(me));
      room.broadcast({ type: "member", realm: R, player: pub(me) }, { except: [conn.id] });
      return;
    }

    // ---------- shared horses ----------
    if (m.type === "horse_move") {
      const h = horsesByRealm.get(R)?.get(me.ridingHorse);
      if (!h || h.rider_user_id !== me.userId) return;
      const now = Date.now();
      if (now - me.horseMoveAt < 150 || dist(me, h) > 10) return;
      me.horseMoveAt = now;
      const travelled = dist(me, h);
      h.x = me.x; h.z = me.z; h.user_id = me.userId;
      if (h.owner_user_id === me.userId && travelled > .05 && travelled < 4 && h.bond < 5) {
        me.horseBondTravel += travelled;
        if (me.horseBondTravel >= 240) { h.bond++; me.horseBondTravel -= 240; await persistHorse(env, R, h); }
      }
      announceHorse(room, R, h);
      if (now - (me.horseSaveAt || 0) > 5000) { me.horseSaveAt = now; await persistHorse(env, R, h); }
      return;
    }
    if (m.type === "horse_action") {
      const h = horsesByRealm.get(R)?.get(String(m.horse || ""));
      const action = String(m.action || "");
      const now = Date.now();
      const result = (extra) => conn.send({ type: "horse_result", horse: h?.id, action, ...extra });
      if (!h) { result({ ok: false, reason: "That horse is gone." }); return; }
      if (action === "appearance") { result({ ok: false, reason: "Horse coats cannot be changed at a stable." }); return; }
      if (h.dead_until && h.dead_until <= now) {
        h.dead_until = 0; h.hp = 24; h.x = h.home_x; h.z = h.home_z;
        await persistHorse(env, R, h); announceHorse(room, R, h);
      }
      if (h.dead_until) { result({ ok: false, reason: "The horse is not here." }); return; }
      const close = dist(me, h) <= 4.2;
      if (!["dismount", "name"].includes(action) && !close) { result({ ok: false, reason: "Move closer to the horse." }); return; }
      if (action === "dismount") {
        if (me.ridingHorse !== h.id || h.rider_user_id !== me.userId) return;
        await releaseRider(env, room, me); result({ ok: true }); return;
      }
      if (action === "mount") {
        if (!h.tamed || h.rider_user_id || me.ridingHorse || (h.owner_user_id && h.owner_user_id !== me.userId)) {
          result({ ok: false, reason: h.owner_user_id && h.owner_user_id !== me.userId ? "This named horse belongs to another rider. You must win a theft roll." : "The horse cannot be ridden now." }); return;
        }
        h.rider_user_id = me.userId; me.ridingHorse = h.id; me.horseBondTravel = 0;
        announceHorse(room, R, h); result({ ok: true, reason: "Ride with movement controls. Hold Shift to gallop; E to dismount." }); return;
      }
      if (action === "tame") {
        if (h.tamed || h.rider_user_id || now - me.horseAt < 5000) { result({ ok: false, reason: "The horse is too unsettled for another attempt." }); return; }
        me.horseAt = now;
        const bonus = animalHandlingBonus(me.attrs,me.background,me.level);
        const dc = 12 + Number(h.id.slice(1)) % 4;
        const nat = 1 + Math.floor(Math.random() * 20), ok = nat === 20 || (nat !== 1 && nat + bonus >= dc);
        if (ok) { h.tamed = 1; h.user_id = me.userId; h.gaitSpeed = 0; h.fleeTarget = null; h.wanderTarget = null; await persistHorse(env, R, h); announceHorse(room, R, h); }
        else { startHorseFlee(h, me, now); h.user_id = me.userId; announceHorse(room, R, h); }
        result({ ok, nat, bonus, dc, total: nat + bonus, reason: ok ? "The horse accepts your hand. Anyone may ride it until it is named at a stable." : "The horse bolts away. Follow it and try again." });
        return;
      }
      if (action === "name") {
        const spots = horseStableSpots(me.realmSeed);
        const stable = spots[String(m.stable || "")];
        const name = room.censor(String(m.name || "")).trim().slice(0, 20);
        if (!h.tamed || !stable || dist(me, stable) > 13 || dist(h, stable) > 14 || name.length < 2
          || (h.rider_user_id && h.rider_user_id !== me.userId)
          || (h.owner_user_id && h.owner_user_id !== me.userId)) { result({ ok: false, reason: "Bring a tame horse to a stable to name it." }); return; }
        h.name = name; h.owner_user_id = me.userId; h.owner_name = me.username; h.user_id = me.userId; h.bond = Math.max(1, h.bond || 0);
        await persistHorse(env, R, h); announceHorse(room, R, h); result({ ok: true, reason: `${name} is now bonded to you.` }); return;
      }
      if (action === "steal") {
        if (!h.owner_user_id || h.owner_user_id === me.userId || h.rider_user_id || now - me.horseAt < 12000) {
          result({ ok: false, reason: "You cannot try to steal this horse now." }); return;
        }
        me.horseAt = now;
        const priorOwner = h.owner_user_id;
        const alertKey = `${R}:${h.id}:${me.userId}`;
        const bonus = amod(me.attrs.finesse) + me.level;
        const dc = 12 + (h.bond || 1) * 2 + ((horseAlerts.get(alertKey) || 0) > now ? 4 : 0);
        const nat = 1 + Math.floor(Math.random() * 20), ok = nat === 20 || (nat !== 1 && nat + bonus >= dc);
        if (ok) {
          h.owner_user_id = me.userId; h.owner_name = me.username; h.user_id = me.userId; h.bond = 1;
          horseAlerts.delete(alertKey); await persistHorse(env, R, h); announceHorse(room, R, h);
          for (const owner of realmPlayers(R)) if (owner.userId === priorOwner) send(owner, { type: "horse_stolen", horse: h.id, name: h.name, thief: me.name });
        } else {
          const spots = horseStableSpots(me.realmSeed);
          const guarded = me.city || Object.values(spots).some((spot) => dist(me, spot) < 30);
          if (guarded) { me.bounty = Math.min(999, me.bounty + 1); await persist(env, me); conn.send(invMsg(me)); }
          else horseAlerts.set(alertKey, now + 60000);
          result({ ok, nat, bonus, dc, total: nat + bonus, guard: guarded, damage: guarded ? 0 : 4 + Math.min(5, h.bond || 0),
            reason: guarded ? "The stable guard catches you. Guards attack!" : "The horse kicks you and watches your hands for one minute (steal DC +4)." });
          if (guarded) room.broadcast({ type: "caught", realm: R, thief: me.id, name: me.name, victim: h.owner_user_id, victimName: h.name, horse: true, city: true, bounty: me.bounty });
          return;
        }
        result({ ok, nat, bonus, dc, total: nat + bonus, reason: `${h.name} now answers to you.` }); return;
      }
      if (action === "attack") {
        if (h.tamed || h.rider_user_id) { result({ ok: false, reason: "Only wild horses can be attacked here." }); return; }
        h.hp = Math.max(0, h.hp - 9);
        if (!h.hp) h.dead_until = now + 20 * 60000;
        else startHorseFlee(h, me, now, 16);
        h.user_id = me.userId; await persistHorse(env, R, h); announceHorse(room, R, h);
        if (h.dead_until) {
          const id = `c_${now.toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
          const loot = corpseLoot("horse", id);
          const corpse = { id, kind: "horse", name: `${h.name || "Wild horse"}'s body`, x: h.x, z: h.z, yaw: 0,
            coat: h.coat, pattern: h.pattern, look: h.look || null, items: loot.items, gold: loot.gold, wands: [],
            human: false, disturbed: false, devoured: false, createdAt: now };
          await env.DB.prepare("INSERT INTO realm_corpses (realm_id, corpse_id, user_id, data, updated_at) VALUES (?, ?, ?, ?, ?)")
            .bind(R, id, me.userId, JSON.stringify(corpse), now).run();
          room.broadcast({ type: "corpse_update", realm: R, corpse });
        }
        result({ ok: true, reason: h.dead_until ? "The wild horse falls." : "The wounded horse bolts away." }); return;
      }
    }

    if (m.type === "pet_action" || m.type === "pet_move" || m.type === "pet_hurt") {
      const petId = String(m.pet || "");
      const pet = petsByRealm.get(R)?.get(petId);
      if (!pet || pet.dead) { if (m.type === "pet_action") conn.send({ type:"pet_result", pet:petId, action:String(m.action || ""), ok:false, reason:"That animal is no longer here." }); return; }
      const now = Date.now(), close = dist(me, pet) <= 5;
      if (m.type === "pet_move") {
        if (pet.owner !== me.userId || now - (me.petMoveAt?.[pet.id] || 0) < 600) return;
        const x = Number(m.x), z = Number(m.z);
        if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x-me.x,z-me.z) > 9) return;
        me.petMoveAt ||= {}; me.petMoveAt[pet.id] = now;
        pet.x = q(x); pet.z = q(z); await persistPet(env,R,pet); announcePet(room,R,pet); return;
      }
      if (m.type === "pet_hurt") {
        if (pet.owner !== me.userId || dist(me,pet) > 25 || now - (pet.hurtAt || 0) < 600) return;
        pet.hurtAt = now; pet.hp = Math.max(0, pet.hp - clampInt(m.damage,1,12)); pet.dead = pet.hp <= 0;
        await persistPet(env,R,pet); announcePet(room,R,pet); return;
      }
      const action = String(m.action || ""), result = (extra) => conn.send({ type:"pet_result", pet:pet.id, action, ...extra });
      if (action === "tame_reroll") {
        const pending = me.pendingTame;
        if (!pending || pending.pet !== pet.id || pending.rerolled || pending.ok || pending.expires < now) { result({ ok:false, reason:"That taming attempt has ended." }); return; }
        const nat = 1 + Math.floor(Math.random()*20), ok = nat === 20 || (nat !== 1 && nat + pending.bonus >= pending.dc);
        pending.nat = nat; pending.ok = ok; pending.rerolled = true;
        pending.reaction = ok ? null : (nat <= 5 || (WILDLIFE[pet.kind].fighter && Math.random() < .45) ? "attack" : "flee");
        result({ phase:"roll", ok, nat, bonus:pending.bonus, dc:pending.dc, total:nat+pending.bonus }); return;
      }
      if (action === "tame_commit") {
        const pending = me.pendingTame;
        if (!pending || pending.pet !== pet.id || pending.expires < now || pet.owner || pet.tameHeldBy !== me.id) {
          result({ ok:false, reason:"The animal has moved on. Try again later." }); return;
        }
        me.pendingTame = null; pet.tameHeldBy = null; pet.tameHoldUntil = 0;
        if (pending.ok) { pet.owner = me.userId; pet.ownerName = me.name; }
        else if (pending.reaction === "flee") {
          const dx = pet.x - me.x, dz = pet.z - me.z, len = Math.hypot(dx,dz) || 1;
          pet.x = q(pet.x + dx / len * 8); pet.z = q(pet.z + dz / len * 8);
          pet.homeX = pet.x; pet.homeZ = pet.z;
          pet.shooUntil = now + 12000;
        } else {
          pet.shooUntil = now + 20000; pet.fightHeldBy = me.id; pet.fightHoldUntil = now + 120000;
          me.pendingPetFight = { pet:pet.id, until:now + 120000 };
        }
        await persistPet(env,R,pet); announcePet(room,R,pet);
        result({ phase:"commit", ok:pending.ok, reaction:pending.reaction, x:pet.x, z:pet.z,
          reason:pending.ok ? `The ${pet.kind} trusts you and follows.` : pending.reaction === "attack" ? `The ${pet.kind} lashes out!` : `The ${pet.kind} bolts away.` }); return;
      }
      if (action === "combat_end" || action === "combat_escape") {
        if (me.pendingPetFight?.pet !== pet.id || me.pendingPetFight.until < now) return;
        me.pendingPetFight = null;
        pet.fightHeldBy = null; pet.fightHoldUntil = 0;
        if (action === "combat_end") { pet.hp = 0; pet.dead = true; await persistPet(env,R,pet); announcePet(room,R,pet); }
        else if (Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.z)) && Math.hypot(Number(m.x)-pet.x,Number(m.z)-pet.z)<60) {
          pet.x=q(Number(m.x)); pet.z=q(Number(m.z)); pet.homeX=pet.x; pet.homeZ=pet.z;
          pet.shooUntil=now+12000; await persistPet(env,R,pet); announcePet(room,R,pet);
        }
        result({ ok:true }); return;
      }
      if (pet.fightHeldBy && pet.fightHeldBy !== me.id && pet.fightHoldUntil > now) { result({ ok:false, reason:"The animal is fighting someone else." }); return; }
      if (!close) { result({ ok:false, reason:"Move closer to the animal." }); return; }
      if (action === "pet") { result({ ok:true, reason:pet.owner === me.userId ? `The ${pet.kind} leans into your hand.` : `The ${pet.kind} lets you stroke it.` }); return; }
      if (action === "shoo") {
        if (pet.owner && pet.owner !== me.userId) { result({ ok:false, reason:"That companion stays with its owner." }); return; }
        pet.x += Math.sign(pet.x-me.x || 1)*5; pet.z += Math.sign(pet.z-me.z || 1)*5;
        pet.shooUntil = pet.owner ? now + 15000 : 0;
        await persistPet(env,R,pet); announcePet(room,R,pet); result({ ok:true, reason:pet.owner ? `Your ${pet.kind} waits nearby for a while.` : `The ${pet.kind} scampers away.` }); return;
      }
      if (action === "attack") {
        if (now - (me.petAttackAt || 0) < 700) return;
        me.petAttackAt = now; pet.hp = Math.max(0, pet.hp - (6 + Math.floor(Math.random()*4))); pet.dead = pet.hp <= 0;
        if (!pet.dead && !pet.owner) { pet.x += Math.sign(pet.x-me.x || 1)*6; pet.z += Math.sign(pet.z-me.z || 1)*6; }
        await persistPet(env,R,pet); announcePet(room,R,pet); result({ ok:true, reason:pet.dead ? `The ${pet.kind} falls.` : `The ${pet.kind} flees, wounded.` }); return;
      }
      if (action === "tame") {
        if (me.pendingTame?.expires > now && me.pendingTame.pet !== pet.id) { result({ ok:false, reason:"Finish the current taming attempt first." }); return; }
        if (me.pendingTame?.pet === pet.id && me.pendingTame.expires > now) {
          const p = me.pendingTame; result({ phase:"roll", ok:p.ok, nat:p.nat, bonus:p.bonus, dc:p.dc, total:p.nat+p.bonus }); return;
        }
        if (pet.owner || pet.shooUntil > now || now - (me.petTameAt || 0) < 4000
          || (pet.tameHeldBy && pet.tameHeldBy !== me.id && pet.tameHoldUntil > now)) { result({ ok:false, reason:"The animal is not ready to be tamed." }); return; }
        me.petTameAt = now;
        const bonus = animalHandlingBonus(me.attrs,me.background,me.level), dc = WILDLIFE[pet.kind].dc;
        const nat = 1 + Math.floor(Math.random()*20), ok = nat === 20 || (nat !== 1 && nat+bonus >= dc);
        me.pendingTame = { pet:pet.id, nat, ok, bonus, dc, rerolled:false, expires:now+90000,
          reaction:ok ? null : (nat <= 5 || (WILDLIFE[pet.kind].fighter && Math.random() < .45) ? "attack" : "flee") };
        pet.tameHeldBy = me.id; pet.tameHoldUntil = now + 90000;
        result({ phase:"roll", ok, nat, bonus, dc, total:nat+bonus }); return;
      }
      return;
    }

    // ---------- inventory ----------
    if (m.type === "cave_reward") {
      const rewards = { root: "root_heart", tide: "tide_pearl", glass: "emberglass_core", sunken: "warden_seal" };
      const cave = String(m.cave || "");
      if (!rewards[cave]) return;
      if (!fitCount(me.inv,sheet,rewards[cave])) { conn.send({type:"corpse_result", reason:"Your pack is too heavy for the reliquary reward."}); return; }
      const claimed = await env.DB.prepare("SELECT cave_id FROM realm_cave_rewards WHERE realm_id = ? AND user_id = ? AND cave_id = ?")
        .bind(me.realm, me.userId, cave).first();
      if (claimed) return;
      await env.DB.prepare("INSERT INTO realm_cave_rewards (realm_id, user_id, cave_id) VALUES (?, ?, ?)").bind(me.realm, me.userId, cave).run();
      const item = rewards[cave];
      me.inv[item] = (me.inv[item] || 0) + 1;
      me.gold += 24;
      await persist(env, me); conn.send(invMsg(me, { looted: item, gotGold: 24 })); return;
    }
    if (m.type === "craft_torch") {
      if ((me.inv.drywood || 0) < 1 || (me.inv.lantern_oil || 0) < 1) return;
      for (const k of ["drywood", "lantern_oil"]) { me.inv[k]--; if (!me.inv[k]) delete me.inv[k]; }
      me.inv.torch = (me.inv.torch || 0) + 1;
      await persist(env, me); conn.send(invMsg(me, { crafted: "torch" })); return;
    }
    if (m.type === "cave_supply") {
      const id = String(m.id || "");
      const match = /^cave_(wood|oil)_(root|tide|glass)$/.exec(id);
      if (!match || me.gathered.has(id)) return;
      const item = match[1] === "wood" ? "drywood" : "lantern_oil";
      if (!fitCount(me.inv,sheet,item)) return;
      me.gathered.add(id);
      me.inv[item] = (me.inv[item] || 0) + 1;
      await persist(env, me); conn.send(invMsg(me, { gathered: item })); return;
    }
    if (m.type === "use") {
      const k = String(m.key || "");
      if (!ITEMS[k]?.heal || !(me.inv[k] > 0)) return;
      me.inv[k]--; if (!me.inv[k]) delete me.inv[k];
      await persist(env, me);
      conn.send(invMsg(me, { used: k }));
      return;
    }
    if (m.type === "loot") {
      // kill rewards are client-reported; the server rate-limits them
      const now = Date.now();
      me.lootGold = Math.min(60, me.lootGold + (now - (me.lootT || now)) / 1000 * 2); me.lootT = now;
      const g = clampInt(m.gold, 0, 30);
      let changed = false;
      if (g && me.lootGold >= g) { me.gold += g; me.lootGold -= g; changed = true; }
      const k = String(m.item || "");
      if (k && LOOTABLE.includes(k) && now - me.lootAt > 6000 && fitCount(me.inv,sheet,k)) { me.inv[k] = (me.inv[k] || 0) + 1; me.lootAt = now; changed = true; }
      if (changed) { await persist(env, me); conn.send(invMsg(me, { looted: k || null, gotGold: g })); }
      return;
    }
    if (m.type === "gather") {
      const item = String(m.item || "");
      const id = String(m.id || "");
      if (!["wild_berries", "moonleaf", "dusk_mushroom", "carving_stick"].includes(item) || !/^gather_\d+_(wild_berries|moonleaf|dusk_mushroom|carving_stick)_\d{1,2}$/.test(id) || !id.includes(`_${item}_`) || me.gathered.has(id) || me.gathered.size >= 360) return;
      if (!fitCount(me.inv,sheet,item)) return;
      me.gathered.add(id);
      me.inv[item] = (me.inv[item] || 0) + 1;
      if (me.alchemy === "open" && ["moonleaf","dusk_mushroom","wild_berries"].includes(item)) {
        me.alchemyFresh[item] = (me.alchemyFresh[item] || 0) + 1;
        await env.DB.prepare("UPDATE realm_alchemy SET fresh=? WHERE realm_id=? AND user_id=? AND character_id=?").bind(JSON.stringify(me.alchemyFresh),R,me.userId,me.characterId).run();
      }
      await persist(env, me);
      conn.send(invMsg(me, { gathered: item }));
      return;
    }
    if (m.type === "shop") {
      if (m.op === "barter") {
        const exchange = Number.isSafeInteger(m.gold) ? shopExchange(me, sheet, m.buying, m.selling, m.gold) : null;
        if (!exchange) { conn.send({ type: "shop_result", error: "That offer cannot be completed." }); return; }
        me.inv = exchange.inv; me.gold = exchange.gold;
        await persist(env, me);
        conn.send(invMsg(me));
        conn.send({ type: "shop_result", ok: true });
        return;
      }
      const k = String(m.key || "");
      if (!ITEMS[k]) return;
      const exchange = m.op === "buy" ? shopExchange(me, sheet, { [k]: 1 }, {})
        : m.op === "sell" ? shopExchange(me, sheet, {}, { [k]: 1 }) : null;
      if (!exchange) return;
      me.inv = exchange.inv; me.gold = exchange.gold;
      await persist(env, me);
      conn.send(invMsg(me));
      return;
    }
    if (m.type === "pay_bounty") {
      const cost = me.bounty * 25;
      if (!me.bounty || me.gold < cost) return;
      me.gold -= cost; me.bounty = 0;
      await persist(env, me);
      conn.send(invMsg(me));
      room.broadcast({ type: "member", realm: R, player: pub(me) });
      return;
    }
    if (m.type === "guards_caught") {
      // guards took the thief down: a fine, and the bounty is settled
      const fine = Math.min(me.gold, 10 + me.bounty * 10);
      me.gold -= fine; me.bounty = Math.max(0, me.bounty - 1);
      await persist(env, me);
      conn.send(invMsg(me, { fined: fine }));
      return;
    }

    // ---------- trading ----------
    if (m.type === "trade_req") {
      const t = target();
      if (!t || me.trade || dist(me, t) > 8) { conn.send({ type: "trade_closed", reason: "unavailable" }); return; }
      if (t.trade) { conn.send({ type: "trade_closed", reason: "busy" }); return; }
      const tr = { id: "t" + TID++, a: me.id, b: t.id, offer: { [me.id]: { items: {}, gold: 0 }, [t.id]: { items: {}, gold: 0 } }, ok: {}, open: false };
      trades.set(tr.id, tr); me.trade = tr.id; t.trade = tr.id;
      send(t, { type: "trade_req", tid: tr.id, from: me.id, name: me.name });
      conn.send({ type: "trade_wait", tid: tr.id, with: t.name });
      return;
    }
    const tr = trades.get(me.trade);
    if (m.type === "trade_resp") {
      if (!tr || tr.b !== me.id || tr.open) return;
      if (!m.ok) { closeTrade(tr, "declined"); return; }
      tr.open = true;
      const a = players.get(tr.a);
      send(a, { type: "trade_open", tid: tr.id, with: me.name });
      conn.send({ type: "trade_open", tid: tr.id, with: a?.name });
      tradeView(tr);
      return;
    }
    if (m.type === "trade_offer") {
      if (!tr || !tr.open) return;
      const o = { items: {}, gold: clampInt(m.gold, 0, me.gold) };
      for (const [k, n] of Object.entries(m.items || {})) if (ITEMS[k]) { const c = clampInt(n, 0, (me.inv[k] || 0) - (me.equipment[ITEMS[k].slot] === k ? 1 : 0)); if (c) o.items[k] = c; }
      tr.offer[me.id] = o; tr.ok = {};
      tradeView(tr);
      return;
    }
    if (m.type === "trade_ok") {
      if (!tr || !tr.open) return;
      tr.ok[me.id] = true;
      if (tr.ok[tr.a] && tr.ok[tr.b]) {
        const a = players.get(tr.a), b = players.get(tr.b);
        if (!a || !b || !hasOffer(a, tr.offer[a.id]) || !hasOffer(b, tr.offer[b.id]) || dist(a, b) > 10) { closeTrade(tr, "failed"); return; }
        if (!tradeFits(a,tr.offer[a.id],tr.offer[b.id]) || !tradeFits(b,tr.offer[b.id],tr.offer[a.id])) { closeTrade(tr,"A pack cannot hold the offered load."); return; }
        move(a, b, tr.offer[a.id]); move(b, a, tr.offer[b.id]);
        await persist(env, a); await persist(env, b);
        trades.delete(tr.id); a.trade = b.trade = null;
        send(a, invMsg(a, { traded: b.name })); send(b, invMsg(b, { traded: a.name }));
        send(a, { type: "trade_closed", reason: "done" }); send(b, { type: "trade_closed", reason: "done" });
        await logRealm(env, a, `${a.name} traded with ${b.name}`);
      } else tradeView(tr);
      return;
    }
    if (m.type === "trade_cancel") { closeTrade(tr, "cancelled"); return; }

    // ---------- theft ----------
    if (m.type === "steal") {
      const t = target();
      const now = Date.now();
      if (!t) return;
      if (dist(me, t) > 3.5) { conn.send({ type: "steal_result", ok: false, reason: "Too far away." }); return; }
      if (now - me.stealAt < 12000) { conn.send({ type: "steal_result", ok: false, reason: "Your hands are still shaking. Wait a moment." }); return; }
      me.stealAt = now;
      const pick = (me.inv.lockpick || 0) > 0;
      if (pick) { me.inv.lockpick--; if (!me.inv.lockpick) delete me.inv.lockpick; }
      const { bonus, dc } = stealOdds(me, t, pick);
      const nat = 1 + Math.floor(Math.random() * 20);
      const ok = nat === 20 || (nat !== 1 && nat + bonus >= dc);
      const res = { type: "steal_result", nat, bonus, dc, ok, victim: t.name, pick };
      if (ok) {
        const units = Object.entries(t.inv).flatMap(([k, n]) => Array(Math.max(0, n - (t.equipment[ITEMS[k]?.slot] === k ? 1 : 0))).fill(k));
        if (units.length && (Math.random() < 0.7 || !t.gold)) {
          const k = units[Math.floor(Math.random() * units.length)];
          if (fitCount(me.inv,sheet,k)) { t.inv[k]--; if (!t.inv[k]) delete t.inv[k]; me.inv[k] = (me.inv[k] || 0) + 1; res.item = k; }
          else res.empty = true;
        } else if (t.gold > 0) {
          const g = Math.min(t.gold, 1 + Math.floor(Math.random() * Math.max(3, t.gold * 0.25)));
          t.gold -= g; me.gold += g; res.gold = g;
        } else res.empty = true;
        await persist(env, me); await persist(env, t);
        const noticed = Math.random() < 0.25;
        send(t, invMsg(t, { robbed: { by: noticed ? me.name : null, byId: noticed ? me.id : null, item: res.item, gold: res.gold } }));
        if (!res.empty) await logRealm(env, me, noticed ? `${me.name} robbed ${t.name}` : `Someone robbed ${t.name}`);
      } else {
        me.bounty = Math.min(999, me.bounty + 1);
        await persist(env, me);
        send(t, { type: "steal_attempt", by: me.id, name: me.name });
        room.broadcast({ type: "caught", realm: R, thief: me.id, name: me.name, victim: t.id, victimName: t.name, city: me.city, bounty: me.bounty });
        await logRealm(env, me, `${me.name} was caught picking ${t.name}'s pocket`);
      }
      conn.send({ ...res, ...invMsg(me), type: "steal_result" });
      return;
    }
  },
  async onTick(room, env) {
    const now = Date.now();
    const horseDt = Math.min(.25, Math.max(0, (now - lastHorseTick) / 1000));
    lastHorseTick = now;
    for (const p of players.values()) {
      if (p.skullUntil && p.skullUntil <= now) {
        p.skullUntil = 0;
        await persistPvp(env, p);
        send(p, { type: "pvp_state", hostile: p.hostile, skullUntil: 0 });
        room.broadcast({ type: "member", realm: p.realm, player: pub(p) }, { except: [p.id] });
      }
      const valid = cleanEquipment(p.equipment, p.inv);
      if (JSON.stringify(valid) !== JSON.stringify(p.equipment)) { p.equipment = valid; p.equipmentDirty = true; }
      if (p.equipmentDirty) {
        p.equipmentDirty = false;
        await env.DB.prepare("INSERT INTO realm_equipment (realm_id, user_id, equipment) VALUES (?, ?, ?) ON CONFLICT(realm_id, user_id) DO UPDATE SET equipment = excluded.equipment")
          .bind(p.realm, p.userId, JSON.stringify(p.equipment)).run();
        room.broadcast({ type: "member", realm: p.realm, player: pub(p) }, { except: [p.id] });
      }
    }
    for (const [realm, horses] of horsesByRealm) for (const h of horses.values()) {
      if (h.dead_until && h.dead_until <= now) {
        h.dead_until = 0; h.hp = 24; h.x = h.home_x; h.z = h.home_z;
        announceHorse(room, realm, h);
      }
      const priorSpeed = h.gaitSpeed || 0;
      const moved = stepWildHorse(h, horseDt, now, realmPlayers(realm));
      if ((moved && now - (h.lastHorseBroadcast || 0) >= 230) || (priorSpeed && !h.gaitSpeed)) {
        h.lastHorseBroadcast = now; announceHorse(room, realm, h);
      }
      if (moved && now - (h.lastHorseSave || 0) >= 9000) {
        h.lastHorseSave = now; await persistHorse(env, realm, h);
      }
    }
    const byRealm = new Map();
    for (const p of players.values()) {
      if (!p.dirty) continue;
      p.dirty = false;
      if (!byRealm.has(p.realm)) byRealm.set(p.realm, []);
      byRealm.get(p.realm).push({ id: p.id, x: q(p.x), y: q(p.y), z: q(p.z), yaw: Math.round(p.yaw * 100) / 100, hp: p.hp, maxHp: p.maxHp, s: Math.round((p.speed || 0) * 10) / 10, M: p.M, d: p.downed ? 1 : 0, ride: p.ridingHorse });
    }
    for (const [realm, snap] of byRealm) room.broadcast({ type: "snap", realm, t: Date.now(), players: snap });
  },
  async onClose(conn, room, env) {
    const me = players.get(conn.id);
    if (!me) return;
    closeTrade(trades.get(me.trade), "left");
    await releaseRider(env, room, me);
    players.delete(conn.id);
    room.broadcast({ type: "left", realm: me.realm, id: conn.id });
    await persist(env, me);
  },
};
