// The big WMOs' named groups: the parsers on files made here (no game file in
// the repository), then the terrain database's wmo_group against the game
// (skipped where it isn't built).
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dbPath, openDb } from "../src/db";
import { openTerrain, terrainPath } from "../src/terrainDb";
import { groupHead, modfEntry, placeBox, wmoRoot } from "../src/wmoGroups";

const chunk = (tag: string, body: Buffer) => {
  const head = Buffer.alloc(8);
  head.write(tag.split("").reverse().join(""), 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
};
const floats = (...v: number[]) => {
  const b = Buffer.alloc(v.length * 4);
  v.forEach((f, i) => b.writeFloatLE(f, i * 4));
  return b;
};

describe("the WMO files' parsers", () => {
  test("a root's WMO id and its groups' flags and files", () => {
    const mohd = Buffer.alloc(64);
    mohd.writeUInt32LE(2, 4);
    mohd.writeUInt32LE(61, 0x20);
    const mogi = Buffer.alloc(64);
    mogi.writeUInt32LE(0x8, 0);
    mogi.writeUInt32LE(0x2000, 32);
    const gfid = Buffer.alloc(8);
    gfid.writeUInt32LE(501, 0);
    gfid.writeUInt32LE(502, 4);
    const root = Buffer.concat([chunk("MVER", Buffer.alloc(4)), chunk("MOHD", mohd), chunk("MOGI", mogi), chunk("GFID", gfid)]);
    expect(wmoRoot(root)).toEqual({ wmoId: 61, groups: [{ flags: 0x8, file: 501 }, { flags: 0x2000, file: 502 }] });
    expect(() => wmoRoot(Buffer.concat([chunk("MVER", Buffer.alloc(4)), chunk("MOHD", mohd), chunk("MOGI", mogi)]))).toThrow();
  });
  test("a group's id (0x38), flags and box", () => {
    const mogp = Buffer.alloc(0x44);
    mogp.writeUInt32LE(0xa841, 8);
    floats(-1, -2, -3, 4, 5, 6).copy(mogp, 0x0c);
    mogp.writeUInt32LE(15, 0x34);
    mogp.writeUInt32LE(2645, 0x38);
    expect(groupHead(Buffer.concat([chunk("MVER", Buffer.alloc(4)), chunk("MOGP", mogp)]))).toEqual({ id: 2645, flags: 0xa841, min: [-1, -2, -3], max: [4, 5, 6] });
  });
  test("a placement's turn and name set, by its unique id", () => {
    const modf = Buffer.alloc(128);
    modf.writeUInt32LE(7, 4);
    modf.writeUInt32LE(9, 64 + 4);
    modf.writeFloatLE(39, 64 + 24);
    modf.writeUInt16LE(3, 64 + 60);
    const obj = Buffer.concat([chunk("MVER", Buffer.alloc(4)), chunk("MODF", modf)]);
    expect(modfEntry(obj, 9)).toEqual({ rot: 39, nameSet: 3 });
    expect(modfEntry(obj, 8)).toBeNull();
  });
  test("a box turned by rot + 180 and placed", () => {
    // rot 0: the WMO's +x along the game's facing 180 (south, -x)
    expect(placeBox([100, 200, 10], 0, [0, 0, 0], [10, 2, 5])).toEqual({ min: [90, 198, 10], max: [100, 200, 15] });
    // rot 90: +x along 270 (east, -y)
    const b = placeBox([0, 0, 0], 90, [0, 0, 0], [10, 2, 5]);
    expect(b.min.map((v) => Math.round(v) + 0)).toEqual([0, -10, 0]);
    expect(b.max.map((v) => Math.round(v) + 0)).toEqual([2, 0, 5]);
  });
});

describe.skipIf(!existsSync(terrainPath("classic")) || !existsSync(dbPath("classic")))("classic-terrain.db's WMO groups", () => {
  test("Stormwind's districts by name, in the city, the Trade District east of the Cathedral", () => {
    const t = openTerrain("classic"), db = openDb("classic");
    const names = new Map((db.query("SELECT WMOGroupID g, AreaName_lang n FROM client_WMOAreaTable WHERE WMOID = 61 AND NameSetID = 0").all() as { g: number; n: string }[]).map((r) => [r.g, r.n]));
    const groups = t.query("SELECT * FROM wmo_group WHERE map_id = 0 AND wmo_id = 61").all() as { group_id: number; min_x: number; max_x: number; min_y: number; max_y: number }[];
    expect(groups.length).toBe(306);
    // nearly every group's id is one WMOAreaTable has
    expect(groups.filter((g) => names.has(g.group_id)).length).toBeGreaterThan(290);
    const mid = (n: string) => {
      const g = groups.filter((r) => names.get(r.group_id) === n);
      return [g.reduce((s, r) => s + (r.min_x + r.max_x) / 2, 0) / g.length, g.reduce((s, r) => s + (r.min_y + r.max_y) / 2, 0) / g.length];
    };
    // the city spans -9100..-8300 x, 300..1200 y; the Trade District lies
    // east (lower y) of Cathedral Square, the Mage Quarter west of it
    for (const n of ["Trade District", "Cathedral Square", "Mage Quarter"]) {
      const [x, y] = mid(n);
      expect(x).toBeGreaterThan(-9300);
      expect(x).toBeLessThan(-8300);
      expect(y).toBeGreaterThan(200);
      expect(y).toBeLessThan(1300);
    }
    expect(mid("Trade District")[1]).toBeLessThan(mid("Cathedral Square")[1]);
    expect(mid("Mage Quarter")[1]).toBeGreaterThan(mid("Cathedral Square")[1]);
  });
});
