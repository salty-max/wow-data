import { Bookmark, Clock, Download, Loader2, Play, Save, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataGrid } from "@/components/DataGrid";
import { SqlEditor } from "@/components/SqlEditor";
import { CopyButton, Empty, ErrorBox, Panel } from "@/components/ui";
import { send, useApi } from "@/lib/api";
import { useApp } from "@/lib/app";
import { num } from "@/lib/format";
import type { SavedQuery, SqlResult, TableInfo } from "@/lib/types";

const DRAFT = "explorer.sql";
const HISTORY = "explorer.history";
const FIRST_SQL = `-- A zone's quests, by level (⌘↵ to run)
SELECT q.id, n.name AS title, q.level
FROM quest q
JOIN name n ON n.kind = 'quest' AND n.id = q.id AND n.locale = 'enUS'
WHERE q.zone_id = 12
ORDER BY q.level`;

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // (a private window)
  }
};

type Run = { sql: string; at: number; rows?: number; ms?: number; error?: boolean };

// the query's first table, for its id column's links (FROM quest q: quests)
const fromTable = (sql: string) => sql.replace(/--[^\n]*/g, "").match(/\bfrom\s+"?([A-Za-z_][A-Za-z0-9_]*)/i)?.[1];

const csv = (columns: string[], rows: unknown[][]) =>
  [columns, ...rows]
    .map((r) => r.map((v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v))).join(","))
    .join("\n");

/** The console: any read-only query on the game's database, saved ones kept in the repository. */
export function Sql() {
  const { game, route } = useApp();
  const { data: tables } = useApi<TableInfo[]>(`/api/${game}/tables`);
  const { data: loadedQueries } = useApi<SavedQuery[]>("/api/queries");
  const [saved, setSaved] = useState<SavedQuery[] | null>(null);
  const queries = saved ?? loadedQueries ?? [];
  const [text, setText] = useState(() => route.params.get("sql") ?? read(DRAFT, FIRST_SQL));
  const [ranSql, setRanSql] = useState("");
  const [limit, setLimit] = useState(1000);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<Run[]>(() => read(HISTORY, []));
  const [title, setTitle] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => write(DRAFT, text), [text]);

  const schema = useMemo(() => Object.fromEntries((tables ?? []).map((t) => [t.name, t.columns.map((c) => c.name)])), [tables]);

  const run = useCallback(async (given?: string) => {
    const sql = (given ?? text).trim();
    if (!sql) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setRunning(true);
    try {
      const r = await send<SqlResult>("POST", `/api/${game}/sql`, { sql, limit }, ac.signal);
      setResult(r);
      setRanSql(sql);
      const entry: Run = { sql, at: Date.now(), ...("error" in r ? { error: true } : { rows: r.rows.length, ms: r.ms }) };
      setRuns((list) => {
        const next = [entry, ...list.filter((x) => x.sql !== sql)].slice(0, 25);
        write(HISTORY, next);
        return next;
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setResult({ error: (e as Error).message });
    } finally {
      if (abort.current === ac) setRunning(false);
    }
  }, [text, game, limit]);
  // a link's query (?sql=, ?saved=: once the saved ones are in) replaces the
  // draft and runs
  const opened = useRef("");
  useEffect(() => {
    const id = route.params.get("saved");
    const q = id ? queries.find((x) => x.id === id) : undefined;
    const sql = route.params.get("sql") ?? q?.sql;
    const key = route.params.toString();
    if (!sql || opened.current === key) return;
    opened.current = key;
    setText(sql);
    if (q) setTitle(q.title);
    run(sql);
  }, [route.params, queries, run]);

  const saveAs = async () => {
    const name = title.trim() || text.split("\n")[0].replace(/^--\s*/, "").slice(0, 60) || "A query";
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `q${Date.now()}`;
    const next = [...queries.filter((q) => q.id !== id), { id, title: name, sql: text.trim() }];
    setSaved(await send<SavedQuery[]>("PUT", "/api/queries", next));
    setTitle(name);
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this saved query (explorer/queries.json)?")) return;
    setSaved(await send<SavedQuery[]>("PUT", "/api/queries", queries.filter((q) => q.id !== id)));
  };

  const ok = result && !("error" in result) ? result : null;
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="title text-2xl">SQL console</h1>
        <p className="mt-1.5 text-dim">Read only, SQLite. Tables and columns complete as you type, ⌘↵ runs. Ids in the results link to their pages.</p>
      </header>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="panel overflow-hidden">
            <div className="h-60 resize-y overflow-auto bg-black/25">
              <SqlEditor value={text} onChange={setText} onRun={run} schema={schema} />
            </div>
            <footer className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] px-3 py-2">
              {running ? (
                <button type="button" className="btn btn-sm" onClick={() => abort.current?.abort()}>
                  <Square className="size-3.5 fill-current" aria-hidden />
                  Stop
                </button>
              ) : (
                <button type="button" className="btn btn-gold btn-sm" onClick={() => run()}>
                  <Play className="size-3.5 fill-current" aria-hidden />
                  Run
                  <span className="text-[11px] opacity-70">⌘↵</span>
                </button>
              )}
              <label className="flex items-center gap-1.5 text-[12px] text-dim">
                at most
                <select className="field h-7 py-0 text-[12.5px]" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                  {[100, 1000, 10000].map((n) => (
                    <option key={n} value={n}>
                      {num(n)} rows
                    </option>
                  ))}
                </select>
              </label>
              <form
                className="ml-auto flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveAs();
                }}
              >
                <input className="field h-7 w-52 text-[12.5px]" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Its title, to save it" aria-label="Title" />
                <button type="submit" className="btn btn-sm" disabled={!text.trim()}>
                  <Save className="size-3.5" aria-hidden />
                  Save
                </button>
              </form>
            </footer>
          </section>

          {result && "error" in result && <ErrorBox message={result.error} />}
          {running && !result && (
            <p className="flex items-center gap-2 text-dim">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Running…
            </p>
          )}
          {ok && (
            <section className={`panel overflow-hidden transition-opacity ${running ? "opacity-60" : ""}`}>
              <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.05] px-4 py-2">
                <span className="text-[13px] font-semibold">{num(ok.rows.length)} rows</span>
                <span className="text-[12px] text-faint">{ok.ms} ms</span>
                {ok.truncated && <span className="tag border-gold/30 text-gold">the first {num(limit)}: there are more</span>}
                <span className="ml-auto flex items-center gap-1">
                  <CopyButton text={csv(ok.columns, ok.rows)} label="CSV" />
                  <CopyButton text={JSON.stringify(ok.rows.map((r) => Object.fromEntries(ok.columns.map((c, i) => [c, r[i]]))), null, 2)} label="JSON" />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(new Blob([csv(ok.columns, ok.rows)], { type: "text/csv" }));
                      a.download = `${game}-query.csv`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    <Download className="size-3.5" aria-hidden />
                    .csv
                  </button>
                </span>
              </header>
              {ok.rows.length ? <DataGrid columns={ok.columns} rows={ok.rows} table={fromTable(ranSql)} className="max-h-[calc(100vh-24rem)] min-h-40" /> : <Empty>No rows.</Empty>}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Panel title="Saved" count={queries.length} bodyClass="p-1.5">
            {queries.length === 0 && <Empty>None yet.</Empty>}
            <ul>
              {queries.map((q) => (
                <li key={q.id} className="group flex items-center rounded-md hover:bg-white/[0.04]">
                  <button
                    type="button"
                    onClick={() => {
                      setText(q.sql);
                      setTitle(q.title);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-[13px]"
                    title={q.sql}
                  >
                    <Bookmark className="size-3.5 shrink-0 text-gold/70" aria-hidden />
                    <span className="truncate">{q.title}</span>
                  </button>
                  <button type="button" onClick={() => remove(q.id)} aria-label={`Delete ${q.title}`} className="mr-1 hidden size-6 place-items-center rounded text-faint group-hover:grid hover:text-blood">
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {runs.length > 0 && (
            <Panel title="Lately run" bodyClass="p-1.5">
              <ul>
                {runs.slice(0, 12).map((r) => (
                  <li key={r.at}>
                    <button type="button" onClick={() => setText(r.sql)} className="flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-white/[0.04]" title={r.sql}>
                      <Clock className={`mt-0.5 size-3.5 shrink-0 ${r.error ? "text-blood/70" : "text-faint"}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[11.5px] text-dim">{r.sql.replace(/--[^\n]*\n/g, "").replace(/\s+/g, " ").trim()}</span>
                        <span className="block text-[11px] text-faint">{r.error ? "failed" : `${num(r.rows)} rows · ${r.ms} ms`}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <SchemaPanel tables={tables} onPick={(t) => setText(`SELECT * FROM ${t} LIMIT 100`)} />
        </aside>
      </div>
    </div>
  );
}

function SchemaPanel({ tables, onPick }: { tables: TableInfo[] | undefined; onPick: (t: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!tables) return null;
  const own = tables.filter((t) => !t.name.startsWith("client_") && t.name !== "sqlite_stat1");
  return (
    <Panel title="Schema" count={own.length} bodyClass="max-h-96 overflow-y-auto p-1.5">
      <ul>
        {own.map((t) => (
          <li key={t.name}>
            <button type="button" onClick={() => setOpen(open === t.name ? null : t.name)} onDoubleClick={() => onPick(t.name)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-white/[0.04]">
              <span className="font-mono text-[12.5px] text-parchment">{t.name}</span>
              <span className="ml-auto text-[11px] text-faint">{t.columns.length}</span>
            </button>
            {open === t.name && (
              <ul className="mb-1 ml-3 border-l border-white/[0.06] pl-2">
                {t.columns.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 py-0.5 font-mono text-[11.5px]">
                    <span className={c.pk ? "text-gold" : "text-dim"}>{c.name}</span>
                    <span className="ml-auto text-faint">{c.type.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
