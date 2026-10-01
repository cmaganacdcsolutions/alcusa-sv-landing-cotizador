import { randomInt } from 'node:crypto';
import type { Browser, BrowserContextOptions, Locator, Page, TestInfo } from '@playwright/test';
import { MOCK_QUOTES_KEY } from '../../src/integrations/quotes/mockStore';
import { formatQuoteCode, makeQuoteCode } from '../../src/integrations/quotes/code';
import { expect, pickProduct, test } from '../e2e/fixtures';
import { e2eDb } from './db';

// ADR-013 N2-FE. Build with PUBLIC_QUOTE_API=http against the real API (alcusa_test). The point of the suite:
// a quote created in one browser context loads by code in ANOTHER one (the cross-device bug).

const APP_OPENED = '__opened';
const BAD_WA = 'Revisa el número: deben ser 8 dígitos y empezar con 6 o 7.';
const CONTINGENCY = 'Esta cotización se generó sin conexión y no quedó guardada. Escríbenos por WhatsApp y te ayudamos.';
const NOT_FOUND = 'No encontramos una cotización con ese código. Revisa que esté completo o escríbenos por WhatsApp.';

type Opened = Record<string, string[]>;

/** Unique per call, so shards/projects never share the 5/h-per-WhatsApp limit. Starts with 7 (valid mobile). */
const uniqueWa = (): string => `7${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;

async function stubBrowserApis(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    (window as unknown as Opened)[key] = [];
    window.open = ((u?: string | URL) => {
      (window as unknown as Opened)[key]!.push(String(u));
      return null;
    }) as typeof window.open;
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  }, APP_OPENED);
}

/** A page in a brand-new context (empty storage), with the same device settings as the running project. */
async function freshPage(browser: Browser, info: TestInfo): Promise<Page> {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const opts: BrowserContextOptions = { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch };
  const page = await (await browser.newContext(opts)).newPage();
  await page.route('**wa.me/**', (route) => route.abort());
  return page;
}

async function gotoResumen(page: Page): Promise<void> {
  await page.goto('/cotizador');
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
  await pickProduct(page, 'recta');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.locator('#municipio').selectOption('Soyapango');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
}

const dialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Tus datos para la cotización' });

async function openDialogAndFill(page: Page, wa: string): Promise<Locator> {
  await page.getByTestId('quote-share-button').locator('visible=true').click();
  const d = dialog(page);
  await d.getByLabel('Nombre').fill('Prueba Cotizador');
  await d.getByLabel('WhatsApp').fill(wa);
  await d.getByRole('checkbox').check();
  return d;
}

const total = (page: Page): Promise<string> => page.getByTestId('resumen-total-value').innerText();

/** Generates a quote through the real API and returns the canonical code plus the Resumen total. */
async function createQuote(page: Page): Promise<{ code: string; total: string }> {
  await stubBrowserApis(page);
  await gotoResumen(page);
  const t = await total(page);
  const d = await openDialogAndFill(page, uniqueWa());
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/quote-create') && r.request().method() === 'POST'),
    d.getByRole('button', { name: 'Generar mi cotización' }).click(),
  ]);
  expect([200, 201]).toContain(res.status());
  const body = (await res.json()) as { code: string };
  return { code: body.code, total: t };
}

const field = (page: Page): Locator => page.getByLabel('Código de tu cotización');
const cta = (page: Page): Locator => page.getByRole('button', { name: 'Cargar cotización' });

async function openBlock(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: '¿Ya tienes una cotización?', expanded: false });
  if (await toggle.count()) await toggle.click();
}

async function ready(page: Page, url = '/cotizador'): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

test.describe('quote created on the real API, loaded from another browser context', () => {
  test('(a) typed lowercase and grouped, same cart in Resumen', async ({ page, browser }, info) => {
    const made = await createQuote(page);
    expect(made.code).toMatch(/^ALC-\d{8}-[0-9A-Z]{8}$/);
    expect(made.code).not.toMatch(/^ALC-\d{8}-U/);

    const other = await freshPage(browser, info);
    await ready(other);
    // fresh context: nothing of the first one (incl. the mock snapshot store) is here, only the API can answer
    expect(await other.evaluate((k) => localStorage.getItem(k), MOCK_QUOTES_KEY)).toBeNull();
    await openBlock(other);
    await field(other).fill(formatQuoteCode(made.code).toLowerCase());
    await cta(other).click();
    await expect(other).toHaveURL(/#cotizador\/4-resumen/);
    await expect(other.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(other.getByText('Puerta de baño recta').first()).toBeVisible();
    await expect(other.getByTestId('resumen-total-value')).toHaveText(made.total);
    await other.context().close();
  });

  test('(b) ?folio= deep link in a new context', async ({ page, browser }, info) => {
    const made = await createQuote(page);
    const other = await freshPage(browser, info);
    await ready(other, `/cotizador?folio=${encodeURIComponent(made.code)}`);
    await expect(other).toHaveURL(/#cotizador\/4-resumen/);
    await expect(other.getByTestId('resumen-total-value')).toHaveText(made.total);
    expect(new URL(other.url()).searchParams.has('folio')).toBe(false);
    await other.context().close();
  });

  test('(d) expired quote shows the expired notice with today prices', async ({ page, browser }, info) => {
    const made = await createQuote(page);
    e2eDb('expire', made.code);
    const other = await freshPage(browser, info);
    await ready(other);
    await openBlock(other);
    await field(other).fill(formatQuoteCode(made.code));
    await cta(other).click();
    await expect(other).toHaveURL(/#cotizador\/4-resumen/);
    await expect(other.getByTestId('quote-notice')).toContainText(/Esta cotización venció el .* Cargamos tus productos con los precios de hoy\./);
    await other.context().close();
  });
});

test('(c) unknown code with valid format and check digit: not-found state', async ({ page }) => {
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' }).replaceAll('-', '');
  const code = makeQuoteCode(stamp, 'Z9Z9Z9Z');
  await ready(page);
  await openBlock(page);
  await field(page).fill(formatQuoteCode(code));
  await cta(page).click();
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
  await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
});

test('(e) server down: create falls back to a contingency U folio, loading it shows the contingency copy', async ({ page }) => {
  await page.route('**/api/quote-create', (route) => route.abort('connectionrefused'));
  await stubBrowserApis(page);
  await gotoResumen(page);
  const d = await openDialogAndFill(page, uniqueWa());
  await d.getByRole('button', { name: 'Generar mi cotización' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate((k) => (window as unknown as Opened)[k]!.length, APP_OPENED)).toBeGreaterThan(0);
  const href = decodeURIComponent((await page.evaluate((k) => (window as unknown as Opened)[k]![0], APP_OPENED)) ?? '');
  const folio = /ALC-\d{8}-U[0-9A-Z-]+/.exec(href)?.[0];
  expect(folio, 'contingency folio in the wa.me text').toBeTruthy();

  await ready(page);
  await openBlock(page);
  await field(page).fill(folio!);
  await field(page).blur(); // contingency is classified client-side, never queried
  await expect(cta(page)).toBeDisabled();
  await expect(page.getByText(CONTINGENCY)).toBeVisible();
});

test.describe('(f) landline customer rejected with the field error', () => {
  test('client validation blocks it before any request', async ({ page }) => {
    let posted = false;
    page.on('request', (r) => (posted ||= r.url().endsWith('/api/quote-create')));
    await stubBrowserApis(page);
    await gotoResumen(page);
    const d = await openDialogAndFill(page, '2123-4567');
    await d.getByRole('button', { name: 'Generar mi cotización' }).click();
    await expect(d.getByText(BAD_WA)).toBeVisible();
    expect(posted).toBe(false);
  });

  test('server 422 invalid_customer lands on the WhatsApp field (+503 landline forced past the client)', async ({ page }) => {
    await page.route('**/api/quote-create', async (route) => {
      const body = route.request().postDataJSON() as { customer: { whatsapp: string } };
      body.customer.whatsapp = '+50321234567';
      await route.continue({ postData: JSON.stringify(body) });
    });
    await stubBrowserApis(page);
    await gotoResumen(page);
    const d = await openDialogAndFill(page, uniqueWa());
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/quote-create')),
      d.getByRole('button', { name: 'Generar mi cotización' }).click(),
    ]);
    expect(res.status()).toBe(422);
    await expect(d.getByText(BAD_WA)).toBeVisible();
    await expect(d.getByText('No pudimos guardar tus datos')).toHaveCount(0);
  });
});
