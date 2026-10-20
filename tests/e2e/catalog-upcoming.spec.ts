import { expect, test } from './fixtures';

// Categorias sin cotizador en linea: Espejos (producto sin precio, 2026-10-20), Zarandas (producto real) y Fachadas comerciales
// (galeria real, sin precio; 2026-10-16). Todas con CTA a WhatsApp y sin enlaces al cotizador.
const SECTIONS = [
  { id: 'espejos', msg: 'Hola, quiero cotizar un espejo de 5 mm con chapetones.' },
  { id: 'zarandas', msg: 'Hola, quiero cotizar zarandas para ventanas francesas y celosías.' },
  { id: 'fachadas-comerciales', msg: 'Hola, quiero cotizar una fachada comercial.' },
] as const;

test.describe('categorias sin cotizador del catalogo', () => {
  test('las 3 secciones van en orden despues de Ventanas', async ({ page }) => {
    await page.goto('/');
    const ids = await page.locator('#catalogo > section.csec').evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(['puertas-de-bano', 'puertas-de-jardin', 'ventanas', ...SECTIONS.map((s) => s.id)]);
  });

  for (const s of SECTIONS) {
    test(`#${s.id}: CTA a WhatsApp con mensaje prellenado y sin enlaces al cotizador`, async ({ page }) => {
      await page.goto('/');
      const sec = page.locator(`section#${s.id}`);
      const cta = sec.getByRole('link', { name: 'Cotizar con un asesor' });
      await expect(cta).toHaveCount(1);
      const href = (await cta.getAttribute('href')) ?? '';
      expect(href).toMatch(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//);
      expect(new URL(href).searchParams.get('text')).toBe(s.msg);
      await expect(sec.locator('a[href*="/cotizador"]')).toHaveCount(0);
    });
  }

  test('#espejos: producto con foto, sin precio ni "$" y CTA de asesor', async ({ page }) => {
    await page.goto('/');
    const sec = page.locator('section#espejos');
    await expect(sec.locator('.pcard')).toHaveCount(1);
    await expect(sec.locator('[data-pending-card]')).toHaveCount(0);
    await expect(sec.getByRole('heading', { level: 3, name: 'Espejo de 5 mm con chapetones' })).toBeVisible();
    await expect(sec).toContainText('Cotización con asesor');
    await expect(sec).toContainText('Fijación con chapetones');
    await expect(sec).not.toContainText('$');
    await expect(sec).not.toContainText('pendiente');
    const img = sec.locator('img.photo-frame__img');
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute('alt', /espejo/i);
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(sec.getByRole('link', { name: 'Cotizar con un asesor' })).toHaveAttribute('href', /wa\.me|api\.whatsapp\.com/);
  });

  test('#zarandas: producto real con foto, precio y datos del cliente', async ({ page }) => {
    await page.goto('/');
    const sec = page.locator('section#zarandas');
    await expect(sec.locator('.pcard')).toHaveCount(1);
    await expect(sec.locator('[data-pending-card]')).toHaveCount(0);
    await expect(sec.getByRole('heading', { level: 3, name: 'Zarandas para ventanas francesas y celosías' })).toBeVisible();
    await expect(sec).toContainText('$25.00 por m²');
    await expect(sec).toContainText('Aluminio negro o blanco');
    await expect(sec).toContainText('Área mínima: 0.80 m²');
    await expect(sec).not.toContainText('pendiente');
    const img = sec.locator('img.photo-frame__img');
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute('alt', /zaranda/i);
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  });

  test('#fachadas-comerciales: galeria de 10 fotos con alt, copy de asesor y sin precio', async ({ page }) => {
    await page.goto('/');
    const sec = page.locator('section#fachadas-comerciales');
    await expect(sec.getByRole('heading', { level: 2, name: 'Fachadas comerciales' })).toBeVisible();
    await expect(sec).toContainText('Cotización con asesor.');
    await expect(sec).toContainText('Con tus medidas te damos una cotización aproximada; la modalidad y los detalles se definen con un asesor. Restricciones aplican.');
    await expect(sec).not.toContainText(/\$\s?\d/);
    await expect(sec.locator('[data-pending-card]')).toHaveCount(0);
    const imgs = sec.locator('[data-upcoming-gallery] img');
    await expect(imgs).toHaveCount(10);
    for (let i = 0; i < 10; i++) {
      const img = imgs.nth(i);
      expect(((await img.getAttribute('alt')) ?? '').length).toBeGreaterThan(10);
      await expect(img).toHaveAttribute('loading', 'lazy');
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
    // Las fotos no son interactivas (no hay lightbox): ni enlaces ni botones dentro de la galeria.
    await expect(sec.locator('[data-upcoming-gallery] a, [data-upcoming-gallery] button')).toHaveCount(0);
  });

  // Fila final completa: la foto 10 ya no queda sola y chica; la ultima fila llega al borde derecho con 2+ fotos.
  for (const width of [1920, 1280, 768, 390]) {
    test(`galeria de fachadas: la ultima fila queda completa a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/#fachadas-comerciales');
      const g = await page.locator('[data-upcoming-gallery]').evaluate((ul) => {
        const box = ul.getBoundingClientRect();
        const items = [...ul.children].map((li) => li.getBoundingClientRect());
        const lastTop = Math.max(...items.map((r) => Math.round(r.top)));
        const last = items.filter((r) => Math.round(r.top) === lastTop);
        return { right: box.right, lastRight: Math.max(...last.map((r) => r.right)), lastCount: last.length, scrollW: document.documentElement.scrollWidth, vw: window.innerWidth };
      });
      expect(g.lastCount).toBeGreaterThanOrEqual(2);
      expect(Math.abs(g.right - g.lastRight)).toBeLessThanOrEqual(1);
      expect(g.scrollW).toBeLessThanOrEqual(g.vw);
    });
  }

  for (const id of ['espejos', 'zarandas', 'fachadas-comerciales']) {
    test(`/#${id} hace scroll a la seccion`, async ({ page }) => {
      await page.goto(`/#${id}`);
      await expect(page.locator(`#${id}`)).toBeInViewport();
    });
  }

  test('sin overflow horizontal a 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
