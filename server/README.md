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

## Quotes API (N1/N2)
| Endpoint | Success | Errors (envelope `{error:{code,message,fields?}}`) |
|---|---|---|
| `POST /api/quote-create` (<= 32 KB) | `201 {code,validUntil,total}` new, `200` same `idempotencyKey` + same cart | 400 malformed JSON, 409 `idempotency_conflict`, 413 `payload_too_large` (body > 32 KB or a `config` > 4096 bytes), 422 `invalid_request` / `invalid_customer` / `consent_required` (+ `fields`), 429 `rate_limited` + `Retry-After` (20/h per ip_hash, 5/h per WhatsApp HMAC) |
| `GET /api/quotes/:code` | `200 QuoteLoadResponse` (no PII, `expired` from the SV date) | 404 `not_found` (uniform: missing / cancelled), 422 `invalid_code` (no `quotes` read), 429 `rate_limited` + `Retry-After` (30 queries/h and 10 failures/h per ip_hash) |

All `/api/*` responses are `Cache-Control: no-store`. Rate limits live in the `rate_limits` table (HMAC with `IP_HASH_PEPPER`). Pricing is trusted from the client
(`pricing_source='client'`, ADR-011 §5): the server verifies `lineTotal == qty*unitPrice` and `sum(lineTotal) - discount.amount + transportFee == total` in cents, nothing more.
Optional (2026-10-06, migration `0002`): `discount: {code:'online_card_10', amount}` is recomputed server-side (10% of `sum(lineTotal)`, +-0.01; any other code or amount is `422 invalid_discount`), and `shippingPending: true` (delivery only) requires `transportFee == 0`. Both are persisted (`discount_code`, `discount_amount`, `shipping_pending`); the public GET is unchanged. Deploy order: `db:migrate` BEFORE restarting the new release (the old release keeps working on the new schema).
`npm run smoke:quotes` (server running on :3001) does POST -> replay -> GET with a FE-shaped request.

## FE http e2e (N2-FE)
`npm run test:e2e:http` (repo root): builds `dist-e2e/http` with `PUBLIC_QUOTE_API=http`, starts `npm run server:dev` (`NODE_ENV=test`, DB `alcusa_test`)
and `scripts/serve-static.mjs` (static + `/api` proxy via `API_ORIGIN`) on :4431, then runs `tests/e2e-http` on ios390/android412/desktop1920 (3 workers).
Credentials come from `server/.env` (loaded by `playwright.http.config.ts`). `server/scripts/e2e-db.ts` truncates `rate_limits` before the run and
back-dates `valid_until` for the expired case. All requests share one ip_hash (127.0.0.1), so a run uses ~15 of the 20 POST / 30 GET per hour; the run
starts with the counters at zero, so do not run it twice within seconds of another heavy client.

## Local MariaDB 11.4 + admin on MariaDB (ADR-014)
- Start/stop (user-mode process, no Windows service, bound to 127.0.0.1:3306): `scripts/mariadb-local.sh start|stop|status`.
  Data dir: `%LOCALAPPDATA%\alcusa-mariadb\data`. Root password: `server/.local/db.env` (gitignored, never printed).
- First time: `set -a; . .local/db.env; set +a; npm run db:setup-local` (DBs, accounts, migrations 0001-0004, grants; writes `server/.env`).
- Admin on MariaDB: `ADMIN_STORE=mariadb npm run admin:dev` (NODE_ENV=test would use alcusa_test).
- Load the promos that are live on the site into the admin: `ADMIN_STORE=mariadb npm run promos:import -- <site>/src/content/promotions.json [--dry-run] [--publish] [--site-public-dir <site>/public] [--allow-production]`.
  Idempotent upsert keyed by the promo `id` (`promotions.public_id`); every promo lands `published`, `sort_order` = position in the file; flyers (`-900` + `-600`
  webp) are copied byte-for-byte into `PROMO_IMAGES_DIR` and referenced as `PROMO_IMAGE_URL_PREFIX/<file>`. All-or-nothing validation (site rules + admin limits +
  3-active cap); placeholder promos are skipped; re-running converges edited/archived promos back to the file. `--dry-run` writes nothing. Refuses
  `NODE_ENV=production` without `--allow-production`. It does not rewrite promotions.json unless `--publish` (the next admin publish regenerates the same set).
  Promo links preselect `cotizador_params.color` (natural | blanco | bronce) and `.vidrio` and land on Medidas (`/cotizador?producto=<slug>&paso=medidas&color=<c>&vidrio=<v>`).
  The colour lives in `promotions.cotizador_color` (migration 0004): an existing database needs `npm run db:migrate` before this code runs against it.
  Read-only check: `ADMIN_STORE=mariadb npm run promos:status`. Round-trip guarantee: `test/admin/promo-roundtrip.test.ts`.
- Tests: `npm run test:admin` (memory + MariaDB contract + persistence; MariaDB suites skip with a message if the DB env is absent),
  `npm run smoke:admin` (real Chromium on port 4500 against alcusa_test).
