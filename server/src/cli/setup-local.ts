/**
 * db:setup-local (LOCAL DEV ONLY, idempotent).
 *   MARIADB_ROOT_PASSWORD=... npm run db:setup-local
 * 1. as root: runs server/db/setup-local.sql (databases + accounts; passwords bound as session vars)
 * 2. writes server/.env (gitignored) with the generated app/migrate passwords, SECRETS_KEY, IP_HASH_PEPPER
 * 3. as alcusa_migrate: migrates alcusa_dev and alcusa_test and applies grants.sql
 * Re-running keeps the passwords already in server/.env. Nothing secret is printed.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'mysql2/promise';
import { applyGrants } from '../db/grants.ts';
import { connectMigrate, runMigrations, runScript } from '../db/migrator.ts';
import { DB_DIR, MIGRATIONS_DIR } from '../db/paths.ts';

const SERVER_DIR = fileURLToPath(new URL('../../', import.meta.url));
const ENV_PATH = `${SERVER_DIR}.env`;
const ENV_EXAMPLE = `${SERVER_DIR}.env.example`;
const MIN_LEN = 16;

const say = (m: string): void => void process.stdout.write(`${m}\n`);
const strong = (v: string | undefined): v is string => typeof v === 'string' && v.length >= MIN_LEN;

function setEnvValue(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, () => line) : `${text.replace(/\n*$/, '\n')}${line}\n`;
}

async function main(): Promise<void> {
  const rootPassword = process.env['MARIADB_ROOT_PASSWORD'];
  if (!rootPassword) {
    process.stderr.write('MARIADB_ROOT_PASSWORD is not set (export it in this shell only; it is never stored)\n');
    process.exit(1);
  }
  if (process.env['NODE_ENV'] === 'production') {
    process.stderr.write('db:setup-local is local-only and refuses NODE_ENV=production\n');
    process.exit(1);
  }

  const existing = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, 'utf8')) : {};
  const host = existing['DB_HOST'] || '127.0.0.1';
  const port = Number(existing['DB_PORT'] || 3306);
  const dbName = existing['DB_NAME'] || 'alcusa_dev';
  const testName = existing['DB_TEST_NAME'] || 'alcusa_test';
  const appUser = existing['DB_APP_USER'] || 'alcusa_app';
  const migrateUser = existing['DB_MIGRATE_USER'] || 'alcusa_migrate';
  if (dbName !== 'alcusa_dev' || testName !== 'alcusa_test') {
    throw new Error('setup-local.sql only provisions alcusa_dev and alcusa_test');
  }

  const appPassword = strong(existing['DB_APP_PASSWORD']) ? existing['DB_APP_PASSWORD'] : randomBytes(24).toString('base64url');
  const migratePassword = strong(existing['DB_MIGRATE_PASSWORD']) ? existing['DB_MIGRATE_PASSWORD'] : randomBytes(24).toString('base64url');

  // 1. root: databases + accounts
  const root = await createConnection({
    host,
    port,
    user: process.env['MARIADB_ROOT_USER'] || 'root',
    password: rootPassword,
    charset: 'utf8mb4_unicode_ci',
  });
  try {
    await root.execute('SET @alcusa_app_password = ?', [appPassword]);
    await root.execute('SET @alcusa_migrate_password = ?', [migratePassword]);
    await runScript(root, await readFile(`${DB_DIR}/setup-local.sql`, 'utf8'));
  } finally {
    await root.end();
  }
  say('databases alcusa_dev / alcusa_test and accounts ready');

  // 2. server/.env (only reached when root auth worked)
  let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : readFileSync(ENV_EXAMPLE, 'utf8');
  env = setEnvValue(env, 'DB_APP_PASSWORD', appPassword);
  env = setEnvValue(env, 'DB_MIGRATE_PASSWORD', migratePassword);
  if (!existing['SECRETS_KEY']) env = setEnvValue(env, 'SECRETS_KEY', randomBytes(32).toString('base64'));
  if (!existing['IP_HASH_PEPPER']) env = setEnvValue(env, 'IP_HASH_PEPPER', randomBytes(32).toString('base64'));
  writeFileSync(ENV_PATH, env, { mode: 0o600 });
  say('server/.env written (gitignored)');

  // 3. migrate + grants on both databases, as the DDL account
  for (const database of [dbName, testName]) {
    const conn = await connectMigrate({ nodeEnv: 'development', host, port, database, user: migrateUser, password: migratePassword });
    try {
      const res = await runMigrations(conn, { dir: MIGRATIONS_DIR, log: say });
      await applyGrants(conn, { database, appUser });
      say(`${database}: ${res.applied.length} migration(s) applied, grants refreshed`);
    } finally {
      await conn.end();
    }
  }
}

main().catch((err: unknown) => {
  // Driver errors can echo the user name but never the password; still print only the message.
  process.stderr.write(`setup-local failed: ${err instanceof Error ? err.message : 'unknown error'}\n`);
  process.exit(1);
});
