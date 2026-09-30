// R2: /catalogo index, category and detail pages (boards r04/r05/r06).
// Behaviour + fidelity (computed style vs board values) + no horizontal
// overflow at 360/390/412/768/1366/1920. Never opens wa.me (asserts hrefs).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const WIDTHS = [360, 390, 412, 768, 1366, 1920] as const;
const ROUTES = [
  '/catalogo',
  '/catalogo/puertas-de-bano',
  '/catalogo/puertas-de-jardin',
  '/catalogo/ventanas',
  '/catalogo/puertas-de-bano/en-l',
  '/catalogo/puertas-de-jardin/jardin-1-hoja',
  '/catalogo/puertas-de-jardin/jardin-2-fijas-2-corredizas',
  '/catalogo/ventanas/ventana-bilbao',
] as const;

// Sets its own viewports: one project is enough.
// eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop1920', 'sets its own viewports');
});

async function css(page: Page, selector: string, prop: string): Promise<string> {
  return page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

test.describe('catalogo R2: structure and data-driven states', () => {
  test('index: one h1, breadcrumb, 3 cards with chips, gallery at the foot', async ({ page }) => {
    await page.goto('/catalogo');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Todo lo que fabricamos a tu medida');
    await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText('Inicio');
    const cards = page.getByTestId('catalogo-categories').locator('article');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(1).locator('.cat-chip')).toHaveText(['1 hoja', '2 hojas', '3 hojas', 'Más opciones']);
    await expect(page.getByTestId('catalogo-galeria').getByRole('heading', { level: 2 })).toHaveText('Galería de proyectos');
    await expect(cards.nth(0).locator('a')).toHaveAttribute('href', '/catalogo/puertas-de-bano');
  });

  test('bano category: 4 cards in taxonomy order, En L lists its finishes', async ({ page }) => {
    await page.goto('/catalogo/puertas-de-bano');
    const grid = page.getByTestId('catalogo-subcategories');
    await expect(grid.getByRole('heading', { level: 2 })).toHaveText(['Templada 10 mm', 'Rectas', 'En L', 'De bisagra']);
    await expect(grid.locator('.cat-pc__price')).toHaveText(['Desde $672', 'Desde $222', 'Desde $444', 'Desde $253']);
    await expect(grid.locator('.cat-pc').nth(2).locator('.cat-chip')).toHaveText(['Aquaclara', 'Frosted', 'Aquafold']);
  });

  test('jardin category: photo-less cards show the placeholder; Más opciones has 2 advisor rows', async ({ page }) => {
    await page.goto('/catalogo/puertas-de-jardin');
    await expect(page.getByTestId('catalogo-subcategories').getByTestId('foto-proximamente')).toHaveCount(2);
    await expect(page.getByTestId('catalogo-subcategories').getByText('FOTO PRÓXIMAMENTE').first()).toBeVisible();
    const more = page.getByTestId('catalogo-mas-opciones');
    await expect(more.getByRole('heading', { level: 2 })).toHaveText('Más opciones para tu jardín');
    await expect(more.locator('li')).toHaveCount(2);
    const wa = await more.locator('a.cat-wa').first().getAttribute('href');
    expect(wa).toMatch(/^https:\/\/wa\.me\//);
    expect(decodeURIComponent(wa ?? '')).not.toContain('$');
  });

  test('ventanas category: Francesa and Bilbao', async ({ page }) => {
    await page.goto('/catalogo/ventanas');
    await expect(page.getByTestId('catalogo-subcategories').getByRole('heading', { level: 2 })).toHaveText(['Francesa', 'Bilbao']);
  });

  test('detail En L: Aquaclara default, chips switch price and deep link', async ({ page }) => {
    await page.goto('/catalogo/puertas-de-bano/en-l');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Puerta en L');
    const price = page.getByTestId('catalogo-precio');
    await expect(price).toContainText('$444');
    const ctas = page.locator('[data-cta]');
    await expect(ctas.first()).toHaveAttribute('href', '/cotizador?producto=l-aquaclara');
    await page.getByRole('button', { name: 'Frosted' }).click();
    await expect(price).toContainText('$580');
    await expect(page.getByRole('button', { name: 'Frosted' })).toHaveAttribute('aria-pressed', 'true');
    for (const i of [0, 1]) await expect(ctas.nth(i)).toHaveAttribute('href', '/cotizador?producto=l-frosted');
  });

  test('detail without photo renders the placeholder, never a broken image', async ({ page }) => {
    await page.goto('/catalogo/puertas-de-jardin/jardin-1-hoja');
    await expect(page.getByTestId('foto-proximamente')).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(0);
  });

  test('detail advisorOnly: no price, WhatsApp CTA', async ({ page }) => {
    await page.goto('/catalogo/puertas-de-jardin/jardin-1-fijo-3-corredizas');
    await expect(page.getByTestId('catalogo-asesor')).toHaveText('Cotiza con un asesor');
    await expect(page.locator('main')).not.toContainText('$');
    await expect(page.locator('[data-cta]').first()).toHaveAttribute('href', /^https:\/\/wa\.me\//);
  });

  test('no image request fails anywhere in the catalog', async ({ page }) => {
    const bad: string[] = [];
    page.on('response', (r) => {
      if (r.request().resourceType() === 'image' && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
    });
    for (const route of ROUTES) {
      await page.goto(route);
      await page.evaluate(async () => {
        document.querySelectorAll('img').forEach((i) => i.setAttribute('loading', 'eager'));
        await Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => undefined)));
      });
    }
    expect(bad).toEqual([]);
  });

  test('photos use the Foto completa frame: contain, 50% 50%, ratio 1/1 cards', async ({ page }) => {
    await page.goto('/catalogo/puertas-de-bano');
    expect(await css(page, '.cat-pc .photo-frame__img', 'object-fit')).toBe('contain');
    expect(await css(page, '.cat-pc .photo-frame__img', 'object-position')).toBe('50% 50%');
    expect(await css(page, '.cat-pc .photo-frame__ambient', 'opacity')).toBe('0.55');
    const box = await page.locator('.cat-pc .photo-frame').first().boundingBox();
    expect(Math.abs((box?.width ?? 1) - (box?.height ?? 2))).toBeLessThan(1);
  });
});

test.describe('catalogo R2: no horizontal overflow (360/390/412/768/1366/1920)', () => {
  for (const w of WIDTHS) {
    test(`@${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      for (const route of ROUTES) {
        await page.goto(route);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${route} @${w}`).toBeLessThanOrEqual(0);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      }
    });
  }
});

test.describe('catalogo R2: fidelity vs boards (computed style)', () => {
  test('mobile 390 (ios-r04/r05/r06)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/catalogo');
    expect(await css(page, '.cat-h1', 'font-size')).toBe('34px');
    expect(await css(page, '.cat-card', 'border-radius')).toBe('28px');
    expect(await css(page, '.cat-card__title', 'font-size')).toBe('24px');
    expect((await page.locator('.cat-card').first().boundingBox())?.width).toBeCloseTo(342, 0);
    expect((await page.locator('.cat-card .photo-frame').first().boundingBox())?.width).toBeCloseTo(340, 0);
    expect(await css(page, '.cat-btn', 'min-height')).toBe('52px');
    expect((await page.locator('.cat-gallery__item').first().boundingBox())?.width).toBeCloseTo(200, 0);

    await page.goto('/catalogo/puertas-de-bano');
    expect(await css(page, '.cat-pc', 'border-radius')).toBe('20px');
    expect(await css(page, '.cat-pc__title', 'font-size')).toBe('17px');
    expect(await css(page, '.cat-pc__price', 'font-size')).toBe('14px');

    await page.goto('/catalogo/puertas-de-jardin');
    expect((await page.locator('.cat-ph--card').first().boundingBox())?.height).toBeCloseTo(150, 0);

    await page.goto('/catalogo/puertas-de-bano/en-l');
    const frame = await page.locator('.cat-detail__media .photo-frame').first().boundingBox();
    expect((frame?.width ?? 0) / (frame?.height ?? 1)).toBeCloseTo(0.8, 2);
    expect(frame?.width).toBeCloseTo(342, 0);
    expect(await css(page, '.cat-panel .cat-h1', 'font-size')).toBe('32px');
    expect(await css(page, '.cat-price__amount', 'font-size')).toBe('34px');
    expect(await css(page, '.cat-bar', 'position')).toBe('sticky');
    expect(await css(page, '.cat-bar .cat-btn', 'min-height')).toBe('52px');
    expect(await css(page, '.cat-option', 'min-height')).toBe('44px');
    await expect(page.locator('.cat-panel [data-cta]')).toBeHidden();
  });

  test('desktop 1920 (desktop-r04/r05/r06)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/catalogo');
    expect(await css(page, '.cat-h1', 'font-size')).toBe('56px');
    expect(await css(page, '.cat-card__title', 'font-size')).toBe('30px');
    expect((await page.locator('.cat-card').first().boundingBox())?.width).toBeCloseTo(512, 0);
    expect((await page.locator('.cat-card .photo-frame').first().boundingBox())?.height).toBeCloseTo(510, 0);
    expect(await css(page, '.cat-btn', 'min-height')).toBe('56px');
    expect((await page.locator('.cat-gallery__item').first().boundingBox())?.width).toBeCloseTo(469, 0);

    await page.goto('/catalogo/puertas-de-bano');
    expect(await page.locator('.cat-pc').count()).toBe(4);
    expect((await page.locator('.cat-pc').nth(0).boundingBox())?.width).toBeCloseTo(376, 0);
    expect(await css(page, '.cat-pc__title', 'font-size')).toBe('20px');

    await page.goto('/catalogo/puertas-de-jardin');
    expect((await page.locator('.cat-pc').nth(0).boundingBox())?.width).toBeCloseTo(512, 0);
    const ph = await page.locator('.cat-ph--card').first().boundingBox();
    expect(ph?.width).toBeCloseTo(ph?.height ?? 0, 0);

    await page.goto('/catalogo/puertas-de-bano/en-l');
    const frame = await page.locator('.cat-detail__media .photo-frame').first().boundingBox();
    expect(frame?.width).toBeCloseTo(880, 0);
    expect(frame?.height).toBeCloseTo(880, 0);
    const panel = page.locator('.cat-panel');
    expect(await css(page, '.cat-panel', 'position')).toBe('sticky');
    expect(await css(page, '.cat-panel', 'top')).toBe('112px');
    expect((await panel.boundingBox())?.width).toBeCloseTo(656, 0);
    expect(await css(page, '.cat-panel .cat-h1', 'font-size')).toBe('48px');
    expect(await css(page, '.cat-price__amount', 'font-size')).toBe('48px');
    expect(await css(page, '.cat-panel [data-cta]', 'min-height')).toBe('60px');
    await expect(page.locator('.cat-bar')).toBeHidden();
  });
});

test.describe('catalogo R2: a11y (axe, wcag2a/aa)', () => {
  for (const w of [390, 1920] as const) {
    test(`@${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      for (const route of ROUTES) {
        await page.goto(route);
        const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(res.violations.map((v) => `${route}: ${v.id}`), `${route} @${w}`).toEqual([]);
      }
    });
  }
});
