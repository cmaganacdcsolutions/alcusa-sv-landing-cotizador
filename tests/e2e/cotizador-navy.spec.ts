import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';
import { fillAddress } from '../support/address';
import { waitForAnimationsSettled } from '../support/settle';

// 2026-10-06 — linea de diseno unica: azul noche + blanco. El cotizador y /contacto ponen la cabecera sobre
// el fondo azul del sitio y los pasos en una hoja/tarjeta clara. Ademas el cotizador NO carga ninguna foto
// de Alcusa (solo fotos oficiales de /images/fotos/ via src/content/home-media.ts).

const LEGACY_PHOTO = /\/(images\/catalog\/|img\/cotizador\/)/;

async function hydrated(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

/** Luminancia relativa (0 = negro, 1 = blanco) de un `rgb()/rgba()` computado. */
function luminance(css: string): number {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`color no rgb: ${css}`);
  const [r, g, b] = (m[1] as string)
    .split(/[ ,/]+/)
    .slice(0, 3)
    .map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function computed(page: Page, selector: string, prop: string): Promise<string> {
  return page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

async function expectNoContrastViolations(page: Page): Promise<void> {
  // Cada cambio de paso / seleccion dispara fades y transiciones de color (document.getAnimations()). axe lee el color
  // computado de ESE instante: a mitad de la transicion ve un tono intermedio y reporta un contraste transitorio que no
  // existe en el estado final. Esperar a que terminen (acotado) antes de analizar; el resultado final se evalua intacto.
  await waitForAnimationsSettled(page);
  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
}

test.describe('cotizador — tema azul noche', () => {
  test('pagina azul, cabecera clara y pasos en hoja/tarjeta clara', async ({ page }) => {
    await page.goto('/cotizador');
    await hydrated(page);
    expect(luminance(await computed(page, 'body', 'background-color'))).toBeLessThan(0.05);
    expect(luminance(await computed(page, '.cotizador__page-title', 'color'))).toBeGreaterThan(0.8);
    expect(luminance(await computed(page, '.cotizador__back', 'color'))).toBeGreaterThan(0.5);
    expect(luminance(await computed(page, '.cotizador__form-col', 'background-color'))).toBeGreaterThan(0.9);
    // El texto de la hoja es tinta oscura (el body es claro-sobre-noche).
    expect(luminance(await computed(page, '.cotizador__form-col', 'color'))).toBeLessThan(0.1);
    await expect(page.locator('.cotizador__form-col')).toBeVisible();
  });

  test('stepper de puntos (< 1280px): etiquetas legibles sobre azul', async ({ page }) => {
    await page.goto('/cotizador');
    await hydrated(page);
    test.skip(!(await page.locator('.step-rail-wrap').isVisible()), 'el stepper de puntos solo existe < 1280px');
    expect(luminance(await computed(page, '.step-rail__item', 'color'))).toBeGreaterThan(0.5);
  });

  test('axe color-contrast verde en cada paso (0, medidas, precio, zona, resumen, forma de pago)', async ({
    page,
  }) => {
    await page.goto('/cotizador');
    await hydrated(page);
    await page.getByRole('button', { name: /^Puertas de baño/ }).click();
    await expect(page.getByRole('button', { name: /^Rectas/ })).toBeVisible();
    await expectNoContrastViolations(page); // paso 0

    await pickProduct(page, 'recta');
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await expectNoContrastViolations(page);

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await expectNoContrastViolations(page);

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
    await expectNoContrastViolations(page); // zona / direccion vacia
    await fillAddress(page, 'Soyapango');
    await expectNoContrastViolations(page); // direccion completa + envio

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expectNoContrastViolations(page);

    await page.getByRole('button', { name: 'Pagar ahora' }).click();
    await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();
    await expect(page.getByTestId('formapago-discount-value')).toBeVisible(); // 10% tarjeta
    await expectNoContrastViolations(page);
  });

  test('envio por confirmar (zona sin tarifa) sigue legible sobre el tema', async ({ page }) => {
    await page.goto('/cotizador');
    await hydrated(page);
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await fillAddress(page, 'Santa Ana');
    await expect(page.getByTestId('zona-envio-pendiente')).toBeVisible();
    await expectNoContrastViolations(page);
  });
});

test.describe('cotizador — solo fotos oficiales del portafolio, ningun render', () => {
  test('ningun paso pide /images/catalog/ ni /img/cotizador/ y las miniaturas son fotos', async ({ page }) => {
    const bad: string[] = [];
    const fotos = new Set<string>();
    page.on('request', (req) => {
      const url = new URL(req.url()).pathname;
      if (LEGACY_PHOTO.test(url)) bad.push(url);
      if (url.startsWith('/images/fotos/')) fotos.add(url);
    });

    await page.goto('/cotizador');
    await hydrated(page);
    // Paso 0: cada categoria (miniaturas de tipo de baño, jardin y ventanas) y los acabados de En L.
    for (const cat of [/^Puertas de jardín/, /^Ventanas/, /^Puertas de baño/]) {
      await page.getByRole('button', { name: cat }).click();
      await expect(page.getByRole('group', { name: /^Tipo de|^Hojas de la/ })).toBeVisible();
    }
    await page.getByRole('button', { name: /^En L/ }).click();
    await expect(page.getByRole('group', { name: /^Acabado/ })).toBeVisible();
    await page.getByRole('button', { name: /^Aquafold/ }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    // Muestras de vidrio = circulos CSS, sin <img>.
    await expect(page.locator('.glass-chip__swatch img')).toHaveCount(0);

    // Ventana: las tarjetas de modelo (Francesa / Bilbao) tambien son fotos.
    await page.goto('/cotizador?producto=ventana-francesa');
    await hydrated(page);
    await expect(page.locator('.model-card__image').first()).toBeVisible();
    const modelSrcs = await page
      .locator('.model-card__image')
      .evaluateAll((els) => els.map((e) => (e as HTMLImageElement).currentSrc));
    expect(modelSrcs.length).toBe(2);
    for (const src of modelSrcs) expect(new URL(src).pathname).toMatch(/^\/images\/fotos\//);

    // Deep links (promo ?producto=recta&vidrio=aquafold y el de los configuradores del inicio) siguen funcionando.
    await page.goto('/cotizador?producto=recta&vidrio=aquafold');
    await hydrated(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Aquafold/ })).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/cotizador?producto=recta&paso=medidas&color=bronce&vidrio=nevado');
    await hydrated(page);
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Nevado/ })).toHaveAttribute('aria-pressed', 'true');

    const imgSrcs = await page
      .locator('img')
      .evaluateAll((els) => els.map((e) => (e as HTMLImageElement).currentSrc || e.getAttribute('src') || ''));
    for (const src of imgSrcs) if (src) expect(new URL(src, 'http://x').pathname).not.toMatch(LEGACY_PHOTO);
    expect(bad).toEqual([]);
    expect(fotos.size).toBeGreaterThan(3);
  });
});

test.describe('contacto — tema azul noche', () => {
  test('titulo claro sobre azul, tarjeta del formulario clara y axe color-contrast verde', async ({ page }) => {
    await page.goto('/contacto');
    await expect(page.getByRole('heading', { name: 'Hablemos de tu proyecto' })).toBeVisible();
    expect(luminance(await computed(page, 'body', 'background-color'))).toBeLessThan(0.05);
    expect(luminance(await computed(page, '.contacto__title', 'color'))).toBeGreaterThan(0.8);
    expect(luminance(await computed(page, '.contacto__lead', 'color'))).toBeGreaterThan(0.5);
    expect(luminance(await computed(page, '.contact-form', 'background-color'))).toBeGreaterThan(0.9);
    expect(luminance(await computed(page, '.contact-form', 'color'))).toBeLessThan(0.1);
    await expectNoContrastViolations(page);
  });
});
