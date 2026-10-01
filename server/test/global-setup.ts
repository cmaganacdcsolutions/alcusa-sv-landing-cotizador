import { ConfigError, loadMigrateConfig } from '../src/config/index.ts';
import { applyGrants } from '../src/db/grants.ts';
import { connectMigrate, runMigrations } from '../src/db/migrator.ts';
import { MIGRATIONS_DIR } from '../src/db/paths.ts';

/** Integration tests run against alcusa_test, migrated once per run. */
export default async function setup(): Promise<void> {
  try {
    const cfg = loadMigrateConfig({ ...process.env, NODE_ENV: 'test' });
    const conn = await connectMigrate(cfg);
    try {
      await runMigrations(conn, { dir: MIGRATIONS_DIR });
      await applyGrants(conn, { database: cfg.database, appUser: process.env['DB_APP_USER'] ?? 'alcusa_app' });
    } finally {
      await conn.end();
    }
  } catch (err) {
    const why = err instanceof ConfigError ? err.message : err instanceof Error ? err.message : 'unknown';
    throw new Error(`Test DB not ready (run \`npm run db:setup-local\` once): ${why}`);
  }
}
