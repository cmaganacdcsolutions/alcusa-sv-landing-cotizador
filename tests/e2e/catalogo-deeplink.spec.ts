// R1 tracer: /catalogo -> /cotizador?producto=<slug> (ADR-008 §3/§4).
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function waitForHydration(page: Page): Promise<void> {
  await page.locator('[data-testid="cotizador-root"][data-hydrated="true"]').waitFor();
}

const MEDIDAS = 'Medidas y acabado';

test.describe('catalogo -> cotizador deep link', () => {
  test('/catalogo shows the 3 categories, each linking to its page', async ({ page }) => {
    await page.goto('/catalogo');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const cards = page.getByTestId('catalogo-categories').getByRole('heading', { level: 2 });
    await expect(cards).toHaveText(['Puertas de baño', 'Puertas de jardín', 'Ventanas']);
    await page.getByRole('link', { name: 'Ver Puertas de jardín' }).click();
    await expect(page).toHaveURL(/\/catalogo\/puertas-de-jardin\/?$/);
    await expect(page.getByTestId('catalogo-subcategories').getByRole('heading', { level: 2 })).toHaveCount(5);
  });

  test('detail CTA lands in the cotizador with the product preselected on Medidas', async ({ page }) => {
    await page.goto('/catalogo/puertas-de-bano/templada-10mm');
    const cta = page.getByTestId('catalogo-cta');
    await expect(cta).toHaveText('Cotizar este producto');
    await expect(cta).toHaveAttribute('href', '/cotizador?producto=templada-10mm');
    await cta.click();
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: MEDIDAS })).toBeVisible();
  });

  test('a variant slug applies its preset (garden 3 hojas)', async ({ page }) => {
    await page.goto('/cotizador?producto=jardin-3-hojas');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: MEDIDAS })).toBeVisible();
    await expect(page.getByRole('button', { name: /3 hojas/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('legacy ids keep the old contract (?producto=ventana preselects on step 0)', async ({ page }) => {
    await page.goto('/cotizador?producto=ventana');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ventana/, pressed: true })).toBeVisible();
  });

  test('an invalid slug is ignored: step 0, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/cotizador?producto=no-existe');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('advisorOnly leaf: catalog CTA is a WhatsApp link without price; cotizador never enters the wizard', async ({ page }) => {
    await page.goto('/catalogo/puertas-de-jardin/jardin-2-fijas-2-corredizas');
    const cta = page.getByTestId('catalogo-cta');
    const href = (await cta.getAttribute('href')) ?? '';
    expect(href).toContain('https://wa.me/');
    expect(decodeURIComponent(href)).toContain('2 fijas + 2 corredizas');
    expect(decodeURIComponent(href)).not.toContain('$');
    await expect(page.locator('main')).not.toContainText('Desde $');

    await page.goto('/cotizador?producto=jardin-2-fijas-2-corredizas');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    await expect(page.getByTestId('advisor-notice').getByRole('link')).toHaveAttribute('href', /^https:\/\/wa\.me\//);
  });
});
