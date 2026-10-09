import AxeBuilder from '@axe-core/playwright';
import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';

// Inicio con las fotos oficiales de Alcusa (2026-10-08, reemplazan los renders), jardin con 3 productos,
// iconos de color/vidrio en cada tarjeta, galeria de renders y guia "Como funciona" paso a paso.
// Jardin: 3 productos + sub-bloque "Más opciones para tu jardín" (2 combinaciones solo asesor, ver jardin-mas-opciones.spec.ts).
const LEGACY = /\/images\/(catalog|card-|hero-|galeria|finish-)/;

// Dropdowns (combobox) de cada tarjeta: abre la lista del campo y elige la opcion por nombre.
async function pick(card: Locator, field: string, option: RegExp): Promise<void> {
  await card.getByRole('combobox', { name: field }).click();
  await card.getByRole('option', { name: option }).click();
}

test.describe('home: renders, iconos de acabado y guia', () => {
  test('puertas de jardin muestra 3 productos con opciones y 5 de "Más opciones para tu jardín"; las demas categorias tienen sus propios solo-asesor', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#puertas-de-jardin .pcard')).toHaveCount(8);
    await expect(page.locator('#puertas-de-jardin .pcard:not(.pcard--advisor)')).toHaveCount(3);
    await expect(page.locator('#puertas-de-jardin .csec__more .pcard--advisor')).toHaveCount(5);
    // Solo-asesor en todo el sitio: 5 de jardin (2 combinaciones + 3 abatibles) + 1 de bano + 1 de ventanas.
    await expect(page.locator('.pcard--advisor')).toHaveCount(7);
    await expect(page.locator('#puertas-de-bano .csec__more .pcard--advisor')).toHaveCount(1);
    await expect(page.locator('#ventanas .csec__more .pcard--advisor')).toHaveCount(1);
    await expect(page.locator('#puertas-abatibles')).toHaveCount(0);
  });

  test('tarjetas usan /images/fotos/ (fotos oficiales) y el HTML no tiene rutas de foto legacy', async ({ page }) => {
    await page.goto('/');
    const srcs = await page.locator('.pcard img.photo-frame__img').evaluateAll((els) => els.map((e) => e.getAttribute('src')));
    expect(srcs.length).toBe(16);
    for (const s of srcs) expect(s).toMatch(/^\/images\/fotos\//);
    expect(await page.content()).not.toContain('/images/renders/');
    expect(await page.content()).not.toMatch(LEGACY);
  });

  test('cada tarjeta con opciones muestra un circulo de color/vidrio en cada dropdown y en cada opcion, con destino de 44px', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-js]');
    const cards = page.locator('.pcard:has(form[data-config])');
    const n = await cards.count();
    expect(n).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const triggers = card.locator('[data-trigger]');
      expect(await triggers.count()).toBeGreaterThan(0);
      for (let t = 0; t < (await triggers.count()); t++) {
        const trigger = triggers.nth(t);
        await expect(trigger.locator('.pcard__sw')).toBeVisible();
        expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    const fr = page.locator('#p-ventana-francesa');
    // Francesa: blanco, bronce, natural y negro (2026-10-08).
    await expect(fr.locator('.pcard__opt .pcard__sw[data-sw^="color:"]')).toHaveCount(4);
    await expect(fr.locator('[data-trigger] .pcard__sw').first()).toHaveCSS('border-radius', '50%');
  });

  test('elegir color y vidrio (o acabado) cambia la foto de la tarjeta donde el portafolio tiene otra, tambien en la cabina en L', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('#p-recta');
    await card.scrollIntoViewIfNeeded();
    await page.waitForSelector('html[data-js]');
    const img = card.locator('img.photo-frame__img');
    await expect(img).toHaveAttribute('src', '/images/fotos/recta-800.webp');
    await pick(card, 'Color', /^Bronce/);
    await expect(img).toHaveAttribute('src', '/images/fotos/recta-800.webp'); // el color solo no tiene foto propia
    await pick(card, 'Vidrio', /^Nevado/);
    await expect(img).toHaveAttribute('src', '/images/fotos/recta-nevado-800.webp');
    const enL = page.locator('#p-en-l');
    await expect(enL.locator('img.photo-frame__img')).toHaveAttribute('src', '/images/fotos/en-l-800.webp');
    await pick(enL, 'Color', /^Bronce/);
    await expect(enL.locator('img.photo-frame__img')).toHaveAttribute('src', '/images/fotos/en-l-800.webp');
    await pick(enL, 'Acabado', /^Frosted/);
    await expect(enL.locator('img.photo-frame__img')).toHaveAttribute('src', '/images/fotos/en-l-frosted-800.webp');
  });

  test('ningun texto ni boton se sale del borde de su tarjeta (tolerancia 1px)', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.pcard');
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      const out = await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [...el.querySelectorAll('*')]
          .filter((c) => !c.closest('input') && !(c instanceof HTMLInputElement) && getComputedStyle(c).position !== 'absolute')
          .map((c) => ({ c, b: c.getBoundingClientRect() }))
          .filter(({ b }) => b.width > 0 && (b.left < r.left - 1 || b.right > r.right + 1))
          .map(({ c }) => c.className || c.tagName);
      });
      expect(out, `tarjeta ${i}`).toEqual([]);
    }
  });

  test('cómo funciona: lista ordenada de 5-7 pasos con encabezado, ayuda por WhatsApp y sin scroll horizontal', async ({
    page,
  }) => {
    await page.goto('/');
    const proceso = page.locator('#proceso');
    await proceso.scrollIntoViewIfNeeded();
    const count = await proceso.locator('ol > li').count();
    expect(count).toBeGreaterThanOrEqual(5);
    expect(count).toBeLessThanOrEqual(7);
    expect(await proceso.locator('ol > li h3').count()).toBe(count);
    await expect(proceso.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(proceso.getByRole('heading', { level: 3 }).filter({ hasText: 'Toca el botón «Cotizar»' })).toBeVisible();
    const help = proceso.getByTestId('proceso-ayuda-whatsapp');
    await expect(help).toContainText('Escríbenos por WhatsApp');
    await expect(help).toHaveAttribute('href', /^https:\/\/wa\.me\//);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });

  test('fondo unico: degradado continuo (arriba != abajo), sin fondos opacos por seccion, sin seccion Acabados y vidrios', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#galeria')).toHaveCount(0);
    await expect(page.getByText('Acabados y vidrios')).toHaveCount(0);
    const bg = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const own = [...document.querySelectorAll('main > *')].map((el) => getComputedStyle(el).backgroundColor);
      return { image: body.backgroundImage, own };
    });
    expect(bg.image).toContain('linear-gradient');
    for (const c of bg.own) expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(c);
    const stops = await page.evaluate(() => {
      const r = getComputedStyle(document.documentElement);
      return [r.getPropertyValue('--color-page-top').trim(), r.getPropertyValue('--color-page-bottom').trim()];
    });
    expect(stops[0]).not.toBe(stops[1]);
  });

  test('intro y botones de categoria centrados (movil y desktop)', async ({ page }) => {
    await page.goto('/');
    const intro = page.locator('#inicio');
    await expect(intro).toHaveCSS('text-align', 'center');
    const vw = page.viewportSize()!.width;
    for (const sel of ['#inicio h1', '#inicio .hintro__link']) {
      const b = (await page.locator(sel).first().boundingBox())!;
      expect(Math.abs(b.x + b.width / 2 - vw / 2)).toBeLessThan(vw * 0.06);
    }
    // Centradas cuando caben; si desbordan (390 px) se alinean al inicio para que "Ventanas" no quede cortada a la izquierda.
    const list = page.locator('.ctabs__list');
    const overflows = await list.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    await expect(list).toHaveCSS('justify-content', overflows ? 'flex-start' : 'center');
  });

  test('texto de titulos y de secciones sobre el fondo noche cumple contraste AA (axe)', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).include('main').withRules(['color-contrast']).analyze();
    expect(results.violations).toEqual([]);
  });
});
