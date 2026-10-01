import { ConfigError, loadMigrateConfig } from '../config/index.ts';
import { applyGrants } from '../db/grants.ts';
import { connectMigrate } from '../db/migrator.ts';

async function main(): Promise<void> {
  const cfg = loadMigrateConfig();
  const appUser = process.env['DB_APP_USER'];
  if (!appUser) throw new ConfigError(['DB_APP_USER'], []);
  const conn = await connectMigrate(cfg);
  try {
    await applyGrants(conn, { database: cfg.database, appUser });
    process.stdout.write(`grants applied on ${cfg.database} for ${appUser}\n`);
  } finally {
    await conn.end();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof ConfigError ? err.message : 'grants failed'}\n`);
  process.exit(1);
});
