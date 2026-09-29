import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Forces PUBLIC_COTIZADOR_MODE=mock (playwright.config.ts webServer.env),
// asserts both the success and declined return-screen states. Step6Wompi
// resolves through src/integrations/wompi/mock.ts — never a real Wompi
// call (fixtures.ts also aborts **wompi**/** as a second guard).
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

async function toWompi(page: Page, outcomeParam: 'approved' | 'declined'): Promise<void> {
  await page.goto(`/cotizador?wompiOutcome=${outcomeParam}`);
  await waitForHydration(page);
  await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.locator('#municipio').selectOption('Soyapango');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Pagar ahora' }).click();
  await page.getByRole('radio', { name: /Pagar ahora/ }).click();
  await page.getByRole('button', { name: /Pagar \$\d+\.\d{2} con Wompi/ }).click();
}

test.describe('wompi mock flow (sf-cot-checkout)', () => {
  test('approved → Step7 renders "Pago completado" with the anticipo paid', async ({ page }) => {
    await toWompi(page, 'approved');
    await expect(page.getByRole('heading', { name: 'Pago completado' })).toBeVisible();
  });

  test('declined → Step7 renders "Tu pago no se completó." with retry + WhatsApp CTAs', async ({ page }) => {
    await toWompi(page, 'declined');
    await expect(page.getByRole('heading', { name: 'Tu pago no se completó.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar pago' })).toBeVisible();
  });
});
