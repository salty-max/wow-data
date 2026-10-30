// The parts of the big WMOs that name them: a city's districts (Stormwind's
// Trade District, Orgrimmar's Valley of Strength), a dungeon's halls. A WMO
// is one placement but many groups, and the client names a group by
// WMOAreaTable (its WMO's id, the placement's name set, the group's own id).
// For each big placement (160 yards or more across) whose WMO has a named
// group in the game's database (client_WMOAreaTable, so classic.db is built
// first): the placement's turn (its _obj0's MODF), the root's group files
// (MOHD, GFID) and each group's id, flags and box (its MOGP header), the box
// turned and placed in world coordinates. A group file is 300 KB and a city
// has hundreds, so the cache keeps what is read from each WMO, never the
// files: .cache/wago/wmo-groups-<parser>/<build>/<root file>.json.
// Kept apart from src/terrain.ts so its hash (the tiles' cache) stays:
// the few helpers it needs from there are written again here.
import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CACHE, cached, HttpError } from "./cache";
import { openDb } from "./db";
import { fetchRetry } from "./fetch";
import { type Game, PINS } from "./pins";
import { chunks, ORIGIN, PARSER, TERRAIN_MAPS, TILE, wdtTiles } from "./terrain";

export const GROUPS_PARSER = Bun.hash(readFileSync(import.meta.path)).toString(16).slice(0, 8);
// a placement this wide (either way) or more: a city, a fortress, a canyon
export const BIG = 160;

export type Root = { wmoId: number; groups: { flags: number; file: number }[] };
export type GroupHead = { id: number; flags: number; min: number[]; max: number[] };

// a root WMO's id (MOHD, for WMOAreaTable) and its groups' flags (MOGI) and
// files (GFID, in the groups' order)
export function wmoRoot(d: Buffer): Root {
  const c = Object.fromEntries([...chunks(d)].map((k) => [k.tag, k]));
  if (!c.MOHD || !c.MOGI) throw new Error("not a root WMO (no MOHD or MOGI)");
  const n = d.readUInt32LE(c.MOHD.at + 4);
  if (!c.GFID || c.GFID.size < n * 4) throw new Error("a root WMO with no group file ids (GFID)");
  const groups = Array.from({ length: n }, (_, i) => ({ flags: d.readUInt32LE(c.MOGI.at + i * 32), file: d.readUInt32LE(c.GFID.at + i * 4) }));
  return { wmoId: d.readUInt32LE(c.MOHD.at + 0x20), groups };
}

// a group file's header (MOGP): its id (WMOAreaTable's WMOGroupID, at 0x38:
// checked against Stormwind's rows), flags and box in the
// WMO's own yards (x, y across, z up)
export function groupHead(d: Buffer): GroupHead {
  const p = [...chunks(d)].find((k) => k.tag === "MOGP");
  if (!p) throw new Error("not a WMO group (no MOGP)");
  const f = (o: number) => Math.round(d.readFloatLE(p.at + o) * 1000) / 1000;
  return { id: d.readUInt32LE(p.at + 0x38), flags: d.readUInt32LE(p.at + 8), min: [f(0x0c), f(0x10), f(0x14)], max: [f(0x18), f(0x1c), f(0x20)] };
}

// a box in the WMO's yards, turned and placed: the world's box around it.
// The placement's turn is its MODF y rotation, degrees: the WMO's +x lies
// along the game's facing rot + 180 (fitted on the 260 big placements' own
// extents, 5 yards off on average, the tilted ones most), its tilt not kept
export function placeBox(at: number[], rot: number, min: number[], max: number[]): { min: number[]; max: number[] } {
  const a = ((rot + 180) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const xs: number[] = [], ys: number[] = [];
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]]) {
      xs.push(at[0] + x * c - y * s);
      ys.push(at[1] + x * s + y * c);
    }
  const r = (v: number) => Math.round(v * 100) / 100;
  return { min: [r(Math.min(...xs)), r(Math.min(...ys)), r(at[2] + min[2])], max: [r(Math.max(...xs)), r(Math.max(...ys)), r(at[2] + max[2])] };
}

// a placement's turn and name set from an _obj0's MODF, by its unique id
export function modfEntry(d: Buffer, unique: number): { rot: number; nameSet: number } | null {
  const modf = [...chunks(d)].find((c) => c.tag === "MODF");
  if (!modf) return null;
  for (let o = modf.at; o + 64 <= modf.at + modf.size; o += 64)
    if (d.readUInt32LE(o + 4) === unique) return { rot: d.readFloatLE(o + 24), nameSet: d.readUInt16LE(o + 60) };
  return null;
}

// (as src/terrain.ts' own: a file at the pinned build, refused unless it is
// one. Written again rather than exported from there: any edit to terrain.ts
// changes its hash, and every tile, about 1 GB, would be read again)
const casc = (id: number, build: string, magic = ["REVM"]) =>
  fetchRetry(`https://wago.tools/api/casc/${id}?download&version=${build}`).then(async (res) => {
    if (!res.ok) throw new HttpError(res.url, res.status);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length < 8 || !magic.includes(body.toString("latin1", 0, 4))) throw new Error(`file ${id}: not a ${magic.join(" or ")} file (${body.length} bytes)`);
    return body;
  });
async function wdt(dir: string, build: string): Promise<Buffer> {
  const name = `world/maps/${dir}/${dir}.wdt`;
  const list = JSON.parse(readFileSync(await cached(`https://wago.tools/api/files?search=${encodeURIComponent(name)}`, `wago/files/${dir}.wdt.json`), "utf8")) as Record<string, string>;
  const id = Object.entries(list).find(([, v]) => v.replace(/\\\//g, "/") === name)?.[0];
  if (!id) throw new Error(`${name}: not in wago.tools' file list`);
  return readFileSync(await cached(`https://wago.tools/api/casc/${id}?download&version=${build}`, `wago/casc/${build}/${id}`));
}
// a small file kept whole (a root WMO, an _obj0 under a big WMO): read
// again by every build, so cached as wdt() caches the WDT
async function whole(id: number, build: string): Promise<Buffer> {
  const body = readFileSync(await cached(`https://wago.tools/api/casc/${id}?download&version=${build}`, `wago/casc/${build}/${id}`));
  if (body.length < 8 || body.toString("latin1", 0, 4) !== "REVM") throw new Error(`file ${id}: not a REVM file (${body.length} bytes)`);
  return body;
}
async function each<T>(items: T[], work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

// a WMO's root and its groups' headers, read once
type Read = { wmoId: number; groups: (GroupHead & { flags: number })[] };
async function wmo(build: string, file: number): Promise<Read> {
  // (keyed by terrain.ts' parser too: its chunks() reads these files)
  const out = path.join(CACHE, "wago", `wmo-groups-${GROUPS_PARSER}-${PARSER}`, build, `${file}.json`);
  if (existsSync(out)) return JSON.parse(readFileSync(out, "utf8")) as Read;
  const root = wmoRoot(await whole(file, build));
  const groups: Read["groups"] = new Array(root.groups.length);
  await each([...root.groups.keys()], async (i) => {
    const g = root.groups[i];
    // (MOGI's flags are the root's word for the group: kept over MOGP's)
    groups[i] = { ...groupHead(await casc(g.file, build)), flags: g.flags };
  });
  const read = { wmoId: root.wmoId, groups };
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(`${out}.part`, JSON.stringify(read));
  renameSync(`${out}.part`, out);
  return read;
}

// wmo_group for the game's maps: every group of the big placements whose
// WMO the client names a part of
export async function wmoGroups(db: Database, game: Game, log: (s: string) => void) {
  const maps = TERRAIN_MAPS[game];
  if (!maps) return;
  const build = PINS.builds[game].build;
  // the names come from the game's database: refused at another build
  const game_ = openDb(game);
  const pins = JSON.parse((game_.query("SELECT value FROM meta WHERE key = 'pins'").get() as { value: string } | null)?.value ?? "{}");
  if (pins.builds?.[game]?.build !== build) throw new Error(`${game}.db was built at ${pins.builds?.[game]?.build ?? "no build"}, the pin is ${build}: bun bin/build.ts ${game} first`);
  db.prepare("INSERT INTO meta VALUES ('game_db', ?)").run((game_.query("SELECT value FROM meta WHERE key = 'tag'").get() as { value: string } | null)?.value ?? "untagged");
  const named = new Set((game_.query("SELECT DISTINCT WMOID w FROM client_WMOAreaTable WHERE WMOGroupID <> -1 AND AreaName_lang <> '' ORDER BY 1").all() as { w: number }[]).map((r) => r.w));
  const ids = new Map<number, Set<number>>();
  for (const r of game_.query("SELECT WMOID w, WMOGroupID g FROM client_WMOAreaTable WHERE WMOGroupID <> -1 ORDER BY 1, 2").all() as { w: number; g: number }[])
    (ids.get(r.w) ?? ids.set(r.w, new Set()).get(r.w)!).add(r.g);
  game_.close();
  const row = db.prepare("INSERT INTO wmo_group VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'client')");
  for (const map of maps) {
    const tiles = wdtTiles(await wdt(map.dir, build));
    const big = db
      .query(`SELECT unique_id, file_id, x, y, z, min_x, min_y, max_x, max_y FROM wmo_placement WHERE map_id = ? AND file_id IS NOT NULL AND (max_x - min_x >= ${BIG} OR max_y - min_y >= ${BIG}) ORDER BY unique_id`)
      .all(map.id) as { unique_id: number; file_id: number; x: number; y: number; z: number; min_x: number; min_y: number; max_x: number; max_y: number }[];
    // the roots first (small): which WMOs the client names a part of
    const roots = new Map<number, Root>();
    await each([...new Set(big.map((b) => b.file_id))], async (f) => {
      roots.set(f, wmoRoot(await whole(f, build)));
    });
    const kept = big.filter((b) => named.has(roots.get(b.file_id)!.wmoId));
    log(`${game}: the named groups of map ${map.id}'s big WMOs (${kept.length} of ${big.length} placements, ${new Set(kept.map((b) => b.file_id)).size} WMOs)`);
    const read = new Map<number, Read>();
    for (const f of new Set(kept.map((b) => b.file_id))) read.set(f, await wmo(build, f));
    let unmatched = 0;
    for (const b of kept) {
      // the tile under its origin first, then the others under its box
      const at = (t: { row: number; col: number }) => t.row === Math.floor((ORIGIN - b.x) / TILE) && t.col === Math.floor((ORIGIN - b.y) / TILE);
      const under = tiles.filter(
        (t) => t.obj0 && t.row >= Math.floor((ORIGIN - b.max_x) / TILE) && t.row <= Math.floor((ORIGIN - b.min_x) / TILE) && t.col >= Math.floor((ORIGIN - b.max_y) / TILE) && t.col <= Math.floor((ORIGIN - b.min_y) / TILE),
      );
      let m: { rot: number; nameSet: number } | null = null;
      for (const t of under.sort((p, q) => Number(at(q)) - Number(at(p)))) if ((m = modfEntry(await whole(t.obj0, build), b.unique_id))) break;
      if (!m) throw new Error(`map ${map.id}: placement ${b.unique_id} isn't in the MODF of any tile under it`);
      const w = read.get(b.file_id)!;
      db.transaction(() => {
        w.groups.forEach((g, i) => {
          if (!ids.get(w.wmoId)?.has(g.id)) unmatched++;
          const box = placeBox([b.x, b.y, b.z], m.rot, g.min, g.max);
          row.run(map.id, b.unique_id, i, g.id, w.wmoId, m.nameSet, g.flags, ...box.min, ...box.max);
        });
      })();
    }
    if (unmatched) log(`${game}: ${unmatched} groups with an id WMOAreaTable has no row for (kept, unnamed)`);
  }
}
