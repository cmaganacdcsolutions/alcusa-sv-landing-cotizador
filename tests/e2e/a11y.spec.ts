import AxeBuilder from '@axe-core/playwright';
import { expect, pickProduct, test } from './fixtures';
import { fillAddress } from '../support/address';

async function expectNoSeriousOrCriticalViolations(page: import('@playwright/test').Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(seriousOrCritical).toEqual([]);
}

test.describe('a11y — home, navbar, cotizador (Slice 1)', () => {
  test('home loads with a visible h1 and no serious/critical a11y violations', async ({ page }) => {
    await page.goto('/');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });

  test('navbar (menú de catálogo abierto en escritorio) — sin violaciones serious/critical', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    // El submenú del catálogo (chevron) solo existe en >= 1024; en móvil la barra de enlaces es la propia navegación.
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const chev = page.getByRole('button', { name: 'Abrir categorías del catálogo' });
      await expect(async () => {
        await chev.click();
        await expect(chev).toHaveAttribute('aria-expanded', 'true', { timeout: 1500 });
      }).toPass();
    }
    await expectNoSeriousOrCriticalViolations(page);
  });

  test('cotizador step 0 (producto) — no serious/critical violations', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });

  test('cotizador step 1 (medidas) — no serious/critical violations', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'recta');
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });

  test('cotizador step 4 (resumen) — no serious/critical violations', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });
});
