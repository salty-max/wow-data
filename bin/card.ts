// One thing's card, in 40 lines at most (src/card.ts): a creature, an object,
// a place (an area), an item or a quest, by its id or its exact name:
//   bun bin/card.ts <npc|object|place|item|quest> <id or name> [--game classic|forever] [--full]
// (--full: every list whole, no line cap; the databases built first: bin/build.ts)
import { card, KINDS, type Kind } from "../src/card";
import { openDb } from "../src/db";
import type { Game } from "../src/pins";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : (args.splice(i, 2)[1] ?? "");
};
const full = args.includes("--full");
if (full) args.splice(args.indexOf("--full"), 1);
const game = (flag("--game") ?? "classic") as Game;
const [kind, ...rest] = args;
if (!KINDS.includes(kind as Kind) || !rest.length || (game !== "classic" && game !== "forever")) {
  console.error("bun bin/card.ts <npc|object|place|item|quest> <id or exact name> [--game classic|forever] [--full]");
  process.exit(2);
}
const lines = card(openDb(game), kind as Kind, rest.join(" "), { full });
console.log(lines.join("\n"));
if (lines.length === 1 && lines[0].includes(": no such")) process.exit(1);
