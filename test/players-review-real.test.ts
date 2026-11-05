import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dbPath } from "../src/db";
import { orderProblem, textProblem } from "../src/players-review";

// The game's own text, as a player's copy of it has it ($B a line feed): the
// rules must not drop real words for good (the inbox forgets what a review drops).
for (const game of ["classic", "forever"] as const) {
  test.skipIf(!existsSync(dbPath(game)))(`${game}: the checks pass the game's own names and texts`, () => {
    const db = new Database(dbPath(game), { readonly: true });
    const rows = [
      ...(db.query("SELECT name AS t FROM name WHERE kind IN ('creature', 'quest', 'object', 'creature_subname')").all() as { t: string }[]),
      ...(db.query("SELECT text AS t FROM quest_text").all() as { t: string }[]),
      ...(db.query("SELECT text AS t FROM npc_line").all() as { t: string }[]),
    ];
    const bad = rows
      .map((r) => r.t.replace(/\$B/g, "\n"))
      .map((t) => [t, textProblem(t) ?? orderProblem(t)] as const)
      .filter(([, why]) => why);
    // (a handful of oddities in the data itself are fine: not hundreds)
    expect(bad.length, bad.slice(0, 5).map(([t, w]) => `${w}: ${t.slice(0, 60)}`).join(" | ")).toBeLessThan(rows.length / 1000);
  });
}
