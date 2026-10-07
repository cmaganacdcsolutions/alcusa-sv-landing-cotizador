import { test, expect } from './fixtures';

// R3 — Landing: Promociones del mes + navbar (sin drawer, sin CTA de catalogo).
// Fidelidad contra 02-design/boards/revision-2026-09-29/{ios,android,desktop}-r01/r02/r00.
// El seed vence el 31-oct-2026: el e2e corre contra dist-e2e/* (hoy congelado al 2026-10-15,
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
  test('sin galeria ni caja CTA de catalogo; orden: inicio, catalogo, promociones, proceso', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#modelos')).toHaveCount(0);
    await expect(page.locator('#galeria')).toHaveCount(0);
    await expect(page.locator('a[data-catalogo-cta]')).toHaveCount(0);
    await expect(page.locator('.catcta__box')).toHaveCount(0);
    for (const id of ['inicio', 'catalogo', 'promociones', 'proceso']) {
      await expect(page.locator(`#${id}`), `#${id} presente`).toHaveCount(1);
    }
    // orden en el documento (compareDocumentPosition: el siguiente debe SEGUIR al anterior)
    const inOrder = await page.evaluate((ids) => {
      const els = ids.map((id) => document.getElementById(id));
      return els.every((el, i) => i === 0 || !!(els[i - 1]!.compareDocumentPosition(el!) & Node.DOCUMENT_POSITION_FOLLOWING));
    }, ['inicio', 'catalogo', 'promociones', 'proceso']);
    expect(inOrder).toBe(true);
  });

  test('/#modelos (alias viejo) aterriza en /#catalogo', async ({ page }) => {
    await page.goto('/#modelos');
    await expect(page).toHaveURL(/\/#catalogo$/);
  });

  test('/#catalogo se queda en el inicio con #catalogo a la vista', async ({ page }) => {
    await page.goto('/#catalogo');
    await expect(page).toHaveURL(/\/#catalogo$/);
    await expect(page.locator('#catalogo')).toBeInViewport();
    const top = await page.locator('#catalogo').evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThan(await page.evaluate(() => window.innerHeight));
  });

  test('promos: 3 vigentes, datos y enlaces al cotizador', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('#promociones .promo-card');
    await expect(cards).toHaveCount(3);
    const first = cards.first();
    // flyers oficiales: sin precio anterior => sin insignia, sin "Antes", sin "Ahorras"
    await expect(first.locator('.promo-card__badge')).toHaveCount(0);
    await expect(first.locator('s')).toHaveCount(0);
    await expect(first.locator('.promo-card__ahorras')).toHaveCount(0);
    await expect(first.locator('.promo-card__title')).toHaveText('Puerta Aquaclara');
    await expect(first.locator('.promo-card__rules li')).toHaveCount(5);
    await expect(first.locator('.photo-frame__img')).toHaveAttribute('alt', /\$222\.00.*1\.85 m/);
    expect(await first.locator('.photo-frame__img').evaluate((el) => getComputedStyle(el).objectFit)).toBe('contain');
    await expect(first.locator('.promo-card__ahora')).toHaveText('Ahora $222');
    await expect(first.locator('.promo-card__chip')).toContainText('Vigente hasta el 31 de octubre');
    await expect(first.locator('[data-promo-cta]')).toHaveAttribute('href', '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=claro');
    await expect(first.locator('[data-promo-cta]')).toHaveText(/Cotizar esta promo/);
    const hrefs = await cards.locator('[data-promo-cta]').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
    expect(hrefs).toEqual([
      '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=claro',
      '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=nevado',
      '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=aquafold',
    ]);
  });
});

test.describe('landing R3 — tarjeta compacta (pulido 2026-10-06)', () => {
  for (const vp of VIEWPORTS) {
    test(`promo card @${vp.w}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/');
      const sec = page.locator('#promociones');
      await expect(sec).toBeAttached();
      const card = sec.locator('.promo-card').first();
      const css = (loc: ReturnType<typeof page.locator>, prop: string) =>
        loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

      // card: misma familia que .pcard (clara, radio-lg, borde suave de 1px)
      expect(await css(card, 'border-top-width')).toBe('1px');
      expect(await css(card, 'border-top-left-radius')).toBe('20px');
      // flyer 9:16 completo (sin recorte) en marco 4:5, contain
      const fb = (await card.locator('.photo-frame').boundingBox())!;
      expect(Math.abs(fb.width / fb.height - 4 / 5)).toBeLessThan(0.01);
      expect(await css(card.locator('.photo-frame__img'), 'object-fit')).toBe('contain');
      expect(await css(card.locator('.photo-frame__img'), 'object-position')).toBe('50% 50%');
      await expect(card.locator('.promo-card__badge')).toHaveCount(0);
      // banda de precio delgada en rojo promo
      const band = card.locator('.promo-card__band');
      expect(await css(band, 'background-color')).toBe(PROMO);
      expect(await css(card.locator('.promo-card__ahora'), 'font-size')).toBe('24px');
      expect(await css(card.locator('.promo-card__antes'), 'font-size')).toBe('13px');
      // cuerpo compacto
      expect(await css(card.locator('.promo-card__title'), 'font-size')).toBe('16px');
      expect(await css(card.locator('.promo-card__desc'), 'font-size')).toBe('13px');
      expect(await css(card.locator('.promo-card__chip'), 'background-color')).toBe('rgb(255, 240, 232)');
      // CTA pastilla de 44px
      const cta = card.locator('[data-promo-cta]');
      expect(Math.round((await cta.boundingBox())!.height)).toBe(44);
      expect(await css(cta, 'background-color')).toBe('rgb(7, 59, 146)');
      expect(await css(cta, 'border-top-left-radius')).toBe('9999px');
      // anchos: >=900 rejilla de 3 (contenedor 1240, aire 32 y hueco 24 desde 1024); <900 carrusel de 88% (tope 360)
      const cbx = (await card.boundingBox())!;
      if (vp.w >= 1366) expect(Math.round(cbx.width)).toBe(Math.round((1240 - 64 - 48) / 3));
      if (vp.w < 900) expect(Math.abs(cbx.width - Math.min(vp.w * 0.88, 360))).toBeLessThan(1.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  }

  test('@390 carrusel: scroll-snap, la tarjeta ocupa 88% y asoma la siguiente', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const list = page.locator('#promociones .promos__list');
    expect(await list.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x mandatory');
    const second = (await page.locator('#promociones .promo-card').nth(1).boundingBox())!;
    // 390 - (16 de aire + 343 de tarjeta + 12 de hueco) = 19
    expect(Math.abs(390 - second.x - 19)).toBeLessThan(1.5);
  });
});

test.describe('navbar R3 (sin drawer)', () => {
  test('entradas y orden: Compra YA!, Catalogo, Promociones, Nosotros, Contacto; sin Galeria ni drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const links = page.locator('header[data-nav] nav[aria-label="Principal"] a.nav__deal, header[data-nav] nav[aria-label="Principal"] a.nav__link');
    await expect(links).toHaveText([/Compra YA!/, /Catálogo/, /Promociones/, /Nosotros/, /Contacto/]);
    await expect(links).toHaveCount(5);
    await expect(links.nth(0)).toHaveAttribute('href', '/cotizador?oferta=online10');
    await expect(links.nth(1)).toHaveAttribute('href', '/#catalogo');
    await expect(links.nth(2)).toHaveAttribute('href', '/#promociones');
    await expect(links.nth(3)).toHaveAttribute('href', '/nosotros');
    await expect(links.nth(4)).toHaveAttribute('href', '/contacto');
    await expect(page.locator('header[data-nav] a.nav__cta')).toHaveAttribute('href', '/cotizador');
    await expect(page.locator('header[data-nav] a.nav__wa')).toHaveAttribute('aria-label', 'Escribir por WhatsApp al 7680-2410');
    await expect(page.locator('header[data-nav]')).not.toContainText('Galería');
    await expect(page.locator('header[data-nav]')).not.toContainText('Proyectos reales');
    // el drawer y el boton "Abrir menu" ya no existen
    await expect(page.locator('#drawer-open-btn, #drawer-panel')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Abrir menú/i })).toHaveCount(0);
  });
});
