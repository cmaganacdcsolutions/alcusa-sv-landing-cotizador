import { expect, test } from './fixtures';

// /nosotros (reacomodo 2026-10-14): hero -> Dirección Ejecutiva (gráfica completa) -> Quiénes somos (lema + 2 fotos del
// taller) -> Misión/Visión en una fila -> Valores.
const NOMBRES = ['Rutilio Galdámez', 'Francisco Galdámez', 'Ricardo Galdámez'];
const LEMA = 'Más de 39 años transformando espacios con calidad, confianza e innovación.';

test.describe('nosotros: estructura', () => {
  test('orden: hero, Dirección Ejecutiva, Quiénes somos, Misión/Visión, Valores', async ({ page }) => {
    await page.goto('/nosotros');
    await expect(page.getByRole('heading', { level: 1, name: 'Nosotros' })).toBeVisible();
    await expect(page.locator('#direccion').getByRole('heading', { level: 2, name: 'Dirección Ejecutiva' })).toBeVisible();
    const tops = await page.evaluate(() => {
      const pos = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().top + window.scrollY : -1;
      };
      return ['#nos-title', '#direccion', '#historia', '#mision', '#valores'].map(pos);
    });
    expect(tops[0]).toBeGreaterThan(0);
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    await expect(page.locator('main')).not.toContainText(/pendiente/i);
  });

  test('el lema vive en Quiénes somos y no en el hero', async ({ page }) => {
    await page.goto('/nosotros');
    await expect(page.locator('#historia')).toContainText(LEMA);
    await expect(page.locator('.nos__hero')).not.toContainText(LEMA);
    await expect(page.getByText(LEMA)).toHaveCount(1);
  });
});

test.describe('nosotros: direccion ejecutiva (grafica completa)', () => {
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
    // Tamaño real: ocupa el ancho del contenedor de la sección (a 1920, el contenedor de 1240 menos nada).
    const vw = page.viewportSize()?.width ?? 0;
    const sec = await page.locator('#direccion').evaluate((el) => {
      const cs = getComputedStyle(el);
      return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    });
    expect(Math.abs(box.width - sec)).toBeLessThanOrEqual(2);
    if (vw >= 1920) expect(box.width).toBeGreaterThanOrEqual(1000);
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
});

test.describe('nosotros: fotos del taller y Misión/Visión', () => {
  test('dos fotos del taller: fila justificada, sin bandas ni recorte, llenan el contenedor', async ({ page }) => {
    await page.goto('/nosotros');
    const cards = page.locator('#historia .nos__photo');
    await expect(cards).toHaveCount(2);
    const ratios = [3 / 2, 3 / 4];
    for (let i = 0; i < 2; i++) {
      const img = cards.nth(i).locator('img');
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
      const natural = await img.evaluate((el: HTMLImageElement) => el.naturalWidth / el.naturalHeight);
      expect(Math.abs(natural / ratios[i] - 1)).toBeLessThanOrEqual(0.02);
      const ib = await img.boundingBox();
      const cb = await cards.nth(i).boundingBox();
      if (!ib || !cb) throw new Error('sin caja de foto');
      expect(Math.abs(ib.width / ib.height / ratios[i] - 1)).toBeLessThanOrEqual(0.02);
      // Sin bandas: la imagen ocupa la tarjeta (menos el borde de 1px).
      expect(Math.abs(cb.width - ib.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(cb.height - ib.height)).toBeLessThanOrEqual(2);
    }
    const a = await cards.nth(0).boundingBox();
    const b = await cards.nth(1).boundingBox();
    const box = await page.locator('#historia').evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight) };
    });
    if (!a || !b) throw new Error('sin caja de foto');
    const vw = page.viewportSize()?.width ?? 0;
    if (vw >= 768) {
      expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
      expect(a.x).toBeLessThan(b.x);
      expect(Math.abs(a.x - box.left)).toBeLessThanOrEqual(2);
      expect(Math.abs(b.x + b.width - box.right)).toBeLessThanOrEqual(2);
    } else {
      expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 1);
    }
  });

  test('Misión y Visión: misma fila, misma altura y llenan el contenedor desde 768', async ({ page }) => {
    await page.goto('/nosotros');
    const m = await page.locator('#mision').boundingBox();
    const v = await page.locator('#vision').boundingBox();
    if (!m || !v) throw new Error('sin caja de Misión/Visión');
    const box = await page.locator('.nos__mv').evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight) };
    });
    const vw = page.viewportSize()?.width ?? 0;
    if (vw >= 768) {
      expect(Math.abs(m.y - v.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.height - v.height)).toBeLessThanOrEqual(1);
      expect(m.x).toBeLessThan(v.x);
      expect(Math.abs(m.x - box.left)).toBeLessThanOrEqual(2);
      expect(Math.abs(v.x + v.width - box.right)).toBeLessThanOrEqual(2);
      expect(m.width).toBeLessThanOrEqual((box.right - box.left) * 0.52);
    } else {
      expect(v.y).toBeGreaterThanOrEqual(m.y + m.height - 1);
    }
  });

  test('sin foto en Misión/Visión', async ({ page }) => {
    await page.goto('/nosotros');
    await expect(page.locator('.nos__mv img')).toHaveCount(0);
  });
});
