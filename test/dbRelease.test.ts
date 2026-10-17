import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { databaseRelease, databaseTag } from "../src/dbRelease";
import { ROOT } from "../src/pins";

describe("database release identity", () => {
  test("publisher and consumer checkouts retain the history used to identify database inputs", () => {
    type Step = { uses?: string; with?: { repository?: string; "fetch-depth"?: number } };
    for (const [file, job] of [["db.yml", "build"], ["addon-data.yml", "data"]]) {
      const config = Bun.YAML.parse(readFileSync(path.join(ROOT, ".github/workflows", file!), "utf8")) as {
        jobs: Record<string, { steps: Step[] }>;
      };
      const checkout = config.jobs[job!]!.steps.find(step => step.uses?.startsWith("actions/checkout@")
        && (file === "db.yml" || step.with?.repository === "salty-max/wow-data"));
      expect(checkout?.with?.["fetch-depth"], file).toBe(0);
    }
  });
  test("a test-only recovery build keeps the data's tag, while changed inputs get a new one", () => {
    const root = mkdtempSync(path.join(tmpdir(), "wow-data-release-"));
    const git = (...args: string[]) => execFileSync("git", [
      "-c", "user.name=Release test", "-c", "user.email=release@example.invalid",
      "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args,
    ], { cwd: root, encoding: "utf8" }).trim();
    const commit = (file: string, text: string) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
      git("add", file);
      git("commit", "-qm", file);
    };
    try {
      git("init", "-q");
      commit("schema.sql", "CREATE TABLE source (name TEXT);\n");
      const original = databaseTag(root);
      commit("test/world.test.ts", "// repaired assertion\n");
      expect(`db-${git("rev-parse", "--short=12", "HEAD")}`).not.toBe(original);
      expect(databaseTag(root)).toBe(original);
      commit("README.md", "The same database.\n");
      expect(databaseTag(root)).toBe(original);
      commit("src/build.ts", "// changed database builder\n");
      expect(databaseTag(root)).not.toBe(original);
      expect(databaseTag(root)).toBe(`db-${git("rev-parse", "--short=12", "HEAD")}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

const ready = (names = ["classic.db.gz", "forever.db.gz"]) => Response.json({
  tag_name: "db-123456789abc",
  assets: names.map((name) => ({ name, browser_download_url: `https://example.invalid/${name}` })),
});
const label = "db-123456789abc";

describe("waiting for the required databases", () => {
  test("a published release returns immediately", async () => {
    expect((await databaseRelease(label, async () => ready())).tag_name).toBe(label);
  });

  test("a queued build and a partially uploaded release are waited for", async () => {
    const responses = [new Response(null, { status: 404 }), ready(["classic.db.gz"]), ready()];
    let now = 0;
    const release = await databaseRelease(label, async () => responses.shift()!, 60_000, {
      now: () => now,
      sleep: async (ms) => { now += ms; },
    });
    expect(release.tag_name).toBe(label);
    expect(release.assets).toHaveLength(2);
    expect(now).toBe(30_000);
    expect(responses).toHaveLength(0);
  });

  test("an absent release stops at the deadline", async () => {
    let now = 0;
    let calls = 0;
    await expect(databaseRelease(label, async () => {
      calls++;
      return new Response(null, { status: 404 });
    }, 20_000, { now: () => now, sleep: async (ms) => { now += ms; } })).rejects.toThrow("not published");
    expect(now).toBe(20_000);
    expect(calls).toBe(3);
  });

  test("an incomplete release fails clearly without waiting", async () => {
    await expect(databaseRelease(label, async () => ready(["classic.db.gz"]))).rejects.toThrow("still uploading");
  });

  test("permission failures stop immediately", async () => {
    let slept = false;
    await expect(databaseRelease(label, async () => new Response(null, { status: 403 }), 60_000, {
      now: () => 0,
      sleep: async () => { slept = true; },
    })).rejects.toThrow("HTTP 403");
    expect(slept).toBe(false);
  });

  test("a different database revision is never substituted", async () => {
    await expect(databaseRelease("db-abcdef123456", async () => ready())).rejects.toThrow("Expected db-abcdef123456");
  });
});
