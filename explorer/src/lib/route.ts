import { useEffect, useState } from "react";
import type { Game } from "./types";

// The page's place, in the hash: #/<game>/<page>[/<more>][?params]
//   #/forever               home
//   #/forever/search?q=hog  search
//   #/forever/quest/182     a thing's page (any kind)
//   #/forever/tables        the tables
//   #/forever/table/quest   a table's rows (?f=col:op:value&sort=&desc=1&page=)
//   #/forever/sql           the console (?sql=... opens with it)
export type Route = { game: Game; page: string; parts: string[]; params: URLSearchParams };

export function parse(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const game: Game = parts[0] === "classic" ? "classic" : "forever";
  return { game, page: parts[1] ?? "home", parts: parts.slice(2), params: new URLSearchParams(query) };
}

export function href(game: Game, ...rest: (string | number | URLSearchParams | Record<string, string | undefined>)[]): string {
  let query = "";
  const parts: string[] = [];
  for (const r of rest) {
    if (r instanceof URLSearchParams) query = r.toString();
    else if (typeof r === "object") {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(r)) if (v != null && v !== "") p.set(k, v);
      query = p.toString();
    } else parts.push(encodeURIComponent(String(r)));
  }
  return `#/${[game, ...parts].join("/")}${query ? `?${query}` : ""}`;
}

export const go = (to: string) => {
  if (location.hash !== to) location.hash = to;
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}
