import { expect, test } from './fixtures';

// Categorias nuevas sin fotos ni precios (2026-10-14): placeholders visibles + CTA a WhatsApp.
const SECTIONS = [
  { id: 'espejos', msg: 'Hola, quiero cotizar espejos.' },
  { id: 'zarandas', msg: 'Hola, quiero cotizar zarandas.' },
  { id: 'fachadas-comerciales', msg: 'Hola, quiero cotizar fachadas comerciales.' },
] as const;

test.describe('categorias nuevas del catalogo (placeholders)', () => {
  test('las 3 secciones van en orden despues de Ventanas', async ({ page }) => {
    await page.goto('/');
    const ids = await page.locator('#catalogo > section.csec').evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(['puertas-de-bano', 'puertas-de-jardin', 'ventanas', ...SECTIONS.map((s) => s.id)]);
  });

  for (const s of SECTIONS) {
    test(`#${s.id}: 3 tarjetas pendientes sin imagen y CTA a WhatsApp`, async ({ page }) => {
      await page.goto('/');
      const sec = page.locator(`section#${s.id}`);
      const cards = sec.locator('.pcard');
      await expect(cards).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        const card = cards.nth(i);
        await expect(card).toContainText('Imagen pendiente');
        await expect(card).toContainText('Modelo por confirmar');
        await expect(card).toContainText('Precio pendiente');
        await expect(card.locator('img')).toHaveCount(0);
      }
      const cta = sec.getByRole('link', { name: 'Cotizar con un asesor' });
      await expect(cta).toHaveCount(1);
      const href = (await cta.getAttribute('href')) ?? '';
      expect(href).toMatch(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//);
      expect(new URL(href).searchParams.get('text')).toBe(s.msg);
      await expect(sec.locator('a[href*="/cotizador"]')).toHaveCount(0);
    });
  }

  test('/#espejos hace scroll a la seccion', async ({ page }) => {
    await page.goto('/#espejos');
    await expect(page.locator('#espejos')).toBeInViewport();
  });

  test('sin overflow horizontal a 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
