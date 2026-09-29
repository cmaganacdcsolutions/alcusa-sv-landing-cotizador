import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

// S4: catálogo grid (#modelos) + real-photo gallery (#galeria). New spec file
// (not shared with landing.spec.ts) to avoid merge conflicts with parallel
// slices touching the same test directory.
test.describe('landing — catálogo + galería (S4)', () => {
  test('catálogo grid shows 6 cards with distinct "Desde $X" values, no duplicate CTA targets', async ({ page }) => {
    await page.goto('/');
    const modelos = page.locator('#modelos');
    await modelos.scrollIntoViewIfNeeded();
    await expect(modelos.getByRole('heading', { name: 'Modelos fabricados a tu medida' })).toBeVisible();

    const ctas = modelos.getByRole('link', { name: 'Cotizar este modelo' });
    await expect(ctas).toHaveCount(6);

    const hrefs = await ctas.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    // Every CTA points at the standalone cotizador route with a distinct
    // producto id — no two cards share an anchor (legacy nav-duplication bug
    // this slice fixes).
    expect(new Set(hrefs).size).toBe(6);
    for (const href of hrefs) {
      expect(href).toMatch(/^\/cotizador\?producto=[a-z]+$/);
    }

    const prices = ['$222', '$444', '$672', '$253', '$410', '$108'];
    for (const price of prices) {
      await expect(modelos.getByText(`Desde ${price}`, { exact: true })).toBeVisible();
    }
  });

  test('"Cotizar este modelo" on the Puerta con bisagra card points at the hinged product', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('#modelos li', { hasText: 'Puerta con bisagra' });
    const href = await card.getByRole('link', { name: 'Cotizar este modelo' }).getAttribute('href');
    expect(href).toBe('/cotizador?producto=bisagra');
  });

  test('catálogo shows the "Vidrios para puertas de baño" swatches block at every breakpoint', async ({ page }) => {
    // Present on all 3 boards (Main.dc.html ~L80-84 / android-01-inicio.dc.html
    // ~L84-88 / desktop-01-inicio.dc.html ~L106-114) — sf-landing5 user
    // correction 2026-09-28 restores it on mobile (it was wrongly desktop-only).
    await page.goto('/');
    const modelos = page.locator('#modelos');
    await modelos.scrollIntoViewIfNeeded();
    await expect(modelos.getByRole('heading', { name: 'Vidrios para puertas de baño' })).toBeVisible();
    for (const finish of ['Aquaclara', 'Frosted', 'Aquafold']) {
      await expect(modelos.getByText(finish, { exact: true })).toBeVisible();
    }
  });

  test('galería shows exactly the 6 real customer photos, no AI-generated or third-party image', async ({ page }) => {
    await page.goto('/');
    const galeria = page.locator('#galeria');
    await galeria.scrollIntoViewIfNeeded();
    await expect(galeria.getByRole('heading', { name: 'Instalaciones de nuestros clientes' })).toBeVisible();

    const images = galeria.locator('img.galeria__img');
    await expect(images).toHaveCount(6);

    const srcs = await images.evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src')));
    for (let i = 1; i <= 6; i += 1) {
      expect(srcs).toContain(`/images/galeria-0${i}.jpeg`);
    }
    // Excluded assets never appear anywhere in the gallery markup.
    expect(srcs.join(' ')).not.toMatch(/chatgpt|puerta-3-hojas/);
  });

  test('tapping a gallery photo opens a focus-trapped lightbox; Escape closes it and restores focus', async ({
    page,
  }) => {
    await page.goto('/');
    const galeria = page.locator('#galeria');
    await galeria.scrollIntoViewIfNeeded();

    const firstTrigger = galeria.locator('[data-lightbox-trigger]').first();
    await firstTrigger.click();

    const lightbox = page.locator('#galeria-lightbox');
    await expect(lightbox).toHaveAttribute('aria-hidden', 'false');
    const closeBtn = page.locator('#galeria-lightbox-close');
    await expect(closeBtn).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(lightbox).toHaveAttribute('aria-hidden', 'true');
    await expect(firstTrigger).toBeFocused();
  });

  test('catálogo + galería have zero critical/serious axe violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).include('#modelos').include('#galeria').analyze();
    const seriousOrCritical = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(seriousOrCritical).toEqual([]);
  });
});
