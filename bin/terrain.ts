// The ground's database from the map files (terrain.sql, src/terrain.ts):
//   bun bin/terrain.ts classic
// into .cache/db/<game>-terrain.db (written aside, then put in place). Never
// run by a job, never released: geoguessr's picker reads it.
import { renameSync, rmSync } from "node:fs";
import { buildTerrain, terrainPath } from "../src/terrainDb";
import type { Game } from "../src/pins";

const game = (process.argv[2] ?? "classic") as Game;
const file = terrainPath(game);
const temp = `${file}.building`;
rmSync(temp, { force: true });
const t0 = performance.now();
await buildTerrain(game, temp, (s) => console.log(`  ${s}`));
renameSync(temp, file);
console.log(`✓ ${file} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
