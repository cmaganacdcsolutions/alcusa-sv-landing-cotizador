import { expect, pickProduct, test } from './fixtures';
import { waitForScrollSettled } from '../support/settle';

// Desktop grid regression: the "TU COTIZACIÓN" aside lost its grid placement
// in the shell rewrite, auto-placed into row 1 and stretched it to its own
// height, which pushed every step's content ~400px below the page title.
test.describe('cotizador — desktop layout', () => {
  test('step content starts right under the page title, aside in its own column', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1920', 'desktop grid only');
    await page.goto('/cotizador');
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
    await pickProduct(page, 'recta');

    // Medir con la ventana quieta y arriba del todo. Cotizador.tsx desplaza (suave) la ventana al encabezado
    // del paso al avanzar, y el aside es `position: sticky`: con la ventana en movimiento (o ya desplazada) el
    // aside se pega bajo la barra y su `y` deja de ser el de su fila del grid. Eso mediria la animacion de
    // scroll, no la colocacion en el grid. Con scrollY=0 el aside esta en su posicion natural (misma fila que
    // el titulo).
    await waitForScrollSettled(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await waitForScrollSettled(page);

    const header = await page.locator('.cotizador__header').boundingBox();
    const form = await page.locator('.cotizador__form-col').boundingBox();
    const aside = await page.locator('.cotizador-aside').boundingBox();
    expect(header && form && aside).toBeTruthy();
    expect(form!.y - (header!.y + header!.height)).toBeLessThanOrEqual(48);
    expect(aside!.x).toBeGreaterThanOrEqual(form!.x + form!.width);
    expect(Math.abs(aside!.y - header!.y)).toBeLessThanOrEqual(2);
  });
});
