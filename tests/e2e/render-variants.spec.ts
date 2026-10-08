import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Foto por combinacion (2026-10-08, fotos oficiales reemplazan los renders): la imagen sigue la regla
// vidrio -> color -> portada de src/content/home-media.ts, en las tarjetas del inicio y en el cotizador
// (Step2 "Precio estimado"). Cambia SOLO donde el portafolio tiene otra foto: recta (claro / nevado / con diseno),
// cabina en L (por acabado, no por color), ventana francesa (una sola foto por ahora: la negra queda para el color negro). Ventana Bilbao y jardin: una sola foto.
// Las escaleras puras estan en src/content/home-media.test.ts.
const FOTO = (stem: string): string => `/images/fotos/${stem}-800.webp`;

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
    // Una sola foto: ni vidrio ni marco la cambian.
    slug: 'ventana-bilbao',
    initial: 'ventana-bilbao',
    steps: [
      { field: 'Vidrio', option: /^Súper gris/, stem: 'ventana-bilbao' },
      { field: 'Marco', option: /^Natural/, stem: 'ventana-bilbao' },
    ],
  },
  {
    slug: 'jardin-2-hojas',
    initial: 'jardin-2-hojas',
    steps: [
      { field: 'Vidrio', option: /^Mallado/, stem: 'jardin-2-hojas' },
      { field: 'Color', option: /^Bronce/, stem: 'jardin-2-hojas' },
    ],
  },
  {
    // Vidrio manda; el color solo no cambia la foto; mallado no tiene foto propia -> portada.
    slug: 'recta',
    initial: 'recta',
    steps: [
      { field: 'Vidrio', option: /^Aquafold/, stem: 'recta-aquafold' },
      { field: 'Color', option: /^Bronce/, stem: 'recta-aquafold' },
      { field: 'Vidrio', option: /^Nevado/, stem: 'recta-nevado' },
      { field: 'Vidrio', option: /^Mallado/, stem: 'recta' },
    ],
  },
  {
    // Cambia por acabado, no por color.
    slug: 'en-l',
    initial: 'en-l',
    steps: [
      { field: 'Acabado', option: /^Aquafold/, stem: 'en-l-aquafold' },
      { field: 'Color', option: /^Bronce/, stem: 'en-l-aquafold' },
      { field: 'Acabado', option: /^Frosted/, stem: 'en-l-frosted' },
    ],
  },
  {
    // Blanco, bronce y natural muestran la misma foto (#18); la negra (#1) es solo galeria.
    slug: 'ventana-francesa',
    initial: 'ventana-francesa',
    steps: [
      { field: 'Marco', option: /^Bronce/, stem: 'ventana-francesa' },
      { field: 'Marco', option: /^Blanco/, stem: 'ventana-francesa' },
    ],
  },
];

test.describe('inicio: la foto sigue la regla vidrio -> color -> portada', () => {
  for (const c of HOME_CASES) {
    test(`${c.slug}: ${c.steps.map((s) => s.field).join(' y ')}`, async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('html[data-js]');
      const card = page.locator(`#p-${c.slug}`);
      await card.scrollIntoViewIfNeeded();
      const img = card.locator('img.photo-frame__img');
      await expect(img).toHaveAttribute('src', FOTO(c.initial));
      for (const step of c.steps) {
        await card.getByRole('combobox', { name: step.field }).click();
        await card.getByRole('option', { name: step.option }).click();
        await expect(img).toHaveAttribute('src', FOTO(step.stem));
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
    initial: 'ventana-bilbao',
    change: { group: 'Tipo de vidrio', button: /Reflectivo azul/i },
    changed: 'ventana-bilbao' // una sola foto: el vidrio no la cambia,
  },
  {
    name: 'puerta de jardin 2 hojas (color + vidrio)',
    query: 'producto=jardin-2-hojas&paso=medidas&color=bronce&vidrio=nevado',
    fill: async (page) => {
      await page.getByLabel('Ancho exacto de tu espacio').fill('2.00');
      await page.getByRole('button', { name: '2.10 m', exact: true }).click();
    },
    initial: 'jardin-2-hojas',
    change: { group: 'Tipo de vidrio', button: /^Mallado/ },
    changed: 'jardin-2-hojas',
  },
  {
    // Deep link del contrato: color=bronce&vidrio=aquafold -> Step2 muestra la foto recta-aquafold.
    name: 'puerta recta (color + vidrio)',
    query: 'producto=recta&paso=medidas&color=bronce&vidrio=aquafold',
    fill: async (page) => {
      await page.locator('#ancho').fill('110');
    },
    initial: 'recta-aquafold',
    change: { group: 'Tipo de vidrio', button: /^Nevado/ },
    changed: 'recta-nevado',
  },
  {
    name: 'cabina en L (color + acabado)',
    query: 'producto=l-aquaclara&paso=medidas&color=bronce',
    fill: async () => undefined, // 0.80 x 0.80 x 1.85 fijo: sin medidas
    initial: 'en-l',
    change: { group: 'Modelo', button: /Aquafold/i },
    changed: 'en-l-aquafold',
  },
];

async function step2Image(page: Page): Promise<Locator> {
  await expect(page.locator('#step2-heading')).toBeVisible();
  return page.locator('.estimate-card__preview img.photo-frame__img');
}

test.describe('cotizador Step2: la foto sigue el vidrio (o acabado) elegido', () => {
  for (const c of QUOTER_CASES) {
    test(c.name, async ({ page }) => {
      await page.goto(`/cotizador?${c.query}`);
      await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
      await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
      await c.fill(page);
      await clickNext(page);
      await expect(await step2Image(page)).toHaveAttribute('src', FOTO(c.initial));

      // Volver a Medidas, cambiar solo el vidrio/acabado y avanzar: la imagen cambia.
      await page.getByRole('button', { name: 'Editar medidas' }).click();
      await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
      await page.getByRole('group', { name: c.change.group, exact: true }).getByRole('button', { name: c.change.button }).click();
      await clickNext(page);
      const img = await step2Image(page);
      await expect(img).toHaveAttribute('src', FOTO(c.changed));
      await expect(async () => {
        expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      }).toPass();
    });
  }
});
