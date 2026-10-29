// The music chain (area -> set -> files) in both databases (skipped where one isn't built).
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dbPath, openDb } from "../src/db";
import type { Game } from "../src/pins";

for (const game of ["classic", "forever"] as Game[]) {
  const built = existsSync(dbPath(game));
  describe.skipIf(!built)(`${game}.db music`, () => {
    const db = built ? openDb(game) : null!;
    const one = (sql: string, ...args: (string | number)[]) => db.query(sql).get(...args) as Record<string, unknown>;
    const n = (sql: string) => (db.query(sql).get() as { n: number }).n;
    const label = (area: number) =>
      (db.query("SELECT s.label, a.via, a.exact FROM music_area a JOIN music_set s ON s.id = a.set_id WHERE a.area_id = ? ORDER BY a.via, s.label").all(area) as { label: string; via: string; exact: number }[]);

    test("an area plays its zone's set, a subzone its parent's (Elwynn Forest, Tirisfal Glades, Stormwind City)", () => {
      expect(label(12)[0]).toEqual({ label: "Zone-Forest", via: "own", exact: 1 });
      expect(label(85)[0]).toEqual({ label: "Zone-EvilForest", via: "own", exact: 1 });
      expect(label(1519).find((l) => l.via === "own")?.label).toBe("Zone-Stormwind");
    });
    test("a building's set that the client pins to a whole city is not exact (Orgrimmar's own music)", () => {
      expect(label(1637).find((l) => l.label === "Zone-Orgrimmar")).toEqual({ label: "Zone-Orgrimmar", via: "wmo", exact: 0 });
    });
    test("every link and track resolves", () => {
      expect(n("SELECT count(*) n FROM music_area WHERE set_id NOT IN (SELECT id FROM music_set)")).toBe(0);
      expect(n("SELECT count(*) n FROM music_area WHERE area_id NOT IN (SELECT ID FROM client_AreaTable)")).toBe(0);
      expect(n("SELECT count(*) n FROM music_track WHERE file_id NOT IN (SELECT FileDataID FROM client_SoundKitEntry)")).toBe(0);
      expect(n("SELECT count(*) n FROM music_set WHERE id NOT IN (SELECT set_id FROM music_track)")).toBe(0);
      expect(n("SELECT count(*) n FROM music_intro WHERE file_id NOT IN (SELECT FileDataID FROM client_SoundKitEntry)")).toBe(0);
    });
    test("the game's own recordings: Zone-Forest's tracks differ per game", () => {
      const files = (db.query("SELECT file_id f FROM music_track WHERE set_id = 1 ORDER BY seq").all() as { f: number }[]).map((r) => r.f);
      expect(files).toContain(game === "classic" ? 53492 : 8180778);
      expect(files).not.toContain(game === "classic" ? 8180778 : 53492);
    });
    test("Orgrimmar's arrival stinger is an intro of the city", () => {
      expect(one("SELECT label, delay_minutes d FROM music_intro WHERE area_id = 1637 LIMIT 1")).toEqual({ label: "Orgrimmar Intro", d: 60 });
    });
    test("sets reached by an area (the rest are dungeon rows the client ties to no area)", () => {
      const used = n("SELECT count(DISTINCT set_id) n FROM music_area");
      expect(used).toBeGreaterThan(game === "classic" ? 74 : 110);
    });
  });
}
