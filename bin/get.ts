// The published databases (.github/workflows/db.yml's releases), for a job
// that would rather download than build: the latest, or one release's (an
// addon's job asks for the one built from the wow-data it checked out:
// .github/workflows/addon-data.yml), which must be there.
//   bun bin/get.ts [classic|forever|all] [--tag db-<commit12>] [--wait SECONDS]
// into .cache/db/<game>.db, as bin/build.ts would have written them.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { parseArgs } from "node:util";
import { dbPath } from "../src/db";
import { databaseRelease } from "../src/dbRelease";
import { fetchRetry } from "../src/fetch";
import type { Game } from "../src/pins";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: { tag: { type: "string" }, wait: { type: "string", default: "0" } },
  allowPositionals: true,
});
const tag = values.tag;
const arg = positionals[0] ?? "all";
const waitSeconds = Number(values.wait);
if (positionals.length > 1 || !["classic", "forever", "all"].includes(arg) || !Number.isFinite(waitSeconds) || waitSeconds < 0) {
  throw new Error("usage: get.ts [classic|forever|all] [--tag TAG] [--wait SECONDS]");
}
const games: Game[] = arg === "all" ? ["classic", "forever"] : [arg as Game];
const token = process.env.GITHUB_TOKEN;
const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
const url = `https://api.github.com/repos/salty-max/wow-data/releases/${tag ? `tags/${tag}` : "latest"}`;
const release = await databaseRelease(tag ?? "the latest release", () => fetchRetry(url, { headers: auth }), waitSeconds * 1000);
for (const game of games) {
  const asset = release.assets.find((a) => a.name === `${game}.db.gz`);
  if (!asset) throw new Error(`${release.tag_name} has no ${game}.db.gz`);
  const file = await fetchRetry(asset.browser_download_url, { headers: auth });
  if (!file.ok) throw new Error(`${asset.name}: ${file.status}`);
  mkdirSync(path.dirname(dbPath(game)), { recursive: true });
  // (written beside it, then moved: a stop halfway never leaves half a database)
  const part = `${dbPath(game)}.part`;
  writeFileSync(part, gunzipSync(new Uint8Array(await file.arrayBuffer())));
  renameSync(part, dbPath(game));
  console.log(`✓ ${dbPath(game)} (${release.tag_name})`);
}
