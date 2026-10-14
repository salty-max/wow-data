// Players' facts pulled from hearthtale.app into data/players/<game>.json,
// which the build loads (src/players.ts): what the game told the players who
// said yes to the addons' opt-in, sent there by Ravenpost.
//   OBSERVATIONS_TOKEN=… bun bin/players.ts [classic|forever|all]
// HEARTHTALE_SERVER moves the site (http://localhost:3002 for a local one).
// Every fact each time, in a steady order: the file changes only when the
// facts do. Run daily by .github/workflows/players.yml (a pull request).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchRetry } from "../src/fetch";
import { type Game, ROOT } from "../src/pins";
import type { PlayerFact } from "../src/players";

const server = (process.env.HEARTHTALE_SERVER ?? "https://hearthtale.app").replace(/\/$/, "");
const token = process.env.OBSERVATIONS_TOKEN;
if (!token) {
  console.error("OBSERVATIONS_TOKEN: the site's export token");
  process.exit(2);
}
const which = process.argv[2] ?? "all";
const games: Game[] = which === "all" ? ["classic", "forever"] : [which as Game];

type Row = { locale: string; kind: string; entity: string; field: string; value: string; build: string | null; seen: number };
const order = (a: PlayerFact, b: PlayerFact) => {
  for (const i of [1, 2, 3, 0, 4] as const) {
    const x = i === 2 ? Number(a[i].replace(/^\D+/, "")) - Number(b[i].replace(/^\D+/, "")) : 0;
    if (x) return x;
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

for (const game of games) {
  const res = await fetchRetry(`${server}/api/observations/export?game=${game}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${game}: the site answered ${res.status}`);
  const { facts } = (await res.json()) as { facts: Row[] };
  const out: PlayerFact[] = facts.map((r) => [r.locale, r.kind, r.entity, r.field, r.value, r.build, Number(r.seen)]);
  out.sort(order);
  const dest = path.join(ROOT, "data", "players", `${game}.json`);
  mkdirSync(path.dirname(dest), { recursive: true });
  // (a fact a line: a pull request's diff reads)
  writeFileSync(dest, `{"facts":[\n${out.map((f) => JSON.stringify(f)).join(",\n")}\n]}\n`);
  console.log(`${path.relative(ROOT, dest)}: ${out.length} facts`);
}
