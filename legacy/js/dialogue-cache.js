import { LocalDialogueCache } from "./save.js";

// A key describes the story state and the route taken through this conversation.
// Transient visit history, timestamps, and "met before" must not change it.
export async function dialogueKey(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

export function dialogueState({ npc, soul, context, allowed, path }) {
  const { player, questState, campParley, sideQuests, location, carryingMedicine,
    companions, sharedAncestry, ...reaction } = context;
  const { health, ...identity } = player;
  delete reaction.metBefore;
  delete reaction.day;
  delete reaction.gold;
  delete reaction.quest;
  return { version: 2, npc, soul, player: identity, questState, campParley,
    sideQuests, location, carryingMedicine, companions, sharedAncestry,
    reaction, allowed, path };
}

export class DialogueCache {
  constructor(mode, world) {
    this.mode = mode;
    this.world = world;
    this.hot = new Map();
  }
  async get(key) {
    if (this.hot.has(key)) return this.hot.get(key);
    let value = null;
    if (this.mode === "online") {
      const response = await fetch(`/api/dialogue-cache?key=${key}`);
      if (response.status !== 404) {
        if (!response.ok) throw new Error(`Dialogue cache read failed: ${response.status}`);
        value = (await response.json()).value;
      }
    } else {
      value = (await LocalDialogueCache.get(this.world, key))?.value;
    }
    if (value) this.remember(key, value);
    return value;
  }
  async put(key, value) {
    if (this.mode === "online") {
      const response = await fetch("/api/dialogue-cache", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value }),
      });
      if (!response.ok) throw new Error(`Dialogue cache write failed: ${response.status}`);
    } else {
      await LocalDialogueCache.put(this.world, key, value);
    }
    this.remember(key, value);
  }
  remember(key, value) {
    this.hot.delete(key);
    this.hot.set(key, value);
    if (this.hot.size > 150) this.hot.delete(this.hot.keys().next().value);
  }
}

export async function importOnlineDialogueCache(world) {
  let after = "";
  let count = 0;
  do {
    const response = await fetch(`/api/dialogue-cache/export?after=${encodeURIComponent(after)}`);
    if (!response.ok) throw new Error(`Online dialogue cache unavailable: ${response.status}`);
    const page = await response.json();
    const entries = page.entries || [];
    if (entries.length) count += await LocalDialogueCache.import(world, entries);
    after = page.next || "";
  } while (after);
  return count;
}

export async function importLocalDialogueCaches(world) {
  const entries = await LocalDialogueCache.allOtherWorlds(world);
  return LocalDialogueCache.import(world, entries);
}
