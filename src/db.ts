// A game's database (PLAN.md, schema.sql): .cache/db/<game>.db, built by
// bin/build.ts from the pinned sources.
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import { CACHE } from "./cache";
import { databaseTag } from "./dbRelease";
import type { Game } from "./pins";

export const dbPath = (game: Game) => path.join(CACHE, "db", `${game}.db`);

// the game's database, read only (built first: bun ../wow-data/bin/build.ts <game>).
// One built from other inputs than this checkout's (its meta's tag, the
// build's databaseTag) is said once, a script then reading tables the code
// no longer makes; WOW_DATA_STRICT=1 makes it an error.
const told = new Set<Game>();
export function openDb(game: Game): Database {
  const file = dbPath(game);
  if (!existsSync(file)) throw new Error(`${file}: build it first (bun ../wow-data/bin/build.ts ${game})`);
  const db = new Database(file, { readonly: true });
  if (!told.has(game)) {
    told.add(game);
    const stale = staleness(db, game);
    if (stale && process.env.WOW_DATA_STRICT === "1") throw new Error(stale);
    if (stale) console.warn(`wow-data: ${stale}`);
  }
  return db;
}

// Why a database isn't this checkout's, or none (a checkout git can't read: none said).
export function staleness(db: Database, game: Game): string | undefined {
  let want: string;
  try {
    want = databaseTag();
  } catch {
    return undefined;
  }
  const row = db.query("SELECT value FROM meta WHERE key = 'tag'").get() as { value: string } | null;
  const fix = `rebuild it (bun wow-data/bin/build.ts ${game}) or get this checkout's (bun wow-data/bin/get.ts ${game} --tag ${want})`;
  if (!row) return `${game}.db was built before the databases kept their tag: ${fix}`;
  return row.value === want ? undefined : `${game}.db was built at ${row.value}, this checkout is at ${want}: ${fix}`;
}
