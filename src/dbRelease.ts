import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./pins";

// What the databases are made of: the pins, the schema, the frozen data, the
// workflow, the Lua the build runs, and every file bin/build.ts imports (its
// closure, found when asked: a card.ts or tell.ts edit is no new database).
const FIXED = ["pins.json", "schema.sql", "data", ".github/workflows/db.yml", "bin/*.lua"];
export function buildInputs(root = ROOT): string[] {
  const seen = new Set<string>();
  const scan = new Bun.Transpiler({ loader: "ts" });
  const walk = (file: string) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    for (const i of scan.scanImports(readFileSync(file, "utf8"))) {
      if (!i.path.startsWith(".")) continue;
      const to = path.resolve(path.dirname(file), i.path);
      walk(to.endsWith(".ts") ? to : `${to}.ts`);
    }
  };
  const builder = path.join(root, "bin", "build.ts");
  // (no build script to follow: every script counts, as before)
  if (!existsSync(builder)) return [...FIXED, "src", "bin"];
  walk(builder);
  return [...FIXED, ...[...seen].map((f) => path.relative(root, f)).sort()];
}

// The publisher and its consumers must name the same data revision, even
// when a test or documentation fix was committed after the data changed.
export function databaseTag(root = ROOT): string {
  const revision = execFileSync("git", ["log", "-1", "--format=%H", "--", ...buildInputs(root)], { cwd: root, encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("No database input revision found");
  return `db-${revision.slice(0, 12)}`;
}

type Release = { tag_name: string; assets: { name: string; browser_download_url: string }[] };
type Clock = { now: () => number; sleep: (ms: number) => Promise<unknown> };

// A release can be visible before both uploads finish. Wait for this exact
// release, never silently substitute an older database with different inputs.
export async function databaseRelease(
  label: string,
  lookup: () => Promise<Response>,
  waitMs = 0,
  clock: Clock = { now: Date.now, sleep: Bun.sleep },
): Promise<Release> {
  const deadline = clock.now() + waitMs;
  while (true) {
    const response = await lookup();
    let pending = "not published";
    if (response.ok) {
      const release = await response.json() as Release;
      if (label.startsWith("db-") && release.tag_name !== label) throw new Error(`Expected ${label}, received ${release.tag_name}`);
      if (["classic.db.gz", "forever.db.gz"].every((name) => release.assets.some((asset) => asset.name === name))) return release;
      pending = "still uploading its databases";
    } else if (response.status !== 404) {
      throw new Error(`${label}: HTTP ${response.status}`);
    }
    const remaining = deadline - clock.now();
    if (remaining <= 0) throw new Error(`${label} is ${pending}. Check its Databases run before retrying.`);
    console.log(`${label} is ${pending}, waiting for its Databases run…`);
    await clock.sleep(Math.min(15_000, remaining));
  }
}
