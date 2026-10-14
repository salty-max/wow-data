// A thing as a page links it: its kind, its id, its name in the reader's
// language (else English, else any), and what tells two of a name apart (an
// item's quality, a creature's or a quest's level).
import type { Database } from "bun:sqlite";
import type { Row } from "./db";

export type Ref = {
  kind: string;
  id: number;
  name: string | null;
  locale?: string; // the name's, when it isn't the reader's
  quality?: number;
  level?: string;
  subname?: string;
  removed?: boolean;
};

// a kind's own table in the client, and its id column
export const CLIENT_TABLE: Record<string, string> = {
  area: "client_AreaTable",
  wmo_area: "client_WMOAreaTable",
  map: "client_Map",
  ui_map: "client_UiMap",
  encounter: "client_DungeonEncounter",
  spell: "client_SpellName",
  skill_line: "client_SkillLine",
  talent_tab: "client_TalentTab",
  specialization: "client_ChrSpecialization",
  taxi_node: "client_TaxiNodes",
  faction: "client_Faction",
  creature_type: "client_CreatureType",
  creature_family: "client_CreatureFamily",
  class: "client_ChrClasses",
  race: "client_ChrRaces",
  quest_sort: "client_QuestSort",
  quest_info: "client_QuestInfo",
  language: "client_Languages",
};

const range = (a: number | null, b: number | null) => (a == null ? undefined : b != null && b !== a ? `${a}–${b}` : `${a}`);

export class Namer {
  constructor(
    readonly db: Database,
    readonly locale: string,
  ) {}

  name(kind: string, id: number): { name: string; locale: string } | null {
    const r = this.db
      .query(
        `SELECT name, locale FROM name WHERE kind = ?1 AND id = ?2
         ORDER BY locale = ?3 DESC, locale = 'enUS' DESC LIMIT 1`,
      )
      .get(kind, id, this.locale) as Row | null;
    return r ? { name: r.name, locale: r.locale } : null;
  }

  ref(kind: string, id: number): Ref {
    const n = this.name(kind, id);
    const ref: Ref = { kind, id, name: n?.name ?? null };
    if (n && n.locale !== this.locale) ref.locale = n.locale;
    const q = (sql: string) => this.db.query(sql).get(id) as Row | null;
    if (kind === "item") {
      const r = q("SELECT quality, item_level, removed FROM item WHERE id = ?");
      if (r) {
        ref.quality = r.quality ?? undefined;
        ref.level = r.item_level ? `${r.item_level}` : undefined;
        if (r.removed) ref.removed = true;
      }
    } else if (kind === "creature") {
      const r = q("SELECT min_level, max_level, removed FROM creature WHERE id = ?");
      if (r) {
        ref.level = range(r.min_level, r.max_level);
        if (r.removed) ref.removed = true;
      }
      const s = this.name("creature_subname", id);
      if (s) ref.subname = s.name;
    } else if (kind === "quest") {
      const r = q("SELECT level, removed FROM quest WHERE id = ?");
      if (r) {
        ref.level = r.level != null && r.level > 0 ? `${r.level}` : undefined;
        if (r.removed) ref.removed = true;
      }
    } else if (kind === "object") {
      const r = q("SELECT removed FROM object WHERE id = ?");
      if (r?.removed) ref.removed = true;
    }
    return ref;
  }

  // every language's name of a thing
  all(kind: string, id: number): Row[] {
    return this.db
      .query(
        `SELECT locale, name, female, source FROM name WHERE kind = ? AND id = ?
         ORDER BY locale = 'enUS' DESC, locale`,
      )
      .all(kind, id) as Row[];
  }
}
