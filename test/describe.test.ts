import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { countEntries, describeAddon, labelOf } from "../bin/describe-data";

describe("a data change in words", () => {
  test("files named as a reader would", () => {
    expect(labelOf("i18n/deDE/creatures.json").label).toBe("German creature names");
    expect(labelOf("data/zones-forever.json").label).toBe("Forever's zones");
    expect(labelOf("data/expeditions.json").label).toBe("expedition spots");
    expect(labelOf("addon/Yonder/Data_Forever.lua")).toEqual({ label: "the Forever data", derived: true });
    expect(labelOf("addon/Yonder/Text_frFR.lua")).toEqual({ label: "the language files", derived: true });
  });

  test("entries counted, one level down where the top holds a few tables", () => {
    expect(countEntries({ a: 1, b: 2, c: 3, d: 4 }, { a: 1, b: 5, c: 3, e: 6 })).toEqual({ added: 1, changed: 1, removed: 1 });
    expect(countEntries({ creatures: { 1: "x", 2: "y", 4: "u", 5: "v" } }, { creatures: { 1: "x", 2: "z", 3: "w", 4: "u", 5: "v" } })).toEqual({ added: 1, changed: 1, removed: 0 });
    expect(countEntries([{ id: 1, n: "a" }], [{ id: 1, n: "b" }, { id: 2, n: "c" }])).toEqual({ added: 1, changed: 1, removed: 0 });
  });

  test("an addon's day: what changed against its last commit", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "describe-"));
    const run = (...a: string[]) => spawnSync("git", a, { cwd: dir });
    try {
      run("init", "-q");
      mkdirSync(path.join(dir, "i18n/deDE"), { recursive: true });
      mkdirSync(path.join(dir, "addon/Yonder"), { recursive: true });
      writeFileSync(path.join(dir, "i18n/deDE/creatures.json"), JSON.stringify({ 1: "Wolf", 2: "Bär" }));
      writeFileSync(path.join(dir, "addon/Yonder/Data_Forever.lua"), "-- old");
      run("add", ".");
      run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "chore: data");
      writeFileSync(path.join(dir, "i18n/deDE/creatures.json"), JSON.stringify({ 1: "Wolf", 2: "Braunbär", 3: "Eber" }));
      writeFileSync(path.join(dir, "addon/Yonder/Data_Forever.lua"), "-- new");
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        expect(describeAddon("yonder", ["i18n", "addon/Yonder"])).toEqual({
          title: "Yonder's game data updated",
          body: "German creature names: 1 new, 1 changed.\nRebuilt: the Forever data.",
        });
      } finally {
        process.chdir(cwd);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
