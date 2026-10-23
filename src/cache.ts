// One cache for every addon: wow-data/.cache, a file downloaded once by
// whichever addon asks first. A pinned source's path names its build or
// commit, so a moved pin downloads anew. (WOW_DATA_CACHE moves it.)
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchRetry } from "./fetch";
import { ROOT } from "./pins";

export const CACHE = process.env.WOW_DATA_CACHE ?? path.join(ROOT, ".cache");

// an answer that isn't the file, its status kept: a caller tells "not there"
// (wago.tools' 400 for a table a game doesn't have, a 404) from a failure
export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`${url}: ${status}`);
  }
}
export const absent = (e: unknown) => e instanceof HttpError && (e.status === 400 || e.status === 404);

// the file at url, downloaded once into the cache at rel; its local path. The
// body lands beside it and is moved in whole, so a download cut short never
// becomes the file every later run trusts, nor does an empty body or a web
// page where a table or JSON was asked (a challenge page answering 200).
export function cached(url: string, rel: string, init?: RequestInit): Promise<string> {
  return cachedIn(CACHE, url, rel, init);
}
// (the same in another folder, with another fetch: the tests')
export async function cachedIn(root: string, url: string, rel: string, init?: RequestInit, fetcher = fetchRetry): Promise<string> {
  const file = path.join(root, rel);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    const res = await fetcher(url, init);
    if (!res.ok) throw new HttpError(url, res.status);
    const body = new Uint8Array(await res.arrayBuffer());
    if (/\.(csv|json|gz)$/.test(rel)) {
      if (!body.length) throw new Error(`${url}: an empty body`);
      if (!rel.endsWith(".gz") && /^\s*</.test(new TextDecoder().decode(body.subarray(0, 64))))
        throw new Error(`${url}: a web page, not the file`);
    }
    const part = `${file}.part`;
    writeFileSync(part, body);
    renameSync(part, file);
  }
  return file;
}
