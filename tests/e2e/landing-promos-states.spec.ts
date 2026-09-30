import type { Page, Locator } from '@playwright/test';
import { test, expect } from './fixtures';

// R3 — Estados de Promociones (r02) sobre fixtures de build (scripts/build-e2e-fixtures.mjs):
//   PORT+0 base   = seed real, 3 promos, "hoy" congelado al 2026-09-30
//   PORT+1 one    = 1 promo  (estado A, tarjeta horizontal)
//   PORT+2 states = 2 promos (estado C titulo largo + estado D sin % ni "Antes")
// Nada depende de la fecha real: el seed vence el 2026-10-31.
// Fidelidad: 02-design/boards/revision-2026-09-29/*-r02-promos-estados.

const PORT = Number(process.env.E2E_PORT ?? 4321);
const ONE = `http://localhost:${PORT + 1}`;
const STATES = `http://localhost:${PORT + 2}`;
const BASE = `http://localhost:${PORT}`;

const css = (loc: Locator, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const box = async (loc: Locator) => (await loc.boundingBox())!;
const open = async (page: Page, url: string, w: number, h = 900) => {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(url);
};

test.describe('promos r02 — estado A: una promo', () => {
  test('@1920 tarjeta horizontal 1600x380, foto 376 1:1, texto, panel de precio 400', async ({ page }) => {
    await open(page, ONE, 1920, 1080);
    const card = page.locator('#promociones .promo-card');
    await expect(card).toHaveCount(1);
    const c = await box(card);
    expect(Math.round(c.width)).toBe(1600);
    expect(Math.round(c.height)).toBe(380);
    expect(await css(card, 'border-top-left-radius')).toBe('28px');
    expect(await css(card, 'border-top-width')).toBe('2px');
    expect(await css(card, 'box-shadow')).toContain('0px 16px 40px');

    const photo = await box(card.locator('.photo-frame'));
    expect(Math.round(photo.width)).toBe(376);
    expect(Math.round(photo.height)).toBe(376);
    expect(await css(card.locator('.photo-frame__img'), 'object-fit')).toBe('contain');
    const badge = card.locator('.promo-card__badge');
    expect(await css(badge, 'font-size')).toBe('40px');
    const bb = await box(badge);
    expect(Math.round(bb.x - photo.x)).toBe(24);
    expect(Math.round(bb.y - photo.y)).toBe(24);

    // texto: padding 48 56, gap 14, centrado vertical
    const text = card.locator('.promo-card__text');
    expect(await css(text, 'padding-top')).toBe('48px');
    expect(await css(text, 'padding-left')).toBe('56px');
    expect(await css(text, 'row-gap')).toBe('14px');
    expect(await css(card.locator('.promo-card__title'), 'font-size')).toBe('36px');
    expect(await css(card.locator('.promo-card__title'), 'line-height')).toBe('44px');
    expect(await css(card.locator('.promo-card__desc'), 'font-size')).toBe('18px');
    expect(await css(card.locator('.promo-card__desc'), 'max-width')).toBe('560px');
    const t = await box(text);
    expect(Math.round(t.x - (photo.x + photo.width))).toBe(0);

    // panel de precio 400 a la derecha, fondo promo
    const panelBg = await card.evaluate((el) => getComputedStyle(el, '::after').backgroundColor);
    expect(panelBg).toBe('rgb(211, 58, 11)');
    const band = await box(card.locator('.promo-card__band'));
    expect(Math.round(band.width)).toBe(400);
    expect(Math.round(c.x + c.width - 2 - (band.x + band.width))).toBe(0);
    expect(await css(card.locator('.promo-card__ahora'), 'font-size')).toBe('56px');
    const cta = card.locator('[data-promo-cta]');
    expect(Math.round((await box(cta)).height)).toBe(56);
    expect(await css(cta, 'background-color')).toBe('rgb(255, 255, 255)');
    expect(await css(cta, 'color')).toBe('rgb(168, 42, 4)');
    expect(await css(cta, 'font-size')).toBe('17px');
    expect(await css(cta, 'white-space')).toBe('nowrap');
  });

  test('@1366 sigue horizontal y la foto es cuadrada', async ({ page }) => {
    await open(page, ONE, 1366, 768);
    const card = page.locator('#promociones .promo-card');
    const photo = await box(card.locator('.photo-frame'));
    expect(Math.abs(photo.width - photo.height)).toBeLessThan(1.5);
    const t = await box(card.locator('.promo-card__text'));
    expect(t.x).toBeGreaterThanOrEqual(photo.x + photo.width - 1);
    expect(Math.round((await box(card)).width)).toBe(1366 - 80);
  });

  test('@768 foto arriba a ancho completo 1:1 y texto abajo', async ({ page }) => {
    await open(page, ONE, 768, 1024);
    const card = page.locator('#promociones .promo-card');
    const c = await box(card);
    const photo = await box(card.locator('.photo-frame'));
    expect(Math.abs(photo.width - photo.height)).toBeLessThan(1.5);
    expect(Math.round(photo.width)).toBe(Math.round(c.width - 4));
    const t = await box(card.locator('.promo-card__title'));
    expect(t.y).toBeGreaterThan(photo.y + photo.height);
  });
});

test.describe('promos r02 — estados C y D (fixtures)', () => {
  for (const w of [390, 768, 1366, 1920]) {
    test(`@${w} estado C: titulo largo tope 2 lineas con title completo`, async ({ page }) => {
      await open(page, STATES, w);
      const card = page.locator('#promociones .promo-card').first();
      const title = card.locator('.promo-card__title');
      await expect(title).toHaveAttribute(
        'title',
        'Puerta de baño corrediza de vidrio templado de 10 mm con perfil negro mate y herrajes premium',
      );
      expect(await css(title, 'overflow')).toBe('hidden');
      const clamp = await title.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-line-clamp'));
      expect(clamp).toBe('2');
      const lh = parseFloat(await css(title, 'line-height'));
      expect((await box(title)).height).toBeLessThanOrEqual(lh * 2 + 1);
      await expect(card.locator('.promo-card__badge')).toHaveText('−15%');
      await expect(card.locator('.promo-card__antes s')).toHaveText('Antes $1,260');
      await expect(card.locator('.promo-card__ahorras')).toHaveText('Ahorras $189');
      await expect(card.locator('.promo-card__ahora')).toHaveText('Ahora $1,071');
      // el boton no se parte ni desborda
      if (w >= 1024) expect(await css(card.locator('[data-promo-cta]'), 'white-space')).toBe('nowrap');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test(`@${w} estado D: sin insignia, sin "Ahorras", sin "Antes"; dice "Precio especial"`, async ({ page }) => {
      await open(page, STATES, w);
      const card = page.locator('#promociones .promo-card').nth(1);
      await expect(card.locator('.promo-card__badge')).toHaveCount(0);
      await expect(card.locator('.promo-card__ahorras')).toHaveCount(0);
      await expect(card.locator('s')).toHaveCount(0);
      await expect(card.locator('.promo-card__antes')).toHaveText('Precio especial');
      await expect(card.locator('.promo-card__ahora')).toHaveText('Ahora $672');
      await expect(card).not.toContainText('Antes');
      // la fila superior conserva el alto del panel: 'Precio especial' es visible
      expect(await card.locator('.promo-card__antes').isVisible()).toBe(true);
    });
  }
});

test.describe('promos r02 — columnas por ancho', () => {
  test('@768 dos promos = 2 columnas del mismo ancho y la misma fila', async ({ page }) => {
    await open(page, STATES, 768, 1024);
    const [a, b] = [await box(page.locator('.promo-card').nth(0)), await box(page.locator('.promo-card').nth(1))];
    expect(Math.round(a.width)).toBe(Math.round((768 - 80 - 32) / 2));
    expect(Math.abs(a.width - b.width)).toBeLessThan(1);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  });

  test('@1366 dos promos = 2 columnas', async ({ page }) => {
    await open(page, STATES, 1366, 768);
    const [a, b] = [await box(page.locator('.promo-card').nth(0)), await box(page.locator('.promo-card').nth(1))];
    expect(Math.round(a.width)).toBe(Math.round((1366 - 80 - 32) / 2));
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(b.x).toBeGreaterThan(a.x + a.width);
  });

  test('@768 tres promos = 2 columnas y la tercera baja a la segunda fila', async ({ page }) => {
    await open(page, BASE, 768, 1024);
    const cards = page.locator('.promo-card');
    await expect(cards).toHaveCount(3);
    const [a, b, c] = [await box(cards.nth(0)), await box(cards.nth(1)), await box(cards.nth(2))];
    expect(Math.round(a.width)).toBe(Math.round((768 - 80 - 32) / 2));
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(c.y).toBeGreaterThan(a.y + a.height - 1);
    expect(Math.abs(c.x - a.x)).toBeLessThan(1);
  });

  test('@1366 tres promos = 3 columnas', async ({ page }) => {
    await open(page, BASE, 1366, 768);
    const cards = page.locator('.promo-card');
    const bs = [await box(cards.nth(0)), await box(cards.nth(1)), await box(cards.nth(2))];
    for (const b of bs) expect(Math.round(b.width)).toBe(Math.round((1366 - 80 - 64) / 3));
    expect(Math.abs(bs[0].y - bs[2].y)).toBeLessThan(1);
    expect(bs[2].x).toBeGreaterThan(bs[1].x);
  });
});
