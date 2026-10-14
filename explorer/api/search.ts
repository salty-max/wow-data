// Every name in every language, searched as you type: a trigram index of the
// `name` table (SQLite's FTS5, accents folded) kept beside the databases in
// .cache/explorer/<game>-names.db, made again when the game's database is
// newer. Five seconds, once a build.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { CACHE } from "../../src/cache";
import { dbPath } from "../../src/db";
import type { Game } from "../../src/pins";
import { db, metaOf, type Row } from "./db";
import { Namer, type Ref } from "./names";

const indexes = new Map<Game, { db: Database; builtAt: string }>();
const indexPath = (game: Game) => path.join(CACHE, "explorer", `${game}-names.db`);

export function index(game: Game): Database {
  const builtAt = metaOf(db(game), "built_at") ?? "";
  const known = indexes.get(game);
  if (known?.builtAt === builtAt) return known.db;
  known?.db.close();
  const file = indexPath(game);
  if (existsSync(file)) {
    const d = new Database(file, { readonly: true });
    if (metaOf(d, "built_at") === builtAt) {
      indexes.set(game, { db: d, builtAt });
      return d;
    }
    d.close();
  }
  const started = performance.now();
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  rmSync(tmp, { force: true });
  const w = new Database(tmp);
  w.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  w.run(`CREATE VIRTUAL TABLE names USING fts5(name, kind UNINDEXED, id UNINDEXED, locale UNINDEXED,
    tokenize = "trigram remove_diacritics 1")`);
  w.run("ATTACH ? AS g", [dbPath(game)]);
  w.run("INSERT INTO names (name, kind, id, locale) SELECT name, kind, id, locale FROM g.name");
  w.run("INSERT INTO names (name, kind, id, locale) SELECT female, kind, id, locale FROM g.name WHERE female IS NOT NULL AND female != name");
  w.run("INSERT INTO meta VALUES ('built_at', ?)", [builtAt]);
  w.run("DETACH g");
  w.close();
  renameSync(tmp, file);
  console.log(`${game}: names indexed in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  const d = new Database(file, { readonly: true });
  indexes.set(game, { db: d, builtAt });
  return d;
}

// the kinds a page shows first (the rest: the client's own lists)
export const MAIN_KINDS = ["quest", "creature", "item", "object", "area"];
const KIND_ORDER = `CASE kind WHEN 'quest' THEN 0 WHEN 'creature' THEN 0 WHEN 'item' THEN 0 WHEN 'object' THEN 1
  WHEN 'area' THEN 1 WHEN 'spell' THEN 2 ELSE 3 END`;

export type Hit = Ref & { match?: string; matchLocale?: string; byId?: boolean };
export type SearchResult = { hits: Hit[]; counts: Record<string, number>; ms: number };

export function search(game: Game, q: string, opts: { kind?: string; locale: string; limit: number }): SearchResult {
  const started = performance.now();
  const d = db(game);
  const names = new Namer(d, opts.locale);
  const query = q.trim();
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const add = (h: Hit) => {
    const key = `${h.kind}:${h.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(h);
  };

  // an id: whatever has it
  if (/^\d+$/.test(query)) {
    const id = Number(query);
    const tables: [string, string][] = [
      ["quest", "SELECT 1 FROM quest WHERE id = ?"],
      ["creature", "SELECT 1 FROM creature WHERE id = ?"],
      ["item", "SELECT 1 FROM item WHERE id = ?"],
      ["object", "SELECT 1 FROM object WHERE id = ?"],
    ];
    for (const [kind, sql] of tables) if ((!opts.kind || opts.kind === kind) && d.query(sql).get(id)) add({ ...names.ref(kind, id), byId: true });
    const others = d
      .query("SELECT DISTINCT kind FROM name WHERE id = ? AND kind NOT IN ('quest','creature','item','object','creature_subname')")
      .all(id) as Row[];
    for (const r of others) if (!opts.kind || opts.kind === r.kind) add({ ...names.ref(r.kind, id), byId: true });
  }

  const counts: Record<string, number> = {};
  if (query.length > 0) {
    const ix = index(game);
    // (a creature's title finds the creature: "Innkeeper")
    const kindFilter = !opts.kind ? "" : opts.kind === "creature" ? "AND kind IN ('creature', 'creature_subname')" : "AND kind = $kind";
    const params: Record<string, string | number> = { $q: query, $loc: opts.locale, $limit: opts.limit * 8 };
    if (opts.kind && opts.kind !== "creature") params.$kind = opts.kind;
    // three letters or more: the trigrams; fewer: the names that begin so (CJK's two-letter names)
    const where = [...query].length >= 3 ? "names MATCH $m" : "name LIKE $q || '%'";
    if ([...query].length >= 3) params.$m = `"${query.replaceAll('"', '""')}"`;
    const rows = ix
      .query(
        `SELECT kind, id, locale, name FROM names WHERE ${where} ${kindFilter}
         ORDER BY (name = $q COLLATE NOCASE) DESC, (name LIKE $q || '%') DESC, (name LIKE '% ' || $q || '%') DESC,
           ${KIND_ORDER}, (locale = $loc) DESC, (locale = 'enUS') DESC, length(name), id
         LIMIT $limit`,
      )
      .all(params) as Row[];
    for (const r of rows) {
      if (hits.length >= opts.limit) break;
      const ref = names.ref(r.kind === "creature_subname" ? "creature" : r.kind, r.id);
      add({ ...ref, match: r.name, matchLocale: r.locale });
    }
    const countParams = { ...params };
    delete countParams.$limit;
    delete countParams.$loc;
    delete countParams.$kind;
    for (const r of ix
      .query(
        `SELECT CASE kind WHEN 'creature_subname' THEN 'creature' ELSE kind END AS k, count(DISTINCT id) n
         FROM names WHERE ${where} GROUP BY k`,
      )
      .all(countParams) as Row[])
      counts[r.k] = r.n;
  }
  return { hits, counts, ms: Math.round(performance.now() - started) };
}
