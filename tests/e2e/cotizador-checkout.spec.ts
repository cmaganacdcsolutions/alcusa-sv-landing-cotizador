import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Visual/behavioral coverage for the sf-cot-checkout slice (Step3–5;
// Step6/7 aren't reachable through Cotizador.tsx yet — see HANDOFF).
// Never opens a real WhatsApp/Wompi link — fixtures.ts blocks those routes.
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

async function toZonaEntrega(page: Page): Promise<void> {
  await page.goto('/cotizador');
  await waitForHydration(page);
  await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
}

async function toFormaPago(page: Page): Promise<void> {
  await toZonaEntrega(page);
  await page.locator('#municipio').selectOption('Soyapango');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
  await page.getByRole('button', { name: 'Pagar ahora' }).click();
}

test.describe('cotizador — Step3 entrega y zona option states', () => {
  test('"Con instalación" is pressed by default; selecting "Retiro en tienda" flips state + shows the discount note', async ({
    page,
  }) => {
    await toZonaEntrega(page);

    const inst = page.getByRole('button', { name: 'Con instalación' });
    const retiro = page.getByRole('button', { name: /Retiro en tienda/ });
    await expect(inst).toHaveAttribute('aria-pressed', 'true');
    await expect(retiro).toHaveAttribute('aria-pressed', 'false');

    await retiro.click();
    await expect(retiro).toHaveAttribute('aria-pressed', 'true');
    await expect(inst).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Aplicamos 15% de descuento al producto. Sin costo de transporte.')).toBeVisible();

    await inst.click();
    await expect(inst).toHaveAttribute('aria-pressed', 'true');
  });

  test('no municipio selected shows the "Total por confirmar" placeholder and disables Siguiente', async ({
    page,
  }) => {
    await toZonaEntrega(page);
    await expect(page.getByText('Total por confirmar')).toBeVisible();
    await expect(page.locator('#zona-ayuda')).toHaveText('Selecciona la zona de instalación.');
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});

test.describe('cotizador — Step5 forma de pago', () => {
  test('Wompi is selected by default, shows the amount toggle, the no-AMEX note with a lock icon, and the Wompi footnote', async ({
    page,
  }) => {
    await toFormaPago(page);
    await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();

    const wa = page.getByRole('radio', { name: /Enviar por WhatsApp para confirmar/ });
    const pay = page.getByRole('radio', { name: /Pagar ahora/ });
    await expect(pay).toHaveAttribute('aria-checked', 'true');
    await expect(wa).toHaveAttribute('aria-checked', 'false');

    await expect(page.getByRole('button', { name: 'Anticipo 80%' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pago total 100%' })).toBeVisible();
    await expect(page.getByText('Aceptamos tarjeta de crédito y débito, excepto American Express.')).toBeVisible();
    await expect(page.getByText('Pago con tarjeta vía Wompi · excepto American Express')).toBeVisible();
    await expect(page.getByRole('button', { name: /Pagar \$\d+\.\d{2} con Wompi/ })).toBeVisible();
  });

  test('switching to WhatsApp shows the primary WA CTA with the correct wa.me href shape', async ({ page }) => {
    await toFormaPago(page);
    await page.getByRole('radio', { name: /Enviar por WhatsApp para confirmar/ }).click();

    const cta = page.getByRole('link', { name: 'Enviar por WhatsApp' });
    const href = await cta.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/50376802410\?text=/);
  });

  test('picking "Pago total 100%" updates the Wompi CTA amount', async ({ page }) => {
    await toFormaPago(page);
    await page.getByRole('button', { name: 'Pago total 100%' }).click();
    await expect(page.getByRole('button', { name: 'Pago total 100%' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cotizador-root')).toContainText('Pagar $262.00 con Wompi');
  });
});
