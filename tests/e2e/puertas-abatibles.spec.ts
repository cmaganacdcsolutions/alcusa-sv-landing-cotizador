import { expect, test } from './fixtures';

// Abatibles (2026-10-09): 3 productos solo asesor dentro de "Más opciones para tu jardín" (ya no hay categoria propia) y los bloques
// "Más opciones para tu baño" / "Más opciones para tus ventanas". Nunca abre wa.me (se afirman los href; fixtures.ts aborta la ruta).

const WA_NUMBER = '50376802410';
const ABATIBLES = ['abatible-interior-exterior', 'abatible-oficina-vidrio-fijo', 'abatible-oficina-cerrador'] as const;
const MORE = [
  { section: 'puertas-de-bano', title: 'Más opciones para tu baño', slug: 'templada-10mm-abatible', subject: 'una puerta de baño' },
  { section: 'ventanas', title: 'Más opciones para tus ventanas', slug: 'ventana-bilbao-medio-punto', subject: 'una ventana' },
] as const;

const waPrefix = (subject: string): string => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Hola, quiero cotizar ${subject} `)}`;

// Contenido independiente del viewport: un proyecto basta.
// eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop1920', 'content check');
});

test.describe('abatibles dentro de Puertas de jardín', () => {
  test('el sitio tiene 3 categorías y las 3 abatibles viven en "Más opciones para tu jardín" con CTA a asesor', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#puertas-abatibles')).toHaveCount(0);
    const ids = await page.locator('#catalogo .csec').evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(['puertas-de-bano', 'puertas-de-jardin', 'ventanas']);
    await expect(page.getByRole('navigation', { name: 'Categorías' }).getByRole('link', { name: /abatibles/i })).toHaveCount(0);
    await expect(page.locator('header a[href="/#puertas-abatibles"]')).toHaveCount(0);

    const more = page.locator('#puertas-de-jardin').getByRole('region', { name: 'Más opciones para tu jardín' });
    await expect(more).toBeVisible();
    const moreIds = await more.locator('article.pcard').evaluateAll((els) => els.map((e) => e.id));
    expect(moreIds.slice(-3)).toEqual(ABATIBLES.map((s) => `p-${s}`));
    await expect(more.locator('article.pcard')).toHaveCount(5);

    for (const slug of ABATIBLES) {
      const card = more.locator(`#p-${slug}`);
      await expect(card).toHaveClass(/pcard--advisor/);
      await expect(card.locator('form, select, [role="combobox"]')).toHaveCount(0);
      await expect(card.locator('.pcard__price')).toHaveText('Cotización personalizada');
      await expect(card.locator('a[href*="/cotizador"]')).toHaveCount(0);
      const cta = card.getByRole('link', { name: /Cotizar con un asesor/ });
      const href = (await cta.getAttribute('href'))!;
      expect(href.startsWith(waPrefix('una puerta de jardín')), href).toBe(true);
      await expect(cta).toHaveAttribute('target', '_blank');
      await expect(cta).toHaveAttribute('rel', /noopener/);
    }
  });

  test('hash viejo /#puertas-abatibles lleva a la sección de jardín', async ({ page }) => {
    await page.goto('/#puertas-abatibles');
    await expect(page).toHaveURL(/\/#puertas-de-jardin$/);
    await expect(page.locator('#puertas-de-jardin')).toBeInViewport();
  });
});

test.describe('Más opciones para tu baño y tus ventanas', () => {
  for (const m of MORE) {
    test(`${m.section}: sub-bloque "${m.title}" con la tarjeta solo asesor ${m.slug}`, async ({ page }) => {
      await page.goto('/');
      const more = page.locator(`#${m.section}`).getByRole('region', { name: m.title });
      await expect(more).toBeVisible();
      await expect(more.locator('article.pcard')).toHaveCount(1);
      const card = page.locator(`#p-${m.slug}`);
      await expect(more.locator(`#p-${m.slug}`)).toHaveCount(1);
      await expect(card).toHaveClass(/pcard--advisor/);
      await expect(card.locator('form, select, [role="combobox"]')).toHaveCount(0);
      const href = (await card.getByRole('link', { name: /Cotizar con un asesor/ }).getAttribute('href'))!;
      expect(href.startsWith(waPrefix(m.subject)), href).toBe(true);
    });
  }
});

test.describe('deep links de los slugs nuevos', () => {
  const CASES: readonly (readonly [from: string, hash: string])[] = [
    ['/catalogo/puertas-abatibles', '#puertas-de-jardin'],
    ['/catalogo/puertas-abatibles/abatible-interior-exterior', '#p-abatible-interior-exterior'],
    ['/catalogo/puertas-abatibles/abatible-oficina-vidrio-fijo', '#p-abatible-oficina-vidrio-fijo'],
    ['/catalogo/puertas-abatibles/abatible-oficina-cerrador', '#p-abatible-oficina-cerrador'],
    ['/catalogo/puertas-de-bano/templada-10mm-abatible', '#p-templada-10mm-abatible'],
    ['/catalogo/ventanas/ventana-bilbao-medio-punto', '#p-ventana-bilbao-medio-punto'],
  ];
  for (const [from, hash] of CASES) {
    test(`${from} -> /${hash} y la tarjeta existe`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`^[^#]*/${hash}$`));
      await expect(page.locator(hash)).toHaveCount(1);
    });
  }
});

test.describe('imagenes de los productos nuevos', () => {
  test('ninguna imagen rota ni de 0x0 en las tarjetas nuevas; todas son /images/fotos/', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.querySelectorAll('img').forEach((img) => (img.loading = 'eager')));
    const slugs = [...ABATIBLES, 'templada-10mm-abatible', 'ventana-bilbao-medio-punto'];
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete), undefined, { timeout: 10_000 });
    for (const slug of slugs) {
      const img = page.locator(`#p-${slug} img.photo-frame__img`);
      await expect(img).toHaveCount(1);
      await expect(img).toHaveAttribute('src', `/images/fotos/${slug}-800.webp`);
      await expect(img).not.toHaveAttribute('alt', '');
      const dims = await img.evaluate((el: HTMLImageElement) => ({ nw: el.naturalWidth, nh: el.naturalHeight }));
      expect(dims.nw, `${slug} naturalWidth`).toBeGreaterThan(0);
      expect(dims.nh, `${slug} naturalHeight`).toBeGreaterThan(0);
      await img.scrollIntoViewIfNeeded();
      const box = (await img.boundingBox())!;
      expect(box.width, `${slug} ancho visible`).toBeGreaterThan(0);
      expect(box.height, `${slug} alto visible`).toBeGreaterThan(0);
    }
  });
});
