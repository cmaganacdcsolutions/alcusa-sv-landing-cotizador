import { ConfigError, loadMigrateConfig } from '../config/index.ts';
import { MIGRATIONS_DIR } from '../db/paths.ts';
import { applyGrants } from '../db/grants.ts';
import { connectMigrate, MigrationError, runMigrations } from '../db/migrator.ts';

function say(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

async function main(): Promise<void> {
  const cfg = loadMigrateConfig();
  say(`migrate: ${cfg.database} as ${cfg.user}`);
  const conn = await connectMigrate(cfg);
  try {
    const res = await runMigrations(conn, { dir: MIGRATIONS_DIR, log: say });
    say(res.applied.length ? `applied ${res.applied.length}: ${res.applied.join(', ')}` : 'nothing to apply');
    const appUser = process.env['DB_APP_USER'];
    if (res.applied.length && appUser) {
      // grants.sql is table-level: it must be re-run after any migration that adds a table.
      await applyGrants(conn, { database: cfg.database, appUser });
      say(`grants refreshed for ${appUser}`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof ConfigError || err instanceof MigrationError ? err.message : 'migrate failed (see DB connectivity and credentials)';
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
