// Persistence: IndexedDB "unwritten-roads" (local mode) and /api/save (online).

const DB_NAME = "unwritten-roads";
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("characters")) d.createObjectStore("characters", { keyPath: "id" });
      if (!d.objectStoreNames.contains("saves")) d.createObjectStore("saves", { keyPath: "id" });
      if (!d.objectStoreNames.contains("dialogue_cache")) {
        const cache = d.createObjectStore("dialogue_cache", { keyPath: ["world", "key"] });
        cache.createIndex("world", "world");
      }
      if (!d.objectStoreNames.contains("cache_choices")) d.createObjectStore("cache_choices", { keyPath: "world" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
function tx(store, mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error("Save transaction was aborted."));
  }));
}

export const Local = {
  async list() {
    try {
      const all = await tx("saves", "readonly", (s) => s.getAll());
      return (all || []).sort((a, b) => b.updated_at - a.updated_at);
    } catch (e) { console.warn(e); return []; }
  },
  async save(id, data) {
    const rec = { id, data, updated_at: Date.now() };
    const d = await db();
    await new Promise((resolve, reject) => {
      const t = d.transaction(["saves", "characters"], "readwrite");
      t.objectStore("saves").put(rec);
      t.objectStore("characters").put({ id, name: data.char.name, data: data.char, updated_at: rec.updated_at });
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("Save transaction was aborted."));
    });
    return rec;
  },
  async remove(id) {
    await tx("saves", "readwrite", (s) => s.delete(id));
    await tx("characters", "readwrite", (s) => s.delete(id));
    await tx("cache_choices", "readwrite", (s) => s.delete(id));
    const d = await db();
    await new Promise((resolve, reject) => {
      const t = d.transaction("dialogue_cache", "readwrite");
      t.objectStore("dialogue_cache").index("world").openKeyCursor(IDBKeyRange.only(id)).onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) { t.objectStore("dialogue_cache").delete(cursor.primaryKey); cursor.continue(); }
      };
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  },
};

export const LocalDialogueCache = {
  get(world, key) { return tx("dialogue_cache", "readonly", (s) => s.get([world, key])); },
  put(world, key, value) { return tx("dialogue_cache", "readwrite", (s) => s.put({ world, key, value, updated_at: Date.now() })); },
  choice(world) { return tx("cache_choices", "readonly", (s) => s.get(world)); },
  setChoice(world, choice) { return tx("cache_choices", "readwrite", (s) => s.put({ world, choice })); },
  async allOtherWorlds(world) {
    const d = await db();
    const saveTimes = new Map((await Local.list()).map(rec => [rec.id, rec.updated_at || 0]));
    return new Promise((resolve, reject) => {
      const entries = new Map();
      const t = d.transaction("dialogue_cache", "readonly");
      t.objectStore("dialogue_cache").openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const row = cursor.value;
        if (row.world !== world && row.key && row.value) {
          row.updated_at ||= saveTimes.get(row.world) || 0;
          const prior = entries.get(row.key);
          if (!prior || (row.updated_at || 0) > (prior.updated_at || 0)) entries.set(row.key, row);
        }
        cursor.continue();
      };
      t.oncomplete = () => resolve([...entries.values()]);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("Cache read was aborted."));
    });
  },
  async import(world, entries) {
    const d = await db();
    return new Promise((resolve, reject) => {
      let merged = 0;
      const t = d.transaction("dialogue_cache", "readwrite");
      const s = t.objectStore("dialogue_cache");
      for (const { key, value, updated_at } of entries) {
        if (!key || !value) continue;
        const stamp = Number(updated_at) || 0;
        const get = s.get([world, key]);
        get.onsuccess = () => {
          if (!get.result || stamp > (get.result.updated_at || 0)) { s.put({ world, key, value, updated_at: stamp }); merged++; }
        };
      }
      t.oncomplete = () => resolve(merged);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("Cache import was aborted."));
    });
  },
};

export const Online = {
  async list() {
    const r = await fetch("/api/load");
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return (await r.json()).saves;
  },
  async save(id, data) {
    const r = await fetch("/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, data }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  },
  async remove(id) { await fetch("/api/save?id=" + encodeURIComponent(id), { method: "DELETE" }); },
};

export function store(mode) { return mode === "online" ? Online : Local; }
export const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
