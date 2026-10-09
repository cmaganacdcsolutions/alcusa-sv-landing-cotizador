import type { Page } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';

// sf-cot-medidas (S7 board pass) — gaps #1/#2/#3 asserted end to end:
// product photos in Step0, the "Tipo de vidrio" swatch selector, and the
// estimate card still pricing correctly once restyled.
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

test.describe('cotizador — Step0/1/2 board pass (sf-cot-medidas)', () => {
  test('every Step0 category tile renders a real photo in a PhotoFrame (gap #1, R5)', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);

    const cards = page.locator('.sel-tile--cat');
    await expect(cards).toHaveCount(3);
    const images = page.locator('.sel-tile--cat .photo-frame__img');
    await expect(images).toHaveCount(3);
    for (const img of await images.all()) {
      const src = await img.getAttribute('src');
      // 2026-10-08: fotos oficiales del portafolio (home-media); 3 categorias (baño, jardin, ventanas).
      expect(src).toMatch(/^\/images\/fotos\/.*\.webp$/);
      // naturalWidth > 0 => the browser actually decoded the file (not a 404).
      const naturalWidth = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
      expect(naturalWidth).toBeGreaterThan(0);
    }
  });

  test('"Tipo de vidrio" swatches render, are selectable, and keep the correct estimate (gap #2/#3)', async ({
    page,
  }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'recta');

    const glassGroup = page.getByRole('group', { name: 'Tipo de vidrio' }).first();
    await expect(glassGroup).toBeVisible();
    const nevadoBtn = page.getByRole('button', { name: 'Nevado 5 mm' });
    await expect(nevadoBtn.locator('.glass-chip__swatch')).toBeVisible();
    // 2026-10-06: every glass swatch is a CSS circle (no <img>): same look as the home's chips.
    await expect(nevadoBtn.locator('.glass-chip__swatch img')).toHaveCount(0);
    await expect(nevadoBtn.locator('.glass-chip__swatch')).toHaveAttribute('data-swatch', 'glass:nevado');
    await expect(nevadoBtn.locator('.glass-chip__swatch')).toHaveCSS('background-image', /radial-gradient/);

    await page.getByRole('button', { name: 'Natural' }).click();
    await nevadoBtn.click();
    await expect(nevadoBtn).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    // Table A, 110cm Natural Nevado — unchanged pricing, only the card's
    // markup/CSS moved to .estimate-card.
    await expect(page.getByTestId('step2-price-value')).toHaveText('$297.00');
    await expect(page.locator('.estimate-card__preview img.photo-frame__img')).toHaveAttribute('src', '/images/fotos/recta-nevado-800.webp');
  });
});
