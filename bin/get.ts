// The latest published databases (.github/workflows/db.yml's release), for a
// job that would rather download than build:
//   bun bin/get.ts [classic|forever|all]
// into .cache/db/<game>.db, as bin/build.ts would have written them.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { dbPath } from "../src/db";
import { fetchRetry } from "../src/fetch";
import type { Game } from "../src/pins";

const arg = process.argv[2] ?? "all";
const games: Game[] = arg === "all" ? ["classic", "forever"] : [arg as Game];
const token = process.env.GITHUB_TOKEN;
const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
const res = await fetchRetry("https://api.github.com/repos/salty-max/wow-data/releases/latest", { headers: auth });
if (!res.ok) throw new Error(`the latest release: ${res.status}`);
const release = (await res.json()) as { tag_name: string; assets: { name: string; browser_download_url: string }[] };
for (const game of games) {
  const asset = release.assets.find((a) => a.name === `${game}.db.gz`);
  if (!asset) throw new Error(`${release.tag_name} has no ${game}.db.gz`);
  const file = await fetchRetry(asset.browser_download_url, { headers: auth });
  if (!file.ok) throw new Error(`${asset.name}: ${file.status}`);
  mkdirSync(path.dirname(dbPath(game)), { recursive: true });
  writeFileSync(dbPath(game), gunzipSync(new Uint8Array(await file.arrayBuffer())));
  console.log(`✓ ${dbPath(game)} (${release.tag_name})`);
}
