import type { Locator, Page } from '@playwright/test';
import { allLeaves, type ProductId } from '@content/catalog';
import {
  HINGED_WIDTH_MAX_CM, HINGED_WIDTH_MIN_CM, STRAIGHT_WIDTH_MAX_CM, STRAIGHT_WIDTH_MIN_CM,
  TEMPERED_WIDTH_MAX_CM, TEMPERED_WIDTH_MIN_CM,
} from '@engine/pricing';
import {
  CORNER_COLORS, CORNER_MODELS, GARDEN_COLORS, GARDEN_GLASSES, HINGED_COLORS, HINGED_GLASSES,
  STRAIGHT_COLORS, STRAIGHT_GLASSES, WINDOW_FRAMES, WINDOW_FRAMES_FRANCESA, WINDOW_GLASSES,
} from '../../src/islands/Cotizador/steps/measures/finishOptions';
import { COMBOS, typeTiles } from '../support/combos';
import { expect, test } from './fixtures';

// GOLDEN PRICING / CONTRACT TABLE.
// For every reachable cotizador leaf x colour x glass: displayed price, step-1 thumbnail, step-2
// photo (+alt), and the selected finish labels. Any unintended change shows up as a text diff of
// tests/e2e/__snapshots__/cotizador-golden.spec.ts/*.json. "Por WhatsApp" (pending price) is an
// EXPECTED value, not a failure. Intentional change (new price, new photo, new label):
//   E2E_PORT=4410 npx playwright test cotizador-golden --project=desktop1920 --update-snapshots
// and explain the diff to the user - never regenerate to "make it green".
// Prices/labels do not depend on viewport, so it only runs on desktop1920.

const FINISH: Record<ProductId, { color?: [string, readonly string[]]; glass?: [string, readonly string[]] }> = {
  recta: { color: ['Color del aluminio', STRAIGHT_COLORS], glass: ['Tipo de vidrio', STRAIGHT_GLASSES] },
  bisagra: { color: ['Color del aluminio', HINGED_COLORS], glass: ['Tipo de vidrio', HINGED_GLASSES] },
  l: { color: ['Color del aluminio', CORNER_COLORS], glass: ['Modelo', CORNER_MODELS] },
  jardin: { color: ['Color', GARDEN_COLORS], glass: ['Tipo de vidrio', GARDEN_GLASSES] },
  ventana: { color: ['Color del marco', WINDOW_FRAMES], glass: ['Tipo de vidrio', WINDOW_GLASSES] },
  templado: {},
};
const MID_WIDTH: Partial<Record<ProductId, number>> = {
  recta: Math.round((STRAIGHT_WIDTH_MIN_CM + STRAIGHT_WIDTH_MAX_CM) / 2),
  bisagra: Math.round((HINGED_WIDTH_MIN_CM + HINGED_WIDTH_MAX_CM) / 2),
  templado: Math.round((TEMPERED_WIDTH_MIN_CM + TEMPERED_WIDTH_MAX_CM) / 2),
};

async function clickNext(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Siguiente' }).click({ force: true });
}
async function pressedLabel(group: Locator): Promise<string> {
  const b = group.getByRole('button', { pressed: true });
  await expect(b).toHaveCount(1);
  return ((await b.getAttribute('aria-label')) ?? (await b.innerText())).replace(/\s+/g, ' ').trim();
}
async function srcOf(img: Locator): Promise<string> {
  await expect(async () => {
    expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  }).toPass();
  return (await img.getAttribute('src')) ?? '';
}

test.describe('cotizador - tabla dorada de precios/contrato', () => {
  test.describe.configure({ timeout: 240_000 });
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1920', 'valores independientes del viewport: solo desktop1920');
  });

  for (const combo of COMBOS) {
    test(`${combo.label}`, async ({ page }) => {
      const fin = FINISH[combo.model];
      await page.goto('/cotizador#cotizador/0-producto');
      await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
      const types = page.getByRole('group', { name: /^(Tipo de|Hojas de la)/ });
      await expect(async () => {
        await page.getByRole('group', { name: 'Categoría' }).getByRole('button').nth(combo.categoryIndex).click();
        await expect(types).toBeVisible({ timeout: 1500 });
      }).toPass();
      let tile = types.getByRole('button').nth(combo.typeIndex);
      let thumb = await srcOf(tile.locator('img.photo-frame__img'));
      await tile.click();
      if (combo.variantIndex !== null) {
        tile = page.getByRole('group', { name: /^Acabado/ }).getByRole('button').nth(combo.variantIndex);
        thumb = await srcOf(tile.locator('img.photo-frame__img'));
        await tile.click();
      }
      await clickNext(page);
      await expect(page.locator('#step1-heading')).toBeVisible();
      const mid = MID_WIDTH[combo.model];
      if (mid) await page.locator('#ancho').fill(String(mid));

      const colorG = fin.color ? page.getByRole('group', { name: fin.color[0], exact: true }) : null;
      const glassG = fin.glass ? page.getByRole('group', { name: fin.glass[0], exact: true }) : null;
      const direct = combo.model === 'jardin' || combo.model === 'ventana'; // price live in the bottom bar
      const rows: Record<string, unknown>[] = [];
      let lastReachable: [number, number] | null = null;
      // Ventana francesa ofrece ademas aluminio negro (Bilbao no).
      const francesa = combo.model === 'ventana' && combo.preset.windowType === 'francesa';
      const colors = fin.color ? (francesa ? WINDOW_FRAMES_FRANCESA : fin.color[1]) : [null];
      const glasses = fin.glass ? fin.glass[1] : [null];
      for (const [ci, c] of colors.entries()) {
        for (const [gi, g] of glasses.entries()) {
          if (colorG) await colorG.getByRole('button').nth(ci).click();
          if (glassG) await glassG.getByRole('button').nth(gi).click();
          let price: string;
          if (direct) {
            price = (await page.locator('.bottom-bar__price-value').first().innerText()).trim();
          } else if (await page.getByRole('button', { name: 'Siguiente' }).isDisabled()) {
            // 2026-10-08: recta + Aquafold sin `?promo=<id>` se cotiza con asesor (Siguiente deshabilitado).
            price = 'Por WhatsApp';
          } else {
            lastReachable = [ci, gi];
            await clickNext(page);
            await expect(page.locator('#step2-heading')).toBeVisible();
            price = (await page.getByTestId('step2-price-value').innerText()).trim();
            await page.getByRole('button', { name: 'Editar medidas' }).click();
            await expect(page.locator('#step1-heading')).toBeVisible();
          }
          rows.push({
            color: c, glass: g, price,
            colorLabel: colorG ? await pressedLabel(colorG) : null,
            glassLabel: glassG ? await pressedLabel(glassG) : null,
          });
        }
      }

      // step 2 once at the last priced selection: the big photo is a pure function of the leaf
      if (lastReachable && colorG && glassG && (await page.getByRole('button', { name: 'Siguiente' }).isDisabled())) {
        await colorG.getByRole('button').nth(lastReachable[0]).click();
        await glassG.getByRole('button').nth(lastReachable[1]).click();
      }
      await clickNext(page);
      await expect(page.locator('#step2-heading')).toBeVisible();
      const big = page.locator('.estimate-card__preview img.photo-frame__img');
      const table = {
        leaf: combo.label,
        thumb,
        step2Image: await srcOf(big),
        step2Alt: await big.getAttribute('alt'),
        rows,
      };
      expect(JSON.stringify(table, null, 2) + '\n').toMatchSnapshot(`${combo.label.replaceAll('/', '__')}.json`);
    });
  }

  test('la tabla dorada cubre todas las hojas del catalogo', () => {
    expect(COMBOS).toHaveLength(allLeaves().filter((l) => !l.advisorOnly).length);
    expect(typeTiles).toBeDefined();
  });
});
