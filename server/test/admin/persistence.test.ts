// Persistence across an app restart, against real MariaDB (alcusa_test). "Restart" = tear down the Fastify app and its
// connection pool, then build a brand new runtime from the same environment (nothing is kept in process memory).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/http/app.ts';
import { COOKIE } from '../../src/modules/admin/routes.ts';
import { createAdminRuntime, loadAdminConfig } from '../../src/modules/admin/runtime.ts';
import type { PromoInput } from '../../src/modules/promotions/service.ts';
import { auditActions, dbEnv, resetAdminTables, SKIP_MSG } from './db-env.ts';

const env = dbEnv();
const BASE = '/ops-persist';
const PW = 'correct horse battery staple';

const input = (title: string): PromoInput => ({
  title, description: 'Descripcion', image: '/images/promos/promo-1-900.webp', image_alt: 'Flyer', price_before: 300, price_promo: 222,
  product_slug: 'recta', vidrio: 'claro', starts_on: '2026-10-01', ends_on: '2026-10-31', rules: ['Instalada'],
});

describe.skipIf(!env)('persistence across restart (MariaDB)', () => {
  let out: string;
  let app: FastifyInstance;
  let close: () => Promise<void>;
  const now = (): Date => new Date('2026-10-06T12:00:00Z');

  async function boot(): Promise<ReturnType<typeof createAdminRuntime>> {
    const cfg = loadAdminConfig({ ...process.env, NODE_ENV: 'test', ADMIN_STORE: 'mariadb', ADMIN_BASE_PATH: BASE, PROMOTIONS_OUT_DIR: out } as NodeJS.ProcessEnv);
    const rt = createAdminRuntime(cfg);
    // fast argon params + a fixed clock keep the test quick and deterministic
    const { AuthService } = await import('../../src/modules/admin/auth-service.ts');
    const { PromoService } = await import('../../src/modules/promotions/service.ts');
    const auth = new AuthService({ repo: rt.store, now, params: { memory: 64, passes: 1, parallelism: 1 } });
    const promos = new PromoService({ repo: rt.store, outDir: out, audit: (e) => rt.store.audit(e), now });
    app = await buildApp({
      config: { LOG_LEVEL: 'silent', TRUST_PROXY: false, NODE_ENV: 'test', SERVE_STATIC_DIR: undefined },
      admin: { ...rt.deps, auth, promos, now },
    });
    close = async () => {
      await app.close();
      await rt.close();
    };
    return { ...rt, auth, promos };
  }
  const login = (password: string) =>
    app.inject({ method: 'POST', url: `${BASE}/login`, payload: new URLSearchParams({ username: 'carlos', password }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });

  beforeAll(async () => {
    if (!env) return;
    await resetAdminTables(env);
    out = mkdtempSync(join(tmpdir(), 'persist-out-'));
  });
  afterAll(async () => {
    if (env) await resetAdminTables(env);
  });

  let cookie = '';
  let promoId = '';

  it('creates the admin and promos, then the process restarts', async () => {
    const rt = await boot();
    await rt.auth.createAdmin('carlos', PW, false);
    const a = await rt.promos.create('carlos', input('Puerta Aquaclara'), true);
    const b = await rt.promos.create('carlos', input('Borrador'), false);
    if (!a.ok || !b.ok) throw new Error('setup failed');
    promoId = a.value.id;
    const res = await login(PW);
    expect(res.statusCode).toBe(303);
    cookie = String(([] as string[]).concat(res.headers['set-cookie'] as string).find((c) => c.startsWith(COOKIE))).split(';')[0] as string;
    await close();
  });

  it('after the restart: admin, promos, promotions.json, audit log and the session are still there', async () => {
    const rt = await boot();
    expect(await rt.store.countUsers()).toBe(1);
    expect((await rt.promos.list()).map((p) => p.title).sort()).toEqual(['Borrador', 'Puerta Aquaclara']);
    expect(await rt.promos.get(promoId)).toMatchObject({ status: 'published', price_before: 300, price_promo: 222, rules: ['Instalada'], cotizador_params: { vidrio: 'claro' } });
    const doc = JSON.parse(readFileSync(join(out, 'promotions.json'), 'utf8')) as { promotions: Array<{ id: string }> };
    expect(doc.promotions.map((p) => p.id)).toEqual([promoId]);
    const page = await app.inject({ url: `${BASE}/promociones`, headers: { cookie } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Puerta Aquaclara');
    const actions = await auditActions(env as NonNullable<typeof env>);
    expect(actions).toEqual(expect.arrayContaining(['admin.created', 'promo.created', 'admin.login_ok']));
    await close();
  });

  it('archive and reactivate persist across a restart and drive promotions.json', async () => {
    let rt = await boot();
    expect((await rt.promos.archive('carlos', promoId)).ok).toBe(true);
    await close();
    rt = await boot();
    expect((await rt.promos.get(promoId))?.status).toBe('archived');
    expect(JSON.parse(readFileSync(join(out, 'promotions.json'), 'utf8')).promotions).toEqual([]);
    expect((await rt.promos.reactivate('carlos', promoId)).ok).toBe(true);
    await close();
    rt = await boot();
    expect((await rt.promos.get(promoId))?.status).toBe('draft');
    expect((await rt.promos.setStatus('carlos', promoId, true)).ok).toBe(true);
    expect(JSON.parse(readFileSync(join(out, 'promotions.json'), 'utf8')).promotions).toHaveLength(1);
    expect(await auditActions(env as NonNullable<typeof env>)).toEqual(expect.arrayContaining(['promo.archived', 'promo.reactivated', 'promo.published']));
    await close();
  });

  it('logout deletes the session durably', async () => {
    await boot();
    const csrf = /name="_csrf" value="([0-9a-f]{64})"/.exec((await app.inject({ url: `${BASE}/promociones`, headers: { cookie } })).body)?.[1] as string;
    const r = await app.inject({
      method: 'POST', url: `${BASE}/logout`, payload: new URLSearchParams({ _csrf: csrf }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    });
    expect(r.statusCode).toBe(303);
    await close();
    await boot();
    expect((await app.inject({ url: `${BASE}/promociones`, headers: { cookie } })).statusCode).toBe(303);
    await close();
  });

  it('lockout survives a restart: 5 bad passwords lock the account, even for the right password', async () => {
    await boot();
    for (let i = 0; i < 4; i += 1) expect((await login('wrong password here')).statusCode).toBe(401);
    expect((await login('wrong password here')).statusCode).toBe(429);
    await close();
    await boot();
    expect((await login(PW)).statusCode).toBe(429);
    await close();
  });
});

if (!env) describe('persistence across restart (MariaDB)', () => it.skip(SKIP_MSG, () => undefined));
