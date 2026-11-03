// The class guide's coverage for every class and tree, as Markdown (src/coverage.ts):
//   bun bin/coverage.ts [classic|forever]   (both when none; the databases built first)
import { classCoverage, treeCoverage } from "../src/coverage";
import { openDb } from "../src/db";
import type { Game } from "../src/pins";

const games: Game[] = process.argv[2] ? [process.argv[2] as Game] : ["classic", "forever"];
for (const game of games) {
  const db = openDb(game);
  console.log(`### ${game}\n`);
  console.log("| Class | Races | Spells (no runes) | Trainer | Quest | Talent | Start | Other | Level | Named | In spell_info | Icon | Text whole | Text open | Trainer rows | Talents | Ranks | Prereqs (no rank) | New | Moved | Talents in spell_info |");
  console.log("|" + "---|".repeat(21));
  for (const c of classCoverage(db)) {
    const s = c.spells;
    const t = c.talents;
    console.log(`| ${c.name} | ${c.races} | ${s.total} | ${s.trainer} | ${s.quest} | ${s.talent} | ${s.start} | ${s.other} | ${s.with_level} | ${s.named} | ${s.with_info} | ${s.with_icon} | ${s.text_complete} | ${s.text_open} | ${s.with_trainer} | ${t.total} | ${t.rank_spells} | ${t.prereqs} (${t.prereqs_no_rank}) | ${t.new} | ${t.moved} | ${t.with_info} |`);
  }
  console.log("\n| Class | Tree | Talents | Rows | Points | New | Moved | Prereqs |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const r of treeCoverage(db)) console.log(`| ${r.class_name} | ${r.tree} (${r.tab_id}) | ${r.talents} | ${r.rows} | ${r.points} | ${r.new} | ${r.moved} | ${r.prereqs} |`);
  console.log();
}
