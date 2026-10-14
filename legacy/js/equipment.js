import { ITEMS, STARTER_EQUIPMENT } from "./items.js";

export const EQUIPMENT_SLOTS = ["weapon", "shield", "armor", "helmet"];

export function migrateShieldEquipment(state, cls) {
  if (state.shieldEquipmentInitialized) return;
  const key = STARTER_EQUIPMENT[cls]?.shield;
  if (key && !state.equipment?.shield && !state.inv?.[key]) {
    state.inv[key] = 1;
    state.equipment ||= {};
    state.equipment.shield = key;
  }
  state.shieldEquipmentInitialized = true;
}

export function cleanEquipment(equipment, inventory) {
  const clean = { hideHelmet: !!equipment?.hideHelmet };
  for (const slot of EQUIPMENT_SLOTS) {
    const key = equipment?.[slot];
    if (ITEMS[key]?.slot === slot && (inventory?.[key] || 0) > 0) clean[slot] = key;
  }
  if (typeof equipment?.wand === "string" && equipment.wand.length <= 48) clean.wand = equipment.wand;
  return clean;
}

export function equipmentLook(base, equipment) {
  const look = { ...base };
  const weapon = ITEMS[equipment?.weapon];
  const shield = ITEMS[equipment?.shield];
  const armor = ITEMS[equipment?.armor];
  const helmet = ITEMS[equipment?.helmet];
  look.weapon = weapon?.slot === "weapon" ? weapon.model : "none";
  look.weaponFinish = weapon?.finish || null;
  if (equipment?.wand) look.weapon = "wand";
  look.shield = shield?.slot === "shield";
  if (armor?.slot === "armor") {
    look.body = armor.body;
    look.armorStyle = armor.style || null;
    if (armor.gear) look.gear = armor.gear;
    if (armor.trim) look.trim = armor.trim;
  } else { look.body = "plain"; look.armorStyle = null; }
  look.helmet = helmet?.slot === "helmet" && !equipment?.hideHelmet ? equipment.helmet : null;
  look.helmetColor = helmet?.helmetColor;
  return look;
}

export function equipmentBonus(equipment, slot, stat) {
  return Number(ITEMS[equipment?.[slot]]?.[stat]) || 0;
}
