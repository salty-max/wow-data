// The published databases (.github/workflows/db.yml's releases), for a job
// that would rather download than build: the latest, or one release's (an
// addon's job asks for the one built from the wow-data it checked out:
// .github/workflows/addon-data.yml), which must be there.
//   bun bin/get.ts [classic|forever|all] [--tag db-<commit12>]
// into .cache/db/<game>.db, as bin/build.ts would have written them.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { dbPath } from "../src/db";
import { fetchRetry } from "../src/fetch";
import type { Game } from "../src/pins";

const args = process.argv.slice(2);
const tagAt = args.indexOf("--tag");
const tag = tagAt >= 0 ? args[tagAt + 1] : null;
const arg = args.find((a, i) => !a.startsWith("--") && i !== tagAt + 1) ?? "all";
const games: Game[] = arg === "all" ? ["classic", "forever"] : [arg as Game];
const token = process.env.GITHUB_TOKEN;
const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
const url = `https://api.github.com/repos/salty-max/wow-data/releases/${tag ? `tags/${tag}` : "latest"}`;
const res = await fetchRetry(url, { headers: auth });
if (res.status === 404 && tag) {
  console.error(`✗ no release ${tag} yet: its Databases run may still be going (or failed). Try again once it is published.`);
  process.exit(1);
}
if (!res.ok) throw new Error(`${tag ?? "the latest release"}: ${res.status}`);
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
