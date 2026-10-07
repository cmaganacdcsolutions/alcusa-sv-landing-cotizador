import type { Page } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';
import { fillAddress } from '../support/address';

// 2026-10-06 (user decisions): (A) 10% discount ONLY when paying by card online (Wompi), over the products
// (never the shipping); steps 0-4 keep the golden totals. (B) A distrito without an automatic rate shows
// "Envío por confirmar" and NEVER blocks the flow (it reaches Wompi). Wompi runs in mock mode here
// (playwright.config.ts) and fixtures.ts aborts any real wompi/wa.me route.
//
// recta default config: products $222.00, Soyapango transport $40.00 -> $262.00 without discount.
// Card: 10% of $222.00 = $22.20 -> $239.80; 80% deposit = $191.84. Santa Ana has no rate (pending).
// Offer link (navbar "Compra YA!", `/cotizador?oferta=online10`): the same 10% is APPLIED from the first
// screen (banner, Precio, Zona, Resumen, Step5, mock Wompi), also after a reload; without the param Precio ->
// Resumen only PREVIEWS the card price ("Pagando con tarjeta en línea: $X (−10%)") and totals stay golden.
// Retiro stacks: 222 x 0.85 = $188.70 -> -$18.87 -> $169.83, 80% deposit $135.86.
const OFFER_LABEL = 'Descuento pago con tarjeta en línea (10%)';
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

async function toPrecio(page: Page, url = '/cotizador'): Promise<void> {
  await page.goto(url);
  await waitForHydration(page);
  await pickProduct(page, 'recta');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
}

async function toZonaEntrega(page: Page, url = '/cotizador'): Promise<void> {
  await toPrecio(page, url);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
}

async function toResumen(page: Page, distrito: string, url = '/cotizador'): Promise<void> {
  await toZonaEntrega(page, url);
  await fillAddress(page, distrito);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
}

test.describe('cotizador — 10% descuento pagando con tarjeta en línea', () => {
  test('without the offer: steps 2-4 show the card price as a PREVIEW, not applied; Step5 with card shows the discount line, reduced total and deposit', async ({ page }) => {
    await toPrecio(page);
    // Step2: golden estimate, informative banner, preview of the card price (no shipping yet), nothing applied.
    await expect(page.getByTestId('step2-price-value')).toHaveText('$222.00');
    await expect(page.getByTestId('step2-discount-row')).toHaveCount(0);
    await expect(page.getByTestId('online-discount-preview')).toHaveText('Pagando con tarjeta en línea: $199.80 (−10%)');
    await expect(page.getByTestId('online-discount-banner')).toHaveAttribute('data-state', 'info');
    await expect(page.getByTestId('summary-price-value')).toHaveText('$222.00');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
    await fillAddress(page, 'Soyapango');
    // Step3: golden total, no discount row, preview with the shipping included.
    await expect(page.getByTestId('zona-total-value')).toHaveText('$262.00');
    await expect(page.getByTestId('zona-discount-row')).toHaveCount(0);
    await expect(page.getByTestId('online-discount-preview')).toHaveText('Pagando con tarjeta en línea: $239.80 (−10%)');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Step4 Resumen: still $262.00 (the card was not chosen yet), no discount row, preview + WhatsApp note absent.
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$262.00');
    await expect(page.getByTestId('resumen-discount-row')).toHaveCount(0);
    await expect(page.getByTestId('resumen-whatsapp-note')).toHaveCount(0);
    await expect(page.getByTestId('online-discount-preview')).toHaveText('Pagando con tarjeta en línea: $239.80 (−10%)');
    await page.getByRole('button', { name: 'Pagar ahora' }).click();

    // Step5: card is the default option -> discount line + reduced total + hint.
    await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();
    await expect(page.getByTestId('pay-discount-hint')).toHaveText('10% de descuento pagando con tarjeta aquí');
    await expect(page.getByTestId('formapago-discount-value')).toHaveText('−$22.20');
    await expect(page.getByTestId('formapago-total-value')).toHaveText('$239.80');
    await expect(page.getByTestId('summary-price-value')).toHaveText('$239.80');
    await expect(page.getByRole('button', { name: /Pagar \$191\.84 con Wompi/ })).toBeVisible();

    // WhatsApp path: no discount, plain $262.00 message.
    await page.getByRole('radio', { name: /Enviar por WhatsApp para confirmar/ }).click();
    await expect(page.getByTestId('formapago-discount')).toHaveCount(0);
    await expect(page.getByTestId('formapago-total-value')).toHaveText('$262.00');
    await expect(page.getByTestId('summary-price-value')).toHaveText('$262.00');
    await expect(page.locator('.wa-preview__body')).toContainText('Total estimado: $262.00');

    // Back to card: discount returns.
    await page.getByRole('radio', { name: /Pagar ahora/ }).click();
    await expect(page.getByTestId('formapago-total-value')).toHaveText('$239.80');
  });

  test('Resumen shows the discount only after card was chosen in Step5', async ({ page }) => {
    await toResumen(page, 'Soyapango');
    await page.getByRole('button', { name: 'Pagar ahora' }).click();
    await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();
    await page.locator('.cotizador__back').click();
    await expect(page.getByTestId('resumen-discount-value')).toHaveText('−$22.20');
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$239.80');
  });

  test('card path: the amount charged now matches Step5 and Step7 (mock Wompi), with the discount line', async ({ page }) => {
    await toResumen(page, 'Soyapango');
    await page.getByRole('button', { name: 'Pagar ahora' }).click();
    await page.getByRole('radio', { name: /Pagar ahora/ }).click();
    const cta = page.getByRole('button', { name: /Pagar \$\d+\.\d{2} con Wompi/ });
    await expect(cta).toContainText('$191.84');
    await cta.click();
    await expect(page.getByRole('heading', { name: 'Pago completado' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Recibimos tu anticipo de $191.84.')).toBeVisible();
    await expect(page.getByTestId('resultado-discount-row')).toContainText('−$22.20');
  });

  test('retiro en tienda stacks: 10% over the already -15% products, no shipping', async ({ page }) => {
    await toZonaEntrega(page);
    await page.getByRole('button', { name: /Retiro en tienda/ }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    const retiroTotal = Number((await page.getByTestId('resumen-total-value').innerText()).replace('$', ''));
    await page.getByRole('button', { name: 'Pagar ahora' }).click();
    const discountText = await page.getByTestId('formapago-discount-value').innerText();
    const discount = Number(discountText.replace('−$', ''));
    expect(discount).toBeCloseTo(Math.round(retiroTotal * 10) / 100, 2);
    await expect(page.getByTestId('formapago-total-value')).toHaveText(`$${(retiroTotal - discount).toFixed(2)}`);
  });
});

test.describe('cotizador — distrito sin tarifa: "Envío por confirmar" no bloquea', () => {
  test('Step3 informs, keeps Siguiente enabled and the products total drives the bar', async ({ page }) => {
    await toZonaEntrega(page);
    await fillAddress(page, 'Santa Ana');
    await expect(page.getByTestId('zona-envio-pendiente')).toBeVisible();
    await expect(page.getByText('Envío: por confirmar (te lo confirmamos por WhatsApp)')).toBeVisible();
    await expect(page.getByTestId('zona-total-value')).toHaveText('$222.00');
    // The sticky bottom bar is mobile-only (hidden >=1024px, where the aside carries the same total).
    await expect(page.getByText('+ envío por confirmar')).toBeAttached();
    await expect(page.getByTestId('summary-price-value')).toHaveText('$222.00');
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  test('goes all the way to the Wompi mock with "Envío por confirmar", discount only over products', async ({ page }) => {
    await toResumen(page, 'Santa Ana');
    // Resumen: products only, shipping pending, no discount yet.
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$222.00');
    await expect(page.getByText('Por confirmar').first()).toBeVisible();
    await page.getByRole('button', { name: 'Pagar ahora' }).click();

    // Step5: card default -> 10% of $222.00, total $199.80, deposit $159.84; shipping note visible.
    await expect(page.getByTestId('formapago-envio-pendiente')).toBeVisible();
    await expect(page.getByTestId('formapago-discount-value')).toHaveText('−$22.20');
    await expect(page.getByTestId('formapago-total-value')).toHaveText('$199.80');
    const cta = page.getByRole('button', { name: /Pagar \$\d+\.\d{2} con Wompi/ });
    await expect(cta).toContainText('$159.84');
    await cta.click();

    await expect(page.getByRole('heading', { name: 'Pago completado' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Recibimos tu anticipo de $159.84.')).toBeVisible();
    await expect(page.getByTestId('resultado-envio-pendiente')).toContainText('Por confirmar');
  });

  test('WhatsApp message says "Envío por confirmar" instead of a $0.00 transport', async ({ page }) => {
    await toResumen(page, 'Santa Ana');
    await page.getByRole('button', { name: 'Pagar ahora' }).click();
    await page.getByRole('radio', { name: /Enviar por WhatsApp para confirmar/ }).click();
    const body = page.locator('.wa-preview__body');
    await expect(body).toContainText('Transporte: Envío por confirmar');
    await expect(body).toContainText('Total estimado: $222.00 (más envío por confirmar)');
    await expect(body).not.toContainText('Transporte: $0.00');
  });
});

// Navbar "Compra YA! 10% de descuento" -> /cotizador?oferta=online10: the discount is already APPLIED.
const OFFER = '/cotizador?oferta=online10';
const PROMO_AND_OFFER = '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=claro&oferta=online10';

test.describe('cotizador — oferta del navbar (?oferta=online10): el 10% llega ya aplicado', () => {
  test('clicking the navbar deal link lands on the cotizador with the applied banner', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[data-nav-deal]').click();
    await page.waitForURL(/\/cotizador/);
    await waitForHydration(page);
    const banner = page.getByTestId('online-discount-banner');
    await expect(banner).toHaveAttribute('data-state', 'applied');
    await expect(banner).toContainText('¡10% de descuento aplicado!');
  });

  test('without the param (or with another value) the banner only informs', async ({ page }) => {
    for (const url of ['/cotizador', '/cotizador?oferta=otra']) {
      await page.goto(url);
      await waitForHydration(page);
      const banner = page.getByTestId('online-discount-banner');
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute('data-state', 'info');
      await expect(banner).toContainText('10% de descuento pagando con tarjeta en línea');
      await expect(banner).not.toContainText('aplicado');
    }
  });

  test('Step2 Precio: $222.00 estimate, discount row −$22.20, card total $199.80 (aside and bar agree), no preview', async ({ page }) => {
    await toPrecio(page, OFFER);
    await expect(page.getByTestId('online-discount-banner')).toHaveAttribute('data-state', 'applied');
    await expect(page.getByTestId('step2-price-value')).toHaveText('$222.00');
    await expect(page.getByTestId('step2-discount-row')).toContainText(OFFER_LABEL);
    await expect(page.getByTestId('step2-discount-value')).toHaveText('−$22.20');
    await expect(page.getByTestId('step2-card-total')).toHaveText('$199.80');
    await expect(page.getByTestId('online-discount-preview')).toHaveCount(0);
    await expect(page.getByTestId('summary-price-value')).toHaveText('$199.80');
    await expect(page.locator('.bottom-bar__price-value')).toHaveText('$199.80');
  });

  test('Step3 Zona: Soyapango $239.80 (discount only over products), Santa Ana $199.80 (shipping pending)', async ({ page }) => {
    await toZonaEntrega(page, OFFER);
    await fillAddress(page, 'Soyapango');
    await expect(page.getByTestId('zona-discount-row')).toContainText(OFFER_LABEL);
    await expect(page.getByTestId('zona-discount-value')).toHaveText('−$22.20');
    await expect(page.getByTestId('zona-total-value')).toHaveText('$239.80');
    await expect(page.getByTestId('summary-price-value')).toHaveText('$239.80');
    await expect(page.getByTestId('online-discount-preview')).toHaveCount(0);

    await fillAddress(page, 'Santa Ana');
    await expect(page.getByTestId('zona-envio-pendiente')).toBeVisible();
    await expect(page.getByTestId('zona-discount-value')).toHaveText('−$22.20');
    await expect(page.getByTestId('zona-total-value')).toHaveText('$199.80');
    await expect(page.getByTestId('summary-price-value')).toHaveText('$199.80');
  });

  test('Resumen and Step5 apply it; choosing WhatsApp drops it with a note, going back to card restores it', async ({ page }) => {
    await toResumen(page, 'Soyapango', OFFER);
    // Resumen: applied, no preview; the WhatsApp note quotes the undiscounted total.
    await expect(page.getByTestId('resumen-discount-row')).toContainText(OFFER_LABEL);
    await expect(page.getByTestId('resumen-discount-value')).toHaveText('−$22.20');
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$239.80');
    await expect(page.getByTestId('online-discount-preview')).toHaveCount(0);
    await expect(page.getByTestId('resumen-whatsapp-note')).toContainText('$262.00');
    await expect(page.getByTestId('resumen-whatsapp-note')).toContainText('solo pagando con tarjeta en línea');
    await page.getByRole('button', { name: 'Pagar ahora' }).click();

    // Step5: card is already the chosen method.
    await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();
    await expect(page.getByTestId('formapago-discount')).toContainText(OFFER_LABEL);
    await expect(page.getByTestId('formapago-discount-value')).toHaveText('−$22.20');
    await expect(page.getByTestId('formapago-total-value')).toHaveText('$239.80');
    await expect(page.getByTestId('summary-price-value')).toHaveText('$239.80');
    await expect(page.getByTestId('formapago-offer-wa-note')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Pagar \$191\.84 con Wompi/ })).toBeVisible();

    // WhatsApp: no discount, plain $262.00 and the note that the 10% is card-only.
    await page.getByRole('radio', { name: /Enviar por WhatsApp para confirmar/ }).click();
    await expect(page.getByTestId('formapago-offer-wa-note')).toContainText('El 10% solo aplica pagando con tarjeta en línea');
    await expect(page.getByTestId('formapago-offer-wa-note')).toContainText('$262.00');
    await expect(page.getByTestId('formapago-discount')).toHaveCount(0);
    await expect(page.getByTestId('formapago-total-value')).toHaveText('$262.00');
    await expect(page.getByTestId('summary-price-value')).toHaveText('$262.00');
    await expect(page.getByTestId('online-discount-banner')).toHaveAttribute('data-state', 'info');

    // Back on Resumen the discount is gone but the card price is offered as a preview.
    await page.locator('.cotizador__back').click();
    await expect(page.getByTestId('resumen-discount-row')).toHaveCount(0);
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$262.00');
    await expect(page.getByTestId('online-discount-preview')).toHaveText('Pagando con tarjeta en línea: $239.80 (−10%)');
    await page.getByRole('button', { name: 'Pagar ahora' }).click();
    await page.getByRole('radio', { name: /Pagar ahora/ }).click();
    await expect(page.getByTestId('formapago-total-value')).toHaveText('$239.80');
    await expect(page.getByTestId('online-discount-banner')).toHaveAttribute('data-state', 'applied');
  });

  test('mock Wompi charges the discounted 80% deposit: $191.84, with the discount line on the result', async ({ page }) => {
    await toResumen(page, 'Soyapango', OFFER);
    await page.getByRole('button', { name: 'Pagar ahora' }).click();
    const cta = page.getByRole('button', { name: /Pagar \$\d+\.\d{2} con Wompi/ });
    await expect(cta).toContainText('$191.84');
    await cta.click();
    await expect(page.getByRole('heading', { name: 'Pago completado' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Recibimos tu anticipo de $191.84.')).toBeVisible();
    await expect(page.getByTestId('resultado-discount-row')).toContainText('−$22.20');
    await expect(page.getByTestId('resultado-discount-row')).toContainText(OFFER_LABEL);
  });

  test('retiro stacks on the offer: $188.70 -> −$18.87 -> $169.83, deposit $135.86', async ({ page }) => {
    await toZonaEntrega(page, OFFER);
    await page.getByRole('button', { name: /Retiro en tienda/ }).click();
    await expect(page.getByTestId('zona-discount-value')).toHaveText('−$18.87');
    await expect(page.getByTestId('zona-total-value')).toHaveText('$169.83');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$169.83');
    await page.getByRole('button', { name: 'Pagar ahora' }).click();
    await expect(page.getByRole('button', { name: /Pagar \$135\.86 con Wompi/ })).toBeVisible();
  });

  test('promo link + offer lands on Medidas with the offer active and reaches Precio discounted', async ({ page }) => {
    await page.goto(PROMO_AND_OFFER);
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await expect(page.getByTestId('online-discount-banner')).toHaveAttribute('data-state', 'applied');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await expect(page.getByTestId('step2-discount-value')).toHaveText('−$22.20');
    await expect(page.getByTestId('step2-card-total')).toHaveText('$199.80');
  });

  test('a reload keeps the offer applied (the URL still carries it) on top of the restored wizard', async ({ page }) => {
    await toPrecio(page, OFFER);
    await expect(page.getByTestId('step2-discount-value')).toHaveText('−$22.20');
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await expect(page.getByTestId('online-discount-banner')).toHaveAttribute('data-state', 'applied');
    await expect(page.getByTestId('step2-discount-value')).toHaveText('−$22.20');
    await expect(page.getByTestId('step2-card-total')).toHaveText('$199.80');
  });
});
