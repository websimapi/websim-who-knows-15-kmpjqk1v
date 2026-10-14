// Crisp vector item illustrations shared by pack, shops, sheet, and ground drops.
import { ITEMS } from "./items.js";

const cache = new Map();
const metal = `fill="url(#steel)" stroke="#253239" stroke-width="2"`;
const wood = `fill="url(#wood)" stroke="#38271d" stroke-width="2"`;
const glass = `fill="url(#glass)" stroke="#a6e0d3" stroke-width="2"`;
const leaf = (x,y,r=0) => `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0 0 C-16 -16 -14 -28 3 -31 C17 -16 13 -7 0 0Z" fill="url(#leaf)" stroke="#294c34" stroke-width="2"/><path d="M0 0 3 -26" stroke="#c4e6a2" stroke-width="1.5"/></g>`;
const berry = (x,y) => `<circle cx="${x}" cy="${y}" r="9" fill="url(#berry)" stroke="#602333" stroke-width="2"/><circle cx="${x-3}" cy="${y-3}" r="2" fill="#ffd2d0"/>`;
function weaponShape(model) {
  const hilt = `<path d="M44 62h8v23h-8Z" ${wood}/><path d="M29 60q19 9 38 0l2 7q-21 8-42 0Z" fill="url(#brass)" stroke="#59462c" stroke-width="2"/><circle cx="48" cy="87" r="5" fill="url(#brass)"/>`;
  if (["blade","longsword","greatsword","shortsword","dagger","rapier","scimitar"].includes(model)) {
    const tip = model === "dagger" ? 28 : model === "shortsword" ? 19 : model === "greatsword" ? 4 : 9;
    const wide = model === "greatsword" ? 13 : model === "rapier" ? 4 : model === "dagger" ? 7 : 9;
    const blade = model === "scimitar" ? `<path d="M42 62C50 40 58 21 76 6 57 22 53 33 56 62Z" ${metal}/><path d="M48 59C53 36 62 20 72 10" fill="none" stroke="#f3f8ee" stroke-width="2"/>`
      : `<path d="M${48-wide} 61 ${48-wide} 34 48 ${tip} ${48+wide} 34 ${48+wide} 61Z" ${metal}/><path d="M48 ${tip+5}v51" stroke="#f3ffff" stroke-width="2"/>`;
    return `<g transform="rotate(38 48 48)">${blade}${hilt}${model === "rapier" ? `<path d="M30 61c-4-16 11-23 18-17 7-6 22 1 18 17" fill="none" stroke="#e3c586" stroke-width="3"/>` : ""}</g>`;
  }
  if (["axe","greataxe","warhammer","mace","morningstar","flail"].includes(model)) {
    const pole = `<path d="M44 18h8v69h-8Z" ${wood}/><path d="M42 70h12m-12 8h12" stroke="#e0c58d" stroke-width="3"/>`;
    let head = "";
    if (model === "axe" || model === "greataxe") head = `<path d="M50 18c12 1 20-4 31-9-2 19-7 32-31 35Z" ${metal}/>${model === "greataxe" ? `<path d="M45 18c-12 1-20-4-29-9 2 19 7 32 29 35Z" ${metal}/>` : ""}`;
    else if (model === "warhammer") head = `<path d="M20 18h56v22H20Z" ${metal}/><path d="M20 17 8 29l12 12" fill="url(#steel)" stroke="#34434b" stroke-width="2"/>`;
    else if (model === "flail") head = `<path d="M48 18v-9" stroke="#9ca8a5" stroke-width="4" stroke-dasharray="3 2"/><circle cx="48" cy="14" r="12" ${metal}/><path d="m48 0 4 7M35 5l6 5m20-5-6 5" stroke="#dbe5e2" stroke-width="4"/>`;
    else head = `<circle cx="48" cy="27" r="16" ${metal}/><path d="M48 5v9M28 10l9 9m31-9-9 9M27 37l9-6m31 6-9-6" stroke="#dfe7e5" stroke-width="5"/>`;
    return `<g transform="rotate(35 48 48)">${pole}${head}</g>`;
  }
  if (["spear","glaive","halberd","trident"].includes(model)) {
    const head = model === "trident" ? `<path d="M48 6 55 23 48 40 41 23Z" ${metal}/><path d="M31 10v24l17 8 17-8V10" fill="none" stroke="#cbd8db" stroke-width="5"/>`
      : model === "halberd" ? `<path d="M42 9 48 1l6 8v33H42Z" ${metal}/><path d="M53 12c16-2 25-5 29-8-2 21-9 31-29 37Z" ${metal}/><path d="M42 20 24 30l18 6" fill="url(#steel)" stroke="#4c5a60" stroke-width="2"/>`
      : model === "glaive" ? `<path d="M42 45V14C55 15 64 8 68 3c-2 18-5 33-26 42Z" ${metal}/>`
      : `<path d="M48 5 58 30 48 46 38 30Z" ${metal}/>`;
    return `<g transform="rotate(32 48 48)"><path d="M44 30h8v60h-8Z" ${wood}/><path d="M43 55h10m-10 7h10m-10 7h10" stroke="#d9bf87" stroke-width="3"/>${head}</g>`;
  }
  if (["bow","longbow","recurve","crossbow"].includes(model)) {
    if (model === "crossbow") return `<path d="M45 16h9v70h-9Z" ${wood}/><path d="M15 25c20 10 47 10 67 0" fill="none" stroke="#805c3d" stroke-width="9"/><path d="M15 25 82 25" stroke="#ede6d1" stroke-width="2"/><path d="M49 19v50" stroke="#dae1dc" stroke-width="3"/><path d="M43 72h13" stroke="#cda46b" stroke-width="4"/>`;
    return `<path d="M66 8C${model === "recurve" ? "30 25 40 68" : "22 27 22 67"} 66 88" fill="none" stroke="#513825" stroke-width="10" stroke-linecap="round"/><path d="M66 8C${model === "recurve" ? "30 25 40 68" : "22 27 22 67"} 66 88" fill="none" stroke="#b78a59" stroke-width="5"/><path d="M66 8v80" stroke="#eee4c7" stroke-width="2"/><path d="M58 48h16" stroke="#71503a" stroke-width="8"/>`;
  }
  if (model === "staff" || model === "wand") return `<g transform="rotate(33 48 48)"><path d="M43 14h10v74H43Z" ${wood}/><path d="M44 41h9m-9 6h9m-9 6h9" stroke="#dfbf82" stroke-width="3"/><path d="M48 4 57 16 48 29 39 16Z" fill="url(#blue)" stroke="#c9eafa" stroke-width="2"/><circle cx="48" cy="16" r="4" fill="#f1ffff"/></g>`;
  return "";
}
function armorShape(item) {
  const metalArmor = item.body === "plate" || item.body === "mail";
  const fill = item.body === "robe" ? "url(#blue)" : item.body === "leather" ? "url(#wood)" : "url(#steel)";
  const panel = item.body === "mail" ? `<path d="M32 39h32v42H32Z" fill="url(#steel)" opacity=".8"/><path d="M34 44h28m-28 7h28m-28 7h28m-28 7h28m-28 7h28" stroke="#eef1e8" stroke-width="2" stroke-dasharray="3 3"/>`
    : item.body === "robe" ? `<path d="M34 39 23 85h50L62 39Z" fill="url(#blue)" stroke="#c4b586" stroke-width="2"/><path d="M48 23v58" stroke="#efddb0" stroke-width="3"/>`
    : `<path d="M32 39h32v42H32Z" fill="${fill}" stroke="#d2c2a1" stroke-width="2"/><path d="M48 29v51m-16-25h32" stroke="#e5d5aa" stroke-width="3"/>`;
  return `<path d="M27 16 39 9h19l12 7 13 18-10 10-6-7v47H29V37l-6 7-10-10Z" fill="${fill}" stroke="#29323a" stroke-width="3"/>${panel}<path d="M39 9c0 14 17 14 19 0" fill="none" stroke="#e1cfab" stroke-width="3"/>${metalArmor ? `<circle cx="36" cy="43" r="3" fill="#f5e6c2"/><circle cx="60" cy="43" r="3" fill="#f5e6c2"/>` : ""}`;
}
function helmetShape(item) {
  const fill = item.style === "cloth" || item.name.includes("hood") ? "url(#wood)" : "url(#steel)";
  return `<path d="M17 59c0-28 11-46 31-46s31 18 31 46L66 82H30Z" fill="${fill}" stroke="#2d3439" stroke-width="3"/><path d="M25 55h46l-8 20H33Z" fill="#30353a" stroke="#d8c8a3" stroke-width="2"/><path d="M48 13v45" stroke="#f0e1b6" stroke-width="3"/><path d="M23 53h50" stroke="#d8c28f" stroke-width="4"/><circle cx="29" cy="53" r="3" fill="#fff0bd"/><circle cx="67" cy="53" r="3" fill="#fff0bd"/>`;
}
function shape(k) {
  const item = ITEMS[k];
  if (item?.slot === "weapon") return weaponShape(item.model);
  if (item?.slot === "shield") return `<path d="M48 8 79 25 74 63Q66 79 48 89 30 79 22 63L17 25Z" fill="${k === "road_shield" ? "url(#wood)" : "url(#steel)"}" stroke="#273039" stroke-width="4"/><path d="M48 18 69 30 65 60Q59 72 48 79 37 72 31 60L27 30Z" fill="${item.color}" stroke="url(#brass)" stroke-width="3"/><path d="M48 21v52M30 46h36" stroke="#f7e6bc" stroke-width="4"/><circle cx="48" cy="46" r="10" fill="url(#brass)" stroke="#5b452d" stroke-width="2"/>`;
  if (item?.slot === "armor") return armorShape(item);
  if (item?.slot === "helmet") return helmetShape(item);
  if (["healing_draught","greyfever_tonic"].includes(k)) return `<path d="M40 10h16v11l-5 4v8c15 9 25 23 25 41 0 9-7 14-17 14H37c-10 0-17-5-17-14 0-18 10-32 25-41v-8l-5-4Z" ${glass}/><path d="M25 61c15-8 33 6 46-1v16c0 5-5 8-12 8H37c-7 0-12-3-12-8Z" fill="${k === "greyfever_tonic" ? "#47b497" : "#bd3545"}" opacity=".9"/><path d="M36 12h24v9H36Z" ${wood}/><path d="M39 48c-7 9-9 20-8 27" stroke="#fff8dd" stroke-width="4" stroke-linecap="round" opacity=".7"/><path d="M48 64v15m-7-8h14" stroke="#fff2dc" stroke-width="4" stroke-linecap="round"/>`;
  if (k === "moonleaf") return `<path d="M47 84C49 58 47 39 51 14" fill="none" stroke="#59864e" stroke-width="5"/>${leaf(47,70,-35)}${leaf(48,53,37)}${leaf(49,36,-25)}${leaf(51,24,34)}<circle cx="55" cy="13" r="5" fill="#d6f5c4"/>`;
  if (k === "wild_berries") return `<path d="M46 81c8-23 7-38 3-62" fill="none" stroke="#547448" stroke-width="5"/>${leaf(47,45,-45)}${leaf(52,30,38)}${berry(35,54)}${berry(58,57)}${berry(48,74)}${berry(62,38)}`;
  if (k === "dusk_mushroom") return `<path d="M42 45h15l6 35c-9 9-24 9-32 0Z" fill="url(#ivory)" stroke="#5e5147" stroke-width="2"/><path d="M13 50c3-24 20-37 36-37S80 26 84 50c-17 10-51 12-71 0Z" fill="url(#mushroom)" stroke="#624031" stroke-width="3"/><path d="M21 50c21 7 45 8 58 0" fill="none" stroke="#efd0a8" stroke-width="4"/><circle cx="40" cy="29" r="4" fill="#f5d9b5"/><circle cx="58" cy="37" r="3" fill="#f5d9b5"/>`;
  if (k === "bread") return `<path d="M13 61c-5-27 7-43 36-46 29 3 40 19 34 46-2 13-16 22-34 23-18-1-32-10-36-23Z" fill="url(#bread)" stroke="#5b3925" stroke-width="3"/><path d="m30 35 8 16m12-24 7 17m14-9-7 16" stroke="#f9dba8" stroke-width="5" stroke-linecap="round"/><path d="M16 63c20 13 46 14 66 0" fill="none" stroke="#7f4e2a" stroke-width="3"/>`;
  if (["carving_stick","drywood"].includes(k)) return `<g transform="rotate(33 48 48)"><path d="M43 8c3-3 8-3 11 0l-3 80c-3 4-8 4-11 0Z" ${wood}/><path d="M46 17c6 12-5 20 3 33s-6 19-3 31" fill="none" stroke="#c69b65" stroke-width="2"/></g>`;
  if (["silver_ring","tide_pearl"].includes(k)) return `<circle cx="48" cy="54" r="28" fill="none" stroke="${k === "tide_pearl" ? "#9fe6e3" : "#cbd8df"}" stroke-width="10"/><circle cx="48" cy="54" r="28" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/><path d="M48 10 62 33 48 41 34 33Z" fill="${k === "tide_pearl" ? "url(#glass)" : "url(#blue)"}" stroke="#d7e9e6" stroke-width="2"/>`;
  if (["lantern_oil","torch"].includes(k)) return k === "torch" ? `<path d="M43 35h10l-4 53h-3Z" ${wood}/><path d="M37 25h22v20H37Z" fill="#57432c" stroke="#c59a62" stroke-width="2"/><path d="M48 4c16 15 13 26 0 34-13-8-16-19 0-34Z" fill="url(#fire)" stroke="#d27327" stroke-width="2"/>` : `<path d="M32 18h32v58c0 10-8 14-16 14s-16-4-16-14Z" ${glass}/><path d="M34 50h28v26c0 8-5 12-14 12s-14-4-14-12Z" fill="#c99442"/><path d="M37 10h22v12H37Z" ${wood}/>`;
  if (k === "road_map") return `<path d="M14 17 39 11 62 19 83 12v66L61 84 38 76 14 83Z" fill="url(#ivory)" stroke="#765b3d" stroke-width="3"/><path d="M39 11v65m23-57v65" stroke="#9b7950" stroke-width="2"/><path d="m22 66 13-13 10 5 15-20 13 2" fill="none" stroke="#b6533e" stroke-width="3" stroke-dasharray="5 3"/><circle cx="60" cy="38" r="5" fill="#ab4736"/>`;
  if (k === "lockpick") return `<path d="M25 79 70 22l7 6-45 57Z" ${metal}/><path d="m69 22 9-7 5 7-6 6" fill="none" stroke="#d6dfe2" stroke-width="5"/><circle cx="27" cy="80" r="5" fill="#ad8a5b"/>`;
  if (["wolf_pelt","leather_hood"].includes(k)) return `<path d="M19 24 31 13 48 20 65 13 78 24 70 45 83 78 62 70 48 86 34 70 13 78 26 45Z" fill="url(#fur)" stroke="#4a4234" stroke-width="3"/><path d="M30 31 44 39 58 31 67 47 48 71 29 47Z" fill="#b5a18a" opacity=".65"/>`;
  if (["gloam_fang","bone_shard","boar_tusk","stag_antler","hollow_antler"].includes(k)) return `<path d="M50 8c8 17 8 27 0 39-8 12-15 17-20 37 19-6 34-21 38-40C71 28 63 14 50 8Z" fill="url(#ivory)" stroke="#6d6659" stroke-width="3"/><path d="M51 17c6 13 5 24-1 33" fill="none" stroke="#fff8e9" stroke-width="3"/>`;
  return `<path d="M48 9 80 32 69 75 48 89 27 75 16 32Z" fill="url(#brass)" stroke="#5d4932" stroke-width="3"/><path d="M48 18 69 37 60 69 48 78 36 69 27 37Z" fill="${ITEMS[k]?.color || "#9cc9bd"}" stroke="#f4e4ba" stroke-width="2"/><path d="M48 26v43m-15-24h30" stroke="#fff5dc" stroke-width="3" opacity=".75"/>`;
}
export function itemArt(k) {
  if (cache.has(k)) return cache.get(k);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 96 96"><defs><linearGradient id="steel" x2="1" y2="1"><stop stop-color="#fff9e8"/><stop offset=".35" stop-color="#9eabb3"/><stop offset=".72" stop-color="#566773"/><stop offset="1" stop-color="#d1dad7"/></linearGradient><linearGradient id="wood" x2="1" y2="1"><stop stop-color="#d9aa70"/><stop offset=".5" stop-color="#815637"/><stop offset="1" stop-color="#3d2c23"/></linearGradient><linearGradient id="glass" x2="1" y2="1"><stop stop-color="#f2ffff" stop-opacity=".9"/><stop offset=".5" stop-color="#65b2a4" stop-opacity=".7"/><stop offset="1" stop-color="#1e596a" stop-opacity=".9"/></linearGradient><linearGradient id="leaf" x2="1" y2="1"><stop stop-color="#d7f2ad"/><stop offset=".55" stop-color="#69ae69"/><stop offset="1" stop-color="#306148"/></linearGradient><radialGradient id="berry"><stop stop-color="#f8868a"/><stop offset="1" stop-color="#8d243d"/></radialGradient><linearGradient id="mushroom" x2="1" y2="1"><stop stop-color="#e9b97c"/><stop offset="1" stop-color="#714c48"/></linearGradient><linearGradient id="ivory" x2="1" y2="1"><stop stop-color="#fff9e4"/><stop offset="1" stop-color="#a69b86"/></linearGradient><linearGradient id="bread" x2="1" y2="1"><stop stop-color="#ffe3a4"/><stop offset=".6" stop-color="#c48945"/><stop offset="1" stop-color="#714126"/></linearGradient><linearGradient id="brass" x2="1" y2="1"><stop stop-color="#fff0af"/><stop offset=".5" stop-color="#af7f3a"/><stop offset="1" stop-color="#59482c"/></linearGradient><linearGradient id="blue" x2="1" y2="1"><stop stop-color="#b5d3df"/><stop offset="1" stop-color="#485780"/></linearGradient><linearGradient id="fire" x2="1" y2="1"><stop stop-color="#fff5a3"/><stop offset=".55" stop-color="#ef8d31"/><stop offset="1" stop-color="#a43f29"/></linearGradient><linearGradient id="fur" x2="1" y2="1"><stop stop-color="#d0b394"/><stop offset="1" stop-color="#5e5247"/></linearGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="1" dy="3" stdDeviation="2" flood-color="#070a0d" flood-opacity=".65"/></filter></defs><g filter="url(#shadow)">${shape(k)}</g></svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  cache.set(k, uri);
  return uri;
}
export const itemImage = (k) => `<img class="item-art" src="${itemArt(k)}" alt="">`;
