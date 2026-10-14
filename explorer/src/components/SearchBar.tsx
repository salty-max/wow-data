import { CornerDownLeft, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { KindIcon, qualityClass } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useApp } from "@/lib/app";
import { go, href } from "@/lib/route";
import type { Hit, SearchResult } from "@/lib/types";

export function useDebounced<T>(value: T, ms = 140): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** One hit's line: icon, name, title, level, the matched name when it is another language's. */
export function HitLine({ h, compact = false }: { h: Hit; compact?: boolean }) {
  const { kindLabel, locale } = useApp();
  const other = h.match && h.match !== h.name ? h.match : undefined;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <KindIcon kind={h.kind} className={compact ? "size-4" : "size-[18px]"} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`truncate font-medium ${h.name ? qualityClass(h.quality) : "text-dim italic"}`}>{h.name ?? `${kindLabel(h.kind)} ${h.id}`}</span>
          {h.subname && <span className="truncate text-[12.5px] text-dim">&lt;{h.subname}&gt;</span>}
        </span>
        {(other || !compact) && (
          <span className="block truncate text-[12px] text-faint">
            {kindLabel(h.kind)}
            {h.level ? ` · level ${h.level}` : ""}
            {other ? (
              <>
                {" · "}
                <span className="text-dim">{other}</span>
                {h.matchLocale && h.matchLocale !== locale ? ` (${h.matchLocale})` : ""}
              </>
            ) : null}
          </span>
        )}
      </span>
      <span className="shrink-0 font-mono text-[11.5px] text-faint tabular-nums">{h.id}</span>
    </span>
  );
}

/**
 * The search at the top of every page (⌘K): any name in any language, or an
 * id; the first hits as you type, arrows and Enter to go, the rest on the
 * search page.
 */
export function SearchBar() {
  const { game, locale, route } = useApp();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const query = useDebounced(q.trim());
  const { data, loading } = useApi<SearchResult>(query ? `/api/${game}/search?${new URLSearchParams({ q: query, locale, limit: "8" })}` : null);
  const hits = useMemo(() => (query && data ? data.hits : []), [data, query]);
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setActive(0), [query]);
  // a page change closes it
  useEffect(() => setOpen(false), [route]);

  const all = () => go(href(game, "search", { q: q.trim() }));
  const pick = (h: Hit | undefined) => {
    if (!h) return all();
    go(href(game, h.kind, h.id));
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && q.trim()) {
              e.preventDefault();
              pick(hits[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            }
          }}
          placeholder="Search names in any language, or an id"
          aria-label="Search"
          role="combobox"
          aria-expanded={open && !!query}
          aria-controls="search-hits"
          className="field h-9 w-full rounded-lg bg-black/40 pr-16 pl-9"
        />
        <span className="pointer-events-none absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center gap-1.5">
          {loading && <Loader2 className="size-3.5 animate-spin text-faint" aria-hidden />}
          <span className="kbd">⌘K</span>
        </span>
      </div>
      {open && query && (
        <div id="search-hits" role="listbox" className="panel fade-in absolute top-11 right-0 left-0 z-30 overflow-hidden p-1.5 shadow-[0_20px_50px_rgb(0_0_0/0.6)]">
          {hits.length === 0 && !loading && <p className="px-3 py-3 text-dim">Nothing called “{query}”.</p>}
          {hits.map((h, i) => (
            <a
              key={`${h.kind}:${h.id}`}
              role="option"
              aria-selected={i === active}
              href={href(game, h.kind, h.id)}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen(false)}
              className={`flex items-center rounded-md px-2.5 py-1.5 ${i === active ? "bg-white/[0.06]" : ""}`}
            >
              <HitLine h={h} compact />
            </a>
          ))}
          {query && (
            <button
              type="button"
              role="option"
              aria-selected={active === hits.length}
              onMouseEnter={() => setActive(hits.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={all}
              className={`mt-1 flex w-full items-center gap-2 rounded-md border-t border-white/[0.05] px-2.5 py-2 text-left text-[12.5px] text-dim ${active === hits.length ? "bg-white/[0.06] text-parchment" : ""}`}
            >
              <CornerDownLeft className="size-3.5" aria-hidden />
              Every result for “{query}”
              {total > 0 && <span className="ml-auto text-faint tabular-nums">{total.toLocaleString("en-US")}</span>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
