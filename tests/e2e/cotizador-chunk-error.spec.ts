import { expect, pickProduct, test } from './fixtures';

test.use({ blockQuotePdf: true });

// Los pasos 1-7 son chunks diferidos. Si un chunk falla por red, el cotizador no se rompe:
// aparece el error con "Reintentar" y, ya con red, el paso carga conservando el estado.
test.describe('cotizador: chunk de paso falla', () => {
  test('error boundary + Reintentar conserva el estado', async ({ page }) => {
    // Bloqueo ANTES del goto: la precarga en idle tambien falla (si no, el chunk ya estaria en cache).
    let abort = true;
    await page.route(/\/_astro\/Step2Precio\..*\.js/, (route) => (abort ? route.abort() : route.continue()));
    await page.goto('/cotizador');
    await page.waitForLoadState('networkidle');

    await pickProduct(page, 'recta');
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await expect(page.locator('#ancho')).toHaveValue('110');
    await page.getByRole('button', { name: 'Natural' }).click();
    await page.getByRole('button', { name: 'Claro 5 mm' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByTestId('step-load-error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();

    abort = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$258.00');
  });
});
