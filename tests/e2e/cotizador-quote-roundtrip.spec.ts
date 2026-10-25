import { expect, pickProduct, test } from './fixtures';
import { fillAddress } from '../support/address';

// Hotfix 2026-10-24 (prod en modo mock): generar PDF -> recargar -> "Cargar cotización" con el folio
// recien emitido. Es la cadena real que debe funcionar en produccion (mismo navegador).
test.describe('cotizacion generada -> recarga -> cargar por codigo', () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, 'desktop-only: descarga directa del PDF'));

  test('el folio emitido se carga despues de recargar la pagina', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();

    await page.getByTestId('quote-share-button').locator('visible=true').click();
    const dlg = page.getByRole('dialog', { name: 'Tus datos para la cotización' });
    await dlg.getByLabel('Nombre').fill('María López');
    await dlg.getByLabel('WhatsApp').fill('71234567');
    await dlg.getByRole('checkbox').check();
    const download = page.waitForEvent('download');
    await dlg.getByRole('button', { name: 'Generar mi cotización' }).click();
    const code = (await download).suggestedFilename().match(/ALC-\d{8}-[0-9A-Z]{8}/)?.[0];
    expect(code, 'folio canonico (no contingencia)').toBeTruthy();

    // Mismo navegador, pestaña nueva (sin el borrador de sesion) y recarga: solo persiste el localStorage del mock.
    const next = await page.context().newPage();
    await next.goto('/cotizador');
    await next.reload();
    await expect(next.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    const toggle = next.getByRole('button', { name: '¿Ya tienes una cotización?', expanded: false });
    if (await toggle.count()) await toggle.click();
    await next.getByLabel('Código de tu cotización').fill(code!);
    await next.getByRole('button', { name: 'Cargar cotización' }).click();
    await expect(next.getByRole('status').filter({ hasText: /cargada\. Puedes revisarla y editarla\./ })).toBeVisible();
    await expect(next).toHaveURL(/#cotizador\/4-resumen/);
  });
});
