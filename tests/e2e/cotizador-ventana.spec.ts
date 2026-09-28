import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// android412 flake fix: Cotizador is `client:load`, hydrating asynchronously.
// Same wait pattern as tests/e2e/cotizador.spec.ts (S5).
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

// "Ventana Francesa/Bilbao" (T6.1). Never opens a real WhatsApp/Wompi link —
// fixtures.ts blocks those routes. android412 has a hydration race on the
// first product-card click (per S6 brief), hence the toPass() wrap below.
test.describe('cotizador — ventana, repeatable rows + requiresQuote', () => {
  async function openVentana(page: Page) {
    await page.goto('/cotizador#cotizador/0-producto');
    await waitForHydration(page);
    const card = page.getByRole('button', { name: /Ventana Francesa o Bilbao/ });
    const nextBtn = page.getByRole('button', { name: 'Siguiente' });
    await expect(async () => {
      await card.click();
      await expect(nextBtn).toBeVisible({ timeout: 1500 });
    }).toPass();
  }

  test('1.20x1.00 Francesa blanco/claro qty1 → $162; + zaranda → $198', async ({ page }) => {
    await openVentana(page);

    await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
    await page.getByRole('button', { name: 'Blanco', exact: true }).click();
    await page.getByRole('button', { name: 'Claro', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$162.00');

    await page.getByRole('button', { name: '← Medidas' }).click();
    await page.getByRole('checkbox', { name: /Zaranda/ }).check();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$198.00');
  });

  test('qty3, same row → $486 subtotal (zone fee applies once at order level in S7, not here)', async ({ page }) => {
    await openVentana(page);

    await page.getByLabel('Cantidad, ventana 1').fill('3');
    await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
    await page.getByRole('button', { name: 'Blanco', exact: true }).click();
    await page.getByRole('button', { name: 'Claro', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

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
    await page.getByRole('button', { name: 'Siguiente' }).click();

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
    await page.getByRole('button', { name: 'Siguiente' }).click();

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
    await page.getByRole('button', { name: 'Siguiente' }).click();
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
