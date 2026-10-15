import { expect, test } from './fixtures';

// /nosotros: gráfica oficial de la dirección ejecutiva (2026-10-14), mostrada completa dentro de "Quiénes somos".
const NOMBRES = ['Rutilio Galdámez', 'Francisco Galdámez', 'Ricardo Galdámez'];

test.describe('nosotros: direccion ejecutiva (grafica completa)', () => {
  test('#direccion vive dentro de #historia, antes de Misión/Visión, con h3 accesible', async ({ page }) => {
    await page.goto('/nosotros');
    await expect(page.locator('#historia #direccion')).toHaveCount(1);
    await expect(page.locator('section.nos__split ~ section #direccion')).toHaveCount(0);
    await expect(
      page.locator('#direccion').getByRole('heading', { level: 3, name: 'Nuestra dirección ejecutiva' }),
    ).toHaveCount(1);
    const order = await page.evaluate(() => {
      const pos = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().top + window.scrollY : -1;
      };
      return [pos('#historia'), pos('#direccion'), pos('#mision')];
    });
    expect(order[0]).toBeGreaterThan(0);
    expect(order[1]).toBeGreaterThan(order[0]);
    expect(order[2]).toBeGreaterThan(order[1]);
    await expect(page.locator('main')).not.toContainText(/pendiente/i);
  });

  test('la grafica carga, se muestra completa en 16:9 y el alt nombra a los tres', async ({ page }) => {
    await page.goto('/nosotros');
    const img = page.locator('#direccion img');
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    expect(await img.getAttribute('width')).toBe('1600');
    expect(await img.getAttribute('height')).toBe('900');
    const natural = await img.evaluate((el: HTMLImageElement) => el.naturalWidth / el.naturalHeight);
    expect(Math.abs(natural / (16 / 9) - 1)).toBeLessThanOrEqual(0.02);
    const box = await img.boundingBox();
    if (!box) throw new Error('sin caja de imagen');
    expect(Math.abs(box.width / box.height / (16 / 9) - 1)).toBeLessThanOrEqual(0.02);
    expect(await img.evaluate((el) => getComputedStyle(el).objectFit)).not.toBe('cover');
    const alt = (await img.getAttribute('alt')) ?? '';
    for (const n of ['Rutilio', 'Francisco', 'Ricardo']) expect(alt).toContain(n);
  });

  test('lista accesible con nombres y cargos; enlace a la version grande', async ({ page }) => {
    await page.goto('/nosotros');
    const items = page.locator('#direccion figcaption li');
    await expect(items).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(items.nth(i)).toContainText(NOMBRES[i]);
    await expect(items.nth(1)).toContainText('Director de Operaciones y Logística');
    await expect(items.nth(2)).toContainText('Director Ejecutivo, Mercadeo y Ventas');
    const link = page.locator('#direccion a');
    await expect(link).toHaveAttribute('href', /direccion-ejecutiva-1600\.webp$/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('sin overflow horizontal; el hint solo se ve en movil', async ({ page }) => {
    await page.goto('/nosotros');
    await page.locator('#direccion').scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const vw = page.viewportSize()?.width ?? 0;
    const hint = page.locator('#direccion .nos__dir-hint');
    if (vw < 768) await expect(hint).toBeVisible();
    else await expect(hint).toBeHidden();
  });

  test('#historia: una columna (texto, grafica, foto) o dos columnas balanceadas en escritorio', async ({ page }) => {
    const vw = page.viewportSize()?.width ?? 0;
    await page.goto('/nosotros');
    await page.locator('#direccion img').scrollIntoViewIfNeeded();
    const h = await page.evaluate(() => {
      const [l, r] = Array.from(document.querySelectorAll('#historia > *')).map((el) =>
        el.getBoundingClientRect(),
      );
      return { left: l.height, right: r.height, stacked: r.top >= l.bottom - 1 };
    });
    if (vw >= 1024) {
      expect(h.stacked).toBe(false);
      expect(Math.abs(h.left - h.right)).toBeLessThanOrEqual(24);
    } else {
      expect(h.stacked).toBe(true);
    }
  });
});
