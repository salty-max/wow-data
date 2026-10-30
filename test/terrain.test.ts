// The ground from the map files: the parsers on files made here (no game file
// in the repository), then classic.db's tables against the game (skipped
// where it isn't built).
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dbPath, openDb } from "../src/db";
import { CHUNK, m2Boxes, objDoodads, objWmos, ORIGIN, packHeights, rootChunks, UNIT, wdtTiles } from "../src/terrain";
import { openTerrain, terrainPath } from "../src/terrainDb";

const chunk = (tag: string, body: Buffer) => {
  const head = Buffer.alloc(8);
  head.write(tag.split("").reverse().join(""), 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
};

describe("the map files' parsers", () => {
  test("a WDT's tiles: column, row and the root and _obj0 file ids", () => {
    const maid = Buffer.alloc(4096 * 32);
    maid.writeUInt32LE(111, (20 * 64 + 35) * 32);
    maid.writeUInt32LE(112, (20 * 64 + 35) * 32 + 4);
    expect(wdtTiles(Buffer.concat([chunk("MVER", Buffer.alloc(4)), chunk("MAID", maid)]))).toEqual([{ col: 35, row: 20, root: 111, obj0: 112 }]);
  });

  // one map chunk at the tile's corner: each vertex 4 yards above the one
  // before it in the file, a 4x4 hole in one corner, water over the first row of cells
  const x = ORIGIN - 49 * 533.333333, y = ORIGIN - 31 * 533.333333;
  const mcvt = Buffer.alloc(145 * 4);
  for (let i = 0; i < 145; i++) mcvt.writeFloatLE(i * 4, i * 4);
  const head = Buffer.alloc(128);
  head.writeUInt32LE(0, 0);
  head.writeUInt32LE(0, 4);
  head.writeUInt32LE(0, 8);
  head.writeUInt32LE(12, 0x34); // Elwynn Forest
  head.writeUInt16LE(0x1, 0x3c); // the low-resolution hole at row 0, column 0
  head.writeFloatLE(x, 0x68);
  head.writeFloatLE(y, 0x6c);
  head.writeFloatLE(50, 0x70);
  const mcnk = chunk("MCNK", Buffer.concat([head, chunk("MCVT", mcvt)]));
  // MH2O: 256 headers, then one instance: type 5, surface 52, cells x 0-7, y 0 (a row of 8)
  const mh = Buffer.alloc(256 * 12 + 24);
  mh.writeUInt32LE(256 * 12, 0);
  mh.writeUInt32LE(1, 4);
  const o = 256 * 12;
  mh.writeUInt16LE(5, o);
  mh.writeFloatLE(52, o + 4);
  mh.writeFloatLE(52, o + 8);
  mh.writeUInt8(0, o + 12);
  mh.writeUInt8(0, o + 13);
  mh.writeUInt8(8, o + 14);
  mh.writeUInt8(1, o + 15);
  const root = Buffer.concat([chunk("MVER", Buffer.alloc(4)), chunk("MH2O", mh), mcnk]);

  test("a root ADT's chunk: its place on the map's grid, area, heights, holes, liquid", () => {
    const [c] = rootChunks(root);
    expect(c.row).toBe(49 * 16);
    expect(c.col).toBe(31 * 16);
    expect(c.area).toBe(12);
    expect(c.heights.length).toBe(81);
    expect(c.zMin).toBe(50);
    // the corner vertices: 9 a row, then the 8 inner ones skipped
    expect(c.heights.slice(0, 3)).toEqual([50, 50 + 1 * 4, 50 + 2 * 4]);
    expect(c.heights[9]).toBe(50 + 17 * 4);
    // a 4x4 hole covers two by two of the 8x8 cells
    expect(c.holes).toBe((1n << 0n) | (1n << 1n) | (1n << 8n) | (1n << 9n));
    // the instance's x runs along the columns: one row of cells
    expect(c.liquid).toEqual({ type: 5, min: 52, max: 52, cells: 0xffn });
  });

  test("an _obj0's WMO in world coordinates (the file's z, x, y), its box ordered", () => {
    const e = Buffer.alloc(64);
    e.writeUInt32LE(107243, 0);
    e.writeUInt32LE(10047, 4);
    [100, 20, 300].forEach((v, i) => e.writeFloatLE(v, 8 + i * 4));
    [90, 10, 290].forEach((v, i) => e.writeFloatLE(v, 32 + i * 4));
    [110, 30, 310].forEach((v, i) => e.writeFloatLE(v, 44 + i * 4));
    e.writeUInt16LE(0x8, 56);
    const [w] = objWmos(chunk("MODF", e));
    expect(w.unique).toBe(10047);
    expect(w.file).toBe(107243);
    expect(w.at).toEqual([ORIGIN - 300, ORIGIN - 100, 20]);
    expect(w.min).toEqual([ORIGIN - 310, ORIGIN - 110, 10]);
    expect(w.max).toEqual([ORIGIN - 290, ORIGIN - 90, 30]);
  });

  test("an _obj0's doodads (MDDF): world coordinates, turn, scale, the file id when flagged", () => {
    const e = Buffer.alloc(36);
    e.writeUInt32LE(189085, 0);
    e.writeUInt32LE(77, 4);
    [100, 20, 300].forEach((v, i) => e.writeFloatLE(v, 8 + i * 4));
    e.writeFloatLE(90, 24);
    e.writeUInt16LE(2048, 32);
    e.writeUInt16LE(0x40, 34);
    expect(objDoodads(chunk("MDDF", e))).toEqual([{ unique: 77, file: 189085, at: [ORIGIN - 300, ORIGIN - 100, 20], yaw: 90, scale: 2 }]);
    e.writeUInt16LE(0, 34);
    expect(objDoodads(chunk("MDDF", e))[0].file).toBeNull();
  });

  test("an M2's boxes from its header, an empty collision box as all 0", () => {
    const h = Buffer.alloc(0xd8);
    h.write("MD20", 0, "latin1");
    [-1, -2, 0, 1, 2, 5].forEach((v, i) => h.writeFloatLE(v, 0xa0 + i * 4));
    [1e7, 1e7, 1e7, -1e7, -1e7, -1e7].forEach((v, i) => h.writeFloatLE(v, 0xbc + i * 4));
    const md21 = Buffer.concat([Buffer.from("MD21", "latin1"), Buffer.alloc(4), h]);
    expect(m2Boxes(md21)).toEqual({ box: [-1, -2, 0, 1, 2, 5], collision: [0, 0, 0, 0, 0, 0] });
    expect(() => m2Boxes(Buffer.from("MVER0000", "latin1"))).toThrow();
  });

  test("a height packed in a byte is off by at most a 510th of the chunk's span", () => {
    const heights = Array.from({ length: 81 }, (_, i) => 10 + Math.sin(i) * 40);
    const c = { zMin: Math.min(...heights), zMax: Math.max(...heights), heights };
    const packed = packHeights(c);
    const worst = Math.max(...heights.map((h, i) => Math.abs(c.zMin + (packed[i] / 255) * (c.zMax - c.zMin) - h)));
    expect(worst).toBeLessThanOrEqual((c.zMax - c.zMin) / 510 + 1e-9);
  });
});

const built = existsSync(terrainPath("classic")) && existsSync(dbPath("classic"));
describe.skipIf(!built)("classic-terrain.db", () => {
  const db = built ? openTerrain("classic") : null!;
  const game = built ? openDb("classic") : null!;
  // the ground under a point, from the packed corner heights (bilinear)
  const at = db?.prepare("SELECT x, y, z_min, z_max, heights FROM terrain_chunk WHERE map_id = ? AND row = ? AND col = ?");
  function ground(map: number, px: number, py: number): number | null {
    const c = at.get(map, Math.floor((ORIGIN - px) / CHUNK), Math.floor((ORIGIN - py) / CHUNK)) as
      | { x: number; y: number; z_min: number; z_max: number; heights: Uint8Array }
      | null;
    if (!c) return null;
    const h = (r: number, k: number) => c.z_min + (c.heights[r * 9 + k] / 255) * (c.z_max - c.z_min);
    const fr = Math.min(7.999, Math.max(0, (c.x - px) / UNIT)), fk = Math.min(7.999, Math.max(0, (c.y - py) / UNIT));
    const r = Math.floor(fr), k = Math.floor(fk), u = fr - r, v = fk - k;
    return (h(r, k) * (1 - v) + h(r, k + 1) * v) * (1 - u) + (h(r + 1, k) * (1 - v) + h(r + 1, k + 1) * v) * u;
  }

  test("classic.db holds none of it (its own database, the user's call)", () => {
    expect(game.query("SELECT 1 FROM sqlite_master WHERE name = 'terrain_chunk'").get()).toBeNull();
  });
  test("both continents, each chunk once, its area the client's", () => {
    const maps = db.query("SELECT map_id, count(*) n FROM terrain_chunk GROUP BY map_id").all() as { map_id: number; n: number }[];
    expect(maps.map((m) => m.map_id)).toEqual([0, 1]);
    // every tile is 256 chunks (Eastern Kingdoms: 687 tiles at 1.15.9)
    for (const m of maps) expect(m.n % 256).toBe(0);
    expect(maps[0].n / 256).toBeGreaterThan(600);
    const n = (sql: string) => (db.query(sql).get() as { n: number }).n;
    const areas = new Set((game.query("SELECT ID FROM client_AreaTable").all() as { ID: number }[]).map((a) => a.ID));
    const used = (db.query("SELECT DISTINCT area_id a FROM terrain_chunk WHERE area_id <> 0").all() as { a: number }[]).map((r) => r.a);
    expect(used.filter((a) => !areas.has(a))).toEqual([]);
    expect(n("SELECT count(*) n FROM terrain_chunk WHERE length(heights) <> 81")).toBe(0);
  });

  test("the ground under the creatures that stand outdoors: within half a yard for most", () => {
    // around Goldshire and the Crossroads, the Classic database's creatures standing still
    const spawns = game
      .query(
        `SELECT map_id, x, y, z FROM spawn WHERE kind = 'creature' AND source = 'classicdb' AND movement_type = 0
         AND ((map_id = 0 AND x BETWEEN -9900 AND -9000 AND y BETWEEN -800 AND 800) OR (map_id = 1 AND x BETWEEN -900 AND 0 AND y BETWEEN -3100 AND -2200))`,
      )
      .all() as { map_id: number; x: number; y: number; z: number }[];
    const off = spawns
      .map((s) => ground(s.map_id, s.x, s.y))
      .map((g, i) => (g == null ? Infinity : Math.abs(g - spawns[i].z)))
      .sort((a, b) => a - b);
    expect(spawns.length).toBeGreaterThan(300);
    expect(off[Math.floor(off.length / 2)]).toBeLessThan(0.5);
  });

  test("water where the game has it: Crystal Lake in Elwynn, the sea off Ratchet", () => {
    const wet = (map: number, px: number, py: number) =>
      db.query("SELECT liquid_type t, liquid_max m FROM terrain_chunk WHERE map_id = ? AND row = ? AND col = ?").get(map, Math.floor((ORIGIN - px) / CHUNK), Math.floor((ORIGIN - py) / CHUNK)) as { t: number | null; m: number | null };
    expect(wet(0, -9410, -95).t).toBe(5);
    expect(wet(1, -1010, -3910)).toEqual({ t: 2, m: 0 });
    // Goldshire's crossroads is dry
    expect(wet(0, -9465, 60).t).toBeNull();
  });

  test("the doodads, each with its model's boxes", () => {
    const n = (sql: string) => (db.query(sql).get() as { n: number }).n;
    expect(n("SELECT count(*) n FROM doodad_placement WHERE map_id = 0")).toBeGreaterThan(100_000);
    expect(n("SELECT count(*) n FROM doodad_placement WHERE map_id = 1")).toBeGreaterThan(100_000);
    // every model a placement names was read, its boxes in order (min under max)
    expect(n("SELECT count(*) n FROM doodad_placement WHERE file_id NOT IN (SELECT file_id FROM doodad_model)")).toBe(0);
    expect(n("SELECT count(*) n FROM doodad_model WHERE col_min_x > col_max_x OR col_min_z > col_max_z OR min_x > max_x")).toBe(0);
    // most models have something to bump into, not all (grass and flowers don't)
    const solid = n("SELECT count(*) n FROM doodad_model WHERE col_max_z > col_min_z");
    expect(solid).toBeGreaterThan(500);
    expect(solid).toBeLessThan(n("SELECT count(*) n FROM doodad_model"));
  });

  test("Stormwind's WMO, once, its box around the city's gate", () => {
    const w = db.query("SELECT * FROM wmo_placement WHERE map_id = 0 AND unique_id = 10047").get() as Record<string, number>;
    expect(w.file_id).toBe(107243);
    expect(w.min_x).toBeLessThan(-9090);
    expect(w.max_x).toBeGreaterThan(-9090);
    expect(w.min_y).toBeLessThan(405);
    expect(w.max_y).toBeGreaterThan(405);
  });
});
