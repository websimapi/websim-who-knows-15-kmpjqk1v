// Original setting copy for character creation. These choices use the game's
// own rules; they are not D&D species, classes, or subclasses.
export const ANCESTRY_LORE = {
  valeborn: "Raised among the mile-markers and market towns, Vale-born learn to read people as readily as maps.",
  bronzeborn: "Bronzeborn communities carve their histories into stone. Their long memory makes promises difficult to break.",
  thornkin: "The Thornkin keep old paths alive beneath root and briar, and listen for what the living wood remembers.",
  saltborn: "From reed marshes and storm harbours, Saltborn know that every safe shore has a price.",
  cindrel: "Fire left its mark on the Cindrel. Some guard the embers of a lost home; others mean to build a new one.",
  gloamling: "Gloamlings grew accustomed to the half-light of sealed places and the things hidden there.",
  skyrill: "Skyrill watch the roads from high crags, where distance changes what a border means.",
  drakesworn: "The Drakesworn carry an elemental inheritance that can be a blessing or a burden.",
  hollowed: "The Hollowed returned from an encounter that should have ended them. The road has felt different since.",
  rookfolk: "Rookfolk thrive at crossings, where a quick trade and a quicker word can change a journey.",
};

export const LINEAGE_LORE = {
  hearth: "Hearth Vale families keep inns and waystations open to strangers.", high: "High Vale households measure status in old charters and older obligations.",
  deepdelver: "Deepdelvers know the sealed workings beneath the hills.", redridge: "Redridge clans guard the passes and their stubborn traditions.",
  mossheart: "Mosshearts tend slow-growing groves and patient remedies.", briarheart: "Briarhearts defend wild borders with thorn and cunning.",
  reefkin: "Reefkin read currents and wrecks along the coast.", marshkin: "Marshkin know the soft ground and hidden channels of the fens.",
  coalmarked: "Coalmarked bear the soot-dark trace of an ancestral flame.", glassmarked: "Glassmarked carry pale, bright scars like cooled glass.",
  vaultling: "Vaultlings know the old enclosed places and their quiet rules.", dusklight: "Dusklights learned to travel by the last light of day.",
  ridgewing: "Ridgewings claim the wind-cut escarpments as home.", cloudstep: "Cloudsteps range between peaks, seldom staying long.",
  ashscale: "Ashscales answer the call of heat and cinder.", rimecrest: "Rimecrests endure the cold and keep their counsel.", stormcrest: "Stormcrests follow the charged air before a squall.",
  nearwake: "Nearwakes remember more of the life they left behind.", farwake: "Farwakes returned changed, with gaps no story quite fills.",
  blackwing: "Blackwings favour crowded roads and clever bargains.", palecrest: "Palecrests keep watch where settlements thin out.",
};

export const CLASS_LORE = {
  vanguard: "You hold the line when others need a way through. Close combat, armour, and hard choices are your craft.",
  trailblazer: "You find the route no one else sees, strike from a distance, and turn the terrain to your advantage.",
  arcanist: "You shape Aether into precise force. Power comes quickly; controlling its strain takes discipline.",
  lifekeeper: "You carry healing into dangerous places, but mercy may demand that you fight.",
};

export const BACKGROUND_LORE = {
  road_orphan: "The roadside raised you. You survived by finding shelter, work, and people willing to remember your name.",
  charter_clerk: "You copied contracts and saw how ink could settle disputes—or start them.",
  field_medic: "You learned to work with too few supplies and too many wounded.",
  disgraced_guard: "You once wore a badge. Whatever ended that service still follows you.",
  pilgrim: "You crossed the miles for a belief, a promise, or an answer that still eludes you.",
  tunnel_scout: "You mapped dark passages where one wrong turn could cost a whole crew.",
  tavern_performer: "You learned what a room will reveal when everyone thinks you are only entertaining them.",
  workshop_apprentice: "You spent years learning how things fit together—and how they fail.",
  border_diplomat: "You carried words between people who had good reasons to distrust each other.",
  hedge_naturalist: "You studied wild places directly, far from neat maps and tidy names.",
  debt_runner: "You know the weight of a promise measured in coin.",
  quiet_novice: "You served in a place of study and silence before the road called you out.",
};

export const CLASS_SKILLS = {
  vanguard: ["intimidation", "insight", "persuasion"],
  trailblazer: ["insight", "deception", "intimidation"],
  arcanist: ["insight", "deception", "persuasion"],
  lifekeeper: ["insight", "persuasion", "intimidation"],
};

// The campaign design reserves disciplines for level 3. Show the authored
// paths during creation so a class choice has context, without granting them.
export const DISCIPLINES = {
  vanguard: [
    { name: "Sentinel", description: "Protect nearby allies and turn a block into a counterattack." },
    { name: "Duelist", description: "Use feints and ripostes against isolated targets." },
    { name: "Breaker", description: "Crack Guard and interrupt enemies with heavy weapons." },
  ],
  trailblazer: [
    { name: "Longshot", description: "Exploit distance, height, and exposed weak points." },
    { name: "Beastfriend", description: "Fight alongside a trained creature companion." },
    { name: "Waystalker", description: "Shape a fight with trails, decoys, and snares." },
  ],
  arcanist: [
    { name: "Emberwright", description: "Shape heat into lines, zones, and explosive marks." },
    { name: "Stormwright", description: "Channel storms through surfaces and clustered foes." },
    { name: "Threadseer", description: "Bend timing and space with delayed magic." },
  ],
  lifekeeper: [
    { name: "Hearth", description: "Focus on healing, recovery, and camp support." },
    { name: "Dawn", description: "Bring radiant offence and cleansing fields." },
    { name: "Bonekeeper", description: "Tend wounds, death, and spiritual remains." },
  ],
};

export const PRINCIPLE_LORE = {
  "Protect the defenceless": "Who do you step in front of when it costs you?",
  "Keep your word": "A promise matters most when keeping it hurts.",
  "Freedom above order": "You distrust any law that cages a life.",
  "Knowledge must be shared": "A secret kept too long can become a weapon.",
  "Pay every debt": "You remember every favour and every slight.",
  "Family before strangers": "Your first loyalty has a name and a face.",
  "The road belongs to everyone": "No one should own the only safe way through.",
};

export const PRESSURE_LORE = {
  "A debt you can't repay": "Someone may come asking before you are ready.",
  "Fear of being forgotten": "You need your life to leave a mark.",
  "A sibling lost on the road": "Every rumour of a survivor is hard to ignore.",
  Pride: "Backing down can feel worse than losing.",
  "Hunger for coin": "A full purse can make a bad choice look reasonable.",
  "A temper that runs hot": "You act quickly when the wound is fresh.",
  "Distrust of authority": "Orders sound different when you have seen them abused.",
};
