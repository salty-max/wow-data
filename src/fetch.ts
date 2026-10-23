// A download that tries again when the server stumbles (a 5xx, wago.tools'
// Cloudflare 520, a dropped connection) or asks it to slow down (a 429, its
// Retry-After honoured up to two minutes): three more times, 10, 30 and 60
// seconds apart. Any other 4xx is an answer, given back as it is.
export const UA = { "User-Agent": "wow-data/1.0 (WoW addons' build data; github.com/salty-max/wow-data)" };
const WAITS = [10, 30, 60];

export async function fetchRetry(url: string, init: RequestInit = {}, waits = WAITS): Promise<Response> {
  const headers = { ...UA, ...(init.headers as Record<string, string> | undefined) };
  for (let attempt = 0; ; attempt++) {
    let wait = waits[attempt];
    try {
      const res = await fetch(url, { ...init, headers });
      if ((res.status < 500 && res.status !== 429) || attempt >= waits.length) return res;
      const after = Number(res.headers.get("retry-after"));
      if (res.status === 429 && after > 0) wait = Math.min(after, 120);
      console.warn(`${url}: ${res.status}, again in ${wait} s`);
    } catch (e) {
      if (attempt >= waits.length) throw e;
      console.warn(`${url}: ${(e as Error).message}, again in ${wait} s`);
    }
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}
