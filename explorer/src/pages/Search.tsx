import { Search as SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { HitLine, useDebounced } from "@/components/SearchBar";
import { Empty, ErrorBox, KindIcon, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useApp } from "@/lib/app";
import { go, href } from "@/lib/route";
import type { SearchResult } from "@/lib/types";

const FIRST = ["quest", "creature", "item", "object", "area", "spell", "faction"];

/** Every hit for a name or an id, by kind. */
export function Search() {
  const { game, locale, route, kindLabel } = useApp();
  const [q, setQ] = useState(route.params.get("q") ?? "");
  const kind = route.params.get("kind") ?? "";
  const query = useDebounced(q.trim(), 160);
  useEffect(() => setQ(route.params.get("q") ?? ""), [route.params]);
  // the query in the address, for back and a link
  useEffect(() => {
    if ((route.params.get("q") ?? "") !== query) history.replaceState(null, "", href(game, "search", { q: query, kind }));
  }, [query, kind, game, route.params]);
  const { data, error, loading } = useApi<SearchResult>(query ? `/api/${game}/search?${new URLSearchParams({ q: query, locale, limit: "120", ...(kind ? { kind } : {}) })}` : null);
  const counts = data?.counts ?? {};
  const kinds = Object.keys(counts).sort((a, b) => {
    const ia = FIRST.indexOf(a),
      ib = FIRST.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || counts[b] - counts[a];
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="title text-2xl">Search</h1>
        <p className="mt-1.5 text-dim">Any name in any of the eleven languages, accents or not, or an id. A creature's title finds it too.</p>
      </header>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-faint" aria-hidden />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hogger, Lardeur, 448, Innkeeper…" className="field h-11 w-full rounded-xl pl-11 text-[15px]" aria-label="Search" />
      </div>
      {query && (
        <div className="flex flex-wrap items-center gap-1.5">
          <KindChip on={!kind} label="Everything" count={total} onClick={() => go(href(game, "search", { q: query }))} />
          {kinds.map((k) => (
            <KindChip key={k} on={kind === k} kind={k} label={kindLabel(k)} count={counts[k]} onClick={() => go(href(game, "search", { q: query, kind: k }))} />
          ))}
          {data && <span className="ml-auto text-[11.5px] text-faint">{data.ms} ms</span>}
        </div>
      )}
      {error && <ErrorBox message={error} />}
      {query && loading && !data && (
        <div className="panel flex flex-col gap-2 p-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      )}
      {query && data && (
        <div className="panel p-1.5">
          {data.hits.length === 0 ? (
            <Empty>Nothing called “{query}”{kind ? ` among ${kindLabel(kind).toLowerCase()}s` : ""}.</Empty>
          ) : (
            <ul>
              {data.hits.map((h) => (
                <li key={`${h.kind}:${h.id}`}>
                  <a href={href(game, h.kind, h.id)} className="flex items-center rounded-md px-3 py-2 transition-colors hover:bg-white/[0.04]">
                    <HitLine h={h} />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {data.hits.length >= 120 && <p className="px-3 py-2 text-[12px] text-faint">The first 120: a kind, or more words, narrow it.</p>}
        </div>
      )}
      {!query && <Empty>Type a name: the hits come as you write.</Empty>}
    </div>
  );
}

function KindChip({ on, kind, label, count, onClick }: { on: boolean; kind?: string; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors ${
        on ? "border-gold-soft/60 bg-gold/10 text-gold" : "border-white/10 text-dim hover:border-white/20 hover:text-parchment"
      }`}
    >
      {kind && <KindIcon kind={kind} className="size-3.5" />}
      {label}
      {count != null && <span className="text-faint tabular-nums">{count.toLocaleString("en-US")}</span>}
    </button>
  );
}
