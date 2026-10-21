// Where the pinned client's map files place a model (an M2 doodad: a fallen
// log, a rock), for a landmark of source client-map in data/landmarks.json:
// every placement of the models given in the map tiles given, with its
// unique id, its world position, the area of the map chunk it lies in and,
// with --ui-map, its percent on that zone's map (the client's
// UiMapAssignment, as Yonder's resolver reads it). The tiles' ADT files come
// from wago.tools at the pinned build, into the cache. A hand tool, run when
// a riddle needs scenery no table holds, never by a job:
//   bun bin/placements.ts <classic|forever> <map> <model file id,...> <tile a_b ...> [--ui-map N]
//   bun bin/placements.ts classic kalimdor 202633,202634,202635 31_30 30_30 --ui-map 1442
import { readFileSync } from "node:fs";
import { cached } from "../src/cache";
import { openDb } from "../src/db";
import { fetchRetry } from "../src/fetch";
import { PINS, type Game } from "../src/pins";

const args = process.argv.slice(2);
const uiAt = args.indexOf("--ui-map");
const uiMap = uiAt >= 0 ? Number(args.splice(uiAt, 2)[1]) : 0;
const [game, map, models, ...tiles] = args as [Game, string, string, ...string[]];
if ((game !== "classic" && game !== "forever") || !map || !models || !tiles.length) {
  console.error("usage: bun bin/placements.ts <classic|forever> <map> <model file id,...> <tile a_b ...> [--ui-map N]");
  process.exit(2);
}
const build = PINS.builds[game].build;
const wanted = new Set(models.split(",").map(Number));
const ORIGIN = 17066.666666, TILE = 533.333333, CHUNK = TILE / 16;

// a map file's id, by its name in wago.tools' file list
async function fileId(name: string): Promise<number> {
  const res = await fetchRetry(`https://wago.tools/api/files?search=${encodeURIComponent(`maps/${map}/${name}`)}`);
  const hit = Object.entries((await res.json()) as Record<string, string>).find(([, v]) => v.endsWith(`/${name}`));
  if (!hit) throw new Error(`${name}: not in wago.tools' file list`);
  return Number(hit[0]);
}
const file = async (id: number) =>
  readFileSync(await cached(`https://wago.tools/api/casc/${id}?download&version=${build}`, `wago/casc/${build}/${id}`));

// an ADT's chunks: tag (as the file names it, reversed on disk), start, size
function* chunks(d: Buffer, start = 0, end = d.length) {
  for (let o = start; o + 8 <= end; ) {
    const n = d.readUInt32LE(o + 4);
    yield { tag: d.toString("latin1", o, o + 4).split("").reverse().join(""), at: o + 8, size: n };
    o += 8 + n;
  }
}

const db = openDb(game);
const mapId = (db.query("SELECT ID FROM client_Map WHERE lower(Directory) = lower(?)").get(map) as { ID: number } | null)?.ID;
const areaName = (id: number) =>
  (db.query("SELECT AreaName_lang AS n FROM client_AreaTable WHERE ID = ?").get(id) as { n: string } | null)?.n ?? `area ${id}`;
const assignments = uiMap
  ? (db.query("SELECT * FROM client_UiMapAssignment WHERE UiMapID = ? AND MapID = ?").all(uiMap, mapId ?? -1) as Record<string, number>[])
  : [];
function onMap(x: number, y: number) {
  for (const a of assignments) {
    if (x < a.Region_0 || x > a.Region_3 || y < a.Region_1 || y > a.Region_4) continue;
    const u = a.UiMin_0 + (a.UiMax_0 - a.UiMin_0) * (a.Region_4 - y) / (a.Region_4 - a.Region_1);
    const v = a.UiMin_1 + (a.UiMax_1 - a.UiMin_1) * (a.Region_3 - x) / (a.Region_3 - a.Region_0);
    return [Math.round(u * 1000) / 10, Math.round(v * 1000) / 10];
  }
  return null;
}

for (const tile of tiles) {
  const [ta, tb] = tile.split("_").map(Number);
  const objName = `${map.toLowerCase()}_${ta}_${tb}_obj0.adt`, rootName = `${map.toLowerCase()}_${ta}_${tb}.adt`;
  const obj = await file(await fileId(objName)), root = await file(await fileId(rootName));
  // the area of each map chunk, by its north-west corner (MCNK's position)
  const areas: { x: number; y: number; area: number }[] = [];
  for (const c of chunks(root))
    if (c.tag === "MCNK")
      areas.push({ x: root.readFloatLE(c.at + 0x68), y: root.readFloatLE(c.at + 0x6c), area: root.readUInt32LE(c.at + 0x34) });
  let byName = 0;
  for (const c of chunks(obj)) {
    if (c.tag !== "MDDF") continue;
    for (let o = c.at; o + 36 <= c.at + c.size; o += 36) {
      const id = obj.readUInt32LE(o), unique = obj.readUInt32LE(o + 4), flags = obj.readUInt16LE(o + 34);
      if (!(flags & 0x40)) { byName++; continue; }
      if (!wanted.has(id)) continue;
      const x = ORIGIN - obj.readFloatLE(o + 16), y = ORIGIN - obj.readFloatLE(o + 8), z = obj.readFloatLE(o + 12);
      const chunk = areas.find((a) => x <= a.x && x > a.x - CHUNK && y <= a.y && y > a.y - CHUNK);
      console.log(JSON.stringify({
        tile, model: id, unique,
        world: [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(z * 10) / 10],
        area: chunk ? areaName(chunk.area) : null,
        ...(uiMap ? { uiMap, at: onMap(x, y) } : {}),
      }));
    }
  }
  if (byName) console.warn(`${objName}: ${byName} placements name their model by path, not by file id (not matched)`);
}
