// Character progress can cross realms; locations and changes to a particular
// generated world cannot. Keep inventory, quests, skills, morality and memory.
export function relocateState(source = {}) {
  return {
    ...source,
    respawn: null,
    activeHouse: null,
    activeHouse2: null,
    groundItems: [],
    horses: {},
    pets: {},
    corpses: {},
    cityHouses: {},
    deadNpcs: {},
    hollowLoot: {},
    hollowSpawned: {},
    hollowDungeonChecks: {},
    gathered: [],
    lit: [],
    cleared: {},
    caveSupplies: {},
    worldEpochMs: null,
    day: 0,
  };
}
