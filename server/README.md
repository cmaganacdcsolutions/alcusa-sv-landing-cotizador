# server/ (ADR-013)

Fastify 5 + TypeScript (strict, ESM), Node 24. Own npm package (not a workspace of the root).

## Commands (from the repo root, or `cd server`)
| Root | Server | What |
|---|---|---|
| `npm run server:dev` | `npm run dev` | API on 127.0.0.1:3001 (tsx watch, loads `server/.env`) |
| `npm run server:test` | `npm test` | unit + integration (alcusa_test, migrated by globalSetup) + type-level contract test |
| `npm run server:build` | `npm run build` | tsup to `dist/` |
| | `npm run typecheck` / `npm run lint` | tsc / eslint (no interpolated SQL, no console, no hardcoded secrets) |
| | `npm run db:migrate` / `db:grants` / `db:seed` | runner (forward-only, sha256, GET_LOCK) / table grants for the app account / dev fixtures (refuses NODE_ENV=production) |
| | `npm run db:setup-local` | once, with `MARIADB_ROOT_PASSWORD` in the shell: DBs + accounts + `server/.env` + migrate + grants |

## Local proxy
`astro.config.mjs` forwards `/api` and `ADMIN_BASE_PATH` (default `/dev-ops-local`) to `127.0.0.1:3001` through `vite.server.proxy`.
Verified in N0: **both `astro dev` and `astro preview` honor it** (Vite's preview proxy inherits `server.proxy`), so `SERVE_STATIC_DIR` is
not needed for local work. It remains as an opt-in dev/e2e single-origin mode (serves `dist/` from Fastify); config refuses it when `NODE_ENV=production`.

## Migrations
`server/db/migrations/NNNN_description.sql`, forward-only. The runner splits scripts into statements itself (handles quotes, comments,
`DELIMITER`), hashes the LF-normalized text (sha256) and aborts if an applied file changed or vanished. DDL is not transactional: write
re-runnable statements (`IF NOT EXISTS`). After a migration that adds a table, `db:migrate` refreshes `grants.sql` for `DB_APP_USER`
(and add the table to `grants.sql` in the same PR).

## Contracts
`src/modules/quotes/schemas.ts` holds the zod shapes of `QuoteFolioRequest` / `QuoteLoadResponse`; `test/contract.test-d.ts` fails
`npm run server:test` if they diverge from the FE types. N1/N2 add the business refinements on top.
