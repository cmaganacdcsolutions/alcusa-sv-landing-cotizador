import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

async function expectNoSeriousOrCriticalViolations(page: import('@playwright/test').Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(seriousOrCritical).toEqual([]);
}

test.describe('a11y — home, drawer, cotizador (Slice 1)', () => {
  test('home loads with a visible h1 and no serious/critical a11y violations', async ({ page }) => {
    await page.goto('/');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });

  test('drawer open — focus trap target and no serious/critical violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.getByRole('navigation', { name: 'Menú principal' })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });

  test('cotizador step 0 (producto) — no serious/critical violations', async ({ page }) => {
    await page.goto('/#cotizador/0-producto');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });

  test('cotizador step 1 (medidas) — no serious/critical violations', async ({ page }) => {
    await page.goto('/#cotizador/0-producto');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });

  test('cotizador step 4 (resumen) — no serious/critical violations', async ({ page }) => {
    await page.goto('/#cotizador/0-producto');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.locator('#municipio').selectOption('Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expectNoSeriousOrCriticalViolations(page);
  });
});
