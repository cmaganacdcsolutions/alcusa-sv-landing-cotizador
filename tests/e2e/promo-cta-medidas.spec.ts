import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Promos -> cotizador: el CTA "Cotizar esta promo" deja producto + color + vidrio elegidos y cae directo
// en Medidas ("paso 2"), de modo que el cliente solo escribe la medida.
// Contrato del enlace (mismo que las tarjetas del inicio): ?producto=<slug>&paso=medidas&color=<c>&vidrio=<v>.
// Las 3 promos del seed (src/content/promotions.json) son corredizas de baño (`recta`) en aluminio natural.
const PROMOS = [
  { i: 0, id: 'promo-puerta-aquaclara', vidrio: 'claro', glass: /^Claro/, price: '$222.00' },
  { i: 1, id: 'promo-corrediza-nevado', vidrio: 'nevado', glass: /^Nevado/, price: '$290.00' },
  { i: 2, id: 'promo-aquafold', vidrio: 'aquafold', glass: /^Aquafold/, price: '$279.99' },
] as const;

const group = (page: Page, name: string): Locator => page.getByRole('group', { name, exact: true });

test.describe('promos — CTA cae en Medidas con producto y acabados elegidos', () => {
  for (const p of PROMOS) {
    test(`${p.id}: recta + natural + ${p.vidrio}; solo falta la medida`, async ({ page }) => {
      await page.goto('/');
      const cta = page.locator('#promociones [data-promo-cta]').nth(p.i);
      const href = `/cotizador?producto=recta&paso=medidas&color=natural&vidrio=${p.vidrio}`;
      await expect(cta).toHaveAttribute('href', href);
      await cta.click();

      await expect(page).toHaveURL(new RegExp(`${href.replace(/[?]/g, '\\?')}(#.*)?$`));
      await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');

      // Paso 2 (Medidas), sin pasar por el selector de producto.
      await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
      await expect(page.locator('section[aria-labelledby="step1-heading"]').getByText('Puerta de baño recta', { exact: true })).toBeVisible();

      // Color y vidrio de la promo ya elegidos (y solo ellos).
      const color = group(page, 'Color del aluminio').getByRole('button', { pressed: true });
      await expect(color).toHaveCount(1);
      await expect(color).toHaveText(/Natural/);
      const glass = group(page, 'Tipo de vidrio').getByRole('button', { pressed: true });
      await expect(glass).toHaveCount(1);
      await expect(glass).toHaveText(p.glass);

      // El cliente solo escribe la medida y obtiene el precio de la promo.
      await page.getByLabel('Ancho exacto de tu espacio').fill('110');
      await expect(page.getByText('Medida reconocida: 110 cm')).toBeVisible();
      await page.getByRole('button', { name: 'Siguiente' }).click();
      await expect(page.getByTestId('step2-price-value')).toHaveText(p.price);
    });
  }
});
