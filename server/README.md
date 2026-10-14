# The facts inbox

What the game told the players who said yes to the addons' opt-in
("Share what you see" in Hearthtale, Lorekeeper's Codex, Yonder and Second
Wind), sent by Ravenpost, held here until wow-data's daily job merges it into
`data/players` (`bin/players.ts`, `.github/workflows/players.yml`). No
database: each upload is a file in a private Vercel Blob store, and goes once
merged.

- `POST /api/facts`: an addon's collect table, from a player signed in with
  Battle.net (`Authorization: Bearer <token>`), flattened and checked
  (`src/facts.ts`), dropped in the inbox (`src/inbox.ts`).
- `GET /api/login?port=&nonce=` and `/api/login/callback`: Ravenpost's sign-in
  (`src/auth.ts`). Battle.net signs the player in, the inbox hands Ravenpost a
  signed token (the account's id keyed with `FACTS_SECRET`, its BattleTag) on
  `http://127.0.0.1:<port>/linked`. Nothing is kept: the token is only checked.
- `GET /api/inbox/list`, `POST /api/inbox/read`, `POST /api/inbox/done`: for
  wow-data's daily job, behind `FACTS_TOKEN`.

## Running it here

```bash
bun install
FACTS_DEV=1 FACTS_TOKEN=local bun run dev   # http://localhost:3003, uploads in .inbox/
bun run check                               # typecheck, tests
```

`FACTS_DEV=1` signs Ravenpost in as a test account without Battle.net (never
on Vercel). Ravenpost's development build sends to `http://localhost:3003`.

## Setting it up on Vercel

1. A Vercel project from this repository, root directory `server` (its
   `vercel.json` builds it), and a private Blob store connected to it
   (Storage, Create, Blob, private).
2. A Battle.net app on develop.battle.net, its redirect URL
   `https://<the inbox's address>/api/login/callback`.
3. The project's environment variables:
   - `FACTS_ORIGIN`: the inbox's address (`https://…`, no trailing slash)
   - `BNET_CLIENT_ID`, `BNET_CLIENT_SECRET`: the Battle.net app's
   - `FACTS_SECRET`: a long random string (`openssl rand -hex 32`); it keys the
     accounts and signs the tokens, so changing it signs every player out
   - `FACTS_TOKEN`: another one, for wow-data's daily job
   - `FACTS_BLOCKED` (optional): accounts refused, comma-separated (a token's
     `sub`)
4. In wow-data's GitHub settings: the variable `FACTS_SERVER` (the inbox's
   address) and the secret `FACTS_TOKEN` (the same as on Vercel).
5. Ravenpost's release build: `FACTS=https://<the inbox's address>` (its
   `scripts/build.sh`).
