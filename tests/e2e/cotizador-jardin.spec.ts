import type { Page } from '@playwright/test';
import { expect, pickProduct, test, textOnlyWaLink } from './fixtures';
import { fillAddress } from '../support/address';

test.use({ blockQuotePdf: true });

// android412 flake fix: Cotizador is `client:load`, hydrating asynchronously.
// Same wait pattern as tests/e2e/cotizador.spec.ts (S5).
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

// "Puerta de jardín" (T6.2). 2026-10-16: SOLO con asesor — la configuración se recoge pero nunca hay precio en línea.
// Never opens a real WhatsApp link — fixtures.ts blocks those routes.
test.describe('cotizador — jardín, solo con asesor', () => {
  async function openJardin(page: Page) {
    await page.goto('/cotizador#cotizador/0-producto');
    await waitForHydration(page);
    await pickProduct(page, 'jardin');
  }

  test('1 hoja 1.00x2.10: sin precio en línea (antes $410), aviso de asesor y se puede continuar', async ({ page }) => {
    await openJardin(page);

    await page.getByLabel('Ancho exacto de tu espacio').fill('1.00');
    await page.getByRole('button', { name: '2.10 m', exact: true }).click();
    await expect(page.getByText('se cotizan con un asesor para definir la modalidad').first()).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByTestId('step2-price-value')).toHaveText('Por WhatsApp');
  });

  test('otros colores y vidrios tampoco muestran precio ni bloquean "Siguiente"', async ({ page }) => {
    await openJardin(page);

    await page.getByLabel('Ancho exacto de tu espacio').fill('1.00');
    await page.getByRole('button', { name: '2.10 m', exact: true }).click();
    await page.getByRole('button', { name: 'Negro' }).click();
    await page.getByRole('button', { name: /^Nevado/ }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByTestId('step2-price-value')).toHaveText('Por WhatsApp');
  });

  test('happy path: el Resumen no suma el jardín, el total no existe y el mensaje de WhatsApp lo marca por cotizar', async ({ page }) => {
    await openJardin(page);

    await page.getByLabel('Ancho exacto de tu espacio').fill('1.00');
    await page.getByRole('button', { name: '2.10 m', exact: true }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
    await fillAddress(page, 'Apopa');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.getByTestId('resumen-total-value')).toHaveText('Por WhatsApp');
    const waLink = await textOnlyWaLink(page);
    const href = await waLink.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/50376802410\?text=/);
    const decoded = decodeURIComponent(href!.split('?text=')[1]);
    expect(decoded).toContain('Puerta de jardín · 1 hoja — 1.00×2.10 m · Color: Blanco · Vidrio: Claro 5 mm');
    expect(decoded).toContain('Subtotal: por cotizar con un asesor');
    expect(decoded).not.toMatch(/Total estimado|Anticipo/);

    await expect(page.getByTestId('quote-share-button').locator('visible=true').first()).toBeEnabled();
  });
});
