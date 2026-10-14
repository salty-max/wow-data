import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { KindIcon } from "@/components/ui";
import { useApp } from "@/lib/app";
import { linkKind } from "@/lib/links";
import { href } from "@/lib/route";

type Props = {
  columns: string[];
  rows: unknown[][];
  table?: string;
  sort?: { column?: string; desc?: boolean; onSort: (column: string) => void };
  className?: string;
};

/**
 * Rows as the database has them: a column's ids linked to their things'
 * pages (quest_id, item_id, a row's kind...), numbers in mono, null as null,
 * a long text cut and opened on a click.
 */
export function DataGrid({ columns, rows, table, sort, className = "" }: Props) {
  const { game, info } = useApp();
  const kinds = info?.kinds ?? {};
  const numeric = columns.map((_, i) => rows.some((r) => typeof r[i] === "number") && rows.every((r) => r[i] == null || typeof r[i] === "number"));
  return (
    <div className={`overflow-auto ${className}`}>
      <table className="grid-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={numeric[i] ? "text-right" : ""}>
                {sort ? (
                  <button type="button" onClick={() => sort.onSort(c)} className={`inline-flex items-center gap-1 hover:text-parchment ${sort.column === c ? "text-gold" : ""}`}>
                    {c}
                    {sort.column === c && (sort.desc ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" aria-hidden />)}
                  </button>
                ) : (
                  c
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const obj: Record<string, unknown> = {};
            columns.forEach((c, i) => (obj[c] = r[i]));
            return (
              <tr key={ri}>
                {r.map((v, i) => {
                  const kind = linkKind(columns[i], v, obj, table, kinds);
                  return (
                    <td key={i} className={numeric[i] ? "text-right" : ""}>
                      {kind ? (
                        <a href={href(game, kind, v as number)} className="link inline-flex items-center gap-1 font-mono text-[12.5px] text-gold/90 tabular-nums hover:text-gold">
                          <KindIcon kind={kind} className="size-3" />
                          {String(v)}
                        </a>
                      ) : (
                        <Value v={v} />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Value({ v }: { v: unknown }) {
  const [open, setOpen] = useState(false);
  if (v == null) return <span className="font-mono text-[12px] text-faint/70">null</span>;
  if (typeof v === "number") return <span className="font-mono text-[12.5px] tabular-nums">{Number.isInteger(v) ? v : Math.round(v * 10000) / 10000}</span>;
  const s = String(v);
  if (s.length <= 90) return <span className="whitespace-pre-wrap">{s}</span>;
  return (
    <button type="button" onClick={() => setOpen(!open)} className="block max-w-[38rem] text-left" title={open ? "Fold" : "Show all"}>
      <span className="whitespace-pre-wrap">{open ? s : `${s.slice(0, 90)}…`}</span>
    </button>
  );
}
