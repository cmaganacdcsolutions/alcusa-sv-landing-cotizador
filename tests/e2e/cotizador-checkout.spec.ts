import type { Page } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';
import { fillAddress } from '../support/address';

// Visual/behavioral coverage for the sf-cot-checkout slice (Step3-5).
// Never opens a real WhatsApp/Wompi link — fixtures.ts blocks those routes.
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

async function toZonaEntrega(page: Page): Promise<void> {
  await page.goto('/cotizador');
  await waitForHydration(page);
  await pickProduct(page, 'recta');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
}

async function toFormaPago(page: Page): Promise<void> {
  await toZonaEntrega(page);
  await fillAddress(page, 'Soyapango');
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

  test('no address shows the "Total por confirmar" placeholder; Siguiente validates and focuses the first invalid field', async ({
    page,
  }) => {
    await toZonaEntrega(page);
    await expect(page.getByText('Total por confirmar')).toBeVisible();
    await expect(page.getByText('Completa tu dirección para ver el costo de envío y el total.')).toBeVisible();
    await expect(page.getByTestId('zona-total-value')).toHaveCount(0);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.locator('#addr-zona')).toBeFocused();
    await expect(page.locator('#addr-zona-msg')).toHaveText('Elige tu zona de cobertura de la lista.');
    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
  });
});

test.describe('cotizador — Step5 forma de pago', () => {
  test('Wompi is selected by default, shows the amount toggle, the no-AMEX note with a lock icon, and the Wompi footnote', async ({
    page,
  }) => {
    await toFormaPago(page);
    await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();

    // Scoped to the step's own <section> — the "TU COTIZACIÓN" aside repeats
    // the same "Pago con tarjeta vía Wompi..." footnote verbatim (both boards
    // draw it), which is otherwise a strict-mode violation regardless of
    // viewport (the aside copy is only CSS-hidden below 1024px, still
    // present in the DOM — see HANDOFF/sf-cot-polish item 3).
    const formaPagoRegion = page.getByRole('region', { name: 'Forma de pago' });

    const wa = page.getByRole('radio', { name: /Enviar por WhatsApp para confirmar/ });
    const pay = page.getByRole('radio', { name: /Pagar ahora/ });
    await expect(pay).toHaveAttribute('aria-checked', 'true');
    await expect(wa).toHaveAttribute('aria-checked', 'false');

    await expect(page.getByRole('button', { name: 'Anticipo 80%' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pago total 100%' })).toBeVisible();
    await expect(formaPagoRegion.getByText('Aceptamos tarjeta de crédito y débito, excepto American Express.')).toBeVisible();
    await expect(formaPagoRegion.getByText('Pago con tarjeta vía Wompi · excepto American Express')).toBeVisible();
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
    // $258 + $40 transport = $298.00; the Wompi (card) option applies the 10% online discount on the $258 only
    // (behaviour change 2026-10-06): $298.00 - $25.80 = $272.20.
    await expect(page.getByTestId('cotizador-root')).toContainText('Pagar $272.20 con Wompi');
  });
});

// sf-cot-polish item 2 — mobile-only: the sticky .bottom-bar had no scroll
// room reserved for it, so it could sit on top of the last ~100px of any
// step's content. NOTE: a raw "scroll to the end, compare bounding boxes"
// assertion can't reliably reproduce this in Playwright — once you're
// scrolled all the way to `document.body.scrollHeight`, the field-to-bar gap
// is fixed by the step's own internal layout (the reserved padding sits
// *after* the bar in the box, not between the field and the bar), so it
// passes identically with or without the fix. This instead pins the actual
// mechanism: .cotizador__form-col's reserved bottom padding must be at least
// as tall as .bottom-bar itself, everywhere .bottom-bar is used.
test.describe('cotizador — mobile sticky bottom-bar does not cover step content', () => {
  test('at 390px, .cotizador__form-col reserves at least .bottom-bar\'s own height as bottom padding', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'ios390', 'sticky .bottom-bar overlap is a mobile-only concern (<1024px)');

    await toZonaEntrega(page);

    const barHeight = (await page.locator('.bottom-bar').boundingBox())!.height;
    const reservedPadding = await page.locator('.cotizador__form-col').evaluate((el) => {
      return parseFloat(getComputedStyle(el).paddingBottom);
    });
    expect(reservedPadding).toBeGreaterThanOrEqual(barHeight);
  });
});
