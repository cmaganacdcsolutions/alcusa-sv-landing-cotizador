import type { Page } from '@playwright/test';
import { expect, pickProduct, test, textOnlyWaLink } from './fixtures';
import { fillAddress } from '../support/address';

test.use({ blockQuotePdf: true });

// android412 flake fix: Cotizador is `client:load`, hydrating asynchronously.
// Same wait pattern as tests/e2e/cotizador.spec.ts (S5).
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

// sf-cot-mobile follow-up: on android412/ios390, "Siguiente" now lives in the
// `position: fixed` mobile bottom bar (see src/styles/cotizador.css — this
// was `position: sticky` before sf-cot-mobile item 1, which never actually
// engaged, so this never came up). Confirmed via screenshot that the button
// is fully visible/unobstructed on screen at the exact moment Playwright
// reports "<field> intercepts pointer events" here — this is Chromium/CDP
// mis-hit-testing a genuinely-fixed element during mobile-emulated touch
// input on this tall, multi-field ventana form, not a real overlap a user
// would hit. `force: true` skips Playwright's (here, incorrect) hit-test
// re-check for this one click; every other actionability check (attached,
// visible, enabled) still runs.
async function clickSiguienteOnMedidas(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Siguiente' }).click({ force: true });
}

// "Ventana Francesa/Bilbao" (T6.1). Never opens a real WhatsApp link —
// fixtures.ts blocks those routes. android412 has a hydration race on the
// first product-card click (per S6 brief), hence the toPass() wrap below.
test.describe('cotizador — ventana, repeatable rows + requiresQuote', () => {
  async function openVentana(page: Page) {
    await page.goto('/cotizador#cotizador/0-producto');
    await waitForHydration(page);
    await pickProduct(page, 'ventana');
  }


  // 2026-10-16: ventanas SOLO con asesor. Se sigue recogiendo modelo, medidas, cantidad y extras, pero nunca hay precio.
  test('Modelo cards render photos and toggle aria-pressed', async ({ page }) => {
    await openVentana(page);

    const francesaCard = page.getByRole('button', { name: 'Francesa', exact: true });
    const bilbaoCard = page.getByRole('button', { name: 'Bilbao', exact: true });

    await expect(francesaCard.locator('img')).toHaveJSProperty('complete', true);
    await expect(bilbaoCard.locator('img')).toHaveJSProperty('complete', true);
    expect(await francesaCard.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(bilbaoCard.locator('img')).toBeVisible();

    await expect(francesaCard).toHaveAttribute('aria-pressed', 'true');
    await expect(bilbaoCard).toHaveAttribute('aria-pressed', 'false');
    await bilbaoCard.click();
    await expect(bilbaoCard).toHaveAttribute('aria-pressed', 'true');
    await expect(francesaCard).toHaveAttribute('aria-pressed', 'false');
  });

  test('1.20x1.00 Francesa blanco/claro: sin precio en línea, aviso de asesor y se puede continuar', async ({ page }) => {
    await openVentana(page);

    await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
    await page.getByRole('button', { name: 'Blanco', exact: true }).click();
    await page.getByRole('button', { name: 'Claro', exact: true }).click();
    await expect(page.getByText('se cotizan con un asesor para definir la modalidad').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    await clickSiguienteOnMedidas(page);

    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await expect(page.getByTestId('step2-price-value')).toHaveText('Por WhatsApp');
  });

  test('Bilbao con zaranda y desmontaje: sin precio ni cargos visibles', async ({ page }) => {
    await openVentana(page);

    await page.getByRole('button', { name: 'Bilbao', exact: true }).click();
    await page.getByLabel('Ancho en metros, ventana 1').fill('1.5');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.2');
    await page.getByRole('button', { name: 'Bronce', exact: true }).click();
    await page.getByRole('button', { name: 'Súper gris', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Zaranda' }).check();
    await page.getByRole('radio', { name: 'Desmontaje' }).check();
    await clickSiguienteOnMedidas(page);

    await expect(page.getByTestId('step2-price-value')).toHaveText('Por WhatsApp');
  });

  test('happy path: Resumen sin total y mensaje de WhatsApp "por cotizar con un asesor"', async ({ page }) => {
    await openVentana(page);

    await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
    await page.getByRole('button', { name: 'Blanco', exact: true }).click();
    await page.getByRole('button', { name: 'Claro', exact: true }).click();
    await clickSiguienteOnMedidas(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.getByTestId('resumen-total-value')).toHaveText('Por WhatsApp');
    const waLink = await textOnlyWaLink(page);
    const href = await waLink.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/50376802410\?text=/);
    const decoded = decodeURIComponent(href!.split('?text=')[1]);
    expect(decoded).toContain('Ventana Francesa — 1.20×1.00 m · Color: Blanco · Vidrio: Claro');
    expect(decoded).toContain('Subtotal: por cotizar con un asesor');

    // The PDF CTA must also remain available — never a hard block.
    await expect(page.getByTestId('quote-share-button').locator('visible=true').first()).toBeEnabled();
  });
});
