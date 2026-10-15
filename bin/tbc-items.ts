// The TBC Anniversary client's names of the items given, in every language
// (its ItemSparse on wago.tools), frozen in data/tbc/items.json: { product,
// build, items: { id: { locale: name } } }. For what an addon's TBC
// Anniversary package names and neither Classic Era's nor Forever's client
// has (Second Wind's tools: TBC's own potions, bandages, medallions); the
// build gives them to Classic Era's database (the TBC packages read Classic
// Era's files), source tbc, where it names no such item. A hand tool, run
// when an addon needs another such item, never by a job:
//   bun bin/tbc-items.ts 31676,23822,...      (adds to the file)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cached } from "../src/cache";
import { csv } from "../src/csv";
import { ROOT } from "../src/pins";
import { LOCALES } from "../src/wago";

const BUILD = { product: "wow_anniversary", build: "2.5.6.70006" };
const ids = (process.argv[2] ?? "").split(",").map(Number).filter((n) => n > 0);
if (!ids.length) {
  console.error("usage: bun bin/tbc-items.ts <item id>,<item id>,...");
  process.exit(2);
}
const file = path.join(ROOT, "data", "tbc", "items.json");
const out: { product: string; build: string; items: Record<string, Record<string, string>> } = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8"))
  : { ...BUILD, items: {} };
if (out.build !== BUILD.build) throw new Error(`data/tbc/items.json is of build ${out.build}: fetch them all again at ${BUILD.build}`);
const wanted = new Set(ids.map(String));
for (const locale of ["enUS", ...LOCALES]) {
  const loc = locale === "enUS" ? "" : `&locale=${locale}`;
  const csvFile = await cached(
    `https://wago.tools/db2/ItemSparse/csv?product=${BUILD.product}&build=${BUILD.build}${loc}`,
    `wago/tbc/${BUILD.build}/ItemSparse-${locale}.csv`,
  );
  let n = 0;
  for (const r of csv(readFileSync(csvFile, "utf8"))) {
    if (!wanted.has(r.ID) || !r.Display_lang) continue;
    (out.items[r.ID] ??= {})[locale] = r.Display_lang.trim();
    n++;
  }
  console.log(`${locale}: ${n} of ${ids.length}`);
}
out.items = Object.fromEntries(Object.entries(out.items).sort(([a], [b]) => Number(a) - Number(b)));
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
console.log(`data/tbc/items.json: ${Object.keys(out.items).length} items`);
