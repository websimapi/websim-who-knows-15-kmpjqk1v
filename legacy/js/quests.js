import { NPCS, QUEST_TEXT } from "./data.js";
import { CITIZEN_NPCS } from "./citizens.js";
import { ITEMS } from "./items.js";

const CARDS = { ...NPCS, ...CITIZEN_NPCS };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clean = (s, fallback, max = 130) => typeof s === "string" && s.trim() ? s.trim().replace(/[<>]/g, "").slice(0, max) : fallback;
const hash = (s) => [...s].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 17) >>> 0;

export class QuestJournal {
  constructor(game) { this.g = game; game.state.generatedQuests ||= {}; }
  all(actor = this.g.player) { return this.g.social.actorState(actor).generatedQuests ||= {}; }
  open(actor = this.g.player) { return Object.values(this.all(actor)).filter(q => q.status === "open"); }
  available(key, actor = this.g.player) {
    if (![...Object.keys(NPCS), ...Object.keys(CITIZEN_NPCS)].includes(key) || ["alchemist", "carver", "bandit_captain"].includes(key)) return false;
    if (this.open(actor).some(q => q.giver === key)) return false;
    return this.targets(key).items.length > 0 && this.targets(key).contacts.length >= 2;
  }
  targets(giver) {
    const g = this.g;
    const items = [...new Set((g.world?.interactables || []).filter(i => i.kind === "gather" && !i.hidden && ITEMS[i.item]).map(i => i.item))];
    const contacts = (g.citizens || []).map(c => c.npc)
      .filter((key, i, keys) => key && key !== giver && CARDS[key] && !g.state.deadNpcs[key] && keys.indexOf(key) === i);
    return { items, contacts };
  }
  related(key, actor = this.g.player) { return Object.values(this.all(actor)).filter(q => [q.giver, ...q.contacts].includes(key)); }
  tags(key, actor = this.g.player) {
    const tags = [];
    if (this.available(key, actor)) tags.push("side:create");
    if (this.open(actor).some(q => q.node === "contact" && q.contacts.includes(key) && (this.g.social.actorInv(actor)?.[q.item] || 0) > 0)) tags.push("side:report");
    if (this.open(actor).some(q => q.node === "return" && q.giver === key && (this.g.social.actorInv(actor)?.[q.item] || 0) > 0)) tags.push("side:turnin");
    return tags;
  }
  option(tag, key, actor = this.g.player) {
    const q = this.open(actor).find(q => tag === "side:report" ? q.contacts.includes(key) && q.node === "contact" : q.giver === key && q.node === "return");
    if (tag === "side:create") return "Is there anything I can help you with?";
    if (tag === "side:report") return `I found ${ITEMS[q?.item]?.name || "the item"}. What do you make of it?`;
    if (tag === "side:turnin") return `I've returned with ${ITEMS[q?.item]?.name || "what you asked for"}.`;
    return "";
  }
  awareness(key, actor = this.g.player) {
    const related = this.related(key, actor);
    const relevant = [...related.filter(q => q.status === "open"), ...related.filter(q => q.status === "done")
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, 3)];
    return relevant.map(q => ({ id: q.id, title: q.title, giver: CARDS[q.giver]?.name,
      item: ITEMS[q.item]?.name, contacts: q.contacts.map(k => CARDS[k]?.name), current: q.node,
      branch: q.branch ? CARDS[q.branch]?.name : null, status: q.status,
      role: q.giver === key ? "quest giver" : "possible witness", steps: q.steps }));
  }
  async create(giver, actor = this.g.player) {
    if (!this.available(giver, actor)) return "I have no other work for you just now.";
    const pool = this.targets(giver), prior = Object.keys(this.all(actor)).length;
    const seed = hash(`${giver}:${prior}:${this.g.saveId}`);
    const item = pool.items[seed % pool.items.length];
    const contacts = [pool.contacts[seed % pool.contacts.length], pool.contacts[(seed + 1) % pool.contacts.length]];
    const card = CARDS[giver], itemName = ITEMS[item].name;
    let prose = null;
    try {
      const completion = await window.websim?.chat?.completions?.create?.({ json: true, messages: [
        { role: "system", content: "Write an original, short side quest for this fantasy game. Return JSON only: {title, premise, collect, contact, branchA, branchB, return}. The player must collect the named real item, consult either named real NPC, then return to the giver with the item. Branch A and B may interpret the evidence differently, but may not invent locations, rewards, items, NPCs, or changes to the main quest. Make the giver's motive fit their soul and work. Each field at most one sentence." },
        { role: "user", content: JSON.stringify({ giver: { name: card.name, role: card.role, wants: card.wants, personality: card.personality }, item: itemName, contacts: contacts.map(k => ({ name: CARDS[k].name, role: CARDS[k].role })), location: this.g.world.regionAt(actor.pos.x, actor.pos.z), existing: Object.values(this.all(actor)).slice(-8).map(q => q.title) }) },
      ] });
      prose = JSON.parse(completion.content);
    } catch (error) { console.warn("Side quest wording fallback", error); }
    const q = {
      id: `sq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, version: 1, giver, item, contacts,
      title: clean(prose?.title, `${card.name}'s Request`, 56), premise: clean(prose?.premise, `${card.name} needs ${itemName} and a second opinion before acting.`),
      steps: {
        collect: clean(String(prose?.collect || "").includes(itemName) ? prose.collect : null, `Find ${itemName} in the world.`),
        contact: clean(String(prose?.contact || "").includes(CARDS[contacts[0]].name) && String(prose?.contact || "").includes(CARDS[contacts[1]].name) ? prose.contact : null, `Speak with ${CARDS[contacts[0]].name} or ${CARDS[contacts[1]].name} while carrying ${itemName}.`),
        branches: {
          [contacts[0]]: clean(String(prose?.branchA || "").includes(CARDS[contacts[0]].name) ? prose.branchA : null, `${CARDS[contacts[0]].name} weighs in on ${itemName}.`),
          [contacts[1]]: clean(String(prose?.branchB || "").includes(CARDS[contacts[1]].name) ? prose.branchB : null, `${CARDS[contacts[1]].name} offers another reading of ${itemName}.`),
        },
        return: clean(String(prose?.return || "").includes(card.name) ? prose.return : null, `Return ${itemName} to ${card.name}.`),
      },
      graph: { collect: { on: "inventory:item", next: "contact" },
        contact: { on: "talk:contact", branches: { [contacts[0]]: { next: "return" }, [contacts[1]]: { next: "return" } } },
        return: { on: "talk:giver_with_item", next: "done" } },
      node: "collect", completed: [], branch: null, status: "open", createdAt: Date.now(),
    };
    this.all(actor)[q.id] = q;
    await this.remember(q, `Asked the player to find ${itemName}, speak to ${contacts.map(k => CARDS[k].name).join(" or ")}, then return.`, [giver, ...contacts], actor);
    this.refresh(actor);
    this.g.log(`Quest: ${q.title}`, "crit");
    return `${card.name} asks you to find ${itemName}, consult ${CARDS[contacts[0]].name} or ${CARDS[contacts[1]].name}, and bring it back.`;
  }
  async remember(q, fact, keys, actor = this.g.player) {
    if (this.g._npcMemoryQueue) await this.g._npcMemoryQueue.catch(() => {});
    for (const key of keys) {
      const oldActor = this.g.conversationActor;
      this.g.conversationActor = actor;
      const memory = await this.g.loadNpcMemory(key) || { version: 1, impression: "A stranger until proven otherwise.", events: [], attitude: 0 };
      this.g.conversationActor = oldActor;
      memory.version = 1; memory.events ||= [];
      const knownFact = q.node === "collect" && key !== q.giver ? `${CARDS[q.giver].name} has asked the player to find ${ITEMS[q.item].name}; ${CARDS[key].name} may be asked for an opinion.` : fact;
      memory.events = [...memory.events.filter(e => e.questId !== q.id), { at: Date.now(), questId: q.id, npc: "Quest commitment", player: "", tag: "quest", outcome: knownFact }].slice(-12);
      this.g.saveNpcMemory(key, memory);
      if (this.g.dialogue?.key === key && this.g.dialogue.open) this.g.dialogue.memory = memory;
    }
    if (this.g._npcMemoryQueue) await this.g._npcMemoryQueue.catch(() => {});
  }
  refresh(actor = this.g.player) {
    const inv = this.g.social.actorInv(actor) || {};
    let changed = false;
    for (const q of this.open(actor)) if (q.node === "collect" && (inv[q.item] || 0) > 0) {
      q.completed.push("collect"); q.node = "contact"; changed = true;
      this.g.toast(q.title, q.steps.contact);
    }
    if (changed) this.g.save();
    this.g.renderQuest();
    this.g.social.renderJournal?.();
  }
  async act(key, tag, actor = this.g.player) {
    if (tag === "side:create") return this.create(key, actor);
    const q = this.open(actor).find(q => tag === "side:report" ? q.node === "contact" && q.graph?.contact?.branches?.[key] : q.node === "return" && q.giver === key);
    if (!q || (this.g.social.actorInv(actor)?.[q.item] || 0) < 1) return "Bring the requested item first.";
    if (tag === "side:report") {
      q.branch = key; q.completed.push("contact"); q.node = "return";
      await this.remember(q, `${CARDS[key].name} examined ${ITEMS[q.item].name}. The player chose this account and will return to ${CARDS[q.giver].name}.`, [q.giver, ...q.contacts], actor);
      this.refresh(actor); await this.g.save(); return q.steps.branches[key];
    }
    // The item is handed over on completion. In online realms use a server-checked
    // inventory removal so the shared realm stays authoritative.
    if (this.g.social.net) {
      const result = await new Promise(resolve => {
        const timeout = setTimeout(() => { this.pendingTurnin = null; resolve({ ok: false, reason: "The realm did not confirm the handoff." }); }, 7000);
        this.pendingTurnin = message => { if (message.questId !== q.id) return; clearTimeout(timeout); this.pendingTurnin = null; resolve(message); };
        this.g.social.net.send({ type: "quest_turnin", item: q.item, questId: q.id });
      });
      if (!result.ok) return result.reason || "The handoff failed.";
    }
    else { const inv = this.g.social.actorInv(actor); inv[q.item]--; if (!inv[q.item]) delete inv[q.item]; }
    q.completed.push("return"); q.node = "done"; q.status = "done"; q.completedAt = Date.now();
    await this.remember(q, `${CARDS[q.giver].name} received ${ITEMS[q.item].name}. The player completed ${q.title} after consulting ${CARDS[q.branch].name}.`, [q.giver, ...q.contacts], actor);
    this.g.gainXP(90, actor); this.g.toast(q.title, "Quest complete"); this.g.social.renderInv(); this.refresh(actor); this.g.save();
    return `${CARDS[q.giver].name} accepts ${ITEMS[q.item].name} and remembers that ${CARDS[q.branch].name} helped.`;
  }
  render(actor = this.g.player) {
    const g = this.g, s = g.social.actorState(actor), main = QUEST_TEXT.bitter_medicine;
    const keys = Object.keys(main.steps), at = keys.indexOf(g.state.main);
    const major = `<article class="journal-card"><span class="journal-kind">MAJOR QUEST</span><h3>${esc(main.name)}</h3><ol>${keys.map((key, i) => `<li class="${i < at ? "complete" : i === at ? "current" : "future"}"><span>${i < at || key === "done" && i === at ? "✓" : i === at ? "◆" : "○"}</span>${esc(main.steps[key])}</li>`).join("")}</ol></article>`;
    const fixed = Object.entries(s.quests || {}).filter(([key, status]) => QUEST_TEXT[key] && status).map(([key, status]) => `<article class="journal-card"><span class="journal-kind">SIDE QUEST · ${status === "done" ? "COMPLETED" : "ACTIVE"}</span><h3>${esc(QUEST_TEXT[key].name)}</h3><p>${esc(QUEST_TEXT[key].steps[status] || "")}</p></article>`).join("");
    const generated = Object.values(this.all(actor)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(q => {
      const item = ITEMS[q.item]?.name || q.item, giver = CARDS[q.giver]?.name || q.giver;
      const steps = [
        ["collect", q.steps.collect], ["contact", q.branch ? q.steps.branches[q.branch] : q.steps.contact], ["return", q.steps.return],
      ];
      return `<article class="journal-card"><span class="journal-kind">GENERATED SIDE QUEST · ${q.status === "done" ? "COMPLETED" : "ACTIVE"}</span><h3>${esc(q.title)}</h3><p>${esc(q.premise)}</p><ol>${steps.map(([node, text]) => `<li class="${q.completed.includes(node) ? "complete" : q.node === node ? "current" : "future"}"><span>${q.completed.includes(node) ? "✓" : q.node === node ? "◆" : "○"}</span>${esc(text)}</li>`).join("")}</ol><small>From ${esc(giver)} · ${esc(item)}${q.branch ? ` · Consulted ${esc(CARDS[q.branch]?.name)}` : ""}</small></article>`;
    }).join("");
    return `<div class="journal-scroll">${major}<h2>Side quests</h2>${fixed}${generated || !fixed ? generated || '<p class="journal-empty">No side quests yet.</p>' : ""}</div>`;
  }
}
