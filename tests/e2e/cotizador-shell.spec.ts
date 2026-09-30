import type { Page } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';

// Slice sf-cot-shell — desktop-0[3-7]-*.dc.html rail/aside 1:1 parity.
// Desktop-only markup (`.rail-desktop` / `.cotizador-aside`); every
// assertion here is scoped to those containers so it never collides with
// the per-step "Siguiente"/"Enviar por WhatsApp para confirmar"/"Pagar
// ahora" controls other slices already own and test unscoped (see HANDOFF).
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

test.describe('cotizador shell — desktop rail + aside (sf-cot-shell)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1920', 'rail-desktop/.cotizador-aside are desktop-only (>=1024px)');
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'recta');
  });

  test('desktop rail: kicker, "Paso N de 8" + progress bar, all 8 steps, and the "¿Dudas con tu medida?" WhatsApp block', async ({
    page,
  }) => {
    const rail = page.locator('.rail-desktop');
    await expect(rail.getByText('COTIZADOR EN LÍNEA')).toBeVisible();
    await expect(rail.getByText(/^Paso \d de 8$/)).toBeVisible();
    await expect(rail.locator('.rail-desktop__item')).toHaveCount(8);
    await expect(rail.getByText('Pago (Wompi)')).toBeVisible();
    await expect(rail.getByText('Resultado')).toBeVisible();

    await expect(rail.getByText('¿Dudas con tu medida?')).toBeVisible();
    const dudasLink = rail.getByRole('link', { name: 'Escríbenos por WhatsApp' });
    const href = await dudasLink.getAttribute('href');
    expect(href).toBe('https://wa.me/50376802410');
  });

  test('no white-card wrapper around the desktop "Siguiente" nav row', async ({ page }) => {
    const bottomBar = page.locator('.cotizador__form-col .bottom-bar');
    await expect(bottomBar).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(bottomBar).toHaveCSS('box-shadow', 'none');
  });

  test('aside: kicker, item summary (current product), WhatsApp + Wompi CTAs with the AMEX note and the lock icon', async ({
    page,
  }) => {
    const aside = page.locator('.cotizador-aside');
    await expect(aside.getByText('TU COTIZACIÓN')).toBeVisible();
    await expect(aside.getByText('1 producto')).toBeVisible();
    await expect(aside.getByText('Puerta de baño recta')).toBeVisible();
    await expect(aside.getByText('1.10 × 1.85 m · Natural · Claro 5 mm')).toBeVisible();

    const waLink = aside.getByRole('link', { name: 'Cotizar por WhatsApp' });
    await expect(waLink).toBeVisible();
    await expect(waLink).toHaveAttribute('href', /^https:\/\/wa\.me\/50376802410\?text=/);

    await expect(aside.getByText('Pago con tarjeta vía Wompi · excepto American Express')).toBeVisible();
    await expect(aside.locator('.cotizador-aside__wompi-note svg')).toBeVisible();
  });
});
