import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Render por combinacion (2026-10-07): la imagen cambia con CADA color x vidrio (cabina en L: color x acabado),
// en las tarjetas del inicio y en el cotizador (Step2 "Precio estimado"). Una ventana, una puerta de jardin,
// la puerta recta y la cabina en L. Las escaleras puras estan en src/content/home-media.test.ts.
const RENDER = (stem: string): string => `/images/renders/${stem}-800.webp`;

// ---- Inicio: tarjetas ---------------------------------------------------------------------------------------
interface HomeStep {
  field: string;
  option: RegExp;
  stem: string;
}
interface HomeCase {
  slug: string;
  initial: string;
  steps: HomeStep[];
}
const HOME_CASES: HomeCase[] = [
  {
    slug: 'ventana-bilbao',
    initial: 'ventana-bilbao-blanco-claro',
    steps: [
      { field: 'Vidrio', option: /^Súper gris/, stem: 'ventana-bilbao-blanco-super-gris' },
      { field: 'Marco', option: /^Natural/, stem: 'ventana-bilbao-natural-super-gris' },
    ],
  },
  {
    slug: 'jardin-2-hojas',
    initial: 'jardin-2-hojas-blanco-claro',
    steps: [
      { field: 'Vidrio', option: /^Mallado/, stem: 'jardin-2-hojas-blanco-mallado' },
      { field: 'Color', option: /^Bronce/, stem: 'jardin-2-hojas-bronce-mallado' },
    ],
  },
  {
    slug: 'recta',
    initial: 'recta-natural-claro',
    steps: [
      { field: 'Vidrio', option: /^Aquafold/, stem: 'recta-natural-aquafold' },
      { field: 'Color', option: /^Bronce/, stem: 'recta-bronce-aquafold' },
    ],
  },
  {
    slug: 'en-l',
    initial: 'en-l-natural-aquaclara',
    steps: [
      { field: 'Acabado', option: /^Aquafold/, stem: 'en-l-natural-aquafold' },
      { field: 'Color', option: /^Bronce/, stem: 'en-l-bronce-aquafold' },
    ],
  },
];

test.describe('inicio: el render cambia con el vidrio/acabado y con el color', () => {
  for (const c of HOME_CASES) {
    test(`${c.slug}: ${c.steps.map((s) => s.field).join(' y ')}`, async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('html[data-js]');
      const card = page.locator(`#p-${c.slug}`);
      await card.scrollIntoViewIfNeeded();
      const img = card.locator('img.photo-frame__img');
      await expect(img).toHaveAttribute('src', RENDER(c.initial));
      let previous = RENDER(c.initial);
      for (const step of c.steps) {
        await card.getByRole('combobox', { name: step.field }).click();
        await card.getByRole('option', { name: step.option }).click();
        await expect(img).toHaveAttribute('src', RENDER(step.stem));
        expect(RENDER(step.stem), `${c.slug} ${step.field}: la imagen debe cambiar`).not.toBe(previous);
        previous = RENDER(step.stem);
      }
    });
  }
});

// ---- Cotizador: Step2 ---------------------------------------------------------------------------------------
interface QuoterCase {
  name: string;
  /** Deep link del inicio: `?producto=&paso=medidas&color=&vidrio=` (precarga color y vidrio). */
  query: string;
  fill: (page: Page) => Promise<void>;
  initial: string;
  /** Cambio en Medidas (grupo de botones + boton) y el render que debe mostrar el Step2 despues. */
  change: { group: string; button: RegExp };
  changed: string;
}

const clickNext = (page: Page): Promise<void> => page.getByRole('button', { name: 'Siguiente' }).click({ force: true });

const QUOTER_CASES: QuoterCase[] = [
  {
    name: 'ventana Bilbao (marco + vidrio)',
    query: 'producto=ventana-bilbao&paso=medidas&color=bronce&vidrio=super_gris',
    fill: async (page) => {
      await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
      await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
    },
    initial: 'ventana-bilbao-bronce-super-gris',
    change: { group: 'Tipo de vidrio', button: /Reflectivo azul/i },
    changed: 'ventana-bilbao-bronce-reflectivo-azul',
  },
  {
    name: 'puerta de jardin 2 hojas (color + vidrio)',
    query: 'producto=jardin-2-hojas&paso=medidas&color=bronce&vidrio=nevado',
    fill: async (page) => {
      await page.getByLabel('Ancho exacto de tu espacio').fill('2.00');
      await page.getByRole('button', { name: '2.10 m', exact: true }).click();
    },
    initial: 'jardin-2-hojas-bronce-nevado',
    change: { group: 'Tipo de vidrio', button: /^Mallado/ },
    changed: 'jardin-2-hojas-bronce-mallado',
  },
  {
    // Deep link del contrato: color=bronce&vidrio=nevado -> Step2 muestra recta-bronce-nevado (Aquafold recta sin ?promo va a asesor: no llega a Step2).
    name: 'puerta recta (color + vidrio)',
    query: 'producto=recta&paso=medidas&color=bronce&vidrio=nevado',
    fill: async (page) => {
      await page.locator('#ancho').fill('110');
    },
    initial: 'recta-bronce-nevado',
    change: { group: 'Tipo de vidrio', button: /^Decorado/ },
    changed: 'recta-bronce-decorado',
  },
  {
    name: 'cabina en L (color + acabado)',
    query: 'producto=l-aquaclara&paso=medidas&color=bronce',
    fill: async () => undefined, // 0.80 x 0.80 x 1.85 fijo: sin medidas
    initial: 'en-l-bronce-aquaclara',
    change: { group: 'Modelo', button: /Aquafold/i },
    changed: 'en-l-bronce-aquafold',
  },
];

async function step2Image(page: Page): Promise<Locator> {
  await expect(page.locator('#step2-heading')).toBeVisible();
  return page.locator('.estimate-card__preview img.photo-frame__img');
}

test.describe('cotizador Step2: el render sigue el color y el vidrio elegidos', () => {
  for (const c of QUOTER_CASES) {
    test(c.name, async ({ page }) => {
      await page.goto(`/cotizador?${c.query}`);
      await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
      await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
      await c.fill(page);
      await clickNext(page);
      await expect(await step2Image(page)).toHaveAttribute('src', RENDER(c.initial));

      // Volver a Medidas, cambiar solo el vidrio/acabado y avanzar: la imagen cambia.
      await page.getByRole('button', { name: 'Editar medidas' }).click();
      await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
      await page.getByRole('group', { name: c.change.group, exact: true }).getByRole('button', { name: c.change.button }).click();
      await clickNext(page);
      const img = await step2Image(page);
      await expect(img).toHaveAttribute('src', RENDER(c.changed));
      await expect(async () => {
        expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      }).toPass();
    });
  }
});
