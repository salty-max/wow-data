import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
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
 * pages (quest_id, item_id, a row's kind...), null as null, a long text cut
 * and opened on a click. Each column as wide as its widest value, the room
 * left to an empty last one; an id on the left as a name is, a quantity on
 * the right.
 */
export function DataGrid({ columns, rows, table, sort, className = "" }: Props) {
  const { game, info } = useApp();
  const kinds = info?.kinds ?? {};
  const { links, quantity } = useMemo(() => {
    const objs = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
    const links = rows.map((r, ri) => r.map((v, i) => linkKind(columns[i], v, objs[ri], table, kinds)));
    // (a column of numbers none of which is a thing's id: a count, a level, a chance)
    const quantity = columns.map(
      (_, i) => !links.some((l) => l[i]) && rows.some((r) => typeof r[i] === "number") && rows.every((r) => r[i] == null || typeof r[i] === "number"),
    );
    return { links, quantity };
  }, [columns, rows, table, kinds]);
  return (
    <div className={`overflow-auto ${className}`}>
      <table className="grid-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={quantity[i] ? "text-right" : ""}>
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
            {/* (the room left over, so no column is stretched) */}
            <th aria-hidden className="w-full" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((v, i) => {
                const kind = links[ri][i];
                return (
                  <td key={i} className={`whitespace-nowrap ${quantity[i] ? "text-right" : ""}`}>
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
              <td aria-hidden />
            </tr>
          ))}
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
  if (s.length <= 90 && !s.includes("\n")) return <span>{s}</span>;
  // (a long text: its start on one line, all of it on a click, wrapped)
  return (
    <button type="button" onClick={() => setOpen(!open)} className="block max-w-[38rem] text-left" title={open ? "Fold" : "Show all"}>
      <span className={open ? "whitespace-pre-wrap" : ""}>{open ? s : `${s.replace(/\s+/g, " ").slice(0, 90)}…`}</span>
    </button>
  );
}
