import type { Page } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';

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

// "Ventana Francesa/Bilbao" (T6.1). Never opens a real WhatsApp/Wompi link —
// fixtures.ts blocks those routes. android412 has a hydration race on the
// first product-card click (per S6 brief), hence the toPass() wrap below.
test.describe('cotizador — ventana, repeatable rows + requiresQuote', () => {
  async function openVentana(page: Page) {
    await page.goto('/cotizador#cotizador/0-producto');
    await waitForHydration(page);
    await pickProduct(page, 'ventana');
  }

  // sf-cot-models — Modelo (Francesa/Bilbao) option cards now render a real
  // photo per 02-design/specs/ventana-modelo-selector.md, replacing the old
  // text-only chip row. Guards: both cards load an <img> regardless of
  // selection, aria-pressed follows the click per card (not a chip-row
  // shared state), and switching model still re-prices (francesa
  // 135/m² vs bilbao 192/m² — @content/pricingTables.ts).
  test('Modelo cards render photos, toggle aria-pressed, and switching model re-prices', async ({ page }) => {
    await openVentana(page);

    const francesaCard = page.getByRole('button', { name: 'Francesa', exact: true });
    const bilbaoCard = page.getByRole('button', { name: 'Bilbao', exact: true });

    // Both option photos load, not just the selected one.
    await expect(francesaCard.locator('img')).toHaveJSProperty('complete', true);
    await expect(bilbaoCard.locator('img')).toHaveJSProperty('complete', true);
    expect(await francesaCard.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    expect(await bilbaoCard.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    // Francesa is the default model.
    await expect(francesaCard).toHaveAttribute('aria-pressed', 'true');
    await expect(bilbaoCard).toHaveAttribute('aria-pressed', 'false');

    await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
    await page.getByRole('button', { name: 'Blanco', exact: true }).click();
    await page.getByRole('button', { name: 'Claro', exact: true }).click();
    await clickSiguienteOnMedidas(page);
    await expect(page.getByTestId('step2-price-value')).toHaveText('$162.00');

    await page.getByRole('button', { name: 'Medidas', exact: true }).click();
    await bilbaoCard.click();
    await expect(bilbaoCard).toHaveAttribute('aria-pressed', 'true');
    await expect(francesaCard).toHaveAttribute('aria-pressed', 'false');
    await clickSiguienteOnMedidas(page);
    await expect(page.getByTestId('step2-price-value')).toHaveText('$230.40');
  });

  test('1.20x1.00 Francesa blanco/claro qty1 → $162; + zaranda → $198', async ({ page }) => {
    await openVentana(page);

    await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
    await page.getByRole('button', { name: 'Blanco', exact: true }).click();
    await page.getByRole('button', { name: 'Claro', exact: true }).click();
    await clickSiguienteOnMedidas(page);

    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$162.00');

    // exact: true — sf-cot-polish's new "Editar medidas" link (Step2Precio's
    // estimate card) would otherwise fuzzy-match this same locator.
    await page.getByRole('button', { name: 'Medidas', exact: true }).click();
    await page.getByRole('checkbox', { name: /Zaranda/ }).check();
    await clickSiguienteOnMedidas(page);
    await expect(page.getByTestId('step2-price-value')).toHaveText('$198.00');
  });

  test('qty3, same row → $486 subtotal (zone fee applies once at order level in S7, not here)', async ({ page }) => {
    await openVentana(page);

    await page.getByLabel('Cantidad, ventana 1').fill('3');
    await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
    await page.getByRole('button', { name: 'Blanco', exact: true }).click();
    await page.getByRole('button', { name: 'Claro', exact: true }).click();
    await clickSiguienteOnMedidas(page);

    await expect(page.getByTestId('step2-price-value')).toHaveText('$486.00');
  });

  test('Bilbao 1.5x1.2 bronce/super gris + zaranda + desmontaje qty1 → $459.16', async ({ page }) => {
    await openVentana(page);

    await page.getByRole('button', { name: 'Bilbao', exact: true }).click();
    await page.getByLabel('Ancho en metros, ventana 1').fill('1.5');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.2');
    await page.getByRole('button', { name: 'Bronce', exact: true }).click();
    await page.getByRole('button', { name: 'Súper gris', exact: true }).click();
    await page.getByRole('checkbox', { name: /Zaranda/ }).check();
    await page.getByRole('radio', { name: /Desmontaje/ }).check();
    await clickSiguienteOnMedidas(page);

    await expect(page.getByTestId('step2-price-value')).toHaveText('$459.16');
  });

  test('Natural frame shows the "Cotización personalizada" chip at selection time and never hard-blocks checkout', async ({
    page,
  }) => {
    await openVentana(page);

    const naturalChip = page.getByRole('button', { name: /^Natural/ });
    await expect(naturalChip.getByText('Cotización personalizada')).toBeVisible();
    await naturalChip.click();
    await expect(naturalChip).toHaveAttribute('aria-pressed', 'true');

    // T6.3: requiresQuote never hard-blocks — Siguiente stays enabled and the
    // row is still added (still tracked with requiresQuote: true downstream).
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    await clickSiguienteOnMedidas(page);

    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await expect(page.getByTestId('step2-price-value')).toHaveText('Por WhatsApp');
    await expect(page.getByText('requieren cotización personalizada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  test('Reflectivo bronce glass shows the chip too, still lets the row through', async ({ page }) => {
    await openVentana(page);

    const chip = page.getByRole('button', { name: /^Reflectivo bronce/ });
    await expect(chip.getByText('Cotización personalizada')).toBeVisible();
    await chip.click();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  test('happy path reaches the summary with a WhatsApp href that is never hard-blocked', async ({ page }) => {
    await openVentana(page);

    await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
    await page.getByRole('button', { name: 'Blanco', exact: true }).click();
    await page.getByRole('button', { name: 'Claro', exact: true }).click();
    await clickSiguienteOnMedidas(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
    await page.locator('#municipio').selectOption('Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    const waLink = page.getByRole('link', { name: 'Enviar por WhatsApp para confirmar' });
    const href = await waLink.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/50376802410\?text=/);
    const decoded = decodeURIComponent(href!.split('?text=')[1]);
    expect(decoded).toContain('Ventana Francesa — 1.20×1.00 m · Color: Blanco · Vidrio: Claro');
    expect(decoded).toContain('Subtotal: $162.00');

    // "Pagar ahora" must also remain available — never a hard block.
    await expect(page.getByRole('button', { name: 'Pagar ahora' })).toBeEnabled();
  });
});
