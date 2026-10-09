import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Promos -> cotizador: el CTA "Cotizar esta promo" deja producto + color + vidrio elegidos y cae directo
// en Medidas ("paso 2"), de modo que el cliente solo escribe la medida.
// Contrato del enlace (mismo que las tarjetas del inicio): ?producto=<slug>&paso=medidas&color=<c>&vidrio=<v>.
// Las 3 promos del seed (src/content/promotions.json) son corredizas de baño (`recta`) en aluminio natural.
const PROMOS = [
  { i: 0, id: 'promo-puerta-aquaclara', vidrio: 'claro', glass: /Claro/, price: '$222.00' },
  { i: 1, id: 'promo-corrediza-nevado', vidrio: 'nevado', glass: /Nevado/, price: '$260.00' },
  { i: 2, id: 'promo-aquafold', vidrio: 'aquafold', glass: /Aquafold/, price: '$279.99' },
] as const;

const group = (page: Page, name: string): Locator => page.getByRole('group', { name, exact: true });

test.describe('promos — CTA cae en Medidas con producto y acabados elegidos', () => {
  for (const p of PROMOS) {
    test(`${p.id}: recta + natural + ${p.vidrio}; solo falta la medida`, async ({ page }) => {
      await page.goto('/');
      const cta = page.locator('#promociones [data-promo-cta]').nth(p.i);
      const href = `/cotizador?producto=recta&paso=medidas&color=natural&vidrio=${p.vidrio}&promo=${p.id}`;
      await expect(cta).toHaveAttribute('href', href);
      await cta.click();

      await expect(page).toHaveURL(new RegExp(`${href.replace(/[?]/g, '\\?')}(#.*)?$`));
      await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');

      // Paso 2 (Medidas), sin pasar por el selector de producto.
      await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
      await expect(page.locator('section[aria-labelledby="step1-heading"]').getByText('Puerta de baño recta', { exact: true })).toBeVisible();

      // Contexto promo (?promo=<id>): color, vidrio y alto bloqueados a los de la promo (sin selectores).
      await expect(page.getByTestId('promo-banner')).toBeVisible();
      const locked = page.getByTestId('promo-locked');
      await expect(locked).toContainText('Natural');
      await expect(locked).toContainText(p.glass);
      await expect(group(page, 'Color del aluminio')).toHaveCount(0);

      // El cliente solo escribe la medida y obtiene el precio de la promo.
      await page.getByLabel('Ancho exacto de tu espacio').fill('110');
      await expect(page.getByText('Medida reconocida: 110 cm')).toBeVisible();
      await page.getByRole('button', { name: 'Siguiente' }).click();
      await expect(page.getByTestId('step2-price-value')).toHaveText(p.price);
    });
  }
});
