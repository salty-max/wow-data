import {
  AlertTriangle,
  Box,
  Check,
  Copy,
  Flag,
  Gem,
  Globe2,
  type LucideIcon,
  Map as MapIcon,
  MapPinned,
  PawPrint,
  ScrollText,
  Sparkles,
  Tag,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useApp } from "@/lib/app";
import { href } from "@/lib/route";
import { type Cell, isRef, type Ref, type Tone } from "@/lib/types";

const KIND_ICONS: Record<string, [LucideIcon, string]> = {
  quest: [ScrollText, "text-k-quest"],
  creature: [PawPrint, "text-k-creature"],
  item: [Gem, "text-k-item"],
  object: [Box, "text-k-object"],
  area: [MapIcon, "text-k-area"],
  wmo_area: [MapIcon, "text-k-area"],
  ui_map: [MapPinned, "text-k-area"],
  map: [Globe2, "text-k-area"],
  spell: [Sparkles, "text-k-spell"],
  faction: [Flag, "text-k-faction"],
};

export function KindIcon({ kind, className = "size-4" }: { kind: string; className?: string }) {
  const [Icon, color] = KIND_ICONS[kind] ?? [Tag, "text-dim"];
  return <Icon className={`${className} shrink-0 ${color}`} aria-hidden />;
}

export const qualityClass = (q: number | undefined) => (q == null ? "" : ["text-q0", "text-q1", "text-q2", "text-q3", "text-q4", "text-q5", "text-q6", "text-q6"][q] ?? "");

/** A thing, linked to its page: icon, name (an item in its quality's color), level. */
export function RefLink({ r, icon = true, level = true, className = "" }: { r: Ref; icon?: boolean; level?: boolean; className?: string }) {
  const { game, kindLabel } = useApp();
  const name = r.name ?? `${kindLabel(r.kind)} ${r.id}`;
  return (
    <a
      href={href(game, r.kind, r.id)}
      className={`link group inline-flex max-w-full min-w-0 items-center gap-1.5 align-top ${className}`}
      title={`${kindLabel(r.kind)} ${r.id}${r.locale ? ` · ${r.locale}` : ""}`}
    >
      {icon && <KindIcon kind={r.kind} className="size-3.5 opacity-80 group-hover:opacity-100" />}
      <span className={`truncate ${r.name ? qualityClass(r.quality) : "text-dim italic"} ${r.removed ? "line-through decoration-blood/70" : ""}`}>{name}</span>
      {level && r.level && <span className="shrink-0 text-[11px] text-faint tabular-nums">{r.level}</span>}
    </a>
  );
}

const TONES: Record<Tone, string> = { dim: "text-dim", gold: "text-gold", ok: "text-ok", blood: "text-blood" };

/** A table cell from the API: a thing, a number, a word. */
export function CellView({ c }: { c: Cell }) {
  if (c == null || c === "") return <span className="text-faint">·</span>;
  if (isRef(c)) return <RefLink r={c} />;
  if (typeof c === "number") return <span className="font-mono text-[12.5px] tabular-nums">{c.toLocaleString("en-US")}</span>;
  if (typeof c === "string") return <SourceOrText s={c} />;
  return <span className={`${c.tone ? TONES[c.tone] : ""} ${c.mono ? "font-mono text-[12.5px]" : ""}`}>{c.text}</span>;
}

const SOURCES = new Set(["client", "questie", "classicdb", "wowhead"]);
function SourceOrText({ s }: { s: string }) {
  if (SOURCES.has(s)) return <SourceTag source={s} />;
  return <span>{s}</span>;
}

const SOURCE_STYLE: Record<string, string> = {
  client: "border-k-spell/30 text-k-spell/90",
  questie: "border-gold/30 text-gold/90",
  classicdb: "border-k-item/30 text-k-item/90",
  wowhead: "border-k-creature/30 text-k-creature/90",
};
export function SourceTag({ source }: { source: string }) {
  return <span className={`tag h-[18px] px-1.5 text-[10.5px] ${SOURCE_STYLE[source] ?? ""}`}>{source}</span>;
}

/** A panel with a title, its count, and what goes on its right. */
export function Panel({ title, count, action, children, className = "", bodyClass = "p-4" }: { title?: ReactNode; count?: number; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-2.5">
          {title && <h2 className="text-[13px] font-semibold text-parchment">{title}</h2>}
          {count != null && <span className="text-xs text-faint tabular-nums">{count.toLocaleString("en-US")}</span>}
          <div className="ml-auto flex items-center gap-1.5">{action}</div>
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-md ${className}`} />;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="panel flex items-start gap-3 border-blood/40 px-4 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-blood" aria-hidden />
      <p className="font-mono text-[13px] whitespace-pre-wrap text-parchment select-text">{message}</p>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-1 py-6 text-center text-dim">{children}</p>;
}

/** Copies a text, says so for a moment. */
export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm ${className}`}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? <Check className="size-3.5 text-ok" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}

/** A game text: its $tokens in gold, its line breaks kept. */
export function GameText({ text, className = "" }: { text: string; className?: string }) {
  // ($N a name, $C a class, $R a race, $gman:woman; by sex; $B a line
  // break, made one)
  const parts = text.replace(/\$[bB]/g, "\n").split(/(\$[gG][^;$]*;|\$[A-Za-z])/g);
  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {parts.map((p, i) =>
        i % 2 ? (
          <span key={i} className="token">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </p>
  );
}

/** Tabs as a row of pills. */
export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`h-6 rounded-full border px-2.5 text-[11.5px] font-medium transition-colors ${
            value === o.id ? "border-gold-soft/60 bg-gold/10 text-gold" : "border-white/10 text-dim hover:border-white/20 hover:text-parchment"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
