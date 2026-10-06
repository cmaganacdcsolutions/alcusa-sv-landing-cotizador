/**
 * Real-browser smoke of the admin against MariaDB (alcusa_test): login -> promo create -> archive -> reactivate -> publish.
 *   npm run smoke:admin          (needs server/.env from db:setup-local and a running MariaDB)
 * Starts the admin on port 4500 (never 4400/4410) and drives Chromium over http://localhost, which proves the
 * `__Host-` + Secure cookie is accepted on localhost. TEST-ONLY seed: the admin password is random per run, held in
 * memory, never printed or stored. Refuses to run unless the target database name ends in _test.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { buildApp } from '../src/http/app.ts';
import { AuthService } from '../src/modules/admin/auth-service.ts';
import { COOKIE } from '../src/modules/admin/routes.ts';
import { createAdminRuntime, loadAdminConfig } from '../src/modules/admin/runtime.ts';
import { dbEnv, resetAdminTables } from '../test/admin/db-env.ts';

const PORT = 4500;
const BASE = '/dev-ops-local';
const say = (m: string): void => void process.stdout.write(`${m}\n`);
function check(cond: boolean, what: string): void {
  if (!cond) throw new Error(`SMOKE FAIL: ${what}`);
  say(`ok  ${what}`);
}

async function main(): Promise<void> {
  process.env['NODE_ENV'] = 'test';
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = dbEnv();
  if (!env) throw new Error('DB env absent: run npm run db:setup-local first');
  await resetAdminTables(env); // throws unless the database is *_test

  const out = mkdtempSync(join(tmpdir(), 'smoke-out-'));
  const images = mkdtempSync(join(tmpdir(), 'smoke-img-'));
  const cfg = loadAdminConfig({ ...process.env, ADMIN_STORE: 'mariadb', ADMIN_BASE_PATH: BASE, ADMIN_PORT: String(PORT), PROMOTIONS_OUT_DIR: out, PROMO_IMAGES_DIR: images } as NodeJS.ProcessEnv);
  const rt = createAdminRuntime(cfg);
  const password = `${randomBytes(18).toString('base64url')}-Aa1`;
  await new AuthService({ repo: rt.store, params: { memory: 4096, passes: 1, parallelism: 1 } }).createAdmin('smoke', password, false);
  const app = await buildApp({ config: { LOG_LEVEL: 'silent', TRUST_PROXY: false, NODE_ENV: 'test', SERVE_STATIC_DIR: undefined }, admin: rt.deps });
  await app.listen({ host: '127.0.0.1', port: PORT });

  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    const site = `http://localhost:${PORT}${BASE}`;
    const promoFile = (): { promotions: Array<{ title: string }> } => JSON.parse(readFileSync(join(out, 'promotions.json'), 'utf8'));

    await page.goto(`${site}/login`);
    await page.getByLabel('Usuario').fill('smoke');
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.waitForURL(`${site}/promociones`, { timeout: 8000 }).catch(async () => {
      throw new Error(`login did not reach the panel: at ${page.url()} :: ${(await page.locator('body').innerText()).slice(0, 200)}`);
    });
    const cookie = (await page.context().cookies()).find((c) => c.name === COOKIE);
    check(cookie !== undefined && cookie.secure && cookie.httpOnly && cookie.path === '/' && cookie.sameSite === 'Strict', '__Host- cookie accepted by the browser on http://localhost (Secure, HttpOnly, Path=/, Strict)');
    await page.reload();
    check(page.url() === `${site}/promociones`, 'session survives a reload (cookie is sent back)');

    const png = await sharp({ create: { width: 1000, height: 700, channels: 3, background: '#3366aa' } }).png().toBuffer();
    await page.getByRole('link', { name: 'Nueva promoción' }).click();
    await page.getByLabel('Título').fill('Promo humo');
    await page.getByLabel('Descripción').fill('Puerta de baño instalada');
    await page.getByLabel('Precio antes (opcional)').fill('300');
    await page.getByLabel('Precio de la promoción').fill('222.50');
    await page.setInputFiles('#f', { name: 'flyer.png', mimeType: 'image/png', buffer: png });
    await page.getByLabel('Texto alternativo de la imagen').fill('Flyer de prueba');
    await page.getByLabel('Vigente desde').fill('2026-10-01');
    await page.getByLabel('Vigente hasta').fill('2026-10-31');
    await page.getByLabel('Reglas informativas (una por línea, máx. 6)').fill('Instalada\nEntrega en 5 días');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await page.waitForURL(`${site}/promociones`);
    const card = page.locator('article', { hasText: 'Promo humo' });
    check((await card.count()) === 1 && (await card.innerText()).includes('Borrador'), 'promo created as draft');
    check(promoFile().promotions.length === 0, 'draft is not in promotions.json');

    await card.getByRole('button', { name: 'Publicar', exact: true }).click();
    await page.waitForURL(`${site}/promociones`);
    check(promoFile().promotions.some((p) => p.title === 'Promo humo'), 'publish writes promotions.json');

    await card.locator('summary', { hasText: 'Archivar' }).click();
    await card.getByRole('button', { name: 'Confirmar archivado' }).click();
    await page.waitForURL(`${site}/promociones`);
    check((await page.locator('article', { hasText: 'Promo humo' }).count()) === 0, 'archived promo leaves the Activas list');
    check(promoFile().promotions.length === 0, 'archive removes it from promotions.json');

    await page.getByRole('link', { name: 'Archivadas' }).click();
    const archived = page.locator('article', { hasText: 'Promo humo' });
    check((await archived.count()) === 1 && (await archived.innerText()).includes('Archivada'), 'promo shows under the Archivadas filter');
    check((await page.getByText('Eliminar').count()) === 0, 'no hard-delete control in the UI');

    await archived.getByRole('button', { name: 'Reactivar' }).click();
    await page.waitForURL(`${site}/promociones`);
    const back = page.locator('article', { hasText: 'Promo humo' });
    check((await back.count()) === 1 && (await back.innerText()).includes('Borrador'), 'reactivate returns it to Activas as draft');

    await back.getByRole('button', { name: 'Publicar', exact: true }).click();
    await page.waitForURL(`${site}/promociones`);
    check(promoFile().promotions.some((p) => p.title === 'Promo humo'), 'publish again writes promotions.json');
    const doc = promoFile().promotions[0] as unknown as { price_promo: number; price_before: number; image: string };
    check(doc.price_promo === 222.5 && doc.price_before === 300 && /^\/images\/promos\/promo-[0-9a-f]{16}-900\.webp$/.test(doc.image), 'published prices and uploaded image path are correct');

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.waitForURL(`${site}/login`);
    await page.goto(`${site}/promociones`);
    check(page.url() === `${site}/login`, 'after logout the panel redirects to login');
    say('BROWSER SMOKE PASSED');
  } finally {
    await browser.close();
    await app.close();
    await rt.close();
    await resetAdminTables(env);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : 'smoke error'}\n`);
  process.exit(1);
});
