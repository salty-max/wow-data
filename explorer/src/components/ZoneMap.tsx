import { useEffect, useMemo, useState } from "react";
import { Pills, RefLink } from "@/components/ui";
import { useApp } from "@/lib/app";
import type { MapGroup } from "@/lib/types";

const SOURCE_COLOR: Record<string, string> = { questie: "#ffd23f", classicdb: "#4ea1ff" };

/**
 * Where a thing stands: the zone's map as the game draws it (the client's
 * own art, every area explored; a grid where it has none), its spawns as
 * dots by source, its walks as lines. One map at a time, the busiest first.
 */
export function ZoneMap({ maps, unplaced }: { maps: MapGroup[]; unplaced: number }) {
  const [at, setAt] = useState(0);
  const { game } = useApp();
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);
  const map = maps[Math.min(at, maps.length - 1)];
  const art = map?.ref.kind === "ui_map" ? `/api/${game}/map/${map.ref.id}.png` : null;
  const [artState, setArt] = useState<"loading" | "ok" | "none">("loading");
  useEffect(() => setArt(art ? "loading" : "none"), [art]);
  const sources = useMemo(() => [...new Set(maps.flatMap((m) => [...m.points.map((p) => p.source), ...m.paths.map((p) => p.source)]))], [maps]);
  if (!map) return <p className="text-dim">{unplaced} spawns on no map the client draws.</p>;
  // (the game's maps are 1002 × 668: 3:2)
  const W = 150,
    H = 100;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {maps.length > 1 ? (
          <Pills
            label="Maps"
            value={String(at)}
            onChange={(v) => setAt(Number(v))}
            options={maps.map((m, i) => ({ id: String(i), label: `${m.ref.name ?? m.ref.id} · ${m.points.length}` }))}
          />
        ) : (
          <RefLink r={map.ref} />
        )}
        <div className="ml-auto flex items-center gap-3 text-[11.5px] text-dim">
          {sources.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: SOURCE_COLOR[s] ?? "var(--color-dim)" }} />
              {s}
            </span>
          ))}
          {unplaced > 0 && <span className="text-faint">+{unplaced} off the maps</span>}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-edge bg-[radial-gradient(ellipse_at_center,rgb(242_193_78/0.05),transparent_70%),linear-gradient(180deg,#0f1015,#0b0c10)]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block aspect-[3/2] w-full" role="img" aria-label={`Spawns on ${map.ref.name ?? "the map"}`}>
          <defs>
            <pattern id="grid" width={W / 10} height={H / 10} patternUnits="userSpaceOnUse">
              <path d={`M ${W / 10} 0 L 0 0 0 ${H / 10}`} fill="none" stroke="rgb(255 255 255 / 0.05)" strokeWidth="0.15" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#grid)" />
          {art && artState !== "none" && (
            <image href={art} width={W} height={H} preserveAspectRatio="none" onLoad={() => setArt("ok")} onError={() => setArt("none")} opacity={artState === "ok" ? 1 : 0} className="transition-opacity duration-300" />
          )}
          {artState === "ok" && <rect width={W} height={H} fill="rgb(11 12 16 / 0.18)" />}
          {map.paths.map((p, i) => (
            <polyline
              key={i}
              points={p.points.map(([x, y]) => `${(x / 100) * W},${(y / 100) * H}`).join(" ")}
              fill="none"
              stroke={SOURCE_COLOR[p.source] ?? "var(--color-dim)"}
              strokeOpacity="0.85"
              strokeWidth="0.4"
              strokeLinejoin="round"
              strokeDasharray="1 0.6"
            />
          ))}
          {map.points.map((p, i) => (
            <g key={i}>
              <circle cx={(p.x / 100) * W} cy={(p.y / 100) * H} r="1.7" fill={SOURCE_COLOR[p.source] ?? "var(--color-dim)"} opacity="0.22" />
              <circle
                cx={(p.x / 100) * W}
                cy={(p.y / 100) * H}
                r="0.85"
                fill={SOURCE_COLOR[p.source] ?? "var(--color-dim)"}
                stroke="#0b0c10"
                strokeWidth="0.3"
                onMouseEnter={() => setHover({ x: p.x, y: p.y, label: `${p.x.toFixed(1)}, ${p.y.toFixed(1)} · ${p.source}${p.spawn ? ` · spawn ${p.spawn}` : ""}` })}
                onMouseLeave={() => setHover(null)}
                className="cursor-crosshair"
              />
            </g>
          ))}
        </svg>
        {hover && (
          <span
            className="pointer-events-none absolute rounded-md border border-edge bg-stone-2/95 px-2 py-1 font-mono text-[11px] whitespace-nowrap text-parchment shadow-lg"
            style={{ left: `${hover.x}%`, top: `${hover.y}%`, transform: `translate(${hover.x > 70 ? "-105%" : "8px"}, -130%)` }}
          >
            {hover.label}
          </span>
        )}
        {art && artState === "loading" && <span className="pointer-events-none absolute right-3 bottom-2 text-[11px] text-faint">Drawing the map from the client…</span>}
        {artState === "none" && <span className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-faint">{map.ref.name} · no art in the client</span>}
      </div>
    </div>
  );
}
