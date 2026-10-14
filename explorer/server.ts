// The explorer: wow-data's two databases, searched and read in a browser.
//   bun run explore        (from wow-data: builds the page, then http://localhost:4100)
//   bun run explore:dev    (the page from Vite, hot, on :4101; this API on :4100)
// Read only, on this machine only (127.0.0.1).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { built, db, GAMES, gameOf, HttpError, LOCALES, metaOf, type Row } from "./api/db";
import { entity, KIND_LABELS } from "./api/entity";
import { mapImage } from "./api/mapart";
import { index, search } from "./api/search";
import { runSql } from "./api/sql";
import { type Filter, rows, tables } from "./api/tables";

const PORT = Number(process.env.EXPLORER_PORT) || 4100;
const DEV = process.argv.includes("--dev");
const DIST = path.join(import.meta.dir, "dist");
const QUERIES = path.join(import.meta.dir, "queries.json");

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

// (the counts take a second on the big tables: once a build)
const counted = new Map<string, Record<string, number>>();
function info() {
  return {
    locales: LOCALES,
    kinds: KIND_LABELS,
    games: GAMES.map((game) => {
      if (!built(game)) return { game, built: false };
      const d = db(game);
      const builtAt = metaOf(d, "built_at") ?? "";
      const key = `${game}:${builtAt}`;
      if (!counted.has(key)) {
        const count = (t: string) => (d.query(`SELECT count(*) n FROM ${t}`).get() as Row).n as number;
        counted.set(key, Object.fromEntries(["quest", "creature", "object", "item", "spawn", "loot", "name", "speech", "readable"].map((t) => [t, count(t)])));
      }
      return { game, built: true, builtAt, sources: d.query("SELECT * FROM source ORDER BY name").all(), counts: counted.get(key) };
    }),
  };
}

async function api(req: Request, url: URL): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean).slice(1).map(decodeURIComponent);
  const q = url.searchParams;
  const locale = LOCALES.includes(q.get("locale") ?? "") ? q.get("locale")! : "enUS";
  if (parts[0] === "info") return json(info());
  if (parts[0] === "queries") {
    if (req.method === "PUT") {
      const list = await req.json();
      if (!Array.isArray(list)) throw new HttpError(400, "A list of queries, please");
      writeFileSync(QUERIES, JSON.stringify(list, null, 2) + "\n");
      return json(list);
    }
    return json(existsSync(QUERIES) ? JSON.parse(readFileSync(QUERIES, "utf8")) : []);
  }
  const game = gameOf(parts[0] ?? "");
  switch (parts[1]) {
    case "search":
      return json(search(game, q.get("q") ?? "", { kind: q.get("kind") || undefined, locale, limit: Math.min(Number(q.get("limit")) || 40, 200) }));
    case "entity": {
      const id = Number(parts[3]);
      if (!parts[2] || !Number.isInteger(id)) throw new HttpError(400, "entity/<kind>/<id>");
      const e = entity(db(game), parts[2], id, locale);
      if (!e) throw new HttpError(404, `No ${parts[2]} ${id} in ${game}`);
      return json(e);
    }
    case "tables":
      return json(tables(db(game)));
    case "map": {
      const file = await mapImage(game, Number(parts[2]?.replace(/\.png$/, "")));
      if (!file) throw new HttpError(404, "No art for this map");
      return new Response(Bun.file(file), { headers: { "cache-control": "max-age=86400" } });
    }
    case "rows": {
      const filters: Filter[] = q.getAll("f").map((f) => {
        const [column, op, ...value] = f.split(":");
        return { column, op, value: value.join(":") };
      });
      return json(
        rows(db(game), parts[2], {
          filters,
          sort: q.get("sort") || undefined,
          desc: q.get("desc") === "1",
          limit: Math.min(Number(q.get("limit")) || 50, 500),
          offset: Math.max(Number(q.get("offset")) || 0, 0),
        }),
      );
    }
    case "sql": {
      if (req.method !== "POST") throw new HttpError(405, "POST a query");
      const body = (await req.json()) as { sql?: string; limit?: number };
      if (!body.sql?.trim()) throw new HttpError(400, "No query");
      return json(await runSql(game, body.sql, Math.min(body.limit ?? 1000, 10_000), req.signal));
    }
  }
  throw new HttpError(404, `No ${url.pathname}`);
}

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  idleTimeout: 60,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(req, url);
      } catch (err) {
        if (err instanceof HttpError) return json({ error: err.message }, err.status);
        console.error(err);
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }
    if (DEV) return new Response("The page is on Vite's server (bun run explore:dev)", { status: 404 });
    // the page: a file of the build, else the app (its routes are the hash's)
    const file = path.resolve(DIST, `.${decodeURIComponent(url.pathname)}`);
    if (url.pathname !== "/" && file.startsWith(DIST + path.sep) && existsSync(file)) return new Response(Bun.file(file));
    return new Response(Bun.file(path.join(DIST, "index.html")));
  },
});

// the names' indexes and the counts, before the first page needs them (a
// build's first run: ~5 s a game)
for (const game of GAMES) if (built(game)) index(game);
info();
console.log(`wow-data explorer: http://localhost:${server.port}${DEV ? " (API; the page: http://localhost:4101)" : ""}`);
