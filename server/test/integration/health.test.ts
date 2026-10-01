import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.ts';
import { createAppPool } from '../../src/db/pool.ts';
import { buildApp } from '../../src/http/app.ts';

const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' });

describe('GET /api/health/ready', () => {
  const pool = createAppPool(config);
  const deadPool = createAppPool({ ...config, DB_PORT: 1 }); // nothing listens on port 1
  let up: FastifyInstance;
  let down: FastifyInstance;

  beforeAll(async () => {
    up = await buildApp({ config, pool });
    down = await buildApp({ config, pool: deadPool });
  });
  afterAll(async () => {
    await up.close();
    await down.close();
    await pool.end();
    await deadPool.end();
  });

  it('is on the test database', () => {
    expect(config.dbName).toBe('alcusa_test');
  });

  it('200 when the database answers', async () => {
    const res = await up.inject('/api/health/ready');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('503 without details when the database is down', async () => {
    const res = await down.inject('/api/health/ready');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: { code: 'unavailable', message: 'Service unavailable' } });
    expect(res.body).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|alcusa/);
  });

  it('503 when no pool is configured', async () => {
    const app = await buildApp({ config });
    expect((await app.inject('/api/health/ready')).statusCode).toBe(503);
    await app.close();
  });

  it('the app account can read schema_migrations but cannot run DDL', async () => {
    const [rows] = await pool.execute('SELECT version FROM schema_migrations');
    expect(Array.isArray(rows) && rows.length).toBeGreaterThan(0);
    await expect(pool.query('CREATE TABLE should_not_exist (id INT)')).rejects.toMatchObject({
      code: expect.stringMatching(/ER_(DBACCESS|TABLEACCESS)_DENIED_ERROR/) as unknown,
    });
  });
});
