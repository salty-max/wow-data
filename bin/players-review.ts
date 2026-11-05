// The review of players' facts, by the job that merges them (and by hand):
// the day's lines through the hard rejects, the tiers and the size ceiling
// (src/players-review.ts). Strangers' data: nothing here follows a line.
//   bun bin/players-review.ts [--base origin/main] [--head REF] [--apply]
//        [--verify] [--load-test] [--report FILE.md] [--json FILE]
// The head is the working tree (the job, right after `players.ts pull`) or a
// ref (origin/players, to check what a pull request holds). --apply writes the
// cleaned files: dropped lines gone, single-player text moved to held/.
// --verify changes nothing and exits 1 unless the head is exactly what
// --apply would leave (the last look before a merge). --load-test loads the
// result into a copy of each game's database, as the build would.
// The json says `mergeable`, else `stop`: the pull request is left to a hand.
import { Database } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { dbPath, openDb } from "../src/db";
import { type Game, ROOT } from "../src/pins";
import { playerFacts, players } from "../src/players";
import { factsOf, type Facts, MAX_ADDED, type Outcome, review, serialize, summary, TEXT_MIN_SEEN, treeOf } from "../src/players-review";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    base: { type: "string", default: "origin/main" },
    head: { type: "string" },
    apply: { type: "boolean", default: false },
    verify: { type: "boolean", default: false },
    "load-test": { type: "boolean", default: false },
    report: { type: "string" },
    json: { type: "string" },
  },
});
if (values.apply && (values.verify || values.head)) {
  console.error("usage: players-review.ts [--base REF] [--head REF] [--apply | --verify] [--load-test] [--report FILE] [--json FILE]");
  process.exit(2);
}
const git = (...args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const lines = (s: string) => s.split("\n").filter(Boolean);

function treeAt(ref: string) {
  const paths = lines(git("ls-tree", "-r", "--name-only", ref, "--", "data/players"));
  return treeOf(paths, (p) => git("show", `${ref}:${p}`));
}
function treeHere() {
  const walk = (dir: string): string[] =>
    !existsSync(dir) ? [] : readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? walk(path.join(dir, f)) : [path.join(dir, f)]));
  const paths = walk(path.join(ROOT, "data", "players")).map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
  return treeOf(paths, (p) => readFileSync(path.join(ROOT, p), "utf8"));
}

const dbs = new Map<string, Facts | undefined>();
const facts = (game: string) => {
  if (!dbs.has(game)) dbs.set(game, existsSync(dbPath(game as Game)) ? factsOf(openDb(game as Game)) : undefined);
  return dbs.get(game);
};

const base = treeAt(values.base!);
const head = values.head ? treeAt(values.head) : treeHere();
const outcome: Outcome = review(base, head, facts);

// (a pull request touching anything but data/players is left to a hand, whatever it holds)
const outside = values.head
  ? lines(git("diff", "--name-only", `${values.base}...${values.head}`)).filter((f) => !f.startsWith("data/players/"))
  : lines(git("status", "--porcelain", "--untracked-files=all")).map((l) => l.slice(3)).filter((f) => !f.startsWith("data/players/"));
if (outside.length) outcome.stop ??= `it touches files outside data/players: ${outside.slice(0, 5).join(", ")}`;

const files = (m: Map<string, unknown[]>) => [...m].map(([k, v]) => [k, v] as const);
const wanted = new Map<string, string>(); // (path → content the review leaves)
for (const [k, v] of files(outcome.loaded)) wanted.set(`data/players/${k.split("/")[0]}/${k.split("/")[1]}.json`, serialize(v as never));
for (const [k, v] of files(outcome.held)) if (v.length) wanted.set(`data/players/${k.split("/")[0]}/held/${k.split("/")[1]}.json`, serialize(v as never));

if (values.apply) {
  for (const [p, content] of wanted) {
    const file = path.join(ROOT, p);
    mkdirSync(path.dirname(file), { recursive: true });
    if (!existsSync(file) || readFileSync(file, "utf8") !== content) writeFileSync(file, content);
  }
  for (const k of head.held.keys()) {
    const p = `data/players/${k.split("/")[0]}/held/${k.split("/")[1]}.json`;
    if (!wanted.has(p)) rmSync(path.join(ROOT, p), { force: true });
  }
}

// (what the build would do with the result)
if (values["load-test"] && !outcome.stop) {
  for (const game of ["classic", "forever"] as Game[]) {
    if (!existsSync(dbPath(game))) continue;
    try {
      const copy = Database.deserialize(openDb(game).serialize());
      players(copy, playerFacts(game));
    } catch (err) {
      outcome.stop = `the build would stop on the ${game} facts: ${String(err).slice(0, 120)}`;
    }
  }
}

let drift = false;
if (values.verify) {
  const have = new Map<string, string>();
  const at = values.head ?? "";
  for (const [k] of files(head.loaded)) {
    const p = `data/players/${k.split("/")[0]}/${k.split("/")[1]}.json`;
    have.set(p, at ? git("show", `${at}:${p}`) : readFileSync(path.join(ROOT, p), "utf8"));
  }
  for (const [k] of files(head.held)) {
    const p = `data/players/${k.split("/")[0]}/held/${k.split("/")[1]}.json`;
    have.set(p, at ? git("show", `${at}:${p}`) : readFileSync(path.join(ROOT, p), "utf8"));
  }
  for (const [p, content] of wanted) if (have.get(p) !== content) drift = true;
  for (const p of have.keys()) if (!wanted.has(p)) drift = true;
}

const text = summary(outcome);
if (values.report) {
  mkdirSync(path.dirname(values.report), { recursive: true });
  writeFileSync(values.report, `${text.join("\n")}\n`);
}
const count = (what: string) => Object.values(outcome.counts).reduce((n, c) => n + (c[what] ?? 0), 0);
const result = {
  mergeable: !outcome.stop,
  stop: outcome.stop ?? null,
  added: outcome.added,
  maxAdded: MAX_ADDED,
  textMinSeen: TEXT_MIN_SEEN,
  mechanical: count("mechanical"),
  morePlayers: count("more players"),
  textIn: outcome.promoted.length,
  textHeld: outcome.holding.length,
  rejected: outcome.rejected.length,
  told: outcome.told,
  // (counts only, never a stranger's words: this goes to the owner's phone)
  headline: `${outcome.added} lines: ${count("mechanical")} facts and ${outcome.promoted.length} texts in, ${outcome.holding.length} texts held for a second player, ${outcome.rejected.length} dropped.`,
};
if (values.json) {
  mkdirSync(path.dirname(values.json), { recursive: true });
  writeFileSync(values.json, `${JSON.stringify(result, null, 2)}\n`);
}
console.log(text.join("\n"));
if (values.verify && (drift || outcome.rejected.length || outcome.stop)) {
  console.error(`verify: ${drift ? "the head is not what the review leaves" : outcome.stop ? outcome.stop : "the head holds lines the review drops"}`);
  process.exit(1);
}
