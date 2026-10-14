import { app } from "./app";

// Local: the inbox on PORT (3003), against `bun run db`'s Postgres.
const port = Number(process.env.PORT ?? 3003);
Bun.serve({ port, fetch: app.fetch });
console.log(`facts inbox on http://localhost:${port}`);
