import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// android412 flake fix: Cotizador is `client:load`, hydrating asynchronously.
// Same wait pattern as tests/e2e/cotizador.spec.ts (S5).
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

// "Puerta de jardín" (T6.2). Never opens a real WhatsApp/Wompi link —
// fixtures.ts blocks those routes. android412 has a hydration race on the
// first product-card click (per S6 brief), hence the toPass() wrap below.
test.describe('cotizador — jardín, promo bands + requiresQuote', () => {
  async function openJardin(page: Page) {
    await page.goto('/#cotizador/0-producto');
    await waitForHydration(page);
    const card = page.getByRole('button', { name: /^Puerta de jardín/ });
    const nextBtn = page.getByRole('button', { name: 'Siguiente' });
    await expect(async () => {
      await card.click();
      await expect(nextBtn).toBeVisible({ timeout: 1500 });
    }).toPass();
  }

  test('1 hoja 1.00x2.10 qty1 → $410 (promo band)', async ({ page }) => {
    await openJardin(page);

    await page.getByLabel('Ancho exacto de tu espacio').fill('1.00');
    await page.getByRole('button', { name: '2.10 m', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByTestId('step2-price-value')).toHaveText('$410.00');
  });

  test('1 hoja 1.00x2.40 qty1 → $410 too (same promo band, height-independent)', async ({ page }) => {
    await openJardin(page);

    await page.getByLabel('Ancho exacto de tu espacio').fill('1.00');
    await page.getByRole('button', { name: '2.40 m', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByTestId('step2-price-value')).toHaveText('$410.00');
  });

  test('custom ("A la medida") 1.00x2.10 → $399 (flagged quirk, not silently corrected)', async ({ page }) => {
    await openJardin(page);

    await page.getByRole('button', { name: 'A la medida', exact: true }).click();
    await page.getByLabel('Ancho exacto de tu espacio').fill('1.00');
    await page.getByRole('button', { name: '2.10 m', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByTestId('step2-price-value')).toHaveText('$399.00');
  });

  test('any non-Blanco color shows the chip at selection time and never hard-blocks checkout', async ({ page }) => {
    await openJardin(page);

    await page.getByLabel('Ancho exacto de tu espacio').fill('1.00');
    const bronceChip = page.getByRole('button', { name: /^Bronce/ });
    await expect(bronceChip.getByText('Cotización personalizada')).toBeVisible();
    await bronceChip.click();

    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByTestId('step2-price-value')).toHaveText('Por WhatsApp');
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  test('any non-Claro glass shows the chip at selection time too', async ({ page }) => {
    await openJardin(page);

    await page.getByLabel('Ancho exacto de tu espacio').fill('1.00');
    const nevadoChip = page.getByRole('button', { name: /^Nevado/ });
    await expect(nevadoChip.getByText('Cotización personalizada')).toBeVisible();
    await nevadoChip.click();

    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  test('happy path reaches the summary with a WhatsApp href, "Pagar ahora" still available', async ({ page }) => {
    await openJardin(page);

    await page.getByLabel('Ancho exacto de tu espacio').fill('1.00');
    await page.getByRole('button', { name: '2.10 m', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
    await page.locator('#municipio').selectOption('Apopa');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    const waLink = page.getByRole('link', { name: 'Enviar por WhatsApp para confirmar' });
    const href = await waLink.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/50376802410\?text=/);
    const decoded = decodeURIComponent(href!.split('?text=')[1]);
    expect(decoded).toContain('Puerta de jardín · 1 hoja — 1.00×2.10 m · Color: Blanco · Vidrio: Claro 5 mm');
    expect(decoded).toContain('Subtotal: $410.00');

    await expect(page.getByRole('button', { name: 'Pagar ahora' })).toBeEnabled();
  });
});
