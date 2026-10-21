// SEC-011: admin audit rows carry the hashed source IP and security events raise a warn-level alert.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/http/app.ts';
import { hmacHex } from '../../src/http/rate-limit-db.ts';
import { AuthService } from '../../src/modules/admin/auth-service.ts';
import { stderrAlert } from '../../src/modules/admin/runtime.ts';
import { COOKIE, LOGIN_COOKIE } from '../../src/modules/admin/routes.ts';
import { MemoryAdminStore } from '../../src/modules/admin/store.ts';
import { PromoService } from '../../src/modules/promotions/service.ts';

const BASE = '/ops-test';
const PW = 'correct horse battery staple';
const PEPPER = 'test-pepper';
const FAST = { memory: 64, passes: 1, parallelism: 1 };
const FORM = { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' };
const H = (ip: string): string => hmacHex(PEPPER, `ip:${ip}`);
const named = (r: { headers: Record<string, unknown> }, n: string): string => ([] as string[]).concat((r.headers['set-cookie'] as string | string[] | undefined) ?? []).find((c) => c.startsWith(n))?.split(';')[0] ?? '';
const tok = (b: string): string => /name="_csrf" value="([0-9a-f]{64})"/.exec(b)![1]!;

let app: FastifyInstance;
let store: MemoryAdminStore;
const alerts: Record<string, unknown>[] = [];

async function login(user: string, pw: string, xff: string) {
  const g = await app.inject({ url: `${BASE}/login` });
  return app.inject({ method: 'POST', url: `${BASE}/login`, payload: new URLSearchParams({ username: user, password: pw, _csrf: tok(g.body) }).toString(), headers: { ...FORM, 'x-forwarded-for': xff, cookie: named(g, LOGIN_COOKIE) } });
}

beforeAll(async () => {
  store = new MemoryAdminStore();
  const auth = new AuthService({ repo: store, params: FAST, ipHashPepper: PEPPER, alert: (e) => alerts.push(e) });
  await auth.createAdmin('alcusa', PW, false);
  const promos = new PromoService({ repo: store, outDir: mkdtempSync(join(tmpdir(), 'aip-out-')), audit: (e) => store.audit(e) });
  app = await buildApp({ config: { LOG_LEVEL: 'silent', TRUST_PROXY: false, NODE_ENV: 'test', SERVE_STATIC_DIR: undefined }, admin: { base: BASE, auth, promos, imagesDir: mkdtempSync(join(tmpdir(), 'aip-img-')), imageUrlPrefix: '/images/promos' } });
});
afterAll(async () => app.close());

describe('SEC-011 audit source IP + alerts', () => {
  it('failed/locked/ok logins store HMAC(ip) (last XFF entry), never the raw address; backoff raises one alert', async () => {
    const ip = '203.0.113.77';
    for (let i = 0; i < 6; i++) await login('alcusa', 'wrong password here', `198.51.100.1, ${ip}`);
    const failed = store.auditLog.filter((e) => e.action === 'admin.login_failed');
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((e) => e.ipHash === H(ip))).toBe(true);
    const locked = store.auditLog.filter((e) => e.action === 'admin.locked');
    expect(locked).toHaveLength(1);
    expect(locked[0]!.ipHash).toBe(H(ip));
    expect(alerts.filter((a) => a['event'] === 'admin.locked')).toEqual([{ event: 'admin.locked', ipHash: H(ip).slice(0, 12) }]);
    expect(JSON.stringify([store.auditLog, alerts])).not.toContain(ip);

    const ok = await login('alcusa', PW, '192.0.2.10');
    expect(ok.statusCode).toBe(303);
    expect(store.auditLog.find((e) => e.action === 'admin.login_ok')?.ipHash).toBe(H('192.0.2.10'));
  });

  it('promo create/archive/reactivate rows carry the IP hash', async () => {
    const ip = '192.0.2.44';
    const g = await app.inject({ url: `${BASE}/login` });
    const r = await app.inject({ method: 'POST', url: `${BASE}/login`, payload: new URLSearchParams({ username: 'alcusa', password: PW, _csrf: tok(g.body) }).toString(), headers: { ...FORM, 'x-forwarded-for': ip, cookie: named(g, LOGIN_COOKIE) } });
    const cookie = named(r, COOKIE);
    const page = await app.inject({ url: `${BASE}/promociones/nueva`, headers: { cookie } });
    const csrf = tok(page.body);
    const form = new URLSearchParams({ _csrf: csrf, title: 'Promo de prueba', description: 'x', product_slug: 'recta', price_promo: '100', image_alt: 'alt', starts_on: '2026-10-01', ends_on: '2026-10-31', rules: '', image: '/images/promos/promo-1-900.webp', intent: 'draft' });
    const created = await app.inject({ method: 'POST', url: `${BASE}/promociones`, payload: form.toString(), headers: { ...FORM, cookie, 'x-forwarded-for': ip } });
    expect(created.statusCode).toBe(303);
    const row = store.auditLog.find((e) => e.action === 'promo.created');
    expect(row?.ipHash).toBe(H(ip));
    const id = (row!.detail as { id: string }).id;
    for (const [path, action] of [['archivar', 'promo.archived'], ['reactivar', 'promo.reactivated']] as const) {
      await app.inject({ method: 'POST', url: `${BASE}/promociones/${id}/${path}`, payload: new URLSearchParams({ _csrf: csrf }).toString(), headers: { ...FORM, cookie, 'x-forwarded-for': ip } });
      expect(store.auditLog.find((e) => e.action === action)?.ipHash).toBe(H(ip));
    }
  });

  it('password rotation raises an alert without the password; stderrAlert emits a <4> JSON line', async () => {
    const auth = new AuthService({ repo: store, params: FAST, ipHashPepper: PEPPER, alert: (e) => alerts.push(e) });
    await auth.rotatePassword('alcusa', 'another long passphrase 1');
    expect(alerts.at(-1)).toEqual({ event: 'admin.password_rotated', username: 'alcusa' });
    const chunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((c: string) => (chunks.push(String(c)), true)) as typeof process.stderr.write;
    try { stderrAlert({ event: 'admin.locked', ipHash: 'abc' }); } finally { process.stderr.write = orig; }
    expect(chunks[0]!.startsWith('<4>{')).toBe(true);
    expect(JSON.parse(chunks[0]!.slice(3))).toMatchObject({ level: 'warn', msg: 'admin_security_alert', event: 'admin.locked' });
  });
});
