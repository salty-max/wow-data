// A game's database (PLAN.md, schema.sql): .cache/db/<game>.db, built by
// bin/build.ts from the pinned sources.
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import { CACHE } from "./cache";
import type { Game } from "./pins";

export const dbPath = (game: Game) => path.join(CACHE, "db", `${game}.db`);

// the game's database, read only (built first: bun ../wow-data/bin/build.ts <game>)
export function openDb(game: Game): Database {
  const file = dbPath(game);
  if (!existsSync(file)) throw new Error(`${file}: build it first (bun ../wow-data/bin/build.ts ${game})`);
  return new Database(file, { readonly: true });
}
