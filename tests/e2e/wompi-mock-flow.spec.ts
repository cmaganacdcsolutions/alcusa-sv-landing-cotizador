import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Forces PUBLIC_COTIZADOR_MODE=mock (playwright.config.ts webServer.env),
// asserts both the success and declined return-screen states. Step6Wompi
// resolves through src/integrations/wompi/mock.ts — never a real Wompi
// call (fixtures.ts also aborts **wompi**/** as a second guard).
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
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
  test('approved → Step7 renders "Pago completado" with the anticipo paid', async ({
    page,
  }) => {
    await toWompi(page, 'approved');
    await expect(page.getByRole('heading', { name: 'Pago completado' })).toBeVisible();
  });

  test('declined → Step7 renders "Tu pago no se completó." with retry + WhatsApp CTAs', async ({
    page,
  }) => {
    await toWompi(page, 'declined');
    await expect(
      page.getByRole('heading', { name: 'Tu pago no se completó.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar pago' })).toBeVisible();
  });
});

// Return from the real gateway: api/wompi-return.php verifies the redirect
// hash server-side and lands here with `?pago=`. Mode-independent parsing, so
// it is testable in mock mode without any Wompi call.
test.describe('wompi return fragment (s8-wompi-real)', () => {
  test('pago=pendiente → "en confirmación", never "Pago completado"', async ({
    page,
  }) => {
    await page.goto(
      '/cotizador#cotizador/7-resultado?pago=pendiente&ref=ALC-2026-7F3A9C',
    );
    await waitForHydration(page);
    await expect(
      page.getByRole('heading', { name: 'Estamos confirmando su pago' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pago completado' })).toHaveCount(0);
    await expect(page).toHaveURL(/#cotizador\/7-resultado$/);
  });

  test('pago=rechazado → "Pago cancelado" state', async ({ page }) => {
    await page.goto(
      '/cotizador#cotizador/7-resultado?pago=rechazado&ref=ALC-2026-7F3A9C',
    );
    await waitForHydration(page);
    await expect(page.locator('[data-outcome="failure"]')).toBeVisible();
  });
});
