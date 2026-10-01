// DB helper for the FE http e2e (alcusa_test only, runs as the migrate account).
//   tsx --env-file-if-exists=.env scripts/e2e-db.ts truncate-rate-limits
//   tsx --env-file-if-exists=.env scripts/e2e-db.ts expire <code>      (valid_until -> 2020-01-01)
import { loadMigrateConfig } from '../src/config/index.ts';
import { connectMigrate } from '../src/db/migrator.ts';

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  const cfg = loadMigrateConfig({ ...process.env, NODE_ENV: 'test' });
  if (cfg.database !== process.env['DB_TEST_NAME'] && cfg.database !== 'alcusa_test') throw new Error('e2e-db only touches the test database');
  const conn = await connectMigrate(cfg);
  try {
    if (cmd === 'truncate-rate-limits') {
      await conn.query('TRUNCATE TABLE rate_limits');
    } else if (cmd === 'expire' && arg) {
      const [res] = await conn.query('UPDATE quotes SET valid_until = ? WHERE code = ?', ['2020-01-01', arg]);
      if ((res as { affectedRows: number }).affectedRows !== 1) throw new Error(`quote ${arg} not found`);
    } else {
      throw new Error('usage: truncate-rate-limits | expire <code>');
    }
  } finally {
    await conn.end();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : 'failed'}\n`);
  process.exit(1);
});
