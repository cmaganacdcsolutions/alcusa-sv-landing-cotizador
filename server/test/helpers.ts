// Shared integration-test helpers: app on alcusa_test, DB reset as the migrate account,
// and a realistic request built by the FE's own builder (toFolioRequest).
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { loadConfig, loadMigrateConfig, type Config } from '../src/config/index.ts';
import { createAppPool } from '../src/db/pool.ts';
import { connectMigrate } from '../src/db/migrator.ts';
import { buildApp } from '../src/http/app.ts';
import type { RateLimits } from '../src/modules/quotes/service.ts';

export function testConfig(): Config {
  return loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' });
}

/** Empties quote data. Needs DELETE/TRUNCATE: runs as alcusa_migrate (the app account cannot delete quotes). */
export async function resetDb(): Promise<void> {
  const conn = await connectMigrate(loadMigrateConfig({ ...process.env, NODE_ENV: 'test' }));
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE quote_items');
    await conn.query('TRUNCATE TABLE quotes');
    await conn.query('TRUNCATE TABLE rate_limits');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await conn.end();
  }
}

export interface TestApp {
  app: FastifyInstance;
  pool: Pool;
  close: () => Promise<void>;
}

export async function makeApp(opts: { limits?: Partial<RateLimits>; now?: () => Date; generateCode?: (now: Date) => string } = {}): Promise<TestApp> {
  const config = testConfig();
  const pool = createAppPool(config);
  const app = await buildApp({ config, pool, ...opts });
  return {
    app,
    pool,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

export { cartConfig, feRequest } from './fe-request.ts';

export const post = (t: TestApp, body: unknown, ip = '10.0.0.1') =>
  t.app.inject({ method: 'POST', url: '/api/quote-create', payload: body as object, remoteAddress: ip });

export const get = (t: TestApp, code: string, ip = '10.0.0.1') =>
  t.app.inject({ method: 'GET', url: `/api/quotes/${encodeURIComponent(code)}`, remoteAddress: ip });
