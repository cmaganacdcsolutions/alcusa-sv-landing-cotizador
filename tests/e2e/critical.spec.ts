import { CATEGORIES } from '@content/catalog';
import {
  HINGED_WIDTH_MAX_CM, HINGED_WIDTH_MIN_CM, STRAIGHT_WIDTH_MAX_CM, STRAIGHT_WIDTH_MIN_CM,
  TEMPERED_WIDTH_MAX_CM, TEMPERED_WIDTH_MIN_CM,
} from '@engine/pricing';
import { FAMILIES } from '../support/combos';
import { findBrokenImages } from '../support/images';
import { expect, test } from './fixtures';

// @critical = regression tripwires for what already broke before (see CLAUDE.md). `verify:quick`
// runs everything tagged @critical on desktop1920 + ios390. Also tagged elsewhere:
// cotizador.spec.ts (the 3 promo prices via `?promo=<id>` + CTA locks the promo config),
// cotizador-combinaciones.spec.ts (WhatsApp "Más opciones" advisor tile).

const PRICE_RE = /^\$[\d,]+\.\d{2}$/;
const MID: Record<string, number> = {
  recta: Math.round((STRAIGHT_WIDTH_MIN_CM + STRAIGHT_WIDTH_MAX_CM) / 2),
  bisagra: Math.round((HINGED_WIDTH_MIN_CM + HINGED_WIDTH_MAX_CM) / 2),
  templado: Math.round((TEMPERED_WIDTH_MIN_CM + TEMPERED_WIDTH_MAX_CM) / 2),
};

test.describe('critical - cada familia llega a un precio con foto en el paso 2', { tag: '@critical' }, () => {
  for (const fam of FAMILIES) {
    test(`${fam.model} (${fam.label})`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/cotizador#cotizador/0-producto');
      await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
      expect(await findBrokenImages(page), 'paso 0 sin imagenes rotas/0x0').toEqual([]);
      const types = page.getByRole('group', { name: /^(Tipo de|Hojas de la)/ });
      await expect(async () => {
        await page.getByRole('group', { name: 'Categoría' }).getByRole('button').nth(fam.categoryIndex).click();
        await expect(types).toBeVisible({ timeout: 1500 });
      }).toPass();
      await types.getByRole('button').nth(fam.typeIndex).click();
      if (fam.variantIndex !== null) await page.getByRole('group', { name: /^Acabado/ }).getByRole('button').nth(fam.variantIndex).click();
      await page.getByRole('button', { name: 'Siguiente' }).click({ force: true });
      await expect(page.locator('#step1-heading')).toBeVisible();
      if (MID[fam.model]) await page.locator('#ancho').fill(String(MID[fam.model]));
      await page.getByRole('button', { name: 'Siguiente' }).click({ force: true });
      await expect(page.locator('#step2-heading')).toBeVisible();

      const price = (await page.getByTestId('step2-price-value').innerText()).trim();
      expect(price).toMatch(PRICE_RE);
      expect(price).not.toBe('$0.00');

      const photo = page.locator('.estimate-card__preview img.photo-frame__img');
      await expect(async () => {
        expect(await photo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      }).toPass();
      const box = await photo.boundingBox();
      expect(box, 'foto del paso 2 con caja').not.toBeNull();
      expect(box!.width).toBeGreaterThan(100);
      expect(box!.height).toBeGreaterThan(60);
      expect(await findBrokenImages(page), 'paso 2 sin imagenes rotas/0x0').toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});

// Las paginas /catalogo/** ya no existen: el catalogo vive en el inicio (secciones + tarjetas #p-<slug>) y las URLs
// viejas redirigen a esas anclas (el detalle de redirects: catalogo-redirects.spec.ts).
const PAGES = ['/', '/cotizador', '/contacto', '/nosotros'];
test.describe('critical - ninguna imagen rota ni 0x0 en ninguna pagina', { tag: '@critical' }, () => {
  for (const url of PAGES) {
    test(url, async ({ page }) => {
      await page.goto(url);
      await page.waitForLoadState('load');
      expect(await findBrokenImages(page)).toEqual([]);
    });
  }
  for (const c of CATEGORIES) {
    test(`/catalogo/${c.slug}/ aterriza en la seccion del inicio sin imagenes rotas`, async ({ page }) => {
      await page.goto(`/catalogo/${c.slug}/`);
      await page.waitForURL(new RegExp(`/#${c.slug}$`));
      await expect(page.locator(`#${c.slug}`)).toBeAttached();
      expect(await findBrokenImages(page)).toEqual([]);
    });
  }
});

// Contexto promo (2026-10-08): `?promo=<id>` cotiza SOLO con el reglaje de la promo (Aquafold $279.99 solo ahi);
// sin `?promo` Aquafold recta va a asesor. Detalle completo: cotizador-promo-context.spec.ts.
test.describe('critical - Aquafold $279.99 solo con ?promo; sin promo va a asesor', { tag: '@critical' }, () => {
  test('?promo=promo-aquafold -> $279.99 a 110 cm', async ({ page }) => {
    await page.goto('/cotizador?producto=recta&paso=medidas&color=natural&vidrio=aquafold&promo=promo-aquafold');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await page.locator('#ancho').fill('110');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$279.99');
  });
  test('sin ?promo -> Aquafold recta se cotiza con asesor (sin precio)', async ({ page }) => {
    await page.goto('/cotizador?producto=recta&paso=medidas&color=natural&vidrio=aquafold');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByText(/Aquafold se cotiza con un asesor/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});
