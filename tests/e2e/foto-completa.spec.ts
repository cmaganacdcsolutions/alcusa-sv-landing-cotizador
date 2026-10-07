import { expect, test } from './fixtures';

// image-frame-rule.md ("Foto completa"): every main (non-aria-hidden) photo is shown whole,
// centered: object-fit contain, object-position 50% 50%. Kept apart: the aria-hidden ambient
// layer (cover + blur), logos, and glass swatches (textures).
// Las paginas /catalogo/** ya no existen (redirigen al inicio, ver catalogo-redirects.spec.ts): el catalogo es el inicio.
const ROUTES = ['/', '/cotizador'];

for (const route of ROUTES) {
  test(`foto completa: ${route} usa object-fit contain y centrado`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll('img').forEach((img) => {
        if (img.closest('[aria-hidden="true"]') || img.getAttribute('aria-hidden') === 'true') return;
        if (img.getAttribute('alt') === '' || /logo|finish-|swatch|glass/i.test(img.src + img.className)) return;
        if (img.closest('header, footer, nav, [class*="drawer"]')) return;
        const cs = getComputedStyle(img);
        // Renders de estudio (visual-brutal / image-frame-rule 2026-10-06): 4:3 exacto, cover, sin capa blur.
        if (img.src.includes('/images/renders/')) {
          if (cs.objectFit !== 'cover' || cs.objectPosition !== '50% 50%') out.push(`${img.src} ${cs.objectFit} ${cs.objectPosition}`);
          return;
        }
        if (cs.objectFit !== 'contain' || cs.objectPosition !== '50% 50%') {
          out.push(`${img.src} ${cs.objectFit} ${cs.objectPosition}`);
        }
      });
      return out;
    });
    expect(bad).toEqual([]);
  });
}
