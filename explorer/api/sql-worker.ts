// One query, in its own thread: the server stops a runaway one by ending the
// thread (SQLite has no other way out from JavaScript). Read only.
import { Database } from "bun:sqlite";

declare const self: Worker;

export type SqlRequest = { file: string; sql: string; limit: number };
export type SqlResult =
  | { columns: string[]; rows: unknown[][]; truncated: boolean; ms: number }
  | { error: string; ms?: number };

self.onmessage = (e: MessageEvent<SqlRequest>) => {
  const { file, sql, limit } = e.data;
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  let db: Database | undefined;
  try {
    db = new Database(file, { readonly: true });
    // a query, without its closing semicolons: wrapped, for the limit (a
    // newline before the bracket, for a last line's comment); anything else
    // (PRAGMA, EXPLAIN) as it is
    const body = sql.trim().replace(/;+\s*$/, "");
    const select = /^(with|select|values)\b/i.test(body.replace(/^(\s*--[^\n]*\n|\s*\/\*[\s\S]*?\*\/)*/g, "").trimStart());
    const stmt = db.prepare(select ? `SELECT * FROM (\n${body}\n) LIMIT ${limit + 1}` : body);
    const rows = (stmt.values() as unknown[][]).map((r) => r.map((v) => (v instanceof Uint8Array ? `<blob, ${v.byteLength} bytes>` : typeof v === "bigint" ? Number(v) : v)));
    const truncated = rows.length > limit;
    self.postMessage({ columns: stmt.columnNames, rows: rows.slice(0, limit), truncated, ms: ms() } satisfies SqlResult);
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err), ms: ms() } satisfies SqlResult);
  } finally {
    db?.close();
  }
};
