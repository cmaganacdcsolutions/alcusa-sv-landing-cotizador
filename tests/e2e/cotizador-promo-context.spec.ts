import type { Page } from '@playwright/test';
import { fillAddress } from '../support/address';
import { expect, test } from './fixtures';

// 2026-10-08 (decision del usuario): una cotizacion vive en UN contexto definido por la URL de entrada.
// `?promo=<id>` -> SOLO el reglaje de esa promo (config bloqueada, ancho en rango, precio de la promo + envio
// de zona, SIN 10% con tarjeta, sin retiro en tienda). Sin `?promo` -> precios normales (Aquafold -> asesor).
// Si llegan `?promo` y `?oferta` gana la promo.
const PROMOS = [
  { id: 'promo-puerta-aquaclara', glass: 'claro', label: 'Claro 5 mm', price: '$222.00', total: '$262.00', min: 100 },
  { id: 'promo-corrediza-nevado', glass: 'nevado', label: 'Nevado 5 mm', price: '$260.00', total: '$300.00', min: 90 },
  { id: 'promo-aquafold', glass: 'aquafold', label: 'Aquafold', price: '$279.99', total: '$319.99', min: 100 },
] as const;
const link = (id: string, glass: string, extra = ''): string =>
  `/cotizador?producto=recta&paso=medidas&color=natural&vidrio=${glass}&promo=${id}${extra}`;

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}
const siguiente = (page: Page) => page.getByRole('button', { name: 'Siguiente' });

test.describe('cotizador - contexto promo (?promo=<id>)', () => {
  for (const p of PROMOS) {
    test(`${p.id}: config bloqueada, ${p.price} + envio de zona ${p.total}, sin 10% ni retiro`, async ({ page }) => {
      await open(page, link(p.id, p.glass));
      await expect(page.getByTestId('promo-banner')).toBeVisible();
      const locked = page.getByTestId('promo-locked');
      await expect(locked).toContainText('Natural');
      await expect(locked).toContainText(p.label);
      await expect(locked).toContainText('1.85 m');
      // Config bloqueada: no hay selectores de color/vidrio.
      await expect(page.getByRole('group', { name: 'Color del aluminio', exact: true })).toHaveCount(0);

      await page.locator('#ancho').fill(String(p.min));
      await siguiente(page).click();
      await expect(page.getByTestId('step2-price-value')).toHaveText(p.price);
      await siguiente(page).click();
      // Sin retiro en tienda: solo instalacion.
      await expect(page.getByRole('button', { name: /Retiro en tienda/ })).toHaveCount(0);
      await expect(page.getByTestId('promo-install-note')).toContainText('incluye instalación');
      await fillAddress(page, 'Soyapango');
      await expect(page.getByTestId('zona-total-value')).toHaveText(p.total);
      await siguiente(page).click();
      // Resumen: sin "agregar otro producto" y sin linea de 10%.
      await expect(page.getByRole('button', { name: /Agregar otro producto/ })).toHaveCount(0);
      await expect(page.getByText('Descuento pago con tarjeta en línea (10%)')).toHaveCount(0);
    });
  }

  test('nevado valida el rango 0.90-1.20 m: 90 y 120 ok; 89 y 121 fuera con copy de la promo', async ({ page }) => {
    await open(page, link('promo-corrediza-nevado', 'nevado'));
    for (const ok of ['90', '120']) {
      await page.locator('#ancho').fill(ok);
      await expect(page.getByText('Cotización personalizada por WhatsApp')).toHaveCount(0);
      await expect(siguiente(page)).toBeEnabled();
    }
    for (const bad of ['89', '121']) {
      await page.locator('#ancho').fill(bad);
      await expect(page.getByText('Cotización personalizada por WhatsApp')).toBeVisible();
      await expect(page.getByText('Esta promoción aplica de 0.90 a 1.20 m de pared a pared').first()).toBeVisible();
      await expect(siguiente(page)).toBeDisabled();
    }
  });

  test('aquaclara: 99 cm queda fuera (rango 1.00-1.20 m)', async ({ page }) => {
    await open(page, link('promo-puerta-aquaclara', 'claro'));
    await page.locator('#ancho').fill('99');
    await expect(page.getByText('Esta promoción aplica de 1.00 a 1.20 m de pared a pared').first()).toBeVisible();
    await expect(siguiente(page)).toBeDisabled();
  });

  test('"Cotizar otro modelo sin promoción" sale del contexto: sin banner y sin param', async ({ page }) => {
    await open(page, link('promo-corrediza-nevado', 'nevado'));
    await page.getByTestId('promo-exit').click();
    await expect(page.getByTestId('promo-banner')).toHaveCount(0);
    await expect(page).not.toHaveURL(/promo=/);
    await expect(page.getByRole('group', { name: 'Categoría' })).toBeVisible();
  });

  test('re-entrada sin param es contexto normal: nevado a precio regular, Aquafold a asesor', async ({ page }) => {
    await open(page, '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=nevado');
    await expect(page.getByTestId('promo-banner')).toHaveCount(0);
    await page.locator('#ancho').fill('110');
    await siguiente(page).click();
    await expect(page.getByTestId('step2-price-value')).not.toHaveText('$260.00');

    await open(page, '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=aquafold');
    await expect(page.getByTestId('promo-banner')).toHaveCount(0);
    await expect(page.getByText(/Aquafold se cotiza con un asesor/)).toBeVisible();
    await expect(siguiente(page)).toBeDisabled();
  });

  test('promo inexistente se ignora y se quita de la URL', async ({ page }) => {
    await open(page, link('promo-que-no-existe', 'claro'));
    await expect(page.getByTestId('promo-banner')).toHaveCount(0);
    await expect(page).not.toHaveURL(/promo=/);
  });

  test('?promo + ?oferta=online10: gana la promo (sin banner de oferta ni 10%)', async ({ page }) => {
    await open(page, link('promo-puerta-aquaclara', 'claro', '&oferta=online10'));
    await expect(page.getByTestId('promo-banner')).toBeVisible();
    await expect(page.getByText('Verás un 10% de descuento reflejado a la hora de realizar tu pago')).toHaveCount(0);
    await page.locator('#ancho').fill('110');
    await siguiente(page).click();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$222.00');
  });
});
