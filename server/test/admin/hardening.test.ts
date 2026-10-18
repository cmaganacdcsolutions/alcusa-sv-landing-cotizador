// Regression tests for SEC-007 (login throttle), SEC-008 (CSRF / origin) and SEC-009 (promo image path) at the HTTP edge.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/http/app.ts';
import { AuthService } from '../../src/modules/admin/auth-service.ts';
import { COOKIE, LOGIN_COOKIE } from '../../src/modules/admin/routes.ts';
import { MemoryAdminStore } from '../../src/modules/admin/store.ts';
import { PromoService } from '../../src/modules/promotions/service.ts';
import { ADMIN_PROMO_IMAGE, validatePromo } from '../../src/modules/promotions/schema.ts';

const BASE = '/ops-test';
const PW = 'correct horse battery staple';
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
let app: FastifyInstance;

const setCookies = (r: { headers: Record<string, unknown> }): string[] => ([] as string[]).concat((r.headers['set-cookie'] as string | string[] | undefined) ?? []);
const named = (r: { headers: Record<string, unknown> }, name: string): string => setCookies(r).find((c) => c.startsWith(name))?.split(';')[0] ?? '';
const tokenOf = (body: string): string => /name="_csrf" value="([0-9a-f]{64})"/.exec(body)![1]!;
const scrub = (body: string): string => body.replace(/value="[^"]*"/g, '');

async function loginAs(username: string, password: string, ip: string) {
  const g = await app.inject({ url: `${BASE}/login` });
  return app.inject({
    method: 'POST', url: `${BASE}/login`, payload: new URLSearchParams({ username, password, _csrf: tokenOf(g.body) }).toString(),
    headers: { ...FORM, 'sec-fetch-site': 'same-origin', 'x-forwarded-for': ip, cookie: named(g, LOGIN_COOKIE) },
  });
}

beforeAll(async () => {
  const store = new MemoryAdminStore();
  const auth = new AuthService({ repo: store, params: { memory: 64, passes: 1, parallelism: 1 } });
  await auth.createAdmin('alcusa', PW, false);
  const out = mkdtempSync(join(tmpdir(), 'hard-out-'));
  const promos = new PromoService({ repo: store, outDir: out, audit: (e) => store.audit(e) });
  app = await buildApp({ config: { LOG_LEVEL: 'silent', TRUST_PROXY: false, NODE_ENV: 'test', SERVE_STATIC_DIR: undefined }, admin: { base: BASE, auth, promos, imagesDir: mkdtempSync(join(tmpdir(), 'hard-img-')), imageUrlPrefix: '/images/promos' } });
});
afterAll(async () => app.close());

describe('SEC-007 login throttle at the HTTP edge', () => {
  it('unknown user and a throttled user get the identical response; the real admin from another IP is unaffected', async () => {
    const attacker = '203.0.113.50';
    const known: number[] = [];
    const unknown: number[] = [];
    let knownBody = '';
    let unknownBody = '';
    for (let i = 0; i < 7; i++) {
      const k = await loginAs('alcusa', 'wrong password here', attacker);
      const u = await loginAs('ghost', 'wrong password here', attacker);
      known.push(k.statusCode);
      unknown.push(u.statusCode);
      knownBody = scrub(k.body);
      unknownBody = scrub(u.body);
    }
    expect(known).toEqual(unknown);
    expect(new Set(known)).toEqual(new Set([401]));
    expect(knownBody).toBe(unknownBody);
    expect(knownBody).not.toMatch(/Demasiados/);
    // the attacker holding the right password is still refused while throttled; the admin from elsewhere gets in
    expect((await loginAs('alcusa', PW, attacker)).statusCode).toBe(401);
    expect((await loginAs('alcusa', PW, '198.51.100.8')).statusCode).toBe(303);
  });
});

describe('SEC-008 CSRF / origin', () => {
  let cookie = '';
  let csrf = '';
  beforeAll(async () => {
    const r = await loginAs('alcusa', PW, '198.51.100.9');
    cookie = named(r, COOKIE);
    csrf = tokenOf((await app.inject({ url: `${BASE}/promociones`, headers: { cookie } })).body);
  });
  const fields = (): Record<string, string> => ({
    _csrf: csrf, title: 'Promo de prueba', description: 'x', product_slug: 'recta', price_promo: '100', image_alt: 'alt', starts_on: '2026-10-01', ends_on: '2026-10-31', rules: '', image: '/images/promos/promo-1-900.webp', intent: 'draft',
  });
  const post = (headers: Record<string, string>) => app.inject({ method: 'POST', url: `${BASE}/promociones`, payload: new URLSearchParams(fields()).toString(), headers: { ...FORM, cookie, ...headers } });

  it('POST with neither Origin nor Sec-Fetch-Site -> 403', async () => expect((await post({})).statusCode).toBe(403));
  it('Origin: null -> 403 even with Sec-Fetch-Site: same-origin', async () => expect((await post({ origin: 'null', 'sec-fetch-site': 'same-origin' })).statusCode).toBe(403));
  it('same-origin browser requests still work (Sec-Fetch-Site or a matching Origin)', async () => {
    expect((await post({ 'sec-fetch-site': 'same-origin' })).statusCode).toBe(303);
    expect((await post({ origin: 'http://localhost:4500', host: 'localhost:4500' })).statusCode).toBe(303);
  });
  it('login without / with a wrong CSRF token -> 403; with the right one -> 303', async () => {
    const g = await app.inject({ url: `${BASE}/login` });
    expect(setCookies(g).some((c) => c.startsWith(LOGIN_COOKIE) && /Secure/i.test(c) && /HttpOnly/i.test(c) && /SameSite=Strict/i.test(c))).toBe(true);
    const mk = (payload: Record<string, string>, cookieH: string) =>
      app.inject({ method: 'POST', url: `${BASE}/login`, payload: new URLSearchParams(payload).toString(), headers: { ...FORM, 'sec-fetch-site': 'same-origin', cookie: cookieH } });
    const lc = named(g, LOGIN_COOKIE);
    const base = { username: 'alcusa', password: PW };
    expect((await mk(base, lc)).statusCode).toBe(403);
    expect((await mk({ ...base, _csrf: 'f'.repeat(64) }, lc)).statusCode).toBe(403);
    expect((await mk({ ...base, _csrf: tokenOf(g.body) }, '')).statusCode).toBe(403);
    expect((await mk({ ...base, _csrf: tokenOf(g.body) }, lc)).statusCode).toBe(303);
  });
  it('two GETs then a POST with the first form token succeeds (second tab does not invalidate the first)', async () => {
    const a = await app.inject({ url: `${BASE}/login` });
    const lc = named(a, LOGIN_COOKIE);
    const b = await app.inject({ url: `${BASE}/login`, headers: { cookie: lc } });
    expect(setCookies(b).some((c) => c.startsWith(LOGIN_COOKIE))).toBe(false);
    expect(tokenOf(b.body)).toBe(tokenOf(a.body));
    const r = await app.inject({
      method: 'POST', url: `${BASE}/login`, payload: new URLSearchParams({ username: 'alcusa', password: PW, _csrf: tokenOf(a.body) }).toString(),
      headers: { ...FORM, 'sec-fetch-site': 'same-origin', cookie: lc },
    });
    expect(r.statusCode).toBe(303);
  });
  it('a malformed login cookie is replaced by a fresh well-formed one', async () => {
    const g = await app.inject({ url: `${BASE}/login`, headers: { cookie: `${LOGIN_COOKIE}=nothex` } });
    const fresh = named(g, LOGIN_COOKIE);
    expect(fresh).toMatch(/=[0-9a-f]{64}$/);
    expect(tokenOf(g.body)).toBe(fresh.split('=')[1]);
  });
  it('a login CSRF failure re-renders the form (403) with a new token and a friendly message, identical for any username', async () => {
    const g = await app.inject({ url: `${BASE}/login` });
    const lc = named(g, LOGIN_COOKIE);
    const bad = (username: string) => app.inject({
      method: 'POST', url: `${BASE}/login`, payload: new URLSearchParams({ username, password: PW, _csrf: 'f'.repeat(64) }).toString(),
      headers: { ...FORM, 'sec-fetch-site': 'same-origin', cookie: lc },
    });
    const r1 = await bad('alcusa');
    const r2 = await bad('nobody');
    expect(r1.statusCode).toBe(403);
    expect(r1.body).toContain('La sesión del formulario expiró. Intenta de nuevo.');
    expect(named(r1, LOGIN_COOKIE)).toMatch(/=[0-9a-f]{64}$/);
    expect(tokenOf(r1.body)).toBe(named(r1, LOGIN_COOKIE).split('=')[1]);
    expect(scrub(r1.body)).toBe(scrub(r2.body));
    expect(r1.body).not.toContain('value="nobody"');
  });
  it('admin pages pin Referrer-Policy to same-origin so form posts carry a real Origin', async () => {
    const r = await app.inject({ url: `${BASE}/login` });
    expect(r.headers['referrer-policy']).toBe('same-origin');
    expect(r.body).toContain('<meta name="referrer" content="same-origin">');
  });
});

describe('SEC-009 promo image path', () => {
  const base = {
    id: 'p1', placeholder: false, title: 'Promo valida', description: '', image_alt: 'alt', price_before: null, price_promo: 10, product_slug: 'recta',
    starts_on: '2026-10-01', ends_on: '2026-10-31', rules: [] as string[],
  };
  const bad = [
    'https://evil.example/x.png', '//evil.example/x.png', '/images/promos/../x-900.webp', '/media/promos/../x', '../promo-1-900.webp', '/etc/passwd',
    'promo-1-900.webp', '/images/promos/promo-1-900.webp?x=1', '/images/promos/promo-abc-900.webp', 'javascript:alert(1)', '/images/promos/%2e%2e/promo-1-900.webp',
  ];
  it.each(bad)('rejects %s', (image) => {
    expect(ADMIN_PROMO_IMAGE.test(image)).toBe(false);
    expect(validatePromo({ ...base, image } as never)).toEqual(expect.arrayContaining([expect.stringContaining('imagen')]));
  });
  it.each(['/images/promos/promo-1-900.webp', '/images/promos/promo-0123456789abcdef-600.webp'])('accepts %s', (image) => {
    expect(validatePromo({ ...base, image } as never).filter((m) => m.includes('imagen'))).toEqual([]);
  });
  it('HTTP: a hand-posted external image URL is a 422 and nothing is saved', async () => {
    const r = await loginAs('alcusa', PW, '198.51.100.10');
    const cookie = named(r, COOKIE);
    const csrf = tokenOf((await app.inject({ url: `${BASE}/promociones`, headers: { cookie } })).body);
    const res = await app.inject({
      method: 'POST', url: `${BASE}/promociones`, headers: { ...FORM, cookie, 'sec-fetch-site': 'same-origin' },
      payload: new URLSearchParams({ _csrf: csrf, title: 'Promo externa', description: '', product_slug: 'recta', price_promo: '5', image_alt: 'a', starts_on: '2026-10-01', ends_on: '2026-10-31', image: 'https://evil.example/x.png', intent: 'draft' }).toString(),
    });
    expect(res.statusCode).toBe(422);
    expect(res.body).toContain('imagen no es válida');
  });
});
