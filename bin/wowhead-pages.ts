// Wowhead's pages for what no other source has: Forever's own quests' texts,
// givers, enders, levels and zones (every quest, in English first, then in
// German, French and Spain's Spanish: the databases have no quest's text in
// another language but its objectives), its creatures' title, type, level,
// rank, model and speech, its objects' types, and the books' and plaques' pages in
// every language the databases lack (Spanish, Spain's and Latin America's,
// for none); in English, what Wowhead saw Forever change of a quest, a
// creature or an object (`changed`: the evidence Season of Discovery's need). Wowhead refuses scripts its pages and its own pages won't reach
// localhost (upgrade-insecure-requests), so a Wowhead tab fetches them
// (bin/wowhead-tab.js, its how-to) into its own IndexedDB (a closed tab loses
// nothing: it resumes from what it has) and its pages come here in exported
// batches:
//   bun bin/wowhead-pages.ts queue      the pages to fetch, as id ranges by job
//     (the Forever and Classic databases' gaps, in the tab's order: English
//     first), leaving out every page we have (saved here or frozen): a run
//     fetches only what is new; --keys: the jobs themselves, for the tab's
//     __wd.addJobs; --refresh: every page again, have it or not (Wowhead has
//     no list of what changed: a new build's, the launch's, once), for
//     __wd.addJobs(keys, { refetch: true }). What Wowhead added that no
//     database knows yet, the tab finds itself: __wd.addLatest()
//   bun bin/wowhead-pages.ts pull       the pages the tab handed to Ravenpost's
//     inbox (__wd.relayTo) into .cache/wowhead/forever/pages/, then out of the
//     inbox (WOWHEAD_TOKEN, else ~/.config/wow-data/wowhead-token; WOWHEAD_URL)
//   bun bin/wowhead-pages.ts import FILE   an exported batch ({ "<kind>/<locale>/<id>":
//     page | { missing } }) into .cache/wowhead/forever/pages/
//   bun bin/wowhead-pages.ts freeze     the saved pages into
//     data/wowhead/forever/pages-<locale>.json ({ quest | npc | object |
//     itembook | objbook: { id: page } }), which the build loads
// A hand tool, as bin/names.ts: never run by a job.
// Targeted material work: queue/freeze --kind item --ids 249427,249428
// (or --kind object). The queue defaults to enUS, --locale chooses another.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { CACHE } from "../src/cache";
import { openDb } from "../src/db";
import { compactPage } from "../src/wowheadPages";
import { ROOT } from "../src/pins";

const DIR = path.join(CACHE, "wowhead", "forever", "pages");
const [command, ...rest] = process.argv.slice(2);
type Job = { kind: "quest" | "npc" | "object" | "item" | "itembook" | "objbook"; locale: string; id: number };
const file = (j: Job) => path.join(DIR, j.kind, j.locale, `${j.id}.json`);
const BOOK_LOCALES = ["enUS", "deDE", "frFR", "esES", "esMX"];
function selection(): Job[] | null {
  const option = (name: string) => rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined;
  const kind = option("--kind"), ids = option("--ids"), locale = option("--locale") ?? "enUS";
  if (kind === undefined && ids === undefined) return null;
  if (!kind || !/^(quest|npc|object|item|itembook|objbook)$/.test(kind) || !ids || !BOOK_LOCALES.includes(locale))
    throw new Error("targeted pages need --kind, --ids (comma-separated IDs), and a supported --locale");
  return [...new Set(ids.split(",").map(Number))].sort((a, b) => a - b).map(id => {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`invalid page id: ${id}`);
    return { kind: kind as Job["kind"], locale, id };
  });
}

// The pages we have: saved here (one Wowhead hasn't, as { missing }, too)
// or frozen in data/ (a checkout without the cache).
const frozenOf = new Map<string, Record<string, Record<string, unknown>>>();
function have(kind: string, locale: string): Set<number> {
  const out = new Set<number>();
  const dir = path.join(DIR, kind, locale);
  if (existsSync(dir)) for (const f of readdirSync(dir)) out.add(Number.parseInt(f, 10));
  if (!frozenOf.has(locale)) {
    const f = path.join(ROOT, "data", "wowhead", "forever", `pages-${locale}.json`);
    frozenOf.set(locale, existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});
  }
  for (const id of Object.keys(frozenOf.get(locale)?.[kind] ?? {})) out.add(Number(id));
  return out;
}

function queue(refresh = false): Job[] {
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
  // (a refresh: the gaps and every page Wowhead gave before, which fill
  // them no more once the build has them)
  const jobs = (kind: Job["kind"], locale: string, list: number[], also: Set<number> = new Set()) => {
    const got = new Set([...have(kind, locale), ...also]);
    const ids = refresh ? [...new Set([...list, ...got])].sort((a, b) => a - b) : list.filter((id) => !got.has(id));
    return ids.map((id) => ({ kind, locale, id }) as Job);
  };
  // (a book with no page in a language; Forever's own books, which no
  // database has yet, once Wowhead gave their English: found by hand, 15 Oct;
  // and every item or object with a page the databases have no text of, the
  // Classic database's missing pages and Forever's own books: 61, 15 Oct)
  const books = (locale: string) =>
    (["item", "object"] as const).flatMap((kind) => {
      const book = kind === "item" ? "itembook" : "objbook";
      const all = new Set([
        ...ids(`SELECT id FROM readable WHERE kind = '${kind}' AND removed IS NOT 1`),
        ...ids(`SELECT id FROM ${kind} WHERE page_id > 0 AND removed IS NOT 1`),
        ...have(book, "enUS"),
      ]);
      const pages = (sources: string) =>
        new Set(ids(`SELECT DISTINCT id FROM readable_page WHERE kind = '${kind}' AND locale = '${locale}' AND source ${sources}`));
      const theirs = pages("!= 'wowhead'"); // (the client's, the Classic database's: never Wowhead's to give)
      return jobs(book, locale, [...all].filter((id) => !theirs.has(id)).sort((a, b) => a - b), pages("= 'wowhead'"));
    });
  return [
    ...jobs("quest", "enUS", quests),
    ...jobs("npc", "enUS", npcs),
    ...jobs("object", "enUS", objects),
    ...BOOK_LOCALES.flatMap(books),
    ...["deDE", "frFR", "esES"].flatMap((locale) => jobs("quest", locale, quests)),
  ];
}

/** Pages ({ "<kind>/<locale>/<id>": page }) into the cache; how many. */
function save(batch: Record<string, unknown>): number {
  let n = 0;
  for (const [k, page] of Object.entries(batch)) {
    const [kind, locale, id] = k.split("/");
    if (!/^(quest|npc|object|item|itembook|objbook)$/.test(kind) || !/^[a-z]{2}[A-Z]{2}$/.test(locale) || !/^\d+$/.test(id)) continue;
    const f = file({ kind: kind as Job["kind"], locale, id: Number(id) });
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify(page));
    n++;
  }
  return n;
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
  const targets = selection();
  const jobs = targets ? targets.filter(j => rest.includes("--refresh") || !have(j.kind, j.locale).has(j.id)) : queue(rest.includes("--refresh"));
  if (rest.includes("--keys")) console.log(JSON.stringify(jobs.map((j) => `${j.kind}/${j.locale}/${j.id}`)));
  else {
    const groups: Record<string, number[]> = {};
    for (const j of jobs) (groups[`${j.kind} ${j.locale}`] ??= []).push(j.id);
    console.log(JSON.stringify(Object.fromEntries(Object.entries(groups).map(([g, list]) => [g, ranges(list)]))));
  }
} else if (command === "import") {
  const n = save(JSON.parse(readFileSync(rest[0], "utf8")));
  console.log(`${n} pages saved under ${path.relative(ROOT, DIR)}`);
} else if (command === "pull") {
  const url = (process.env.WOWHEAD_URL ?? "https://ravenpost-inbox.vercel.app").replace(/\/$/, "");
  const tokenFile = path.join(homedir(), ".config", "wow-data", "wowhead-token");
  const token = process.env.WOWHEAD_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");
  if (!token) throw new Error(`no WOWHEAD_TOKEN (nor ${tokenFile})`);
  const call = async (p: string, body?: unknown) => {
    const res = await fetch(url + p, {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${p}: ${res.status} ${await res.text()}`);
    return res.json();
  };
  const names: string[] = [];
  for (let cursor: string | null = ""; cursor !== null; ) {
    const page = (await call(`/api/wowhead/list${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)) as { names: { name: string }[]; cursor: string | null };
    names.push(...page.names.map((n) => n.name));
    cursor = page.cursor;
  }
  let n = 0;
  for (let i = 0; i < names.length; i += 20) {
    const part = names.slice(i, i + 20);
    const { items } = (await call("/api/wowhead/read", { names: part })) as { items: { pages: Record<string, unknown> }[] };
    for (const it of items) n += save(it.pages);
    // (out of the inbox once saved here)
    await call("/api/wowhead/done", { names: part });
  }
  console.log(`${n} pages from ${names.length} hand-overs saved under ${path.relative(ROOT, DIR)}`);
} else if (command === "freeze") {
  // (each page in the build's compact form: the game's own texts, the info
  // box's facts; a page Wowhead hasn't, left out)
  const out: Record<string, Record<string, Record<string, unknown>>> = {};
  // Preserve frozen pages absent from this machine's cache, including when
  // updating just a material's source evidence rather than every page.
  const frozenDir = path.join(ROOT, "data", "wowhead", "forever");
  for (const f of readdirSync(frozenDir).filter(f => /^pages-[a-z]{2}[A-Z]{2}\.json$/.test(f)))
    out[f.slice(6, -5)] = JSON.parse(readFileSync(path.join(frozenDir, f), "utf8"));
  const targets = selection();
  const selected = targets && new Set(targets.map(j => `${j.kind}/${j.locale}/${j.id}`));
  if (existsSync(DIR))
    for (const kind of readdirSync(DIR))
      for (const locale of readdirSync(path.join(DIR, kind)))
        for (const f of readdirSync(path.join(DIR, kind, locale))) {
          if (selected && !selected.has(`${kind}/${locale}/${f.replace(/\.json$/, "")}`)) continue;
          const page = compactPage(kind, locale, JSON.parse(readFileSync(path.join(DIR, kind, locale, f), "utf8")));
          if (!page || !Object.keys(page).length) continue;
          ((out[locale] ??= {})[kind] ??= {})[f.replace(/\.json$/, "")] = page;
        }
  for (const [locale, kinds] of Object.entries(out)) {
    const sorted = Object.fromEntries(
      Object.entries(kinds)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, pages]) => [k, Object.fromEntries(Object.entries(pages).sort((a, b) => Number(a[0]) - Number(b[0])))]),
    );
    const dest = path.join(ROOT, "data", "wowhead", "forever", `pages-${locale}.json`);
    // (one page a line: a day's change reads as lines in a diff)
    const body = Object.entries(sorted)
      .map(([k, pages]) => `${JSON.stringify(k)}:{\n${Object.entries(pages).map(([id, p]) => `${JSON.stringify(id)}:${JSON.stringify(p)}`).join(",\n")}\n}`)
      .join(",\n");
    writeFileSync(dest, `{${body}}\n`);
    console.log(`${path.relative(ROOT, dest)}: ${Object.entries(sorted).map(([k, p]) => `${Object.keys(p).length} ${k}s`).join(", ")}`);
  }
} else {
  console.error("usage: wowhead-pages.ts queue [--keys] [--refresh] [--kind KIND --ids IDS --locale LOCALE] | pull | import FILE | freeze [--kind KIND --ids IDS --locale LOCALE]");
  process.exit(2);
}
