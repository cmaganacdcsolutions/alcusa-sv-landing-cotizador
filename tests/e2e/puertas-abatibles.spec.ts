import { expect, test } from './fixtures';

// Fotos oficiales (2026-10-08): categoria nueva "Puertas abatibles" (3 productos solo asesor) y los bloques
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

test.describe('categoria Puertas abatibles', () => {
  test('seccion y tab "Puertas abatibles" al final, con sus 3 tarjetas de asesor y CTA de WhatsApp por categoria', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#puertas-abatibles');
    await expect(section.locator('.csec__title')).toHaveText('Puertas abatibles');
    const ids = await page.locator('#catalogo .csec').evaluateAll((els) => els.map((e) => e.id));
    expect(ids[ids.length - 1]).toBe('puertas-abatibles');
    await expect(section.locator('article.pcard').evaluateAll((els) => els.map((e) => e.id))).resolves.toEqual(ABATIBLES.map((s) => `p-${s}`));
    await expect(section.locator('article.pcard.pcard--advisor')).toHaveCount(3);

    const tab = page.getByRole('navigation', { name: 'Categorías' }).getByRole('link', { name: 'Puertas abatibles', exact: true });
    await expect(tab).toHaveCount(1);
    await tab.click();
    await expect(page).toHaveURL(/\/#puertas-abatibles$/);
    await expect(section).toBeInViewport();

    for (const slug of ABATIBLES) {
      const card = page.locator(`#p-${slug}`);
      await expect(card.locator('form, select, [role="combobox"]')).toHaveCount(0);
      await expect(card.locator('.pcard__price')).toHaveText('Cotización personalizada');
      await expect(card.locator('a[href*="/cotizador"]')).toHaveCount(0);
      const cta = card.getByRole('link', { name: /Cotizar con un asesor/ });
      const href = (await cta.getAttribute('href'))!;
      expect(href.startsWith(waPrefix('una puerta abatible')), href).toBe(true);
      await expect(cta).toHaveAttribute('target', '_blank');
      await expect(cta).toHaveAttribute('rel', /noopener/);
    }
  });

  test('entrada "Puertas abatibles" en el navbar apunta a la seccion', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('header a[href="/#puertas-abatibles"]').first();
    await expect(link).toHaveText('Puertas abatibles');
    await expect(link).toHaveAttribute('href', '/#puertas-abatibles');
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
    ['/catalogo/puertas-abatibles', '#puertas-abatibles'],
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
