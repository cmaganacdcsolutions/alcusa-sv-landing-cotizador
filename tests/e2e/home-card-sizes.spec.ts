// `sizes` de la foto de las tarjetas del catalogo: debe coincidir con el ancho REAL renderizado (si pide de mas, el
// navegador baja un candidato mas grande del srcset en moviles DPR 2-3). Se resuelve el `sizes` del <img> contra el
// viewport (media condition -> longitud, evaluada por el propio navegador en un div sonda) y se compara con el ancho
// de la foto. Los viewports cubren las 3 ramas: 1 columna (<768), 2 columnas (768-1023) y columna fija (>=1024).
import { PRODUCT_CARD_IMAGE_SIZES } from '../../src/content/home-media';
import { expect, test } from './fixtures';

const VIEWPORTS = [360, 390, 412, 600, 767, 768, 900, 1023, 1024, 1920] as const;
const TOLERANCE_PX = 2;

// eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop1920', 'fija el viewport por su cuenta');
});

test('la constante PRODUCT_CARD_IMAGE_SIZES es el `sizes` que renderiza la tarjeta', async ({ page }) => {
  await page.goto('/');
  const sizes = await page.locator('.pcard__media img.photo-frame__img').first().getAttribute('sizes');
  expect(sizes).toBe(PRODUCT_CARD_IMAGE_SIZES);
});

for (const width of VIEWPORTS) {
  test(`sizes de la tarjeta = ancho real a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const result = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>('.pcard__media img.photo-frame__img');
      if (!img) throw new Error('sin foto de tarjeta');
      const slots = (img.getAttribute('sizes') ?? '').split(/,(?![^(]*\))/).map((s) => s.trim());
      // Primera entrada cuya media condition se cumple; la ultima (sin condicion) es el comodin.
      const slot = slots.find((s) => {
        const m = /^(\(.+?\))\s+(.+)$/.exec(s);
        return !m || window.matchMedia(m[1]).matches;
      });
      if (!slot) throw new Error('sizes sin entrada aplicable');
      const length = /^\(.+?\)\s+(.+)$/.exec(slot)?.[1] ?? slot;
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;visibility:hidden;height:0;width:${length}`;
      document.body.append(probe);
      const declared = probe.getBoundingClientRect().width;
      probe.remove();
      return { declared, rendered: img.getBoundingClientRect().width };
    });
    expect(Math.abs(result.declared - result.rendered)).toBeLessThanOrEqual(TOLERANCE_PX);
  });
}
