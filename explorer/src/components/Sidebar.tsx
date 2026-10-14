import { Database, Home, Search, Table2, TerminalSquare } from "lucide-react";
import { RefLink } from "@/components/ui";
import { useApp } from "@/lib/app";
import { ago, GAME_NAMES, LOCALE_NAMES, short } from "@/lib/format";
import { href } from "@/lib/route";
import type { Game } from "@/lib/types";

/**
 * The left side: the name, the game (the same page in the other game: what
 * changed in Forever), the pages, what was lately opened, the language.
 */
export function Sidebar() {
  const { route, game, info, gameInfo, locale, setLocale, recent } = useApp();
  const pages = [
    { id: "home", label: "Overview", icon: Home, to: href(game) },
    { id: "search", label: "Search", icon: Search, to: href(game, "search") },
    { id: "tables", label: "Tables", icon: Table2, to: href(game, "tables"), also: ["table"] },
    { id: "sql", label: "SQL console", icon: TerminalSquare, to: href(game, "sql") },
  ];
  // the other game, same place
  const switchTo = (g: Game) => `#/${g}${location.hash.replace(/^#\/[^/?]*/, "")}`;
  const client = gameInfo?.built ? gameInfo.sources.find((s) => s.name === "client") : undefined;
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-edge bg-stone/80">
      <a href={href(game)} className="flex items-center gap-3 px-5 pt-5 pb-5">
        <span className="grid size-10 place-items-center rounded-[10px] border border-edge-gold bg-stone shadow-[0_0_14px_rgb(242_193_78/0.18)]">
          <Database className="size-5 text-gold" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="title block text-lg leading-tight">Explorer</span>
          <span className="block text-xs text-faint">wow-data</span>
        </span>
      </a>

      <div role="radiogroup" aria-label="Game" className="mx-4 mb-5 grid grid-cols-2 rounded-lg border border-edge bg-black/30 p-0.5">
        {(["classic", "forever"] as const).map((g) => (
          <a
            key={g}
            role="radio"
            aria-checked={game === g}
            href={switchTo(g)}
            className={`rounded-md py-1.5 text-center text-[12.5px] font-medium transition-colors ${
              game === g ? "bg-gold/12 text-gold shadow-[inset_0_0_0_1px_rgb(242_193_78/0.3)]" : "text-dim hover:text-parchment"
            }`}
          >
            {GAME_NAMES[g]}
          </a>
        ))}
      </div>

      <nav className="flex flex-col gap-0.5 px-3" aria-label="Pages">
        {pages.map((p) => {
          const on = route.page === p.id || p.also?.includes(route.page);
          return (
            <a
              key={p.id}
              href={p.to}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${on ? "bg-gold/10 text-gold" : "text-dim hover:bg-white/[0.04] hover:text-parchment"}`}
            >
              <p.icon className="size-4 shrink-0" aria-hidden />
              {p.label}
            </a>
          );
        })}
      </nav>

      {recent.length > 0 && (
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
          <p className="label px-3 pb-1.5">Lately opened</p>
          <ul className="flex flex-col">
            {recent.map((r) => (
              <li key={`${r.kind}:${r.id}`} className="rounded-md px-3 py-1 text-[13px] hover:bg-white/[0.03]">
                <RefLink r={r} level={false} className="w-full" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2.5 border-t border-white/[0.05] px-4 pt-3 pb-4">
        <label className="flex flex-col gap-1">
          <span className="label">Names in</span>
          <select className="field h-8 text-[13px]" value={locale} onChange={(e) => setLocale(e.target.value)}>
            {(info?.locales ?? ["enUS"]).map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l] ?? l} · {l}
              </option>
            ))}
          </select>
        </label>
        {gameInfo?.built ? (
          <p className="text-[11.5px] leading-snug text-faint">
            {client ? short(client.version) : ""}
            <br />
            built {ago(gameInfo.builtAt)}
          </p>
        ) : (
          gameInfo && <p className="text-[11.5px] text-blood">Not built: bun bin/build.ts {game}</p>
        )}
      </div>
    </aside>
  );
}
