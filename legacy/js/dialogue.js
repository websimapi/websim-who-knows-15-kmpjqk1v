// AI NPC dialogue: the model writes the NPC line + 3–4 player options, each
// mapped to an allowed outcome tag; the rules engine applies tags (the model
// can never set morality directly). Authored fallbacks when AI is offline.
// Lines are spoken with websim TTS and shown as subtitles.
import { NPCS, FALLBACK } from "./data.js";
import { CITIZEN_NPCS } from "./citizens.js";
import { NPC_TOPICS } from "./dialogue-topics.js";
import { characterVoice, speakText, stopSpeech } from "./speech.js";
import { dialogueKey, dialogueState } from "./dialogue-cache.js";

const $ = (s) => document.querySelector(s);
const SOURCES = ["none", "class", "ancestry", "background", "history", "quest"];
const EMOTIONS = ["neutral", "warm", "afraid", "angry", "sad", "amused", "suspicious"];
const CLASS_HOOKS = {
  Vanguard: [/guard|patrol|wall|gate|brigand|crew|caravan|safe/, "guard training and protecting people"],
  Trailblazer: [/road|route|track|caravan|courier|mule|wild|quarry/, "reading routes, tracks, and terrain"],
  Arcanist: [/fracture|shrine|magic|heat|fire|glass|light|stone|dust/, "recognizing arcane signs and unstable forces"],
  Lifekeeper: [/sick|fever|heal|medicine|patient|chapel|shrine|herb/, "healing knowledge and care for the vulnerable"],
};
const ANCESTRY_HOOKS = {
  Bronzeborn: /stone|wall|arch|quarry|mason|tunnel/,
  Thornkin: /herb|seed|plant|fever|sick|medicine/,
  Saltborn: /river|dock|fish|boat|ferry|rope/,
  Cindrel: /forge|smith|glass|fire|heat/,
  Gloamling: /dark|lamp|light|shrine|chapel/,
  Skyrill: /route|road|courier|caravan|track/,
  Hollowed: /road|fracture|sunken|shrine|spirit/,
  Rookfolk: /letter|courier|message|inn|trade/,
  Drakesworn: /fire|heat|forge|smith/,
};
const BACKGROUND_HOOKS = {
  "Field Medic": /fever|sick|heal|medicine|patient|herb/,
  "Disgraced Guard": /guard|patrol|wall|gate|brigand|crew/,
  "Charter Clerk": /compact|contract|merchant|trade|price|debt|caravan/,
  "Tunnel Scout": /tunnel|quarry|stone|road|route|track/,
  "Hedge Naturalist": /herb|seed|plant|river|fever|wild/,
  "Workshop Apprentice": /forge|smith|glass|bell|mason|repair/,
};

export function dialogueHooks(card, context, topics = []) {
  const subject = `${card.role} ${card.wants} ${topics.join(" ")}`.toLowerCase();
  const player = context.player;
  const hooks = [];
  const classRule = CLASS_HOOKS[player.class];
  if (classRule?.[0].test(subject)) hooks.push({ source: "class", cue: `${player.class}: ${classRule[1]}` });
  if (context.sharedAncestry) hooks.push({ source: "ancestry", cue: `The player and ${card.name} share ${player.ancestry} ancestry.` });
  else if (ANCESTRY_HOOKS[player.ancestry]?.test(subject)) hooks.push({ source: "ancestry", cue: `${player.ancestry} heritage or trait is relevant to this work.` });
  if (BACKGROUND_HOOKS[player.background]?.test(subject)) hooks.push({ source: "background", cue: `${player.background} training may offer a grounded angle.` });
  if (context.metBefore) hooks.push({ source: "history", cue: "A previous exchange may shape this NPC's trust." });
  return hooks;
}

// The model selects a permitted check; it cannot set the DC or modifiers.
export const DIALOGUE_CHECKS = {
  insight: { abilities: ["Wisdom"], skill: "insight", dc: 12 },
  investigation: { abilities: ["Intelligence"], skill: "investigation", dc: 13 },
  forceful_threat: { abilities: ["Strength", "Charisma"], skill: "intimidation", dc: 12 },
  social_threat: { abilities: ["Charisma"], skill: "intimidation", dc: 12 },
  expose_lie: { abilities: ["Wisdom", "Intelligence"], skill: "insight", dc: 12 },
  recruit: { abilities: ["Charisma"], skill: "persuasion", dc: 10 },
  parley_persuade: { abilities: ["Charisma"], skill: "persuasion", dc: 14 },
  parley_intimidate: { abilities: ["Strength", "Charisma"], skill: "intimidation", dc: 12 },
  parley_deceive: { abilities: ["Charisma", "Intelligence"], skill: "deception", dc: 15 },
  parley_join: { abilities: ["Charisma"], skill: "persuasion", dc: 13 },
  parley_turncoat: { abilities: ["Charisma", "Wisdom"], skill: "persuasion", dc: 12 },
  alchemy_aptitude: { abilities: ["Intelligence", "Wisdom"], skill: "alchemy", dc: 12 },
};
const CHECKS_FOR_TAG = {
  talk: ["insight", "investigation"],
  "deed:threaten": ["forceful_threat", "social_threat"],
  "deed:expose_lie": ["expose_lie"],
  recruit: ["recruit"],
  "parley:persuade": ["parley_persuade"],
  "parley:intimidate": ["parley_intimidate"],
  "parley:deceive": ["parley_deceive"],
  "parley:join": ["parley_join"],
  "parley:turncoat": ["parley_turncoat"],
  "alchemy:skip": ["alchemy_aptitude"],
};

// Authored option text per tag (fallback + guidance for the model).
export const TAG_TEXT = {
  talk: { text: "Tell me more.", tone: "neutral" },
  "side:create": { text: "Is there anything I can help you with?", tone: "kind" },
  "side:report": { text: "I found what was needed. What do you make of it?", tone: "neutral" },
  "side:turnin": { text: "I have returned with what you asked for.", tone: "kind" },
  "alchemy:start": { text: "Teach me to make a healing draught.", tone: "kind" },
  "alchemy:skip": { text: "I know these ingredients. May I show you?", tone: "clever" },
  "alchemy:complete": { text: "I have gathered the fresh ingredients.", tone: "kind" },
  end: { text: "Farewell.", tone: "leave" },
  "advance:marrowgate": { text: "What happened to the medicine caravan?", tone: "neutral" },
  "advance:brightwell": { text: "I'll bring your medicine back.", tone: "kind" },
  return_medicine: { text: "Here — the medicine. Free of charge.", tone: "kind" },
  sell_medicine: { text: "The crates are yours. Three hundred gold.", tone: "cruel" },
  split_medicine: { text: "Half for the village, half for the Compact.", tone: "neutral" },
  "deed:threaten": { text: "Talk, or I'll make you talk.", tone: "cruel" },
  "deed:give_supplies": { text: "Take my provisions — for the sick.", tone: "kind" },
  "deed:heal_civilian": { text: "Let me help tend the sick.", tone: "kind" },
  forgive_debt: { text: "Consider your debt forgiven.", tone: "kind" },
  collect_debt: { text: "Pay what you owe. Now.", tone: "cruel" },
  recruit: { text: "Travel with me.", tone: "neutral" },
  rest: { text: "I need rest.", tone: "neutral" },
  heal: { text: "Can you tend my wounds?", tone: "neutral" },
  "quest:folio": { text: "Any work going?", tone: "neutral" },
  "deed:spare": { text: "Go. Live. Don't let me see you again.", tone: "kind" },
  "deed:kill_surrendered": { text: "(Draw steel) No mercy for Compact dogs.", tone: "cruel" },
  "deed:expose_lie": { text: "Tell me who ordered the caravan taken.", tone: "neutral" },
  "parley:persuade": { text: "Nobody needs to die over crates. Walk away.", tone: "kind" },
  "parley:intimidate": { text: "Leave now, or be buried here.", tone: "cruel" },
  "parley:deceive": { text: "The Compact sent me. The deal's off — they're coming for you.", tone: "neutral" },
  "parley:join": { text: "Give me a share. I'll help you sell the medicine.", tone: "cruel" },
  "parley:turncoat": { text: "Orrin used your crew. Help me take the medicine to Brightwell instead.", tone: "kind" },
  fight: { text: "(Attack)", tone: "cruel" },
};

export class Dialogue {
  constructor({ engine, audio, cache }) {
    this.engine = engine; // game state, check bonus/roll, and per-NPC memory access
    this.audio = audio;
    this.cache = cache;
    this.el = $("#dialogue");
    this.open = false;
    this.history = [];
    this.recentChoices = [];
    this.path = [];
    this.session = 0;
    this.memory = { version: 1, events: [], secretsUnlocked: false, attitude: 0 };
    addEventListener("keydown", (e) => {
      if (!this.open || this.busy) return;
      if (this.engine.keyboardOwns?.() === false) return;
      const n = parseInt(e.key);
      if (n >= 1 && n <= 5) { const b = this.el.querySelectorAll(".d-options button")[n - 1]; b?.click(); }
      if (e.code === "Escape") this.close();
    });
  }

  async start(key, card) {
    if (!NPCS[key] && !CITIZEN_NPCS[key]) return;
    stopSpeech();
    const session = ++this.session;
    this.key = key;
    this.card = card || NPCS[key] || CITIZEN_NPCS[key];
    this.history = [];
    this.recentChoices = [];
    this.path = [];
    this.currentLine = "";
    this.failedTags = new Set();
    this.usedTalkChecks = new Set();
    this.memory = { version: 1, events: [], secretsUnlocked: false, attitude: 0 };
    this.open = true;
    this.busy = true;
    this.el.classList.remove("hidden");
    $(".d-name").textContent = `${this.card.name} · ${this.card.role}`;
    this.setLine("…", true);
    this.setOptions([]);
    await this.loadLore(key, session);
    if (this.open && this.session === session) await this.turn(null);
  }
  async loadLore(key, session) {
    const path = `./npc/${encodeURIComponent(key)}/`;
    const [soul, seed] = await Promise.all([
      fetch(path + "soul.md").then((r) => r.ok ? r.text() : "").catch(() => ""),
      fetch(path + "Memory.json").then((r) => r.ok ? r.json() : {}).catch(() => ({})),
    ]);
    if (!this.open || this.session !== session) return;
    this.soul = soul || `${this.card.personality}\nWants: ${this.card.wants}\nNever: ${this.card.never}`;
    const saved = await this.engine.loadMemory?.(key) || {};
    if (!this.open || this.session !== session) return;
    this.memory = {
      version: 1,
      impression: saved.impression || seed.impression || "A stranger until proven otherwise.",
      events: Array.isArray(saved.events) ? saved.events.slice(-12) : Array.isArray(seed.events) ? seed.events.slice(-12) : [],
      secretsUnlocked: !!saved.secretsUnlocked,
      attitude: Math.max(-6, Math.min(6, Number(saved.attitude) || 0)),
    };
    this.seedMemory = {
      version: 1, impression: seed.impression || "A stranger until proven otherwise.",
      events: Array.isArray(seed.events) ? seed.events.slice(-12) : [],
      secretsUnlocked: false, attitude: 0,
    };
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.session++;
    this.el.classList.add("hidden");
    stopSpeech();
    this.engine.onClose?.(this.key);
  }

  setLine(t, thinking, emotion = "neutral") {
    const l = $(".d-line");
    l.textContent = t;
    l.classList.toggle("thinking", !!thinking);
    l.dataset.emotion = emotion;
  }
  checkFor(option) {
    const permitted = CHECKS_FOR_TAG[option.tag] || [];
    const id = permitted.includes(option.check_id) ? option.check_id : option.tag === "talk" ? null : permitted[0];
    return id ? DIALOGUE_CHECKS[id] : null;
  }
  setOptions(opts) {
    const box = $(".d-options");
    box.innerHTML = "";
    const player = this.engine.context(this.key).player;
    if (opts.length && this.card?.shop) opts = [...opts.filter(o => o.tag !== "end"),
      { tag: "shop", text: "Trade", tone: "neutral", source: "none" }, ...opts.filter(o => o.tag === "end")];
    opts.forEach((o, i) => {
      const b = document.createElement("button");
      const check = this.checkFor(o);
      const chk = check ? `<span class="chk">[${check.abilities.join(" + ")} · ${check.skill} DC ${check.dc} · ${this.chance(check)}%]</span>` : "";
      const label = o.source === "class" ? player.class : o.source === "ancestry" ? player.ancestry
        : o.source === "background" ? player.background : o.source === "history" ? "Remembered"
        : o.source === "quest" ? "Quest" : "";
      const source = label ? `<span class="origin">[${escapeHtml(label)}]</span>` : "";
      b.innerHTML = `<span class="n">${i + 1}</span>${source}${chk}<span class="t-${o.tone || "neutral"}">${escapeHtml(o.text)}</span>`;
      b.onclick = () => this.choose(o);
      box.append(b);
    });
  }
  chance(check) {
    const bonus = this.engine.checkBonus(check);
    return Math.max(5, Math.min(95, (21 - (check.dc - bonus)) * 5));
  }

  async choose(o) {
    if (this.busy || !this.open) return;
    if (o.tag === "shop") { this.engine.openShop?.(this.key); return; }
    this.busy = true;
    stopSpeech(); // The player protagonist remains silent, as specified in the design.
    const session = this.session;
    this.engine.onReply?.();
    $(".d-name").textContent = this.engine.context(this.key).player.name;
    this.setLine(o.text, false);
    this.setOptions([]);
    await new Promise((resolve) => setTimeout(resolve, this.checkFor(o) ? 1040 : 2100));
    if (!this.open || session !== this.session) return;
    const check = this.checkFor(o);
    const roll = check ? await this.engine.rollCheck(check, this.engine.checkBonus(check)) : null;
    if (!this.open || session !== this.session) return;
    const ok = roll ? roll.success : true;
    if (roll && o.tag === "talk") this.usedTalkChecks.add(o.check_id);
    if (roll && !ok && o.tag !== "talk") this.failedTags.add(o.tag);
    if (ok && check && (o.tag === "talk" || o.tag === "deed:expose_lie")) this.memory.secretsUnlocked = true;
    const feeling = o.tone === "kind" ? 1 : o.tone === "cruel" ? -1 : 0;
    this.memory.attitude = Math.max(-6, Math.min(6, this.memory.attitude + feeling));
    const note = await this.engine.onTag(this.key, o.tag, ok, { roll, checkId: o.check_id }) || "";
    if (!this.open || session !== this.session) return;
    const outcome = roll ? `${roll.success ? "success" : "failure"} on ${check.abilities.join(" + ")} ${check.skill}` : "choice made";
    this.path.push({ tag: o.tag, text: o.text, check: o.check_id || "none", outcome: roll ? !!roll.success : null });
    this.history.push({ role: "user", content: `${o.text} [${outcome}${note ? "; " + note : ""}]` });
    this.memory.events.push({ at: Date.now(), npc: this.currentLine || "", player: o.text, tag: o.tag,
      check: roll ? { abilities: check.abilities, skill: check.skill, dc: check.dc, total: roll.total, success: roll.success } : null,
      outcome: note || outcome });
    this.memory.events = this.memory.events.slice(-12);
    this.engine.saveMemory?.(this.key, structuredClone(this.memory));
    if (o.tag === "end" || o.tag === "fight" || note === "__close") { this.close(); return; }
    this.engine.onNpcTurn?.();
    $(".d-name").textContent = `${this.card.name} · ${this.card.role}`;
    await this.turn(o);
  }

  async turn(last) {
    this.busy = true;
    const session = this.session;
    const scene = { npc: this.key, card: this.card, player: this.engine.context(this.key).player,
      usedTalkChecks: new Set(this.usedTalkChecks), hasHistory: this.memory.events.length > 0 };
    this.setLine("…", true);
    this.setOptions([]);
    const allowed = this.engine.allowedTags(this.key).filter((tag) => !this.failedTags.has(tag));
    if (this.key === "alchemist") {
      const ctx = this.engine.context(this.key);
      const state = ctx.alchemy;
      const line = state === "done" ? "Your hand knows the measure now. The table is yours to use."
        : state === "open" ? "Fresh moonleaf, a dusk mushroom, and wild berries. Bring each from the road, then we will brew together."
        : "My table is for those who have learned the work. Start with a simple healing draught.";
      const tags = state === "done" ? ["end"] : state === "open" ? ["alchemy:skip", "alchemy:complete", "end"] : ["alchemy:start", "end"];
      const options = tags.filter((tag) => allowed.includes(tag)).map((tag) => ({ tag, text: TAG_TEXT[tag].text, tone: TAG_TEXT[tag].tone, check_id: CHECKS_FOR_TAG[tag]?.[0] || "none", source: tag === "alchemy:skip" ? (ctx.player.class === "Lifekeeper" || ctx.player.class === "Arcanist" ? "class" : "ancestry") : "quest" }));
      this.currentLine = line;
      this.setLine(line, false);
      this.setOptions(options);
      this.busy = false;
      void this.speak(line, characterVoice(this.card));
      return;
    }
    let res = null;
    let key = null;
    try {
      key = await dialogueKey(dialogueState({ npc: this.key, soul: this.soul,
        context: this.engine.context(this.key), allowed, path: this.path }));
      res = this.normalizeResult(await this.cache?.get(key), allowed, scene);
      // Migrate an opening generated by revision 42. Its key included the
      // initial memory and metBefore=false, so a simple leave broke reuse.
      if (!res && !this.path.length && this.seedMemory) {
        const context = { ...this.engine.context(this.key), metBefore: false };
        const legacyKey = await dialogueKey({ version: 1, npc: this.key, soul: this.soul,
          context, allowed, memory: this.seedMemory, history: [], recentChoices: [], usedTalkChecks: [] });
        res = this.normalizeResult(await this.cache?.get(legacyKey), allowed, scene);
        if (res) void this.cache?.put(key, res).catch((error) => console.warn("Dialogue cache migration unavailable", error));
      }
    } catch (error) { console.warn("Dialogue cache read unavailable", error); }
    if (!this.open || session !== this.session) return;
    if (!res) {
      try { res = this.normalizeResult(await this.ai(allowed), allowed, scene); }
      catch (e) { console.warn("AI dialogue fallback", e); }
      if (res && key) {
        try { await this.cache?.put(key, res); }
        catch (error) { console.warn("Dialogue cache write unavailable", error); }
      }
    }
    if (!this.open || session !== this.session) return;
    res = res || this.fallback(allowed, last);
    this.currentLine = res.npc_line;
    this.history.push({ role: "assistant", content: res.npc_line });
    this.history = this.history.slice(-8);
    this.recentChoices.push(...res.options.filter((option) => option.tag !== "end").map((option) => option.text));
    this.recentChoices = this.recentChoices.slice(-12);
    this.setLine(res.npc_line, false, res.emotion);
    this.setOptions(res.options);
    this.busy = false;
    void this.speak(res.npc_line, characterVoice(this.card));
  }

  normalizeResult(res, allowed, scene = { npc: this.key, card: this.card,
    player: this.engine.context(this.key).player, usedTalkChecks: this.usedTalkChecks,
    hasHistory: this.memory.events.length > 0 }) {
    if (!res || !Array.isArray(res.options)) return null;
    const options = [];
    const seen = new Set();
    const { player, npc, card, usedTalkChecks, hasHistory } = scene;
    for (const raw of res.options) {
      if (!raw || typeof raw.text !== "string" || !allowed.includes(raw.tag)) continue;
      const text = raw.text.trim().split(/\s+/).slice(0, 18).join(" ");
      if (!text || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      const checks = (CHECKS_FOR_TAG[raw.tag] || []).filter((id) => raw.tag !== "talk" || !usedTalkChecks.has(id));
      const check_id = checks.includes(raw.check_id) ? raw.check_id : raw.tag === "talk" ? "none" : checks[0] || "none";
      let source = SOURCES.includes(raw.source) ? raw.source : "none";
      if ((source === "class" && !player.class) || (source === "ancestry" && !player.ancestry)
        || (source === "background" && !player.background) || (source === "history" && !hasHistory)) source = "none";
      options.push({ text, tag: raw.tag, check_id: raw.tag === "end" ? "none" : check_id,
        source: raw.tag === "end" ? "none" : source,
        tone: raw.tag === "end" ? "leave" : ["kind", "neutral", "clever", "cruel", "leave"].includes(raw.tone) ? raw.tone : "neutral" });
    }
    if (!options.length) return null;
    const topics = NPC_TOPICS[npc] || ["What is happening here?", "What does this place need?"];
    for (const text of topics) {
      if (options.length >= 3 || !allowed.includes("talk") || seen.has(text.toLowerCase())) break;
      options.push({ text, tag: "talk", check_id: "none", source: "none", tone: "neutral" });
      seen.add(text.toLowerCase());
    }
    const critical = allowed.find((tag) => tag.startsWith("advance:") || ["return_medicine", "sell_medicine", "split_medicine"].includes(tag))
      || allowed.find((tag) => ["side:turnin", "side:report", "side:create"].includes(tag));
    if (critical && !options.some((option) => option.tag === critical)) {
      options.push({ tag: critical, text: this.engine.sideOption?.(critical, this.key) || TAG_TEXT[critical].text, tone: TAG_TEXT[critical].tone,
        check_id: "none", source: "quest" });
    }
    const end = options.find((o) => o.tag === "end") || { text: "I should go.", tag: "end", check_id: "none", source: "none", tone: "leave" };
    const gate = npc === "bandit_captain";
    const evidenceCheck = gate && !this.engine.context(npc).plotEvidence
      ? ["investigation", "insight"].find((id) => !usedTalkChecks.has(id)) : null;
    const evidenceReply = evidenceCheck && allowed.includes("talk")
      ? options.find((option) => option.tag === "talk" && ["investigation", "insight"].includes(option.check_id)) || {
        tag: "talk", text: "Your story doesn't fit. Who paid for this caravan?", tone: "clever", check_id: evidenceCheck, source: "none",
      } : null;
    const requiredGateTags = gate ? ["parley:join", "parley:turncoat", "fight"].filter((tag) => allowed.includes(tag)) : [];
    const replies = options.filter((o) => o.tag !== "end").slice(0, gate ? 4 : 3);
    if (critical && !replies.some((option) => option.tag === critical)) {
      let replace = replies.length - 1;
      for (let i = 0; i < replies.length; i++) if (replies[i].tag === "talk") replace = i;
      replies[replace] = options.find((option) => option.tag === critical);
    }
    const side = ["side:turnin", "side:report", "side:create"].find(tag => allowed.includes(tag));
    if (side && !replies.some(option => option.tag === side) && !gate) {
      const choice = options.find(option => option.tag === side) || { tag: side,
        text: this.engine.sideOption?.(side, npc) || TAG_TEXT[side].text, tone: TAG_TEXT[side].tone,
        check_id: "none", source: "quest" };
      const index = replies.findLastIndex(option => option.tag === "talk");
      replies[index >= 0 ? index : replies.length < 3 ? replies.length : replies.length - 1] = choice;
    }
    if (evidenceReply && !replies.some((option) => option.tag === "talk" && ["investigation", "insight"].includes(option.check_id))) {
      const plainTalk = replies.findIndex((option) => option.tag === "talk");
      const replace = replies.findLastIndex((option) => !requiredGateTags.includes(option.tag));
      replies[plainTalk >= 0 ? plainTalk : replies.length < 4 ? replies.length : replace] = evidenceReply;
    }
    if (gate) for (const tag of requiredGateTags) {
      if (replies.some((option) => option.tag === tag)) continue;
      const replacement = options.find((option) => option.tag === tag) || {
        tag, text: TAG_TEXT[tag].text, tone: TAG_TEXT[tag].tone, check_id: CHECKS_FOR_TAG[tag]?.[0] || "none", source: "quest",
      };
      const index = replies.findIndex((option) => option.tag === "talk" && option !== evidenceReply && !["insight", "investigation"].includes(option.check_id));
      const unprotected = replies.findLastIndex((option) => !requiredGateTags.includes(option.tag) && option !== evidenceReply
        && !(option.tag === "talk" && ["insight", "investigation"].includes(option.check_id)));
      replies[index >= 0 ? index : replies.length < 4 ? replies.length : unprotected] = replacement;
    }
    if (replies.length < 2) return null;
    const npc_line = typeof res.npc_line === "string" && res.npc_line.trim()
      ? res.npc_line.trim().split(/\s+/).slice(0, 60).join(" ") : card.greeting || FALLBACK.default.line;
    return { npc_line, emotion: EMOTIONS.includes(res.emotion) ? res.emotion : "neutral", options: [...replies, end] };
  }

  speak(text, voice = "en-female") {
    return speakText(text, voice);
  }

  promptMemory() {
    return { ...this.memory, events: this.memory.events.map(({ at, check, ...event }) => ({
      ...event, check: check ? { abilities: check.abilities, skill: check.skill, dc: check.dc, success: check.success } : null,
    })) };
  }

  async ai(allowed) {
    if (!window.websim?.chat?.completions?.create) return null;
    const c = this.card, ctx = this.engine.context(this.key);
    const checks = Object.entries(CHECKS_FOR_TAG).filter(([tag]) => allowed.includes(tag))
      .flatMap(([tag, ids]) => ids.filter((id) => tag !== "talk" || !this.usedTalkChecks.has(id))
        .map((id) => ({ tag, id, ...DIALOGUE_CHECKS[id] })));
    const checkIds = ["none", ...new Set(checks.map((check) => check.id))];
    const hooks = dialogueHooks(c, ctx, NPC_TOPICS[this.key] || []);
    const promptMemory = this.promptMemory();
    const lastMemory = [...promptMemory.events].reverse().find((event) => event.tag !== "end");
    const entrance = ctx.metBefore && lastMemory
      ? `${ctx.player.name} returns. Their last remembered words were "${lastMemory.player}"; the outcome was ${lastMemory.outcome}. React to that history when relevant.`
      : `${ctx.player.name} ${ctx.metBefore ? "returns to" : "approaches"} ${c.name} at ${ctx.location}. ${ctx.metBefore ? "They have met before." : "This is their first meeting."}`;
    const sys = `You perform ${c.name}, ${c.role}, in the original fantasy RPG The Unwritten Roads. Stay in character. Teen rating: mild language only, no sexual content, slurs, or graphic gore. Never refer to the real world or the model.

SOUL (private character direction):
${this.soul}
Current quest commitments involving this NPC are additions to this soul and must guide their knowledge and motives: ${JSON.stringify(ctx.questAwareness || [])}

NPC card: ${JSON.stringify({ name: c.name, ancestry: c.ancestry, role: c.role, personality: c.personality, wants: c.wants, never: c.never, secret: c.secrets })}
Concrete subjects this NPC can discuss: ${JSON.stringify(NPC_TOPICS[this.key] || [])}
Persistent personal memory with this player: ${JSON.stringify(promptMemory)}
Current game facts: ${JSON.stringify(ctx)}
Eligible identity and relationship hooks for this scene: ${JSON.stringify(hooks)}
Public world facts: The Old Road collapsed. Brightwell has greyfever. A medicine caravan is missing. Some travelers fear Gallowmere Watch and the Sunken Mile. Do not treat rumors or the NPC's private knowledge as facts the player already knows.
Generated quest tags: side:create lets this NPC offer a grounded errand; side:report lets a named witness examine an actual carried item; side:turnin lets the giver receive that item. Quest commitments above tell this NPC what they know. Do not invent the errand's item, contacts, or result in dialogue before the rules engine creates it.
Recently offered player replies to avoid repeating: ${JSON.stringify(this.recentChoices)}

Dialogue design: Treat ancestry, lineage, class, training, background, visible appearance, local reputation, current quest state, and remembered choices as conditional story tags. Prefer a relevant eligible hook above, and let it change what this NPC notices, what the player can plausibly say, and how this NPC answers. Use the exact capabilities in the player facts, never invent a spell or skill. Shared ancestry can create recognition when it fits this person. Background, principle, and pressure are private until the player reveals them; do not make the NPC clairvoyant. The numeric attitude in memory runs from -6 (strong distrust) to +6 (strong warmth); match this NPC's tone to it and their personality.

On the opening turn, begin with this NPC's concrete work, worry, observation, or reaction to a visible player trait. On later turns, answer the exact selected reply and its check outcome. Avoid generic greetings, filler questions, repeated offers, and stock replies such as "You seem troubled", "Tell me more", "What else do you know", or "Farewell". Every option should pursue a different conversational angle: an actionable question, relevant expertise, a moral stance, an offer, or a challenge. If class, ancestry, or background creates a genuinely relevant angle, write one option that uses it. Put its source in the source field; the interface adds the identity label, so do not write bracket labels yourself. Use source "history" for a reply grounded in this NPC's memory and "quest" for a current objective. Use "none" otherwise.

Write one NPC line of 1–3 sentences, up to 60 words, then ${this.key === "bandit_captain" ? "4–5" : "3–4"} distinct player replies of at most 18 words each. Include an end/leave reply, phrased in character. Offer kind, neutral or clever, and cruel tones only when they fit the scene. Use only allowed outcome tags: ${allowed.join(", ")}. The tag is a game rule; never invent rewards, change quest state, or promise a result outside the tag. Multiple replies may use "talk" because they represent different questions or approaches. ${this.key === "bandit_captain" ? "At the Gallowmere gate, include a concrete offer to join Rafe's crew for a share of the stolen medicine (parley:join), an explicit attack choice (fight), and an evidence-based turn against Orrin (parley:turncoat), whenever each tag is allowed. If plotEvidence is absent, include a grounded talk reply with an investigation or insight check to scrutinize who hired the crew. Other approaches may be phrased creatively according to the conversation and evidence. Joining does not require Rafe to reveal his employer. parley:turncoat requires known evidence that Orrin used the crew; do not offer or imply it before that tag is allowed." : ""}

Permitted checks: ${JSON.stringify(checks)}. Use check_id 'none' for a normal reply. For a consequential tag with a listed check, choose one of that tag's check IDs. For 'talk', optional Wisdom or Intelligence checks can reveal a private truth: on success the next exchange may reveal it; on failure react with a distinct partial truth or new suspicion. Do not expose private secrets until memory.secretsUnlocked is true, a check just succeeded, or current public game facts already establish them. Checks must matter to the outcome. The game rolls dice; never write a roll result or DC in the option text. Return only the requested JSON.`;
    const messages = [{ role: "system", content: sys }, ...(this.history.length ? this.history.slice(-8) : [{ role: "user", content: entrance }])];
    const schema = {
        type: "object",
        properties: {
          npc_line: { type: "string" },
          emotion: { type: "string", enum: EMOTIONS },
          options: { type: "array", items: { type: "object", properties: {
            text: { type: "string" }, tone: { type: "string", enum: ["kind", "neutral", "clever", "cruel", "leave"] },
            check_id: { type: "string", enum: checkIds }, tag: { type: "string", enum: allowed },
            source: { type: "string", enum: SOURCES },
          }, required: ["text", "tone", "check_id", "tag", "source"], additionalProperties: false } },
        },
        required: ["npc_line", "emotion", "options"],
        additionalProperties: false,
      };
    let completion;
    try {
      completion = await window.websim.chat.completions.create({ messages, schema });
    } catch (error) {
      // A schema rejection should not turn a working AI connection into
      // repetitive authored dialogue. JSON mode still passes through the
      // same rule validation below.
      completion = await window.websim.chat.completions.create({ messages, json: true });
    }
    return JSON.parse(completion.content);
  }

  fallback(allowed, last) {
    const fb = this.card.fallback || FALLBACK.default;
    const topics = NPC_TOPICS[this.key] || ["What is happening here?", "What does this place need?"];
    const visit = this.memory.events.length;
    if (this.key === "bandit_captain") {
      const options = [];
      if (allowed.includes("talk")) {
        const evidenceCheck = !this.engine.context(this.key).plotEvidence
          ? ["investigation", "insight"].find((id) => !this.usedTalkChecks.has(id)) : null;
        options.push({ tag: "talk", text: evidenceCheck ? "Your story doesn't fit. Who paid for this caravan?" : topics[visit % topics.length],
          tone: evidenceCheck ? "clever" : "neutral", check_id: evidenceCheck || "none", source: "none" });
      }
      for (const tag of ["parley:turncoat", "parley:join", "parley:persuade", "fight"]) if (allowed.includes(tag)) {
        options.push({ tag, text: TAG_TEXT[tag].text, tone: TAG_TEXT[tag].tone, check_id: CHECKS_FOR_TAG[tag]?.[0] || "none", source: "quest" });
      }
      if (allowed.includes("end")) options.push({ tag: "end", text: "I'll leave your watch for now.", tone: "leave", check_id: "none", source: "none" });
      const replies = options.filter((o) => o.tag !== "end").slice(0, 4);
      if (allowed.includes("fight") && !replies.some((o) => o.tag === "fight")) replies[replies.length - 1] = options.find((o) => o.tag === "fight");
      return { npc_line: last ? this.card.fallbackReply || this.card.greeting : this.card.greeting,
        emotion: "suspicious", options: replies.concat(options.filter((o) => o.tag === "end")) };
    }
    const tag = ["side:turnin", "side:report", "side:create"].find(t => allowed.includes(t)) || allowed.find((t) => t !== "talk" && t !== "end");
    const options = [
      { tag: "talk", text: topics[visit % topics.length], tone: "neutral", check_id: "none", source: "none" },
      tag ? { tag, text: this.engine.sideOption?.(tag, this.key) || TAG_TEXT[tag]?.text || topics[(visit + 1) % topics.length], tone: TAG_TEXT[tag]?.tone || "kind",
        check_id: CHECKS_FOR_TAG[tag]?.[0] || "none", source: "quest" }
        : { tag: "talk", text: topics[(visit + 1) % topics.length], tone: "clever",
          check_id: ["insight", "investigation"].find((id) => !this.usedTalkChecks?.has(id)) || "none", source: "none" },
      { tag: "end", text: "I should be going.", tone: "leave", check_id: "none", source: "none" },
    ].filter((o) => allowed.includes(o.tag));
    return { npc_line: last ? this.card.fallbackReply || this.card.greeting || fb.line : this.card.greeting || fb.line,
      emotion: "neutral", options };
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
