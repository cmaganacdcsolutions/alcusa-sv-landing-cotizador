import { expect, test } from './fixtures';

// /nosotros: seccion "Nuestra direccion ejecutiva" (gráfica oficial de Alcusa, 2026-10-14), texto textual.
const DIRECCION = [
  { name: 'Rutilio Galdámez', role: 'Economista, Fundador y Visionario' },
  { name: 'Francisco Galdámez', role: 'Director de Operaciones y Logística' },
  { name: 'Ricardo Galdámez', role: 'Director Ejecutivo, Mercadeo y Ventas' },
];

test.describe('nosotros: direccion ejecutiva', () => {
  test('#direccion va entre Valores y Confianza, con H2, nombres y cargos en orden', async ({
    page,
  }) => {
    await page.goto('/nosotros');
    const section = page.locator('#direccion');
    await expect(
      section.getByRole('heading', { level: 2, name: 'Nuestra dirección ejecutiva' }),
    ).toBeVisible();
    await expect(section.getByRole('heading', { level: 3 })).toHaveText(
      DIRECCION.map((d) => d.name),
    );
    await expect(section.locator('.nos__role')).toHaveText(DIRECCION.map((d) => d.role));
    const order = await page.evaluate(() => {
      const pos = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().top + window.scrollY : -1;
      };
      return [pos('#valores'), pos('#direccion'), pos('.nos__trust')];
    });
    expect(order[0]).toBeGreaterThan(0);
    expect(order[1]).toBeGreaterThan(order[0]);
    expect(order[2]).toBeGreaterThan(order[1]);
  });

  test('3 retratos cargan, con alt, y la pagina conserva sus invariantes', async ({
    page,
  }) => {
    await page.goto('/nosotros');
    const imgs = page.locator('#direccion img:not([aria-hidden="true"])');
    await expect(imgs).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const img = imgs.nth(i);
      await img.scrollIntoViewIfNeeded();
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
        .toBeGreaterThan(0);
      expect(((await img.getAttribute('alt')) ?? '').trim().length).toBeGreaterThan(0);
      expect(await img.getAttribute('width')).toBe('456');
      expect(await img.getAttribute('height')).toBe('342');
    }
    await expect(page.locator('main')).not.toContainText(/pendiente/i);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test('sin overflow horizontal; en movil la card es horizontal (retrato a la izquierda del texto)', async ({
    page,
  }) => {
    await page.goto('/nosotros');
    await page.locator('#direccion').scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const vw = page.viewportSize()?.width ?? 0;
    const card = page.locator('#direccion .nos__person').first();
    const photo = await card.locator('.nos__portrait').boundingBox();
    const text = await card.locator('.nos__who').boundingBox();
    if (!photo || !text) throw new Error('sin caja de retrato/texto');
    if (vw < 768) {
      expect(photo.x + photo.width).toBeLessThanOrEqual(text.x + 1);
      expect(photo.width).toBeLessThanOrEqual(130);
      expect(
        Math.abs(photo.y + photo.height / 2 - (text.y + text.height / 2)),
      ).toBeLessThan(photo.height);
    } else if (vw >= 1024) {
      expect(photo.x + photo.width).toBeLessThanOrEqual(text.x + 1); // escritorio: tambien horizontal
      const h = await page.evaluate(() =>
        ['#valores', '#direccion'].map(
          (s) => document.querySelector(s)?.getBoundingClientRect().height ?? 0,
        ),
      );
      expect(h[1]).toBeLessThanOrEqual(h[0]); // sin saturar: no mas alta que Valores
    }
  });
});
