import type { Page, Locator } from '@playwright/test';
import { test, expect } from './fixtures';

// R3 — Estados de Promociones (r02) sobre fixtures de build (scripts/build-e2e-fixtures.mjs):
//   PORT+0 base   = seed real, 3 promos, "hoy" congelado al 2026-10-15
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

test.describe('promos r02 — estado A: una promo (tarjeta compacta)', () => {
  for (const [w, h, width] of [
    [1920, 1080, 376],
    [1366, 768, 376],
    [768, 1024, 360],
  ] as const) {
    test(`@${w} una promo: una sola tarjeta de ${width} px, flyer completo 4:5 y panel de precio`, async ({ page }) => {
      await open(page, ONE, w, h);
      const card = page.locator('#promociones .promo-card');
      await expect(card).toHaveCount(1);
      const c = await box(card);
      expect(Math.round(c.width)).toBe(width);
      expect(await css(card, 'border-top-left-radius')).toBe('20px');
      const photo = await box(card.locator('.photo-frame'));
      expect(Math.abs(photo.width / photo.height - 4 / 5)).toBeLessThan(0.01);
      expect(await css(card.locator('.photo-frame__img'), 'object-fit')).toBe('contain');
      expect(await css(card.locator('.promo-card__ahora'), 'font-size')).toBe('24px');
      const cta = card.locator('[data-promo-cta]');
      expect(Math.round((await box(cta)).height)).toBe(44);
      expect(await css(cta, 'background-color')).toBe('rgb(7, 59, 146)');
      expect(await css(cta, 'white-space')).toBe('nowrap');
    });
  }
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
  test('@768 dos promos: carrusel de tarjetas del mismo ancho en la misma fila', async ({ page }) => {
    await open(page, STATES, 768, 1024);
    const [a, b] = [await box(page.locator('.promo-card').nth(0)), await box(page.locator('.promo-card').nth(1))];
    expect(Math.round(a.width)).toBe(360);
    expect(Math.abs(a.width - b.width)).toBeLessThan(1);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  });

  for (const w of [1920, 1366, 1024]) {
    test(`@${w} dos promos = 2 columnas de 376 px, misma fila y mismo ancho`, async ({ page }) => {
      await open(page, STATES, w, 900);
      const cards = page.locator('.promo-card');
      await expect(cards).toHaveCount(2);
      const [a, b] = [await box(cards.nth(0)), await box(cards.nth(1))];
      expect(Math.round(a.width)).toBe(376);
      expect(Math.abs(a.width - b.width)).toBeLessThan(1);
      expect(Math.abs(a.y - b.y)).toBeLessThan(1);
      expect(b.x).toBeGreaterThan(a.x + a.width);
    });
  }

  test('@768 tres promos = carrusel: las tres en una fila', async ({ page }) => {
    await open(page, BASE, 768, 1024);
    const cards = page.locator('.promo-card');
    await expect(cards).toHaveCount(3);
    const [a, b, c] = [await box(cards.nth(0)), await box(cards.nth(1)), await box(cards.nth(2))];
    expect(Math.round(a.width)).toBe(360);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(Math.abs(a.y - c.y)).toBeLessThan(1);
    expect(c.x).toBeGreaterThan(b.x);
  });

  test('@1366 tres promos = 3 columnas de 376 px en el contenedor de 1240', async ({ page }) => {
    await open(page, BASE, 1366, 768);
    const cards = page.locator('.promo-card');
    const bs = [await box(cards.nth(0)), await box(cards.nth(1)), await box(cards.nth(2))];
    for (const b of bs) expect(Math.round(b.width)).toBe(Math.round((1240 - 64 - 48) / 3));
    expect(Math.abs(bs[0].y - bs[2].y)).toBeLessThan(1);
    expect(bs[2].x).toBeGreaterThan(bs[1].x);
  });
});
