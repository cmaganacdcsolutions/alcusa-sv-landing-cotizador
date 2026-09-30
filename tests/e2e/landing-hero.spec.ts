import { test, expect } from './fixtures';

// R3 — Hero r01. Fidelidad: 02-design/boards/revision-2026-09-29/{ios,android,desktop}-r01-landing-promos
// + specs/image-frame-rule.md (hero: 4:3 movil, 3:2 desktop, degradado solo tercio inferior).

const VIEWPORTS = [
  { w: 390, h: 844, desktop: false },
  { w: 412, h: 915, desktop: false },
  { w: 1366, h: 768, desktop: true },
  { w: 1920, h: 1080, desktop: true },
] as const;

for (const vp of VIEWPORTS) {
  test(`hero @${vp.w}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/');
    const hero = page.locator('#inicio');
    const css = (sel: string, prop: string) =>
      hero.locator(sel).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

    // sin tarjetas de categoria, sin WhatsApp/confianza/rating (no estan en el board)
    await expect(hero.locator('.hero__category-card')).toHaveCount(0);
    await expect(hero.locator('a[href*="wa.me"]')).toHaveCount(0);

    // H1
    expect(await css('h1', 'font-size')).toBe(vp.desktop ? (vp.w >= 1600 ? '88px' : '72px') : '34px');
    expect(parseFloat(await css('h1', 'line-height'))).toBeCloseTo(vp.desktop ? (vp.w >= 1600 ? 96 : 80) : 39.1, 1);
    expect(await css('h1', 'font-weight')).toBe('600');

    // botones
    const primary = hero.locator('[data-hero-cta="cotizar"]');
    const secondary = hero.locator('[data-hero-cta="catalogo"]');
    await expect(primary).toHaveText(/Cotizar ahora/);
    await expect(primary).toHaveAttribute('href', '/cotizador');
    await expect(secondary).toHaveText('Ver catálogo');
    await expect(secondary).toHaveAttribute('href', '/catalogo');
    const pb = (await primary.boundingBox())!;
    const sb = (await secondary.boundingBox())!;
    expect(Math.round(pb.height)).toBe(vp.desktop ? 60 : 52);
    expect(await css('[data-hero-cta="cotizar"]', 'background-color')).toBe('rgb(7, 59, 146)');
    expect(await css('[data-hero-cta="cotizar"]', 'box-shadow')).toContain('0px 8px 20px');
    expect(await css('[data-hero-cta="catalogo"]', 'background-color')).toBe('rgb(255, 255, 255)');
    expect(await css('[data-hero-cta="catalogo"]', 'border-top-color')).toBe('rgb(223, 230, 239)');
    expect(await css('[data-hero-cta="catalogo"]', 'color')).toBe('rgb(7, 59, 146)');
    expect(await css('[data-hero-cta="cotizar"]', 'font-size')).toBe(vp.desktop ? '18px' : '16px');
    if (vp.desktop) {
      expect(Math.round(sb.x - (pb.x + pb.width))).toBe(16);
      expect(Math.round(pb.y)).toBe(Math.round(sb.y));
    } else {
      expect(Math.round(sb.y - (pb.y + pb.height))).toBe(12);
      expect(Math.round(pb.width)).toBe(vp.w - 48);
    }

    // figura: marco PhotoFrame con ratio por breakpoint
    const frame = hero.locator('.photo-frame');
    const fb = (await frame.boundingBox())!;
    const ratio = vp.desktop ? 3 / 2 : 4 / 3;
    expect(Math.abs(fb.width / fb.height - ratio)).toBeLessThan(0.01);
    if (vp.w === 390) {
      expect(Math.round(fb.width)).toBe(342);
      expect(Math.round(fb.height)).toBe(257);
    }
    if (vp.w === 412) expect(Math.round(fb.width)).toBe(364);
    if (vp.w === 1920) {
      expect(Math.round(fb.width)).toBe(944);
      expect(Math.round(fb.height)).toBe(629);
      expect(Math.round(fb.x + fb.width)).toBe(1920);
    }
    expect(await css('.photo-frame__img', 'object-fit')).toBe('contain');
    expect(await css('.photo-frame__img', 'object-position')).toBe('50% 50%');
    expect(await css('.photo-frame__ambient', 'opacity')).toBe('0.55');
    expect(await css('.photo-frame__ambient', 'filter')).toContain('blur(24px)');
    expect(await css('.photo-frame', 'background-color')).toBe('rgb(246, 243, 237)');
    expect(await css('.hero__media', 'border-top-left-radius')).toBe('28px');
    expect(await css('.hero__media', 'border-top-right-radius')).toBe(vp.desktop ? '0px' : '28px');
    expect(await css('.hero__media', 'box-shadow')).toContain(vp.desktop ? '0px 16px 40px' : '0px 2px 6px');

    // degradado solo en el tercio inferior (transparent 60% -> .45 100%), z 2
    const grad = await css('.hero__grad', 'background-image');
    expect(grad).toContain('rgba(16, 33, 61, 0.45) 100%');
    expect(grad).toMatch(/60%/);
    expect(await css('.hero__grad', 'z-index')).toBe('2');

    // figcaption pildora
    const cap = hero.locator('figcaption');
    await expect(cap).toHaveText('Ventana Bilbao · a tu medida');
    expect(await css('figcaption', 'font-size')).toBe(vp.desktop ? '15px' : '12px');
    expect(await css('figcaption', 'font-weight')).toBe('600');
    expect(await css('figcaption', 'border-top-left-radius')).toBe('9999px');
    expect(await css('figcaption', 'z-index')).toBe('2');
    const cb = (await cap.boundingBox())!;
    const inset = vp.desktop ? 32 : 16;
    expect(Math.round(cb.x - fb.x)).toBe(inset);
    expect(Math.round(fb.y + fb.height - (cb.y + cb.height))).toBe(inset);

    // sin desbordamiento horizontal
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('hero @1920 bloque de texto 784 x min 596 y kicker con regla', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  const intro = (await page.locator('.hero__intro').boundingBox())!;
  expect(Math.round(intro.height)).toBeGreaterThanOrEqual(596);
  const kicker = page.locator('.hero__kicker');
  expect(await kicker.evaluate((el) => getComputedStyle(el).fontSize)).toBe('14px');
  const rule = (await page.locator('.hero__kicker-rule').boundingBox())!;
  expect([Math.round(rule.width), Math.round(rule.height)]).toEqual([32, 2]);
  // el texto no invade la figura
  const h1 = (await page.locator('#hero-title').boundingBox())!;
  const fig = (await page.locator('.hero__photo').boundingBox())!;
  expect(h1.x + h1.width).toBeLessThanOrEqual(fig.x + 1);
});
