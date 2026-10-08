import { FAMILIES } from '../support/combos';
import { chooseLeaf, onlyVisualProjects, openCotizador, settleForScreenshot } from '../support/visual';
import { expect, pickProduct, test } from './fixtures';
import { fillAddress } from '../support/address';

// Visual baselines of the cotizador: step 0, step 1 per product family, step 2, summary.
// Intentional UI change -> `npm run test:visual:update`, then explain the diff and get approval.
test.describe('visual - cotizador', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
  test.beforeEach(({}, testInfo) => {
    test.skip(!onlyVisualProjects(testInfo), 'baselines solo en 390 (ios390) y 1920 (desktop1920)');
  });

  test('paso 0 (producto)', async ({ page }) => {
    await openCotizador(page);
    await settleForScreenshot(page);
    await expect(page).toHaveScreenshot('paso0-producto.png', { timeout: 15_000 });
  });

  for (const fam of FAMILIES) {
    test(`paso 1 medidas - ${fam.model}`, async ({ page }) => {
      await openCotizador(page);
      await chooseLeaf(page, fam);
      await settleForScreenshot(page);
      await expect(page).toHaveScreenshot(`paso1-${fam.model}.png`);
    });
  }

  test('paso 2 precio y resumen (recta)', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.locator('#step2-heading')).toBeVisible();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$258.00');
    await settleForScreenshot(page);
    await expect(page).toHaveScreenshot('paso2-precio.png', { timeout: 15_000 });

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$298.00');
    await settleForScreenshot(page);
    await expect(page).toHaveScreenshot('paso4-resumen.png', { timeout: 15_000 });
  });
});
