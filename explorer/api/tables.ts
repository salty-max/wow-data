// The tables, as datasette shows them: every table and view with its columns
// and rows, and a table's rows filtered, sorted and paged (the SQL it ran
// given back, for the console).
import type { Database } from "bun:sqlite";
import { HttpError, type Row } from "./db";

export type TableInfo = { name: string; type: "table" | "view"; rows: number | null; columns: { name: string; type: string; pk: boolean }[] };

const infos = new WeakMap<Database, TableInfo[]>();
export function tables(d: Database): TableInfo[] {
  let list = infos.get(d);
  if (!list) {
    const all = d.query("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Row[];
    list = all.map((t) => ({
      name: t.name,
      type: t.type,
      rows: t.type === "table" ? ((d.query(`SELECT count(*) n FROM "${t.name}"`).get() as Row).n as number) : null,
      columns: (d.query(`PRAGMA table_info("${t.name}")`).all() as Row[]).map((c) => ({ name: c.name, type: c.type, pk: c.pk > 0 })),
    }));
    infos.set(d, list);
  }
  return list;
}

export type Filter = { column: string; op: string; value?: string };
const OPS: Record<string, (c: string) => string> = {
  eq: (c) => `${c} = ?`,
  ne: (c) => `${c} != ?`,
  lt: (c) => `${c} < ?`,
  gt: (c) => `${c} > ?`,
  contains: (c) => `${c} LIKE '%' || ? || '%'`,
  starts: (c) => `${c} LIKE ? || '%'`,
  null: (c) => `${c} IS NULL`,
  notnull: (c) => `${c} IS NOT NULL`,
};
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const literal = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? v : `'${v.replaceAll("'", "''")}'`);

export function rows(
  d: Database,
  table: string,
  opts: { filters: Filter[]; sort?: string; desc?: boolean; limit: number; offset: number },
): { sql: string; columns: string[]; rows: unknown[][]; total: number; ms: number } {
  const started = performance.now();
  const info = tables(d).find((t) => t.name === table);
  if (!info) throw new HttpError(404, `No table called ${table}`);
  const known = new Set(info.columns.map((c) => c.name));
  const where: string[] = [];
  const shown: string[] = [];
  const params: (string | number)[] = [];
  for (const f of opts.filters) {
    if (!known.has(f.column) || !OPS[f.op]) throw new HttpError(400, `Bad filter on ${f.column}`);
    const clause = OPS[f.op](quote(f.column));
    where.push(clause);
    if (f.op !== "null" && f.op !== "notnull") {
      const v = f.value ?? "";
      params.push(/^-?\d+$/.test(v) && f.op !== "contains" && f.op !== "starts" ? Number(v) : v);
      shown.push(clause.replace("?", literal(v)));
    } else shown.push(clause);
  }
  if (opts.sort && !known.has(opts.sort)) throw new HttpError(400, `No column ${opts.sort}`);
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const orderSql = opts.sort ? ` ORDER BY ${quote(opts.sort)}${opts.desc ? " DESC" : ""}` : "";
  const stmt = d.query(`SELECT * FROM ${quote(table)}${whereSql}${orderSql} LIMIT ? OFFSET ?`);
  const values = stmt.values(...params, opts.limit, opts.offset) as unknown[][];
  const total = where.length || info.rows == null ? ((d.query(`SELECT count(*) n FROM ${quote(table)}${whereSql}`).get(...params) as Row).n as number) : info.rows;
  const sql = `SELECT * FROM ${quote(table)}${shown.length ? ` WHERE ${shown.join(" AND ")}` : ""}${orderSql}`;
  return { sql, columns: stmt.columnNames, rows: values, total, ms: Math.round(performance.now() - started) };
}
