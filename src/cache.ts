// One cache for every addon: wow-data/.cache, a file downloaded once by
// whichever addon asks first. A pinned source's path names its build or
// commit, so a moved pin downloads anew. (WOW_DATA_CACHE moves it.)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchRetry } from "./fetch";
import { ROOT } from "./pins";

export const CACHE = process.env.WOW_DATA_CACHE ?? path.join(ROOT, ".cache");

// the file at url, downloaded once into the cache at rel; its local path
export async function cached(url: string, rel: string, init?: RequestInit): Promise<string> {
  const file = path.join(CACHE, rel);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    const res = await fetchRetry(url, init);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  }
  return file;
}
