// One thing on one card: what a session needs to know of a creature, an
// object, a place, an item or a quest, in 40 lines at most, in place of a
// dozen queries and their output (bin/card.ts; the harness's piece A,
// addon-kit/docs/harness.md). Every fact is the database's: the card only
// joins and words them.
import type { Database } from "bun:sqlite";
import { flagWords, ITEM_CLASSES, NPC_FLAGS, OBJECT_TYPES, QUALITIES, RANKS } from "./game";
import { LOCALES } from "./wago";
import { areaMap, overlayOf, subzoneAt, worldToMap } from "./world";

type Row = Record<string, any>;
export const KINDS = ["npc", "object", "place", "item", "quest"] as const;
export type Kind = (typeof KINDS)[number];
export const MAX_LINES = 40;
const WORLD_ZONES = 10;
const NAME_KIND: Record<Kind, string> = { npc: "creature", object: "object", place: "area", item: "item", quest: "quest" };
const ALL_LOCALES = ["enUS", ...LOCALES];
// the ChrRaces bits of each side's races (human, dwarf, night elf, gnome; orc, undead, tauren, troll)
const SIDES: [string, number][] = [
  ["Alliance", 1 | 4 | 8 | 64],
  ["Horde", 2 | 16 | 32 | 128],
];
// FactionTemplate's groups: FactionGroup, FriendGroup, EnemyGroup
const GROUPS: [number, string][] = [
  [1, "every player"],
  [2, "the Alliance"],
  [4, "the Horde"],
  [8, "the monsters"],
];
// FactionGroup: what it is a member of (the player bit beside a side's says nothing more)
const MEMBERS: [number, string][] = [
  [1, "the players"],
  [2, "the Alliance"],
  [4, "the Horde"],
  [8, "the monsters"],
];
// each side's races (ChrRaces ids; a race's bit in a mask: 1 << (id - 1))
const RACES: Record<string, number[]> = { Alliance: [1, 3, 4, 7], Horde: [2, 5, 6, 8] };
// a reputation's standing, from its value
const standing = (v: number) =>
  v <= -6001 ? "hated" : v <= -3001 ? "hostile" : v < 0 ? "unfriendly" : v < 3000 ? "neutral" : v < 9000 ? "friendly" : v < 21000 ? "honored" : v < 42000 ? "revered" : "exalted";
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const pct = (n: number) => `${n < 0.1 ? Math.round(n * 1000) / 1000 : Math.round(n * 10) / 10}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
// a loot row's odds: a quest's own drop, an equal-chance group's, a percent
const odds = (c: number | null) => (c == null ? "" : c < 0 ? ` quest ${pct(-c)}` : c === 0 ? " (group)" : ` ${pct(c)}`);
const range = (a: number | null, b: number | null) => (a == null ? "?" : b != null && b !== a ? `${a}-${b}` : `${a}`);
const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// of some spawns, the one nearest their middle (a real spot, not an average)
function middle(g: Spot[]): Spot {
  const mx = g.reduce((a, s) => a + s.x, 0) / g.length,
    my = g.reduce((a, s) => a + s.y, 0) / g.length;
  return g.reduce((a, s) => (Math.hypot(s.x - mx, s.y - my) < Math.hypot(a.x - mx, a.y - my) ? s : a));
}

// a spawn on a zone's map: Questie's and Wowhead's percent as they are, the
// Classic database's world coordinates placed the client's way
type Spot = { ui: number | null; area: number | null; x: number; y: number; source: string; row: Row };

class Card {
  lines: string[] = [];
  private names = new Map<string, string | null>();
  private objectiveItems: Map<number, Row[]> | null = null;
  constructor(
    readonly d: Database,
    readonly full: boolean,
  ) {}
  get = (sql: string, ...p: any[]) => this.d.query(sql).get(...p) as Row | null;
  all = (sql: string, ...p: any[]) => this.d.query(sql).all(...p) as Row[];
  add(label: string, text: string | null | undefined) {
    if (text) this.lines.push(`${label.padEnd(8)}${text}`);
  }
  // the first n of a list, and how many more (all of it with --full)
  few<T>(list: T[], n: number, show: (t: T) => string, sep = " · "): string {
    const cut = this.full ? list : list.slice(0, n);
    return cut.map(show).join(sep) + (list.length > cut.length ? `${sep}+${list.length - cut.length} more` : "");
  }

  // ── names ──────────────────────────────────────────────────────────────────
  name(kind: string, id: number | null | undefined): string | null {
    if (id == null) return null;
    const key = `${kind}:${id}`;
    if (!this.names.has(key))
      this.names.set(
        key,
        (this.get("SELECT name FROM name WHERE kind = ? AND id = ? ORDER BY locale != 'enUS' LIMIT 1", kind, id)?.name as string) ?? null,
      );
    return this.names.get(key)!;
  }
  // a thing's names in every language, the same name's languages together,
  // a missing language flagged ("(English)": the client shows English there)
  namesLine(kind: string, id: number): string | null {
    const rows = this.all("SELECT locale, name, source FROM name WHERE kind = ? AND id = ?", kind, id);
    if (!rows.length) return null;
    const by = new Map(rows.map((r) => [r.locale, r]));
    const groups = new Map<string, string[]>();
    for (const l of ALL_LOCALES) {
      const r = by.get(l);
      if (!r) continue;
      const key = r.name + (r.source === "english" ? " (English)" : r.source === "esES" ? " (esES's)" : "");
      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    const missing = ALL_LOCALES.filter((l) => !by.has(l));
    return [...groups].map(([n, ls]) => `${ls.join(",")} ${n}`).join(" · ") + (missing.length ? ` · MISSING ${missing.join(",")}` : "");
  }
  npc = (id: number) => `${this.name("creature", id) ?? "?"} (${id})`;
  object = (id: number) => `${this.name("object", id) ?? "?"} (${id})`;
  item = (id: number) => `${this.name("item", id) ?? "?"} (${id})`;
  quest = (id: number) => {
    const q = this.get("SELECT level FROM quest WHERE id = ?", id);
    return `${id} ${this.name("quest", id) ?? "?"}${q?.level != null ? ` (${q.level})` : ""}`;
  };
  area = (id: number | null) => (id == null ? null : (this.name("area", id) ?? `area ${id}`));
  uiMap = (ui: number) => this.name("ui_map", ui) ?? this.get("SELECT Name_lang FROM client_UiMap WHERE ID = ?", ui)?.Name_lang ?? `map ${ui}`;

  // ── who a creature attacks ─────────────────────────────────────────────────
  // its faction template decoded: its groups, its enemies and friends, and the
  // players' standing with its faction where it has a reputation
  stance(tid: number | null, friendly?: string | null): { faction: string; words: string[] } {
    if (!tid) {
      const sides = friendly ? (friendly === "AH" ? "both sides" : friendly === "A" ? "the Alliance" : "the Horde") : null;
      return { faction: "no faction template", words: sides ? [`friendly to ${sides} (Questie's)`] : [] };
    }
    const t = this.get("SELECT * FROM client_FactionTemplate WHERE ID = ?", tid);
    if (!t) return { faction: `template ${tid}, not in the client`, words: [] };
    // (every player said once: the Alliance and the Horde are in it)
    const group = (m: number) => flagWords(m & 1 ? m & ~6 : m, GROUPS).join(" and ");
    const words: string[] = [];
    if (t.FactionGroup) words.push(`member of ${flagWords(t.FactionGroup & 6 ? t.FactionGroup & ~1 : t.FactionGroup, MEMBERS).join(" and ")}`);
    if (t.EnemyGroup) words.push(`attacks ${group(t.EnemyGroup)}`);
    if (t.FriendGroup) words.push(`friend of ${group(t.FriendGroup)}`);
    const slots = (prefix: string) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => t[`${prefix}_${i}`]).filter((f) => f && f !== t.Faction);
    const enemies = slots("Enemies"),
      friends = slots("Friend");
    if (enemies.length) words.push(`foe of ${enemies.map((f) => this.name("faction", f) ?? f).join(", ")}`);
    if (friends.length) words.push(`friend of ${friends.map((f) => this.name("faction", f) ?? f).join(", ")}`);
    const f = this.get("SELECT * FROM client_Faction WHERE ID = ?", t.Faction);
    if (f && f.ReputationIndex >= 0) {
      // (each race's own base: Orgrimmar's undead start neutral, its orcs friendly)
      const of = (race: number) => {
        for (let i = 0; i < 4; i++) if ((f[`ReputationRaceMasks${i}_0`] ?? 0) & (1 << (race - 1))) return standing(f[`ReputationBase_${i}`]);
        return "neutral";
      };
      const rep = SIDES.map(([side]) => {
        const by = RACES[side].map((r) => [r, of(r)] as const);
        const count = (w: string) => by.filter(([, x]) => x === w).length;
        const most = by.map(([, w]) => w).sort((a, b) => count(b) - count(a))[0];
        const odd = by.filter(([, w]) => w !== most).map(([r, w]) => `${this.name("race", r) ?? `race ${r}`} ${w}`);
        return `${side} ${most}${odd.length ? ` (${odd.join(", ")})` : ""}`;
      });
      words.push(`reputation: ${rep.join(", ")}`);
    }
    if (!t.EnemyGroup && !enemies.length && !words.some((w) => /hated|hostile/.test(w))) words.push("attacks no one unprovoked");
    const fname = this.name("faction", t.Faction) ?? `faction ${t.Faction}`;
    return { faction: `${fname} (template ${tid})`, words };
  }
  // a creature's stance in a few words: what its template attacks, else the
  // sides whose standing with its faction is hostile, else no one
  // (its template the one way the servers ask: a monster none of whose
  // groups is its enemy never attacks first, though players may attack it)
  short(c: Row): string {
    const s = this.stance(c.faction_id, c.friendly);
    const attacks = s.words.find((w) => w.startsWith("attacks"));
    if (attacks) return attacks;
    const rep = s.words.find((w) => w.startsWith("reputation"));
    const hostile = SIDES.map(([side]) => side).filter((side) => rep && new RegExp(`${side} (hated|hostile)`).test(rep));
    if (hostile.length) return `attacks ${hostile.length === 2 ? "every player" : `the ${hostile[0]}`} (reputation)`;
    return "attacks no one unprovoked";
  }

  // ── where things stand ─────────────────────────────────────────────────────
  // (with the Classic database's spawns it may be one of: a spawn entry's,
  // a spawn group's)
  spots(kind: "creature" | "object", id: number): Spot[] {
    const rows = [
      ...this.all("SELECT * FROM spawn WHERE kind = ? AND entity_id = ?", kind, id),
      ...this.all(
        `SELECT s.*, 1 AS pooled FROM spawn s WHERE s.kind = ? AND s.source = 'classicdb' AND s.entity_id != ? AND s.spawn_id IN (
           SELECT spawn_id FROM spawn_entry WHERE kind = ? AND entity_id = ?
           UNION SELECT gs.spawn_id FROM spawn_group_entry ge JOIN spawn_group g ON g.id = ge.group_id AND g.kind = ?
           JOIN spawn_group_spawn gs ON gs.group_id = ge.group_id WHERE ge.entity_id = ?)`,
        kind, id, kind, id, kind, id,
      ),
    ];
    const own = (r: Row) => r.ui_map_id ?? (r.area_id != null ? areaMap(this.d, r.area_id) : null);
    const known = new Set<number>(rows.map(own).filter((u) => u != null));
    const out: Spot[] = [];
    for (const r of rows) {
      if (r.ux != null && r.uy != null) out.push({ ui: own(r), area: r.area_id, x: r.ux, y: r.uy, source: r.source, row: r });
      else if (r.map_id != null && r.x != null && r.y != null) {
        const p = worldToMap(this.d, r.map_id, r.x, r.y, known);
        out.push({ ui: p?.ui ?? null, area: null, x: p?.x ?? NaN, y: p?.y ?? NaN, source: r.source, row: r });
      }
    }
    return out;
  }
  // the things a pooled spawn (the Classic database's entity 0) may be
  pooled(kind: string, spawnId: number): number[] {
    return this.all(
      `SELECT entity_id FROM spawn_entry WHERE kind = ? AND spawn_id = ?
       UNION SELECT ge.entity_id FROM spawn_group_spawn gs JOIN spawn_group g ON g.id = gs.group_id AND g.kind = ?
       JOIN spawn_group_entry ge ON ge.group_id = gs.group_id WHERE gs.spawn_id = ?`,
      kind,
      spawnId,
      kind,
      spawnId,
    ).map((e) => e.entity_id as number);
  }
  // the spawns that stand for a thing: Questie's, else the Classic database's,
  // else Wowhead's points alone
  main(spots: Spot[]): Spot[] {
    for (const source of ["questie", "classicdb", "wowhead"]) {
      const list = spots.filter((s) => s.source === source);
      if (list.length) return list;
    }
    return spots;
  }
  zoneOf = (s: Spot) => (s.area != null ? this.area(s.area) : s.ui != null ? this.uiMap(s.ui) : `map ${s.row.map_id} (no zone map)`);
  subzone = (s: Spot) => (s.ui != null && !Number.isNaN(s.x) ? subzoneAt(this.d, s.ui, s.x, s.y) : null);
  at = (s: Spot) => (Number.isNaN(s.x) ? `${r1(s.row.x)},${r1(s.row.y)} (world)` : `${r1(s.x)},${r1(s.y)}`);
  // one zone's spawns: a lone one's spot and subzone, else by subzone (the
  // spawn nearest each group's middle)
  zoneLine(list: Spot[]): string {
    const zone = this.zoneOf(list[0]);
    if (list.length === 1) {
      const sub = this.subzone(list[0]);
      return `${zone} ${this.at(list[0])}${sub ? ` (${this.area(sub)})` : ""}`;
    }
    const bySub = new Map<number | null, Spot[]>();
    for (const s of list) bySub.set(this.subzone(s), [...(bySub.get(this.subzone(s)) ?? []), s]);
    const groups = [...bySub].sort((a, b) => b[1].length - a[1].length);
    return `${zone} ×${list.length}: ${this.few(groups, 4, ([sub, g]) => `${sub != null ? this.area(sub) : "no subzone"} ×${g.length} ${this.at(middle(g))}`)}`;
  }
  // a creature's or an object's spawns, how it moves, and whether Wowhead's
  // frozen points agree with them
  spawnLines(kind: "creature" | "object", id: number) {
    const spots = this.spots(kind, id);
    const main = this.main(spots);
    if (!main.length) return this.add("spawns", "none (summoned, scripted or unknown)");
    const source = main[0].source;
    const zones = new Map<string, Spot[]>();
    for (const s of main) zones.set(this.zoneOf(s), [...(zones.get(this.zoneOf(s)) ?? []), s]);
    const list = [...zones.values()].sort((a, b) => b.length - a.length);
    const pooled = main.filter((s) => s.row.pooled).length;
    this.add("spawns", `${main.length} (${source}${source === "wowhead" ? " alone" : ""}${pooled ? `, ${pooled} of them shared: another may stand there` : ""})`);
    for (const z of this.full ? list : list.slice(0, 3)) this.add("", this.zoneLine(z));
    if (list.length > 3 && !this.full) this.add("", `+${list.length - 3} more zones`);
    if (kind === "creature") {
      const moves = new Map<string, number>();
      for (const s of spots.filter((s) => s.source === "classicdb")) {
        const m = s.row.movement_type;
        const w = m === 2 ? "walks a path" : m === 1 ? `wanders ${Math.round(s.row.wander_distance ?? 0)} yd` : "stands";
        moves.set(w, (moves.get(w) ?? 0) + 1);
      }
      if (moves.size) this.add("moves", [...moves].map(([w, n]) => `${w} ×${n}`).join(" · ") + " (classicdb)");
    }
    const wowhead = spots.filter((s) => s.source === "wowhead");
    if (!wowhead.length || source === "wowhead") return;
    const near = wowhead.map((w) => {
      const same = main.filter((s) => s.ui === w.ui && !Number.isNaN(s.x));
      return { w, d: same.length ? Math.min(...same.map((s) => Math.hypot(s.x - w.x, s.y - w.y))) : Infinity };
    });
    const off = near.filter((n) => n.d > 2);
    const worst = Math.max(...near.map((n) => n.d));
    this.add(
      "wowhead",
      off.length
        ? `${off.length} of ${wowhead.length} points off: ${this.few(off, 3, (o) => `${this.zoneOf(o.w)} ${this.at(o.w)} (${Number.isFinite(o.d) ? `${r1(o.d)} map % from a spawn` : "no spawn on that map"})`)}`
        : `${wowhead.length === 1 ? "1 point agrees" : `${wowhead.length} points agree`} (within ${r1(worst)} map % of a spawn)`,
    );
  }

  // ── quests ─────────────────────────────────────────────────────────────────
  // the quests asking each item (as an objective, or one handed in for it)
  questsAsking(item: number): Row[] {
    if (!this.objectiveItems) {
      this.objectiveItems = new Map();
      for (const r of this.all("SELECT quest_id, target_id, kind, count FROM quest_objective WHERE kind IN ('item', 'source')"))
        this.objectiveItems.set(r.target_id, [...(this.objectiveItems.get(r.target_id) ?? []), r]);
    }
    return this.objectiveItems.get(item) ?? [];
  }
  // what drops from a creature or an object: its loot rows by the source's own
  // key (a template: the Classic database's, players'; the thing itself:
  // Questie's, Wowhead's), a reference's rows one level down
  loot(kind: string, id: number, template: number | null): Row[] {
    const rows = this.all(
      `SELECT * FROM loot WHERE kind = ? AND ((source IN ('classicdb', 'players') AND source_id = ?) OR (source IN ('questie', 'wowhead') AND source_id = ?))`,
      kind,
      template ?? -1,
      id,
    );
    const out = rows.filter((r) => r.item_id != null);
    for (const r of rows.filter((r) => r.ref_id != null))
      out.push(...this.all("SELECT * FROM loot WHERE kind = 'reference' AND source_id = ? AND item_id IS NOT NULL", r.ref_id).map((x) => ({ ...x, via: r.ref_id })));
    return out;
  }
  // a loot row a quest truly leans on: a quest's own drop, a quest item, the
  // thing's own loot at 1% or more or in an equal-chance group, an item sold;
  // a world drop (a reference table's: gems, potions) or a rarer one only
  // with --full
  tied = (r: Row) =>
    this.full ||
    r.chance == null ||
    r.chance < 0 ||
    this.get("SELECT class_id FROM item WHERE id = ?", r.item_id)?.class_id === 12 ||
    (!r.via && (r.chance >= 1 || r.chance === 0) && this.zonesDropping(r.item_id) <= WORLD_ZONES);
  // how many zones an item drops in (its creatures' and objects' zones,
  // Questie's): more than WORLD_ZONES, a world drop (gems, cloth, potions in
  // 15 to 47; Stranglethorn's pages, Un'Goro Soil, the meats in 1 to 9)
  private owners: Map<string, { kind: string; id: number }[]> | null = null;
  private zonesOfThing: Map<string, Set<number>> | null = null;
  private dropZones = new Map<number, number>();
  zonesDropping(item: number): number {
    if (!this.owners || !this.zonesOfThing) {
      const owners = new Map<string, { kind: string; id: number }[]>();
      const own = (key: string, kind: string, id: number) => owners.set(key, [...(owners.get(key) ?? []), { kind, id }]);
      for (const r of this.all("SELECT id, loot_id, pick_loot_id, skin_loot_id FROM creature"))
        for (const [k, t] of [["creature", r.loot_id], ["pickpocket", r.pick_loot_id], ["skinning", r.skin_loot_id]]) if (t) own(`${k}:${t}`, "creature", r.id);
      for (const r of this.all("SELECT id, loot_id FROM object WHERE loot_id IS NOT NULL")) own(`object:${r.loot_id}`, "object", r.id);
      const zones = new Map<string, Set<number>>();
      for (const r of this.all("SELECT DISTINCT kind, entity_id, area_id FROM spawn WHERE source = 'questie' AND area_id IS NOT NULL")) {
        const k = `${r.kind}:${r.entity_id}`;
        zones.set(k, (zones.get(k) ?? new Set()).add(r.area_id));
      }
      this.owners = owners;
      this.zonesOfThing = zones;
    }
    if (!this.dropZones.has(item)) {
      const zones = new Set<number>();
      for (const r of this.all("SELECT kind, source_id, source FROM loot WHERE item_id = ? AND chance >= 0 AND kind IN ('creature', 'pickpocket', 'skinning', 'object')", item)) {
        const things =
          r.source === "questie" || r.source === "wowhead" ? [{ kind: r.kind === "object" ? "object" : "creature", id: r.source_id }] : (this.owners.get(`${r.kind}:${r.source_id}`) ?? []);
        for (const t of things) for (const z of this.zonesOfThing.get(`${t.kind}:${t.id}`) ?? []) zones.add(z);
      }
      this.dropZones.set(item, zones.size);
    }
    return this.dropZones.get(item)!;
  }
  // the items among some loot that quests ask for or that start a quest
  // ("Item (id) for 123"), and how many quests asked a world drop among it
  questItems(rows: Row[]): { lines: string[]; world: number } {
    const lines: string[] = [];
    const world = new Set<number>();
    const seen = new Set<number>();
    for (const r of rows) {
      if (seen.has(r.item_id)) continue;
      const asks = [...new Set(this.questsAsking(r.item_id).map((q) => q.quest_id as number))];
      const starts = this.all("SELECT quest_id FROM quest_relation WHERE role = 'start' AND kind = 'item' AND entity_id = ?", r.item_id).map((q) => q.quest_id);
      if (!asks.length && !starts.length) continue;
      if (!this.tied(r)) {
        for (const q of asks) world.add(q);
        continue;
      }
      seen.add(r.item_id);
      if (asks.length) lines.push(`${this.item(r.item_id)} for ${asks.join(",")}`);
      if (starts.length) lines.push(`${this.item(r.item_id)} starts ${starts.join(",")}`);
    }
    return { lines, world: world.size };
  }
  worldNote = (n: number) => (n ? ` · +${n} quest${n === 1 ? "" : "s"} asking a world drop (--full)` : "");
  relations(kind: string, id: number, role: "start" | "end") {
    return this.all("SELECT DISTINCT quest_id FROM quest_relation WHERE kind = ? AND entity_id = ? AND role = ? ORDER BY quest_id", kind, id, role).map((r) => r.quest_id as number);
  }
  // a loot list in short: the likeliest first, a quest's own marked
  lootLine(rows: Row[]): string {
    const byItem = new Map<number, Row>();
    for (const r of rows) if (!byItem.has(r.item_id) || Math.abs(r.chance ?? 0) > Math.abs(byItem.get(r.item_id)!.chance ?? 0)) byItem.set(r.item_id, r);
    const list = [...byItem.values()].sort((a, b) => Math.abs(b.chance ?? 0) - Math.abs(a.chance ?? 0));
    return `${plural(list.length, "item")}: ${this.few(list, 5, (r) => `${this.name("item", r.item_id) ?? r.item_id}${odds(r.chance)}`)}`;
  }
  textOf(kind: "object" | "item", id: number): void {
    const pages = this.all("SELECT locale, idx, text FROM readable_page WHERE kind = ? AND id = ? ORDER BY locale, idx", kind, id);
    if (!pages.length) return;
    const en = pages.filter((p) => p.locale === "enUS");
    const locales = [...new Set(pages.map((p) => p.locale))];
    const missing = ALL_LOCALES.filter((l) => !locales.includes(l));
    this.add("text", `${en.length} page${en.length === 1 ? "" : "s"}${missing.length ? ` · MISSING ${missing.join(",")}` : " · every language"}`);
    if (en.length) this.add("", `"${clip(en.map((p) => p.text.replace(/\s*\n\s*/g, " / ")).join(" // "), this.full ? 100000 : 300)}"`);
  }

  // ── the cards ──────────────────────────────────────────────────────────────
  // a thing the build left out, its names kept for the saved files holding
  // its id (left_out: Season of Discovery's in Forever)
  leftOut(label: string, kind: string, id: number): true | null {
    const r = hasLeftOut(this.d) ? this.get("SELECT reason FROM left_out WHERE kind = ? AND id = ?", kind, id) : null;
    if (!r) return null;
    this.lines.push(`${label} ${id} ${this.name(kind, id) ?? "?"} · LEFT OUT (${String(r.reason).replace(/_/g, " ")}): its names only`);
    this.add("names", this.namesLine(kind, id));
    if (kind === "creature") this.add("title", this.namesLine("creature_subname", id));
    return true;
  }
  npcCard(id: number) {
    const c = this.get("SELECT * FROM creature WHERE id = ?", id);
    if (!c) return this.leftOut("npc", "creature", id) ?? this.add("npc", `${id}: no such creature`);
    const sub = this.name("creature_subname", id);
    this.lines.push(`npc ${id} ${this.name("creature", id) ?? "?"}${sub ? ` <${sub}>` : ""}${c.removed ? " · REMOVED" : ""}`);
    this.add("names", this.namesLine("creature", id));
    this.add("title", this.namesLine("creature_subname", id));
    const family = this.name("creature_family", c.family_id);
    this.add(
      "level",
      [
        range(c.min_level, c.max_level),
        RANKS[c.rank ?? 0] ?? `rank ${c.rank}`,
        [this.name("creature_type", c.type_id), family].filter(Boolean).join(" / ") || null,
        flagWords(c.npc_flags, NPC_FLAGS).join(", ") || null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    const s = this.stance(c.faction_id, c.friendly);
    this.add("faction", `${s.faction}: ${s.words.join(", ") || "neutral"}`);
    this.spawnLines("creature", id);
    // quests
    const gives = this.relations("creature", id, "start"),
      ends = this.relations("creature", id, "end");
    if (gives.length) this.add("gives", this.few(gives, 6, this.quest));
    if (ends.length) this.add("ends", this.few(ends, 6, this.quest));
    const credits = [id, ...String(c.kill_credit ?? "").split(",").filter(Boolean).map(Number)];
    const asked = this.all(
      `SELECT DISTINCT quest_id, target_id, count FROM quest_objective WHERE kind = 'creature' AND target_id IN (${credits.map(() => "?").join(",")}) ORDER BY quest_id`,
      ...credits,
    );
    if (asked.length) this.add("asked", this.few(asked, 6, (r) => `${this.quest(r.quest_id)} ×${r.count ?? 1}${r.target_id !== id ? ` (as ${r.target_id})` : ""}`));
    const loot = this.loot("creature", id, c.loot_id),
      pick = this.loot("pickpocket", id, c.pick_loot_id),
      skin = this.loot("skinning", id, c.skin_loot_id);
    const drops = this.questItems([...loot, ...pick, ...skin].sort((a, b) => (a.chance ?? 0) - (b.chance ?? 0)));
    if (drops.lines.length || drops.world) this.add("drops", (this.few(drops.lines, 5, (s) => s) || "nothing a quest asks") + this.worldNote(drops.world));
    const sells = this.all("SELECT DISTINCT item_id FROM vendor WHERE npc_id = ? ORDER BY item_id", id).map((r) => r.item_id as number);
    const sellsAsked = this.questItems(sells.map((i) => ({ item_id: i, chance: null }))).lines;
    if (sellsAsked.length) this.add("sells q", this.few(sellsAsked, 4, (s) => s));
    if (sells.length) this.add("sells", `${sells.length}: ${this.few(sells, 8, (i) => this.name("item", i) ?? String(i), ", ")}`);
    // what it says
    const gossip = this.all("SELECT * FROM gossip WHERE npc_id = ? ORDER BY condition_id != 0, text_id, idx", id);
    if (gossip.length) {
      const en = gossip.filter((g) => g.locale === "enUS");
      const first = en[0] ?? gossip[0];
      const texts = new Set(en.map((g) => `${g.text_id}:${g.idx}`)).size;
      const locales = [...new Set(gossip.map((g) => g.locale))];
      const conditional = new Set(en.filter((g) => g.condition_id).map((g) => g.text_id)).size;
      this.add(
        "gossip",
        `"${clip(first.text ?? first.text_female ?? "", this.full ? 100000 : 220)}"` +
          (texts > 1 ? ` (+${texts - 1} more${conditional ? `, ${conditional} on a condition` : ""})` : first.condition_id ? " (on a condition)" : "") +
          ` · ${locales.join(",")}`,
      );
      // the tale it tells over several windows: a choice, the page it opens, the next
      // (a choice or a page shown only on a condition, an event's or a quest's, says so; the
      // ones always there first; the same choice and page once)
      const seen = new Set<number>([first.menu_id]);
      const pages: string[] = [];
      const told = new Set<string>();
      let more = 0;
      const walk = (menu: number) => {
        const choices = this.all(
          "SELECT text, text_female, next_menu_id, condition_id FROM gossip_option WHERE menu_id = ? AND locale = 'enUS' AND next_menu_id IS NOT NULL ORDER BY condition_id != 0, option_id",
          menu,
        );
        for (const o of choices) {
          if (seen.has(o.next_menu_id)) continue;
          seen.add(o.next_menu_id);
          const page = this.get(
            "SELECT text, text_female, condition_id FROM gossip_page WHERE menu_id = ? AND locale = 'enUS' ORDER BY condition_id != 0, text_id, idx",
            o.next_menu_id,
          );
          if (!page) continue;
          const choice = clip(o.text ?? o.text_female ?? "", 60),
            said = clip(page.text ?? page.text_female ?? "", this.full ? 100000 : 160);
          if (told.has(`${choice}\n${said}`)) continue;
          told.add(`${choice}\n${said}`);
          if (!this.full && pages.length >= 6) {
            more++;
            continue;
          }
          pages.push(`"${choice}" → "${said}"${o.condition_id || page.condition_id ? " (on a condition)" : ""}`);
          walk(o.next_menu_id);
        }
      };
      walk(first.menu_id);
      for (const p of pages) this.add("tale", p);
      if (more) this.add("tale", `+${more} more (--full)`);
    }
    const heard = this.all("SELECT kind, locale, text, source FROM npc_line WHERE npc_id = ? AND locale = 'enUS' ORDER BY kind", id);
    if (heard.length) this.add("says", this.few(heard, 2, (l) => `${l.kind} "${clip(l.text, 120)}" (${l.source})`));
    if (loot.length || pick.length || skin.length)
      this.add("loot", [loot.length ? this.lootLine(loot) : null, pick.length ? `pickpocket ${pick.length}` : null, skin.length ? `skinning ${skin.length}` : null].filter(Boolean).join(" · "));
  }

  objectCard(id: number) {
    const o = this.get("SELECT * FROM object WHERE id = ?", id);
    if (!o) return this.leftOut("object", "object", id) ?? this.add("object", `${id}: no such object`);
    this.lines.push(`object ${id} ${this.name("object", id) ?? "?"}${o.removed ? " · REMOVED" : ""}`);
    this.add("names", this.namesLine("object", id));
    const node = this.all("SELECT skill_line_id, min_skill FROM gathering_node WHERE object_id = ?", id);
    this.add(
      "type",
      [`${OBJECT_TYPES[o.type] ?? "type"} (${o.type})`, ...node.map((n) => `${this.name("skill_line", n.skill_line_id) ?? n.skill_line_id} ${n.min_skill}`)].join(" · "),
    );
    this.textOf("object", id);
    const gives = this.relations("object", id, "start"),
      ends = this.relations("object", id, "end");
    if (gives.length) this.add("gives", this.few(gives, 6, this.quest));
    if (ends.length) this.add("ends", this.few(ends, 6, this.quest));
    const asked = this.all("SELECT DISTINCT quest_id, count FROM quest_objective WHERE kind = 'object' AND target_id = ? ORDER BY quest_id", id);
    if (asked.length) this.add("asked", this.few(asked, 6, (r) => `${this.quest(r.quest_id)} ×${r.count ?? 1}`));
    const loot = this.loot("object", id, o.loot_id);
    const drops = this.questItems([...loot].sort((a, b) => (a.chance ?? 0) - (b.chance ?? 0)));
    if (drops.lines.length || drops.world) this.add("holds", (this.few(drops.lines, 5, (s) => s) || "nothing a quest asks") + this.worldNote(drops.world));
    this.spawnLines("object", id);
    this.nearLines("object", id);
    if (loot.length) this.add("loot", this.lootLine(loot));
  }
  // the creatures standing beside a thing: within 20 yards of one of its
  // spawns (the Classic database's world coordinates), else within half a
  // percent on its zone's map
  // (not for a thing standing everywhere: a herb's hundreds of spots)
  nearLines(kind: "creature" | "object", id: number) {
    if (this.main(this.spots(kind, id)).length > 10) return;
    const best = new Map<number, number>();
    const world = this.all("SELECT map_id, x, y FROM spawn WHERE kind = ? AND entity_id = ? AND x IS NOT NULL", kind, id);
    let unit = "yd";
    for (const w of world.slice(0, 50))
      for (const r of this.all(
        "SELECT entity_id, spawn_id, x, y FROM spawn WHERE kind = 'creature' AND map_id = ? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ?",
        w.map_id,
        w.x - 20,
        w.x + 20,
        w.y - 20,
        w.y + 20,
      )) {
        const dist = Math.hypot(r.x - w.x, r.y - w.y);
        if (dist > 20) continue;
        for (const e of r.entity_id ? [r.entity_id] : this.pooled("creature", r.spawn_id))
          if (e !== id || kind !== "creature") best.set(e, Math.min(best.get(e) ?? Infinity, dist));
      }
    if (!world.length) {
      unit = "%";
      for (const s of this.main(this.spots(kind, id)).slice(0, 50))
        for (const r of this.all(
          "SELECT entity_id, ux, uy FROM spawn WHERE kind = 'creature' AND source = ? AND area_id IS ? AND ux BETWEEN ? AND ?",
          s.source,
          s.area,
          s.x - 0.5,
          s.x + 0.5,
        )) {
          const dist = Math.hypot(r.ux - s.x, r.uy - s.y);
          if (dist <= 0.5) best.set(r.entity_id, Math.min(best.get(r.entity_id) ?? Infinity, dist));
        }
    }
    if (!best.size) return;
    const list = [...best].sort((a, b) => a[1] - b[1]);
    this.add(
      "near",
      this.few(list, 4, ([cid, dist]) => {
        const c = this.get("SELECT * FROM creature WHERE id = ?", cid);
        return `${this.npc(cid)} ${c ? range(c.min_level, c.max_level) : "?"}, ${c ? this.short(c) : "?"}, ${unit === "yd" ? Math.round(dist) : r1(dist)} ${unit}`;
      }),
    );
  }

  placeCard(id: number) {
    const a = this.get("SELECT * FROM client_AreaTable WHERE ID = ?", id);
    if (!a) return this.add("place", `${id}: no such area`);
    this.lines.push(`place ${id} ${this.area(id)}`);
    this.add("names", this.namesLine("area", id));
    const chain: number[] = [];
    for (let p = a.ParentAreaID, n = 0; p && n < 5; n++) {
      chain.push(p);
      p = this.get("SELECT ParentAreaID FROM client_AreaTable WHERE ID = ?", p)?.ParentAreaID;
    }
    this.add("in", [...chain.map((p) => `${this.area(p)} (${p})`), this.name("map", a.ContinentID) ?? `map ${a.ContinentID}`].join(" · "));
    const box = (b: [number, number, number, number]) => `${r1(b[0])}-${r1(b[2])} × ${r1(b[1])}-${r1(b[3])}`;
    const overlay = overlayOf(this.d, id);
    if (overlay) {
      const h = overlay.hit ?? overlay.box;
      this.add(
        "overlay",
        `${box(overlay.box)} on ${this.uiMap(overlay.ui)} · hover box ${overlay.hit ? box(overlay.hit) : "none"} · centre ${r1((h[0] + h[2]) / 2)},${r1((h[1] + h[3]) / 2)}`,
      );
    }
    const subs = this.all("SELECT ID FROM client_AreaTable WHERE ParentAreaID = ? ORDER BY ID", id).map((r) => r.ID as number);
    if (subs.length) this.add("areas", this.few(subs, 10, (s) => `${this.area(s)} (${s})`));
    // what stands inside: a zone's whole map, a subzone's explored area (each
    // spawn in the subzone the npc card would name)
    const own = areaMap(this.d, id);
    const zone = own != null && !a.ParentAreaID ? own : overlay?.ui ?? own;
    if (zone == null) return this.add("inside", "no map holds it: its creatures can't be told (quests by zone below)");
    const family = new Set([id, ...subs]);
    const inside = (ui: number | null, x: number, y: number) => ui === zone && (zone === own && !a.ParentAreaID ? true : family.has(subzoneAt(this.d, zone, x, y) ?? -1));
    const ents = new Map<string, { kind: string; id: number; n: number }>();
    const spotsOf = new Map<string, Set<string>>();
    const note = (kind: string, eid: number, x: number, y: number) => {
      const k = `${kind}:${eid}`;
      const e = ents.get(k) ?? { kind, id: eid, n: 0 };
      e.n++;
      ents.set(k, e);
      spotsOf.set(k, (spotsOf.get(k) ?? new Set()).add(`${r1(x)},${r1(y)}`));
    };
    const areas = this.all("SELECT AreaID FROM client_UiMapAssignment WHERE UiMapID = ? AND AreaID > 0", zone).map((r) => r.AreaID);
    for (const r of this.all(
      `SELECT kind, entity_id, area_id, ui_map_id, ux, uy FROM spawn WHERE source = 'questie' AND (area_id IN (${areas.map(() => "?").join(",") || "NULL"}) OR ui_map_id = ?)`,
      ...areas,
      zone,
    ))
      if (inside(r.ui_map_id ?? areaMap(this.d, r.area_id), r.ux, r.uy)) note(r.kind, r.entity_id, r.ux, r.uy);
    // (the Classic database's spawns of what Questie places nowhere, a
    // pooled spawn's every candidate)
    const region = this.get("SELECT * FROM client_UiMapAssignment WHERE UiMapID = ? ORDER BY OrderIndex LIMIT 1", zone);
    const placed = new Map<string, boolean>();
    const questiePlaces = (kind: string, eid: number) => {
      const k = `${kind}:${eid}`;
      if (!placed.has(k)) placed.set(k, !!this.get("SELECT 1 FROM spawn WHERE kind = ? AND entity_id = ? AND source = 'questie' LIMIT 1", kind, eid));
      return placed.get(k)!;
    };
    if (region)
      for (const r of this.all(
        `SELECT kind, entity_id, spawn_id, map_id, x, y FROM spawn WHERE source = 'classicdb' AND map_id = ? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ?`,
        region.MapID,
        region.Region_0,
        region.Region_3,
        region.Region_1,
        region.Region_4,
      )) {
        const candidates = r.entity_id ? [r.entity_id] : this.pooled(r.kind, r.spawn_id);
        const own = candidates.filter((e) => !questiePlaces(r.kind, e));
        if (!own.length) continue;
        const p = worldToMap(this.d, r.map_id, r.x, r.y, new Set([zone]));
        if (p && inside(p.ui, p.x, p.y)) for (const e of own) note(r.kind, e, p.x, p.y);
      }
    const creatures = [...ents.values()].filter((e) => e.kind === "creature").sort((x, y) => y.n - x.n);
    const objects = [...ents.values()].filter((e) => e.kind === "object").sort((x, y) => y.n - x.n);
    // the creatures by what they attack, then by level
    const buckets = new Map<string, { id: number; n: number; c: Row }[]>();
    for (const e of creatures) {
      const c = this.get("SELECT * FROM creature WHERE id = ?", e.id);
      if (!c) continue;
      const s = this.short(c);
      buckets.set(s, [...(buckets.get(s) ?? []), { id: e.id, n: e.n, c }]);
    }
    this.add("inside", `${creatures.length} creatures, ${objects.length} objects`);
    for (const [s, list] of [...buckets].sort((x, y) => y[1].length - x[1].length)) {
      list.sort((x, y) => (y.c.max_level ?? 0) - (x.c.max_level ?? 0) || y.n - x.n);
      this.add("", `${s}: ${this.few(list, 6, (e) => `${this.name("creature", e.id) ?? e.id} ${range(e.c.min_level, e.c.max_level)}${e.n > 1 ? ` ×${e.n}` : ""}`)}`);
    }
    // (look-alikes of one name together, counted by their spots: a pool's
    // three Atal'ai Artifacts share 68)
    const looks = new Map<string, { ids: number[]; spots: Set<string> }>();
    for (const e of objects) {
      const n = this.name("object", e.id) ?? String(e.id);
      const l = looks.get(n) ?? { ids: [], spots: new Set() };
      l.ids.push(e.id);
      for (const k of spotsOf.get(`object:${e.id}`) ?? []) l.spots.add(k);
      looks.set(n, l);
    }
    const alike = [...looks].sort((x, y) => y[1].spots.size - x[1].spots.size);
    if (objects.length) this.add("objects", this.few(alike, 6, ([n, l]) => `${n} (${l.ids.join(",")})${l.spots.size > 1 ? ` ×${l.spots.size}` : ""}`));
    // every quest working inside: its givers and enders, its targets, the items
    // its targets drop or hold, and the quests the log files under the area
    // (strongest first: given, ended or asked here, then a quest's own drop,
    // then any other loot; a gathering node's loot, found everywhere, with
    // the world drops)
    const ties = new Map<number, { why: Set<string>; rank: number }>();
    const tie = (q: number, why: string, rank: number) => {
      const t = ties.get(q) ?? { why: new Set(), rank };
      t.why.add(why);
      t.rank = Math.min(t.rank, rank);
      ties.set(q, t);
    };
    const world = new Set<number>();
    for (const e of [...creatures, ...objects]) {
      const who = e.kind === "creature" ? this.name("creature", e.id) : this.name("object", e.id);
      for (const q of this.relations(e.kind, e.id, "start")) tie(q, `given by ${who}`, 0);
      for (const q of this.relations(e.kind, e.id, "end")) tie(q, `ended by ${who}`, 0);
      for (const r of this.all("SELECT DISTINCT quest_id FROM quest_objective WHERE kind = ? AND target_id = ?", e.kind, e.id)) tie(r.quest_id, `asks ${who}`, 0);
      const t = this.get(`SELECT loot_id FROM ${e.kind} WHERE id = ?`, e.id)?.loot_id ?? null;
      const node = e.kind === "object" && !!this.get("SELECT 1 FROM gathering_node WHERE object_id = ?", e.id);
      for (const r of this.loot(e.kind, e.id, t))
        for (const q of this.questsAsking(r.item_id))
          if (this.tied(r) && (!node || this.full)) tie(q.quest_id, `${this.name("item", r.item_id)} from ${who}`, r.chance < 0 ? 1 : 2);
          else world.add(q.quest_id);
    }
    for (const r of this.all("SELECT id FROM quest WHERE zone_id IN (" + [...family].map(() => "?").join(",") + ")", ...family)) tie(r.id, "in its quest log zone", 1);
    const sorted = [...ties].sort((x, y) => x[1].rank - y[1].rank || x[0] - y[0]);
    const others = [...world].filter((q) => !ties.has(q)).length;
    if (!sorted.length) return this.add("quests", `none${this.worldNote(others)}`);
    this.add("quests", `${sorted.length}${this.worldNote(others)}`);
    // (one line for the quests of a name tied the same way: a capital's each)
    const lines = new Map<string, { ids: number[]; why: Set<string> }>();
    for (const [q, { why }] of sorted) {
      const key = `${this.name("quest", q)}|${[...why].join("|")}`;
      const l = lines.get(key) ?? { ids: [], why };
      l.ids.push(q);
      lines.set(key, l);
    }
    const list = [...lines.values()];
    for (const { ids, why } of this.full ? list : list.slice(0, 12))
      this.add("", `${ids.length > 1 ? `${ids.join(",")} ${this.quest(ids[0]).replace(/^\d+ /, "")}` : this.quest(ids[0])}: ${[...why].slice(0, 3).join(" · ")}${why.size > 3 ? ` +${why.size - 3}` : ""}`);
    if (list.length > 12 && !this.full) this.add("", `+${list.length - 12} more lines of quests`);
  }

  // where a quest's creature or object is, in short: its busiest zone's
  // busiest subzone, "Zone 12.3,45.6 (Subzone) ×n" (n: all its spawns)
  where(kind: "creature" | "object", id: number): string {
    const main = this.main(this.spots(kind, id));
    if (!main.length) return "nowhere";
    const busiest = <K>(list: Spot[], key: (s: Spot) => K) => {
      const by = new Map<K, Spot[]>();
      for (const s of list) by.set(key(s), [...(by.get(key(s)) ?? []), s]);
      return [...by.values()].reduce((a, b) => (b.length > a.length ? b : a));
    };
    const zone = busiest(main, this.zoneOf);
    const placed = zone.filter((s) => !Number.isNaN(s.x));
    const s = placed.length ? middle(busiest(placed, this.subzone)) : zone[0],
      sub = this.subzone(s);
    return `${this.zoneOf(s)} ${this.at(s)}${sub ? ` (${this.area(sub)})` : ""}${main.length > 1 ? ` ×${main.length}` : ""}`;
  }
  // who drops or holds an item: creatures and objects by the source's key, a
  // container item (kind item), a zone's fishing (kind fishing, an area)
  droppers(item: number): { kind: string; id: number; chance: number | null }[] {
    const out = new Map<string, { kind: string; id: number; chance: number | null }>();
    const put = (kind: string, id: number, chance: number | null) => {
      const k = `${kind}:${id}`;
      if (!out.has(k) || Math.abs(chance ?? 0) > Math.abs(out.get(k)!.chance ?? 0)) out.set(k, { kind, id, chance });
    };
    const owners = (kind: string, template: number) =>
      kind === "creature" || kind === "object"
        ? this.all(`SELECT id FROM ${kind} WHERE loot_id = ?`, template).map((r) => ({ kind, id: r.id as number }))
        : kind === "skinning" || kind === "pickpocket"
          ? this.all(`SELECT id FROM creature WHERE ${kind === "skinning" ? "skin_loot_id" : "pick_loot_id"} = ?`, template).map((r) => ({ kind: "creature", id: r.id as number }))
          : kind === "item" || kind === "fishing"
            ? [{ kind, id: template }]
            : [];
    for (const r of this.all("SELECT * FROM loot WHERE item_id = ?", item)) {
      if (r.kind === "reference") {
        for (const p of this.all("SELECT * FROM loot WHERE ref_id = ?", r.source_id)) for (const o of owners(p.kind, p.source_id)) put(o.kind, o.id, r.chance);
      } else if (r.source === "questie" || r.source === "wowhead") put(r.kind === "object" || r.kind === "item" ? r.kind : "creature", r.source_id, r.chance);
      else for (const o of owners(r.kind, r.source_id)) put(o.kind, o.id, r.chance);
    }
    return [...out.values()].sort((a, b) => Math.abs(b.chance ?? 0) - Math.abs(a.chance ?? 0));
  }

  // droppers of one name and odds together (a pool's look-alike chests)
  sameNamed(list: { kind: string; id: number; chance: number | null }[]): { kind: string; ids: number[]; chance: number | null }[] {
    const out = new Map<string, { kind: string; ids: number[]; chance: number | null }>();
    for (const x of list) {
      const key = `${x.kind}|${this.dropperName(x.kind, x.id)}|${x.chance}`;
      const g = out.get(key) ?? { kind: x.kind, ids: [], chance: x.chance };
      g.ids.push(x.id);
      out.set(key, g);
    }
    return [...out.values()];
  }
  dropperName = (kind: string, id: number) => (kind === "fishing" ? this.area(id) : this.name(kind, id)) ?? `unknown ${kind}`;
  dropper = (x: { kind: string; ids: number[]; chance: number | null }) =>
    x.kind === "item"
      ? `inside ${this.dropperName(x.kind, x.ids[0])} (${x.ids.join(",")})${odds(x.chance)}`
      : x.kind === "fishing"
        ? `fished in ${x.ids.map((a) => this.area(a)).join(", ")}${odds(x.chance)}`
        : `${this.dropperName(x.kind, x.ids[0])} (${x.ids.join(",")})${odds(x.chance)}, ${this.where(x.kind as "creature" | "object", x.ids[0])}`;

  itemCard(id: number) {
    const i = this.get("SELECT * FROM item WHERE id = ?", id);
    if (!i) return this.add("item", `${id}: no such item`);
    this.lines.push(`item ${id} ${this.name("item", id) ?? "?"}${i.removed ? " · REMOVED" : ""}`);
    this.add("names", this.namesLine("item", id));
    const cls = ITEM_CLASSES[i.class_id];
    this.add(
      "kind",
      [cls ? (cls[1]?.[i.subclass_id] ?? cls[0]) : `class ${i.class_id}`, QUALITIES[i.quality] ?? null, i.item_level ? `item level ${i.item_level}` : null, i.required_level ? `needs level ${i.required_level}` : null]
        .filter(Boolean)
        .join(" · "),
    );
    const asks = this.questsAsking(id);
    if (asks.length) this.add("asked", this.few(asks, 6, (q) => `${this.quest(q.quest_id)} ×${q.count ?? 1}${q.kind === "source" ? " (given for it)" : ""}`));
    const starts = [...new Set([...(i.start_quest_id ? [i.start_quest_id] : []), ...this.relations("item", id, "start")])];
    if (starts.length) this.add("starts", this.few(starts, 4, this.quest));
    const rewards = this.all("SELECT DISTINCT quest_id, kind FROM quest_reward WHERE kind IN ('item', 'choice') AND ref_id = ? ORDER BY quest_id", id);
    if (rewards.length) this.add("reward", this.few(rewards, 6, (r) => `${this.quest(r.quest_id)}${r.kind === "choice" ? " (a choice)" : ""}`));
    const handed = this.all("SELECT id FROM quest WHERE src_item_id = ? ORDER BY id", id).map((r) => r.id as number);
    if (handed.length) this.add("handed", `at the start of ${this.few(handed, 4, this.quest)}`);
    const drops = this.droppers(id);
    for (const [kind, label] of [
      ["creature", "dropped"],
      ["object", "in"],
      ["item", "in item"],
      ["fishing", "fished"],
    ]) {
      const list = this.sameNamed(drops.filter((x) => x.kind === kind));
      if (list.length) this.add(label, `${list.length}: ${this.few(list, 4, (x) => this.dropper(x))}`);
    }
    const sold = this.all("SELECT DISTINCT npc_id FROM vendor WHERE item_id = ? ORDER BY npc_id", id).map((r) => r.npc_id as number);
    if (sold.length) this.add("sold by", `${sold.length}: ${this.few(sold, 4, (n) => `${this.npc(n)}, ${this.where("creature", n)}`)}`);
    this.textOf("item", id);
  }

  questCard(id: number) {
    const q = this.get("SELECT * FROM quest WHERE id = ?", id);
    if (!q) return this.leftOut("quest", "quest", id) ?? this.add("quest", `${id}: no such quest`);
    this.lines.push(`quest ${this.quest(id)}${q.removed ? " · REMOVED" : ""}`);
    this.add("names", this.namesLine("quest", id));
    const sides = SIDES.filter(([, m]) => !q.races || (q.races & m) !== 0).map(([s]) => s);
    this.add(
      "level",
      [
        `${q.level ?? "?"} (from ${q.min_level ?? "?"})`,
        q.zone_id ? `${this.area(q.zone_id)} (${q.zone_id})` : null,
        q.sort_id ? (this.name("quest_sort", q.sort_id) ?? `sort ${q.sort_id}`) : null,
        sides.length === 2 ? "both sides" : sides.length ? sides[0] : `races ${q.races}`,
        q.classes ? `classes ${q.classes}` : null,
        q.special_flags & 1 ? "repeatable" : null,
        q.special_flags & 2 ? "an event or escort" : null,
        q.removed ? "removed" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    for (const role of ["start", "end"] as const) {
      const rel = this.all("SELECT kind, entity_id FROM quest_relation WHERE quest_id = ? AND role = ?", id, role);
      if (rel.length)
        this.add(
          role === "start" ? "from" : "to",
          this.few(rel, 3, (r) =>
            r.kind === "item" ? `item ${this.item(r.entity_id)}` : `${r.kind === "creature" ? this.npc(r.entity_id) : this.object(r.entity_id)}, ${this.where(r.kind, r.entity_id)}`,
          ),
        );
    }
    // (the droppers in the quest's own zone first: Northshire's wolves for
    // Northshire's quest, not Dun Morogh's likelier ones)
    const zones = new Set<number>();
    for (let z = q.zone_id, n = 0; z && n < 5; n++) {
      zones.add(z);
      z = this.get("SELECT ParentAreaID FROM client_AreaTable WHERE ID = ?", z)?.ParentAreaID;
    }
    const here = (kind: string, eid: number) =>
      this.main(this.spots(kind as "creature" | "object", eid)).some((s) => (s.area != null && zones.has(s.area)) || zones.has(this.subzone(s) ?? -1));
    const objectives = this.all("SELECT * FROM quest_objective WHERE quest_id = ? ORDER BY kind, idx", id);
    for (const o of objectives.slice(0, this.full ? undefined : 6)) {
      const n = o.count ?? 1;
      if (o.kind === "creature") this.add("asks", `${n} × ${this.npc(o.target_id)}, ${this.where("creature", o.target_id)}`);
      else if (o.kind === "object") this.add("asks", `${n} × ${this.object(o.target_id)}, ${this.where("object", o.target_id)}`);
      else if (o.kind === "item" || o.kind === "source") {
        const all = this.droppers(o.target_id);
        const from = this.sameNamed(zones.size ? [...all.filter((x) => here(x.kind, x.id)), ...all.filter((x) => !here(x.kind, x.id))] : all);
        this.add(o.kind === "item" ? "asks" : "given", `${n} × ${this.item(o.target_id)}${from.length ? ` ← ${this.few(from, 2, (x) => this.dropper(x))}` : ""}`);
      } else if (o.kind === "reputation") this.add("asks", `${this.name("faction", o.target_id) ?? o.target_id} at ${o.count}`);
      else this.add("asks", `${o.kind} ${o.target_id}${o.text ? `: ${clip(o.text, 100)}` : ""}`);
    }
    if (objectives.length > 6 && !this.full) this.add("", `+${objectives.length - 6} more objectives`);
    // (each once, whichever sources give it; "one of" where the alternatives are several)
    const pre = this.all("SELECT DISTINCT prev_id, kind FROM quest_prereq WHERE quest_id = ? ORDER BY prev_id", id);
    const anyIds = new Set(pre.filter((p) => p.kind === "any").map((p) => p.prev_id));
    const once = (list: Row[]) => [...new Map(list.map((p) => [p.prev_id, p])).values()];
    const any = anyIds.size > 1 ? once(pre.filter((p) => anyIds.has(p.prev_id))) : [];
    const all = once(pre.filter((p) => anyIds.size < 2 || !anyIds.has(p.prev_id)));
    const show = (p: Row) => `${p.prev_id < 0 ? "under way: " : ""}${this.quest(Math.abs(p.prev_id))}`;
    if (all.length) this.add("after", this.few(all, 4, show));
    if (any.length > 1) this.add("after", `one of: ${this.few(any, 4, show)}`);
    const next = [...new Set([q.next_in_chain, q.next_id].filter((n) => n))];
    if (next.length) this.add("next", next.map(this.quest).join(" · "));
    const rewards = this.all("SELECT * FROM quest_reward WHERE quest_id = ?", id);
    if (rewards.length)
      this.add(
        "reward",
        this.few(rewards, 6, (r) =>
          r.kind === "money"
            ? `${Math.floor(r.count / 10000) ? `${Math.floor(r.count / 10000)}g ` : ""}${Math.floor(r.count / 100) % 100}s ${r.count % 100}c`
            : r.kind === "reputation"
              ? `${this.name("faction", r.ref_id) ?? r.ref_id} ${r.count}`
              : r.kind === "spell" || r.kind === "cast"
                ? `${r.kind} ${this.name("spell", r.ref_id) ?? r.ref_id}`
                : `${r.kind === "choice" ? "choice " : ""}${this.item(r.ref_id)}${r.count > 1 ? ` ×${r.count}` : ""}`,
        ),
      );
    const texts = this.all("SELECT locale, field, text FROM quest_text WHERE quest_id = ?", id);
    const obj = texts.find((t) => t.locale === "enUS" && t.field === "objectives");
    if (obj) this.add("text", `"${clip(obj.text, this.full ? 100000 : 200)}"`);
    if (texts.length) {
      const locales = [...new Set(texts.map((t) => t.locale))];
      this.add("texts", `${locales.join(",")}${ALL_LOCALES.some((l) => !locales.includes(l)) ? ` · MISSING ${ALL_LOCALES.filter((l) => !locales.includes(l)).join(",")}` : ""}`);
    }
  }
}

// (a database built before left_out had none)
const hasLeftOut = (d: Database) => !!d.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'left_out'").get();

// an id, or a thing's exact name (any case; English first, then any
// language): several of a name, the one with the most spawns, the others told
export function resolve(d: Database, kind: Kind, key: string): { id: number; others: number[] } | null {
  if (/^\d+$/.test(key)) return { id: Number(key), others: [] };
  const nk = NAME_KIND[kind];
  let ids = (d.query("SELECT DISTINCT id FROM name WHERE kind = ? AND locale = 'enUS' AND name = ? COLLATE NOCASE ORDER BY id").all(nk, key) as Row[]).map((r) => r.id as number);
  if (!ids.length) ids = (d.query("SELECT DISTINCT id FROM name WHERE kind = ? AND name = ? COLLATE NOCASE ORDER BY id").all(nk, key) as Row[]).map((r) => r.id as number);
  if (!ids.length) return null;
  // (what the build left out last: its names alone are kept)
  if (ids.length > 1 && (kind === "npc" || kind === "object" || kind === "quest")) {
    const out = new Set(hasLeftOut(d) ? (d.query("SELECT id FROM left_out WHERE kind = ?").all(nk) as Row[]).map((r) => r.id as number) : []);
    ids.sort((a, b) => Number(out.has(a)) - Number(out.has(b)));
  }
  if (ids.length > 1 && (kind === "npc" || kind === "object")) {
    const sk = kind === "npc" ? "creature" : "object";
    const n = (id: number) => (d.query("SELECT count(*) n FROM spawn WHERE kind = ? AND entity_id = ?").get(sk, id) as Row).n as number;
    const counts = new Map(ids.map((id) => [id, n(id)]));
    ids.sort((a, b) => counts.get(b)! - counts.get(a)! || a - b);
  }
  return { id: ids[0], others: ids.slice(1) };
}

// a thing's card, as lines (40 at most unless full)
export function card(d: Database, kind: Kind, key: string, opts: { full?: boolean } = {}): string[] {
  const found = resolve(d, kind, key);
  if (!found) return [`${kind} "${key}": no such ${NAME_KIND[kind]} (an id, or its exact name)`];
  const c = new Card(d, !!opts.full);
  ({ npc: c.npcCard, object: c.objectCard, place: c.placeCard, item: c.itemCard, quest: c.questCard })[kind].call(c, found.id);
  if (found.others.length) c.lines.splice(1, 0, `also    ${found.others.length} more named so: ${c.few(found.others, 8, String, ", ")}`);
  if (!opts.full && c.lines.length > MAX_LINES) {
    const cut = c.lines.length - (MAX_LINES - 1);
    c.lines = [...c.lines.slice(0, MAX_LINES - 1), `… ${cut} more lines (--full)`];
  }
  return c.lines;
}
