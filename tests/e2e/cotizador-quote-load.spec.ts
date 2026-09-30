import type { Page } from '@playwright/test';
import { formatQuoteCode } from '../../src/integrations/quotes/code';
import { mockCodes } from '../../src/integrations/quotes/mockClient';
import { expect, test } from './fixtures';

// F4 (ADR-012) + R5 selector. Runs against the MOCK adapter (build with
// PUBLIC_QUOTE_API=mock). Codes are computed with the same pure functions.
const codes = mockCodes();
const show = (c: string): string => formatQuoteCode(c);

const CART_ITEM = {
  id: 'x', productId: 'recta', width: '110', color: 'natural', glass: 'claro', cornerModel: 'aquaclara',
  hingedQty: '1', hingedFixedPanelEnabled: false, hingedFixedPanelWidthM: '', hingedFixedPanelHeightM: '',
  windowModel: 'francesa', windowFrame: 'blanco', windowGlass: 'claro', windowZaranda: false, windowDesmontaje: false,
  windowRows: [{ id: 'r', qty: '1', widthM: '1.20', heightM: '1.00' }], gardenHojas: 1, gardenWidth: '1.00',
  gardenHeightOption: '2.10', gardenHeightOtra: '', gardenColor: 'blanco', gardenGlass: 'claro', gardenQty: '1',
};

async function ready(page: Page, url = '/cotizador'): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

async function openBlock(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: '¿Ya tienes una cotización?', expanded: false });
  if (await toggle.count()) await toggle.click();
}

const field = (page: Page) => page.getByLabel('Código de tu cotización');
const cta = (page: Page) => page.getByRole('button', { name: 'Cargar cotización' });

test.describe('R5 selector', () => {
  test('3 levels: L shows Acabado, Siguiente gated until a finish is picked', async ({ page }) => {
    await ready(page);
    const next = page.getByRole('button', { name: 'Siguiente' });
    await expect(next).toBeDisabled();
    await page.getByRole('button', { name: /^Puertas de baño/ }).click();
    await page.getByRole('button', { name: /^En L/ }).click();
    await expect(page.getByText('3 · ACABADO')).toBeVisible();
    await expect(next).toBeDisabled();
    await page.getByRole('button', { name: /^Frosted/ }).click();
    await expect(next).toBeEnabled();
    await next.click();
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect(page).toHaveURL(/#cotizador\/1-medidas/);
  });

  test('Jardin "Mas opciones" is advisor-only: sheet + WhatsApp, no wizard', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: /^Puertas de jardín/ }).click();
    await page.getByRole('button', { name: /^Más opciones/ }).click();
    await expect(page.getByText('Esta puerta la cotiza un asesor')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    const href = await page.getByRole('link', { name: /Cotizar con un asesor por WhatsApp/ }).getAttribute('href');
    expect(href).toContain('https://wa.me/');
  });

  test('?producto= deep link keeps working with the new slugs', async ({ page }) => {
    await ready(page, '/cotizador?producto=l-aquafold');
    await expect(page.getByText('1 · CATEGORÍA')).toHaveCount(0);
  });
});

test.describe('F4 cargar cotizacion', () => {
  test('empty state copy, button disabled until the format is valid', async ({ page }) => {
    await ready(page);
    await openBlock(page);
    await expect(page.getByText('Ingresa tu código para cargarla. Lo encuentras en tu PDF o en el mensaje de WhatsApp.')).toBeVisible();
    await expect(cta(page)).toBeDisabled();
    await field(page).fill('alc20260930k7qm');
    await field(page).blur();
    await expect(page.getByText(/^El código está incompleto\./)).toBeVisible();
    await field(page).fill(show(codes.found));
    await expect(field(page)).toHaveValue(show(codes.found));
    await expect(cta(page)).toBeEnabled();
  });

  test('wrong check char and contingency folio', async ({ page }) => {
    await ready(page);
    await openBlock(page);
    await field(page).fill(show(codes.found).slice(0, -1) + 'U');
    await field(page).blur();
    await expect(page.getByText('Revisa el código: parece que hay un carácter equivocado.')).toBeVisible();
    await field(page).fill('L-20260930-K7QM-3X9T');
    await field(page).blur();
    await expect(page.getByText(/se generó sin conexión y no quedó guardada/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Escribir por WhatsApp', exact: true })).toBeVisible();
  });

  test('found -> toast + Resumen', async ({ page }) => {
    await ready(page);
    await openBlock(page);
    await field(page).fill(show(codes.found));
    await cta(page).click();
    await expect(page.getByRole('status').filter({ hasText: /cargada\. Puedes revisarla y editarla\./ })).toBeVisible();
    await expect(page).toHaveURL(/#cotizador\/4-resumen/);
  });

  test('not found, offline and rate limited', async ({ page }) => {
    await ready(page);
    await openBlock(page);
    await field(page).fill(show(codes.offline));
    await cta(page).click();
    await expect(page.getByText('No pudimos consultar tu cotización. Revisa tu conexión e inténtalo de nuevo.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Empezar una nueva' })).toBeVisible();
    await field(page).fill(show(codes.rateLimited));
    await cta(page).click();
    await expect(page.getByText('Vuelve a intentarlo en 4 min.')).toBeVisible();
    await expect(cta(page)).toBeDisabled();
  });

  test('changed prices: notice on Resumen lists the changes and Entendido closes it', async ({ page }) => {
    await ready(page);
    await openBlock(page);
    await field(page).fill(show(codes.changed));
    await cta(page).click();
    const notice = page.getByTestId('quote-notice');
    await expect(notice.getByRole('heading', { name: 'Actualizamos tu cotización' })).toBeVisible();
    await expect(notice).toContainText('ya no está disponible y se quitó de tu cotización.');
    await expect(notice).toContainText('Total anterior $550 · Total actual');
    await notice.getByRole('button', { name: 'Entendido' }).click();
    await expect(notice).toHaveCount(0);
  });

  test('expired quote shows the band + "Precios actualizados"', async ({ page }) => {
    await ready(page);
    await openBlock(page);
    await field(page).fill(show(codes.expired));
    await cta(page).click();
    await expect(page.getByTestId('quote-notice')).toContainText(/Esta cotización venció el .* Cargamos tus productos con los precios de hoy\./);
    await expect(page.getByTestId('quote-notice')).toContainText('Precios actualizados');
  });

  test('cart with items asks to confirm (Esc cancels, Reemplazar loads)', async ({ page }) => {
    await page.addInitScript((item) => sessionStorage.setItem('alcusa-cotizador-cart', JSON.stringify([item])), CART_ITEM);
    await ready(page);
    await openBlock(page);
    await field(page).fill(show(codes.found));
    await cta(page).click();
    const dlg = page.getByRole('alertdialog');
    await expect(dlg).toContainText('Ya tienes productos en tu cotización actual. Si cargas la anterior, se reemplazarán.');
    await expect(dlg.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await cta(page).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reemplazar' }).click();
    await expect(page).toHaveURL(/#cotizador\/4-resumen/);
  });

  test('?folio= loads automatically and the URL is cleaned with replaceState', async ({ page }) => {
    await ready(page, `/cotizador?folio=${encodeURIComponent(codes.changed)}`);
    await expect(page.getByTestId('quote-notice')).toBeVisible();
    expect(new URL(page.url()).searchParams.has('folio')).toBe(false);
  });

  test('?folio= failing prefills the field with the matching state', async ({ page }) => {
    await ready(page, `/cotizador?folio=${encodeURIComponent(codes.offline)}`);
    await expect(field(page)).toHaveValue(show(codes.offline));
    await expect(page.getByText('No pudimos consultar tu cotización.')).toBeVisible();
  });
});

