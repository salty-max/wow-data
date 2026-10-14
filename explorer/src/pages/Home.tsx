import { ArrowUpRight, TerminalSquare } from "lucide-react";
import { KindIcon, Panel, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useApp } from "@/lib/app";
import { ago, GAME_NAMES, num, short } from "@/lib/format";
import { href } from "@/lib/route";
import type { SavedQuery } from "@/lib/types";

const COUNTS: [string, string, string][] = [
  ["quest", "Quests", "quest"],
  ["creature", "Creatures", "creature"],
  ["item", "Items", "item"],
  ["object", "Objects", "object"],
  ["spawn", "Spawns", "area"],
  ["name", "Names", "spell"],
];
const TRY: Record<string, [string, number, string][]> = {
  classic: [
    ["creature", 448, "Hogger"],
    ["quest", 182, "The Troll Cave"],
    ["item", 2589, "Linen Cloth"],
    ["object", 1617, "Silverleaf"],
    ["area", 12, "Elwynn Forest"],
    ["faction", 72, "Stormwind"],
  ],
  forever: [
    ["quest", 92470, "Foul Matriarch"],
    ["creature", 251366, "Aetheen of the Gales"],
    ["area", 16593, "Zephras Isle"],
    ["creature", 448, "Hogger"],
    ["item", 2589, "Linen Cloth"],
    ["object", 1617, "Silverleaf"],
  ],
};

/** The databases at a glance: the two games, their sources, places to start. */
export function Home() {
  const { info, game } = useApp();
  const { data: queries } = useApi<SavedQuery[]>("/api/queries");
  return (
    <div className="flex flex-col gap-6">
      <header className="panel relative overflow-hidden px-7 py-6">
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-10 size-72 rounded-full bg-gold/[0.08] blur-3xl" />
        <div className="relative">
          <h1 className="title text-[28px]">The game's database</h1>
          <p className="mt-2 max-w-2xl leading-relaxed text-dim">
            Every quest, creature, item and object of both games, their names in eleven languages, where they stand and what they drop. Built from three sources: the client, Questie and the Classic database. Ids everywhere: every link
            here is one.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(info?.games ?? []).map((g) => (
          <a
            key={g.game}
            href={href(g.game)}
            className={`panel block px-5 py-4 transition-colors ${g.game === game ? "border-gold-soft/50" : "opacity-80 hover:opacity-100"}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="title text-lg">{GAME_NAMES[g.game]}</h2>
              {g.built && <span className="text-[11.5px] text-faint">built {ago(g.builtAt)}</span>}
            </div>
            {g.built ? (
              <>
                <p className="mt-0.5 font-mono text-[11.5px] text-faint">{g.sources.find((s) => s.name === "client")?.version}</p>
                <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3">
                  {COUNTS.map(([key, label, icon]) => (
                    <div key={key}>
                      <dt className="flex items-center gap-1.5 text-[11.5px] text-faint">
                        <KindIcon kind={icon} className="size-3" />
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-[17px] font-semibold text-parchment tabular-nums">{num(g.counts[key])}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="mt-2 text-blood">Not built yet: bun bin/build.ts {g.game}</p>
            )}
          </a>
        ))}
        {!info && [0, 1].map((i) => <Skeleton key={i} className="h-44" />)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Start somewhere" bodyClass="p-2">
          <ul className="grid grid-cols-2 gap-0.5">
            {TRY[game].map(([kind, id, name]) => (
              <li key={`${kind}:${id}`}>
                <a href={href(game, kind, id)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-white/[0.04]">
                  <KindIcon kind={kind} />
                  <span className="truncate">{name}</span>
                  <span className="ml-auto font-mono text-[11px] text-faint">{id}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Saved queries" action={<a href={href(game, "sql")} className="btn btn-ghost btn-sm">Console</a>} bodyClass="p-2">
          <ul>
            {(queries ?? []).slice(0, 7).map((q) => (
              <li key={q.id}>
                <a href={href(game, "sql", { saved: q.id })} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-white/[0.04]">
                  <TerminalSquare className="size-4 shrink-0 text-faint" aria-hidden />
                  <span className="truncate">{q.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {info?.games.find((g) => g.game === game && g.built) && (
        <Panel title="Sources" bodyClass="">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Pinned at</th>
                <th>License</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(info.games.find((g) => g.game === game) as Extract<NonNullable<typeof info>["games"][number], { built: true }>).sources.map((s) => (
                <tr key={s.name}>
                  <td className="font-medium">{s.name}</td>
                  <td className="font-mono text-[12px] text-dim">{short(s.version)}</td>
                  <td className="text-dim">{s.license}</td>
                  <td className="text-right">
                    {s.url && (
                      <a href={/^[0-9a-f]{40}$/.test(s.version) ? `${s.url}/tree/${s.version}` : s.url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-[12px] text-dim">
                        {new URL(s.url).host}
                        <ArrowUpRight className="size-3" aria-hidden />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
