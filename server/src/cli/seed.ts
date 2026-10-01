import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadMigrateConfig } from '../config/index.ts';
import { connectMigrate, runScript } from '../db/migrator.ts';

const SEED_FILE = fileURLToPath(new URL('../../db/seed/dev.sql', import.meta.url));

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    process.stderr.write('db:seed refuses to run when NODE_ENV=production\n');
    process.exit(1);
  }
  const cfg = loadMigrateConfig();
  if (cfg.nodeEnv === 'production') throw new ConfigError([], ['NODE_ENV']);
  const sql = await readFile(SEED_FILE, 'utf8');
  const conn = await connectMigrate(cfg);
  try {
    await runScript(conn, sql);
    process.stdout.write(`seed applied to ${cfg.database}\n`);
  } finally {
    await conn.end();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof ConfigError ? err.message : `seed failed${err instanceof Error ? `: ${err.message}` : ''}`;
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
