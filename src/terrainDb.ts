// The ground's database (terrain.sql): <game>-terrain.db beside the game's,
// built by bin/terrain.ts from src/terrain.ts' tiles, read by openTerrain.
// Its meta names the pin, the parsers (terrain.ts' and wmoGroups.ts' hashes) and the schema
// (terrain.sql's hash) it was made with.
import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CACHE } from "./cache";
import { type Game, PINS, ROOT } from "./pins";
import { PARSER, TERRAIN_MAPS, terrain } from "./terrain";
import { GROUPS_PARSER, wmoGroups } from "./wmoGroups";

const SCHEMA = path.join(ROOT, "terrain.sql");
const schemaHash = () => Bun.hash(readFileSync(SCHEMA)).toString(16).slice(0, 8);
// the ground's database: <game>-terrain.db beside the game's
export const terrainPath = (game: Game) => path.join(CACHE, "db", `${game}-terrain.db`);

// build it into file (bin/terrain.ts writes it aside, then puts it in place)
export async function buildTerrain(game: Game, file: string, log: (s: string) => void) {
  if (!TERRAIN_MAPS[game]) throw new Error(`no ground is built for ${game} (TERRAIN_MAPS)`);
  const db = new Database(file, { create: true });
  db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;");
  db.exec(readFileSync(SCHEMA, "utf8"));
  const meta = db.prepare("INSERT INTO meta VALUES (?, ?)");
  meta.run("game", game);
  meta.run("build", PINS.builds[game].build);
  meta.run("parser", PARSER);
  meta.run("groups", GROUPS_PARSER);
  meta.run("schema", schemaHash());
  meta.run("built_at", new Date().toISOString());
  await terrain(db, game, log);
  await wmoGroups(db, game, log);
  db.exec("ANALYZE");
  db.close();
}

// the ground's database, read only; one read at another pin, by another
// parser or with another schema is said once (WOW_DATA_STRICT=1: an error)
const toldTerrain = new Set<Game>();
export function openTerrain(game: Game): Database {
  const file = terrainPath(game);
  if (!existsSync(file)) throw new Error(`${file}: build it first (bun wow-data/bin/terrain.ts ${game})`);
  const db = new Database(file, { readonly: true });
  const meta = Object.fromEntries((db.query("SELECT key, value FROM meta").all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const stale =
    meta.build !== PINS.builds[game].build ? `read at ${meta.build}, the pin is ${PINS.builds[game].build}`
    : meta.parser !== PARSER ? "read by another src/terrain.ts"
    : meta.groups !== GROUPS_PARSER ? "read by another src/wmoGroups.ts"
    : meta.schema !== schemaHash() ? "made with another terrain.sql" : null;
  if (stale) {
    const said = `${game}-terrain.db was ${stale}: rebuild it (bun wow-data/bin/terrain.ts ${game})`;
    if (process.env.WOW_DATA_STRICT === "1") throw new Error(said);
    if (!toldTerrain.has(game)) console.warn(`wow-data: ${said}`);
    toldTerrain.add(game);
  }
  return db;
}
