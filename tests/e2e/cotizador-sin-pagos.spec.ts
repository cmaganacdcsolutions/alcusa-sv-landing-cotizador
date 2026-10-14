import { expect, pickProduct, test } from './fixtures';
import { fillAddress } from '../support/address';

// Recorte de alcance 2026-10-13: no hay pagos en la web. El cotizador termina en el Resumen (CTA PDF + asesor por
// WhatsApp), 80/20 solo como condiciones y sin 10% en linea ni "Otra zona". Estas regresiones afirman sobre el TEXTO
// VISIBLE de la pagina completa (innerText: sin CSS/JSON/atributos) para que no se cuele nada del flujo eliminado.
const FORBIDDEN = [/Wompi/i, /10\s?%/, /pago en l[ií]nea/i, /\bPagar\b/, /Forma de pago/i, /Otra zona/i];

async function visibleText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

async function expectNoPaymentCopy(page: import('@playwright/test').Page, where: string): Promise<void> {
  const text = await visibleText(page);
  for (const re of FORBIDDEN) expect(text, `${where}: texto visible con ${re}`).not.toMatch(re);
}

test.describe('sin pagos en la web', () => {
  test('/ no menciona pagos, 10% ni Wompi en el texto visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.pcard').first()).toBeVisible();
    await expectNoPaymentCopy(page, '/');
  });

  test('/cotizador no menciona pagos en ningun paso (producto -> resumen)', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expectNoPaymentCopy(page, '/cotizador paso 0');
    await pickProduct(page, 'recta');
    await expectNoPaymentCopy(page, '/cotizador medidas');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expectNoPaymentCopy(page, '/cotizador precio');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
    await expectNoPaymentCopy(page, '/cotizador entrega');
    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    // el Resumen es un chunk lazy: esperar sus CTAs antes de leer el texto
    await expect(page.getByTestId('quote-share-button').locator('visible=true').first()).toBeVisible();
    await expectNoPaymentCopy(page, '/cotizador resumen');
  });

  test('Resumen: 80/20 como condiciones, CTA PDF + asesor, ultimo paso (sin Siguiente)', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.getByTestId('quote-share-button').locator('visible=true').first()).toBeVisible();
    const text = await visibleText(page);
    expect(text).toMatch(/Anticipo \(?80%\)?/);
    expect(text).toMatch(/Saldo \(?20%/);
    await expect(page.getByTestId('quote-share-button').locator('visible=true').first()).toHaveText('Obtener cotización en PDF');
    await expect(page.getByTestId('resumen-whatsapp-advisor').locator('visible=true').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toHaveCount(0);
  });

  test('Retiro en tienda aplica -15% y llega al Resumen sin direccion', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Retiro en tienda −15%' }).click();
    await expect(page.getByText('Aplicamos 15% de descuento al producto. Sin costo de transporte.')).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.locator('.summary-card').getByText('Retiro en tienda')).toBeVisible();
  });

  test('?oferta=online10 se ignora: sin banner, sin descuento, sin error y se limpia de la URL', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/cotizador?oferta=online10');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has('oferta')).toBe(false);
    await expectNoPaymentCopy(page, '?oferta=online10');
    expect(errors).toEqual([]);
  });
});
