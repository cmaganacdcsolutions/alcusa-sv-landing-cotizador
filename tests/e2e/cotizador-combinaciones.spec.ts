import type { Locator, Page } from '@playwright/test';
import { allLeaves, CATEGORIES, hasVariants, type Category, type ProductId, type QuoterPreset, type Subcategory } from '@content/catalog';
import { GARDEN_PROMO_BANDS } from '@content/pricingTables';
import {
  HINGED_WIDTH_MAX_CM,
  HINGED_WIDTH_MIN_CM,
  priceGarden,
  priceWindow,
  STRAIGHT_WIDTH_MAX_CM,
  STRAIGHT_WIDTH_MIN_CM,
  TEMPERED_WIDTH_MAX_CM,
  TEMPERED_WIDTH_MIN_CM,
  type AluminumColor,
  type CornerModel,
  type GardenColor,
  type GardenGlass,
  type StraightGlass,
  type WindowGlass,
} from '@engine/pricing';
import {
  CORNER_COLORS,
  CORNER_MODELS,
  GARDEN_COLORS,
  GARDEN_GLASSES,
  HINGED_COLORS,
  HINGED_GLASSES,
  STRAIGHT_COLORS,
  STRAIGHT_GLASSES,
  WINDOW_FRAMES,
  WINDOW_FRAMES_FRANCESA,
  WINDOW_GLASSES,
} from '../../src/islands/Cotizador/steps/measures/finishOptions';
import { estimateImage, typeImage, type ImageSelection } from '../../src/islands/Cotizador/steps/productImages';
import { expect, test } from './fixtures';
import { waitForScrollSettled } from '../support/settle';

// Every category x type/variant reachable in the cotizador, driven by the SAME
// sources the UI renders from (catalog CATEGORIES, finishOptions, engine
// constants/price functions), so a new option/model is covered automatically.

const PRICE_RE = /^\$[\d,]+\.\d{2}$/;

interface Finish {
  colorGroup?: string;
  colors: readonly string[];
  colorPrefix: 'color';
  glassGroup?: string;
  glasses: readonly string[];
  glassPrefix: 'glass' | 'wglass' | 'corner';
}

const FINISH: Record<ProductId, Finish> = {
  recta: { colorGroup: 'Color del aluminio', colors: STRAIGHT_COLORS, colorPrefix: 'color', glassGroup: 'Tipo de vidrio', glasses: STRAIGHT_GLASSES, glassPrefix: 'glass' },
  bisagra: { colorGroup: 'Color del aluminio', colors: HINGED_COLORS, colorPrefix: 'color', glassGroup: 'Tipo de vidrio', glasses: HINGED_GLASSES, glassPrefix: 'glass' },
  l: { colorGroup: 'Color del aluminio', colors: CORNER_COLORS, colorPrefix: 'color', glassGroup: 'Modelo', glasses: CORNER_MODELS, glassPrefix: 'corner' },
  jardin: { colorGroup: 'Color', colors: GARDEN_COLORS, colorPrefix: 'color', glassGroup: 'Tipo de vidrio', glasses: GARDEN_GLASSES, glassPrefix: 'glass' },
  ventana: { colorGroup: 'Color del marco', colors: WINDOW_FRAMES, colorPrefix: 'color', glassGroup: 'Tipo de vidrio', glasses: WINDOW_GLASSES, glassPrefix: 'wglass' },
  templado: { colors: [], colorPrefix: 'color', glasses: [], glassPrefix: 'glass' },
};

interface Combo {
  category: Category;
  categoryIndex: number;
  typeIndex: number;
  variantIndex: number | null;
  sub: Subcategory;
  model: ProductId;
  preset: QuoterPreset;
  label: string;
}

/** Same collapse Step0 applies: all advisor-only subcategories become ONE "Más opciones" tile. */
function typeTiles(c: Category): Subcategory[] {
  return c.subcategories.filter((s, i, all) => !(s.advisorOnly && all.findIndex((x) => x.advisorOnly) !== i));
}

const COMBOS: Combo[] = [];
CATEGORIES.forEach((category, categoryIndex) => {
  typeTiles(category).forEach((sub, typeIndex) => {
    if (sub.advisorOnly) return;
    if (hasVariants(sub)) {
      sub.variants.forEach((v, variantIndex) => {
        if (v.advisorOnly) return;
        COMBOS.push({ category, categoryIndex, typeIndex, variantIndex, sub, model: v.quoterModel, preset: v.preset ?? {}, label: `${category.slug}/${sub.slug}/${v.slug}` });
      });
    } else {
      COMBOS.push({ category, categoryIndex, typeIndex, variantIndex: null, sub, model: sub.quoterModel, preset: sub.preset ?? {}, label: `${category.slug}/${sub.slug}` });
    }
  });
});

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function openSelector(page: Page): Promise<void> {
  await page.goto('/cotizador#cotizador/0-producto');
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

async function chooseCategory(page: Page, index: number): Promise<Locator> {
  const types = page.getByRole('group', { name: /^(Tipo de|Hojas de la)/ });
  await expect(async () => {
    await page.getByRole('group', { name: 'Categoría' }).getByRole('button').nth(index).click();
    await expect(types).toBeVisible({ timeout: 1500 });
  }).toPass();
  return types;
}

async function expectThumbLoaded(tile: Locator): Promise<void> {
  const frame = tile.locator('.sel-tile__photo');
  await expect(frame).toHaveCount(1);
  await frame.scrollIntoViewIfNeeded();
  const img = frame.locator('img.photo-frame__img');
  await expect(async () => {
    expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  }).toPass();
  expect(((await img.getAttribute('alt')) ?? '').trim().length).toBeGreaterThan(1);
  expect(await img.getAttribute('loading')).toBe('lazy');
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(32);
  expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(1); // uniform 1:1
}

async function expectSwatch(button: Locator, id: string): Promise<void> {
  const sw = button.locator('.swatch');
  await expect(sw).toHaveCount(1);
  await expect(sw).toHaveAttribute('data-swatch', id);
  await expect(sw).toHaveAttribute('aria-hidden', 'true');
  const box = await sw.boundingBox();
  expect(box, `swatch ${id} has a box`).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(28);
  expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(1);
  const radius = await sw.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  expect(radius).toBeGreaterThanOrEqual(box!.width / 2 - 1); // a circle
  const btn = await button.boundingBox();
  expect(btn!.height).toBeGreaterThanOrEqual(43.5); // 44px touch target
  const img = sw.locator('img');
  if (await img.count()) {
    await expect(async () => {
      expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    }).toPass();
  }
}

async function selectAndCheck(group: Locator, index: number, id: string): Promise<void> {
  const btn = group.getByRole('button').nth(index);
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expectSwatch(btn, id);
  // Selected state: visible accent ring around the circle.
  expect(await btn.locator('.swatch').evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
}

async function clickNext(page: Page): Promise<void> {
  // Cada cambio de paso desplaza la ventana con scroll suave hasta el encabezado (Cotizador.tsx). `force` salta la
  // espera de estabilidad de Playwright, y `fill()` tampoco la hace: sin esperar a que la ventana quede quieta el
  // clic cae en coordenadas viejas, se pierde y el paso Precio nunca abre (flake bajo carga en puertas-de-bano/bisagra).
  await waitForScrollSettled(page);
  // Mobile: fixed bottom bar; Chromium mis-hit-tests it during touch emulation (see cotizador-ventana.spec.ts).
  await page.getByRole('button', { name: 'Siguiente' }).click({ force: true });
}

async function readBottomBarPrice(page: Page): Promise<string> {
  return (await page.locator('.bottom-bar__price-value').first().innerText()).trim();
}

/** Medidas -> Precio, returns the displayed price, then back to Medidas. */
async function priceViaPrecio(page: Page): Promise<string> {
  await clickNext(page);
  await expect(page.locator('#step2-heading')).toBeVisible();
  const value = (await page.getByTestId('step2-price-value').innerText()).trim();
  return value;
}
async function backToMedidas(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Editar medidas' }).click();
  await expect(page.locator('#step1-heading')).toBeVisible();
}

function expectedMoney(n: number | null): string {
  return n === null ? 'Por WhatsApp' : `$${n.toFixed(2)}`;
}
function expectSanePrice(text: string): void {
  expect(text).not.toMatch(/NaN|undefined|null/);
  expect(text).not.toBe('$0.00');
  expect(text).toMatch(PRICE_RE);
}

// ---------------------------------------------------------------- step 1 thumbs
test.describe('cotizador - miniaturas de "Tipo" por categoria', () => {
  CATEGORIES.forEach((category, categoryIndex) => {
    test(`${category.slug}: cada tipo muestra su miniatura (o el placeholder)`, async ({ page }) => {
      const errors = watchConsole(page);
      await openSelector(page);
      const types = await chooseCategory(page, categoryIndex);
      const tiles = typeTiles(category);
      await expect(types.getByRole('button')).toHaveCount(tiles.length);
      for (const [i, sub] of tiles.entries()) {
        const tile = types.getByRole('button').nth(i);
        const src = typeImage(sub.slug);
        if (src) {
          await expectThumbLoaded(tile);
          expect(await tile.locator('img.photo-frame__img').getAttribute('src')).toBe(src);
        } else {
          // "Foto próximamente": neutral icon placeholder, no broken <img>.
          expect(sub.advisorOnly, `${sub.slug} has no photo`).toBe(true);
          await expect(tile.locator('.sel-wa svg')).toBeVisible(); // WhatsApp glyph, no placeholder
          await expect(tile.locator('.sel-ph')).toHaveCount(0);
          await expect(tile.locator('img')).toHaveCount(0);
        }
      }
      expect(errors).toEqual([]);
    });
  });
});

// ---------------------------------------------------- step 1/2: every leaf, deep
function sweepWidths(model: ProductId): { valid: number[]; invalid: number[] } | null {
  const trio = (min: number, max: number) => [min, Math.round((min + max) / 2), max];
  if (model === 'recta') return { valid: trio(STRAIGHT_WIDTH_MIN_CM, STRAIGHT_WIDTH_MAX_CM), invalid: [STRAIGHT_WIDTH_MIN_CM - 1, STRAIGHT_WIDTH_MAX_CM + 1] };
  if (model === 'templado') return { valid: trio(TEMPERED_WIDTH_MIN_CM, TEMPERED_WIDTH_MAX_CM), invalid: [TEMPERED_WIDTH_MIN_CM - 1, TEMPERED_WIDTH_MAX_CM + 1] };
  if (model === 'bisagra') return { valid: trio(HINGED_WIDTH_MIN_CM, HINGED_WIDTH_MAX_CM), invalid: [HINGED_WIDTH_MIN_CM - 1, HINGED_WIDTH_MAX_CM + 1] };
  return null;
}

test.describe('cotizador - todas las combinaciones categoria x tipo', () => {
  test.describe.configure({ timeout: 240_000 });

  for (const combo of COMBOS) {
    test(`${combo.label}: miniatura, imagen en Precio, acabados y medidas`, async ({ page }) => {
      const errors = watchConsole(page);
      const base = FINISH[combo.model];
      // Ventana francesa ofrece ademas aluminio negro (Bilbao no).
      const fin: Finish = combo.model === 'ventana' && combo.preset.windowType === 'francesa' ? { ...base, colors: WINDOW_FRAMES_FRANCESA } : base;
      await openSelector(page);
      const typeGroup = await chooseCategory(page, combo.categoryIndex);

      // --- step 1: thumbnail of the chosen type
      const tile = typeGroup.getByRole('button').nth(combo.typeIndex);
      await expectThumbLoaded(tile);
      let thumbSrc = await tile.locator('img.photo-frame__img').getAttribute('src');
      let thumbWidth = (await tile.locator('.sel-tile__photo').boundingBox())!.width;
      expect(thumbSrc).toBe(typeImage(combo.sub.slug));
      await tile.click();
      if (combo.variantIndex !== null) {
        const vTile = page.getByRole('group', { name: /^Acabado/ }).getByRole('button').nth(combo.variantIndex);
        await expectThumbLoaded(vTile); // L variants show their own official photo
        thumbSrc = await vTile.locator('img.photo-frame__img').getAttribute('src');
        thumbWidth = (await vTile.locator('.sel-tile__photo').boundingBox())!.width;
        await vTile.click();
      }
      await clickNext(page);
      await expect(page.locator('#step1-heading')).toBeVisible();

      // --- swatches: every colour / glass option renders a circle and is selectable
      let combos = 0;
      if (fin.colorGroup) {
        const group = page.getByRole('group', { name: fin.colorGroup, exact: true });
        await expect(group.getByRole('button')).toHaveCount(fin.colors.length);
        for (const [i, c] of fin.colors.entries()) { await selectAndCheck(group, i, `color:${c}`); combos++; }
      }
      if (fin.glassGroup) {
        const group = page.getByRole('group', { name: fin.glassGroup, exact: true });
        await expect(group.getByRole('button')).toHaveCount(fin.glasses.length);
        for (const [i, g] of fin.glasses.entries()) { await selectAndCheck(group, i, `${fin.glassPrefix}:${g}`); combos++; }
      }

      // --- finish cross-product: price (or the documented quote) for every colour x glass
      const colorGroup = fin.colorGroup ? page.getByRole('group', { name: fin.colorGroup, exact: true }) : null;
      const glassGroup = fin.glassGroup ? page.getByRole('group', { name: fin.glassGroup, exact: true }) : null;
      const gardenBand = combo.model === 'jardin' && combo.preset.gardenHojas ? GARDEN_PROMO_BANDS[combo.preset.gardenHojas] : null;
      const hojas = combo.preset.gardenHojas;
      const sweep = sweepWidths(combo.model);
      if (sweep) await page.locator('#ancho').fill(String(sweep.valid[1])); // hinged's default 110 cm is out of range
      if (colorGroup && glassGroup) {
        for (const [ci, c] of fin.colors.entries()) {
          for (const [gi, g] of fin.glasses.entries()) {
            await colorGroup.getByRole('button').nth(ci).click();
            await glassGroup.getByRole('button').nth(gi).click();
            if (combo.model === 'jardin' && hojas && gardenBand) {
              const exp = priceGarden({ widthM: parseFloat(await page.locator('#jardin-ancho').inputValue()), heightM: 2.1, hojas, color: c as 'blanco', glass: g as 'claro', qty: 1 }).subtotal;
              await expect(page.locator('.bottom-bar__price-value').first()).toHaveText(expectedMoney(exp));
            } else if (combo.model === 'ventana') {
              const exp = priceWindow({ widthM: 1.2, heightM: 1.0, model: combo.preset.windowType ?? 'francesa', frame: c as 'blanco', glass: g as 'claro', zaranda: false, desmontaje: false, qty: 1 }).subtotal;
              await expect(page.locator('.bottom-bar__price-value').first()).toHaveText(expectedMoney(exp));
            } else if ((combo.model === 'recta' || combo.model === 'bisagra') && c === 'negro') {
              // 2026-10-08: aluminio negro sin precio oficial: se cotiza con asesor (Siguiente bloqueado).
              await expect(page.getByText(/El aluminio negro se cotiza con un asesor/)).toBeVisible();
              await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
            } else if (combo.model === 'recta' && g === 'aquafold') {
              // 2026-10-08: sin `?promo=<id>` el Aquafold recta no tiene precio web: se cotiza con asesor.
              await expect(page.getByText(/Aquafold se cotiza con un asesor/)).toBeVisible();
              await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
            } else {
              expectSanePrice(await priceViaPrecio(page));
              await backToMedidas(page);
            }
            combos++;
          }
        }
        // back to the priced baseline for the measure sweep
        await colorGroup.getByRole('button').nth(Math.max(0, fin.colors.indexOf('blanco'))).click();
        await glassGroup.getByRole('button').nth(Math.max(0, fin.glasses.indexOf(combo.preset.cornerFinish ?? 'claro'))).click();
      }

      // --- measures: min / mid / max valid + out-of-range
      const siguiente = page.getByRole('button', { name: 'Siguiente' });
      if (sweep) {
        const field = page.locator('#ancho');
        for (const w of sweep.valid) {
          await field.fill(String(w));
          expect(await siguiente.isEnabled(), `${w} cm enabled`).toBe(true);
          expectSanePrice(await priceViaPrecio(page));
          await backToMedidas(page);
          combos++;
        }
        for (const w of sweep.invalid) {
          await field.fill(String(w));
          await expect(siguiente).toBeDisabled();
          await expect(page.locator('.callout[role="status"]')).toBeVisible();
          combos++;
        }
        await field.fill(String(sweep.valid[1]));
      } else if (combo.model === 'jardin' && gardenBand && hojas) {
        const field = page.locator('#jardin-ancho');
        const mid = Math.round(((gardenBand.minWidthM + gardenBand.maxWidthM) / 2) * 100) / 100;
        for (const w of [gardenBand.minWidthM, mid, gardenBand.maxWidthM]) {
          await field.fill(String(w));
          const exp = priceGarden({ widthM: w, heightM: 2.1, hojas, color: 'blanco', glass: 'claro', qty: 1 }).subtotal;
          await expect(page.locator('.bottom-bar__price-value').first()).toHaveText(expectedMoney(exp));
          expectSanePrice(await readBottomBarPrice(page));
          combos++;
        }
        await field.fill('0');
        await expect(siguiente).toBeDisabled();
        combos++;
        await field.fill(String(mid));
      } else if (combo.model === 'ventana') {
        const model = combo.preset.windowType ?? 'francesa';
        for (const [w, h] of [[0.5, 0.5], [1.2, 1.0], [3.0, 2.0]] as const) {
          await page.getByLabel('Ancho en metros, ventana 1').fill(String(w));
          await page.getByLabel('Alto en metros, ventana 1').fill(String(h));
          const exp = priceWindow({ widthM: w, heightM: h, model, frame: 'blanco', glass: 'claro', zaranda: false, desmontaje: false, qty: 1 }).subtotal;
          await expect(page.locator('.bottom-bar__price-value').first()).toHaveText(expectedMoney(exp));
          expectSanePrice(await readBottomBarPrice(page));
          combos++;
        }
        await page.getByLabel('Ancho en metros, ventana 1').fill('0');
        await expect(siguiente).toBeDisabled();
        combos++;
        await page.getByLabel('Ancho en metros, ventana 1').fill('1.2');
        await page.getByLabel('Alto en metros, ventana 1').fill('1');
      } else {
        // 'l' (fixed 0.80 x 0.80 x 1.85): no measure input; the cross-product above already priced it.
        expect(combo.model).toBe('l');
      }

      // --- step 2: the larger image is the same product as the step-1 thumbnail
      expectSanePrice(await priceViaPrecio(page));
      const bigFrame = page.locator('.estimate-card__preview');
      const big = bigFrame.locator('img.photo-frame__img');
      await expect(async () => {
        expect(await big.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      }).toPass();
      const bigSrc = (await big.getAttribute('src')) ?? '';
      // The thumbnail stays the type's cover; the big preview follows the colour/glass the test left selected
      // (blanco or the first colour; claro, the L finish of the variant, or the first glass): one render per combination.
      const leftColor = fin.colors[Math.max(0, fin.colors.indexOf('blanco'))];
      const leftGlass = fin.glasses[Math.max(0, fin.glasses.indexOf(combo.preset.cornerFinish ?? 'claro'))];
      const selection: ImageSelection = {
        color: leftColor as AluminumColor,
        glass: leftGlass as StraightGlass,
        cornerModel: leftGlass as CornerModel,
        windowModel: combo.preset.windowType,
        windowFrame: leftColor as AluminumColor,
        windowGlass: leftGlass as WindowGlass,
        gardenHojas: combo.preset.gardenHojas,
        gardenColor: leftColor as GardenColor,
        gardenGlass: leftGlass as GardenGlass,
      };
      expect(bigSrc).toBe(estimateImage(combo.model, selection));
      if (fin.colorGroup) expect(bigSrc, 'preview follows the chosen colour/glass').toMatch(/^\/images\/fotos\/[a-z0-9-]+-800\.webp$/);
      expect((await bigFrame.boundingBox())!.width).toBeGreaterThanOrEqual(thumbWidth * 2); // step 2 is a real preview

      expect(errors).toEqual([]);
      test.info().annotations.push({ type: 'combinations', description: `${combo.label}: ${combos}` });
    });
  }
});

test('catalogo: las combinaciones del test cubren todas las hojas del catalogo', () => {
  // Guard: if a priced leaf is added to CATEGORIES it must show up as a COMBO.
  const priced = allLeaves().filter((l) => !l.advisorOnly);
  expect(COMBOS).toHaveLength(priced.length);
});

test.describe('cotizador - "Más opciones" (solo asesor)', () => {
  test('el tile muestra el placeholder y no avanza', { tag: '@critical' }, async ({ page }) => {
    const errors = watchConsole(page);
    await openSelector(page);
    const category = CATEGORIES.find((c) => c.subcategories.some((s) => s.advisorOnly));
    if (!category) return;
    const idx = CATEGORIES.indexOf(category);
    const types = await chooseCategory(page, idx);
    const tiles = typeTiles(category);
    const moreIdx = tiles.findIndex((s) => s.advisorOnly);
    const tile = types.getByRole('button').nth(moreIdx);
    await expect(tile.locator('.sel-wa svg')).toBeVisible();
    await expect(tile.locator('.sel-ph')).toHaveCount(0);
    await tile.click();
    await expect(page.getByRole('status').filter({ hasText: 'cotiza un asesor' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
