import { useEffect, useState } from "react";

// GET, as JSON; an answer's error as an Error
export async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => ({ error: `${res.status} ${res.statusText}` }));
  if (!res.ok) throw new Error(body.error ?? `${res.status}`);
  return body as T;
}
export async function send<T>(method: "POST" | "PUT", url: string, data: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method, signal, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const body = await res.json().catch(() => ({ error: `${res.status} ${res.statusText}` }));
  if (!res.ok) throw new Error(body.error ?? `${res.status}`);
  return body as T;
}

// the answers seen, by URL: going back is instant
const seen = new Map<string, unknown>();

export type Loaded<T> = { data: T | undefined; error: string | undefined; loading: boolean };

/** A URL's answer, again whenever the URL changes (null: nothing to ask). */
export function useApi<T>(url: string | null): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>(() => ({ data: url ? (seen.get(url) as T) : undefined, error: undefined, loading: !!url && !seen.has(url) }));
  useEffect(() => {
    if (!url) {
      setState({ data: undefined, error: undefined, loading: false });
      return;
    }
    const known = seen.get(url) as T | undefined;
    setState((s) => ({ data: known ?? s.data, error: undefined, loading: !known }));
    const ac = new AbortController();
    get<T>(url, ac.signal)
      .then((data) => {
        if (seen.size > 300) seen.delete(seen.keys().next().value!);
        seen.set(url, data);
        setState({ data, error: undefined, loading: false });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ data: undefined, error: e.message, loading: false });
      });
    return () => ac.abort();
  }, [url]);
  return state;
}
