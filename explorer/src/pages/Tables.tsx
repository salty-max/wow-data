import { ChevronLeft, ChevronRight, Eye, Filter as FilterIcon, Plus, Table2, TerminalSquare, X } from "lucide-react";
import { useMemo, useState } from "react";
import { DataGrid } from "@/components/DataGrid";
import { Empty, ErrorBox, Panel, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useApp } from "@/lib/app";
import { num } from "@/lib/format";
import { go, href } from "@/lib/route";
import type { Rows, TableInfo } from "@/lib/types";

// what each of wow-data's own tables holds (schema.sql)
const ABOUT: Record<string, string> = {
  name: "Every thing's name in every language",
  creature: "NPCs and monsters",
  object: "Game objects: chests, herbs, books, doors",
  spawn: "Where creatures and objects stand",
  path: "The ways creatures walk",
  item: "Items",
  loot: "What drops or gives what",
  vendor: "What vendors sell",
  quest: "Quests",
  quest_text: "Quests' texts, by language",
  quest_objective: "What quests ask",
  quest_relation: "Who starts and ends quests",
  quest_reward: "What quests give",
  trainer_spell: "What trainers teach",
  readable: "Books, notes, plaques",
  readable_page: "Their pages, by language",
  speech: "What NPCs say, by language",
  rare_zone: "Rares' zones",
  meta: "About the file",
  source: "The pinned sources",
  creature_en: "Creatures with their English names",
  quest_en: "Quests with their English titles",
  item_en: "Items with their English names",
};

/** Every table and view, wow-data's own and the client's. */
export function Tables() {
  const { game } = useApp();
  const { data, error } = useApi<TableInfo[]>(`/api/${game}/tables`);
  const [filter, setFilter] = useState("");
  const shown = (data ?? []).filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()) && t.name !== "sqlite_stat1");
  const own = shown.filter((t) => !t.name.startsWith("client_"));
  const client = shown.filter((t) => t.name.startsWith("client_"));
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-6">
        <div>
          <h1 className="title text-2xl">Tables</h1>
          <p className="mt-1.5 text-dim">wow-data's own tables, then the client's, imported whole.</p>
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter tables" className="field w-56" aria-label="Filter tables" />
      </header>
      {error && <ErrorBox message={error} />}
      {!data && !error && <Skeleton className="h-96" />}
      {data && (
        <>
          <TableList title="wow-data" tables={own} />
          <TableList title="The client's" tables={client} />
        </>
      )}
    </div>
  );
}

function TableList({ title, tables }: { title: string; tables: TableInfo[] }) {
  const { game } = useApp();
  if (!tables.length) return null;
  return (
    <Panel title={title} count={tables.length} bodyClass="p-2">
      <ul className="grid gap-0.5 md:grid-cols-2">
        {tables.map((t) => (
          <li key={t.name}>
            <a href={href(game, "table", t.name)} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.04]">
              {t.type === "view" ? <Eye className="size-4 shrink-0 text-faint" aria-hidden /> : <Table2 className="size-4 shrink-0 text-faint" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[13px] text-parchment">{t.name}</span>
                <span className="block truncate text-[12px] text-faint">{ABOUT[t.name] ?? `${t.columns.length} columns`}</span>
              </span>
              <span className="shrink-0 text-[12px] text-dim tabular-nums">{t.rows != null ? num(t.rows) : "view"}</span>
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const OPS: [string, string][] = [
  ["eq", "="],
  ["ne", "≠"],
  ["lt", "<"],
  ["gt", ">"],
  ["contains", "contains"],
  ["starts", "starts with"],
  ["null", "is null"],
  ["notnull", "is not null"],
];
const PAGE = 50;

/** A table's rows: filtered, sorted, a page at a time; its SQL one click away. */
export function Table({ name }: { name: string }) {
  const { game, route } = useApp();
  const params = route.params;
  const filters = params.getAll("f");
  const sort = params.get("sort") ?? "";
  const desc = params.get("desc") === "1";
  const page = Math.max(Number(params.get("page")) || 1, 1);
  const { data: tables } = useApi<TableInfo[]>(`/api/${game}/tables`);
  const info = tables?.find((t) => t.name === name);
  const query = new URLSearchParams();
  for (const f of filters) query.append("f", f);
  if (sort) query.set("sort", sort);
  if (desc) query.set("desc", "1");
  query.set("limit", String(PAGE));
  query.set("offset", String((page - 1) * PAGE));
  const { data, error, loading } = useApi<Rows>(`/api/${game}/rows/${encodeURIComponent(name)}?${query}`);

  const nav = (change: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(params);
    change(p);
    go(href(game, "table", name, p));
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[12px] text-faint">
            <a href={href(game, "tables")} className="link text-faint">
              Tables
            </a>
          </p>
          <h1 className="mt-0.5 truncate font-mono text-[22px] font-semibold text-gold">{name}</h1>
          <p className="mt-1 text-dim">
            {ABOUT[name] ?? info?.type ?? ""}
            {data && (
              <span className="text-faint">
                {" · "}
                {num(data.total)} rows{filters.length ? " match" : ""} · {data.ms} ms
              </span>
            )}
          </p>
        </div>
        {data && (
          <a className="btn btn-sm shrink-0" href={href(game, "sql", { sql: data.sql })}>
            <TerminalSquare className="size-3.5" aria-hidden />
            Open in SQL
          </a>
        )}
      </header>

      <Filters
        columns={info?.columns.map((c) => c.name) ?? data?.columns ?? []}
        filters={filters}
        onChange={(next) =>
          nav((p) => {
            p.delete("f");
            for (const f of next) p.append("f", f);
            p.delete("page");
          })
        }
      />

      {error && <ErrorBox message={error} />}
      <div className={`panel overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
        {data ? (
          data.rows.length ? (
            <DataGrid
              table={name}
              columns={data.columns}
              rows={data.rows}
              className="max-h-[calc(100vh-17rem)]"
              sort={{
                column: sort,
                desc,
                onSort: (c) =>
                  nav((p) => {
                    if (sort === c && !desc) p.set("desc", "1");
                    else if (sort === c && desc) {
                      p.delete("sort");
                      p.delete("desc");
                    } else {
                      p.set("sort", c);
                      p.delete("desc");
                    }
                    p.delete("page");
                  }),
              }}
            />
          ) : (
            <Empty>No rows.</Empty>
          )
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        )}
        {data && data.total > PAGE && (
          <footer className="flex items-center justify-between border-t border-white/[0.05] px-4 py-2 text-[12.5px] text-dim">
            <span className="tabular-nums">
              {num((page - 1) * PAGE + 1)}–{num(Math.min(page * PAGE, data.total))} of {num(data.total)}
            </span>
            <span className="flex items-center gap-1">
              <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => nav((p) => p.set("page", String(page - 1)))}>
                <ChevronLeft className="size-4" aria-hidden />
                Previous
              </button>
              <span className="px-1 text-faint tabular-nums">
                {page} / {num(pages)}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => nav((p) => p.set("page", String(page + 1)))}>
                Next
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}

/** The filters, as chips; a new one: a column, an operator, a value. */
function Filters({ columns, filters, onChange }: { columns: string[]; filters: string[]; onChange: (f: string[]) => void }) {
  const [column, setColumn] = useState("");
  const [op, setOp] = useState("eq");
  const [value, setValue] = useState("");
  const col = column || columns[0] || "";
  const parsed = useMemo(
    () =>
      filters.map((f) => {
        const [c, o, ...v] = f.split(":");
        return { c, o, v: v.join(":") };
      }),
    [filters],
  );
  const needsValue = op !== "null" && op !== "notnull";
  const add = () => {
    if (!col || (needsValue && value === "")) return;
    onChange([...filters, `${col}:${op}:${needsValue ? value : ""}`]);
    setValue("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterIcon className="size-4 text-faint" aria-hidden />
      {parsed.map((f, i) => (
        <span key={i} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-gold/30 bg-gold/[0.06] pr-1 pl-3 text-[12.5px]">
          <span className="font-mono text-gold">{f.c}</span>
          <span className="text-dim">{OPS.find(([k]) => k === f.o)?.[1] ?? f.o}</span>
          {f.v && <span className="font-mono text-parchment">{f.v}</span>}
          <button type="button" aria-label="Remove the filter" onClick={() => onChange(filters.filter((_, j) => j !== i))} className="grid size-5 place-items-center rounded-full text-dim hover:bg-white/10 hover:text-parchment">
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <select className="field h-7 py-0 font-mono text-[12.5px]" value={col} onChange={(e) => setColumn(e.target.value)} aria-label="Column">
          {columns.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className="field h-7 py-0 text-[12.5px]" value={op} onChange={(e) => setOp(e.target.value)} aria-label="Operator">
          {OPS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        {needsValue && <input className="field h-7 w-36 font-mono text-[12.5px]" value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" aria-label="Value" />}
        <button type="submit" className="btn btn-sm">
          <Plus className="size-3.5" aria-hidden />
          Filter
        </button>
      </form>
    </div>
  );
}
