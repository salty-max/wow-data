// Where Wowhead places a creature or an object, by zone, frozen into
// data/wowhead/<game>/points.json ({ npc | object: { id: { area id: [[x, y],
// ...] } } }, percent of the zone's map, in Wowhead's order): its players'
// sightings, which no other source keeps (a roaming rare's haunts, a book's
// copies by zone). The build loads them into `spawn` (source wowhead). A hand
// tool, as bin/names.ts: run when an addon needs a thing's points, never by a
// job.
//   bun bin/wowhead-points.ts <classic|forever> --seed DIR...   an addon's
//     cached pages (page-object-<id>.html: every copy, by zone, from a
//     browser: Wowhead refuses scripts its pages) and tooltips (<kind>-<id>.json,
//     forever-<kind>-<id>.json for Forever: one zone's points)
//   bun bin/wowhead-points.ts <classic|forever> --fetch npc:<id>,object:<id>...
//     tooltips fetched (cached in .cache/wowhead/<game>/points/)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CACHE } from "../src/cache";
import { fetchRetry } from "../src/fetch";
import { type Game, ROOT } from "../src/pins";

type Points = Record<string, Record<string, Record<string, [number, number][]>>>;
const [game, ...rest] = process.argv.slice(2) as [Game, ...string[]];
if (game !== "classic" && game !== "forever") {
  console.error("usage: wowhead-points.ts <classic|forever> --seed DIR... | --fetch kind:id,...");
  process.exit(2);
}
const file = path.join(ROOT, "data", "wowhead", game, "points.json");
const points: Points = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const put = (kind: string, id: string, area: string, pts: [number, number][]) => {
  if (pts.length) ((points[kind] ??= {})[id] ??= {})[area] = pts;
};

// a page's points: every zone's (g_mapperData: { area: [{ coords }] })
function fromPage(kind: string, id: string, html: string): boolean {
  const m = html.match(/g_mapperData = (\{.*?\});/);
  if (!m) return false;
  for (const [area, floors] of Object.entries(JSON.parse(m[1]) as Record<string, { coords: [number, number][] }[]>))
    put(kind, id, area, floors.flatMap((f) => f.coords));
  return true;
}
// a tooltip's points: its one zone's (map: { zone, coords: { floor: [...] } })
function fromTooltip(kind: string, id: string, json: string) {
  let t: { map?: { zone?: number; coords?: Record<string, [number, number][]> } };
  try {
    t = JSON.parse(json) ?? {};
  } catch {
    return;
  }
  const m = t.map;
  if (!m?.zone || !m.coords || typeof m.coords !== "object" || Array.isArray(m.coords)) return;
  put(kind, id, String(m.zone), Object.values(m.coords).flat());
}

const seedAt = rest.indexOf("--seed");
if (seedAt >= 0) {
  const pre = game === "classic" ? "" : "forever-";
  let n = 0;
  for (const dir of rest.slice(seedAt + 1).filter((a) => !a.startsWith("--"))) {
    const files = readdirSync(dir);
    // (a page wins over a tooltip: every zone, not one)
    const paged = new Set<string>();
    for (const f of files) {
      const m = f.match(new RegExp(`^${pre}page-(npc|object)-(\\d+)\\.html$`));
      if (m && fromPage(m[1], m[2], readFileSync(path.join(dir, f), "utf8"))) {
        paged.add(`${m[1]}:${m[2]}`);
        n++;
      }
    }
    for (const f of files) {
      const m = f.match(new RegExp(`^${pre}(npc|object)-(\\d+)\\.json$`));
      if (m && !paged.has(`${m[1]}:${m[2]}`)) {
        fromTooltip(m[1], m[2], readFileSync(path.join(dir, f), "utf8"));
        n++;
      }
    }
  }
  console.log(`seeded ${n} pages and tooltips`);
}

const fetchAt = rest.indexOf("--fetch");
if (fetchAt >= 0) {
  for (const spec of (rest[fetchAt + 1] ?? "").split(",").filter(Boolean)) {
    const [kind, id] = spec.split(":");
    const cached = path.join(CACHE, "wowhead", game, "points", `${kind}-${id}.json`);
    if (!existsSync(cached)) {
      const res = await fetchRetry(`https://nether.wowhead.com/${game}/tooltip/${kind}/${id}`);
      mkdirSync(path.dirname(cached), { recursive: true });
      writeFileSync(cached, res.ok ? await res.text() : "{}");
      await new Promise((r) => setTimeout(r, 250));
    }
    fromTooltip(kind, id, readFileSync(cached, "utf8"));
  }
}

// (sorted by kind and id; a zone's points in Wowhead's order: a quarry's
// haunts are gathered in that order)
const sorted: Points = {};
for (const kind of Object.keys(points).sort()) {
  sorted[kind] = {};
  for (const id of Object.keys(points[kind]).sort((a, b) => Number(a) - Number(b))) sorted[kind][id] = points[kind][id];
}
mkdirSync(path.dirname(file), { recursive: true });
// (a thing a line: a diff shows what changed)
const kinds = Object.entries(sorted).map(
  ([kind, byId]) => `${JSON.stringify(kind)}: {\n${Object.entries(byId).map(([id, p]) => `  ${JSON.stringify(id)}: ${JSON.stringify(p)}`).join(",\n")}\n }`,
);
writeFileSync(file, `{\n ${kinds.join(",\n ")}\n}\n`);
const count = Object.values(sorted).reduce((n, byId) => n + Object.keys(byId).length, 0);
console.log(`${count} things' points -> data/wowhead/${game}/points.json`);
