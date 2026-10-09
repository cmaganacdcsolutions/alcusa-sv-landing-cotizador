import { spawnSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { CATEGORIES } from '@content/catalog';
import {
  HINGED_WIDTH_MAX_CM, HINGED_WIDTH_MIN_CM, STRAIGHT_WIDTH_MAX_CM, STRAIGHT_WIDTH_MIN_CM,
  TEMPERED_WIDTH_MAX_CM, TEMPERED_WIDTH_MIN_CM,
} from '@engine/pricing';
import { FAMILIES } from '../support/combos';
import { findBrokenImages } from '../support/images';
import { fillAddress } from '../support/address';

// DEV-MODE SMOKE (astro dev on :4420, see playwright.smoke.config.ts). Fails on ANY console error,
// pageerror, failed request, HTTP >= 400, or broken / 0x0 image. This is the gate that catches
// dev-only crashes such as `_jsxDEV is not a function`.

const AREAS = (process.env.SMOKE_AREAS ?? 'cotizador,home,catalogo,contacto,promos,layout').split(',').map((a) => a.trim());
const want = (...areas: string[]): boolean => AREAS.includes('layout') || areas.some((a) => AREAS.includes(a));

const MID: Record<string, number> = {
  recta: Math.round((STRAIGHT_WIDTH_MIN_CM + STRAIGHT_WIDTH_MAX_CM) / 2),
  bisagra: Math.round((HINGED_WIDTH_MIN_CM + HINGED_WIDTH_MAX_CM) / 2),
  templado: Math.round((TEMPERED_WIDTH_MIN_CM + TEMPERED_WIDTH_MAX_CM) / 2),
};

/** The island must really render (step-0 tiles), not just the h1 with an empty shell (the _jsxDEV symptom). */
async function expectWizardRendered(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
  const tiles = page.getByRole('group', { name: 'Categoría' }).getByRole('button');
  await expect(tiles.first()).toBeVisible();
  expect(await tiles.count()).toBeGreaterThanOrEqual(3);
}

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console.error: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));
  return problems;
}

test.beforeEach(async ({ page }) => {
  // ADR-014 A5: in `astro dev` /api is proxied to 127.0.0.1:3001 (usually not running -> 500). Answer 204 ("nothing
  // published") so the runtime promos fetch keeps the baked HTML without counting as a failed request.
  await page.route('**/api/promotions.json', (route) => route.fulfill({ status: 204 }));
  // Never reach the real WhatsApp / Wompi; answer 200 so they do not count as failed requests.
  // External hosts only: in dev the app's own modules live under /src/integrations/wompi/..., which a
  // '**wompi**' glob would swallow (-> 'Failed to fetch dynamically imported module').
  await page.route(/^https?:\/\/(?!localhost)[^/]*(wa\.me|whatsapp\.com|wompi)[^/]*\//i, (route) =>
    route.fulfill({ status: 200, body: '' }),
  );
});

const PAGES: { url: string; areas: string[] }[] = [
  { url: '/', areas: ['home', 'promos'] },
  { url: '/cotizador', areas: ['cotizador'] },
  { url: '/contacto', areas: ['contacto'] },
  { url: '/catalogo/', areas: ['catalogo'] },
  ...CATEGORIES.flatMap((c) => [
    { url: `/catalogo/${c.slug}/`, areas: ['catalogo'] },
    ...c.subcategories.map((s) => ({ url: `/catalogo/${c.slug}/${s.slug}/`, areas: ['catalogo'] })),
  ]),
].filter((p) => want(...p.areas));

// Vite optimises dependencies on first touch and may reload the page once: warm the entry pages first
// so the assertions below measure the app, not the cold start. Errors are NOT hidden: the checked pass
// loads the same pages again and must be 100% clean.
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const url of ['/', '/cotizador#cotizador/0-producto', '/contacto', '/catalogo/']) {
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
  await ctx.close();
});

for (const { url } of PAGES) {
  test(`pagina limpia: ${url}`, async ({ page }) => {
    const problems = watch(page);
    await page.goto(url, { waitUntil: 'networkidle' });
    if (url === '/cotizador') await expectWizardRendered(page);
    const broken = await findBrokenImages(page);
    expect(broken, 'imagenes rotas o 0x0').toEqual([]);
    expect(problems, 'errores de consola / red').toEqual([]);
  });
}

if (want('cotizador')) {
  for (const fam of FAMILIES) {
    test(`cotizador (dev): ${fam.model} llega hasta el resumen`, async ({ page }) => {
      const problems = watch(page);
      await page.goto('/cotizador#cotizador/0-producto', { waitUntil: 'networkidle' });
      await expectWizardRendered(page);
      const types = page.getByRole('group', { name: /^(Tipo de|Hojas de la)/ });
      await expect(async () => {
        await page.getByRole('group', { name: 'Categoría' }).getByRole('button').nth(fam.categoryIndex).click();
        await expect(types).toBeVisible({ timeout: 1500 });
      }).toPass();
      await types.getByRole('button').nth(fam.typeIndex).click();
      if (fam.variantIndex !== null) await page.getByRole('group', { name: /^Acabado/ }).getByRole('button').nth(fam.variantIndex).click();
      const next = page.getByRole('button', { name: 'Siguiente' });
      await next.click({ force: true });
      await expect(page.locator('#step1-heading')).toBeVisible();
      if (MID[fam.model]) await page.locator('#ancho').fill(String(MID[fam.model]));
      await next.click({ force: true });
      await expect(page.locator('#step2-heading')).toBeVisible();
      expect((await page.getByTestId('step2-price-value').innerText()).trim()).toMatch(/^\$[\d,]+\.\d{2}$/);
      expect(await findBrokenImages(page), 'imagenes del paso 2').toEqual([]);
      await next.click({ force: true });
      await expect(page.locator('#step3-heading')).toBeVisible();
      await fillAddress(page, 'Soyapango');
      await next.click({ force: true });
      await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
      await expect(page.getByTestId('resumen-total-value')).toHaveText(/^\$[\d,]+\.\d{2}$/);
      expect(problems, 'errores de consola / red').toEqual([]);
    });
  }
}

// Promos de src/content/promotions.json (orden del home): todas recta + aluminio natural, cambia el vidrio.
const PROMO_GLASSES = [['claro', 'Claro 5 mm', 'promo-puerta-aquaclara'], ['nevado', 'Nevado 5 mm', 'promo-corrediza-nevado'], ['aquafold', 'Aquafold', 'promo-aquafold']] as const;
const promoDeepLink = (glass: string, id: string): string => `/cotizador?producto=recta&paso=medidas&color=natural&vidrio=${glass}&promo=${id}`;

if (want('promos', 'home')) {
  test('home (dev): CTA de promo abre el cotizador sin errores', async ({ page }) => {
    const problems = watch(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    // Los 3 enlaces reales de las promos (src/content/promotions.json + promoHref): producto -> paso -> color -> vidrio.
    // Son los mismos que usa el test de deep links de abajo, para que no se desfasen del home.
    await expect(page.locator('[data-promo-cta]')).toHaveCount(PROMO_GLASSES.length);
    expect(await page.locator('[data-promo-cta]').evaluateAll((els) => els.map((e) => e.getAttribute('href')))).toEqual(
      PROMO_GLASSES.map(([glass, , id]) => promoDeepLink(glass, id)),
    );
    await page.locator('[data-promo-cta]').first().click();
    // El enlace de la promo cae directo en Medidas (producto + color + vidrio ya elegidos).
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await expect(page.getByTestId('promo-locked')).toContainText('Natural');
    expect(problems).toEqual([]);
  });
}

// The 3 promo CTA deep links, in dev mode: the exact hrefs the home emits (promoHref) land straight on
// Medidas with the aluminium colour and the glass preselected.
if (want('promos', 'home', 'cotizador')) {
  for (const [glass, label, id] of PROMO_GLASSES) {
    test(`deep link de promo (dev): vidrio=${glass} preselecciona ${label}`, async ({ page }) => {
      const problems = watch(page);
      await page.goto(promoDeepLink(glass, id), { waitUntil: 'networkidle' });
      await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
      await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
      await expect(page.getByTestId('promo-locked')).toContainText('Natural');
      await expect(page.getByTestId('promo-locked')).toContainText(label);
      expect(problems, 'errores de consola / red').toEqual([]);
    });
  }
}

// COLLISION REGRESSION (the one that kept breaking the live dev server): a production build in the SAME
// checkout while a dev server runs must not poison the dev server's dep cache. Previously the build
// re-optimized the shared .vite-cache and the running dev server served production React next to dev JSX
// ("_jsxDEV is not a function": h1 only, no wizard tiles). Needs a per-process cache (astro.config.mjs).
// Keep this test LAST: it builds while the server is up, then reloads and demands a fully rendered wizard.
test('dev + build en el mismo checkout: el dev server sigue renderizando el cotizador', async ({ page }) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  await page.goto('/cotizador', { waitUntil: 'networkidle' });
  await expectWizardRendered(page);

  const build = spawnSync('npx astro build --outDir dist-e2e/collision', {
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, PUBLIC_COTIZADOR_MODE: 'mock', PUBLIC_QUOTE_API: 'mock', ALCUSA_PROMOS_TODAY: '2026-10-15' },
  });
  expect(build.status, build.stdout + build.stderr).toBe(0);

  await page.reload({ waitUntil: 'networkidle' });
  await expectWizardRendered(page);
  await page.goto('/cotizador?producto=recta&vidrio=nevado', { waitUntil: 'networkidle' });
  await expectWizardRendered(page);
  expect(problems.filter((p) => /_jsxDEV|pageerror/.test(p)), 'dev server envenenado por el build').toEqual([]);
  expect(problems, 'errores de consola / red').toEqual([]);
});
