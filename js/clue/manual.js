// Title-screen manual. Rules are described here; full character lore is read
// from the same soul and memory files used by the AI.
import { SUSPECTS, CORE_WEAPONS, SECONDARY_WEAPONS, ROOM_LIST, ROOM_BY_ID, itemName } from "./data.js";
import { PROPS } from "./layout.js";
import { TASKS, TOOL_NAME } from "./tasks.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const SPECIAL_ITEMS = [
  ["rag", "Killers can wipe nearby fresh blood once. The rag becomes bloodied and can be found or disposed of. A rag also works for the bathroom chore."],
  ["bleach", "Killers can pour while holding it to leave a wet trail. Its contents are limited, and the trail can be noticed."],
  ["towel", "Killers can dry nearby wet bleach marks. The towel becomes damp."],
  ["lens", "Hold the Lens of Truth to see blood wiped with a rag or water mop. Bleach removes the trace; pocketing the Lens stops the effect."],
  ["coin", "Keep it in a pocket: on a killing night it crumbles and walks you to the safest room. The butler covets it. A used or given-away coin turns up again the day after a killing night."],
  ["torch", "Lights the tunnels. Relight it at a burning fireplace or stove; water puts it out."],
  ["bandage", "Use while bleeding to close a wound before the next night ends. Found in the kitchen and office."]
];
const displayName = (kind) => ({ watering: "Watering Can", cue: "Billiard Cue" })[kind] || (itemName(kind) === kind ? kind[0].toUpperCase() + kind.slice(1) : itemName(kind));
const LOOSE_KINDS = [...new Set(PROPS.map((p) => p.kind))].sort((a, b) => displayName(a).localeCompare(displayName(b)));
const assetImage = (kind) => "<span class='manual-object-image'><img data-manual-visual='prop:" + kind + "' alt='' loading='lazy'></span>";
const itemRow = (kind, description) => "<tr><td><span class='manual-object-name'>" + assetImage(kind) + "<strong>" + esc(displayName(kind)) + "</strong></span></td><td>" + description + "</td></tr>";
const roomCard = (room) => "<div class='manual-room-card'><span class='manual-room-image'><img data-manual-visual='room:" + room.id + "' alt='Floor plan of the " + esc(room.name) + "' loading='lazy'></span><b>" + esc(room.name) + "</b>" + (["kitchen", "bathroom", "lounge", "office"].includes(room.id) ? "<small>Trapdoor to the tunnels</small>" : "<small>Murder location</small>") + "</div>";

const PAGES = [
  {
    id: "start", label: "Start here", title: "How to Play",
    html: [
      "<p class='manual-lead'>Eight guests enter the mansion. One or two are secretly killers. Explore, listen, and decide whose story the evidence supports.</p>",
      "<div class='manual-facts'><div class='manual-fact'><b>Explore</b><span>Move through rooms, handle objects, and learn who was where.</span></div><div class='manual-fact'><b>Survive</b><span>When the lights flicker, the killer can strike.</span></div><div class='manual-fact'><b>Accuse</b><span>Name the killer, the weapon, and the room at the table.</span></div></div>",
      "<h3>The rhythm of a match</h3>",
      "<ol><li>You receive a secret role: Killer or Savior. AI guests fill seats without human players.</li><li>Each night has an exploration period. Rooms, people, and weapons you encounter become part of your story. The notes book records facts you learned.</li><li>On a killing night, the lights flicker and guests are shut into rooms. A killer may strike a guest in the same room. The first night cannot be skipped.</li><li>After a murder, the halls reopen for a body search. Finding the body brings everyone to the accusation table. On later nights, the table meets when the night ends even if nobody died.</li><li>The table hears proposals and rebuttals, then votes. A correct killer, weapon, and room catches the killer.</li></ol>",
      "<p class='manual-note'>Each exploration night lasts about two minutes. After a murder the killer gets a short dark period, then the living have two minutes to find the body. The murderer is assigned anew each match; character history never reveals the current answer.</p>"
    ].join("")
  },
  {
    id: "saviors", label: "Saviors", title: "Playing a Savior",
    html: [
      "<p class='manual-lead'>Stay alive long enough to prove what happened. A good accusation connects a person, a weapon, and a room to an actual murder.</p>",
      "<h3>Gather a reliable account</h3>",
      "<ul><li>Visit rooms, notice which weapons are present or missing, and watch who carries what.</li><li>Talk with guests, compare their accounts, and ask to search pockets when the conversation offers that choice.</li><li>Open cupboards, wardrobes, chests, and search bins. A body may be concealed in large storage or an unlit fireplace away from the trapdoors.</li><li>Look for blood, cleaning, damp marks, and bodies. Inspecting a body reveals evidence and can trigger the table.</li><li>Use the Lens of Truth in your hand to reveal blood wiped with a rag or the butler's water mop. Bleach removes that trace. Your notes book separates your observations from things another guest told you.</li><li>A guest waits about 10 seconds for your answer. Calm, warm guests and guests who trust you wait longer, up to about 30 seconds. When their patience runs out, a d20 decides whether they wait again or get annoyed and leave, which costs a little trust.</li><li>A <b>Share</b> choice tells something you saw yourself. A <b>Pass on</b> choice repeats what someone told you or what you overheard, and names that person.</li><li>The storage chests in the game room and the library can be pushed along the wall in front of a door. A barricaded door can't be opened from either side until someone pushes the chest back, and guests go around through another door.</li><li>During a blackout, you are kept inside a room. Remember who could reach that room when the lights return.</li></ul>",
      "<h3>At the table</h3>",
      "<p>Choose Who, With what, and Where. Listen to proposals, offer a rebuttal when your own evidence disproves one, then cast your vote. A tie causes another vote. All three parts must match the same murder. In a two-killer match, catching one killer leaves the other in play.</p>",
      "<p>One killer faces a final table by night seven; two killers play as far as night ten. Do not treat a character's biography as proof. The current round's sightings, objects, testimony, and physical evidence are what matter.</p>"
    ].join("")
  },
  {
    id: "killer", label: "Killer", title: "Playing the Killer",
    html: [
      "<p class='manual-lead'>Keep your role hidden, isolate a guest, and survive the accusation table. Other guests are watching your movements and your hands.</p>",
      "<h3>Before the lights fail</h3>",
      "<ul><li>Find a weapon, learn the rooms, and notice where other guests travel. One handed weapons leave a wound on the first strike and kill on the second. You can carry two one handed weapons at once.</li><li>A first strike commits you to that victim for the night. If they survive, they leave small blood drops until they use a bandage. An untreated wound is fatal after the following night.</li><li>Speak naturally, but remember that witnesses can compare your claims with their own sightings.</li><li>During a flicker, look at a closed door or up from a tunnel trapdoor and use the alternate action to peek. A stealth d20 roll can reveal who is inside without exposing you. Fail, and you are spotted and rush inside; if someone is there, you must kill them even with a witness present. A witness remembers the murder and will keep accusing you.</li><li>On killing nights, a target in the same room can be attacked, and a kill is required. Only one murder can happen in a killing round, even with two killers. With one killer, killing nights are the odd nights; with two, they are night one and every third night after it.</li></ul>",
      "<h3>After a murder</h3>",
      "<p>You get a short period before the halls reopen. With both hands free, you can drag an unfound body toward a trapdoor and down to the tunnels, or into a large wardrobe, chest, cellar barrel, or unlit fireplace in a room without a trapdoor. Body dragging has a limited daily strength budget and leaves a trail. Hold a small object and use a cupboard to hide it in one step. Two fresh rags arrive every night, and killing nights bring an extra bleach spray bottle. Near a water-cleaned bloodstain, you see an outline that other guests cannot see without the Lens of Truth. Bleach removes the hidden trace. Each action can leave clues or be witnessed.</p>",
      "<p>In the tunnels you can knock a guest unconscious and drag them, but you cannot murder them there. A found body may be reported; the killer can also make a false report about another living guest if the game offers that choice.</p>",
      "<h3>Winning and losing</h3>",
      "<p>The killer wins if only one Savior remains or the final accusation fails. In a two-killer match both killers must have made a kill for a failed final accusation to count as their victory. A correct accusation catches a killer; catch both and the Saviors win.</p>"
    ].join("")
  },
  {
    id: "tasks", label: "Tasks", title: "Daily Tasks",
    html: [
      "<p class='manual-lead'>Each morning every Savior is handed one chore. Walk to the station, press the action key, and finish its little mini-game.</p>",
      "<div class='manual-facts'><div class='manual-fact'><b>Finish it</b><span>+1 trust with every other Savior.</span></div><div class='manual-fact'><b>Skip it</b><span>When the day ends, roll 1d4 and lose that much trust with each Savior.</span></div><div class='manual-fact'><b>No Task</b><span>One morning in five you get the day off. No penalty.</span></div></div>",
      "<h3>The chores</h3><table class='manual-table'><thead><tr><th>Task</th><th>Where</th><th>How</th></tr></thead><tbody>",
      TASKS.map((t) => "<tr><td><strong>" + t.icon + " " + esc(t.title) + "</strong>" + (t.tool ? "<br><small>Needs " + esc(TOOL_NAME[t.tool]) + "</small>" : "") + "</td><td>" + esc(t.room ? ROOM_BY_ID[t.room]?.name || t.room : "A random room") + "</td><td>" + esc(t.how) + "</td></tr>").join(""),
      "</tbody></table>",
      "<h3>Good to know</h3>",
      "<ul><li>Your task shows in the corner of the screen. Its station is marked ★ when you look at it.</li><li>You can play any station, but only your own task earns trust.</li><li>Walking away, a conversation, or the lights failing closes the mini-game. Start it again when you are back.</li><li>Other guests see the work happen: chopped lettuce, darts in the board, a new painting on the easel, a clean bathroom, a defragmented screen.</li><li>The killer's card reads <b>Kill required</b> on killing nights and <b>No killing today</b> on quiet nights, when tidying up blood and bodies is optional. Killers can play stations too, to look busy.</li><li>The butler has his own chores on quiet nights: trash, floors and restocking the bathroom.</li></ul>"
    ].join("")
  },
  {
    id: "butler", label: "The butler", title: "The Butler",
    html: [
      "<p class='manual-lead'>On nights without a murder the butler walks the house doing his chores. He sees a lot. He tells the truth very rarely.</p>",
      "<ul><li>Talk to him to ask what he has seen. Getting a straight answer takes a roll of 18 to 20 on a d20.</li><li>Fail the roll and he lies to you. The lie goes into your notes as something he told you, and you may well believe it.</li><li>He remembers whoever pried at him and failed. He will spread lies about that guest to the others.</li><li>If you carry the Lucky Coin he will ask for it. Hand it over and he answers one question truthfully, stops lying about you, and will tell you why the coin matters if you ask.</li><li>He doesn't care about blood. He mops with water in his assigned rooms and wherever he sees hallway stains. The blood disappears from ordinary sight, but the Lens of Truth still reveals it until a killer uses bleach. He takes bin bags outside, bloody rags and all, and restocks the bathroom with bleach and towels. He stays out of the cellar and tunnels.</li><li>The other guests use him too, each in their own way. Curious, trusting guests seek him out more often. Skeptics doubt what he tells them. A guest who catches him in a lie avoids him afterwards. A guest who isn't superstitious may trade the coin for the truth.</li><li>He never comes on killing nights.</li></ul>"
    ].join("")
  },
  {
    id: "evidence", label: "Evidence & votes", title: "Follow the Evidence",
    html: [
      "<p class='manual-lead'>The game records what a guest could know. A clue heard from someone else is not the same as a clue you observed yourself.</p>",
      "<h3>Your notes book</h3>",
      "<p>On the first night, entering rooms, handling weapons, and meeting people can fill your story cards. Open Notes for the Who / What / Where sheet and the Investigation Log. Mark possibilities with a cross, check, or question mark. These marks are your own working notes; they do not change the match. The Investigation Log tab lists facts you learned and identifies their source.</p>",
      "<h3>What can leave a trail?</h3>",
      "<ul><li><strong>Sightings:</strong> a guest in a room at a time, someone carrying a weapon, or someone near a body. You only see what is in front of you. A close, direct look keeps detail, a far or sidelong glimpse keeps only that someone was there, and a guest behind you goes unseen.</li><li><strong>Physical traces:</strong> fresh blood, the smaller drops left by a bleeding guest, wiped blood revealed by a lens, bleach marks, a bloodied rag, a damp towel, or items found in a bin.</li><li><strong>Conversation:</strong> direct statements, overheard claims, contradictions, and a search that exposes what someone carries.</li><li><strong>Body evidence:</strong> its discovery, nearby weapon, room, and an approximate time of death.</li></ul>",
      "<h3>How the table works</h3>",
      "<ol><li><strong>Propose:</strong> each living guest selects a suspect, weapon, and room.</li><li><strong>Rebut:</strong> use a fact you know to challenge an incompatible proposal, or stay silent.</li><li><strong>Vote:</strong> choose the final triple. The table tallies each category; tied categories are voted on again.</li><li><strong>Reveal:</strong> only a triple matching an actual murder catches a living killer.</li></ol>"
    ].join("")
  },
  {
    id: "objects", label: "Objects & tools", title: "Objects in the House",
    html: [
      "<p class='manual-lead'>These are the actual objects you will see in the mansion. Look at one within reach to see its action prompt. You have two hands and two pockets; large objects use both hands.</p>",
      "<h3>Tools and special items</h3><table class='manual-table manual-object-table'><thead><tr><th>Object</th><th>What it does</th></tr></thead><tbody>",
      ...SPECIAL_ITEMS.map(([kind, description]) => itemRow(kind, description)),
      "</tbody></table>",
      "<h3>Core weapons</h3><p>These five weapons begin in fitting rooms of the mansion. The label shows how many hands each needs.</p>",
      "<div class='manual-object-grid manual-weapon-grid'>" + CORE_WEAPONS.map((w) => "<div class='manual-object-tile manual-weapon-tile'>" + assetImage(w.id) + "<strong>" + esc(w.name) + "</strong><small>" + w.hands + " hand" + (w.hands === 2 ? "s" : "") + "</small></div>").join("") + "</div>",
      "<h3>Secondary weapons</h3><p>Find the kitchen knife on a kitchen counter, rope in the tunnels, and a two handed sword at a knight statue at the end of a hallway. They can also be used in an accusation.</p>",
      "<div class='manual-object-grid manual-weapon-grid'>" + SECONDARY_WEAPONS.map((w) => "<div class='manual-object-tile manual-weapon-tile'>" + assetImage(w.id) + "<strong>" + esc(w.name) + "</strong><small>" + w.hands + " hand" + (w.hands === 2 ? "s" : "") + "</small></div>").join("") + "</div>",
      "<h3>Loose props</h3><p>Pick up, carry, place, drop, or throw these objects. Most have no special Use action.</p>",
      "<div class='manual-object-grid'>" + LOOSE_KINDS.map((kind) => "<div class='manual-object-tile'>" + assetImage(kind) + "<strong>" + esc(displayName(kind)) + "</strong></div>").join("") + "</div>",
      "<h3>Furniture and routes</h3><p>Open cupboards, pantry storage, drawers, bookshelves, wardrobes, chests, cellar barrels, and filing furniture to find stashed items. Hold a small item and use a cupboard to hide it; opening the cupboard reveals its contents. Opening large storage or a closed barrel can reveal a body. Check unlit fireplaces too. Search bins or place small items in them. Doors open and close; trapdoors and ladders connect the house to the tunnels. Seats, fireplaces, the stove, and the billiard table have their own actions. Furniture also shapes movement and sightlines.</p>"
    ].join("")
  },
  {
    id: "mansion", label: "The mansion", title: "Rooms & Hidden Routes",
    html: [
      "<p class='manual-lead'>These overhead plans use the current room layout, furniture, doors, and trapdoors. Nine rooms can be murder locations. The cellar holds the accusation table.</p>",
      "<div class='manual-room-grid'>" + ROOM_LIST.map(roomCard).join("") + roomCard(ROOM_BY_ID.cellar) + "</div>",
      "<h3>The hidden routes</h3>",
      "<div class='manual-route-card'><span class='manual-room-image'><img data-manual-visual='room:tunnels' alt='Floor plan of the underground tunnels and ladders' loading='lazy'></span><div><strong>Underground tunnels</strong><p>Four trapdoors, in the kitchen, bathroom, lounge, and office, lead to ladders below. The tunnels are dark. Carry a lit torch to find your way. A killer can hide a body or knock someone unconscious here, but murders happen in rooms above.</p></div></div>",
      "<p>Rooms open onto shared halls. During lights out, doors slam shut and Saviors cannot leave their refuge rooms. Look for the center prompt to use a door, trapdoor, ladder, cupboard, seat, fireplace, stove, bin, or billiard table.</p>"
    ].join("")
  },
  {
    id: "controls", label: "Controls", title: "Controls",
    html: [
      "<p class='manual-lead'>The prompt at the center of the screen names the action available where you are looking. Click the game view during play to capture the mouse.</p>",
      "<table class='manual-table'><thead><tr><th>Action</th><th>Keyboard + mouse</th><th>Second keyboard</th><th>Controller</th></tr></thead><tbody>",
      "<tr><td>Move / look</td><td>WASD / mouse</td><td>Arrow up/down to move; left/right to turn</td><td>Left / right sticks</td></tr>",
      "<tr><td>Use, talk, pick up</td><td>E or left click</td><td>Enter</td><td>A</td></tr>",
      "<tr><td>Act / attack</td><td>F or right click</td><td>Right Shift</td><td>X</td></tr>",
      "<tr><td>Use held tool</td><td>T</td><td>Page Up</td><td>RB</td></tr>",
      "<tr><td>Pocket / take out</td><td>G</td><td>Delete</td><td>R3</td></tr>",
      "<tr><td>Drop / back</td><td>Q</td><td>Backspace</td><td>B</td></tr>",
      "<tr><td>Throw</td><td>R</td><td>Page Down</td><td>LB</td></tr>",
      "<tr><td>Notes</td><td>Tab or N</td><td>Numpad +</td><td>Y</td></tr>",
      "<tr><td>Run</td><td>Left Shift</td><td>Right Ctrl</td><td>RT</td></tr>",
      "<tr><td>Camera</td><td>V</td><td>End</td><td>L3</td></tr>",
      "<tr><td>Check secret role</td><td>Hold C</td><td>Hold Home</td><td>Back replays the role buzz</td></tr>",
      "<tr><td>Pause</td><td>Esc or P</td><td>Numpad *</td><td>Start</td></tr>",
      "</tbody></table>",
      "<h3>Touch and VR</h3>",
      "<p>On touch screens, use the left stick to move, swipe the scene to look, and tap the on-screen actions. If your browser offers VR, use headset direction to look and move, the right trigger to act, and the right grip to grab or release an object. A quick release can throw it.</p>",
      "<p class='manual-note'>In split screen, each player joins with a separate control set: keyboard and mouse, the arrow-key layout, or a controller. The game displays the relevant prompt for each player.</p>"
    ].join("")
  },
  {
    id: "ghosts", label: "After death", title: "After Death",
    html: [
      "<p class='manual-lead'>Death does not remove you from the mansion. You return as a ghost who can still observe and interfere.</p>",
      "<h3>What a ghost can do</h3>",
      "<ul><li>Move through the house and watch the living. A caught killer in a two-killer match also becomes a ghost.</li><li>Once each night, lift a loose object and carry it for up to 15 seconds. Drop or throw it before it slips away. The ordinary item prompts show what you can lift; murder weapons are unavailable.</li><li>Living guests may see an object move by itself. A thrown object can frighten someone and become part of their account.</li></ul>",
      "<div class='manual-after-death'><span class='manual-ghost-image'><img data-manual-visual='ghost:blue' alt='The game's translucent blue ghost avatar' loading='lazy'></span><div><h3>What you look like</h3><p>Ghosts use the same translucent, faintly glowing character model seen in the mansion. Their color still hints at which guest they were.</p></div></div>",
      "<h3>Movement and stamina</h3><p>Living guests can run, but sprinting drains stamina. Slow down to recover before a chase or a long trip through the house. This is the same movement bar shown during play:</p>",
      "<div class='manual-stamina-examples'><div><span>Ready to run</span><div class='stamina'><span class='stamina-fill' style='width:85%'></span><small>STAMINA</small></div></div><div><span>Exhausted</span><div class='stamina exhausted'><span class='stamina-fill' style='width:18%'></span><small>EXHAUSTED</small></div></div></div>",
      "<p class='manual-note'>A ghost cannot make an accusation or perform the living guests' ordinary inventory and conversation actions.</p>"
    ].join("")
  },
  {
    id: "modes", label: "Play modes", title: "Solo, Co-op & Online",
    html: [
      "<h3>Solo</h3><p>Choose a guest under Play Local. You face seven AI guests and can use keyboard, mouse, touch, or a connected controller.</p>",
      "<h3>Local split screen</h3><p>Choose Co-op split screen. Each of two players joins with their own control set and picks a different guest; six AI guests fill the rest. The two local players always share a role. If either would be the killer, both become killers, and the round uses the two-killer rules. Keep your role hidden from anyone else watching.</p>",
      "<h3>Online</h3><ol><li>Choose Play Online, then host a lobby or enter a four-character lobby code.</li><li>Each human player chooses an available guest. The host may select one or two killers.</li><li>When everyone has chosen, the host starts. Empty seats become AI guests. Up to six people can join one online lobby.</li></ol>",
      "<p>The host's game runs the shared match; other players receive its updates. The title screen may also show a live match or an AI demonstration while you decide how to play.</p>"
    ].join("")
  },
  {
    id: "characters", label: "Characters", title: "The Guests",
    html: ""
  }
];

const titleCase = (value) => value.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const byId = Object.fromEntries(SUSPECTS.map((s) => [s.id, s]));
const traitNames = ["observation", "memory", "deception", "boldness", "sociability", "curiosity", "tidiness", "superstition", "restlessness"];

function parseSoul(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { fields: {}, prose: raw };
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pos = line.indexOf(":");
    if (pos > 0) fields[line.slice(0, pos).trim()] = line.slice(pos + 1).trim();
  }
  return { fields, prose: match[2] };
}
function renderProse(raw) {
  return raw.trim().split(/\n\s*\n/).filter(Boolean).map((block) => {
    if (block.startsWith("# ")) return "";
    const safe = esc(block).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
    return "<p>" + safe.replace(/\n/g, "<br>") + "</p>";
  }).join("");
}

export function setupManual() {
  const dialog = document.querySelector("#gameManual");
  const article = document.querySelector("#manualPage");
  const nav = document.querySelector("#manualNav");
  const count = document.querySelector("#manualCount");
  const prevButton = document.querySelector("#manualPrev");
  const nextButton = document.querySelector("#manualNext");
  let current = 0;
  let selectedCharacter = SUSPECTS[0].id;
  let isOpen = false;
  let priorFocus = null;
  let lore = null;
  let lorePromise = null;
  let visualRun = 0;

  async function hydrateVisuals() {
    const run = ++visualRun;
    const images = [...article.querySelectorAll("img[data-manual-visual]")];
    if (!images.length) return;
    let manualImage;
    try { ({ manualImage } = await import("./manual-visuals.js")); }
    catch (error) {
      console.warn("Manual previews unavailable", error);
      if (run === visualRun) images.forEach((img) => { img.parentElement.classList.add("manual-image-unavailable"); });
      return;
    }
    for (const img of images) {
      if (run !== visualRun || !isOpen) return;
      // Give the page a frame between snapshots so navigation remains responsive.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (run !== visualRun || !isOpen) return;
      try {
        const src = await manualImage(img.dataset.manualVisual);
        if (src) img.src = src;
        else throw new Error(`No preview for ${img.dataset.manualVisual}`);
      } catch (error) {
        console.warn("Manual preview unavailable", img.dataset.manualVisual, error);
        img.parentElement.classList.add("manual-image-unavailable");
      }
    }
  }

  async function loadLore() {
    if (lorePromise) return lorePromise;
    lorePromise = Promise.all(SUSPECTS.map(async (suspect) => {
      try {
        const [soulResponse, memoryResponse] = await Promise.all([
          fetch("./npc/" + suspect.id + "/soul.md"),
          fetch("./npc/" + suspect.id + "/Memory.json")
        ]);
        if (!soulResponse.ok || !memoryResponse.ok) throw new Error("Character files unavailable");
        return [suspect.id, { soul: parseSoul(await soulResponse.text()), memory: await memoryResponse.json() }];
      } catch {
        return [suspect.id, { soul: { fields: {}, prose: suspect.soul }, memory: null }];
      }
    })).then((entries) => {
      lore = Object.fromEntries(entries);
      if (isOpen && PAGES[current].id === "characters") render(false);
      return lore;
    });
    return lorePromise;
  }

  function characterHtml() {
    const selector = "<div class='manual-cast' role='group' aria-label='Choose a guest'>" +
      SUSPECTS.map((s) => "<button type='button' data-character='" + s.id + "' style='--c:" + s.color + "' aria-current='" + (s.id === selectedCharacter) + "'>" + esc(s.name) + "</button>").join("") + "</div>";
    const s = byId[selectedCharacter];
    const record = lore?.[s.id];
    if (!record) return "<h2>The Guests</h2><p class='manual-lead'>Choose a color to read the full soul and starting memories for that guest.</p>" + selector + "<p>Opening the character files…</p>";
    const fields = record.soul.fields;
    const memories = record.memory;
    const traits = traitNames.filter((key) => fields[key] !== undefined).map((key) =>
      "<span>" + esc(titleCase(key)) + " " + Math.round(Number(fields[key]) * 100) + "%</span>").join("");
    const voice = ["greeting", "reaction", "farewell", "searchLine"].filter((key) => fields[key]).map((key) =>
      "<div class='manual-quote'><strong>" + esc(titleCase(key)) + ":</strong> " + esc(fields[key].replaceAll("{name}", "a guest")) + "</div>").join("");
    const relationships = Object.entries(memories?.relationships || {}).map(([id, entry]) =>
      "<li><strong>" + esc(byId[id]?.name || id) + ":</strong> " + esc(entry.note || "") + "</li>").join("");
    return "<h2>The Guests</h2><p class='manual-lead'>Each guest's soul shapes what they notice, where they wander, and how they speak. These are character histories, not clues to the randomly assigned killer.</p>" +
      selector +
      "<div class='manual-character-head'><span class='manual-avatar-image'><img data-manual-visual='guest:" + s.id + "' alt='3D game model of " + esc(s.name) + "' loading='lazy'></span><div><span class='manual-subtitle'>" + esc(titleCase(s.id)) + " guest</span><h3>" + esc(s.name) + "</h3><p>Game character model in " + esc(titleCase(s.id)) + (s.id === "violet" ? ": auburn low bun, violet jacket, ivory blouse and archive notebook" : s.id === "blue" ? ": swept chestnut hair, blue jacket, press badge and recorder" : "") + ".</p></div></div>" +
      "<div class='manual-soul'>" + renderProse(record.soul.prose) + "</div>" +
      (traits ? "<h3>Behavior profile</h3><div class='manual-traits'>" + traits + "</div>" : "") +
      (fields.favorites ? "<p><strong>Favorite rooms:</strong> " + esc(fields.favorites) + ".</p>" : "") +
      (voice ? "<h3>How " + esc(s.short) + " speaks</h3>" + voice : "") +
      (memories ? "<h3>Starting memories</h3><p><strong>First impression:</strong> " + esc(memories.impression || "") + "</p><ul>" + memories.memories.map((line) => "<li>" + esc(line) + "</li>").join("") + "</ul>" +
        "<h3>Habits</h3><ul>" + (memories.habits || []).map((line) => "<li>" + esc(line) + "</li>").join("") + "</ul>" +
        "<h3>Starting opinions</h3><ul>" + relationships + "</ul>" : "");
  }

  function render(resetScroll = true) {
    const page = PAGES[current];
    document.querySelector("#manualTitle").textContent = page.title;
    nav.innerHTML = PAGES.map((item, index) => "<button type='button' data-page='" + index + "' aria-current='" + (index === current ? "page" : "false") + "'>" + esc(item.label) + "</button>").join("");
    article.innerHTML = page.id === "characters" ? characterHtml() : "<h2>" + esc(page.title) + "</h2>" + page.html;
    hydrateVisuals();
    count.textContent = "Page " + (current + 1) + " of " + PAGES.length;
    prevButton.disabled = current === 0;
    nextButton.disabled = current === PAGES.length - 1;
    if (resetScroll) article.scrollTop = 0;
    nav.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => setPage(Number(button.dataset.page))));
    article.querySelectorAll("[data-character]").forEach((button) => button.addEventListener("click", () => {
      selectedCharacter = button.dataset.character;
      render();
      article.querySelector("[data-character='" + selectedCharacter + "']")?.focus();
    }));
  }
  function setPage(index) {
    current = Math.max(0, Math.min(PAGES.length - 1, index));
    render();
    article.focus({ preventScroll: true });
    if (PAGES[current].id === "characters") loadLore();
  }
  function open() {
    if (isOpen) return;
    priorFocus = document.activeElement;
    isOpen = true;
    dialog.classList.remove("hidden");
    setPage(0);
    loadLore();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    visualRun++;
    dialog.classList.add("hidden");
    priorFocus?.focus?.();
  }

  document.querySelector("#titleHelpButton").addEventListener("click", open);
  document.querySelector("#manualClose").addEventListener("click", close);
  prevButton.addEventListener("click", () => setPage(current - 1));
  nextButton.addEventListener("click", () => setPage(current + 1));
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  document.addEventListener("keydown", (event) => {
    if (!isOpen) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), article[tabindex='0']")];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  return {
    get isOpen() { return isOpen; },
    close,
    previous: () => setPage(current - 1),
    next: () => setPage(current + 1)
  };
}
