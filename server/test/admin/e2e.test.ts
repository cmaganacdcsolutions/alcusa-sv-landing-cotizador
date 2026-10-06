import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/http/app.ts';
import { AuthService } from '../../src/modules/admin/auth-service.ts';
import { COOKIE } from '../../src/modules/admin/routes.ts';
import { MemoryAdminStore } from '../../src/modules/admin/store.ts';
import { PromoService } from '../../src/modules/promotions/service.ts';

const BASE = '/ops-test';
const PW = 'correct horse battery staple';
let app: FastifyInstance;
let out: string;
let images: string;
let cookie = '';
let csrf = '';

const urlenc = (o: Record<string, string>): string => new URLSearchParams(o).toString();
function multipart(fields: Record<string, string>, file?: { name: string; data: Buffer }): { body: Buffer; headers: Record<string, string> } {
  const b = '----t' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (file) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: image/png\r\n\r\n`), file.data, Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { body: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}
const form = (over: Record<string, string> = {}): Record<string, string> => ({
  _csrf: csrf, title: 'Puerta Aquaclara', description: 'Corrediza instalada', product_slug: 'recta', vidrio: 'claro', price_before: '', price_promo: '222',
  image_alt: 'Flyer oficial', starts_on: '2026-10-01', ends_on: '2026-10-31', rules: 'Instalada\nEntrega en 5 días', image: '/images/promos/promo-1-900.webp', intent: 'publish', ...over,
});
const published = (): { promotions: Array<Record<string, unknown>> } => JSON.parse(readFileSync(join(out, 'promotions.json'), 'utf8'));
const post = (url: string, fields: Record<string, string>, extra: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `${BASE}${url}`, payload: urlenc(fields), headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, ...extra } });
const cookieFrom = (r: { headers: Record<string, unknown> }): string => {
  const sc = ([] as string[]).concat((r.headers['set-cookie'] as string | string[] | undefined) ?? []).find((c) => c.startsWith(COOKIE));
  return sc ? sc.split(';')[0]! : '';
};

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'e2e-out-'));
  images = mkdtempSync(join(tmpdir(), 'e2e-img-'));
  const store = new MemoryAdminStore();
  const now = () => new Date('2026-10-06T12:00:00Z');
  const auth = new AuthService({ repo: store, now, params: { memory: 64, passes: 1, parallelism: 1 } });
  await auth.createAdmin('carlos', PW, false);
  const promos = new PromoService({ repo: store, outDir: out, audit: (e) => store.audit(e), now });
  app = await buildApp({ config: { LOG_LEVEL: 'silent', TRUST_PROXY: false, NODE_ENV: 'test', SERVE_STATIC_DIR: undefined }, admin: { base: BASE, auth, promos, imagesDir: images, imageUrlPrefix: '/images/promos', now } });
});
afterAll(async () => app.close());

describe('admin e2e: login -> create -> edit -> delete -> promotions.json', () => {
  it('panel routes redirect to login without a session', async () => {
    const r = await app.inject({ url: `${BASE}/promociones` });
    expect(r.statusCode).toBe(303);
    expect(r.headers['location']).toBe(`${BASE}/login`);
  });
  it('login page: Spanish copy, strict CSP, noindex, no-store', async () => {
    const r = await app.inject({ url: `${BASE}/login` });
    expect(r.body).toContain('Iniciar sesión');
    expect(r.headers['content-security-policy']).toContain("script-src 'self'");
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-robots-tag']).toContain('noindex');
  });
  it('bad credentials -> 401 single generic message', async () => {
    const r = await post('/login', { username: 'carlos', password: 'wrong' });
    expect(r.statusCode).toBe(401);
    expect(r.body).toContain('Credenciales inválidas');
  });
  it('good login sets a __Host- cookie (Secure, HttpOnly, Strict, Path=/, no Domain)', async () => {
    const r = await post('/login', { username: 'carlos', password: PW });
    expect(r.statusCode).toBe(303);
    const sc = String(([] as string[]).concat(r.headers['set-cookie'] as string)[0]);
    expect(sc).toMatch(/^__Host-alcusa_admin=[0-9a-f]{64}/);
    expect(sc).toMatch(/Secure/i);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Strict/i);
    expect(sc).toMatch(/Path=\//);
    expect(sc).not.toMatch(/Domain/i);
    cookie = cookieFrom(r);
    const list = await app.inject({ url: `${BASE}/promociones`, headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.body).toContain('Productos · próximamente');
    csrf = /name="_csrf" value="([0-9a-f]{64})"/.exec(list.body)![1]!;
  });
  it('POST without or with a wrong CSRF token is rejected (403) and mutates nothing', async () => {
    expect((await post('/promociones', form({ _csrf: 'x'.repeat(64) }))).statusCode).toBe(403);
    expect((await post('/logout', {})).statusCode).toBe(403);
    expect((await post('/promociones', form(), { origin: 'https://evil.example' })).statusCode).toBe(403);
    expect(existsSync(join(out, 'promotions.json'))).toBe(false);
  });
  let id = '';
  it('create (publish) writes promotions.json with the exact site contract', async () => {
    const m = multipart(form());
    const r = await app.inject({ method: 'POST', url: `${BASE}/promociones`, payload: m.body, headers: { ...m.headers, cookie } });
    expect(r.statusCode).toBe(303);
    const p = published().promotions;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ title: 'Puerta Aquaclara', price_before: null, price_promo: 222, placeholder: false, cotizador_params: { vidrio: 'claro' }, rules: ['Instalada', 'Entrega en 5 días'] });
    id = String(p[0]!['id']);
  });
  it('invalid input -> 422 with the form re-rendered, file untouched', async () => {
    const before = readFileSync(join(out, 'promotions.json'), 'utf8');
    const m = multipart(form({ price_before: '100', price_promo: '150' }));
    const r = await app.inject({ method: 'POST', url: `${BASE}/promociones`, payload: m.body, headers: { ...m.headers, cookie } });
    expect(r.statusCode).toBe(422);
    expect(r.body).toContain('menor que');
    expect(readFileSync(join(out, 'promotions.json'), 'utf8')).toBe(before);
  });
  it('edit changes the published file; price_before accepted', async () => {
    const m = multipart(form({ title: 'Puerta Aquaclara PLUS', price_before: '260' }));
    const r = await app.inject({ method: 'POST', url: `${BASE}/promociones/${id}`, payload: m.body, headers: { ...m.headers, cookie } });
    expect(r.statusCode).toBe(303);
    expect(published().promotions[0]).toMatchObject({ id, title: 'Puerta Aquaclara PLUS', price_before: 260 });
  });
  it('image upload: same webp sizes (600/900), never enlarges, rejects non-images', async () => {
    const png = await sharp({ create: { width: 1000, height: 700, channels: 3, background: '#3366aa' } }).png().toBuffer();
    const m = multipart(form({ title: 'Con imagen', image: '' }), { name: 'x.png', data: png });
    const r = await app.inject({ method: 'POST', url: `${BASE}/promociones`, payload: m.body, headers: { ...m.headers, cookie } });
    expect(r.statusCode).toBe(303);
    const img = String(published().promotions.find((x) => x['title'] === 'Con imagen')!['image']);
    expect(img).toMatch(/^\/images\/promos\/promo-[0-9a-f]{16}-900\.webp$/);
    const key = img.split('/').pop()!.replace('-900.webp', '');
    expect((await sharp(join(images, `${key}-900.webp`)).metadata()).width).toBe(900);
    const m600 = await sharp(join(images, `${key}-600.webp`)).metadata();
    expect([m600.width, m600.height, m600.format]).toEqual([600, 420, 'webp']);
    const bad = multipart(form({ title: 'Mala', image: '' }), { name: 'x.png', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
    const rb = await app.inject({ method: 'POST', url: `${BASE}/promociones`, payload: bad.body, headers: { ...bad.headers, cookie } });
    expect(rb.statusCode).toBe(422);
  });
  it('unpublish removes it from the file; delete removes the record; file reflects it', async () => {
    const un = await post(`/promociones/${id}/despublicar`, { _csrf: csrf });
    expect(un.statusCode).toBe(303);
    expect(published().promotions.map((x) => x['id'])).not.toContain(id);
    const re = await post(`/promociones/${id}/publicar`, { _csrf: csrf });
    expect(re.statusCode).toBe(303);
    expect(published().promotions.map((x) => x['id'])).toContain(id);
    const del = await post(`/promociones/${id}/eliminar`, { _csrf: csrf });
    expect(del.statusCode).toBe(303);
    expect(published().promotions.map((x) => x['id'])).not.toContain(id);
    expect((await app.inject({ url: `${BASE}/promociones/${id}/editar`, headers: { cookie } })).statusCode).toBe(404);
  });
  it('cap of 3 overlapping published promos', async () => {
    for (const t of ['A uno', 'B dos']) {
      const m = multipart(form({ title: t }));
      await app.inject({ method: 'POST', url: `${BASE}/promociones`, payload: m.body, headers: { ...m.headers, cookie } });
    }
    // "Con imagen" + A + B = 3 published in October; a 4th must be refused
    const m = multipart(form({ title: 'C tres' }));
    const r = await app.inject({ method: 'POST', url: `${BASE}/promociones`, payload: m.body, headers: { ...m.headers, cookie } });
    expect(r.statusCode).toBe(422);
    expect(r.body).toContain('Ya hay 3');
  });
  it('logout kills the session', async () => {
    expect((await post('/logout', { _csrf: csrf })).statusCode).toBe(303);
    expect((await app.inject({ url: `${BASE}/promociones`, headers: { cookie } })).statusCode).toBe(303);
  });
  it('reserved 2FA routes answer 404 while mode is off', async () => {
    expect((await app.inject({ url: `${BASE}/login/mfa` })).statusCode).toBe(404);
  });
});
