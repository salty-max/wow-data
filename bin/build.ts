// A game's database from the pinned sources (PLAN.md, schema.sql):
//   bun bin/build.ts classic | forever | all
// into .cache/db/<game>.db (written aside, then put in place).
import { mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { build } from "../src/build";
import { dbPath } from "../src/db";
import type { Game } from "../src/pins";

const arg = process.argv[2] ?? "all";
const games: Game[] = arg === "all" ? ["classic", "forever"] : [arg as Game];
for (const game of games) {
  if (game !== "classic" && game !== "forever") throw new Error(`no game ${game}`);
  const file = dbPath(game);
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.building`;
  rmSync(temp, { force: true });
  const t0 = performance.now();
  await build(game, temp);
  renameSync(temp, file);
  console.log(`✓ ${file} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}
