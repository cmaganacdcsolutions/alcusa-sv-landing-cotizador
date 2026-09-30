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

// ---- Measured inline values of the boards (r04/r05/r06) at 390 and 1920 ----
const C = {
  white: 'rgb(255, 255, 255)',
  border: 'rgb(223, 230, 239)',
  borderSoft: 'rgb(231, 225, 214)',
  tint: 'rgb(234, 242, 255)',
  primary: 'rgb(7, 59, 146)',
  link: 'rgb(9, 86, 216)',
  wa: 'rgb(8, 115, 72)',
  ink: 'rgb(16, 33, 61)',
  dashed: 'rgb(111, 156, 255)',
} as const;
const SH = {
  card: 'rgba(16, 33, 61, 0.08) 0px 2px 6px 0px',
  pc: 'rgba(16, 33, 61, 0.06) 0px 1px 2px 0px',
  cta: 'rgba(7, 59, 146, 0.22) 0px 8px 20px 0px',
  ctaWa: 'rgba(8, 115, 72, 0.22) 0px 8px 20px 0px',
  bar: 'rgba(16, 33, 61, 0.06) 0px -6px 16px 0px',
  hoverMobile: 'rgba(16, 33, 61, 0.12) 0px 6px 16px 0px',
  hoverDesktop: 'rgba(16, 33, 61, 0.14) 0px 12px 28px 0px',
} as const;

async function expectCss(page: Page, selector: string, expected: Record<string, string>, nth = 0): Promise<void> {
  const got = await page.locator(selector).nth(nth).evaluate(
    (el, props) => Object.fromEntries(props.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])),
    Object.keys(expected),
  );
  expect(got, selector).toEqual(expected);
}

const card = (radius: string, shadow: string): Record<string, string> => ({
  'border-top-width': '1px',
  'border-top-style': 'solid',
  'border-top-color': C.border,
  'background-color': C.white,
  'border-top-left-radius': radius,
  'box-shadow': shadow,
});

test.describe('catalogo R2: measured board values (r04/r05/r06)', () => {
  test('390: cards, chips, buttons, options, bar, photo shadow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/catalogo');
    await expectCss(page, '.cat-card', card('28px', SH.card));
    await expectCss(page, '.cat-card__body', { 'padding-top': '16px', 'padding-right': '16px', 'padding-bottom': '16px', 'padding-left': '16px', 'row-gap': '8px' });
    await expectCss(page, '.cat-card .cat-chip', { 'padding-top': '6px', 'padding-left': '12px', 'border-top-left-radius': '9999px', 'background-color': C.tint, color: C.primary, 'font-size': '13px', 'font-weight': '600' });
    await expectCss(page, '.cat-card .cat-btn', { 'padding-left': '24px', 'column-gap': '8px', 'border-top-left-radius': '9999px', 'background-color': C.primary, color: C.white, 'box-shadow': SH.cta, 'font-size': '16px', 'font-weight': '700', 'margin-top': '4px' });
    await page.locator('.cat-card').first().hover();
    await expect.poll(() => css(page, '.cat-card', 'box-shadow')).toBe(SH.hoverMobile);

    await page.goto('/catalogo/puertas-de-bano');
    await expectCss(page, '.cat-pc', { ...card('20px', SH.pc), 'margin-left': '24px' });
    await expectCss(page, '.cat-pc__body', { 'padding-top': '16px', 'padding-left': '16px', 'row-gap': '6px' });
    await expectCss(page, '.cat-pc__price', { color: C.primary, 'font-weight': '700' });
    await expectCss(page, '.cat-pc__cta', { color: C.link, 'font-size': '14px', 'font-weight': '600', 'column-gap': '6px', 'min-height': '44px', 'margin-top': '4px' });
    await page.locator('.cat-pc').first().hover();
    await expect.poll(() => css(page, '.cat-pc', 'box-shadow')).toBe(SH.hoverMobile);

    // r06 state A: own back bar INSTEAD of the top bar; photo shadow drawn.
    await page.goto('/catalogo/puertas-de-bano/en-l');
    await expect(page.locator('.top-bar')).toBeHidden();
    await expectCss(page, '.cat-back', { height: '64px', 'padding-left': '12px', 'border-bottom-width': '1px', 'border-bottom-color': C.borderSoft });
    await expectCss(page, '.cat-back__link', { width: '48px', height: '48px', 'border-top-left-radius': '14px', color: C.ink });
    await expectCss(page, '.cat-detail__media .photo-frame', { 'border-top-left-radius': '28px', 'box-shadow': SH.card, 'background-color': 'rgb(246, 243, 237)' });
    await expectCss(page, '.cat-options', { 'column-gap': '8px', 'row-gap': '8px' });
    await expectCss(page, '.cat-option', { 'min-height': '44px', 'padding-left': '16px', 'border-top-left-radius': '9999px', 'border-top-width': '1px', 'border-top-color': C.border, 'background-color': C.white, color: C.ink, 'font-size': '14px', 'font-weight': '600' }, 1);
    await expectCss(page, '.cat-option', { 'border-top-width': '2px', 'border-top-color': C.link, 'background-color': C.tint, color: C.primary }, 0);
    await expectCss(page, '.cat-bar', { 'background-color': C.white, 'border-top-width': '1px', 'border-top-color': C.borderSoft, 'box-shadow': SH.bar, 'padding-left': '24px', 'padding-top': '12px', 'column-gap': '12px' });
    await expectCss(page, '.cat-bar .cat-btn', { 'background-color': C.primary, 'box-shadow': SH.cta, 'border-top-left-radius': '9999px' });

    // r06 state B: NO photo shadow on mobile; WhatsApp CTA + board copy.
    await page.goto('/catalogo/puertas-de-jardin/jardin-2-fijas-2-corredizas');
    // No advisor leaf has a photo yet: inject the frame to measure the --flat rule.
    await expect(page.locator('.cat-detail__media--flat')).toHaveCount(1);
    await page.locator('.cat-detail__media--flat').evaluate((el) => {
      el.insertAdjacentHTML('beforeend', '<div class="photo-frame" id="probe"></div>');
    });
    await expectCss(page, '#probe', { 'box-shadow': 'none', 'border-top-left-radius': '28px' });
    await expectCss(page, '.cat-advisor-box', { 'background-color': C.tint, 'border-top-left-radius': '20px', 'padding-top': '16px', 'column-gap': '12px' });
    await expectCss(page, '.cat-bar .cat-btn', { 'background-color': C.wa, 'box-shadow': SH.ctaWa });
    const wa = await page.locator('.cat-bar .cat-btn').getAttribute('href');
    expect(wa).toBe('https://wa.me/50376802410?text=Hola%2C%20quiero%20cotizar%202%20fijas%20%2B%202%20corredizas');

    // r06 state C: placeholder 342 x 240, dashed.
    await page.goto('/catalogo/puertas-de-jardin/jardin-1-hoja');
    await expectCss(page, '.cat-ph--detail', { height: '240px', 'border-top-left-radius': '28px', 'background-color': C.tint, 'border-top-style': 'dashed', 'border-top-width': '1px', 'border-top-color': C.dashed, 'row-gap': '8px', 'letter-spacing': '0.96px', 'font-size': '12px' });
  });

  test('1920: cards, chips, buttons, options, panel, photo shadow', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/catalogo');
    await expectCss(page, '.cat-card', card('28px', SH.card));
    await expectCss(page, '.cat-card__body', { 'padding-top': '24px', 'padding-right': '28px', 'padding-bottom': '28px', 'padding-left': '28px', 'row-gap': '12px' });
    await expectCss(page, '.cat-card .cat-chip', { 'padding-top': '6px', 'padding-left': '14px', 'background-color': C.tint, color: C.primary, 'font-size': '14px', 'font-weight': '600' });
    await expectCss(page, '.cat-card .cat-btn', { 'min-height': '56px', 'padding-left': '28px', 'column-gap': '10px', 'font-size': '17px', 'font-weight': '700', 'background-color': C.primary, 'box-shadow': SH.cta });
    await page.locator('.cat-card').first().hover();
    await expect.poll(() => css(page, '.cat-card', 'box-shadow')).toBe(SH.hoverDesktop);

    await page.goto('/catalogo/puertas-de-bano');
    await expectCss(page, '.cat-pc', card('20px', SH.pc));
    await expectCss(page, '.cat-pc__body', { 'padding-top': '16px', 'padding-right': '20px', 'padding-bottom': '12px', 'row-gap': '6px' });
    await expectCss(page, '.cat-pc__price', { 'font-size': '16px', color: C.primary });
    await expectCss(page, '.cat-pc__cta', { 'font-size': '15px', color: C.link, 'min-height': '44px', 'column-gap': '6px' });
    await expectCss(page, '.cat-pc .cat-chip', { 'padding-left': '12px', 'font-size': '13px', 'background-color': C.tint });
    await page.locator('.cat-pc').first().hover();
    await expect.poll(() => css(page, '.cat-pc', 'box-shadow')).toBe(SH.hoverDesktop);

    // r06: top bar back, panel values, photo shadow in state A and B.
    await page.goto('/catalogo/puertas-de-bano/en-l');
    await expect(page.locator('.top-bar')).toBeVisible();
    await expect(page.locator('.cat-back')).toBeHidden();
    await expectCss(page, '.cat-detail__media .photo-frame', { 'border-top-left-radius': '28px', 'box-shadow': SH.card });
    await expectCss(page, '.cat-panel', { ...card('28px', SH.card), 'padding-top': '40px', 'padding-left': '40px', 'row-gap': '16px' });
    await expectCss(page, '.cat-options', { 'column-gap': '10px' });
    await expectCss(page, '.cat-option', { 'min-height': '44px', 'padding-left': '18px', 'font-size': '15px', 'border-top-width': '1px', 'background-color': C.white }, 1);
    await expectCss(page, '.cat-option', { 'border-top-width': '2px', 'border-top-color': C.link, 'background-color': C.tint, color: C.primary }, 0);
    await expectCss(page, '.cat-panel [data-cta]', { 'min-height': '60px', 'padding-left': '32px', 'column-gap': '10px', 'font-size': '18px', 'background-color': C.primary, 'box-shadow': SH.cta, color: C.white });

    await page.goto('/catalogo/puertas-de-jardin/jardin-2-fijas-2-corredizas');
    await page.locator('.cat-detail__media--flat').evaluate((el) => {
      el.insertAdjacentHTML('beforeend', '<div class="photo-frame" id="probe"></div>');
    });
    await expectCss(page, '#probe', { 'box-shadow': SH.card });
    await expectCss(page, '.cat-panel [data-cta]', { 'background-color': C.wa, 'box-shadow': SH.ctaWa });

    await page.goto('/catalogo/puertas-de-jardin/jardin-1-hoja');
    await expectCss(page, '.cat-ph--detail', { 'border-top-left-radius': '28px', 'background-color': C.tint, 'border-top-style': 'dashed', 'row-gap': '12px', 'font-size': '14px' });
  });

  test('ratioLg: detail photo 4/5 below 900, 1/1 from 900, without !important', async ({ page }) => {
    await page.setViewportSize({ width: 899, height: 900 });
    await page.goto('/catalogo/puertas-de-bano/en-l');
    expect(await css(page, '.cat-detail__media .photo-frame', 'aspect-ratio')).toBe('4 / 5');
    await page.setViewportSize({ width: 900, height: 900 });
    expect(await css(page, '.cat-detail__media .photo-frame', 'aspect-ratio')).toBe('1 / 1');
  });
});
