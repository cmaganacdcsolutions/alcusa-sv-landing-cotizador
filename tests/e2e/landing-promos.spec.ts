import { test, expect } from './fixtures';

// R3 — Landing: Promociones del mes + CTA catalogo + drawer.
// Fidelidad contra 02-design/boards/revision-2026-09-29/{ios,android,desktop}-r01/r02/r00.
// El seed vence el 31-oct-2026: el e2e corre contra dist-e2e/* (hoy congelado al 2026-09-30,
// scripts/build-e2e-fixtures.mjs), asi que no depende de la fecha real.

const VIEWPORTS = [
  { w: 360, h: 780, desktop: false },
  { w: 390, h: 844, desktop: false },
  { w: 412, h: 915, desktop: false },
  { w: 768, h: 1024, desktop: false },
  { w: 1366, h: 768, desktop: true },
  { w: 1920, h: 1080, desktop: true },
] as const;

const PROMO = 'rgb(211, 58, 11)';

test.describe('landing R3 — estructura', () => {
  test('sin grid de catalogo ni galeria; promos + CTA catalogo en el orden del redline', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#modelos')).toHaveCount(0);
    await expect(page.locator('#galeria')).toHaveCount(0);
    const ids = await page.locator('main > section, main > div > section').evaluateAll((els) => els.map((e) => e.id));
    const order = ['inicio', 'promociones', 'catalogo-cta', 'proceso'];
    const idx = order.map((id) => ids.indexOf(id));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    await expect(page.locator('a[data-catalogo-cta]')).toHaveAttribute('href', '/catalogo');
  });

  for (const hash of ['#catalogo', '#galeria', '#modelos']) {
    test(`/${hash} redirige a /catalogo`, async ({ page }) => {
      await page.goto(`/${hash}`);
      await expect(page).toHaveURL(/\/catalogo\/?$/);
    });
  }

  test('promos: 3 vigentes, datos y enlaces al cotizador', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('#promociones .promo-card');
    await expect(cards).toHaveCount(3);
    const first = cards.first();
    await expect(first.locator('.promo-card__badge')).toHaveText('−15%');
    await expect(first.locator('.promo-card__antes s')).toHaveText('Antes $260');
    await expect(first.locator('.promo-card__ahorras')).toHaveText('Ahorras $38');
    await expect(first.locator('.promo-card__ahora')).toHaveText('Ahora $222');
    await expect(first.locator('.promo-card__chip')).toContainText('Vigente hasta el 31 de octubre');
    await expect(first.locator('[data-promo-cta]')).toHaveAttribute('href', '/cotizador?producto=recta');
    await expect(first.locator('[data-promo-cta]')).toHaveText(/Cotizar esta promo/);
    const hrefs = await cards.locator('[data-promo-cta]').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
    expect(hrefs).toEqual([
      '/cotizador?producto=recta',
      '/cotizador?producto=ventana-francesa',
      '/cotizador?producto=jardin-3-hojas',
    ]);
  });
});

test.describe('landing R3 — fidelidad computada (board vs sitio)', () => {
  for (const vp of VIEWPORTS) {
    test(`promo card @${vp.w}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/');
      const sec = page.locator('#promociones');
      await expect(sec).toBeAttached();
      const card = sec.locator('.promo-card').first();
      const css = (loc: ReturnType<typeof page.locator>, prop: string) =>
        loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

      // card
      expect(await css(card, 'border-top-color')).toBe(PROMO);
      expect(await css(card, 'border-top-width')).toBe('2px');
      expect(await css(card, 'border-top-left-radius')).toBe(vp.desktop ? '28px' : '20px');
      expect(await css(card, 'box-shadow')).toContain(vp.desktop ? '0px 16px 40px' : '0px 10px 28px');
      // foto completa 1:1, contain, sin cover
      const frame = card.locator('.photo-frame');
      const fb = (await frame.boundingBox())!;
      expect(Math.abs(fb.width - fb.height)).toBeLessThan(1.5);
      expect(await css(card.locator('.photo-frame__img'), 'object-fit')).toBe('contain');
      expect(await css(card.locator('.photo-frame__img'), 'object-position')).toBe('50% 50%');
      expect(await css(card.locator('.photo-frame__ambient'), 'opacity')).toBe('0.55');
      // badge
      const badge = card.locator('.promo-card__badge');
      expect(await css(badge, 'background-color')).toBe('rgb(255, 210, 63)');
      expect(await css(badge, 'font-size')).toBe(vp.desktop ? '40px' : '28px');
      expect(await css(badge, 'border-top-left-radius')).toBe(vp.desktop ? '16px' : '12px');
      // banda
      const band = card.locator('.promo-card__band');
      expect(await css(band, 'background-color')).toBe(PROMO);
      expect(await css(band, 'padding-left')).toBe(vp.desktop ? '20px' : '16px');
      expect(await css(card.locator('.promo-card__ahora'), 'font-size')).toBe(vp.desktop ? '44px' : '32px');
      expect(await css(card.locator('.promo-card__ahorras'), 'color')).toBe('rgb(168, 42, 4)');
      expect(await css(card.locator('.promo-card__antes'), 'font-size')).toBe(vp.desktop ? '16px' : '14px');
      // cuerpo
      expect(await css(card.locator('.promo-card__title'), 'font-size')).toBe(vp.desktop ? '22px' : '17px');
      expect(await css(card.locator('.promo-card__desc'), 'font-size')).toBe(vp.desktop ? '16px' : '14px');
      expect(await css(card.locator('.promo-card__chip'), 'background-color')).toBe('rgb(255, 240, 232)');
      // CTA
      const cta = card.locator('[data-promo-cta]');
      const cb = (await cta.boundingBox())!;
      expect(Math.round(cb.height)).toBe(vp.desktop ? 56 : 52);
      expect(await css(cta, 'background-color')).toBe('rgb(7, 59, 146)');
      expect(await css(cta, 'border-top-left-radius')).toBe('9999px');

      // anchos
      const cbx = (await card.boundingBox())!;
      if (vp.w === 1920) expect(Math.round(cbx.width)).toBe(512);
      if (vp.w === 1366) expect(Math.round(cbx.width)).toBe(Math.round((1366 - 80 - 64) / 3));
      if (vp.w >= 360 && vp.w <= 412) expect(Math.round(cbx.width)).toBe(300);
      // sin desbordamiento horizontal de pagina
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('@390 carrusel: scroll-snap, asoma la siguiente (54pt = 390-24-300-12 gap) y la pagina no desborda', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const list = page.locator('#promociones .promos__list');
    expect(await list.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x mandatory');
    const second = (await page.locator('#promociones .promo-card').nth(1).boundingBox())!;
    // El redline del board dice 66 (390-24-300) pero omite el gap de 12; el markup del board da 54.
    expect(Math.round(390 - second.x)).toBe(54);
  });

  test('@1920 CTA catalogo: caja primary radio 28, boton blanco 60', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    const btn = page.locator('a[data-catalogo-cta]');
    expect(Math.round((await btn.boundingBox())!.height)).toBe(60);
    const box = page.locator('.catcta__box');
    expect(await box.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(7, 59, 146)');
    expect(await box.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('28px');
    expect(Math.round((await box.boundingBox())!.width)).toBe(1600);
  });
});

test.describe('drawer R3 (r00)', () => {
  test('entradas y orden: Inicio, Catalogo, Promociones, Como funciona, Cotizar, Contacto; sin Galeria', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#drawer-open-btn').click();
    const links = page.locator('#drawer-panel .drawer__links a');
    await expect(links).toHaveText([/Inicio/, /Catálogo/, /Promociones/, /Cómo funciona/, /Cotizar/, /Contacto/]);
    await expect(links.nth(1)).toHaveAttribute('href', '/catalogo');
    await expect(links.nth(2)).toHaveAttribute('href', '/#promociones');
    await expect(links.nth(4)).toHaveAttribute('href', '/cotizador');
    await expect(page.locator('#drawer-panel')).not.toContainText('Proyectos reales');
  });
});
