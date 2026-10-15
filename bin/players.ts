// Players' facts: Ravenpost's inbox (salty-max/ravenpost, inbox/: what the game told the
// players who said yes to the addons' opt-in, sent by Ravenpost) merged into
// data/players/<game>/<locale>.json, which the build loads (src/players.ts).
//   bun bin/players.ts pull [classic|forever|all]   merge the inbox's uploads
//   bun bin/players.ts done                          out of the inbox, once merged
// INBOX_URL: Ravenpost's inbox (https://ravenpost-inbox.vercel.app, or
// http://localhost:3003 for a local one);
// INBOX_TOKEN: its token for wow-data. Run daily by
// .github/workflows/players.yml: pull, a pull request, then done.
//
// A file: { facts: [[kind, entity, field, value, build, [who…]], …] }, a fact
// a line in a steady order. `who`: who saw it, each a hash of the sharer and
// the fact (no one's facts can be tied together), 20 at most: the build counts
// them to choose between values players disagree on.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchRetry } from "../src/fetch";
import { CACHE } from "../src/cache";
import { type Game, ROOT } from "../src/pins";

const server = (process.env.INBOX_URL ?? "").replace(/\/$/, "");
const token = process.env.INBOX_TOKEN;
const MERGED = path.join(CACHE, "players-merged.json"); // (the uploads merged, for `done`)
const KEEP = 20;
const BATCH_BYTES = 3_000_000;

type Line = [kind: string, entity: string, field: string, value: string, build: string | null, who: string[]];
type Upload = { name: string; who: string; facts: [string, string, string, string, string, string | null][] };

async function api<T>(p: string, body?: unknown): Promise<T> {
  const res = await fetchRetry(`${server}${p}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${p}: the inbox answered ${res.status}`);
  return (await res.json()) as T;
}

const dir = (game: Game) => path.join(ROOT, "data", "players", game);
const keyOf = (l: Line) => `${l[0]}\u0000${l[1]}\u0000${l[2]}\u0000${l[3]}`;
const entityOrder = (s: string) => Number(s.replace(/^\D+/, ""));
const order = (a: Line, b: Line) =>
  a[0].localeCompare(b[0]) || entityOrder(a[1]) - entityOrder(b[1]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0);

/** A game's facts as the repository has them, by language. */
function load(game: Game): Map<string, Map<string, Line>> {
  const out = new Map<string, Map<string, Line>>();
  if (!existsSync(dir(game))) return out;
  for (const f of readdirSync(dir(game)).filter((f) => /^[a-z]{2}[A-Z]{2}\.json$/.test(f))) {
    const { facts } = JSON.parse(readFileSync(path.join(dir(game), f), "utf8")) as { facts: Line[] };
    out.set(f.slice(0, -5), new Map(facts.map((l) => [keyOf(l), l])));
  }
  return out;
}

function save(game: Game, byLocale: Map<string, Map<string, Line>>) {
  mkdirSync(dir(game), { recursive: true });
  for (const [locale, lines] of byLocale) {
    const sorted = [...lines.values()].sort(order);
    writeFileSync(path.join(dir(game), `${locale}.json`), `{"facts":[\n${sorted.map((l) => JSON.stringify(l)).join(",\n")}\n]}\n`);
    console.log(`${path.relative(ROOT, dir(game))}/${locale}.json: ${sorted.length} facts`);
  }
}

async function pull(game: Game): Promise<{ names: string[]; newFacts: number }> {
  const listed: { name: string; size: number }[] = [];
  for (let cursor: string | null = ""; cursor !== null; ) {
    const page: { names: { name: string; size: number }[]; cursor: string | null } = await api(
      `/api/inbox/list?game=${game}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    listed.push(...page.names);
    cursor = page.cursor;
  }
  const byLocale = load(game);
  let added = 0;
  for (let i = 0; i < listed.length; ) {
    const batch: string[] = [];
    let bytes = 0;
    while (i < listed.length && batch.length < 200 && (!batch.length || bytes + listed[i].size <= BATCH_BYTES)) {
      bytes += listed[i].size;
      batch.push(listed[i++].name);
    }
    const { items } = await api<{ items: Upload[] }>("/api/inbox/read", { names: batch });
    for (const u of items)
      for (const [locale, kind, entity, field, value, build] of u.facts) {
        const lines = byLocale.get(locale) ?? new Map<string, Line>();
        byLocale.set(locale, lines);
        const line: Line = [kind, entity, field, value, build, []];
        const key = keyOf(line);
        const have = lines.get(key) ?? (added++, lines.set(key, line), line);
        const who = createHash("sha256").update(`${u.who}|${locale}|${key}`).digest("hex").slice(0, 8);
        if (!have[5].includes(who) && have[5].length < KEEP) have[5].push(who);
        if (build && (!have[4] || Number(build) > Number(have[4]))) have[4] = build;
      }
  }
  if (listed.length) save(game, byLocale);
  console.log(`${game}: ${listed.length} uploads, ${added} new facts`);
  return { names: listed.map((l) => l.name), newFacts: added };
}

const [command, which = "all"] = process.argv.slice(2);
if (!server || !token) {
  console.error("INBOX_URL and INBOX_TOKEN: Ravenpost's inbox and its token for wow-data");
  process.exit(2);
}
if (command === "pull") {
  const merged: string[] = [];
  const numbers: Record<string, { uploads: number; newFacts: number }> = {};
  for (const game of (which === "all" ? ["classic", "forever"] : [which]) as Game[]) {
    const { names, newFacts } = await pull(game);
    merged.push(...names);
    numbers[game] = { uploads: names.length, newFacts };
  }
  mkdirSync(path.dirname(MERGED), { recursive: true });
  writeFileSync(MERGED, JSON.stringify(merged));
  // (the day's merge, for Ravenpost's dashboard)
  await api("/api/inbox/stats", { days: { [new Date().toISOString().slice(0, 10)]: { merged: numbers } } });
} else if (command === "done") {
  const merged = existsSync(MERGED) ? (JSON.parse(readFileSync(MERGED, "utf8")) as string[]) : [];
  let removed = 0;
  for (let i = 0; i < merged.length; i += 500) removed += (await api<{ removed: number }>("/api/inbox/done", { names: merged.slice(i, i + 500) })).removed;
  writeFileSync(MERGED, "[]");
  console.log(`${removed} uploads out of the inbox`);
} else {
  console.error("usage: players.ts pull [classic|forever|all] | done");
  process.exit(2);
}
