// The continents' ground from the client's map files: every tile the map's
// WDT lists, its root ADT (the heights, the holes, the liquids, each map
// chunk's area) and its _obj0 (where the WMOs stand, their bounding boxes),
// from wago.tools at the pinned build. A raw tile is 300 KB and a map holds
// hundreds, so the cache keeps what is read from each tile (a few KB), never
// the file: .cache/wago/terrain-<parser>/<build>/<map>/<col>_<row>.json.gz,
// <parser> a hash of this file's source, so a change to how a tile is read
// is never served from tiles read the old way (the CI restores the cache).
// Classic's two continents only (geoguessr's camera picker reads them).
import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CACHE, cached, HttpError } from "./cache";
import { fetchRetry } from "./fetch";
import { type Game, PINS } from "./pins";

export const ORIGIN = 17066.666666, TILE = 533.333333, CHUNK = TILE / 16, UNIT = CHUNK / 8;
// the maps whose ground is built, by game: id and the folder its files are in
export const TERRAIN_MAPS: Partial<Record<Game, { id: number; dir: string }[]>> = {
  classic: [
    { id: 0, dir: "azeroth" },
    { id: 1, dir: "kalimdor" },
  ],
};

export type Chunk = {
  row: number; // the chunk's row over the whole map (0-1023): world x falls with it
  col: number; // its column: world y falls with it
  x: number; // its north-west corner, the largest x and y it covers
  y: number;
  area: number;
  zMin: number;
  zMax: number;
  heights: number[]; // 9x9 outer vertices, row by row, world heights
  holes: bigint; // 8x8 cells with no ground, bit row*8+col
  liquid: { type: number; min: number; max: number; cells: bigint } | null;
};
export type Wmo = { unique: number; file: number | null; at: [number, number, number]; min: [number, number, number]; max: [number, number, number] };
// a chunk as the table keeps it: its heights a byte each (packHeights)
export type Packed = Omit<Chunk, "heights"> & { heights: Uint8Array };
type Tile = { chunks: Packed[]; wmos: Wmo[] };

// a file's chunks: tag (as the format names it, reversed on disk), start, size
export function* chunks(d: Buffer, start = 0, end = d.length) {
  for (let o = start; o + 8 <= end; ) {
    const n = d.readUInt32LE(o + 4);
    yield { tag: d.toString("latin1", o, o + 4).split("").reverse().join(""), at: o + 8, size: n };
    o += 8 + n;
  }
}

// the tiles a WDT lists (MAID): their column, row and root and _obj0 file ids
export function wdtTiles(wdt: Buffer): { col: number; row: number; root: number; obj0: number }[] {
  const maid = [...chunks(wdt)].find((c) => c.tag === "MAID");
  if (!maid) throw new Error("the WDT has no MAID chunk (a map named by path, not by file id)");
  const tiles = [];
  for (let i = 0; i < 4096; i++) {
    const root = wdt.readUInt32LE(maid.at + i * 32), obj0 = wdt.readUInt32LE(maid.at + i * 32 + 4);
    if (root) tiles.push({ col: i & 63, row: i >> 6, root, obj0 });
  }
  return tiles;
}

// a root ADT's 256 map chunks: heights (MCVT, the 9x9 outer vertices; the 8x8
// inner ones moved a point by 0.2 yards at most in a test on Elwynn's tiles,
// so they are left out), holes, area, and the liquid over each (MH2O)
export function rootChunks(d: Buffer): Chunk[] {
  const top = [...chunks(d)];
  const liquids = mh2o(d, top.find((c) => c.tag === "MH2O"));
  return top
    .filter((c) => c.tag === "MCNK")
    .map((c, i) => {
      const flags = d.readUInt32LE(c.at);
      const ix = d.readUInt32LE(c.at + 4), iy = d.readUInt32LE(c.at + 8);
      const x = d.readFloatLE(c.at + 0x68), y = d.readFloatLE(c.at + 0x6c), z = d.readFloatLE(c.at + 0x70);
      const mcvt = [...chunks(d, c.at + 128, c.at + c.size)].find((s) => s.tag === "MCVT");
      const heights: number[] = [];
      for (let r = 0; r < 9; r++) for (let k = 0; k < 9; k++) heights.push(z + (mcvt ? d.readFloatLE(mcvt.at + (r * 17 + k) * 4) : 0));
      // holes: the 8x8 high-resolution mask (flag 0x10000), else the 4x4 one, each bit two by two cells
      let holes = 0n;
      if (flags & 0x10000) {
        for (let r = 0; r < 8; r++) {
          const b = d[c.at + 0x14 + r];
          for (let k = 0; k < 8; k++) if (b & (1 << k)) holes |= 1n << BigInt(r * 8 + k);
        }
      } else {
        const low = d.readUInt16LE(c.at + 0x3c);
        for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) if (low & (1 << ((r >> 1) * 4 + (k >> 1)))) holes |= 1n << BigInt(r * 8 + k);
      }
      return {
        row: Math.round((ORIGIN - x) / CHUNK),
        col: Math.round((ORIGIN - y) / CHUNK),
        x, y,
        area: d.readUInt32LE(c.at + 0x34),
        zMin: Math.min(...heights),
        zMax: Math.max(...heights),
        heights,
        holes,
        liquid: liquids[iy * 16 + ix] ?? null,
      };
    });
}

// MH2O: per map chunk, its liquid instances (type, surface heights, the cells
// they cover). The first instance's type names the chunk's liquid.
function mh2o(d: Buffer, c: { at: number; size: number } | undefined): (Chunk["liquid"] | null)[] {
  const out: (Chunk["liquid"] | null)[] = [];
  if (!c || !c.size) return out;
  for (let i = 0; i < 256; i++) {
    const h = c.at + i * 12;
    const inst = d.readUInt32LE(h), layers = d.readUInt32LE(h + 4);
    if (!inst || !layers) continue;
    let liquid: Chunk["liquid"] | null = null;
    for (let l = 0; l < layers; l++) {
      const o = c.at + inst + l * 24;
      const type = d.readUInt16LE(o), min = d.readFloatLE(o + 4), max = d.readFloatLE(o + 8);
      const x0 = d[o + 12], y0 = d[o + 13], w = d[o + 14], hgt = d[o + 15], exists = d.readUInt32LE(o + 16);
      let cells = 0n;
      for (let r = 0; r < hgt; r++)
        for (let k = 0; k < w; k++) {
          const bit = r * w + k;
          if (exists && !(d[c.at + exists + (bit >> 3)] & (1 << (bit & 7)))) continue;
          // (the instance's x runs along the chunk's columns, its y along its rows)
          cells |= 1n << BigInt((y0 + r) * 8 + x0 + k);
        }
      if (!cells) continue;
      liquid = liquid
        ? { type: liquid.type, min: Math.min(liquid.min, min), max: Math.max(liquid.max, max), cells: liquid.cells | cells }
        : { type, min, max, cells };
    }
    out[i] = liquid;
  }
  return out;
}

// an _obj0 ADT's WMOs (MODF), in world coordinates; one standing over several
// tiles is listed in each, with the same unique id
export function objWmos(d: Buffer): Wmo[] {
  const modf = [...chunks(d)].find((c) => c.tag === "MODF");
  if (!modf) return [];
  const out: Wmo[] = [];
  // the file's axes to the world's: x = ORIGIN - file z, y = ORIGIN - file x, z = file y
  const world = (o: number): [number, number, number] => [ORIGIN - d.readFloatLE(o + 8), ORIGIN - d.readFloatLE(o), d.readFloatLE(o + 4)];
  for (let o = modf.at; o + 64 <= modf.at + modf.size; o += 64) {
    const flags = d.readUInt16LE(o + 56);
    const a = world(o + 32), b = world(o + 44);
    out.push({
      unique: d.readUInt32LE(o + 4),
      // flag 0x8: the name is a file id (else an index into MWMO's paths, not kept)
      file: flags & 0x8 ? d.readUInt32LE(o) : null,
      at: world(o + 8),
      min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
      max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
    });
  }
  return out;
}

// a map file, refused unless it is one: a challenge page or a body cut
// short would otherwise be read as a tile with no ground and cached for good
const casc = (id: number, build: string) =>
  fetchRetry(`https://wago.tools/api/casc/${id}?download&version=${build}`).then(async (res) => {
    if (!res.ok) throw new HttpError(res.url, res.status);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length < 8 || body.toString("latin1", 0, 4) !== "REVM") throw new Error(`file ${id}: not a map file (${body.length} bytes)`);
    return body;
  });
const PARSER = Bun.hash(readFileSync(import.meta.path)).toString(16).slice(0, 8);

// a map's WDT, by its path in wago.tools' file list (downloaded once)
async function wdt(dir: string, build: string): Promise<Buffer> {
  const name = `world/maps/${dir}/${dir}.wdt`;
  const list = JSON.parse(readFileSync(await cached(`https://wago.tools/api/files?search=${encodeURIComponent(name)}`, `wago/files/${dir}.wdt.json`), "utf8")) as Record<string, string>;
  const id = Object.entries(list).find(([, v]) => v.replace(/\\\//g, "/") === name)?.[0];
  if (!id) throw new Error(`${name}: not in wago.tools' file list`);
  return readFileSync(await cached(`https://wago.tools/api/casc/${id}?download&version=${build}`, `wago/casc/${build}/${id}`));
}

// (the masks as 0x..., the heights as base64, gzipped: about 30 KB a tile)
const toJson = (t: Tile) =>
  Bun.gzipSync(
    JSON.stringify(t, (_, v) =>
      typeof v === "bigint" ? `0x${v.toString(16)}` : v instanceof Uint8Array ? `b64:${Buffer.from(v).toString("base64")}` : v,
    ),
  );
const fromJson = (b: Buffer): Tile =>
  JSON.parse(Buffer.from(Bun.gunzipSync(new Uint8Array(b))).toString("utf8"), (_, v) =>
    typeof v !== "string" ? v : v.startsWith("0x") ? BigInt(v) : v.startsWith("b64:") ? new Uint8Array(Buffer.from(v.slice(4), "base64")) : v,
  );

// a tile read once: its chunks and WMOs, from the cache or from wago.tools
async function tile(build: string, dir: string, t: { col: number; row: number; root: number; obj0: number }): Promise<Tile> {
  const file = path.join(CACHE, "wago", `terrain-${PARSER}`, build, dir, `${t.col}_${t.row}.json.gz`);
  if (existsSync(file)) return fromJson(readFileSync(file));
  const ground = rootChunks(await casc(t.root, build));
  if (ground.length !== 256) throw new Error(`${dir} ${t.col}_${t.row}: ${ground.length} map chunks, not 256`);
  const read: Tile = {
    chunks: ground.map((c) => ({ ...c, heights: packHeights(c) })),
    wmos: t.obj0 ? objWmos(await casc(t.obj0, build)) : [],
  };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.part`, toJson(read));
  renameSync(`${file}.part`, file);
  return read;
}

// a 64-bit mask as 8 bytes, little end first (NULL: none set)
export const mask = (m: bigint) => {
  if (!m) return null;
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(m);
  return b;
};
// the heights as a byte each between the chunk's lowest and highest
export function packHeights(c: Pick<Chunk, "zMin" | "zMax" | "heights">): Uint8Array {
  const span = c.zMax - c.zMin;
  return Uint8Array.from(c.heights, (h) => (span > 0 ? Math.round(((h - c.zMin) / span) * 255) : 0));
}

// terrain_chunk and wmo_placement for the game's maps (none: nothing built)
export async function terrain(db: Database, game: Game, log: (s: string) => void) {
  const maps = TERRAIN_MAPS[game];
  if (!maps) return;
  const build = PINS.builds[game].build;
  const chunk = db.prepare("INSERT INTO terrain_chunk VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'client')");
  const wmo = db.prepare("INSERT OR IGNORE INTO wmo_placement VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'client')");
  for (const map of maps) {
    const tiles = wdtTiles(await wdt(map.dir, build));
    log(`${game}: the ground of map ${map.id} (${tiles.length} tiles)`);
    // a few downloads at once: polite to wago.tools, an hour's work otherwise
    const read: Tile[] = new Array(tiles.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (next < tiles.length) {
          const i = next++;
          read[i] = await tile(build, map.dir, tiles[i]);
        }
      }),
    );
    db.transaction(() => {
      for (const t of read) {
        for (const c of t.chunks) {
          const l = c.liquid;
          chunk.run(map.id, c.row, c.col, c.x, c.y, c.area, c.zMin, c.zMax, c.heights, mask(c.holes), l?.type ?? null, l?.min ?? null, l?.max ?? null, l ? mask(l.cells) : null);
        }
        for (const w of t.wmos) wmo.run(map.id, w.unique, w.file, ...w.at, ...w.min, ...w.max);
      }
    })();
  }
}
