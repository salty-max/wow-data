// What a database is made of, and a database of other inputs told: the tag
// follows the build's own files, openDb and the Python opener say a stale
// one, the dump's core tables can't come back empty.
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { staleness } from "../src/db";
import { buildInputs, databaseTag } from "../src/dbRelease";
import { ROOT } from "../src/pins";
import { rows } from "../src/sql";

describe("the databases' inputs", () => {
  test("the build's import closure, the fixed inputs, not the hand tools", () => {
    const inputs = buildInputs();
    for (const f of ["pins.json", "schema.sql", "data", "bin/*.lua", "bin/build.ts", "src/build.ts", "src/cache.ts", "src/questie.ts", "src/players.ts"])
      expect(inputs).toContain(f);
    for (const f of ["src/card.ts", "bin/card.ts", "bin/tell.ts", "bin/latest.ts", "bin/get.ts"]) expect(inputs).not.toContain(f);
  });
});

describe("a database of other inputs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wow-data-meta-"));
  let n = 0;
  const made = (tag?: string) => {
    const file = path.join(dir, `${++n}.db`);
    const db = new Database(file, { create: true });
    db.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
    if (tag) db.run("INSERT INTO meta VALUES ('tag', ?)", [tag]);
    return { db, file };
  };
  test("its tag against the checkout's, in TypeScript and in Python", () => {
    const want = databaseTag();
    expect(staleness(made(want).db, "classic")).toBeUndefined();
    expect(staleness(made("db-000000000000").db, "classic")).toContain(`built at db-000000000000, this checkout is at ${want}`);
    expect(staleness(made().db, "forever")).toContain("built before the databases kept their tag");
    const py = (file: string) =>
      Bun.spawnSync(["python3", "-I", "-c", `import sqlite3, sys; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, "py"))}); import wowdata; print(wowdata.staleness(sqlite3.connect(${JSON.stringify(file)}), "classic"))`]).stdout.toString().trim();
    expect(py(made(want).file)).toBe("None");
    expect(py(made("db-111111111111").file)).toContain("built at db-111111111111");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("the dump's tables", () => {
  const dump = "CREATE TABLE `quest_template` (\n  `entry` int,\n  `Title` text\n);\nINSERT INTO `quest_template` VALUES (1,'A'),(2,'B');\nCREATE TABLE `npc_text` (\n  `ID` int\n);\n";
  test("read whole, a core table empty refused", () => {
    expect(rows(dump, "quest_template", 1)).toEqual([
      { entry: 1, Title: "A" },
      { entry: 2, Title: "B" },
    ]);
    expect(rows(dump, "npc_text")).toEqual([]);
    expect(() => rows(dump, "npc_text", 1)).toThrow("0 rows in the dump");
  });
});
