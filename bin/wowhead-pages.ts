// Wowhead's pages for what no other source has: Forever's own quests' texts,
// givers, enders, levels and zones (every quest, in English first, then in
// German, French and Spain's Spanish: the databases have no quest's text in
// another language but its objectives), its creatures' type, level, rank,
// model and speech, its objects' types, and the books' and plaques' pages in
// every language the databases lack (Spanish, Spain's and Latin America's,
// for none). Wowhead refuses scripts its pages and its own pages won't reach
// localhost (upgrade-insecure-requests), so a Wowhead tab fetches them
// (bin/wowhead-tab.js, its how-to) into its own IndexedDB (a closed tab loses
// nothing: it resumes from what it has) and its pages come here in exported
// batches:
//   bun bin/wowhead-pages.ts queue      the pages to fetch, as id ranges by job
//     (the Forever and Classic databases' gaps, in the tab's order: English
//     first); --keys: the jobs themselves, for the tab's __wd.addJobs
//   bun bin/wowhead-pages.ts import FILE   an exported batch ({ "<kind>/<locale>/<id>":
//     page | { missing } }) into .cache/wowhead/forever/pages/
//   bun bin/wowhead-pages.ts freeze     the saved pages into
//     data/wowhead/forever/pages-<locale>.json ({ quest | npc | object |
//     itembook | objbook: { id: page } }), which the build loads
// A hand tool, as bin/names.ts: never run by a job.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CACHE } from "../src/cache";
import { openDb } from "../src/db";
import { ROOT } from "../src/pins";

const DIR = path.join(CACHE, "wowhead", "forever", "pages");
const [command, ...rest] = process.argv.slice(2);
type Job = { kind: "quest" | "npc" | "object" | "itembook" | "objbook"; locale: string; id: number };
const file = (j: Job) => path.join(DIR, j.kind, j.locale, `${j.id}.json`);
const BOOK_LOCALES = ["enUS", "deDE", "frFR", "esES", "esMX"];

function queue(): Job[] {
  const ids = (sql: string) => {
    const out = new Set<number>();
    for (const game of ["forever", "classic"] as const)
      for (const r of openDb(game).query(sql).all() as { id: number }[]) out.add(r.id);
    return [...out].sort((a, b) => a - b);
  };
  const quests = ids("SELECT id FROM quest WHERE removed IS NOT 1");
  const npcs = ids(
    "SELECT id FROM creature WHERE removed IS NOT 1 AND (type_id IS NULL OR min_level IS NULL OR display_ids IS NULL OR rank IS NULL)",
  );
  const objects = ids("SELECT id FROM object WHERE removed IS NOT 1 AND type IS NULL");
  // (a book with no page in a language; Forever's own books, which no
  // database has yet, once Wowhead gave their English: found by hand, 15 Oct)
  const saved = (kind: string, locale: string) =>
    existsSync(path.join(DIR, kind, locale)) ? readdirSync(path.join(DIR, kind, locale)).map((f) => Number.parseInt(f, 10)) : [];
  const books = (locale: string) =>
    (["item", "object"] as const).flatMap((kind) => {
      const book = kind === "item" ? "itembook" : "objbook";
      const all = new Set([
        ...ids(`SELECT id FROM readable WHERE kind = '${kind}' AND removed IS NOT 1`),
        ...saved(book, "enUS"),
      ]);
      const have = new Set([
        ...ids(`SELECT DISTINCT id FROM readable_page WHERE kind = '${kind}' AND locale = '${locale}'`),
        ...saved(book, locale),
      ]);
      return [...all].filter((id) => !have.has(id)).sort((a, b) => a - b).map((id) => ({ kind: book, locale, id }) as Job);
    });
  return [
    ...quests.map((id) => ({ kind: "quest", locale: "enUS", id }) as Job),
    ...npcs.map((id) => ({ kind: "npc", locale: "enUS", id }) as Job),
    ...objects.map((id) => ({ kind: "object", locale: "enUS", id }) as Job),
    ...BOOK_LOCALES.flatMap(books),
    ...["deDE", "frFR", "esES"].flatMap((locale) => quests.map((id) => ({ kind: "quest", locale, id }) as Job)),
  ];
}

const ranges = (ids: number[]) => {
  const out: string[] = [];
  for (let i = 0; i < ids.length; ) {
    let j = i;
    while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) j++;
    out.push(i === j ? `${ids[i]}` : `${ids[i]}-${ids[j]}`);
    i = j + 1;
  }
  return out.join(",");
};
if (command === "queue") {
  const jobs = queue();
  if (rest.includes("--keys")) console.log(JSON.stringify(jobs.map((j) => `${j.kind}/${j.locale}/${j.id}`)));
  else {
    const groups: Record<string, number[]> = {};
    for (const j of jobs) (groups[`${j.kind} ${j.locale}`] ??= []).push(j.id);
    console.log(JSON.stringify(Object.fromEntries(Object.entries(groups).map(([g, list]) => [g, ranges(list)]))));
  }
} else if (command === "import") {
  const batch: Record<string, unknown> = JSON.parse(readFileSync(rest[0], "utf8"));
  let n = 0;
  for (const [k, page] of Object.entries(batch)) {
    const [kind, locale, id] = k.split("/");
    const f = file({ kind: kind as Job["kind"], locale, id: Number(id) });
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify(page));
    n++;
  }
  console.log(`${n} pages saved under ${path.relative(ROOT, DIR)}`);
} else if (command === "freeze") {
  const out: Record<string, Record<string, Record<string, unknown>>> = {};
  if (existsSync(DIR))
    for (const kind of readdirSync(DIR))
      for (const locale of readdirSync(path.join(DIR, kind)))
        for (const f of readdirSync(path.join(DIR, kind, locale))) {
          const page = JSON.parse(readFileSync(path.join(DIR, kind, locale, f), "utf8"));
          if (page.missing) continue;
          ((out[locale] ??= {})[kind] ??= {})[f.replace(/\.json$/, "")] = page;
        }
  for (const [locale, kinds] of Object.entries(out)) {
    const sorted = Object.fromEntries(
      Object.entries(kinds).map(([k, pages]) => [k, Object.fromEntries(Object.entries(pages).sort((a, b) => Number(a[0]) - Number(b[0])))]),
    );
    const dest = path.join(ROOT, "data", "wowhead", "forever", `pages-${locale}.json`);
    writeFileSync(dest, JSON.stringify(sorted));
    console.log(`${path.relative(ROOT, dest)}: ${Object.entries(sorted).map(([k, p]) => `${Object.keys(p).length} ${k}s`).join(", ")}`);
  }
} else {
  console.error("usage: wowhead-pages.ts queue [--keys] | import FILE | freeze");
  process.exit(2);
}
