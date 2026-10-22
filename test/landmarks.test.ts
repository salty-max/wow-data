import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../src/pins";
import { loadLandmarks } from "../src/landmarks";

function fixture() {
  const db = new Database(":memory:");
  db.exec(readFileSync(path.join(ROOT, "schema.sql"), "utf8"));
  db.exec("CREATE TABLE client_UiMap (ID INTEGER PRIMARY KEY); INSERT INTO client_UiMap VALUES (1426), (1442), (1417), (1446), (1441)");
  return db;
}

test("the camp uses the owner's corrected landmark, never a fabricated spawn", () => {
  for (const game of ["classic", "forever"] as const) {
    const db = fixture();
    try {
      loadLandmarks(db, game);
      expect(db.query("SELECT ui_map_id, ux, uy, source FROM landmark WHERE id = 'dun-morogh-abandoned-camp'").get())
        .toEqual({ ui_map_id: 1426, ux: 39.2, uy: 67.6, source: "owner-report" });
      expect((db.query("SELECT evidence FROM landmark").get() as { evidence: string }).evidence).toContain("not separately playtested on Classic");
      expect(db.query("SELECT count(*) AS n FROM spawn").get()).toEqual({ n: 0 });
      expect(db.query("SELECT count(*) AS n FROM object").get()).toEqual({ n: 0 });
    } finally { db.close(); }
  }
});

test("a log's grin comes from the client's own map, sourced so, never a spawn", () => {
  for (const game of ["classic", "forever"] as const) {
    const db = fixture();
    try {
      loadLandmarks(db, game);
      expect(db.query("SELECT ui_map_id, ux, uy, source FROM landmark WHERE id = 'stonetalon-smiling-log'").get())
        .toEqual({ ui_map_id: 1442, ux: 57.9, uy: 67.6, source: "client-map" });
      expect((db.query("SELECT version FROM source WHERE name = 'client-map'").get() as { version: string }).version)
        .toBe("data/landmarks.json (frozen: the build each evidence names)");
      expect((db.query("SELECT evidence FROM landmark WHERE id = 'stonetalon-smiling-log'").get() as { evidence: string }).evidence)
        .toMatch(/1\.15\.9\.70003.*1\.60\.1\.70450/);
      expect(db.query("SELECT count(*) AS n FROM spawn").get()).toEqual({ n: 0 });
    } finally { db.close(); }
  }
});

test("invalid or wrongly mapped landmarks fail before any are inserted", () => {
  const good = { id: "test-camp", games: ["classic" as const], uiMap: 1426, x: 39.2, y: 67.6, observedAt: "2026-10-17", evidence: "A reviewed scene." };
  for (const bad of [{ ...good, x: 101 }, { ...good, uiMap: 0 }, { ...good, uiMap: 999 }, { ...good, evidence: "" }, { ...good, source: "wowhead" as "client-map" }, { ...good, source: "constructor" as "client-map" }]) {
    const db = fixture();
    try {
      expect(() => loadLandmarks(db, "classic", [good, { ...bad, id: "bad-camp" }])).toThrow();
      expect(db.query("SELECT count(*) AS n FROM landmark").get()).toEqual({ n: 0 });
    } finally { db.close(); }
  }
});
