# server/db - ALCUSA database (MariaDB 11.4 local = prod major, portable to 10.11)

Source of truth: ADR-010 (model), ADR-011 (admin/promos), ADR-012 (load by folio), ADR-013 (Node, local-first).

```
migrations/0001_init.sql   forward-only DDL (all tables + schema_migrations)
grants.sql                 table-level GRANTs for alcusa_app (run AFTER migrations)
setup-local.sql            LOCAL ONLY: DBs alcusa_dev/alcusa_test + accounts (root)
seed/dev.sql               LOCAL ONLY: fake promos, 3 quotes with valid folios, 1 contact
.gitattributes             *.sql is LF so checksums are identical on Windows and Linux
```

## Tables (12)
`schema_migrations`, `admin_users`, `admin_sessions`, `promotions`, `promotion_rules`, `quotes`,
`quote_items`, `payment_intents`, `payments`, `contacts`, `rate_limits`, `audit_log`.

## Conventions
- Names: `snake_case`, plural tables, FK `<singular>_id`, `uq_<table>_<what>`, `ix_<table>_<what>`,
  `fk_<table>_<ref>`, `ck_<table>_<what>`.
- Money `DECIMAL(10,2)` USD (never float). Dates `DATETIME` in UTC (session `time_zone='+00:00'`), business dates `DATE` (El Salvador calendar).
- Status/enums: `VARCHAR` + named `CHECK ... IN (...)`, not `ENUM`.
- Every table sets `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci` explicitly (11.4 defaults to uca1400).
- Codes, hashes, slugs, bucket keys are `ascii_bin` (exact match: pass canonical UPPERCASE folios, `quotes.code` lookup is case-sensitive).
- JSON columns are LONGTEXT + `CHECK JSON_VALID` on MariaDB: the driver returns a STRING, call `JSON.parse`. Stored bytes are not re-serialized.
- Portable SQL only (no 11.x-only syntax). MariaDB-specific bits are confined to: `INSERT ... ON DUPLICATE KEY UPDATE` (rate_limits upsert, repo only) and `EXECUTE IMMEDIATE` in `setup-local.sql`/`grants.sql` (admin scripts, not migrations).

## Migrations: rules
1. Forward-only, one change per file `NNNN_description.sql`. **Never edit an applied migration** (the runner aborts on checksum change). Fix forward with a new file.
2. expand -> migrate -> contract: add columns NULL/with default first, backfill, and only drop in a later release. A migration must never break the previous release (rollback = symlink swap).
3. Plain statements: each ends with `;` at end of line, no `DELIMITER`, no stored programs, no `;` inside strings or comments (a simple splitter is enough). Comments are `--` lines.
4. DDL auto-commits (not transactional), so write `CREATE TABLE IF NOT EXISTS` / guarded ALTERs where possible.
5. Any new table: add it to `grants.sql` in the same PR and re-run grants.
6. Destructive change (DROP/UPDATE of data): take a `mariadb-dump --single-transaction` first and write the rollback in the PR description.
7. Checksum = SHA-256 (hex, 64 chars) of the file bytes (files are LF, see `.gitattributes`).

## Public-read rule (ADR-012)
`GET /api/quotes/{code}` selects an explicit column list and never `SELECT *`. These `quotes` columns are PII and must never be selected there:
`customer_name`, `customer_whatsapp`, `customer_email`, `delivery_address`, `ip_hash`, `consent_at`, `privacy_notice_version`, `idempotency_key`, `client_cart_hash`, `id`.
Allowed: `code, created_at, valid_until, delivery_mode, delivery_zone, subtotal, transport_fee, total, currency` + items (`position, product_slug, description, qty, unit_price, line_total, promo_ref, config_schema_version, config`). `expired` is computed from `valid_until` vs the SV date, not from `status`.

## Apply manually (PowerShell or bash; never put the password on the command line or in a file in the repo)
```bash
# Root password lives outside the repo; load it for this shell only
export MYSQL_PWD="$(cat "$LOCALAPPDATA/alcusa-dev/mariadb-root.secret")"
MARIADB="$LOCALAPPDATA/alcusa-dev/mariadb-11.4.3-winx64/bin/mariadb.exe"

# 1) accounts + DBs: ONE session, set the two variables first (>= 16 chars each)
$MARIADB -h127.0.0.1 -uroot --default-character-set=utf8mb4 <<'SQL'
SET @alcusa_app_password     = '...';
SET @alcusa_migrate_password = '...';
SOURCE server/db/setup-local.sql
SQL

# 2) schema (as the migrate account) - or `npm run db:migrate`
MYSQL_PWD='<migrate pw>' $MARIADB -h127.0.0.1 -ualcusa_migrate alcusa_dev < server/db/migrations/0001_init.sql
# (manual runs do not write schema_migrations; use the runner for real environments)

# 3) app grants, once per account host
$MARIADB -h127.0.0.1 -ualcusa_migrate alcusa_dev <<'SQL'
SET @alcusa_db='alcusa_dev'; SET @alcusa_app_user='alcusa_app'; SET @alcusa_app_host='127.0.0.1';
SOURCE server/db/grants.sql
SQL
# repeat with @alcusa_app_host='localhost'

# 4) dev data (never in production)
MYSQL_PWD='<migrate pw>' $MARIADB -h127.0.0.1 -ualcusa_migrate alcusa_dev < server/db/seed/dev.sql
```
`npm run db:setup-local`, `db:migrate`, `db:seed` automate the above (env: `DB_APP_PASSWORD`, `DB_MIGRATE_PASSWORD`, root via `MARIADB_ROOT_PASSWORD`).

## Privilege model
| Account | Rights |
|---|---|
| `alcusa_migrate` | ALL on `alcusa_dev.*` / `alcusa_test.*` WITH GRANT OPTION. Used by migrate, grants, seed, retention/maintenance, test TRUNCATE. |
| `alcusa_app` | table-level only (grants.sql): `audit_log` SELECT+INSERT, `quote_items` SELECT+INSERT, `quotes/payments/payment_intents/admin_users/promotions` SELECT+INSERT+UPDATE, `promotion_rules/contacts/admin_sessions/rate_limits` + DELETE, `schema_migrations` SELECT. No DDL, no DELETE on quotes/payments. |

## Backups / restore (prod, owner: senior-infrastructure)
`mariadb-dump --single-transaction --routines --triggers <db>` nightly, encrypted, restore tested quarterly (ADR-010 §6). Portability check used in N0: `mariadb-dump --no-data` re-imports cleanly into an empty DB.
