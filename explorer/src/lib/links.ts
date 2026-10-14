// Which column of a row is which thing's id, for the grids' links: by the
// column's name, the table's own id, or the row's kind column.
const BY_COLUMN: Record<string, string> = {
  quest_id: "quest",
  prev_id: "quest",
  next_id: "quest",
  next_in_chain: "quest",
  chain_root: "quest",
  start_quest_id: "quest",
  StartQuestID: "quest",
  npc_id: "creature",
  creature_id: "creature",
  item_id: "item",
  spell_id: "spell",
  area_id: "area",
  zone_id: "area",
  AreaID: "area",
  ParentAreaID: "area",
  AreaTableID: "area",
  map_id: "map",
  MapID: "map",
  ContinentID: "map",
  ui_map_id: "ui_map",
  UiMapID: "ui_map",
  ParentUiMapID: "ui_map",
  type_id: "creature_type",
  family_id: "creature_family",
  skill_line_id: "skill_line",
  ParentFactionID: "faction",
};
const BY_TABLE: Record<string, string> = {
  quest: "quest",
  quest_en: "quest",
  creature: "creature",
  creature_en: "creature",
  item: "item",
  item_en: "item",
  object: "object",
  client_AreaTable: "area",
  client_WMOAreaTable: "wmo_area",
  client_Map: "map",
  client_UiMap: "ui_map",
  client_SpellName: "spell",
  client_Faction: "faction",
  client_ChrClasses: "class",
  client_ChrRaces: "race",
  client_SkillLine: "skill_line",
  client_TaxiNodes: "taxi_node",
  client_DungeonEncounter: "encounter",
  client_CreatureType: "creature_type",
  client_CreatureFamily: "creature_family",
  client_QuestSort: "quest_sort",
  client_QuestInfo: "quest_info",
  client_Languages: "language",
  client_TalentTab: "talent_tab",
  client_ChrSpecialization: "specialization",
  client_QuestV2: "quest",
  client_Item: "item",
  client_ItemSparse: "item",
};
// a row's kind column, as a page's kind (an objective's 'source' is an item...)
const KIND_VALUE: Record<string, string> = {
  source: "item",
  reputation: "faction",
  cast: "spell",
  choice: "item",
  npc: "creature",
  creature_subname: "creature",
};
const KIND_ID_COLUMNS = new Set(["id", "entity_id", "target_id", "ref_id"]);

export function linkKind(column: string, value: unknown, row: Record<string, unknown>, table: string | undefined, kinds: Record<string, string>): string | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return undefined;
  const bare = column.replace(/:\d+$/, "");
  if ((bare === "id" || bare === "ID") && table && BY_TABLE[table]) return BY_TABLE[table];
  if (table === "client_FactionTemplate" && bare === "Faction") return "faction";
  if (BY_COLUMN[bare]) return BY_COLUMN[bare];
  // (a loot row's ref_id is another template, not its kind's)
  if (KIND_ID_COLUMNS.has(bare) && typeof row.kind === "string" && table !== "loot") {
    const k = KIND_VALUE[row.kind] ?? row.kind;
    if (kinds[k]) return k;
  }
  return undefined;
}
