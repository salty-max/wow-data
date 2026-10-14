// The community databases (pins.json's repos), a file at the pinned commit:
// .cache/github/<repo>/<commit>/<path>.
import { readFileSync } from "node:fs";
import path from "node:path";
import { CACHE, cached } from "./cache";
import { REPOS } from "./pins";

const short = (commit: string) => commit.slice(0, 12);

// a file of a pinned repository (its local path)
export function repoFile(name: keyof typeof REPOS | string, file: string): Promise<string> {
  const r = REPOS[name];
  if (!r) throw new Error(`no pinned repository ${name}`);
  const url = `https://raw.githubusercontent.com/${r.repo}/${r.commit}/${file.split("/").map(encodeURIComponent).join("/")}`;
  return cached(url, `github/${r.repo}/${short(r.commit)}/${file}`);
}
// a pinned repository's files (GitHub's tree, once)
export async function repoTree(name: string): Promise<string[]> {
  const r = REPOS[name];
  if (!r) throw new Error(`no pinned repository ${name}`);
  const token = process.env.GITHUB_TOKEN;
  const file = await cached(
    `https://api.github.com/repos/${r.repo}/git/trees/${r.commit}?recursive=1`,
    `github/${r.repo}/${short(r.commit)}.tree.json`,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  );
  return (JSON.parse(readFileSync(file, "utf8")).tree as { path: string; type: string }[])
    .filter((t) => t.type === "blob")
    .map((t) => t.path);
}
// the Classic database dump (cmangos classic-db, the pinned commit), gzipped
export const classicDump = () => repoFile("classicdb", "Full_DB/ClassicDB_1_12_1_z2815.sql.gz");
// a pinned repository's folder in the cache (its files where repoFile put them)
export function repoDir(name: string, sub = ""): string {
  const r = REPOS[name];
  if (!r) throw new Error(`no pinned repository ${name}`);
  return path.join(CACHE, "github", r.repo, short(r.commit), sub);
}
