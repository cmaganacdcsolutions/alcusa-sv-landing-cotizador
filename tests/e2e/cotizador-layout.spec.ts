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
    // El efecto de Cotizador.tsx puede desplazar la ventana al encabezado DESPUES de nuestro scrollTo (bajo carga
    // llega tarde: scrollY>0 y el aside sticky queda pegado unos px mas abajo). Se mide en un solo evaluate, con
    // scrollY=0, y se reintenta si la medicion cayo en una ventana desplazada.
    await expect(async () => {
      await waitForScrollSettled(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const m = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const h = r('.cotizador__header');
        const f = r('.cotizador__form-col');
        const a = r('.cotizador-aside');
        return { scrollY: window.scrollY, h: { y: h.y, bottom: h.bottom }, f: { y: f.y, right: f.right }, a: { x: a.x, y: a.y } };
      });
      expect(m.scrollY).toBe(0);
      expect(m.f.y - m.h.bottom).toBeLessThanOrEqual(48);
      expect(m.a.x).toBeGreaterThanOrEqual(m.f.right);
      expect(Math.abs(m.a.y - m.h.y)).toBeLessThanOrEqual(2);
    }).toPass();
  });
});
