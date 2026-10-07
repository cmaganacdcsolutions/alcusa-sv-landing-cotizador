import { expect, test } from './fixtures';

// sf-landing5 — Footer content-parity (2026-09-28 user review), reescrito contra el footer nuevo
// (spec navbar 01d §3: marca + WhatsApp + telefono | Explora | Alcusa, formas de pago, redes, legal).
// Los casos de catalogo/galeria/teaser del cotizador (CTA subrayado, vidrios, "Desliza para ver mas",
// tipografia del teaser, (e)-(h)) se retiraron: esas secciones ya no existen en la landing.
// Runs across all 3 projects (ios390/android412/desktop1920) unless a test is scoped otherwise.

test.describe('landing5 — footer content parity with the boards', () => {
  test('footer: 7 nav links in order (Explora + Alcusa), no NIT/handles line; WhatsApp CTA with its icon', async ({
    page,
  }) => {
    await page.goto('/');
    const footer = page.locator('.site-footer');
    const navLinks = await footer
      .locator('.site-footer__nav a:visible')
      .allTextContents();
    expect(navLinks.map((t) => t.trim())).toEqual([
      'Catálogo',
      'Promociones',
      'Cotizar',
      'Cómo funciona',
      'Nosotros',
      'Contacto',
      'Visítanos',
    ]);
    await expect(footer.locator('.site-footer__nav')).toHaveCount(2);
    await expect(footer.getByText('Inicio', { exact: true })).toHaveCount(0);

    await expect(footer.getByText('[NIT — confirmar]')).toHaveCount(0);
    await expect(footer.getByText('@alcusasv · @alcusaes')).toHaveCount(0);
    await expect(footer.getByText('© 2026 ALCUSA. Todos los derechos reservados.')).toBeVisible();

    // El CTA de WhatsApp lleva su icono en todos los anchos (ya no hay regla "solo movil").
    const wa = footer.getByRole('link', { name: /Cotizar por WhatsApp/ });
    await expect(wa).toBeVisible();
    await expect(wa).toContainText('7680-2410');
    await expect(wa.locator('svg')).toBeVisible();
  });

  test('footer layout: 3 columnas en desktop (marca | Explora | Alcusa), apilado en movil; pago/redes/legal debajo', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const footer = page.locator('.site-footer');
    await footer.scrollIntoViewIfNeeded();
    const cols = footer.locator('.site-footer__row > .site-footer__col');
    await expect(cols).toHaveCount(3);
    const boxes = await cols.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    const row = (await footer.locator('.site-footer__row').boundingBox())!;
    const meta = (await footer.locator('.site-footer__meta').boundingBox())!;
    const bottom = (await footer.locator('.site-footer__bottom').boundingBox())!;

    if (testInfo.project.name === 'desktop1920') {
      // una sola fila: mismas "y" (rejilla), orden marca -> Explora -> Alcusa de izquierda a derecha
      expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThanOrEqual(1);
      expect(Math.abs(boxes[1].y - boxes[2].y)).toBeLessThanOrEqual(1);
      expect(boxes[0].x).toBeLessThan(boxes[1].x);
      expect(boxes[1].x).toBeLessThan(boxes[2].x);
      // la marca es la columna ancha (1.4fr vs 1fr)
      expect(boxes[0].w).toBeGreaterThan(boxes[1].w);
      expect(Math.abs(boxes[1].w - boxes[2].w)).toBeLessThanOrEqual(1);
      // alineado con el navbar/catalogo: columna de 1240 menos el aire lateral (no se estira a 1920)
      expect(row.width).toBeLessThanOrEqual(1240 - 64 + 1);
    } else {
      // apilado: misma "x", cada columna debajo de la anterior
      expect(Math.abs(boxes[0].x - boxes[1].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(boxes[1].x - boxes[2].x)).toBeLessThanOrEqual(1);
      expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].h - 1);
      expect(boxes[2].y).toBeGreaterThanOrEqual(boxes[1].y + boxes[1].h - 1);
    }
    // en ambos: la fila de columnas va primero; pago/redes y luego legal/copyright
    expect(meta.y).toBeGreaterThanOrEqual(row.y + row.height - 1);
    expect(bottom.y).toBeGreaterThanOrEqual(meta.y + meta.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
