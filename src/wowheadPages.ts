import type { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gamePage, gameQuestText } from "./gametext";
import { ROOT } from "./pins";

/**
 * Wowhead's pages of Forever (bin/wowhead-pages.ts, its tab), frozen in
 * data/wowhead/forever/pages-<locale>.json in the compact form below: the
 * texts already the game's own ($N, $B), the info box's facts taken out. The
 * build fills what the other sources lack (they win a fact they have), and
 * adds what only Wowhead knows: Forever's new quests, creatures and objects
 * (its Latest Additions), its own books.
 */
export type QuestPage = {
  title?: string;
  details?: string;
  objectives?: string;
  request?: string;
  reward?: string;
  level?: number;
  min?: number;
  zone?: number; // AreaTable id (the quest log's zone)
  sort?: number; // QuestSort id (a class's, a trade's, a holiday's)
  side?: number; // 1 Alliance, 2 Horde, 3 both
  races?: number;
  classes?: number;
  start?: [Kind, number][];
  end?: [Kind, number][];
};
type Kind = "creature" | "object" | "item";
export type NpcPage = { name?: string; type?: number; family?: number; rank?: number; min?: number; max?: number; model?: number; lines?: [string, string][]; zones?: number[] };
export type ObjectPage = { name?: string; type?: number; zones?: number[] };
export type BookPage = { title?: string; pages: string[] };
export type Frozen = { quest?: Record<string, QuestPage>; npc?: Record<string, NpcPage>; object?: Record<string, ObjectPage>; itembook?: Record<string, BookPage>; objbook?: Record<string, BookPage> };

type Raw = Record<string, unknown> & { info?: Record<string, unknown>; box?: string; quotes?: { kind: string; who?: string; text: string }[]; pages?: string[] };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const positive = (v: unknown) => (num(v) !== undefined && (v as number) > 0 ? (v as number) : undefined);
// (Wowhead's own object categories: herbs, minerals and containers are the
// game's chests, type 3; its quest objects (-2) and others could be any type)
const objectType = (v: unknown) => {
  const t = num(v);
  return t === undefined ? undefined : t >= 0 ? t : [-3, -4, -5].includes(t) ? 3 : undefined;
};
const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length))) as T;
const KINDS: Record<string, Kind> = { npc: "creature", object: "object", item: "item" };
// (the speech's class on the page: s2 says, s1 yells, s3 whispers)
const SPEECH: Record<string, string> = { s2: "say", s1: "yell", s3: "whisper", s4: "emote" };

/** A page as the tab saved it, in the frozen file's form (null: Wowhead has none). */
export function compactPage(kind: string, locale: string, raw: Raw): QuestPage | NpcPage | ObjectPage | BookPage | null {
  if (!raw || raw.missing) return null;
  const info = raw.info ?? {};
  if (kind === "quest") {
    const text = (k: string) => (typeof raw[k] === "string" ? gameQuestText(raw[k] as string) : undefined);
    const who = (role: "start" | "end") =>
      [...(raw.box ?? "").matchAll(new RegExp(`\\[icon name=quest-${role}\\][^\\[]*\\[url=/forever/(npc|object|item)=(\\d+)`, "g"))].map(
        (m) => [KINDS[m[1]], Number(m[2])] as [Kind, number],
      );
    const category = num(info.category);
    return clean({
      title: typeof raw.title === "string" ? raw.title : undefined,
      details: text("details"),
      objectives: text("objectives"),
      request: text("request"),
      reward: text("reward"),
      ...(locale === "enUS" && {
        level: positive(info.level), // (-1: the player's level)
        min: num(info.reqlevel),
        zone: category && category > 0 ? category : undefined,
        sort: category && category < 0 ? -category : undefined,
        side: num(info.side),
        races: num(info.reqrace),
        classes: num(info.reqclass),
        start: who("start"),
        end: who("end"),
      }),
    });
  }
  if (kind === "npc")
    return clean({
      name: typeof info.name === "string" ? info.name : undefined,
      type: positive(info.type), // (0: Wowhead's "uncategorized")
      family: positive(info.family),
      rank: num(info.classification),
      min: num(info.minlevel),
      max: num(info.maxlevel),
      model: num(raw.model),
      lines: (raw.quotes ?? []).filter((q) => SPEECH[q.kind]).map((q) => [SPEECH[q.kind], gameQuestText(q.text)] as [string, string]),
      zones: Array.isArray(info.location) ? (info.location as number[]) : undefined,
    });
  if (kind === "object")
    return clean({ name: typeof info.name === "string" ? info.name : undefined, type: objectType(info.type), zones: Array.isArray(info.location) ? (info.location as number[]) : undefined });
  if (kind === "itembook" || kind === "objbook")
    return raw.pages?.length ? clean({ title: typeof raw.title === "string" ? raw.title : undefined, pages: raw.pages.map(gamePage) }) : null;
  return null;
}

const PLACEHOLDER = /^\s*(<(UNUSED|NYI|TXT|DEPRECATED|PH|TEST)>|\[(DEPRECATED|PH|UNUSED)\]|zz|z?OLD\b)/i;

/** The frozen pages into Forever's database: the gaps of the other sources filled, Wowhead's own added. */
export function wowheadPages(db: Database, game: string, log: (s: string) => void) {
  const dir = path.join(ROOT, "data", "wowhead", game);
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => /^pages-[a-z]{2}[A-Z]{2}\.json$/.test(f));
  // (English first: the rows the other languages' texts hang on)
  files.sort((a, b) => (a.includes("enUS") ? -1 : b.includes("enUS") ? 1 : a.localeCompare(b)));
  for (const f of files) {
    const locale = f.slice(6, -5);
    const pages = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Frozen;
    const n: Record<string, number> = {};
    const count = (k: string, changes: number) => (n[k] = (n[k] ?? 0) + changes);
    db.transaction(() => {
      // ── quests ──
      const newQuest = db.prepare("INSERT OR IGNORE INTO quest (id, level, min_level, zone_id, sort_id, races, classes, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'wowhead')");
      // (a row changed only where a fact fills a gap: the counts say what was filled)
      const fillQuest = db.prepare(
        `UPDATE quest SET level = COALESCE(level, ?1), min_level = COALESCE(min_level, ?2), zone_id = COALESCE(zone_id, ?3), sort_id = COALESCE(sort_id, ?4)
         WHERE id = ?5 AND ((level IS NULL AND ?1 IS NOT NULL) OR (min_level IS NULL AND ?2 IS NOT NULL) OR (zone_id IS NULL AND sort_id IS NULL AND (?3 IS NOT NULL OR ?4 IS NOT NULL)))`,
      );
      const text = db.prepare("INSERT OR IGNORE INTO quest_text VALUES (?, ?, ?, ?, 'wowhead')");
      const name = db.prepare("INSERT OR IGNORE INTO name (kind, id, locale, name, source) VALUES (?, ?, ?, ?, 'wowhead')");
      const hasRole = db.prepare("SELECT 1 FROM quest_relation WHERE quest_id = ? AND role = ? LIMIT 1");
      const relation = db.prepare("INSERT OR IGNORE INTO quest_relation VALUES (?, ?, ?, ?, 'wowhead')");
      for (const [sid, q] of Object.entries(pages.quest ?? {})) {
        const id = Number(sid);
        // (Blizzard's placeholders, which Wowhead lists too: no quest of the game's)
        if (q.title && PLACEHOLDER.test(q.title)) {
          count("placeholders left out", 1);
          continue;
        }
        if (locale === "enUS") {
          count("new quests", newQuest.run(id, q.level ?? null, q.min ?? null, q.zone ?? null, q.sort ?? null, q.races ?? null, q.classes ?? null).changes);
          count("quests filled", fillQuest.run(q.level ?? null, q.min ?? null, q.zone ?? null, q.sort ?? null, id).changes);
          for (const role of ["start", "end"] as const) {
            if (!q[role]?.length || hasRole.get(id, role)) continue;
            for (const [kind, who] of q[role]!) count(`${role} relations`, relation.run(id, role, kind, who).changes);
          }
        }
        if (q.title) count("quest names", name.run("quest", id, locale, q.title).changes);
        for (const field of ["details", "objectives", "request", "reward"] as const) if (q[field]) count("quest texts", text.run(id, locale, field, q[field]).changes);
      }
      // ── creatures ──
      const newNpc = db.prepare("INSERT OR IGNORE INTO creature (id, min_level, max_level, type_id, family_id, rank, display_ids, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'wowhead')");
      const fillNpc = db.prepare(
        `UPDATE creature SET min_level = COALESCE(min_level, ?1), max_level = COALESCE(max_level, ?2), type_id = COALESCE(type_id, ?3), family_id = COALESCE(family_id, ?4), rank = COALESCE(rank, ?5), display_ids = COALESCE(display_ids, ?6)
         WHERE id = ?7 AND ((min_level IS NULL AND ?1 IS NOT NULL) OR (max_level IS NULL AND ?2 IS NOT NULL) OR (type_id IS NULL AND ?3 IS NOT NULL) OR (family_id IS NULL AND ?4 IS NOT NULL) OR (rank IS NULL AND ?5 IS NOT NULL) OR (display_ids IS NULL AND ?6 IS NOT NULL))`,
      );
      const line = db.prepare("INSERT OR IGNORE INTO npc_line (npc_id, locale, kind, text, seen, source) VALUES (?, ?, ?, ?, NULL, 'wowhead')");
      for (const [sid, c] of Object.entries(pages.npc ?? {})) {
        const id = Number(sid);
        const model = c.model ? String(c.model) : null;
        count("new creatures", newNpc.run(id, c.min ?? null, c.max ?? null, c.type ?? null, c.family ?? null, c.rank ?? null, model).changes);
        count("creatures filled", fillNpc.run(c.min ?? null, c.max ?? null, c.type ?? null, c.family ?? null, c.rank ?? null, model, id).changes);
        if (c.name) count("creature names", name.run("creature", id, locale, c.name).changes);
        for (const [kind, said] of c.lines ?? []) count("lines", line.run(id, locale, kind, said).changes);
      }
      // ── objects ──
      const newObject = db.prepare("INSERT OR IGNORE INTO object (id, type, source) VALUES (?, ?, 'wowhead')");
      const fillObject = db.prepare("UPDATE object SET type = COALESCE(type, ?) WHERE id = ? AND type IS NULL");
      for (const [sid, o] of Object.entries(pages.object ?? {})) {
        const id = Number(sid);
        count("new objects", newObject.run(id, o.type ?? null).changes);
        count("objects filled", fillObject.run(o.type ?? null, id).changes);
        if (o.name) count("object names", name.run("object", id, locale, o.name).changes);
      }
      // ── books and plaques ──
      const readable = db.prepare("INSERT OR IGNORE INTO readable VALUES (?, ?, NULL, NULL, 'wowhead')");
      const page = db.prepare("INSERT OR IGNORE INTO readable_page VALUES (?, ?, ?, ?, ?, 'wowhead')");
      for (const [book, kind] of [["itembook", "item"], ["objbook", "object"]] as const)
        for (const [sid, b] of Object.entries(pages[book] ?? {})) {
          const id = Number(sid);
          count("new books", readable.run(kind, id).changes);
          b.pages.forEach((p, i) => count("book pages", page.run(kind, id, locale, i + 1, p).changes));
        }
    })();
    log(`wowhead pages ${locale}: ${Object.entries(n).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing new"}`);
  }
}
