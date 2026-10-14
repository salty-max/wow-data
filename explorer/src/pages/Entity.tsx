import { ChevronRight, Database, TerminalSquare } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DataGrid } from "@/components/DataGrid";
import { CellView, CopyButton, Empty, ErrorBox, GameText, KindIcon, Panel, Pills, qualityClass, RefLink, Skeleton, SourceTag } from "@/components/ui";
import { ZoneMap } from "@/components/ZoneMap";
import { useApi } from "@/lib/api";
import { useApp } from "@/lib/app";
import { LOCALE_NAMES } from "@/lib/format";
import { href } from "@/lib/route";
import { type Entity as EntityData, type Fact, isRef, type Section } from "@/lib/types";

/** A thing's page: its header, facts, names in every language, sections, rows. */
export function Entity({ kind, id }: { kind: string; id: number }) {
  const { game, locale, remember } = useApp();
  const { data, error, loading } = useApi<EntityData>(`/api/${game}/entity/${kind}/${id}?locale=${locale}`);
  const e = data && data.ref.kind === kind && data.ref.id === id ? data : undefined;
  useEffect(() => {
    if (e) {
      remember(e.ref);
      document.title = `${e.ref.name ?? `${e.kindLabel} ${id}`} · explorer`;
    }
  }, [e, id, remember]);
  if (error) return <ErrorBox message={error} />;
  if (!e || (loading && !e)) return <EntitySkeleton />;
  return (
    <div className="flex flex-col gap-5">
      <Header e={e} />
      {(e.facts.length > 0 || e.names.length > 0) && (
        <div className={`grid grid-cols-1 items-start gap-5 ${e.facts.length && e.names.length ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
          {e.facts.length > 0 && <Facts facts={e.facts} />}
          {e.names.length > 0 && <Names e={e} />}
        </div>
      )}
      {e.sections.map((s, i) => (
        <SectionView key={`${s.title}:${i}`} s={s} />
      ))}
      {e.raw.length > 0 && <Raw e={e} />}
    </div>
  );
}

function Header({ e }: { e: EntityData }) {
  const { game } = useApp();
  const r = e.ref;
  return (
    <header className="panel relative overflow-hidden px-6 py-5">
      <div aria-hidden className="pointer-events-none absolute -top-20 -left-12 size-60 rounded-full bg-gold/[0.07] blur-3xl" />
      <div className="relative flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-edge bg-black/30">
          <KindIcon kind={r.kind} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[12px] text-faint">
            <span>{e.kindLabel}</span>
            <ChevronRight className="size-3" aria-hidden />
            <span className="font-mono text-dim select-all">{r.id}</span>
          </p>
          <h1 className={`mt-0.5 text-[26px] leading-tight ${r.kind === "item" && r.quality != null ? `font-display font-bold tracking-[0.02em] ${qualityClass(r.quality)}` : "title"}`}>
            {r.name ?? <span className="text-dim italic">No name</span>}
          </h1>
          {r.subname && <p className="mt-0.5 text-dim">&lt;{r.subname}&gt;</p>}
          {(e.badges.length > 0 || r.removed || r.level) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {r.level && r.kind !== "item" && <span className="tag border-gold/30 text-gold">Level {r.level}</span>}
              {e.badges.map((b, i) => (
                <span key={i} className={`tag ${b.tone === "gold" ? "border-gold/30 text-gold" : b.tone === "blood" ? "border-blood/40 text-blood" : ""}`}>
                  {b.text}
                </span>
              ))}
              {r.removed && <span className="tag border-blood/40 text-blood">Removed in Forever</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CopyButton text={String(r.id)} label="Id" />
          <a className="btn btn-sm" href={href(game, "sql", { sql: e.sql })}>
            <TerminalSquare className="size-3.5" aria-hidden />
            SQL
          </a>
        </div>
      </div>
    </header>
  );
}

function FactValue({ f }: { f: Fact }) {
  if (Array.isArray(f.value))
    return (
      <span className="flex flex-wrap gap-x-3 gap-y-1">
        {f.value.map((r) => (
          <RefLink key={`${r.kind}:${r.id}`} r={r} />
        ))}
      </span>
    );
  if (isRef(f.value)) return <RefLink r={f.value} />;
  return <span className={f.mono ? "font-mono text-[12.5px] select-all" : ""}>{typeof f.value === "number" && !f.mono ? f.value.toLocaleString("en-US") : f.value}</span>;
}

function Facts({ facts }: { facts: Fact[] }) {
  return (
    <Panel title="Facts" bodyClass="px-4 py-3.5">
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-x-6 gap-y-3.5">
        {facts.map((f, i) => (
          <div key={i} className={`min-w-0 ${String(f.value).length > 60 || (Array.isArray(f.value) && f.value.length > 3) ? "col-span-full" : ""}`}>
            <dt className="label">{f.label}</dt>
            <dd className="mt-1 text-[13.5px]">
              <FactValue f={f} />
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function Names({ e }: { e: EntityData }) {
  const { locale } = useApp();
  // (a source named only where it isn't English's: Wowhead's French, say)
  const usual = e.names.find((n) => n.locale === "enUS")?.source ?? e.names[0]?.source;
  return (
    <Panel title="In every language" count={e.names.length} action={usual && <SourceTag source={usual} />} bodyClass="py-1.5">
      <ul className="grid grid-cols-1 sm:grid-cols-2">
        {e.names.map((n) => (
          <li key={n.locale} className={`flex min-w-0 items-baseline gap-3 px-4 py-1 ${n.locale === locale ? "bg-gold/[0.05]" : ""}`}>
            <span className="w-11 shrink-0 font-mono text-[11px] text-faint" title={LOCALE_NAMES[n.locale]}>
              {n.locale}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] select-text" title={[n.name, n.female, n.subname].filter(Boolean).join(" / ")}>
              {n.name}
              {n.female && n.female !== n.name && <span className="text-dim"> / {n.female}</span>}
              {n.subname && <span className="text-faint"> &lt;{n.subname}&gt;</span>}
            </span>
            {n.source !== usual && <SourceTag source={n.source} />}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function SectionView({ s }: { s: Section }) {
  switch (s.type) {
    case "refs":
      return (
        <Panel title={s.title} count={s.count ?? s.refs.length}>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-5 gap-y-1.5">
            {s.refs.map((r) => (
              <li key={`${r.kind}:${r.id}:${r.note ?? ""}`} className="flex min-w-0 items-center gap-2 text-[13.5px]">
                <RefLink r={r} className="min-w-0" />
                {r.note && (r.note === "questie" || r.note === "classicdb" || r.note === "client" || r.note === "wowhead" ? <SourceTag source={r.note} /> : <span className="text-[11.5px] text-faint">{r.note}</span>)}
              </li>
            ))}
          </ul>
          {s.more && <p className="mt-3 text-[12px] text-faint">and {s.more.toLocaleString("en-US")} more</p>}
        </Panel>
      );
    case "table":
      return (
        <Panel title={s.title} count={s.count ?? s.rows.length} bodyClass="">
          <div className="max-h-[32rem] overflow-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  {s.columns.map((c, i) => (
                    <th key={i} className={c.align === "right" ? "text-right" : ""}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r, i) => (
                  <Fragment key={i}>
                    {r.group && r.group !== s.rows[i - 1]?.group && (
                      <tr>
                        <td colSpan={s.columns.length} className="bg-white/[0.02] text-[11.5px] font-medium text-dim">
                          {r.group}
                        </td>
                      </tr>
                    )}
                    <tr>
                      {r.cells.map((c, j) => (
                        <td key={j} className={`${s.columns[j]?.align === "right" ? "text-right" : ""} ${j === 0 ? "max-w-[24rem]" : ""}`}>
                          <CellView c={c} />
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {s.more && <p className="border-t border-white/[0.05] px-4 py-2 text-[12px] text-faint">and {s.more.toLocaleString("en-US")} more (the SQL console has them all)</p>}
        </Panel>
      );
    case "map":
      return (
        <Panel title={s.title} count={s.count}>
          <ZoneMap maps={s.maps} unplaced={s.unplaced} />
        </Panel>
      );
    case "chain":
      return (
        <Panel title={s.title} count={s.count}>
          <ol className="flex flex-wrap items-center gap-y-2">
            {s.steps.map((r, i) => (
              <li key={r.id} className="flex items-center">
                {i > 0 && <ChevronRight className="mx-1.5 size-3.5 shrink-0 text-faint" aria-hidden />}
                {r.id === s.current ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 text-[13px] text-gold">
                    <KindIcon kind="quest" className="size-3.5" />
                    {r.name}
                  </span>
                ) : (
                  <span className="rounded-md border border-transparent px-2 py-0.5 text-[13px]">
                    <RefLink r={r} level={false} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </Panel>
      );
    case "texts":
      return <Texts s={s} />;
    case "pages":
      return <Pages s={s} />;
  }
}

function useLocaleTab(available: string[]) {
  const { locale } = useApp();
  const [tab, setTab] = useState<string | null>(null);
  const pick = tab && available.includes(tab) ? tab : available.includes(locale) ? locale : available.includes("enUS") ? "enUS" : available[0];
  return [pick, setTab] as const;
}

function Texts({ s }: { s: Extract<Section, { type: "texts" }> }) {
  const locales = useMemo(() => [...new Set(s.fields.flatMap((f) => Object.keys(f.texts)))].sort((a, b) => (a === "enUS" ? -1 : b === "enUS" ? 1 : a.localeCompare(b))), [s]);
  const [tab, setTab] = useLocaleTab(locales);
  return (
    <Panel title={s.title} action={locales.length > 1 && <Pills label="Language" value={tab} onChange={setTab} options={locales.map((l) => ({ id: l, label: l }))} />}>
      <div className="flex flex-col gap-4">
        {s.fields
          .filter((f) => f.texts[tab])
          .map((f) => (
            <div key={f.label}>
              <p className="label">{f.label}</p>
              <GameText text={f.texts[tab]} className="mt-1 max-w-3xl text-[14px] leading-relaxed text-parchment/90 select-text" />
            </div>
          ))}
        {s.fields.every((f) => !f.texts[tab]) && <Empty>No text in {tab}.</Empty>}
      </div>
    </Panel>
  );
}

function Pages({ s }: { s: Extract<Section, { type: "pages" }> }) {
  const locales = Object.keys(s.pages);
  const [tab, setTab] = useLocaleTab(locales);
  const pages = s.pages[tab] ?? [];
  return (
    <Panel title={s.title} count={pages.length} action={locales.length > 1 && <Pills label="Language" value={tab} onChange={setTab} options={locales.map((l) => ({ id: l, label: l }))} />}>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {pages.map((p, i) => (
          <li key={i} className="relative rounded-lg border border-edge-gold/40 bg-[linear-gradient(180deg,rgb(236_227_207/0.04),rgb(236_227_207/0.015))] px-5 pt-4 pb-6">
            <GameText text={p} className="font-display text-[14px] leading-relaxed text-parchment/90 select-text" />
            <span className="absolute right-3 bottom-2 font-mono text-[10.5px] text-faint">{i + 1}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Raw({ e }: { e: EntityData }) {
  const { game } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title={
        <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 hover:text-gold">
          <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
          The rows
        </button>
      }
      action={<span className="text-[12px] text-faint">{e.raw.map((r) => r.table).join(" · ")}</span>}
      bodyClass={open ? "flex flex-col gap-4 p-4" : "hidden"}
    >
      {e.raw.map((t) => (
        <div key={t.table}>
          <div className="mb-1.5 flex items-center gap-2">
            <Database className="size-3.5 text-faint" aria-hidden />
            <a className="link font-mono text-[12.5px] text-dim" href={href(game, "table", t.table, { f: `${t.key}:eq:${e.ref.id}` })}>
              {t.table}
            </a>
          </div>
          <div className="rounded-lg border border-edge">
            <DataGrid table={t.table} columns={Object.keys(t.rows[0] ?? {})} rows={t.rows.map((r) => Object.values(r))} />
          </div>
        </div>
      ))}
    </Panel>
  );
}

function EntitySkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="panel flex items-start gap-4 px-6 py-5">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
