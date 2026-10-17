# The Unwritten Roads

> **Working concept:** Baldur’s Gate’s party roleplaying and visible dice, Diablo II’s fast action and ever-changing wilderness, and classic Fable’s readable moral transformation—reimagined as one original fantasy RPG.

**Status:** playable browser MVP with an expanded cave expedition; later chapters remain a systems proposal  
**Genre:** party-based action roleplaying game — 4-player online co-op (realtime room + SQLite) or offline local mode (IndexedDB)  
**Scope:** Act I only (“The Broken Mile”), MVP playable in the browser  
**Rating target:** ESRB T (Teen)  
**Camera:** rotatable three-quarter isometric view in fully three-dimensional spaces  
**Current project page:** playable game at `index.html` (the legacy `play.html` entry also exists)

This document combines the playable browser slice with longer term design proposals. All character names, ancestries, classes, disciplines, places, factions, spells, and story material below are original to this project. The named games are references for broad design qualities only; this project does not use their settings, characters, stories, or proprietary rules.

**Combat controls.** On a controller, **A** attacks the nearest hostile within interaction range and otherwise interacts. **RT** uses the basic attack at longer range. **X** and **Y** use the skills assigned to those buttons. Press **RB** to open the skill wheel, aim at a skill with the left stick, then press **X** or **Y** to assign it; **A** casts the selected skill. Assignments are saved per character, including a separate set for the second local player. On desktop, **1–5** still cast the displayed skills, **Q** opens the wheel, arrow keys or mouse hover select, **X/Y** assign or cast, and **Enter** casts the wheel selection. **E** interacts; **X** retains its Finish action beside a surrendered enemy.

## Playable cave expedition (October 2026)

Three cave mouths appear deep in the seeded overworld in addition to the Sunken Mile: **Rootwake Den** in the far northwest wilderness, **Drowned Reliquary** in the far northeast, and **Emberglass Hollow** in the remote southwest. Their landing points are chosen away from the major cities and their immediate approaches; players must explore beyond the settled roads to find them. Each leads to its own underground chamber sequence with textured stone, overhead ribs, pools, themed growths or ruins, a clue, a named guardian, and a sealed relic chest. Lesser enemies fight without conversation. Cave encounters and resolved boss outcomes persist in the character save. The existing Sunken Mile also has a Warden's seal chest after its boss, so every underground site ends with a boss and relic loot.

| Cave | Residents and visual story | Guardian and alternate resolution | Relic |
| --- | --- | --- | --- |
| Rootwake Den | Gloam-rats, fen-hounds, and a briar stag among old roots and luminous sap | The Root Matriarch can be fought or, after studying her wounded nest, calmed with an Instinct DC 13 check. Success adds her as a following combat ally. | Root heart |
| Drowned Reliquary | Drowned thralls and rats under flooded memorial columns | The Tide Keeper can be fought or released by finding his ledger and passing a Presence DC 13 check. Release grants Fortune. | Tide pearl |
| Emberglass Hollow | Ash crawlers and a Compact intruder among cooling crystals and a dormant forge | The Glass Smith can be fought or spared by studying the cooling vent and passing an Intellect DC 14 check. Venting grants a persistent +1 Guard ward. | Emberglass core |

Entrances have dry wood and lamp oil. In the Pack, combine one of each to craft a **road torch**, then equip it there. Cave fog and an edge darkening effect keep sight very short without it; an equipped torch adds a moving warm light and extends the visible range. Fixed light remains close to the entrance and each boss chamber, leaving the intervening route dark. Side clues are optional for combat but required for the corresponding peaceful boss choice. A failed check begins a fight, and winning by either route opens that cave's chest. All three bosses have a telegraphed slam and call themed reinforcements below half health.

The choice structure draws from Larian's documented Baldur's Gate 3 approach: exploration evidence and dialogue can avoid a fight, noncombat resolutions earn experience, and animal communication can change an encounter. We implemented original characters and outcomes in this game's action combat and visible d20 system; no Baldur's Gate setting or dialogue is reused. See [Larian's pacifism and dialogue update](https://baldursgate3.game/news/community-update-11-inspiration-freedom-pacifism_17) and [its animal handling discussion](https://baldursgate3.game/news/digging-into-baldur-s-gate-3-s-release-date-and-early-access_4).

## Gallowmere hostile settlement entry

Gallowmere Watch is the current slice's hostile settlement. Marrowgate and Brightwell are friendly hubs; city guards can still respond to crimes there. On first approach to Gallowmere, its garrison holds fire, a brief horn and camera cutscene frames Captain Rafe Vell at the east breach, and the existing AI dialogue opens. Leaving without settling the encounter escorts the party outside. Returning reopens negotiation without replaying the introduction. Attacking before or during parley, choosing the attack reply, or failing the intimidation check makes the entire garrison hostile. The decision persists in saves.

The AI writes Rafe's words and the exact player replies in the established dialogue schema. It can vary the social framing by class, ancestry, background, local reputation, revealed evidence, and previous conversation. The rules engine still validates every outcome tag and rolls visible checks. The available paths are:

| Approach | Result |
| --- | --- |
| Persuade, intimidate, or deceive | On success, Rafe stands aside and the medicine can be recovered. Failed intimidation triggers immediate combat. |
| Join the brigands | Presence based Persuasion DC 13. On success, the garrison becomes allied, the player can take the crates, Gallowmere reputation rises, and the oath to profit from stolen medicine changes morality. Selling to Orrin keeps the alliance; returning all medicine to Brightwell makes Rafe an enemy. |
| Turn Rafe against the Compact | Available after a visible Investigation or Insight check in Rafe's dialogue, or Bram's confession, uncovers Orrin's role. The clue is logged and saved. After a peaceful pass, the player can find Bram inside and return to Rafe before taking the crates. A Presence/Wisdom Persuasion DC 12 persuades the garrison to release the medicine and oppose the Compact. |
| Attack or walk away | Attack makes the garrison hostile immediately. Walking away leaves negotiation open and sends the player outside the breach. |

The Gallowmere dialogue always keeps the alliance and attack routes visible while they are valid, and reserves a visible clue check until evidence is found, including when the AI service falls back to authored lines. Further conversational branches remain generated by the AI within the validated tag set.

## Wild horses and the three stables

Four rare horses appear across the seeded overworld. The supplied rigged `uploads/horse.glb` replaces the procedural model and uses its Idle, Walk, Trot, and Run clips. Each horse keeps its own coat and pattern; players find different appearances by exploring. The riding feel adapts the eased walk and gallop controls of [Open Range](https://websim.com/@api/open-range): movement accelerates into a walk, holding Shift or pushing the mobile stick fully reaches a faster gallop, and the camera rises with the rider. Horses stay above ground when the party enters a dungeon.

Approach a wild horse and choose **Tame**, **Attack**, or **Leave**. Taming makes a visible d20 Presence roll against DC 12–15 according to the horse's temperament. A failure makes it shy away; an attack wounds it and makes it bolt, with no loot. A successful tame creates no item and no account claim: anyone in that realm can mount the unnamed horse. E dismounts, and the same horse can be ridden again.

There are open horse stables at **Marrowgate**, **Brightwell**, and **Gallowmere Watch**. Ride a tame horse into a stable and name it there to bind it to the current player. Naming and renaming only work at a stable. A named horse grows a bond from 1 to 5 as its owner travels on it (one level per 240 meters; standing still gives none); each bond level adds 2 to the theft difficulty. Another player can attempt a server-rolled Finesse theft against DC `12 + 2 × bond` when the horse is unmounted. Success transfers the bond and ownership to the thief at bond 1. A failed attempt near a town or stable raises a bounty and summons guards against the thief. Away from guarded places, the horse kicks the thief for `4 + bond` damage and becomes alert to that player for one minute, raising only that player's next theft DC by 4. All realm horse records, ownership, names, and locations persist in the shared backend; local play stores horse state in its character save. Neither mode puts horses in the inventory.

## Day, night, moons, and the Hollow

The overworld runs on a continuous **24-minute day**: the analytic atmosphere, sun angle, direct and hemisphere light, fog colour, and shadow direction move together through daylight, golden dawn and dusk, and a deep blue night. Fine stars appear as daylight falls. A correctly sized lunar disc crosses the sky and changes through eight visible phases; one full lunar cycle takes eight world days (192 real minutes). Moonlight varies with the lunar phase. A small HUD marker names the simulated time, current light, day, and moon phase. The cycle persists against real elapsed time in local saves and uses the same wall clock across online clients.

Only during the dark hours, while well beyond the three major cities, a rare encounter can draw **The Hollow** from the tree line. It uses the same gaunt antlered body, exposed ribs, torn shroud, and dragging gait shown in the Act I opening. A pack is possible but uncommon. Each Hollow is a slow level 4–7 hunter with a heavy reach, a ground-shaking slam, a cleave, and a shield-breaking stagger. A very rare night roll can also place one in an underground cave. These hunters do not speak; their approach is signalled through silhouette, movement, and a short combat log cue.

If a Hollow causes the party leader's final defeat, it crouches over the fallen body and takes the carried item pack, up to its very large 2,000 kg cache. That inventory is stored on the hunter's encounter record. Killing that same hunter leaves its stolen gear on its corpse, where it can be taken individually or with Loot All, subject to the player's carry capacity. Local saves store the cache in character state. Online realms persist it in `realm_hollows` and move it to a shared corpse record on death. A hunter that acquires a weapon visibly carries it and can strike or throw a scavenged blade or spear in combat. The Hollow encounter remains a difficult optional threat; ordinary dungeon enemies and town guards do not take the player's pack.

## Corpses, looting, and pack load

Defeated mobs remain as bodies in the world. Approach one and press **E**, use the mobile interaction prompt, or tap the body to open its loot panel. Each item and coin pile has a separate Take action; **Loot all that fits** gathers coins and as many items as the pack allows. Empty bodies remain visible. Loot is generated for the fallen creature, with teeth, tusks, pelts, weapons, provisions, and valuables appropriate to its type. Local bodies and their remaining contents persist in character saves; online bodies and their contents persist as shared `realm_corpses` records, so other players can search them too.

The Pack shows carried weight in kilograms. Capacity uses Might and Vigor, the four playable classes, ancestry, and character height and build. A strong Vanguard can carry considerably more than a small Gloamling Arcanist. Individual loot, Loot All, purchases, gathering, cave supplies, and realm trades respect that limit; heavier items remain on the body or at their source. Gold has no pack weight.

After a human or humanlike body has been searched, a nearby Hollow at night has a chance to devour it and scavenge any unclaimed items. The body remains as a searched remnant, while the stolen goods move into that Hollow's persistent cache. Killing the hunter later exposes those goods on its body. The same rule applies in a local save and in a shared realm.

## Contents

1. [The one-sentence pitch](#the-one-sentence-pitch)
2. [Research notes: what we are combining](#research-notes-what-we-are-combining)
3. [Design pillars](#design-pillars)
4. [Player promise and campaign premise](#player-promise-and-campaign-premise)
5. [Core play loop](#core-play-loop)
6. [Combat: real time, readable rolls](#combat-real-time-readable-rolls)
7. [The dice model](#the-dice-model)
8. [Movement, terrain, and vertical play](#movement-terrain-and-vertical-play)
9. [Player character creation and progression](#player-character-creation-and-progression)
10. [Playable ancestries](#playable-ancestries)
11. [Classes and disciplines](#classes-and-disciplines)
12. [The complete launch spell catalogue](#the-complete-launch-spell-catalogue)
13. [Companion roster](#companion-roster)
14. [Morality, appearance, and reputation](#morality-appearance-and-reputation)
15. [The world and its procedural construction](#the-world-and-its-procedural-construction)
16. [Quests, conversation, and consequences](#quests-conversation-and-consequences)
17. [Equipment, loot, crafting, and camp](#equipment-loot-crafting-and-camp)
18. [Difficulty, accessibility, and fairness](#difficulty-accessibility-and-fairness)
19. [First playable slice](#first-playable-slice)
20. [Research sources](#research-sources)

## The one-sentence pitch

Lead a small band of distinct adventurers through a richly authored fantasy world whose roads and dungeons are rebuilt for each new campaign. Combat is continuous and immediate, but attacks, spells, saves, and risky movement resolve through visible dice; consequential rolls briefly freeze the battlefield so a player can read the result and make a tactical choice. The world remembers what the party did, people form reputations around it, and the hero’s growing mercy or cruelty becomes physically visible in a halo or horns.

## Research notes: what we are combining

The inspiration is not one single “Baldur’s Gate ruleset.” The three games in that series are mechanically distinct, and the design should preserve that distinction. The research below was redone for this revision of the document (October 2026) from official pages, the Arreat Summit, GameBanshee, bg3.wiki, the Fable wiki, and Wikipedia. Anything that could not be confirmed against a fetched source is marked *(unverified)*. These notes describe the **reference games**; everything after this section describes **our** game.

### Baldur’s Gate I and II (BioWare, Infinity Engine, 1998–2001, Enhanced Editions by Beamdog)

**Time model.** Real-time with pause. Everything runs simultaneously; the player can pause at any moment, issue orders, and resume. Auto-pause can be set for events (enemy sighted, spell cast, character hit, end of round). Underneath, the simulation runs on AD&D 2nd Edition: **1 round = 6 seconds**, 1 turn = 10 rounds. Actions inside a round are ordered by weapon *speed factor* and spell *casting time* *(unverified detail)*. This is the single most important precedent for us: a tabletop dice engine can run hidden under continuous real-time action.

**Attacks per round.** Warriors: 1 APR at levels 1–6, 3/2 at 7–12, 2 at 13+ *(unverified)*; weapon specialisation adds +½. Monks gain +½ attack every 3 levels from level 3. Haste adds attacks. Natural 20 always hits and crits (double damage); natural 1 always misses.

**THAC0 and descending AC.** To hit, roll d20 ≥ THAC0 − target AC. Lower AC is better (10 unarmoured, −10 floor in the originals). THAC0 improves fastest for warriors, then priests/rogues, slowest for wizards. Strength (melee), Dexterity (missiles), proficiency, and magic modify it.

**Five saving throws** (lower is better): Paralyzation/Poison/Death, Rod/Staff/Wand, Petrification/Polymorph, Breath Weapon, Spell. Paladins get +2 to all.

**Ability scores.** STR, DEX, CON, INT, WIS, CHA, rolled 3–18 at creation (items push to 25). Warriors with 18 STR roll exceptional strength 18/01–18/00. The strength table drives to-hit, damage, carry weight and door-forcing — e.g. 18/00 = +3 hit, +6 damage, 400 lb; 25 = +7/+14/1600 lb. DEX gives AC and missile bonuses; CON gives HP per level (warriors up to +4); INT gates wizard spell levels and learn-chance; WIS gives bonus priest slots; CHA plus reputation sets prices and reactions.

**Races:** Human, Elf, Half-Elf, Dwarf, Gnome, Halfling, Half-Orc (Half-Orc added in BG2; added to BG1 in EE).

**Classes:** Fighter, Ranger, Paladin, Cleric, Druid, Mage, Thief, Bard (BG1); Barbarian, Monk, Sorcerer (BG2); Shaman (EE). **Multi-class** (demi-humans only) advances 2–3 classes simultaneously with split XP. **Dual-class** (humans only) needs 15 in the old prime requisite and 17 in the new one; the old class is frozen until the new one surpasses it.

**BG2:EE kits (subclasses).**
- Fighter: Barbarian, Berserker, Dwarven Defender, Kensai, Wizard Slayer
- Ranger: Archer, Beast Master, Stalker
- Paladin: Cavalier, Inquisitor, Undead Hunter, Blackguard
- Cleric: Priest of Helm, of Lathander, of Talos, of Tyr
- Druid: Avenger, Shapeshifter, Totemic Druid
- Thief: Assassin, Bounty Hunter, Swashbuckler, Shadowdancer
- Bard: Blade, Jester, Skald
- Mage: Abjurer, Conjurer, Diviner, Enchanter, Illusionist, Invoker, Necromancer, Transmuter, Wild Mage
- Monk: Dark Moon, Sun Soul · Sorcerer: Dragon Disciple

**Spells.** Wizard levels 1–9, priest levels 1–7, 300+ spells in BG2. Wizards scribe scrolls into a spellbook and **memorise** spells into slots; priests know their full list; sorcerers cast spontaneously. Getting hit interrupts casting. Eight schools (Abjuration, Alteration, Conjuration, Divination, Enchantment, Illusion, Invocation, Necromancy); specialists gain a slot per level and lose an opposed school. **Resting** refreshes memorised spells and HP, and can trigger ambushes.

**Reputation (1–20).** Global, starts around 10. Raised by good quests and temple donations; lowered by witnessed crimes and killing innocents. Changes shop prices; at high reputation evil companions leave, at low reputation good companions leave; very low reputation brings guards and bounty hunters; paladins and rangers fall around reputation ≤5 *(threshold unverified)*. **This is a single global number — it is the ancestor of our local-reputation-plus-visible-morality split.**

**Party:** up to 6 (protagonist + 5); up to 6 human players in multiplayer. XP caps: BG1+TotSC 161,000 (≈ level 8–10); ToB 8,000,000 with High-Level Abilities (Whirlwind, Greater Whirlwind, Comet, Dragon’s Breath, Summon Planetar…).

**Companions.** BG1 had 25 (Imoen, Jaheira, Khalid, Minsc, Dynaheir, Edwin, Viconia, Montaron, Xzar, Kagain, Ajantis, Branwen, Coran, Kivan, Safana, Shar-Teel, Tiax, Xan, Yeslick, Alora, Eldoth, Faldorn, Garrick, Quayle, Skie), EE added Baeloth, Dorn, Neera, Rasaad. BG2 core: Imoen, Jaheira, Minsc, Edwin, Viconia, Aerie, Keldorn, Mazzy, Nalia, Valygar, Anomen, Cernd, Haer’Dalis, Jan Jansen, Yoshimo, Korgan (+Sarevok in ToB). Companions bicker with each other and leave over alignment conflicts.

**BG1 Act/chapter structure — the template for our “Act I”.** Prologue in Candlekeep (Gorion killed on the road) → Ch1 Friendly Arm Inn, Beregost, the road to Nashkel → Ch2 Nashkel Mines (poisoned iron) → Ch3 bandit camp → Ch4 Cloakwood mines → Ch5 the city of Baldur’s Gate → Ch6 return to Candlekeep, framed for murder → Ch7 exposing Sarevok. Chapter 1’s map: Candlekeep, Coast Way, Lighthouse, Friendly Arm Inn, High Hedge, Beregost, Nashkel and its carnival, Larswood, Peldvale. **Lesson:** a small set of fixed, dense towns connected by many semi-open wilderness tiles, with a mystery (the iron crisis) that pulls the player outward.

### Baldur’s Gate III (Larian, Divinity Engine 4, 2023; final Patch 8 April 2025)

**Time model.** Real-time exploration, **turn-based** combat. Up to 4-player online/split-screen co-op. Initiative = d4 + DEX *(per Wikipedia)*, with adjacent same-side combatants sharing a turn block.

**d20 core.** `d20 + ability modifier + proficiency (if proficient) + other` vs AC or DC. Proficiency: **+2** (levels 1–4), **+3** (5–8), **+4** (9–12). Expertise doubles proficiency. Spell save DC = 8 + proficiency + casting modifier. Natural 1 / 20 auto-fail/succeed attack rolls and ability checks (not normal saves). **Advantage/disadvantage**: roll 2d20 keep high/low; never stacks; one of each cancels. **Critical hit** on natural 20 doubles *dice* (including smite dice), not flat modifiers; melee hits on Downed targets auto-crit. **Death saves**: DC 10, three successes stabilise, three failures kill; damage while downed = one failure (crit = two).

**Dialogue checks** show the DC up front, let the player add bonuses (Guidance, Bardic Inspiration), and allow **Inspiration** rerolls (party pool of 4, earned by acting in line with a character’s background). **Karmic Dice** (default on): failed rolls accrue a hidden “debt” that raises the chance of a forced success later. *Our decision: we do NOT use hidden karmic dice — see “Roll transparency.” We expose an explicit, visible “Fortune” resource instead.*

**Action economy.** Action, Bonus Action, Reaction, Movement (9 m standard; 10.5 m wood elves; 7.5 m dwarves/gnomes/halflings). Extra Attack after an Attack action; Fighter Improved Extra Attack at 11. Drinking a potion is a bonus action (Larian house rule). Shove, Jump, Dip, Throw are first-class tactical actions.

**Level cap 12** across multiclassing; feats/ASI at 4, 8, 12 (Fighter 6, Rogue 10). Hit dice: d12 Barbarian; d10 Fighter/Paladin/Ranger; d8 Bard/Cleric/Druid/Monk/Rogue/Warlock; d6 Sorcerer/Wizard.

**12 classes and 58 subclasses (46 at launch + 12 in Patch 8 marked ★).**

| Class | Subclasses |
|---|---|
| Barbarian | Berserker, Wildheart, Wild Magic, Giant★ |
| Bard | Lore, Valour, Swords, Glamour★ |
| Cleric | Knowledge, Life, Light, Nature, Tempest, Trickery, War, Death★ |
| Druid | Land, Moon, Spores, Stars★ |
| Fighter | Battle Master, Champion, Eldritch Knight, Arcane Archer★ |
| Monk | Open Hand, Shadow, Four Elements, Drunken Master★ |
| Paladin | Devotion, Ancients, Vengeance, Oathbreaker, Crown★ |
| Ranger | Beast Master, Gloom Stalker, Hunter, Swarmkeeper★ |
| Rogue | Arcane Trickster, Assassin, Thief, Swashbuckler★ |
| Sorcerer | Draconic, Storm, Wild Magic, Shadow★ |
| Warlock | Archfey, Fiend, Great Old One, Hexblade★ |
| Wizard | Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation, Bladesinging★ |

**11 races / 31 subraces.** Human; Elf (High, Wood); Drow (Lolth-Sworn, Seldarine); Half-Elf (High, Wood, Drow); Half-Orc; Halfling (Lightfoot, Strongheart); Dwarf (Gold, Shield, Duergar); Gnome (Forest, Deep, Rock); Tiefling (Asmodeus, Mephistopheles, Zariel); Githyanki; Dragonborn (10 colours). All races take a free +2/+1 ability assignment. **Six abilities, 18 skills** (Athletics; Acrobatics, Sleight of Hand, Stealth; Arcana, History, Investigation, Nature, Religion; Animal Handling, Insight, Medicine, Perception, Survival; Deception, Intimidation, Performance, Persuasion). Persuasion is the most-used dialogue skill (~293 checks).

**Backgrounds (12):** Acolyte, Charlatan, Criminal, Entertainer, Folk Hero, Guild Artisan, Noble, Outlander, Sage, Soldier, Urchin, Haunted One.

**Origins & companions.** Astarion (rogue), Gale (wizard), Lae’zel (fighter), Shadowheart (cleric), Wyll (warlock), Karlach (barbarian), the Dark Urge; plus Halsin, Jaheira, Minsc, Minthara. **Approval** runs −50…100 per companion per player; warnings at −20/−40, departure at −50.

**Environment.** High ground (≥2.5 m above) = **+2 to hit**, low ground −2; height also extends ranged reach. Surfaces combine: water + lightning = electrified; water + cold = ice (prone); water + fire = steam; grease/oil/alcohol ignite; smokepowder explodes; acid −2 AC; web enwebs; difficult terrain doubles movement cost. Dipping weapons in fire adds 1d4 fire.

**Rest.** Long rest at camp costs 40 camp supplies, restores everything, advances camp/companion scenes; 2 short rests per long rest restore half HP and short-rest resources.

**Act One.** Nautiloid prologue → Ravaged Beach → Roadside Cliffs/Chapel Ruins → Emerald Grove (druids vs tiefling refugees, Rite of Thorns) → Blighted Village, Owlbear Cave → Goblin Camp (three leaders) → Risen Road, Waukeen’s Rest, Riverside Teahouse → Underdark (Myconid Colony) and Grymforge → Mountain Pass and the githyanki crèche → exit to Act Two. **Lesson:** an Act I is roughly 25–40 hours of dense, interlocking hand-authored content around one central moral crisis (grove vs goblins) with many mutually exclusive solutions.

**Spell catalogue (levels 0–6, BG3).** Cantrips: Acid Splash, Blade Ward, Bone Chill, Booming Blade, Dancing Lights, Eldritch Blast, Fire Bolt, Friends, Guidance, Light, Mage Hand, Minor Illusion, Poison Spray, Produce Flame, Ray of Frost, Resistance, Sacred Flame, Shillelagh, Shocking Grasp, Thaumaturgy, Thorn Whip, Toll the Dead, True Strike, Vicious Mockery. Level 1 (≈51) includes Bless, Burning Hands, Chromatic Orb, Cure Wounds, Grease, Guiding Bolt, Healing Word, Hex, Hunter’s Mark, Magic Missile, Shield, Sleep, Thunderwave… Level 2 (≈42) includes Misty Step, Hold Person, Scorching Ray, Spiritual Weapon, Web, Moonbeam… Level 3 (≈34) Fireball, Counterspell, Haste, Hypnotic Pattern, Spirit Guardians, Revivify… Level 4 (≈21) Banishment, Greater Invisibility, Polymorph, Wall of Fire… Level 5 (≈20) Cone of Cold, Hold Monster, Cloudkill… Level 6 (≈20) Chain Lightning, Disintegrate, Heal, Sunbeam… *The scale lesson: ~210 spells across 7 levels. Our launch catalogue (below) is deliberately smaller and original; we do not copy D&D spell names or text.*

### Diablo II (Blizzard North, 2000; Lord of Destruction 2001; Resurrected 2021)

**Time model.** Pure real-time click-to-move. Left/right mouse each hold a skill. Dice exist but are invisible: every swing is a hidden roll.

**Hit chance (Arreat Summit).** `Chance = 100 × AR/(AR+DEF) × 2 × alvl/(alvl+dlvl)`, clamped to **5–95 %**. Monster spells always hit. Defence only changes hit chance, never damage. Blocking: `Block% = (Blocking × (DEX − 15)) / (2 × clvl)`, capped 75 % (⅓ while running). *This is the closest precedent for our “visible dice on every realtime swing.” D2 proves players accept a probabilistic swing in an action game; our addition is showing the die.*

**Damage & attributes.** Per level: 5 stat points (Str, Dex, Vit, Energy) + 1 skill point. Melee damage × (Str+100)/100; bows scale with Dex. Life doesn’t regenerate; mana refills in ~120 s. Resistances (fire/cold/lightning/poison) capped at 75 %; difficulty penalties 0 / −40 / −100 (Normal/Nightmare/Hell). Death costs 0/5/10 % XP and drops your corpse with your gear.

**Seven (now eight) classes, three trees each.** Amazon (Bow & Crossbow, Passive & Magic, Javelin & Spear); Assassin (Martial Arts, Shadow Disciplines, Traps); Barbarian (Combat Skills, Masteries, Warcries); Druid (Elemental, Shape Shifting, Summoning); Necromancer (Curses, Poison & Bone, Summoning); Paladin (Combat, Offensive Auras, Defensive Auras); Sorceress (Fire, Lightning, Cold); Warlock (Resurrected DLC *Reign of the Warlock*, Feb 2026). Skills unlock at levels 1/6/12/18/24/30; 20 hard points max; **synergies** since 1.10.

**Items.** Low quality < Normal < Superior < **Magic** (blue, 1 prefix + 1 suffix) < **Rare** (yellow, 2–6 affixes) < **Set** (green, piece bonuses) < **Unique** (gold, fixed); plus Crafted, Sockets (gems, runes, jewels), **Runewords**, Ethereal (+50 % base, unrepairable), Charms. Normal/Exceptional/Elite base tiers. Affixes are chosen by item level.

**Monsters.** White normal, blue **Champions** (Berserker, Fanatic, Ghostly, Possessed), gold **Uniques** with 3–6 minions and random modifiers (Fire/Cold/Lightning Enchanted, Extra Strong, Extra Fast, Cursed, Mana Burn, Multishot, Spectral Hit, Stone Skin, Teleport, Aura Enchanted). Super Uniques are named and fixed (Bishibosh, Rakanishu, Griswold, the Countess, Blood Raven).

**Procedural maps — the template for our generation.** **Towns are fixed** (Rogue Encampment, Lut Gholein, Kurast Docks, Pandemonium Fortress, Harrogath). **The order of areas is fixed.** Wilderness areas are assembled from preset tiles, and dungeon levels **re-randomise every new game**. A few set-piece areas are fixed (Tristram, Cathedral, Catacombs 4, Arcane Sanctuary, Chaos Sanctuary end, Worldstone Chamber). **Waypoints** persist per character.

**Act I “The Sightless Eye”.** Rogue Encampment → Blood Moor (Den of Evil) → Cold Plains (Burial Grounds, Blood Raven) → Stony Field (Cairn Stones, Tristram portal) → Dark Wood (Tree of Inifuss) → Black Marsh (Forgotten Tower, the Countess) → Tamoe Highland → Monastery Gate → Outer Cloister → Barracks (the Smith) → Jail → Inner Cloister → Cathedral → Catacombs 1–4 → Andariel. **Six quests**: Den of Evil (skill point + respec), Sisters’ Burial Grounds, Search for Cain, Forgotten Tower, Tools of the Trade, Sisters to the Slaughter. **Lesson:** Act I is a straight spine of ~15 areas, 6 quests, 1 boss, ~4–6 hours, endlessly replayable because the tiles reshuffle.

**Multiplayer.** 8 players per game; monster HP × (players+1)/2; `/players X` in single-player; party XP bonus within ~2 screens; hostility only declared in town; **Hardcore** = one life.

### Fable (Lionhead, 2004 / The Lost Chapters 2005), with Fable II and III variations

**One good–evil axis.** Good: killing monsters, rescuing villagers, sparing foes, Temple of Avo donations, eating tofu, friendly expressions. Evil: killing innocents/guards, theft, assault, vandalism, Chapel of Skorm sacrifices, eating crunchy chicks, rude expressions.

**Appearance morphing (Fable 1, from the Fable wiki “Morphing” page).**

| Alignment | Appearance |
|---|---|
| Very evil | Bald scalp, large red-black **horns**, charred cracked skin, pale skin, **glowing red eyes**, cloud of **flies**, **red mist** at the legs |
| Moderately evil | Bald patch, small flesh-coloured horns, cracked limbs, pale skin |
| Slightly evil | Light skin, brown eyes, dark hair |
| Neutral | Light skin, brown eyes, chestnut hair |
| Slightly good | Hazel eyes, light-brown hair |
| Moderately good | Blue eyes, blonde hair |
| Very good | Grey eyes, blonde hair, **halo**, shaft of sparkling light, **light-blue butterflies**, **blue aura** |

Other morphs: Strength → bulkier; Skill → taller and leaner; Will → glowing blue runes; food → weight; **aging** 0.7 years per upgrade (disliked by players); **scars** from hits (prevented by Physical Shield).

**Renown** (Unknown → Unsung 500 → … → Legendary 27,500) changes enemy spawns, unlocks expressions, gates quests, and controls how many villagers follow you. **Experience types:** green general, red Strength, yellow Skill, blue Will; a **combat multiplier** rises with consecutive hits and resets when you are struck. **NPC reactions** = alignment × renown × appearance: cheering, applause, following; or cowering, fleeing, reporting crimes. **Expressions** unlock by renown and alignment.

**Fable II** adds **Purity/Corruption** (±1000) beside Good/Evil: Saint (halo) needs good + pure; Ghoul (big horns, red aura, cracked black skin) is evil + corrupt; the dog, banners and whole towns (Bowerstone Old Town becomes garden district or slum) morph too. Food changes purity (tofu pure, mutton corrupt, celery thins). Opinions become per-villager (Love/Hate, Funny/Scary).

**Fable III** keeps morality plus a hidden Primal/purity scale, and adds **wings** whose colour and size show morality and follower count.

**Lesson.** The halo and horns work because (1) they are gradual, (2) they are visible at gameplay camera distance, (3) the world reacts to them, and (4) they come from understandable deeds. The weaknesses players cite: trivial “eat tofu” morality farming, aging that punished progression, and binary choices. Our design keeps (1)–(4) and avoids the weaknesses.

### The synthesis

| Reference | Design quality to retain | How this project uses it |
|---|---|---|
| Baldur’s Gate I and II | Real-time-with-pause over a dice engine, 6-second rounds, party tactics, companions who disagree, dense fixed towns joined by wilderness | Continuous simulation bookkept in 6-second rounds, pause-and-queue, a field party of 4, companion conflicts |
| Baldur’s Gate III | Transparent d20 + proficiency, advantage/disadvantage, high ground, surface combos, DC-shown dialogue rolls, co-op | Every roll shown; +2 high-ground rule; surface reactions; dialogue DCs shown before committing; 4-player online co-op |
| Diablo II | Click-to-move action cadence, item tiers and affixes, fixed towns + regenerated wilderness/dungeons, waypoints, `players X` scaling | Realtime click/WASD combat, five item tiers, seeded world where cities stay recognisable but move, Wayshrines, party scaling |
| Classic Fable | Visible moral transformation, NPC reaction to appearance + renown, gradual morphs | Mercy–Cruelty track drives a gradually growing halo or horns on the rigged model; NPC AI dialogue is told your appearance and renown |

### Decisions log (what we chose and why)

| # | Decision | Reason |
|---|---|---|
| D1 | Combat is **real-time**, bookkept in **6-second rounds**, with **visible d20s on every attack** | BG1/2 proved hidden dice under real time; D2 proved probabilistic swings feel fine in action combat; BG3 proved players love *seeing* the die |
| D2 | **Roll Holds** (auto-pause 0.9–1.4 s) only on: first strike of an encounter, natural 20 / natural 1, saving throws vs control spells, a party member about to go down, and dangerous leaps | Keeps D2 pace while giving BG3 drama to the moments that matter |
| D3 | No hidden karmic dice; a visible **Fortune** point (max 3) lets you reroll a die during a Roll Hold | Honesty principle; replaces BG3 Inspiration + Karmic Dice with one readable system |
| D4 | Our own rules chassis (Might/Finesse/Vigor/Intellect/Instinct/Presence; Guard/Reflex/Fortitude/Resolve) — not D&D | Original IP; avoids licensing; still instantly legible to 5e players (proficiency +2/+3/+4/+5/+6) |
| D5 | Level cap **20** for the full game; **Act I cap is level 5** | BG1’s Act-I-equivalent capped low; keeps MVP balance small |
| D6 | **12 classes × 3 disciplines = 36**, 10 ancestries × 2–3 lineages = 21, 60 circle spells + 12 cantrips | Between D2 (7×3) and BG3 (12×~5) in scope; each must be animatable |
| D7 | **Mercy–Cruelty −100…+100** with 7 visual stages and a real **neutral** band (−15…+15, the “Wayward” look) | Fable’s readability, plus the user’s request for a neutral outcome |
| D8 | World = seeded 3D heightfield + biomes; **major cities have fixed interiors but seeded placement** | D2’s fixed towns / random wilderness, adapted to a 3D world |
| D9 | NPC speech **and** player reply options are generated by an LLM, constrained by an authored NPC card and quest state; spoken with TTS | User requirement; constraint keeps quests coherent (see “AI dialogue”) |
| D10 | Content rating target **ESRB T / PEGI 12–16** | User requirement; drives gore, language and AI prompt rules |
| D11 | Engine: **three.js (WebGL2)** in the browser, no build step; WebGPU path later | Project runs as a static websim page; widest device support |
| D12 | Multiplayer: websim **realtime room** (server.js), 4-player co-op parties, server-validated; persistence in **SQLite (env.DB)** | Built-in, no keys; matches BG3’s 4-player co-op |
| D13 | **Local mode** runs fully offline-capable with **IndexedDB** saves and the same simulation code | User requirement (“local land mode”) |
| D14 | **3 quality LODs** (Low/Mobile, Medium, High/Desktop) plus per-object distance LOD | User requirement; mobile + desktop |
| D15 | “Ray-cast” shadows and audio: **ray-cast audio occlusion** and **ray-cast shadow/sun visibility queries** are implemented; screen lighting uses **PCF-soft cascaded-style shadow maps** in WebGL. True hardware ray tracing is a WebGPU-era goal | Honest about what browsers can do today |

## Design pillars

### 1. Action now, explanation on demand

Combat should move like an action RPG, not wait for every combatant to finish a formal turn. The player can pause whenever they want, but movement, enemy intent, and attack animations continue when time resumes. Dice are never hidden from the player: each important action has a compact roll result in the world and a detailed explanation in the combat log.

### 2. A party that earns its screen space

The player makes decisions for a four-person field party. Each companion has a clear combat job, a personal history, a distinct voice, and a reason to disagree. The player can focus-fire, protect, reposition, or let companions follow simple role-based behavior. The party should feel like people rather than four interchangeable ability bars.

### 3. Authored detail inside changing geography

The main cast, dramatic locations, key conversations, and signature quests are hand-authored. The connections between landmarks, the route through a region, the majority of dungeon rooms, encounter placements, caches, and side-event combinations are generated from curated pieces. A new campaign should feel different without making important story beats incoherent.

### 4. Choices leave visible traces

The world keeps evidence of what the party does. A rescued village may reopen a route; a burned bridge remains burned; survivors may tell the next settlement. Mercy and cruelty also slowly alter the protagonist’s face, eyes, aura, and silhouette. The morality system must produce roleplaying consequences, not simply hand out a good-person damage bonus.

### 5. A fair roll is a readable risk

Randomness creates uncertainty, not helplessness. The player can inspect the target number, relevant bonuses, likely outcome range, and source of advantage or disadvantage. Ordinary movement never fails because of an invisible random check. Dice are used where risk is meaningful.

## Player promise and campaign premise

### The promise

The player is a **Roadsworn**, one of a handful of people able to find paths through a world where roads, ruins, and even borders are coming unstuck. The player builds a protagonist, recruits a small company, and decides whether to repair the old routes, turn them into a public good, or claim control of them.

### The setting: Veyrun

Veyrun is a continent connected by the **Old Road**, a network of stone causeways that once made travel predictable. The Road has begun to fracture into overlapping routes. Forest paths lead to coastlines that should be hundreds of miles away. A sealed mine opens onto a battlefield from another century. A ruined watchtower may appear in a different valley on a later expedition.

The cause is the **Unmooring**: a failure in the ancient system that held place, memory, and distance in agreement. A travelling order called the **Wayfinders** claims it can mend the route network. A wealthy charter called the **Meridian Compact** wants to own and tax it. The **Hearthbound settlements** want the old roads made safe but fear central control. The **Quiet Choir** believes the Unmooring is a chance to let the world become something new.

These are political positions, not simple morality teams. Each faction can help or harm ordinary people. Their representatives can be recruited, opposed, bargained with, exposed, or replaced.

### Campaign shape

1. **The Broken Mile:** the player survives a road collapse, chooses who receives the first rescued supplies, and meets the initial companions.
2. **The Wayfarer’s Map:** the party secures a base, learns how the region seed works, and follows clues toward several newly assembled frontier routes.
3. **The Living Routes:** faction quests reveal who benefits from instability and who is paying for the effort to control it.
4. **The Deep Road:** the party enters a shifting network of vaults, mines, roots, and abandoned settlements beneath the continent.
5. **The Last Crossing:** the player chooses whether to mend the route system as it was, distribute its control, or deliberately let the old geography end.

This sequence gives the campaign a stable emotional and narrative spine. The path, order of optional sites, local events, and many dungeon plans vary by run.

## Core play loop

1. **Choose a route** on the world map. Each route reveals a known destination, a risk estimate, a few rumors, and any companion concerns.
2. **Travel through a detailed region** with authored landmarks, moving encounters, alternate elevations, hidden entries, and generated connections.
3. **Investigate before fighting.** Track signs, question witnesses, use class skills, scout enemy formations, or find a route around them.
4. **Fight in real time.** Direct the protagonist, give companions orders, pause to plan, and read the dice when actions resolve.
5. **Make a consequential choice.** Rescue, bargain, deceive, punish, expose, or walk away. Witnesses, factions, companions, and the morality track may remember.
6. **Recover and build.** Search, identify, equip, repair, prepare spells, speak with companions, and decide which lead to follow.
7. **Return to a changing world map.** The current campaign preserves its generated layout; a new campaign starts with a fresh world seed.

## Combat: real time, readable rolls

### Battlefield clock

Combat is continuous. There is no initiative queue that makes one actor wait while every other actor takes a discrete turn. Each character has a wind-up, active window, recovery, and movement speed. Fast weapons create shorter attack cycles; heavy weapons commit for longer and punish careless timing. Spell casts have visible start-up and can be interrupted.

For consistency in logs and balancing, the simulation groups time into **six-second tactical rounds**. These are bookkeeping intervals only; the battlefield does not stop at the round boundary. Attacks can begin, land, and finish at any time inside them.

### Player control

- Select one character and issue movement, attack, spell, item, interaction, or defensive orders.
- Select multiple characters to move, focus a target, retreat, or hold a position together.
- Pause freely to inspect threats and queue orders. Queued orders execute in sequence when time resumes.
- Use a compact **intent ribbon** above enemies: wind-up, direction, target, and expected impact area.
- Give each companion a simple stance: follow and assist, hold formation, protect a selected ally, or prioritize the current target. These are baseline control affordances, not a substitute for direct commands.

### The Roll Hold

Every attack, spell attack, saving throw, contested maneuver, and risky traversal check is resolved by dice. Most rolls happen while the simulation continues. **Roll Holds** are brief, automatic pauses for a limited set of high-attention moments:

- the first deliberate attack or spell command in a new combat encounter;
- a player-commanded risky leap, climb, grapple, or escape while enemies can punish failure;
- a control spell or boss ability that could disable, scatter, or remove a party member from the fight;
- a critical hit or a likely knockout against a party member;
- a companion’s reaction that can intercept, counter, or protect;
- a major set-piece check that can change the shape of the encounter.

During a Roll Hold, the battlefield freezes before the final die result is applied. The die tumbles once, large enough to read but quickly. The combat log shows the formula and modifiers. If a character has a relevant reaction or once-per-rest resource, the player can use it in the pause. Otherwise, the result is applied and the pause ends automatically after a short beat. The player is never forced to click through routine attacks.

Repeated attacks, damage-over-time ticks, minion attacks, and each pellet of a multi-projectile ability do not create separate hard stops. Their rolls remain visible in the log and, when practical, as a grouped die animation near the target. This keeps the game in motion.

### Dice on live actions

- **Attacks:** a d20 attack die appears at the attacker-to-target line; damage dice appear as a smaller cluster at impact.
- **Spell saves:** the target’s saving die appears near its health bar, with the defence tested and difficulty shown in the log.
- **Movement checks:** the die appears beside the character’s feet or route marker, with the obstacle and consequence shown before the order is confirmed.
- **Critical results:** natural 20s and natural 1s get a distinct sound and visual treatment, but they do not override all context. A natural 20 can turn a hit into a critical hit; it cannot make an impossible leap physically possible.
- **Hidden enemy intent:** enemy rolls are not falsified or silently changed. The player sees the outcome and relevant public modifiers after resolution; enemy uncertainty comes from their abilities and the battlefield, not rigged dice.

### Damage, defence, and status

Damage is rolled by type: physical, fire, frost, storm, radiant, umbral, poison, or force. Armour reduces certain physical damage; wards and resistances reduce typed damage. Avoid making one defence value solve every problem.

Conditions should be concise and readable: **staggered**, **slowed**, **pinned**, **exposed**, **burning**, **shaken**, **silenced**, **marked**, and **downed**. A condition has a clear icon, duration, removal rule, and stacking rule. Reapplying the same condition refreshes or upgrades it rather than creating a pile of nearly identical icons.

### Downed characters

At zero health, a character becomes **downed** and can be revived during combat. Three escalating death checks occur over time; successful recovery, healing, or a companion’s intervention can stabilize the character. A downed character is not automatically dead from one unlucky damage die. Story deaths are reserved for authored choices and explicit campaign consequences, not random combat spikes.

## The dice model

The following is a proposed original rules chassis. It borrows the clarity of tabletop-style checks while using its own attributes, target defences, and action timing.

### Attributes

- **Might:** weapon force, lifting, breaking, and resisting physical displacement.
- **Finesse:** accuracy, light weapons, handwork, stealth, and precise movement.
- **Vigor:** health, endurance, and resistance to poison, illness, and bodily strain.
- **Intellect:** learned lore, craft, arcane formulae, and tactical analysis.
- **Instinct:** perception, tracking, reflexes, and natural magic.
- **Presence:** leadership, deception, bargaining, performance, and force of personality.

Each attribute contributes a modifier. A trained character also adds a proficiency bonus based on level and discipline.

### Check formula

**Check:** `d20 + attribute modifier + proficiency + situational modifiers`

The total meets or exceeds a target number. For attacks, the target is the defender’s **Guard**. Other checks target **Reflex**, **Fortitude**, or **Resolve**, depending on what the action challenges.

### Target defences

- **Guard:** avoid weapon blows, bolts, and direct attack spells.
- **Reflex:** dodge blasts, traps, hazards, and sudden movement threats.
- **Fortitude:** resist poison, pain, exhaustion, disease, and physical restraint.
- **Resolve:** resist fear, charm, deception, compulsion, and disruptive magic.

### Advantage and disadvantage

Advantage rolls two d20s and uses the higher result; disadvantage uses the lower. Multiple sources do not add more dice. If at least one meaningful advantage and disadvantage are both active, they cancel unless a feature explicitly says it pierces that rule. This keeps the result easy to understand.

### Margin and criticals

The margin above or below the target influences degrees of outcome. Exceeding a target by 5 may improve a shove or shorten a cast interruption; missing by 5 may create a controlled setback. Natural 20 and natural 1 are special only when the action could plausibly succeed or fail. They are not a universal substitute for situational judgment.

### Movement checks

Ordinary walking, running on open ground, and following a clear path are deterministic. A movement check is only made when the player commits to a dangerous action, such as:

- a long jump across a gap;
- climbing a surface under pressure;
- squeezing through a collapsing opening;
- balancing across a narrow beam;
- breaking free of a grapple;
- dashing through a telegraphed attack zone;
- attempting a stealth relocation while watched.

The route preview marks the check, the likely target number, and the consequence of failure. A failed jump may leave the character short or hanging rather than silently killing them. A failed combat dodge may incur a graze rather than negating all control.

### Roll transparency

The combat log records: actor, action, die, modifiers, target defence, result, and applied outcome. Players can inspect the log later. Routine rolls are grouped; consequential rolls remain individually readable. There is no hidden “pity” reroll. Difficulty support is explicit and configurable.

## Movement, terrain, and vertical play

### Fully 3D spaces

The world uses real 3D geometry and a rotatable three-quarter camera. Buildings, bridges, ledges, cave ceilings, tree roots, scaffolds, shafts, ravines, and stacked interiors have real height and occlusion. The camera can tilt within a fixed readable range and lowers or fades obstructing roofs when they hide the active party.

The visual target is high-detail scene composition at a stable playable scale: close enough to read a dice result and recognize a companion; wide enough to understand a full encounter and its escape routes. Characters and doors use consistent human-scale proportions. Major elevations should be obvious from shadow, edge treatment, stairs, ladders, and connected traversal points.

### Height matters

Elevation affects sightlines, projectile paths, cover, fall risk, and access. High ground can improve line of sight or grant a modest aim bonus; it does not make a lower enemy unable to hit back. Some spells travel over low cover, while arrows and thrown objects use clear trajectories. Pushing and falling are dangerous but telegraphed.

### Surface interactions

Oil can carry fire; water can conduct storm damage; loose rubble can collapse; vines can catch a moving enemy; a hanging chain can be cut; a floodgate can reshape a chamber. Each interaction follows a consistent material rule and is signposted before it surprises the player. Most surfaces are temporary tactical conditions, not persistent piles of opaque status effects.

### Traversal tools

Climb points, ladders, ropes, short vaults, lifts, breakable barriers, and spell-enabled movement give each region multiple routes. Only a few class abilities grant exceptional traversal, and every exceptional route has a clear affordance. Party pathing should avoid walking companions off ledges or splitting them across non-returnable gaps.

## Player character creation and progression

### Creation choices

The player chooses:

1. a name, voice presentation, body frame, face, hair, skin, and cosmetic markings;
2. one ancestry and one lineage;
3. one of twelve classes and a discipline at the class milestone;
4. a background and two trained skills;
5. a personal principle and a pressure point used in companion conversations and selected dialogue checks.

No ancestry or class is morality-locked. The hero can be kind, cruel, or inconsistent regardless of ancestry, class, or faith.

### Backgrounds

Backgrounds give two trained skills and one short introductory conversation hook. They never close off a main quest. The complete proposed launch set is:

- **Road Orphan:** survival, local contacts.
- **Charter Clerk:** appraisal, negotiation.
- **Field Medic:** medicine, observation.
- **Disgraced Guard:** intimidation, tactics.
- **Pilgrim:** rites, empathy.
- **Tunnel Scout:** stealth, navigation.
- **Tavern Performer:** performance, rumor gathering.
- **Workshop Apprentice:** repair, investigation.
- **Border Diplomat:** etiquette, deception.
- **Hedge Naturalist:** tracking, herbal lore.
- **Debt Runner:** streetwise contacts, lockwork.
- **Quiet Novice:** meditation, arcane history.

### Level and build cadence

The proposed level cap is **20**. Core attributes grow slowly; most build expression comes from class features, discipline choices, weapon proficiencies, spells, and equipment.

- **Levels 1–2:** establish the class’s core loop.
- **Level 3:** choose one of three disciplines.
- **Levels 4–10:** gain defining movement, reaction, and specialization features.
- **Levels 11–16:** specialize into advanced combinations.
- **Levels 17–20:** earn one capstone feature and improve its reliability.

The campaign uses experience for exploration, quest completion, combat, and discoveries; repeated enemy farming has sharply reduced returns. A respec is available at the base through a clearly explained, in-world service. The player may freely reassign learned spells at safe preparation points. The launch design does not require multiclassing: twelve classes and thirty-six disciplines already provide a broad build space, and each companion has a distinct role.

## Playable ancestries

Each ancestry grants one always-on trait and one active or situational trait. Lineages are identity and small mechanical variations, not mandatory class pairings. The numerical values below are initial design targets for balancing, not final production values.

### 1. Vale-born

Descended from the communities that grew along the Old Road. Vale-born characters adapt quickly to unfamiliar places.

- **Roadwise:** gain a small bonus on the first navigation or social check in a new region.
- **Lineages:** **Hearth Vale** (camp and settlement rapport); **High Vale** (climbing and cold-weather travel).

### 2. Bronzeborn

People of deep quarries, high ridges, and stone-built cities. Broad frames and measured movement are common, but not universal.

- **Stone Stance:** resist forced movement and gain a bonus against stagger.
- **Lineages:** **Deepdelver** (darkness and mining knowledge); **Redridge** (heat and highland endurance).

### 3. Thornkin

A people whose ancestors formed pacts with the old forests. Some display bark-like skin, leaf-patterned hair, or subtle seasonal coloration.

- **Green Memory:** identify common plants and gain a bonus to resist natural poisons.
- **Lineages:** **Mossheart** (healing and damp environments); **Briarheart** (thorns and hostile brush).

### 4. Saltborn

Coastal and riverine families shaped by generations of life around strong tides and flooded settlements.

- **Tide Lungs:** hold breath longer and move through shallow water without the ordinary slow penalty.
- **Lineages:** **Reefkin** (water and storm awareness); **Marshkin** (mud, reeds, and concealment).

### 5. Cindrel

Families touched by the long fires beneath Veyrun. Their warmth is literal in some lineages and only a cultural inheritance in others.

- **Ember Skin:** reduce minor fire and cold exposure; hostile fire still deals meaningful damage.
- **Lineages:** **Coalmarked** (fire resistance); **Glassmarked** (craft and precise perception).

### 6. Gloamling

A compact, large-eyed people whose communities grew in caverns and the shaded undersides of old cities.

- **Low-Light Sight:** see detail in dim conditions, but not through magical darkness.
- **Lineages:** **Vaultling** (stone passage and hidden doors); **Dusklight** (stealth and twilight awareness).

### 7. Skyrill

Light-framed highland people who use gliding cloths and trained balance to travel across steep terrain. They do not have unrestricted flight.

- **Sure Step:** reduce the cost and risk of short drops and narrow ledges.
- **Lineages:** **Ridgewing** (wind and height awareness); **Cloudstep** (short controlled glide from a ledge).

### 8. Drakesworn

Descendants of old scaled guardian-beasts. Their appearance ranges from a few scale ridges to a clearly draconic face.

- **Elemental Breath:** a short-range, low-damage burst selected at creation; recharges outside the immediate action loop.
- **Lineages:** **Ashscale** (fire); **Rimecrest** (frost); **Stormcrest** (storm).

### 9. Hollowed

People who survived a brush with the Unmooring and returned changed. They are living people, not undead.

- **Unquiet Sense:** detect nearby route distortions and gain a small bonus against fear.
- **Lineages:** **Nearwake** (memory and Resolve); **Farwake** (spatial awareness and navigation).

### 10. Rookfolk

A close-knit, quick-handed people known for carrying messages, maps, and carefully remembered names. Their varied features may include feather-like hair, keen eyes, or light bones.

- **Quick Exchange:** interact with a small object or change a held item slightly faster.
- **Lineages:** **Blackwing** (observation and scouting); **Palecrest** (conversation and social composure).

**Ancestry rule:** no ancestry grants permanent invisibility, unrestricted flight, immunity to an entire damage type, or a mandatory story alignment. Every lineage should create useful flavor without making other choices feel wrong.

## Classes and disciplines

All twelve classes are available to the player. Each has three disciplines, for **thirty-six proposed launch specializations**. A class defines its resource loop; a discipline changes how that loop is expressed. “Focus” below means the class’s renewable combat resource.

### Class reference table

| Class | Health die | Primary attributes | Resource | Proficient defences | Spell traditions | Armour | Act I MVP |
|---|---|---|---|---|---|---|---|
| Vanguard | d10 | Might, Vigor | Tempo (0–5) | Guard, Fortitude | — | Heavy, shields | **Playable** |
| Reaver | d12 | Might, Vigor | Fury (0–100) | Fortitude, Reflex | — | Medium | Planned |
| Oathkeeper | d10 | Might, Presence | Conviction (0–5) | Fortitude, Resolve | Radiance (to Circle III) | Heavy, shields | Planned |
| Trailblazer | d10 | Finesse, Instinct | Aim (0–5) | Reflex, Guard | Verdance (to Circle III) | Medium | **Playable** |
| Shade | d8 | Finesse, Intellect | Opening (0–3) | Reflex, Resolve | Veil (to Circle II) | Light | Planned |
| Arcanist | d6 | Intellect | Aether + Strain | Resolve, Reflex | Arcana (full) | None | **Playable** |
| Wildspeaker | d8 | Instinct | Growth (0–100) | Fortitude, Resolve | Verdance (full) | Medium (no metal) | Planned |
| Cantor | d8 | Presence | Cadence (0–4) | Reflex, Resolve | Any two (to Circle IV) | Light | Planned |
| Lifekeeper | d8 | Instinct, Presence | Grace (0–100) | Resolve, Fortitude | Radiance (full) | Medium, shields | **Playable** |
| Binder | d8 | Presence | Debt (0–6) | Resolve, Fortitude | Veil (full) | Light | Planned |
| Pugilist | d8 | Finesse, Instinct | Balance (0–5) | Reflex, Fortitude | — | None | Planned |
| Tinker | d8 | Intellect, Finesse | Kit charges | Reflex, Guard | — (devices) | Light | Planned |

**Proficiency bonus** by level: +2 (1–4), +3 (5–8), +4 (9–12), +5 (13–16), +6 (17–20). **Health:** die maximum at level 1 + Vigor modifier; average die (rounded up) + Vigor modifier per later level. **Attributes:** 27-point buy, 8–15 before ancestry; ancestry adds +2/+1 freely assignable (BG3-style, so no ancestry is a trap for any class).

**Defence values:** Guard = 10 + armour + Finesse modifier (capped by armour) + shield; Reflex = 10 + Finesse + proficiency if proficient; Fortitude = 10 + Vigor (+ prof.); Resolve = 10 + Instinct or Presence, whichever is higher (+ prof.). Spell DC = 8 + proficiency + casting attribute modifier.

**Weapon timing (real-time cadence)** — a weapon has *wind-up / active / recovery* in seconds and a damage die:

| Family | Die | Wind-up | Recovery | Reach | Note |
|---|---|---|---|---|---|
| One-handed blade | d8 | 0.25 | 0.45 | 2.0 m | Balanced |
| Heavy blade | 2d6 | 0.55 | 0.75 | 2.6 m | Staggers on hit |
| Axe / hammer | d10 | 0.45 | 0.65 | 2.2 m | Cracks Guard −1 (stacks 2) |
| Spear / polearm | d10 | 0.35 | 0.6 | 3.2 m | Keeps enemies at bay |
| Paired light | 2×d6 | 0.18 | 0.35 | 1.8 m | Two rolls per swing |
| Shortbow | d6 | 0.3 | 0.5 | 24 m | Mobile shooting |
| Longbow | d8 | 0.5 | 0.6 | 36 m | +2 from high ground stacks with Aim |
| Crossbow | d10 | 0.2 | 1.4 | 30 m | Reload is the recovery |
| Focus rod / staff | (spell) | per spell | per spell | — | Casting focus |
| Unarmed wraps | d6 | 0.15 | 0.3 | 1.6 m | Pugilist scaling |

### Cantrips (at-will, no resource)

| Tradition | Cantrip | Effect |
|---|---|---|
| Arcana | **Spark Lance** | Ranged spell attack, `1d10 fire` (Act I Arcanist primary attack). Ignites oil. |
| Arcana | **Tug** | Pull a light object or unbalanced enemy 2 m; Fortitude save. |
| Arcana | **Glint** | Bright mote that lights an area and reveals faint tracks. |
| Verdance | **Briar Lash** | `1d6 piercing` whip at 9 m; pulls target 1 m toward caster on hit. |
| Verdance | **Murmur** | Speak a few words to an animal; makes beasts hesitate (Resolve). |
| Verdance | **Dew** | Create a small water surface (conducts storm, puts out fire). |
| Radiance | **Mending Word** | Restore `1d4` health; at most once per 6-second round per target. |
| Radiance | **Searing Mote** | Target makes Reflex save or takes `1d8 radiant` (no attack roll). |
| Radiance | **Steady** | Next ally check within 6 s gains `+1d4`. |
| Veil | **Hush Bolt** | Ranged spell attack, `1d8 umbral`; target cannot regain health for 3 s. |
| Veil | **Faint** | Minor illusion of sound or image at range. |
| Veil | **Coldfinger** | Melee spell attack `1d8 cold`; slows on hit. |

Damaging cantrips add one die at levels 5, 11 and 17.

### Class → tradition access

| Tradition | Full casters (Circle I–V) | Partial casters | Discipline grants |
|---|---|---|---|
| Arcana | Arcanist | Cantor (to IV) | Tinker Sigilwright (Circle I wards) |
| Verdance | Wildspeaker | Trailblazer (to III), Cantor (to IV) | Beastfriend gains Murmur |
| Radiance | Lifekeeper | Oathkeeper (to III), Cantor (to IV) | Beacon gains Pillar of Mercy at 13 |
| Veil | Binder | Shade (to II), Cantor (to IV) | Gloam Oath gains Night Court at 13 |

Spell circles unlock at character level 1 (I), 3 (II), 5 (III), 9 (IV), 13 (V) for full casters; partial casters unlock each circle four levels later.

### 1. Vanguard — front-line weapon specialist

**Core loop:** build **Tempo** by landing varied attacks, blocking at the right moment, and changing targets. Spend Tempo on control moves and short bursts of damage.

- **Sentinel:** intercept attacks aimed at nearby allies; turn a block into a shield bash and brief stagger.
- **Duelist:** punish isolated targets with feints, ripostes, and precise counterattacks.
- **Breaker:** use heavy weapons to crack Guard, break cover, and interrupt charged enemies.

### 2. Reaver — relentless close-range fighter

**Core loop:** build **Fury** while taking or dealing pressure. Fury strengthens attacks, but excessive use leaves the Reaver briefly winded.

- **Ravager:** convert Fury into wide swings and fast pursuit.
- **Ironblood:** absorb a measured amount of damage and return it as a retaliatory blow.
- **Stormheart:** empower attacks with short shockwaves that scatter clustered enemies.

### 3. Oathkeeper — vow-bound protector

**Core loop:** choose a combat **Vow** before an encounter; uphold its condition to build Conviction. Vows are tactical commitments, not morality labels.

- **Beacon:** protect allies with barriers, rescue movement, and restorative light.
- **Justicar:** mark an enemy and punish it when it harms a protected person.
- **Gloam Oath:** trade personal safety for control over dangerous foes; the discipline is ominous but is not locked to an evil protagonist.

### 4. Trailblazer — ranged hunter and field scout

**Core loop:** build **Aim** by holding a sightline or tracking one target. Spend it on precise shots, snares, and prepared shots.

- **Longshot:** exploit height, distance, and exposed weak points.
- **Beastfriend:** fight alongside a trained companion creature with its own health and simple orders.
- **Waystalker:** set trails, decoys, and snares to shape where a fight happens.

### 5. Shade — mobile infiltrator

**Core loop:** build **Opening** by attacking from a blind angle, changing elevation, or exploiting a distracted target. Spend it on finishers, escapes, and misdirection.

- **Cutpurse:** disarm, steal combat resources, and use quick weapon swaps.
- **Veilknife:** strike from concealment and disappear after a successful reposition.
- **Saboteur:** deploy traps, false targets, and delayed charges.

### 6. Arcanist — prepared arcane caster

**Core loop:** manage **Aether** and **Strain**. Strong spells raise Strain; allowing it to cool or using a stabilizing action avoids dangerous spell disruption.

- **Emberwright:** shape fire and heat into controlled lines, zones, and explosive marks.
- **Stormwright:** chain storm damage through wet surfaces, metal fixtures, and clustered enemies.
- **Threadseer:** bend timing and space through short repositioning, delayed effects, and counterspells.

### 7. Wildspeaker — nature pact keeper

**Core loop:** call **Growth** from living terrain, weather, or a planted seed. Growth fuels roots, forms, and area control.

- **Rootwarden:** fortify allies and turn plants or soil into defensive cover.
- **Moonshape:** temporarily take one of three beast forms: prowler, guardian, or climber.
- **Tempest-blood:** command rain, wind, and ground surges to move enemies and alter sightlines.

### 8. Cantor — combat storyteller and rhythm caster

**Core loop:** build **Cadence** by alternating a spoken verse, a weapon action, and a performance skill. Cadence powers group-wide effects.

- **Skald:** rally the party and enhance coordinated attacks.
- **Taleweaver:** create decoys, illusions, and narrative misdirection.
- **Lament:** disrupt enemy morale, lower resolve, and strengthen allies who are under pressure.

### 9. Lifekeeper — restorative and warding caster

**Core loop:** gather **Grace** by preventing harm, healing a wounded ally, or honoring a vow. Spend it on healing, protection, and last-second interventions.

- **Hearth:** specialize in efficient healing, recovery, and camp support.
- **Dawn:** use radiant offence, marks, and cleansing fields.
- **Bonekeeper:** manage death, wounds, and spiritual remains with strict costs; can stabilize enemies rather than simply destroy them.

### 10. Binder — pact negotiator

**Core loop:** bargain with a chosen **Patron** for **Debt**. Debt makes powers stronger, but must be paid through resource, exposure, or an agreed tactical condition.

- **Chaincaller:** bind, pull, and restrain targets with spectral links.
- **Star Debtor:** use distant, precise force and temporary protective constellations.
- **Unhoused:** borrow an enemy’s movement or defence pattern for a short time.

### 11. Pugilist — close-range unarmed controller

**Core loop:** build **Balance** through alternating attack, evade, and stance changes. Spend it on flowing combinations and counters.

- **Iron Hand:** break armour and stagger single targets.
- **Windstep:** move through enemy lines and strike before they can turn.
- **Still Mind:** deflect projectiles, resist control, and create a brief calm field.

### 12. Tinker — battlefield maker

**Core loop:** carry a limited **Kit** of crafted devices. Deploy, recover, and modify each device; preparation changes the available tactical answer.

- **Alchemist:** brew volatile flasks, smoke, adhesives, and restorative mixtures.
- **Gearwright:** use compact mechanical helpers, launchers, and remote triggers.
- **Sigilwright:** place temporary wards, tripwires, and magic-dampening marks.

## The complete launch spell catalogue

The catalogue below contains **sixty proposed spells**: four traditions with five circles and three spells per circle. It is a complete first-pass launch list, not a claim that every class can cast every spell. Classes and disciplines teach a subset; scrolls and rare instruction can add a small number of cross-tradition options.

### Spell rules

- **Circle** is a spell’s power band, from I to V. Higher circles cost more Aether or Grace and have longer recovery.
- A spell lists either an **attack roll** against Guard or a **saving throw** against Reflex, Fortitude, or Resolve.
- A spell’s **cast time** is the time its wielder must commit before the effect resolves. Moving, taking a hit, or being interrupted can disrupt a long cast.
- A spell that creates a surface states its material and duration. Surfaces can interact, but one effect never silently overwrites another.
- Spell damage is rolled once per target per cast unless a spell explicitly describes multiple pulses. Multiple projectiles from one cast are shown as one grouped roll event.
- Numbers in parentheses are initial tuning targets. Damage and durations can be balanced after the first playable combat prototype.

### Arcana — force, pattern, and space

| Circle | Spell | Proposed effect |
|---|---|---|
| I | **Blue Needle** | Quick bolt; spell attack against Guard; `1d6 force`. On a margin of 5+, interrupts a light attack wind-up. |
| I | **Mote Screen** | Instant ward on self or ally; grants `+2 Guard` for 6 seconds or until it absorbs one hit. |
| I | **Chalkmark** | Mark a visible enemy for 12 seconds. The next party hit reveals its Guard and grants the attacker a small accuracy bonus. |
| II | **Coil Cage** | A ring of force tests Reflex. On a failure, roots a target for 3 seconds; the ring can be broken by heavy damage. |
| II | **Slipfold** | Short teleport to a visible, reachable point. Does not cross sealed walls or unknown terrain. |
| II | **Echo Bolt** | Arcane attack for `2d6 force`; a nearby second target takes `1d6` if the first target is struck. |
| III | **Cinder Lens** | Focused beam for `3d6 force`; damage increases modestly against a warded target. Long cast, clear line required. |
| III | **Prism Guard** | Place a floating facet that intercepts one projectile or weak spell for each nearby ally, then shatters. |
| III | **Borrowed Second** | Briefly accelerates one ally’s next recovery animation; it grants no extra turn and cannot repeat until its cooldown ends. |
| IV | **Rift Tether** | Pull one target a short distance; large targets test Fortitude to resist. Can interrupt a channel. |
| IV | **Glass Comet** | Delayed impact at a marked ground point; nearby enemies test Reflex or take `4d6 force` and become staggered. |
| IV | **Null Prism** | Create a small zone that weakens active spells and blocks new low-circle projectiles for 5 seconds. |
| V | **Sky Archive** | Reveal hidden routes, traps, and active magical traces in a wide area; grants the party one prepared counter against the next arcane hazard. |
| V | **Folded Horizon** | Open a short-lived passage between two visible safe surfaces. Party members can cross in either direction. |
| V | **Unmake Pattern** | Attack one summoned creature, construct, or magical ward. Against a living target, instead deals `5d6 force` and tests Resolve to dispel one beneficial effect. |

### Verdance — growth, beasts, and weather

| Circle | Spell | Proposed effect |
|---|---|---|
| I | **Root Snare** | A root lashes a small ground area; enemies test Reflex or are slowed for 4 seconds. |
| I | **Mothwing** | Grant one ally a brief, silent sidestep and a bonus to the next stealth relocation. |
| I | **Living Bark** | Add temporary physical protection to one ally for 8 seconds; fire removes the ward early. |
| II | **Thornwake** | Create a narrow bramble strip for 6 seconds. Crossing enemies take `1d6` piercing damage and may be slowed. |
| II | **Bee Mantle** | A cloud follows the caster for 5 seconds, disrupting aim and dealing small poison damage to nearby enemies. |
| II | **Mirestep** | Turn one small patch of ground to grasping mud. Allies can cross safely; enemies test Reflex or lose movement speed. |
| III | **Briar Bastion** | Raise waist-high living cover in a line. It blocks arrows, offers flanking gaps, and can be burned or chopped down. |
| III | **Wolf-road** | Call a spectral hound that runs between two marked points, knocking aside small enemies and revealing tracks. |
| III | **Raincall** | Call rain over a broad zone. It reduces fire, improves plant effects, and makes metal or water conduct storm spells. |
| IV | **Green Cathedral** | Grow a temporary grove that gives allies cover and steady recovery while hostile creatures inside are slowed. |
| IV | **Thorn Hunt** | Mark one enemy; roots pursue it whenever it moves for 5 seconds. The target tests Reflex on the first root strike. |
| IV | **Elderbloom** | Bloom a healing plant at a chosen point. Allies in its radius recover over time; the bloom can be destroyed. |
| V | **Landheart** | Stabilize a large area: extinguish ordinary fires, close minor ground ruptures, and shield the party against one terrain hazard. |
| V | **Wild Hunt** | Summon three temporary spirit-beasts that harry marked targets. Their attacks use a shared grouped roll and expire after 8 seconds. |
| V | **Worldroot Bridge** | Grow a thick bridge between two valid nearby surfaces, including across a chasm. It remains until the next long rest or a major fire. |

### Radiance — healing, vows, and revelation

| Circle | Spell | Proposed effect |
|---|---|---|
| I | **Hearthlight** | Warm, steady light reveals mundane tracks and grants a small Resolve bonus to nearby allies. |
| I | **Stitch Flesh** | Restore `1d8 + casting modifier` health to one ally; cannot revive a dead or downed character. |
| I | **Ward Bell** | Ring a brief protective tone. The next fear or charm effect on an ally is reduced, then the ward ends. |
| II | **Golden Measure** | Expose an enemy’s active protection and show its damage resistances for 10 seconds. |
| II | **Sunlance** | Direct radiant attack for `2d8`; undead and route-born creatures test Resolve or are briefly blinded. |
| II | **Sanctuary Thread** | Connect two allies for 6 seconds; a portion of the next hit against one is redirected to the other, up to a safe cap. |
| III | **Oathfire** | Place a burning sigil on a target. It deals `3d6 radiant` if the target harms the marked ally before the sigil expires. |
| III | **Beacon Field** | Make a small zone in which allies resist fear and receive minor healing when a party member lands a critical hit. |
| III | **Verdict Chain** | Bind a target that has harmed a civilian or party member. It tests Resolve; success slows and silences, failure still reveals the target. |
| IV | **Dawn Mantle** | Protect one ally with a radiant shell that absorbs a moderate amount of damage and flares when broken. |
| IV | **Pillar of Mercy** | Restore nearby allies and stabilize downed companions. The spell cannot erase a lasting injury or story consequence. |
| IV | **Second Breath** | Revive one downed ally with low health and a short recovery penalty. Once per character per encounter. |
| V | **Crown of Dawn** | A moving aura strengthens allied defence and reveals invisible or disguised threats within close range. |
| V | **True Name** | Reveal the true identity, pact, or magical disguise of one named target. Against an enemy, tests Resolve to weaken one concealment effect. |
| V | **Last Shelter** | Create a barrier around a chosen position for 6 seconds. It blocks incoming attacks from outside; allies can leave freely. |

### Veil — shadow, memory, and absence

| Circle | Spell | Proposed effect |
|---|---|---|
| I | **Umbral Dart** | Quiet shadow bolt; spell attack against Guard; `1d6 umbral`. Deals a small bonus against an enemy already distracted. |
| I | **Quiet Step** | Muffle the party’s next short movement and grant the caster advantage on one stealth relocation. |
| I | **Whisper Ward** | Protect an ally from one brief silence or fear effect; when triggered, it gives the caster a hint about the source. |
| II | **Grave Thread** | Attach a shadow thread to a target. If it moves far from its starting point, it takes `2d6 umbral` or breaks the thread with a Fortitude save. |
| II | **Mute Bell** | Silence a small area for 4 seconds, disrupting verbal casting and alert calls. Does not prevent physical attacks. |
| II | **Borrowed Face** | Briefly adopt a non-hostile nearby person’s appearance. Witnesses can still notice suspicious behavior or close inconsistencies. |
| III | **Dusk Gate** | Move the caster and one willing adjacent ally between two patches of dim light in sight. |
| III | **Siphon Dream** | Drain `3d6 umbral` from a sleeping or shaken target; the caster receives a small ward. Alert enemies can resist with Resolve. |
| III | **Ashen Host** | Raise two short-lived shadows that draw enemy aim but deal no damage. They vanish after 6 seconds or one hit each. |
| IV | **Black Lantern** | Reveal hidden beings and false doors in a radius while obscuring the party’s outline from distant enemies. |
| IV | **Sever Name** | Strip one enemy buff or summoned tether; a living target may resist with Resolve, but still loses the effect’s concealment. |
| IV | **Night Court** | Create a darkened ring. Enemies inside have reduced ranged accuracy; allies who enter can move between shadow patches. |
| V | **The Long Night** | Place a moving veil over a broad area for 6 seconds. Enemies test Resolve or lose target tracking; bosses are slowed but not fully disabled. |
| V | **Soul Ledger** | Record the next three hostile effects aimed at the caster, then release a bounded portion as a protective counter. |
| V | **Empty Crown** | Temporarily draw nearby enemies’ attention to the caster, who gains a major ward. Ends early if the caster leaves the marked area. |

## Companion roster

The launch proposal has **twelve recruitable companions**, with four in the active field party at once. Companions can be left at the base without losing their personal quest, but some will leave if the player repeatedly violates a defining boundary. A companion’s class and discipline remain fixed; their equipment, learned talents, and combat stance can be customized.

### 1. Edda Vale — Vale-born Vanguard, Sentinel

**Role:** protector and formation leader.  
**Temperament:** practical, dryly funny, distrustful of grand promises.  
**History:** once served as a road guard until ordered to abandon a stranded hamlet to protect a charter convoy. She disobeyed and was made the scapegoat.  
**Personal arc:** decide whether public justice, private repair, or a clean break gives the survivors what they need. Edda supports protection, but not the use of civilians as a moral prop.

### 2. Brannoch Slate — Bronzeborn Tinker, Gearwright

**Role:** traps, gadgets, and ranged support.  
**Temperament:** patient, exacting, delighted by mechanisms that nearly work.  
**History:** helped build an experimental road anchor that contributed to the Unmooring. He fled before the inquiry could determine whether the failure was his fault.  
**Personal arc:** recover the design records and decide who is allowed to rebuild the anchor technology.

### 3. Sylvi Reed — Thornkin Wildspeaker, Rootwarden

**Role:** terrain control, healing, and protective growth.  
**Temperament:** attentive, reserved, not automatically gentle.  
**History:** a forest mediator whose community is divided between sealing all roads and allowing controlled travel.  
**Personal arc:** negotiate a real settlement between forest survival and nearby human livelihoods rather than choosing a convenient side.

### 4. Kes Rill — Saltborn Shade, Cutpurse

**Role:** infiltration, disarming, and quick finishes.  
**Temperament:** charming, watchful, generous with small lies.  
**History:** once stole names and travel papers for people escaping debt servitude. One forgery was used to frame a friend.  
**Personal arc:** face the person harmed by the forgery and choose what restitution looks like.

### 5. Varo Cinder — Cindrel Arcanist, Emberwright

**Role:** area damage, interruption, and fire-surface play.  
**Temperament:** curious, self-aware, easily absorbed in a problem.  
**History:** a former civic engineer who used unstable heat magic to keep a poor district warm. The work saved residents and later caused a deadly fire.  
**Personal arc:** determine whether the technique can be repaired, publicly revealed, or destroyed.

### 6. Sister Oren — Gloamling Lifekeeper, Hearth

**Role:** healing, revival, and protection.  
**Temperament:** kind without being submissive; uncomfortable with unearned absolution.  
**History:** trained in a sanctuary that quietly charged wealthy families for priority rescue. She left with the patient ledgers.  
**Personal arc:** expose the system, rebuild the sanctuary, or distribute its resources to the villages it ignored.

### 7. Tamsin Skyrill — Skyrill Trailblazer, Longshot

**Role:** ranged precision, scouting, and high-ground control.  
**Temperament:** competitive, bright, impatient with vague plans.  
**History:** served as a route courier and lost an entire caravan in a whiteout after following an outdated map.  
**Personal arc:** find the surviving families and decide whether to keep serving the charter that misreported the loss.

### 8. Orra-of-Three — Drakesworn Reaver, Stormheart

**Role:** disruption, pursuit, and close-range burst.  
**Temperament:** blunt, observant, protective of people who are treated as symbols.  
**History:** grew up as the ceremonial face of a draconic lineage, then walked away from a political marriage.  
**Personal arc:** settle a succession dispute without being forced back into a ceremonial role.

### 9. Fen Aster — Hollowed Binder, Star Debtor

**Role:** long-range control and pact-powered defence.  
**Temperament:** soft-spoken, humorous about death, serious about debts.  
**History:** returned from a collapsed road with a second shadow that speaks in forgotten route names. It has kept its side of their pact—for now.  
**Personal arc:** learn who or what holds the other end of the pact and decide whether to pay, renegotiate, or sever it.

### 10. Lio Quill — Rookfolk Cantor, Taleweaver

**Role:** group support, illusion, and social utility.  
**Temperament:** theatrical, generous, terrified of being ordinary.  
**History:** became famous for a heroic story that was mostly invented. The real witnesses are now in danger because the tale attracted the wrong attention.  
**Personal arc:** choose between preserving a useful lie and giving the witnesses control of their own story.

### 11. Asha Nacre — Saltborn Oathkeeper, Gloam Oath

**Role:** enemy control, interception, and risky protection.  
**Temperament:** disciplined, skeptical of easy goodness, fiercely reliable once committed.  
**History:** guarded prisoners for a tribunal that quietly sold acquittals. She released one prisoner without evidence, and that person later committed another crime.  
**Personal arc:** build a credible justice process that accepts uncertainty without abandoning the vulnerable.

### 12. Pellen Moss — Vale-born Pugilist, Still Mind

**Role:** mobile disruption and anti-control support.  
**Temperament:** earnest, patient, mischievous when everyone gets too solemn.  
**History:** trained at a roadside hospice where the rule was to stop a fight before it reached the patient rooms.  
**Personal arc:** decide whether their order should stay neutral, publicly take a side, or open its doors to everyone displaced by the Unmooring.

### Companion relationship rules

- Companions remember decisions made in their presence and major public outcomes.
- Approval is not one number that replaces characterization. Each companion has a few values, boundaries, and unresolved questions.
- Disagreement can produce conversation, a temporary refusal, or a challenge. It should not routinely remove the player’s ability to finish the campaign.
- Romance, if included, is opt-in, character-specific, and never required for a quest reward.
- Personal quests are compatible with a morally mixed protagonist; a companion can oppose a deed without immediately abandoning the party.

## Morality, appearance, and reputation

The project has two social systems that work together.

### The Mercy–Cruelty track

The protagonist has one slow-moving **Mercy–Cruelty** measure. It changes because of consequential choices: keeping or breaking a promise, sharing scarce supplies, exploiting a prisoner, saving civilians at real cost, killing a surrendered enemy, or using power to intimidate someone with no recourse.

Routine combat against clearly hostile enemies does not automatically make the hero evil. A survival choice does not count as cruelty simply because someone suffers. The game judges authored context, intent the player could understand, and the consequences that were visible at decision time.

The track has five readable stages:

1. **Unsettled:** no strong public supernatural signal.
2. **Merciful** or **Hardening:** subtle change in eyes, posture, and light.
3. **Kindled** or **Corrupted:** visible aura and stronger NPC reaction.
4. **Radiant** or **Dreaded:** the halo or horn silhouette becomes clear at ordinary camera distance.
5. **Sainted** or **Monstrous:** full transformation at the extreme, with a distinctly different aura, eyes, and ambient response.

On the merciful end, a fine ring of light forms above the head, facial features soften, and a few luminous motes or butterflies may appear in safe places. On the cruel end, horns grow gradually, the eyes darken or glow, the air carries a red-black haze, and insects may gather. These are visible story feedback, not disguises the player can turn off from a normal outfit menu. A helmet can physically obscure them; the character sheet still describes their current state.

### Local reputation

Each settlement and faction maintains a separate reputation based on witnessed events, credible reports, and deeds associated with the party. A person may know the hero as merciful in one town and dangerous in another. Reputation changes:

- first impressions and available conversation approaches;
- store prices, lodging, and access to public spaces;
- the kinds of jobs people are willing to offer;
- whether guards warn, question, arrest, or avoid the party;
- companion comments and local rumors;
- which allies volunteer during a later set piece.

Reputation is not identical to morality. A feared hero can still be locally admired; a merciful hero can be blamed for a disaster they failed to prevent. Witnesses can be mistaken or dishonest, and players can challenge a rumor with evidence.

### Consequence examples

- **Return a stolen medicine shipment:** Mercy rises; the settlement may remember the medicine arriving late if the player ignores another urgent lead.
- **Keep the medicine and sell it:** Cruelty rises if the party knowingly exploits a shortage; the receiving village may still praise the party, creating a local reputation distinct from the global track.
- **Threaten a witness to gain access:** produces a local fear reputation even if the threat avoids violence; companions respond according to their values.
- **Defend a village from attackers:** does not automatically raise Mercy. The moral choice may be whether to protect civilians, pursue the attackers, or secure the road for future travellers.
- **Show horns in a compassionate settlement:** the visible transformation creates conversation and uncertainty, not an automatic combat encounter. Characters judge actions as well as appearance.

### Avoiding morality-system traps

- Never lock a core class, ancestry, or basic ending choice behind a morality direction.
- Never make an evil build mechanically stronger merely because it is evil.
- Make restorative actions, apologies, restitution, and changed behavior meaningful but not instant erasers of history.
- Let companions challenge the protagonist while retaining their own agency.
- Show what a choice risks before confirming it when the player has enough information to know.

### Numeric model (implemented in the MVP)

**Range:** Mercy–Cruelty `M` runs from **−100 (Monstrous)** to **+100 (Sainted)**, starting at 0. The value changes only through authored deeds and AI-dialogue outcomes the server/local simulation validates (AI can *propose* a deed tag; the rules engine applies the value — the model can never set `M` directly).

| Stage | Range | Visible on the rigged model |
|---|---|---|
| Monstrous | −100 … −76 | Full curled horns (≈28 cm), red glowing eyes, dark-red aura, ash motes and flies, darkened skin tint, red rim light |
| Dreaded | −75 … −46 | Clear horns (≈18 cm), ember eyes, faint red haze at the feet |
| Hardening | −45 … −16 | Horn nubs (≈6 cm) break the scalp, eyes darken |
| **Wayward (neutral)** | **−15 … +15** | No halo, no horns; a faint grey-gold “road dust” glow at extremes of neutrality only when `|M| ≤ 5` for a long time (the *Balanced* title) |
| Merciful | +16 … +45 | Faint halo ring forms (opacity 30 %), eyes brighten |
| Radiant | +46 … +75 | Solid halo, soft blue-gold aura, light motes |
| Sainted | +76 … +100 | Bright halo with light shaft, butterflies in daylight, blue-white rim light |

The visual morph is **continuous** inside each stage (horn length and halo opacity interpolate), so change is felt gradually rather than as a pop.

**Deed table (Act I values).**

| Deed | ΔM |
|---|---|
| Spare a surrendering enemy | +6 |
| Give scarce supplies to refugees | +8 |
| Heal a wounded civilian (out of combat) | +3 |
| Keep a promise that costs you gold | +5 |
| Expose a lie to protect an innocent | +4 |
| Kill a surrendered enemy | −8 |
| Threaten a defenceless NPC (dialogue) | −4 |
| Steal from a civilian (witnessed or not) | −3 |
| Break a promise for profit | −6 |
| Attack a non-hostile civilian | −12 |
| Sell the Brightwell medicine to the Compact | −15 |
| Return the Brightwell medicine to the village | +15 |

**Anti-farming rules.** The same deed against the same NPC counts once. Repeated minor deeds of one kind decay geometrically (each repeat is worth 60 % of the last within an in-game day). Killing clearly hostile monsters is **morally neutral** (we deliberately reject Fable’s “monster kills are good”), and eating food never changes morality (we reject Fable’s tofu/crunchy chick farming).

**Renown** is a separate 0–10,000 number earned from quests, bosses and public deeds; titles at 0 Unknown, 300 Noticed, 1,000 Known, 2,500 Respected, 5,000 Famed, 10,000 Legendary. NPC reaction = f(local reputation, M stage, renown, visible appearance). This tuple is passed to the AI dialogue model so NPCs *react to what they can see* — a villager can comment on horns before the hero says a word.

**Helmets** can hide horns and halo from NPC *vision* (the reaction tuple then uses “hooded stranger”), but the horn mesh still deforms the helmet silhouette at Dreaded or worse.

## The world and its procedural construction

### The world map

The world map presents Veyrun as a network of **regions**, not one seamless empty expanse. Known hubs, faction centers, and campaign landmarks have stable identities. The routes between them and the arrangement of frontier sites vary by campaign seed. The map records discovered routes, rumors, danger, travel time, and unresolved companion requests.

### What changes on a new campaign

A new seed can change:

- the order and connection of minor locations;
- the shape of wilderness routes and dungeon wings;
- which optional landmarks appear in a region;
- enemy patrol paths, side-event combinations, and cache placement;
- which of several authored regional crises becomes active;
- the placement of shortcuts, climb routes, and secondary entrances.

The same save keeps its seed. Returning to a cleared location does not silently rebuild it. A new campaign creates a different route graph and a fresh set of generated spaces.

### What remains authored

The following stay authored and recognizable:

- the main campaign’s emotional turning points;
- each companion’s core story and defining conversation;
- faction identities, major settlements, signature architecture, and iconic vistas;
- the start and finale;
- puzzle logic for major story vaults;
- the rules used to generate rooms, hazards, and encounter compositions.

Procedural generation selects and connects designed modules; it does not invent untestable story logic at runtime.

### Region catalogue

The proposed campaign uses seven large regional palettes. Each region contains an authored hub, generated routes, a handful of fixed landmarks, and a seed-dependent mix of optional sites.

1. **Crownreach:** wind-cut highlands, watchtowers, rope bridges, and long sightlines.
2. **Brackenveil:** dense forest, root tunnels, hidden clearings, and layered canopy paths.
3. **Saltglass Coast:** tidal flats, sea caves, wrecks, salt works, and exposed reefs.
4. **Red Serein:** dry steppe, canyons, caravan roads, and buried cisterns.
5. **The Blackfen:** peat bog, drowned roads, stilt villages, and half-sunken chapels.
6. **Pale March:** old battlefields, chalk cliffs, abandoned shrines, and wind-carved forts.
7. **The Underway:** connected mines, old culverts, deep caverns, and fragments of road architecture beneath the surface.

### Dungeon construction rules

Each generated dungeon is built from a region- and purpose-specific kit:

- entrance and return route;
- authored room tiles with multiple door configurations;
- one or more readable loops, so backtracking has purpose;
- an optional side branch with a distinct reward or story;
- a major encounter room with enough space to use height and cover;
- a clear exit or objective marker;
- navmesh and party-pathing validation.

At least one authored landmark appears in every major region route. Optional room combinations vary, but each dungeon has a consistent visual story—for example, a flooded quarry should look and behave like a quarry even when its room order changes.

### Locations are dense, not merely large

The target is not maximum square mileage. Every screen should communicate place: craft marks on a workshop, different soil layers on a cliff, old ropes at a collapsed bridge, household objects in a looted home, signs of who used a route. Small environmental stories reward looking without requiring a loot marker on every object.

### Generation algorithm (implemented in the MVP)

Everything derives from one 32-bit **world seed** (shown in the menu, shareable; multiplayer parties share the host’s seed).

1. **PRNG.** `mulberry32(seed)` streams; each subsystem forks its own stream (`terrain`, `cities`, `dungeons`, `loot`, `encounters`) so changing one system never reshuffles another.
2. **Height.** Seeded 2D simplex noise, fractal Brownian motion (6 octaves on High, 5 Medium, 4 Low), plus **ridged noise** for mountain spines and a **domain warp** for natural river-like valleys. A large-scale “continent” mask lowers edges into sea. The Act I region is a **1.2 km × 1.2 km** playable square (expandable to 4 km in later builds).
3. **Climate.** Two more noise fields: temperature (also lowered by altitude, −6.5 °C per 1,000 m equivalent) and moisture. A Whittaker-style lookup assigns the biome per vertex.
4. **Biomes (Act I set).** Shore & Sand, Meadow, Brackenveil Forest, Blackfen Marsh, Highland Heath, Crownreach Rock, Snowcap. Each biome defines ground colour/roughness, prop sets (tree species, rocks, reeds, grass density), fog tint, ambience bed, and encounter tables.
5. **Erosion pass (High LOD only, cheap).** A few hundred particle-drop iterations carve gullies, so slopes read as weathered rather than noisy.
6. **City placement.** Candidate sites are sampled with Poisson-disc spacing; a site must be (a) flat (slope < 8°) over the city footprint, (b) above sea level, (c) near water in the city’s requirements, and (d) at least 350 m from another city. **Marrowgate** (the Act I hub city) is placed first, then **Brightwell** (village), **Gallowmere Watch** (fort ruin). The terrain is **flattened and blended** under each footprint.
7. **City interiors are authored.** Each city is a fixed JSON layout in local coordinates (walls, gates, streets, buildings, NPC spots). The seed chooses only *where* and *which way it faces* (rotation in 90° steps). The interior is “roughly the same” every run, exactly as requested; only small dressing props and market stalls vary.
8. **Roads.** A* across the heightfield cost (slope², water penalty) connects cities; roads are flattened ribbons and gain waystones.
9. **Points of interest.** Seeded placement of a **dungeon entrance** (the Sunken Mile mine), 6–10 monster camps, shrines, caches and Wayshrines (waypoints).
10. **Dungeons** (planned beyond MVP): room-kit graph generation — a spanning tree of 8–14 authored 3D rooms + 1–2 loops, validated by navmesh reachability, re-seeded every new campaign like Diablo II.

**Persistence.** A save stores the seed plus a *delta log* (opened chests, dead uniques, burnt bridges, morality, quest state) — never the geometry. Worlds are regenerated identically from the seed on load.

**Height and scale.** One world unit = one metre. Characters are 1.6–2.0 m. Max terrain relief in Act I is ~120 m, giving genuine valleys and ridges with height-advantage combat (+2 Guard-attack when ≥2.5 m above the target, −2 below, as in BG3).

## Quests, conversation, and consequences

### Conversation

Conversation is real-time outside combat and pauses combat when an authored dialogue interruption occurs. Dialogue checks use the same visible d20 model as combat checks. The interface identifies which attribute, training, reputation, evidence, or companion history affects the check.

The player can:

- ask direct questions;
- present evidence;
- bargain with money, an item, or a future obligation;
- lie or conceal relevant facts;
- let a companion speak;
- refuse, delay, or leave where the scene allows it.

A failed check should produce a new state, cost, or partial truth—not simply a dead-end “no.” The game does not roll for routine dialogue with no meaningful stakes.

### AI-generated dialogue (implemented in the MVP)

Both the **NPC’s line** and the **player’s 3–4 reply options** are generated by a language model when the player reaches a new dialogue branch. Previously generated lines and choices are reused from the character's dialogue cache. To keep this coherent with authored quests, the model is a *performer inside guard rails*, not the author of game state.

**Inputs sent each turn** (compact JSON):
- the **NPC card** (authored): name, role, ancestry, personality, speech style, secrets, what they want, what they will never do, quest hooks they may offer;
- the **player card**: name, ancestry and lineage, ancestry trait, class and actual abilities, level, background and trained skills, private principle and pressure point, visible wounds and appearance, renown title, local reputation, party members present;
- **world facts**: location, campaign day, active quests, medicine possession, camp parley, and their current state;
- the last 8 conversation messages, recent reply wording, and this NPC's saved memories and attitude;
- the **allowed outcome tags** for this NPC (e.g. `advance:brightwell`, `return_medicine`, `deed:spare`, `parley:persuade`, `fight`, `end`).

The dialogue prompt uses a **conditional reactivity layer** inspired by [Larian's description of class, ancestry, and background dialogue](https://store.steampowered.com/news/posts/?appids=1086940&enddate=1602003665&feed=steam_community_announcements) and [its account of relationships changing with player actions](https://store.steampowered.com/news/posts/?appids=1086940&enddate=1601647220&feed=steam_community_announcements). The AI picks one or two cues relevant to this NPC's immediate concern; it writes a specific line and distinct player approaches. Player background, principle, and pressure point can shape a reply, but the NPC cannot know them until revealed. The model cannot grant unearned class abilities, expose a private secret early, or write new quest results. This combines authored state gates with generated wording.

**Output schema** (strict JSON schema enforced):

```json
{
  "npc_line": "string (≤ 60 words, in character)",
  "emotion": "neutral|warm|afraid|angry|sad|amused|suspicious",
  "options": [
    { "text": "≤ 18 words", "tone": "kind|neutral|clever|cruel|leave",
      "check_id": "none|one permitted authored check ID",
      "tag": "one of the allowed outcome tags or 'talk'",
      "source": "none|class|ancestry|background|history|quest" }
  ]
}
```

**Rules engine responsibilities.** Validates every tag and check ID against allowed actions; computes the bonus from the displayed ability or ability pair, background proficiency and the authored DC; rolls with the visible d20 Roll Hold and Fortune reroll; applies morality ΔM from the deed table, never from the model; starts combat on `attack`; and validates quest targets against the actual world and inventory. The model may supply a generated side quest's title and step wording, but only the rules engine creates its ID, item target, NPC targets, branching graph, progress, handoff, and reward. A failed consequential check removes that approach for the rest of the conversation, while the NPC remembers the attempt. Options include an `end` choice, with kind, neutral/clever and cruel approaches where the scene allows them (T-rated wording).

**Branch cache.** Local play stores NPC lines and their full choice sets in IndexedDB per character; online play uses the per-user server cache. A key contains the NPC, authored lore, stable player and quest facts, allowed outcome tags, and the selected reply path with check outcomes. Reopening an unchanged conversation reuses its opening immediately. Selecting a previously visited path reuses that branch; only a new path or changed story state calls the model. Visit timestamps, memory event logs, day, health, gold, and the `metBefore` flag do not invalidate dialogue. Existing revision 42 opening entries are migrated on a matching first visit.

**Cinematic presentation and voice.** Talking to an NPC moves the camera into a close, eye-level shot of that NPC and places subtitles and choices over a dark lower frame. This follows the close character staging and expressive dialogue emphasis described in [Larian's Patch 7 notes](https://baldursgate3.game/news/patch-7-now-live_121) and its [character art update](https://www.baldursgate3.game/news/community-update-8-character-creation_9). Every named NPC line uses the server-generated TTS file with the NPC card's gender-matched `en-male` or `en-female` voice code; the browser voice is a fallback. Generated audio is cached per text and voice in IndexedDB, while in-flight requests and recently returned URLs are shared during quick reentries. The player’s chosen reply remains unvoiced.

**Title film.** The unanchored circular ground puddles were removed; they read as oval shadows disconnected from scene objects during the tracking shot.

**NPC lore and memory.** Each of the thirteen authored NPCs (including the Gallowmere brigand captain) and sixteen named wandering citizens has `npc/<key>/soul.md` for private motives and `npc/<key>/Memory.json` as an initial memory. Runtime memories are kept separately per NPC and player character: in the existing IndexedDB character save for local play, and in authenticated `npc_memories` rows served as `/api/npc-memory/<key>/Memory.json` for online play. The model can read recent memory and write new conversation events through the game rules, but cannot edit the static seed files.

**Fallback.** A malformed model response is repaired option by option so one wrong check or missing leave choice does not discard otherwise good generated dialogue. If the model fails or is rate-limited, each NPC has specific authored question topics and the normal quest actions remain available, so quests never soft-lock. Offline topics are fallback content, not AI generation.

**Safety & rating.** The system prompt enforces the T rating (no slurs, no sexual content, no graphic gore, mild language only), refuses to break character into real-world topics, and forbids inventing quest rewards. Player-typed free text (future feature) is not sent to other players without censoring.

### Quest construction and journal

The Character Sheet has a **Quest Log** tab. It lists the authored major quest as an ordered sequence, marks completed steps, and highlights the current step. Authored side quests and generated side quests appear below it, including completed entries.

Almost any speaking NPC can offer a generated side quest through a dialogue action. The quest generator first selects a currently available gatherable item and two actual speaking citizens, excluding the giver. The model then writes a short title, premise, and step text from those concrete IDs. Its text is checked for the named item and people, with grounded fallback wording if it omits them. The saved quest is a data record keyed by a unique ID; there is no fixed list or maximum number of side quest slots. The current graph is `collect item → talk to either citizen → return item to giver`. The two citizen edges save a distinct branch and different generated interpretations. More graph node types can be added only when their game events exist.

Progress comes from game events, not dialogue prose: inventory possession advances the collection step; a validated conversation with either target chooses the branch; the giver accepts the actual item and awards XP. In online realms, the server checks the saved quest's open return node and the authoritative inventory before removing the item. The journal, including title, complete step text, graph edges, current node, completed nodes, and chosen branch, is kept in `state.generatedQuests` in the character save. Local saves use IndexedDB and online saves use `/api/save`; the online save payload permits up to 2 MB. Dialogue cache keys include quest awareness, so loading a saved character restores the quest graph before generating or reusing dialogue. Importing only a dialogue cache never activates quests; the character save is authoritative.

Each involved NPC receives a quest event in its per-character `Memory.json` runtime record when the quest begins, branches, and resolves. Dialogue receives that event and a current quest commitment alongside the static `soul.md` character direction. This lets a witness react to a quest offered by another NPC without rewriting shared, authored soul files for every player's separate world. Active commitments and the three most recent completed ones are retrieved for each NPC conversation; the full history stays in the journal.

This uses a world-fact and action graph approach like [CONAN's procedural quest generator](https://arxiv.org/abs/1808.06217), where quests are planned from characters, items, locations, and available actions. The memory and retrieval layer follows the distinction between observations and persistent reflections in [Generative Agents](https://arxiv.org/abs/2304.03442). The explicit dependency chain from world facts to quest plan to prose also follows the structured intermediate representation proposed in [From World-Gen to Quest-Line](https://arxiv.org/abs/2604.25482). In this game those papers inform the architecture; they do not replace validation against the running world.

### Evidence and world memory

The journal distinguishes:

- what the party directly witnessed;
- what a character claimed;
- what is confirmed by evidence;
- what is still inference or rumor.

This prevents a procedural clue from pretending to be a fact. Major consequences are recorded as concise world-memory entries the player can revisit.

## Equipment, loot, crafting, and camp

### Loot goals

Loot should make builds more expressive, not turn every reward into a larger number. Most items have one identity feature: a new action interaction, a conditional effect, a defensive trade, a spell modifier, or a companion-specific story.

### Item quality

- **Common:** reliable base equipment and crafting materials.
- **Crafted:** predictable properties, selected by maker and material.
- **Rare:** one or two strong affixes, with a clear use case.
- **Relic:** unique authored item with a history and a build-changing effect.

The generator rolls affixes from constrained pools by item slot, region, level, and enemy type. It cannot generate contradictory traits or attach arbitrary spell powers to every object. Relics are hand-authored, discoverable through specific content, and not required for campaign completion.

### Weapon families

- one-handed blades;
- heavy blades;
- axes and hammers;
- spears and polearms;
- shortbows and longbows;
- crossbows and launchers;
- staves and focus rods;
- shields;
- paired light weapons;
- unarmed wraps and knuckle gear.

Weapon families have different reach, wind-up, recovery, and interruption strength. Class identity does not prevent a character from equipping a weapon, but training determines whether they use it effectively.

### Crafting

Crafting is focused on repair, consumables, and a small number of build-defining modifications. It is performed at the party’s base, a settlement workshop, or a suitable field station. Materials carry provenance—quarry iron, marsh resin, storm glass—and a few recipes need a particular material rather than simply a higher numeric tier.

### The Wayhouse

The party’s base is a restored waystation that changes as allies and faction relationships change. It supports:

- party storage and loadout changes;
- companion conversations and personal quests;
- spell preparation and crafting;
- route planning and rumor gathering;
- a small visible memorial for people and places the party has affected.

Rest restores health and class resources, advances certain world events, and gives companions time to speak. It is not a hidden punishment timer. The game clearly signals when rest may advance a specific urgent situation.

## Act I: The Broken Mile (the only act we build)

Act I is modelled on the scale of BG1 chapters 1–2 and Diablo II Act I: one region, one hub city, one village, one ruin, one dungeon, a central moral crisis, and one act boss. Target length for the full Act I: **8–12 hours** first run, **3–4 hours** replay. The MVP implements the opening slice of it.

### Premise

The Old Road between Marrowgate and the mountain villages collapsed overnight. A medicine caravan bound for Brightwell, a village sick with “greyfever,” vanished in the collapse. The player, a newly woken **Roadsworn**, survives the collapse at the edge of the Sunken Mile and learns that the Meridian Compact has already found the caravan — and intends to sell the medicine back to Brightwell at ten times the price.

### Fixed locations (interiors authored, placement seeded)

| Location | Type | Contents |
|---|---|---|
| **Marrowgate** | Walled hub city | North gate, Market Square with a fountain, the Lantern Inn (rest, companions), the Compact Counting-House, the Wayfinder Chapel (healing, respec), a smithy, a docks/riverside quarter, 12 authored NPCs |
| **Brightwell** | Village | Well green, six cottages, the sick-house, Elder Maud, healer Tobin |
| **Gallowmere Watch** | Ruined fort on a ridge | Bandit and Compact mercenary camp; the stolen medicine crates |
| **The Sunken Mile** | Dungeon (seeded rooms) | Collapsed road tunnels, mine works; act boss **the Mire Warden** |
| **Wayshrines** (4) | Waypoints | Fast travel once lit, as Diablo II waypoints |

### Main quest: “Bitter Medicine”

1. **Wake on the Mile.** Tutorial: movement, the first visible dice roll, the first Roll Hold on the first strike against **Gloam-rats**.
2. **Marrowgate.** Meet **Captain Ilse Varn** (gate warden) and **Factor Dace Orrin** of the Compact; AI dialogue reveals the caravan was taken.
3. **Brightwell.** See the sick villagers; Elder Maud asks for the medicine back. *Moral setup.*
4. **Gallowmere Watch.** The entry cutscene opens Rafe's AI dialogue before his garrison attacks. Fight, talk through the camp (Persuasion DC 14 / Intimidation DC 12 / Deception DC 15), join the brigands, or turn them against the Compact with evidence. Recover the crates.
5. **The choice.** Return the medicine free (**+15 M**, Brightwell allies, Compact hostile), sell it to Orrin (**−15 M**, 300 gold, Brightwell suffers), or split it (no ΔM, both factions lukewarm) — any can be reached through AI dialogue options that map to the same tags.
6. **The Sunken Mile.** Follow the collapse to its source; the Mire Warden is a road-spirit corrupted by the Unmooring. Defeating it ends Act I.

### Side quests (Act I)

- **The Ferryman’s Debt** (Marrowgate docks) — collect or forgive a debt (±5 M).
- **Wolves at the Well** (Brightwell) — a Champion wolf pack; Diablo-style blue-name champions.
- **The Cartographer’s Lost Folio** (Lantern Inn) — find a map piece in a seeded cache; reveals the dungeon entrance on the world map.
- **A Light for the Shrine** — light all four Wayshrines (+1 Fortune max).
- **The Deserter** — a Compact mercenary begs to be spared at Gallowmere (spare +6 / kill −8 / recruit as hireling).

### Enemies (Act I roster)

| Enemy | Level | Health | Guard | Attack | Notes |
|---|---|---|---|---|---|
| Gloam-rat | 1 | 7 | 11 | +3, d4 | Packs of 3–6 |
| Road-brigand | 2 | 16 | 13 | +4, d6+2 | Will surrender at 25 % health (moral choice) |
| Brigand archer | 2 | 12 | 12 | +4, d8 ranged | Seeks high ground |
| Fen-hound | 3 | 22 | 13 | +5, d8+2 | Champion variant: blue name, ×2.5 health |
| Compact sellsword | 3 | 26 | 15 | +5, d8+3 | Shield block |
| Mire Warden (boss) | 5 | 120 | 15 | +7, 2d8+4 | Telegraphed slam (Reflex DC 14), summons rats |

Uniques use Diablo-style modifiers from a small Act I pool: *Swift*, *Stoneskin*, *Ember-touched* (fire damage, bursts on death), *Frenzied*.

## Technical architecture

### Platform and constraints

The game is a static web project served by websim: no bundler, no npm. ES modules load **three.js r160** from a CDN through an import map. The only server-side file is `server.js` (Cloudflare Workers runtime) which owns the `/api/*` routes, the SQLite database (`env.DB`) and the realtime multiplayer room. Everything else runs in the browser.

### File map

| File | Responsibility |
|---|---|
| `index.html` | Playable Act I entry page |
| `play.html` | The game page (canvas + HUD markup) |
| `css/game.css` | HUD, menus, dice overlay, dialogue panel, character creator |
| `js/main.js` | Boot, renderer, camera, input, main loop, glue between systems |
| `js/quality.js` | The three quality tiers and auto-detection |
| `js/rng.js` | `mulberry32`, seed forking, 2D simplex noise, fBm, ridged noise |
| `js/data.js` | Ancestries, classes, spells, enemies, NPC cards, quests, deed table |
| `js/world.js` | Heightfield, biomes, seamless terrain chunks, gatherables, cities, roads, props, collision grid, `heightAt()` |
| `js/character.js` | Rigged glTF characters, per-ancestry bone scaling, materials, halo/horn attachments, animation state machine |
| `js/title-monster.js` | Opening-cinematic Hollow model reused for rare night hunters |
| `js/dice.js` | Rules (`d20`, advantage, crits, checks) + the visible dice overlay + Roll Holds |
| `js/combat.js` | Actors, enemy AI, attacks, spells, damage, death, loot drops |
| `js/morality.js` | Mercy–Cruelty value, stages, deed application, visual morph parameters |
| `js/dialogue.js` | AI dialogue (NPC line + player options), checks, TTS, fallbacks |
| `js/audio.js` | Spatial audio with HRTF panning and **ray-cast occlusion** |
| `js/speech.js` | Generated voice file playback with browser speech fallback |
| `js/net.js` | Multiplayer client (websim realtime room): presence, interpolation, events |
| `js/save.js` | Persistence: IndexedDB (local mode) and `/api/save` (online mode) |
| `js/ui.js` | HUD, character creator, menus, combat log, toasts |
| `server.js` | `/api/save`, `/api/load`, `/api/characters`; realtime room for co-op |
| `sfx/*.wav` | Generated sound effects and ambience |

### Rendering

- **Renderer:** `THREE.WebGLRenderer`, ACES filmic tone mapping, sRGB output, physically based `MeshStandardMaterial` everywhere.
- **Sky & sun:** analytic atmosphere (`three/examples/jsm/objects/Sky`) with a 24-minute solar orbit, smooth dawn/dusk colour, dynamic sun and moon fill, phase-lit lunar disc, star field, and night-responsive height-tinted fog.
- **Shadows:** PCF-soft directional sun shadow map follows the player, with a lower resolution secondary moonlight map at night. Characters, trees, buildings and rocks cast and receive.
- **Ray casting:** a CPU ray marcher over the heightfield and collision grid is used for (1) **sun visibility** (characters standing in terrain/building shadow get dimmed rim light and NPC stealth bonus), (2) **line of sight** for ranged attacks and spells, (3) **audio occlusion**, and (4) mouse picking. True GPU ray-traced shadows/GI are a WebGPU-era target and are listed in the roadmap; we do not claim them today.
- **Terrain:** chunked heightfield (each chunk 100 m). Chunks share one resolution per quality tier and sample normals from the global heightfield, keeping edges and lighting continuous; vertex colours encode biome blending.
- **Vegetation & props:** `InstancedMesh` per prop type (pines, broadleaf trees, rocks, reeds, grass, ferns, flowers, and gatherable plants) so thousands of objects render in a few draw calls; density scaled by quality tier.
- **Post:** optional on High: `EffectComposer` with UnrealBloom (spell glow, halo, ember eyes) and SMAA-equivalent antialiasing via the renderer’s MSAA.

### Quality tiers

| Setting | Low (mobile) | Medium | High (desktop) |
|---|---|---|---|
| Pixel ratio | 0.75–1.0 | 1.0–1.5 | up to 2 |
| Shadow map | 1024, PCF | 2048, PCF-soft | 4096, PCF-soft |
| Terrain sample spacing | 4 m | 4 m | 2 m |
| Vegetation density | 35 % | 70 % | 100 % |
| Grass and small plants | sparse | medium | dense |
| View distance / fog | 350 m | 550 m | 800 m |
| Bloom | off | off | on |
| Erosion pass | off | off | on |

The tier is auto-chosen (touch device or low `hardwareConcurrency` → Low) and can be switched at any time from the in-game menu; the world rebuilds from the same seed.

### Characters and rigging

- **Skeleton:** characters use a procedural skinned humanoid mesh and a shared named-bone layout. Armour is generated around the same body profile; weapons and shields stay attached to hand and forearm bones through animation.
- **Dynamic character creation:** ten ancestry presets drive height, frame width, sculpted face proportions, skin and eye colours, and distinctive head features. Skin has subtle procedural pigment detail. Head features follow the head bone; helmets cover protruding ears, crests, and horns. The creator previews the rigged model live and rotates it.
- **Equipment art:** each equipped weapon has a distinct procedural mesh with a continuous blade or shaped head, wrapped grip, fittings, and material texture. Steel, mail, leather, cloth, and wood use small local texture maps. The skinned armour has seams, straps, trim, and rivets; helmets and shields use separate detailed meshes. The weapon catalog takes its broad family mix from the [Baldur's Gate: Enhanced Edition Adventurer's Guide](https://files.beamdog.com/files/BGEE-AdventurersGuide_en.pdf) and the [D&D Basic Rules equipment list](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/equipment).
- **Morality attachments** are parented to the **head bone**: a torus halo (emissive, bloom-friendly) and two procedurally built curved horn meshes whose length/curl interpolate with the morality value, plus eye glow and an aura particle ring at the feet.
- **Enemies** reuse the rig with different proportions/materials (brigands, sellswords) or simple procedural rigs (rats, hounds).
- **The Hollow** uses a custom procedural mesh assembled from mottled skin, bump-mapped ribs and vertebrae, torn alpha-cut shroud, articulated claws, antlers, and stringy hair. Its slow gait and crouched feeding pose use procedural limb layers.

### Collision and movement

- **Ground:** every actor is snapped to `heightAt(x, z)` (bilinear on the heightfield, with city flattening) and cannot climb slopes above 42°.
- **Static colliders:** trees, rocks, walls and buildings register circles/boxes in a **uniform spatial hash grid** (4 m cells). Movement resolves by push-out against nearby colliders (circle-vs-circle, circle-vs-oriented-box), so characters slide along walls instead of sticking.
- **Dynamic:** actors push each other apart (soft separation) so crowds don’t overlap.
- **Water:** below sea level is wadeable to −1.2 m depth, then blocked.

### Audio

- Web Audio graph: per-source `PannerNode` (**HRTF**, inverse distance) → per-source **low-pass filter** → bus → master compressor.
- **Ray-cast occlusion:** each frame (staggered), a ray from listener to every active source is marched against terrain and colliders; occluded sources get their low-pass cutoff lowered (≈ 900 Hz) and gain reduced (−6 dB), so a fight behind a hill or inside a building sounds muffled and correct.
- Biome ambience beds crossfade; footsteps are triggered by animation phase.
- **Voice:** NPC dialogue spoken via websim text-to-speech with subtitles.

### Multiplayer (online mode)

- **Topology:** websim’s one realtime room per project, multiplexed into **parties** of up to 4 players (BG3 co-op size). The first player in a party is the **host** and their world seed is the party seed.
- **Authority:** the server validates movement speed and attack range, owns party membership, relays combat events and dice results (dice are rolled on the acting client for responsiveness and **re-checked by the server** using the published formula bounds; impossible results are rejected).
- **Tick:** 10 Hz snapshots of position/rotation/health, quantised; other players are interpolated 100 ms in the past; your own movement is predicted locally.
- **Roll Holds in co-op:** a Roll Hold pauses only the **local** simulation and dims the screen for the triggering player; other players see the die over that character’s head. (A global pause would be unfair in real-time co-op; BG1/2 multiplayer had the same problem.)
- **Persistence:** characters and saves in `env.DB` (SQLite) keyed by the websim `user_id`.

### Local mode (“local land mode”)

- No network needed after load. Same simulation, enemies and dialogue logic (AI dialogue still needs the websim AI endpoint; offline falls back to authored lines).
- **IndexedDB** database `unwritten-roads`, object stores `characters` and `saves`. Autosave every 60 s and on quest events.

### Database schema (server)

```sql
CREATE TABLE characters (id TEXT PRIMARY KEY, user_id TEXT, username TEXT, name TEXT, data TEXT, updated_at INTEGER);
CREATE TABLE saves (id TEXT PRIMARY KEY, user_id TEXT, character_id TEXT, seed INTEGER, data TEXT, updated_at INTEGER);
CREATE TABLE realm_hollows (realm_id TEXT, hollow_id TEXT, loot TEXT NOT NULL DEFAULT '{}', updated_at INTEGER, PRIMARY KEY (realm_id, hollow_id));
```

`data` is JSON: character sheet, inventory, morality, renown, quest flags, and the world delta log. Geometry is never stored — worlds regenerate from the seed.

### Save format

```json
{ "v": 1, "seed": 123456, "char": { "name": "…", "ancestry": "valeborn", "class": "vanguard", "level": 1, "xp": 0,
  "attrs": {"might":15,"finesse":12,"vigor":14,"intellect":8,"instinct":10,"presence":12},
  "look": {"skin":"#c99a7a","hair":"#3a2a1c","height":1.0,"build":1.0} },
  "morality": 0, "renown": 0, "gold": 25, "fortune": 2, "pos": [0,0,0],
  "quests": {"bitter_medicine": "marrowgate"}, "flags": {}, "deltas": [] }
```

## Content rating: Teen (ESRB T / PEGI 12–16)

- **Violence:** fantasy combat with blood *flecks* (no dismemberment, no gore pools, no decapitation). Defeated humanoids collapse; bodies fade after 30 s.
- **Horns and halo** are stylised fantasy, not religious iconography of a specific real faith.
- **Language:** mild (“damn,” “hell”) at most; no slurs. Enforced in the AI dialogue system prompt and by the platform’s censor on any relayed text.
- **No sexual content**; companions can have affection arcs expressed through conversation only.
- **Alcohol** may appear in taverns; no drug use. **Gambling** for in-game gold only, no real-money mechanics.
- **Online interactions** are not rated: player chat (future) is censored server-side via `room.censor`.

## Difficulty, accessibility, and fairness

Difficulty changes enemy behaviour, damage pressure, resource availability, and how quickly mistakes become dangerous. It does not secretly manipulate dice outcomes.

Proposed player-facing support:

- reduce or remove automatic Roll Holds while keeping all roll information in the log;
- change the pause duration and size of the die presentation;
- use high-contrast roll text and colour-independent status icons;
- adjust camera tilt, zoom, shake, and hit flashes independently;
- show attack ranges and enemy danger zones more prominently;
- slow simulation speed while issuing orders;
- allow a fully paused order queue;
- make downed-character checks more forgiving;
- provide a Story setting that greatly reduces damage and permits easier recovery.

Enemy telegraphs must remain consistent at every difficulty. A boss can introduce a new move, but that move needs a readable wind-up and a clear impact area. Difficulty should test decisions and execution rather than make a warning meaningless.

## First playable slice

The first playable should answer the project’s biggest design risks before adding a large campaign.

### Content

- one small Wayhouse hub;
- one Crownreach route with three possible generated layouts;
- one fixed watchtower landmark and one optional generated mine;
- four recruitable companions;
- four classes with one discipline each;
- twelve spells across the four traditions;
- one moral choice with a visible consequence and one local reputation response;
- two enemy groups and one named encounter.

### Systems to prove

1. Continuous combat can show dice without becoming visually noisy.
2. Roll Holds feel deliberate and short, not like a turn-based battle hidden inside action combat.
3. An order queue remains understandable while the player also controls one character directly.
4. Height, cover, and movement checks create meaningful routes without unreliable pathing.
5. One generated map feels authored because its room kit, landmarks, and event logic are specific.
6. A moral choice changes conversation and appearance in a way the player notices.

### Slice acceptance questions

- Can a first-time player explain why an attack missed?
- Can they tell which enemy is about to hit and how to respond?
- Do they understand the difference between a normal roll animation and a Roll Hold?
- Does the map feel new while remaining easy to read?
- Does the protagonist’s moral appearance change gradually enough to feel earned?
- Can companions disagree without making the player feel punished for roleplaying?

<!--MVP-->

## Research sources

These links support the comparison notes above. The game systems in the rest of this document are proposals, not claims about the referenced games.

1. **Beamdog, Baldur’s Gate: Enhanced Edition.** Official product page describing the classic campaign and its modern presentation.  
   <https://www.beamdog.com/games/baldurs-gate-enhanced/>
2. **Beamdog, Baldur’s Gate II: Enhanced Edition.** Official product page; also identifies the game’s upgraded Infinity Engine and companion additions.  
   <https://baldursgateii.beamdog.com/>
3. **Larian Studios, Baldur’s Gate 3 — About.** Official feature page covering team-based initiative, advantage and disadvantage, roll modifiers, environmental interactions, and vertical exploration.  
   <https://baldursgate3.game/about>
4. **Larian Studios, “A Little About Combat & Stealth.”** Official article on initiative, turn-based rules, stealth, verticality, and player choice.  
   <https://baldursgate3.game/news/a-little-about-combat-stealth_3>
5. **Blizzard Entertainment, Diablo II Manual (PDF).** Official manual; includes the distinction between saved single-player world layout and newly generated multiplayer layouts.  
   <https://download.blizzard.com/pub/misc/Diablo%20II%20Manual.pdf>
6. **Blizzard, The Arreat Summit — General FAQ.** Official Diablo II reference; states that dungeon and wilderness areas are randomized.  
   <https://classic.battle.net/diablo2exp/faq/general.shtml>
7. **Blizzard, The Arreat Summit — Classes and Skills.** Official reference for Diablo II’s seven class identities and class-specific skill systems.  
   <https://classic.battle.net/diablo2exp/classes/> · <https://classic.battle.net/diablo2exp/skills/>
8. **Microsoft Game Studios / Lionhead Studios, Fable: The Lost Chapters manual.** Manual text describes alignment affecting appearance and the halo/horn cues. The surviving online copy is hosted by ManualsLib.  
   <https://www.manualslib.com/manual/378753/Microsoft-Game-Studios-Fable.html>
9. **The Guardian, “Fable at 20: a uniquely British video game with a complex legacy.”** Retrospective discussion of moral choices, appearance, and social response in the original game.  
   <https://www.theguardian.com/games/2024/sep/18/fable-at-20-a-uniquely-british-video-game-with-a-complex-legacy>
10. **Xbox Wire, “Fable: Answering the Big Questions After that Long-Awaited Developer_Direct Deep-Dive.”** Official discussion of the newer Fable project’s locally witnessed reputation approach, which differs from the classic halo-and-horns model.  
    <https://news.xbox.com/en-us/2026/01/22/fable-interview-overview-details-developer-direct-2026/>

---

**Document intent:** a detailed starting blueprint for discussion, prototyping, and later revision. Every number, name, feature, spell, character, and story beat is a proposal until implemented and tested.
