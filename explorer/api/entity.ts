// A thing's page, as data: its facts, its names in every language, and its
// sections (who gives a quest, what a creature drops, where it stands...),
// every other thing in them a link by its id. The page draws whatever comes:
// a kind is added here alone.
import type { Database } from "bun:sqlite";
import type { Row } from "./db";
import {
  bits,
  flagWords,
  ITEM_CLASSES,
  LOCK_TYPES,
  NPC_FLAGS,
  OBJECT_TYPES,
  QUALITIES,
  RANKS,
  SLOTS,
  UNIT_CLASSES,
} from "../../src/game";
import { type MapGroup, mapsOf } from "./maps";
import { CLIENT_TABLE, Namer, type Ref } from "./names";

export type Cell = string | number | null | Ref | { text: string; tone?: Tone; mono?: boolean };
export type Tone = "dim" | "gold" | "ok" | "blood";
export type Column = { label: string; align?: "right"; mono?: boolean };
export type Section = { title: string; count?: number } & (
  | { type: "table"; columns: Column[]; rows: { cells: Cell[]; group?: string }[]; more?: number }
  | { type: "refs"; refs: (Ref & { note?: string })[]; more?: number }
  | { type: "map"; maps: MapGroup[]; unplaced: number }
  | { type: "texts"; fields: { label: string; texts: Record<string, string> }[] }
  | { type: "pages"; pages: Record<string, string[]> }
  | { type: "chain"; steps: Ref[]; current: number }
);
export type Fact = { label: string; value: string | number | Ref | Ref[]; mono?: boolean };
export type Entity = {
  ref: Ref;
  kindLabel: string;
  badges: { text: string; tone?: Tone }[];
  facts: Fact[];
  names: Row[];
  sections: Section[];
  raw: { table: string; key: string; rows: Row[] }[];
  sql: string;
};

const LIMIT = 300;

// the loot templates' owners, by template id (the tables have no index on them)
const owners = new WeakMap<Database, Record<string, Map<number, number[]>>>();
function ownersOf(d: Database) {
  let o = owners.get(d);
  if (!o) {
    o = {};
    for (const [key, sql] of [
      ["creature", "SELECT loot_id AS t, id FROM creature WHERE loot_id IS NOT NULL"],
      ["skinning", "SELECT skin_loot_id AS t, id FROM creature WHERE skin_loot_id IS NOT NULL"],
      ["pickpocket", "SELECT pick_loot_id AS t, id FROM creature WHERE pick_loot_id IS NOT NULL"],
      ["object", "SELECT loot_id AS t, id FROM object WHERE loot_id IS NOT NULL"],
    ]) {
      const m = new Map<number, number[]>();
      for (const r of d.query(sql).all() as Row[]) {
        const list = m.get(r.t);
        if (list) list.push(r.id);
        else m.set(r.t, [r.id]);
      }
      o[key] = m;
    }
    owners.set(d, o);
  }
  return o;
}

class Ctx {
  readonly names: Namer;
  constructor(
    readonly d: Database,
    locale: string,
  ) {
    this.names = new Namer(d, locale);
  }
  get = (sql: string, ...p: any[]) => this.d.query(sql).get(...p) as Row | null;
  all = (sql: string, ...p: any[]) => this.d.query(sql).all(...p) as Row[];
  ref = (kind: string, id: number) => this.names.ref(kind, id);
  has = (table: string) => !!this.get("SELECT 1 FROM sqlite_master WHERE name = ?", table);
}

const text = (t: string, tone?: Tone, mono?: boolean) => ({ text: t, ...(tone ? { tone } : {}), ...(mono ? { mono } : {}) });
const pct = (n: number | null) =>
  n == null ? null : n < 0 ? text(`${round(-n)}% · quest`, "gold") : n === 0 ? text("grouped", "dim") : text(`${round(n)}%`);
const round = (n: number) => (n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100);
const count = (a: number | null, b: number | null) => (a == null && b == null ? null : a != null && b != null && a !== b ? `${a}–${b}` : `${b ?? a}`);
const cap = <T>(rows: T[]) => ({ rows: rows.slice(0, LIMIT), more: rows.length > LIMIT ? rows.length - LIMIT : undefined });

// the questie/classicdb split of a loot template: the Classic database's by
// its template id, Questie's drops by the creature's or object's own id
function lootRows(c: Ctx, kind: string, templateId: number | null, ownId: number): Row[] {
  return c.all(
    `SELECT * FROM loot WHERE kind = ?1 AND ((source = 'classicdb' AND source_id = ?2) OR (source != 'classicdb' AND source_id = ?3))
     ORDER BY chance < 0 DESC, abs(chance) DESC`,
    kind,
    templateId ?? -1,
    ownId,
  );
}
function lootSection(c: Ctx, title: string, kind: string, templateId: number | null, ownId: number): Section | null {
  const rows: { cells: Cell[]; group?: string }[] = [];
  for (const r of lootRows(c, kind, templateId, ownId)) {
    if (r.item_id != null) rows.push({ cells: [c.ref("item", r.item_id), pct(r.chance), count(r.min_count, r.max_count), r.source] });
    else if (r.ref_id != null) {
      const group = `Reference ${r.ref_id} · ${round(Math.abs(r.chance ?? 0))}% · rolled ${r.max_count ?? 1}×`;
      for (const i of c.all("SELECT * FROM loot WHERE kind = 'reference' AND source_id = ? ORDER BY abs(chance) DESC", r.ref_id))
        if (i.item_id != null) rows.push({ group, cells: [c.ref("item", i.item_id), pct(i.chance), count(i.min_count, i.max_count), i.source] });
    }
  }
  if (!rows.length) return null;
  const columns: Column[] = [{ label: "Item" }, { label: "Chance", align: "right" }, { label: "Count", align: "right" }, { label: "Source" }];
  return { type: "table", title, count: rows.length, columns, ...cap(rows) };
}

function questLinks(c: Ctx, kind: "creature" | "object" | "item", id: number): Section | null {
  const rows: { cells: Cell[] }[] = [];
  for (const r of c.all("SELECT quest_id, role, source FROM quest_relation WHERE kind = ? AND entity_id = ? ORDER BY role DESC, quest_id", kind, id))
    rows.push({ cells: [c.ref("quest", r.quest_id), text(r.role === "start" ? "Starts" : "Ends", r.role === "start" ? "gold" : undefined), r.source] });
  const objKinds = kind === "item" ? ["item", "source"] : [kind];
  for (const r of c.all(
    `SELECT quest_id, kind, count, source FROM quest_objective WHERE kind IN (${objKinds.map(() => "?").join(",")}) AND target_id = ? ORDER BY quest_id`,
    ...objKinds,
    id,
  ))
    rows.push({ cells: [c.ref("quest", r.quest_id), text(r.kind === "source" ? "Given for it" : r.count ? `Objective ×${r.count}` : "Objective", "dim"), r.source] });
  if (!rows.length) return null;
  return { type: "table", title: "Quests", count: rows.length, columns: [{ label: "Quest" }, { label: "Role" }, { label: "Source" }], ...cap(rows) };
}

function where(c: Ctx, kind: "creature" | "object", id: number): Section | null {
  const { maps, unplaced } = mapsOf(c.d, c.names, kind, id);
  if (!maps.length && !unplaced) return null;
  const total = maps.reduce((n, m) => n + m.points.length, 0);
  return { type: "map", title: "Where", count: total + unplaced, maps, unplaced };
}

function pages(c: Ctx, kind: "object" | "item", id: number): Section | null {
  const rows = c.all("SELECT locale, idx, text FROM readable_page WHERE kind = ? AND id = ? ORDER BY locale = 'enUS' DESC, locale, idx", kind, id);
  if (!rows.length) return null;
  const byLocale: Record<string, string[]> = {};
  for (const r of rows) (byLocale[r.locale] ??= []).push(r.text);
  return { type: "pages", title: "Pages", count: byLocale.enUS?.length ?? rows.length, pages: byLocale };
}

function clientRow(c: Ctx, kind: string, id: number): { table: string; row: Row | null } {
  const table = CLIENT_TABLE[kind];
  if (!table || !c.has(table)) return { table: table ?? "", row: null };
  return { table, row: c.get(`SELECT * FROM "${table}" WHERE ID = ?`, id) };
}

// ── the kinds ────────────────────────────────────────────────────────────────
function quest(c: Ctx, id: number): Partial<Entity> | null {
  const q = c.get("SELECT * FROM quest WHERE id = ?", id);
  if (!q) return null;
  const facts: Fact[] = [];
  const badges: Entity["badges"] = [];
  if (q.level != null) facts.push({ label: "Level", value: q.level > 0 ? q.level : q.level === -1 ? "Scales" : q.level });
  if (q.min_level) facts.push({ label: "Requires level", value: q.min_level });
  if (q.zone_id > 0) facts.push({ label: "Zone", value: c.ref("area", q.zone_id) });
  if (q.zone_id < 0) facts.push({ label: "Category", value: c.ref("quest_sort", -q.zone_id) });
  if (q.sort_id) facts.push({ label: "Category", value: c.ref("quest_sort", q.sort_id) });
  if (q.type) {
    const t = c.ref("quest_info", q.type);
    facts.push({ label: "Type", value: t });
    if (t.name) badges.push({ text: t.name, tone: "gold" });
  }
  if (q.races) {
    const races = c.all("SELECT ID, PlayableRaceBit FROM client_ChrRaces WHERE PlayableRaceBit >= 0");
    const byBit = new Map(races.map((r) => [r.PlayableRaceBit, r.ID]));
    const refs = bits(q.races).flatMap((b) => (byBit.has(b) ? [c.ref("race", byBit.get(b))] : []));
    if (refs.length) facts.push({ label: "Races", value: refs });
  }
  if (q.classes) facts.push({ label: "Classes", value: bits(q.classes).map((b) => c.ref("class", b + 1)) });
  if (q.skill_line_id) facts.push({ label: "Profession", value: c.ref("skill_line", q.skill_line_id) });
  if (q.prev_id) facts.push({ label: "Requires", value: c.ref("quest", q.prev_id) });
  if (q.next_id) facts.push({ label: "Next", value: c.ref("quest", q.next_id) });
  if (q.flags) facts.push({ label: "Flags", value: q.flags, mono: true });

  const sections: Section[] = [];
  const rel = c.all("SELECT * FROM quest_relation WHERE quest_id = ? ORDER BY role DESC, kind", id);
  const relRefs = (role: string) => rel.filter((r) => r.role === role).map((r) => ({ ...c.ref(r.kind, r.entity_id), note: r.source }));
  const starts = relRefs("start"),
    ends = relRefs("end");
  if (starts.length) sections.push({ type: "refs", title: "Given by", refs: starts });
  if (ends.length) sections.push({ type: "refs", title: "Turned in to", refs: ends });

  const objKind: Record<string, string> = { creature: "creature", object: "object", item: "item", source: "item", spell: "spell", reputation: "faction" };
  const objectives = c.all(
    `SELECT * FROM quest_objective WHERE quest_id = ?
     ORDER BY CASE kind WHEN 'creature' THEN 0 WHEN 'object' THEN 1 WHEN 'item' THEN 2 WHEN 'reputation' THEN 3 WHEN 'spell' THEN 4 WHEN 'event' THEN 5 ELSE 6 END, idx`,
    id,
  );
  if (objectives.length)
    sections.push({
      type: "table",
      title: "Objectives",
      columns: [{ label: "Target" }, { label: "Kind" }, { label: "Count", align: "right" }, { label: "Text" }, { label: "Source" }],
      rows: objectives.map((o) => ({
        cells: [
          o.target_id && objKind[o.kind] ? c.ref(objKind[o.kind], o.target_id) : text(o.text ?? "Event", "dim"),
          text(o.kind === "source" ? "given item" : o.kind, "dim"),
          o.count,
          o.text,
          o.source,
        ],
      })),
    });

  const rewards = c.all("SELECT * FROM quest_reward WHERE quest_id = ? ORDER BY CASE kind WHEN 'item' THEN 0 WHEN 'choice' THEN 1 ELSE 2 END", id);
  if (rewards.length) {
    const kindOf: Record<string, string> = { item: "item", choice: "item", spell: "spell", cast: "spell", reputation: "faction" };
    const word: Record<string, string> = { item: "Item", choice: "Choice of", spell: "Spell", cast: "Cast on you", reputation: "Reputation" };
    sections.push({
      type: "table",
      title: "Rewards",
      columns: [{ label: "Reward" }, { label: "Kind" }, { label: "Count", align: "right" }, { label: "Source" }],
      rows: rewards.map((r) => ({
        cells: [c.ref(kindOf[r.kind] ?? r.kind, r.ref_id), text(word[r.kind] ?? r.kind, "dim"), r.kind === "reputation" && r.count > 0 ? `+${r.count}` : r.count, r.source],
      })),
    });
  }

  // the chain: back along next_in_chain to its first, then forward
  const prev = (x: number) => c.get("SELECT id FROM quest WHERE next_in_chain = ? ORDER BY id LIMIT 1", x)?.id as number | undefined;
  const next = (x: number) => c.get("SELECT next_in_chain AS n FROM quest WHERE id = ?", x)?.n as number | undefined;
  let first = id;
  const back = new Set([id]);
  for (let p = prev(first); p && !back.has(p) && back.size < 80; p = prev(first)) back.add((first = p));
  const steps: number[] = [];
  for (let x: number | undefined = first; x && !steps.includes(x) && steps.length < 80; x = next(x)) steps.push(x);
  if (steps.length > 1) sections.push({ type: "chain", title: "Chain", count: steps.length, steps: steps.map((s) => c.ref("quest", s)), current: id });

  const unlocks = c.all("SELECT id FROM quest WHERE prev_id = ? AND id != ? ORDER BY id", id, id);
  if (unlocks.length) sections.push({ type: "refs", title: "Opens", refs: unlocks.map((r) => c.ref("quest", r.id)) });

  const texts = c.all("SELECT field, locale, text FROM quest_text WHERE quest_id = ?", id);
  if (texts.length) {
    const order = ["objectives", "details", "request", "reward", "end", "objective1", "objective2", "objective3", "objective4"];
    const label: Record<string, string> = { objectives: "Objectives", details: "Description", request: "Progress", reward: "Completion", end: "Ending" };
    const fields = new Map<string, Record<string, string>>();
    for (const t of texts) {
      if (!fields.has(t.field)) fields.set(t.field, {});
      fields.get(t.field)![t.locale] = t.text;
    }
    sections.push({
      type: "texts",
      title: "Texts",
      fields: [...fields.entries()]
        .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
        .map(([f, t]) => ({ label: label[f] ?? `Objective ${f.slice(-1)} text`, texts: t })),
    });
  }
  const raw = [{ table: "quest", key: "id", rows: [q] }];
  const v2 = c.has("client_QuestV2") ? c.get("SELECT * FROM client_QuestV2 WHERE ID = ?", id) : null;
  if (v2) raw.push({ table: "client_QuestV2", key: "ID", rows: [v2] });
  return { facts, badges, sections, raw, sql: `SELECT * FROM quest WHERE id = ${id}` };
}

function creature(c: Ctx, id: number): Partial<Entity> | null {
  const r = c.get("SELECT * FROM creature WHERE id = ?", id);
  if (!r) return null;
  const facts: Fact[] = [];
  const badges: Entity["badges"] = [];
  const lvl = count(r.min_level, r.max_level);
  if (lvl) facts.push({ label: "Level", value: lvl });
  if (r.rank) badges.push({ text: RANKS[r.rank] ?? `rank ${r.rank}`, tone: r.rank === 3 ? "blood" : "gold" });
  if (r.type_id) facts.push({ label: "Type", value: c.ref("creature_type", r.type_id) });
  if (r.family_id) facts.push({ label: "Family", value: c.ref("creature_family", r.family_id) });
  if (r.faction_id != null) {
    const ft = c.has("client_FactionTemplate") ? c.get("SELECT Faction FROM client_FactionTemplate WHERE ID = ?", r.faction_id) : null;
    facts.push({ label: "Faction", value: ft?.Faction ? c.ref("faction", ft.Faction) : `template ${r.faction_id}` });
  }
  const services = flagWords(r.npc_flags, NPC_FLAGS).filter((w) => w !== "Gossip");
  for (const s of services) badges.push({ text: s });
  if (r.unit_class) facts.push({ label: "Class", value: UNIT_CLASSES[r.unit_class] ?? r.unit_class });
  if (r.display_ids) facts.push({ label: "Models", value: r.display_ids, mono: true });
  if (r.kill_credit)
    facts.push({ label: "Counts as", value: String(r.kill_credit).split(",").filter(Boolean).map((k) => c.ref("creature", Number(k))) });

  const sections: Section[] = [];
  const w = where(c, "creature", id);
  if (w) sections.push(w);
  const q = questLinks(c, "creature", id);
  if (q) sections.push(q);
  const credited = c.all("SELECT id FROM creature WHERE ',' || kill_credit || ',' LIKE '%,' || ? || ',%' ORDER BY id", id);
  if (credited.length) sections.push({ type: "refs", title: "Kills that count as it", refs: credited.map((x) => c.ref("creature", x.id)) });
  for (const [title, kind, template] of [
    ["Drops", "creature", r.loot_id],
    ["Skinning", "skinning", r.skin_loot_id],
    ["Pickpocketing", "pickpocket", r.pick_loot_id],
  ] as const) {
    const s = lootSection(c, title, kind, template, id);
    if (s) sections.push(s);
  }
  const sells = c.all("SELECT item_id, source FROM vendor WHERE npc_id = ? ORDER BY item_id", id);
  if (sells.length) sections.push({ type: "refs", title: "Sells", count: sells.length, refs: sells.map((s) => ({ ...c.ref("item", s.item_id), note: s.source })) });
  const teaches = c.all("SELECT * FROM trainer_spell WHERE npc_id = ? ORDER BY level, spell_id", id);
  if (teaches.length)
    sections.push({
      type: "table",
      title: "Teaches",
      count: teaches.length,
      columns: [{ label: "Spell" }, { label: "Level", align: "right" }, { label: "Skill", align: "right" }, { label: "Cost", align: "right" }],
      ...cap(teaches.map((t) => ({ cells: [c.ref("spell", t.spell_id), t.level, t.skill_value, t.cost != null ? money(t.cost) : null] }))),
    });
  return { facts, badges, sections, raw: [{ table: "creature", key: "id", rows: [r] }], sql: `SELECT * FROM creature_en WHERE id = ${id}` };
}

const money = (copper: number) => {
  const g = Math.floor(copper / 10000),
    s = Math.floor((copper % 10000) / 100),
    k = copper % 100;
  return [g && `${g}g`, s && `${s}s`, k && `${k}c`].filter(Boolean).join(" ") || "0c";
};

function object(c: Ctx, id: number): Partial<Entity> | null {
  const r = c.get("SELECT * FROM object WHERE id = ?", id);
  if (!r) return null;
  const facts: Fact[] = [];
  const badges: Entity["badges"] = [];
  if (r.type != null) badges.push({ text: OBJECT_TYPES[r.type] ?? `type ${r.type}` });
  if (r.lock_id && c.has("client_Lock")) {
    const l = c.get("SELECT * FROM client_Lock WHERE ID = ?", r.lock_id);
    const needs: string[] = [];
    for (let i = 0; l && i < 8; i++) if (l[`Type_${i}`] === 2 && LOCK_TYPES[l[`_Index_${i}`]]) needs.push(`${LOCK_TYPES[l[`_Index_${i}`]]}${l[`Skill_${i}`] ? ` ${l[`Skill_${i}`]}` : ""}`);
    facts.push({ label: "Lock", value: needs.join(", ") || `lock ${r.lock_id}` });
  }
  if (r.faction_id) facts.push({ label: "Faction template", value: r.faction_id, mono: true });
  if (r.display_id) facts.push({ label: "Model", value: r.display_id, mono: true });
  const sections: Section[] = [];
  for (const s of [where(c, "object", id), questLinks(c, "object", id), lootSection(c, "Contains", "object", r.loot_id, id), pages(c, "object", id)]) if (s) sections.push(s);
  return { facts, badges, sections, raw: [{ table: "object", key: "id", rows: [r] }], sql: `SELECT * FROM object WHERE id = ${id}` };
}

function item(c: Ctx, id: number): Partial<Entity> | null {
  const r = c.get("SELECT * FROM item WHERE id = ?", id);
  if (!r) return null;
  const facts: Fact[] = [];
  const badges: Entity["badges"] = [];
  if (r.quality != null) badges.push({ text: QUALITIES[r.quality] ?? `quality ${r.quality}` });
  if (r.item_level) facts.push({ label: "Item level", value: r.item_level });
  if (r.required_level) facts.push({ label: "Requires level", value: r.required_level });
  const cls = ITEM_CLASSES[r.class_id];
  if (cls) facts.push({ label: "Kind", value: [...new Set([cls[0], cls[1]?.[r.subclass_id]].filter(Boolean))].join(" · ") });
  if (r.inventory_type) facts.push({ label: "Slot", value: SLOTS[r.inventory_type] ?? r.inventory_type });
  if (r.container_slots) facts.push({ label: "Bag slots", value: r.container_slots });
  if (r.start_quest_id) facts.push({ label: "Starts", value: c.ref("quest", r.start_quest_id) });
  if (r.display_id) facts.push({ label: "Model", value: r.display_id, mono: true });

  const sections: Section[] = [];
  // who drops it: a loot template's owners (one reference deep)
  // who drops it: a loot template's owners, one reference deep (ids first,
  // named only for the rows shown: Linen Cloth has thousands)
  const byTemplate = ownersOf(c.d);
  const owners = (kind: string, sourceId: number, source: string): [string, number][] => {
    const own = (key: string, k: string) => (byTemplate[key].get(sourceId) ?? []).map((x): [string, number] => [k, x]);
    switch (kind) {
      case "creature":
        return source === "classicdb" ? own("creature", "creature") : [["creature", sourceId]];
      case "skinning":
        return own("skinning", "creature");
      case "pickpocket":
        return own("pickpocket", "creature");
      case "object":
        return source === "classicdb" ? own("object", "object") : [["object", sourceId]];
      case "item":
        return [["item", sourceId]];
      case "fishing":
        return [["area", sourceId]];
      default:
        return [];
    }
  };
  const how: Record<string, string> = { creature: "Drop", skinning: "Skinning", pickpocket: "Pickpocket", object: "Contained", item: "Opened", fishing: "Fishing" };
  const found: { owner: [string, number]; how: string; chance: number | null; source: string; group?: string }[] = [];
  for (const l of c.all("SELECT * FROM loot WHERE item_id = ? ORDER BY chance < 0 DESC, abs(chance) DESC", id)) {
    if (l.kind === "reference") {
      const group = `Through reference ${l.source_id} · ${round(Math.abs(l.chance ?? 0))}% within it`;
      for (const p of c.all("SELECT * FROM loot WHERE ref_id = ? ORDER BY abs(chance) DESC", l.source_id))
        for (const owner of owners(p.kind, p.source_id, p.source)) found.push({ owner, how: how[p.kind] ?? p.kind, chance: p.chance, source: p.source, group });
    } else for (const owner of owners(l.kind, l.source_id, l.source)) found.push({ owner, how: how[l.kind] ?? l.kind, chance: l.chance, source: l.source });
  }
  if (found.length)
    sections.push({
      type: "table",
      title: "Comes from",
      count: found.length,
      columns: [{ label: "From" }, { label: "How" }, { label: "Chance", align: "right" }, { label: "Source" }],
      rows: found.slice(0, LIMIT).map((f) => ({ group: f.group, cells: [c.ref(...f.owner), text(f.how, "dim"), pct(f.chance), f.source] })),
      more: found.length > LIMIT ? found.length - LIMIT : undefined,
    });
  const vendors = c.all("SELECT npc_id, source FROM vendor WHERE item_id = ? ORDER BY npc_id", id);
  if (vendors.length) sections.push({ type: "refs", title: "Sold by", count: vendors.length, refs: vendors.map((v) => ({ ...c.ref("creature", v.npc_id), note: v.source })) });
  const rewards = c.all("SELECT quest_id, kind, count, source FROM quest_reward WHERE kind IN ('item', 'choice') AND ref_id = ? ORDER BY quest_id", id);
  if (rewards.length)
    sections.push({
      type: "table",
      title: "Quest reward",
      count: rewards.length,
      columns: [{ label: "Quest" }, { label: "Kind" }, { label: "Count", align: "right" }, { label: "Source" }],
      ...cap(rewards.map((x) => ({ cells: [c.ref("quest", x.quest_id), text(x.kind === "choice" ? "Choice" : "Given", "dim"), x.count, x.source] }))),
    });
  for (const s of [questLinks(c, "item", id), lootSection(c, "Contains", "item", id, id), pages(c, "item", id)]) if (s) sections.push(s);
  const raw = [{ table: "item", key: "id", rows: [r] }];
  for (const t of ["client_Item", "client_ItemSparse"]) {
    const row = c.has(t) ? c.get(`SELECT * FROM "${t}" WHERE ID = ?`, id) : null;
    if (row) raw.push({ table: t, key: "ID", rows: [row] });
  }
  return { facts, badges, sections, raw, sql: `SELECT * FROM item_en WHERE id = ${id}` };
}

function area(c: Ctx, id: number): Partial<Entity> | null {
  const { row } = clientRow(c, "area", id);
  if (!row) return null;
  const facts: Fact[] = [];
  if (row.ZoneName) facts.push({ label: "Internal name", value: row.ZoneName, mono: true });
  if (row.ParentAreaID) facts.push({ label: "In", value: c.ref("area", row.ParentAreaID) });
  if (row.ContinentID != null) facts.push({ label: "Map", value: c.ref("map", row.ContinentID) });
  if (row.ExplorationLevel) facts.push({ label: "Exploration level", value: row.ExplorationLevel });
  const sections: Section[] = [];
  const subs = c.all("SELECT ID FROM client_AreaTable WHERE ParentAreaID = ? ORDER BY ID", id);
  if (subs.length) sections.push({ type: "refs", title: "Areas within", count: subs.length, refs: subs.slice(0, LIMIT).map((s) => c.ref("area", s.ID)) });
  const quests = c.all("SELECT id FROM quest WHERE zone_id = ? ORDER BY level, id", id);
  if (quests.length) sections.push({ type: "refs", title: "Quests", count: quests.length, refs: quests.slice(0, LIMIT).map((q) => c.ref("quest", q.id)), more: quests.length > LIMIT ? quests.length - LIMIT : undefined });
  for (const [kind, title] of [
    ["creature", "Creatures"],
    ["object", "Objects"],
  ] as const) {
    const rows = c.all(`SELECT entity_id, count(*) n FROM spawn WHERE kind = ? AND area_id = ? GROUP BY entity_id ORDER BY n DESC, entity_id`, kind, id);
    if (rows.length)
      sections.push({
        type: "table",
        title,
        count: rows.length,
        columns: [{ label: kind === "creature" ? "Creature" : "Object" }, { label: "Spawns", align: "right" }],
        ...cap(rows.map((x) => ({ cells: [c.ref(kind, x.entity_id), x.n] }))),
      });
  }
  const maps = c.all("SELECT DISTINCT UiMapID FROM client_UiMapAssignment WHERE AreaID = ?", id);
  if (maps.length) sections.push({ type: "refs", title: "On the maps", refs: maps.map((m) => c.ref("ui_map", m.UiMapID)) });
  const fish = lootSection(c, "Fishing", "fishing", id, id);
  if (fish) sections.push(fish);
  return { facts, sections, raw: [{ table: "client_AreaTable", key: "ID", rows: [row] }], sql: `SELECT * FROM client_AreaTable WHERE ID = ${id}` };
}

function faction(c: Ctx, id: number): Partial<Entity> | null {
  const { row } = clientRow(c, "faction", id);
  const facts: Fact[] = [];
  if (row?.ParentFactionID) facts.push({ label: "Part of", value: c.ref("faction", row.ParentFactionID) });
  if (row?.Description_lang) facts.push({ label: "About", value: row.Description_lang });
  const sections: Section[] = [];
  const children = c.has("client_Faction") ? c.all("SELECT ID FROM client_Faction WHERE ParentFactionID = ? ORDER BY ID", id) : [];
  if (children.length) sections.push({ type: "refs", title: "Factions within", refs: children.map((x) => c.ref("faction", x.ID)) });
  const quests = c.all("SELECT quest_id, count, source FROM quest_reward WHERE kind = 'reputation' AND ref_id = ? ORDER BY quest_id", id);
  if (quests.length)
    sections.push({
      type: "table",
      title: "Quests",
      count: quests.length,
      columns: [{ label: "Quest" }, { label: "Reputation", align: "right" }, { label: "Source" }],
      ...cap(quests.map((q) => ({ cells: [c.ref("quest", q.quest_id), q.count > 0 ? `+${q.count}` : q.count, q.source] }))),
    });
  if (c.has("client_FactionTemplate")) {
    const members = c.all("SELECT c.id FROM creature c JOIN client_FactionTemplate t ON t.ID = c.faction_id WHERE t.Faction = ? ORDER BY c.id", id);
    if (members.length) sections.push({ type: "refs", title: "Creatures", count: members.length, refs: members.slice(0, LIMIT).map((m) => c.ref("creature", m.id)), more: members.length > LIMIT ? members.length - LIMIT : undefined });
  }
  if (!row && !sections.length) return null;
  return { facts, sections, raw: row ? [{ table: "client_Faction", key: "ID", rows: [row] }] : [], sql: `SELECT * FROM client_Faction WHERE ID = ${id}` };
}

function spell(c: Ctx, id: number): Partial<Entity> | null {
  const sections: Section[] = [];
  const trainers = c.all("SELECT * FROM trainer_spell WHERE spell_id = ? ORDER BY npc_id", id);
  if (trainers.length)
    sections.push({
      type: "table",
      title: "Taught by",
      count: trainers.length,
      columns: [{ label: "Trainer" }, { label: "Level", align: "right" }, { label: "Cost", align: "right" }],
      ...cap(trainers.map((t) => ({ cells: [c.ref("creature", t.npc_id), t.level, t.cost != null ? money(t.cost) : null] }))),
    });
  const quests = c.all("SELECT quest_id, kind FROM quest_reward WHERE kind IN ('spell', 'cast') AND ref_id = ? ORDER BY quest_id", id);
  if (quests.length) sections.push({ type: "refs", title: "Quest reward", refs: quests.map((q) => ({ ...c.ref("quest", q.quest_id), note: q.kind })) });
  const objectives = c.all("SELECT quest_id FROM quest_objective WHERE kind = 'spell' AND target_id = ?", id);
  if (objectives.length) sections.push({ type: "refs", title: "Cast for", refs: objectives.map((q) => c.ref("quest", q.quest_id)) });
  const { row } = clientRow(c, "spell", id);
  if (!row && !sections.length) return null;
  return { facts: [], sections, raw: row ? [{ table: "client_SpellName", key: "ID", rows: [row] }] : [], sql: `SELECT * FROM client_SpellName WHERE ID = ${id}` };
}

function map(c: Ctx, id: number): Partial<Entity> | null {
  const { row } = clientRow(c, "map", id);
  if (!row) return null;
  const types = ["World", "Dungeon", "Raid", "Battleground", "Arena", "Scenario"];
  const facts: Fact[] = [{ label: "Directory", value: row.Directory, mono: true }, { label: "Instance", value: types[row.InstanceType] ?? row.InstanceType }];
  if (row.MaxPlayers) facts.push({ label: "Players", value: row.MaxPlayers });
  if (row.AreaTableID) facts.push({ label: "Area", value: c.ref("area", row.AreaTableID) });
  const sections: Section[] = [];
  const zones = c.all("SELECT ID FROM client_AreaTable WHERE ContinentID = ? AND ParentAreaID = 0 ORDER BY ID", id);
  if (zones.length) sections.push({ type: "refs", title: "Zones", count: zones.length, refs: zones.slice(0, LIMIT).map((z) => c.ref("area", z.ID)) });
  const bosses = c.has("client_DungeonEncounter") ? c.all("SELECT ID FROM client_DungeonEncounter WHERE MapID = ? ORDER BY OrderIndex", id) : [];
  if (bosses.length) sections.push({ type: "refs", title: "Encounters", refs: bosses.map((b) => c.ref("encounter", b.ID)) });
  return { facts, sections, raw: [{ table: "client_Map", key: "ID", rows: [row] }], sql: `SELECT * FROM client_Map WHERE ID = ${id}` };
}

function uiMap(c: Ctx, id: number): Partial<Entity> | null {
  const { row } = clientRow(c, "ui_map", id);
  if (!row) return null;
  const types = ["Cosmic", "World", "Continent", "Zone", "Dungeon", "Micro", "Orphan"];
  const facts: Fact[] = [{ label: "Type", value: types[row.Type] ?? row.Type }];
  if (row.ParentUiMapID) facts.push({ label: "In", value: c.ref("ui_map", row.ParentUiMapID) });
  const sections: Section[] = [];
  const children = c.all("SELECT ID FROM client_UiMap WHERE ParentUiMapID = ? ORDER BY ID", id);
  if (children.length) sections.push({ type: "refs", title: "Maps within", refs: children.map((x) => c.ref("ui_map", x.ID)) });
  const areas = c.all("SELECT DISTINCT AreaID FROM client_UiMapAssignment WHERE UiMapID = ? AND AreaID != 0", id);
  if (areas.length) sections.push({ type: "refs", title: "Areas", refs: areas.map((a) => c.ref("area", a.AreaID)) });
  return { facts, sections, raw: [{ table: "client_UiMap", key: "ID", rows: [row] }], sql: `SELECT * FROM client_UiMap WHERE ID = ${id}` };
}

function generic(c: Ctx, kind: string, id: number): Partial<Entity> | null {
  const { table, row } = clientRow(c, kind, id);
  if (!row) return null;
  return { facts: [], sections: [], raw: [{ table, key: "ID", rows: [row] }], sql: `SELECT * FROM "${table}" WHERE ID = ${id}` };
}

const KINDS: Record<string, [string, (c: Ctx, id: number) => Partial<Entity> | null]> = {
  quest: ["Quest", quest],
  creature: ["Creature", creature],
  item: ["Item", item],
  object: ["Object", object],
  area: ["Area", area],
  faction: ["Faction", faction],
  spell: ["Spell", spell],
  map: ["Map", map],
  ui_map: ["Map (interface)", uiMap],
};
export const KIND_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(KINDS).map(([k, [label]]) => [k, label])),
  wmo_area: "Area (building)",
  encounter: "Encounter",
  skill_line: "Skill",
  talent_tab: "Talent tree",
  specialization: "Specialization",
  taxi_node: "Flight point",
  creature_type: "Creature type",
  creature_family: "Creature family",
  class: "Class",
  race: "Race",
  quest_sort: "Quest category",
  quest_info: "Quest type",
  language: "Language",
};

export function entity(d: Database, kind: string, id: number, locale: string): Entity | null {
  const c = new Ctx(d, locale);
  const make = KINDS[kind]?.[1];
  const part = make ? make(c, id) : generic(c, kind, id);
  const names = c.names.all(kind, id);
  if (!part && !names.length) return null;
  const subnames = kind === "creature" ? c.names.all("creature_subname", id) : [];
  for (const s of subnames) {
    const n = names.find((x) => x.locale === s.locale);
    if (n) n.subname = s.name;
  }
  return {
    ref: c.ref(kind, id),
    kindLabel: KIND_LABELS[kind] ?? kind,
    badges: part?.badges ?? [],
    facts: part?.facts ?? [],
    names,
    sections: part?.sections ?? [],
    raw: part?.raw ?? [],
    sql: part?.sql ?? `SELECT * FROM name WHERE kind = '${kind}' AND id = ${id}`,
  };
}
