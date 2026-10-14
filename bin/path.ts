// A cached file's path, downloaded first if need be: for the addons' Python
// scripts, which read the files rather than import the kit.
//   bun ../wow-data/bin/path.ts wago <classic|forever> <Table> [locale]
//   bun ../wow-data/bin/path.ts repo <allthethings|questiedb|pfquest|classicdb> <path in the repo>
//   bun ../wow-data/bin/path.ts classicdb
//   bun ../wow-data/bin/path.ts pin <classic|forever|repo name>   the pinned build or commit
import { classicDump, repoFile } from "../src/github";
import { type Game, PINS } from "../src/pins";
import { wagoFile } from "../src/wago";

const [what, a, b, c] = process.argv.slice(2);
if (what === "wago" && a && b) console.log(await wagoFile(a as Game, b, c));
else if (what === "repo" && a && b) console.log(await repoFile(a, b));
else if (what === "classicdb") console.log(await classicDump());
else if (what === "pin" && a) console.log(PINS.builds[a as Game]?.build ?? PINS.repos[a]?.commit ?? "");
else {
  console.error("usage: path.ts wago <game> <Table> [locale] | repo <name> <path> | classicdb | pin <name>");
  process.exit(2);
}
