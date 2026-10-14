// The console's queries: each in a worker, stopped after a while or when the
// page gives up on it.
import { dbPath } from "../../src/db";
import type { Game } from "../../src/pins";
import type { SqlRequest, SqlResult } from "./sql-worker";

const TIMEOUT = 30_000;

export function runSql(game: Game, sql: string, limit: number, signal: AbortSignal): Promise<SqlResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./sql-worker.ts", import.meta.url).href);
    let settled = false;
    const done = (r: SqlResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(r);
    };
    const timer = setTimeout(() => done({ error: `Stopped after ${TIMEOUT / 1000} s` }), TIMEOUT);
    signal.addEventListener("abort", () => done({ error: "Cancelled" }));
    worker.onmessage = (e: MessageEvent<SqlResult>) => done(e.data);
    worker.onerror = (e) => done({ error: e.message });
    worker.postMessage({ file: dbPath(game), sql, limit } satisfies SqlRequest);
  });
}
