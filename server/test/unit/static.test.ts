import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/http/app.ts';

const base = { LOG_LEVEL: 'silent', TRUST_PROXY: false } as const;

describe('SERVE_STATIC_DIR (dev/e2e fallback)', () => {
  it('serves files next to the API when set outside production', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'alcusa-static-'));
    await writeFile(join(dir, 'index.html'), '<h1>hi</h1>');
    const app = await buildApp({ config: { ...base, NODE_ENV: 'development', SERVE_STATIC_DIR: dir } });
    const page = await app.inject('/');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<h1>hi</h1>');
    expect((await app.inject('/api/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/api/nope')).json().error.code).toBe('not_found');
    await app.close();
  });

  it('is ignored when NODE_ENV=production (config also refuses to start)', async () => {
    const app = await buildApp({ config: { ...base, NODE_ENV: 'production', SERVE_STATIC_DIR: tmpdir() } });
    expect((await app.inject('/')).statusCode).toBe(404);
    await app.close();
  });
});
