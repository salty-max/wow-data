// What Forever's nine live trait trees (talents) gained, lost or moved between two
// builds of the client's tables, node by node (docs/forever-missing-talents.md):
//   bun bin/tree-diff.ts FROM [TO]       two builds, e.g. 1.60.1.70755 against the pin (default TO)
// FROM must be a build already cached while it was current (the pinned one is): wago.tools
// answers an older build with the current one's tables, so the script warns when FROM's files
// equal TO's byte for byte.
// A build's tables are downloaded once into .cache/wago/forever/<build>/ (the pinned
// one is there already). Also tells the talents the launch notes name, so the
// morning after a pins pull request says in one screen whether they came.
import { readFileSync } from "node:fs";
import path from "node:path";
import { cached, CACHE } from "../src/cache";
import { csv } from "../src/csv";
import { PINS, wagoQuery } from "../src/pins";

const TABLES = ["SkillLineXTraitTree", "TraitNode", "TraitNodeEntry", "TraitDefinition", "TraitNodeXTraitNodeEntry", "SpellName"];
// talents that guides and Blizzard's 2 November notes name and the 70755 tables lack
const WANTED = [
  "Reckless Swings", "Shank", "Poised", "Blood Splatter", "Flash of Steel", "Composure", "Quick Getaway",
  "Boot Knife", "Death Mark", "Coup de Grace", "Efficient Strikes", "Improved Whirlwind",
];
const GONE = ["Murder", "Improved Distract", "Quietus", "Cutthroat", "Thousand Cuts"];

const [from = "", to = PINS.builds.forever.build] = process.argv.slice(2);
const pinned = PINS.builds.forever.build;
const builds = [from, to];
if (!from) {
  console.log(`usage: bun bin/tree-diff.ts FROM [TO]   (TO defaults to the pin, ${pinned})`);
  process.exit(1);
}

type Node = { tree: string; x: string; y: string; spells: string[]; ranks: string[] };
async function snapshot(build: string) {
  const t: Record<string, Record<string, string>[]> = {};
  for (const table of TABLES) {
    const file = await cached(`https://wago.tools/db2/${table}/csv?${wagoQuery({ ...PINS.builds.forever, build })}`, `wago/forever/${build}/${table}-enUS.csv`);
    t[table] = csv(readFileSync(file, "utf8"));
  }
  const live = new Set(t.SkillLineXTraitTree.map((r) => r.TraitTreeID));
  const names = new Map(t.SpellName.map((r) => [r.ID, r.Name_lang]));
  const spellOf = new Map(t.TraitDefinition.map((r) => [r.ID, r.SpellID]));
  const entry = new Map(t.TraitNodeEntry.map((r) => [r.ID, r]));
  const entriesOf = new Map<string, string[]>();
  for (const r of t.TraitNodeXTraitNodeEntry) entriesOf.set(r.TraitNodeID, [...(entriesOf.get(r.TraitNodeID) ?? []), r.TraitNodeEntryID]);
  const nodes = new Map<string, Node>();
  for (const n of t.TraitNode) {
    if (!live.has(n.TraitTreeID)) continue;
    const es = (entriesOf.get(n.ID) ?? []).map((id) => entry.get(id)!);
    nodes.set(n.ID, { tree: n.TraitTreeID, x: n.PosX, y: n.PosY, spells: es.map((e) => spellOf.get(e.TraitDefinitionID)!), ranks: es.map((e) => e.MaxRanks) });
  }
  return { nodes, names };
}
const label = (s: { names: Map<string, string> }, n: Node) => n.spells.map((id) => `${s.names.get(id) ?? "?"} (${id})`).join(" / ");

const [a, b] = [await snapshot(builds[0]), await snapshot(builds.at(-1)!)];
const file = (build: string) => readFileSync(path.join(CACHE, `wago/forever/${build}/TraitNode-enUS.csv`), "utf8");
if (builds[0] !== builds[1] && file(builds[0]) === file(builds[1]))
  console.log("warning: the two builds' TraitNode files are byte for byte the same: either nothing moved or wago.tools served one build twice (it does for builds that are no longer current)");
console.log(`${builds[0]}: ${a.nodes.size} nodes in the live trees; ${builds.at(-1)}: ${b.nodes.size}`);
let diffs = 0;
for (const [id, n] of b.nodes) {
  const old = a.nodes.get(id);
  if (!old) console.log(`  + node ${id} tree ${n.tree} at ${n.x},${n.y}: ${label(b, n)} x${n.ranks}`);
  else if (JSON.stringify(old) !== JSON.stringify(n)) console.log(`  ~ node ${id} tree ${n.tree}: ${label(a, old)} x${old.ranks} at ${old.x},${old.y} -> ${label(b, n)} x${n.ranks} at ${n.x},${n.y}`);
  else continue;
  diffs++;
}
for (const [id, n] of a.nodes) if (!b.nodes.has(id)) (console.log(`  - node ${id} tree ${n.tree}: ${label(a, n)}`), diffs++);
if (!diffs) console.log("  the nine trees are node for node the same");

const inTree = (s: Awaited<ReturnType<typeof snapshot>>, name: string) => [...s.nodes.values()].some((n) => n.spells.some((id) => s.names.get(id) === name));
console.log(`the talents the notes name, in a live tree at ${builds.at(-1)}:`);
for (const name of WANTED) console.log(`  ${inTree(b, name) ? "yes" : "NO "}  ${name}`);
console.log(`the talents the notes remove, still in a live tree:`);
for (const name of GONE) console.log(`  ${inTree(b, name) ? "still" : "gone "}  ${name}`);
if (builds.at(-1) === pinned) console.log(`(the pin is ${pinned}: a build newer than it is for bin/latest.ts and the pins pull request to bring)`);
