// Imagenes del catalogo. Las paginas /catalogo/** se eliminaron (ahora redirigen a anclas del inicio, ver
// catalogo-redirects.spec.ts): el catalogo vive en el inicio, una tarjeta por producto (#p-<slug>) con su render.
// Aqui: cada tarjeta tiene su render (nunca "Foto proximamente"), y cada <img> del inicio carga (naturalWidth>0,
// sin 4xx en la red), tiene alt no vacio y width/height explicitos (sin salto de layout).
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Viewport-independent content check: one project is enough.
// eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop1920', 'content check, viewport independent');
});

// El catalogo completo (3 secciones, 9 tarjetas + 2 de "Más opciones para tu jardín" = 11) esta en el inicio.
const ROUTES = ['/'] as const;
const CARD_COUNT = 11;

async function loadAllImages(page: Page): Promise<void> {
  // Lazy images: force eager loading, then wait (bounded) for each to settle.
  await page.evaluate(() => {
    document.querySelectorAll('img').forEach((img) => {
      img.loading = 'eager';
    });
  });
  await page.waitForFunction(
    () => Array.from(document.images).every((img) => img.complete),
    undefined,
    { timeout: 10_000 },
  );
}

test.describe('catálogo del inicio — imágenes', () => {
  test.describe.configure({ timeout: 30_000 });

  test('cada tarjeta del catálogo muestra su render: una foto, nunca el cuadro "Foto próximamente"', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('#catalogo article.pcard');
    await expect(cards).toHaveCount(CARD_COUNT);
    await expect(page.locator('#catalogo .pcard__nophoto')).toHaveCount(0);
    await expect(page.locator('#catalogo .pcard img.photo-frame__img')).toHaveCount(CARD_COUNT);
    for (let i = 0; i < CARD_COUNT; i += 1) {
      await expect(cards.nth(i).locator('img.photo-frame__img')).toHaveCount(1);
    }
  });

  for (const route of ROUTES) {
    test(`every <img> on ${route} loads, has alt`, async ({ page }) => {
      const bad: string[] = [];
      page.on('response', (res) => {
        if (res.request().resourceType() === 'image' && res.status() >= 400) {
          bad.push(`${res.status()} ${res.url()}`);
        }
      });
      await page.goto(route);
      await loadAllImages(page);

      // Only <main>: header/footer logos are brand chrome. aria-hidden ambient blur layers are alt="" by design.
      const report = await page.evaluate(() =>
        Array.from(document.querySelectorAll('main img'))
          .filter((img) => img.getAttribute('aria-hidden') !== 'true')
          .map((el) => {
            const img = el as HTMLImageElement;
            return {
              src: img.currentSrc || img.src,
              alt: (img.getAttribute('alt') ?? '').trim(),
              w: img.getAttribute('width'),
              h: img.getAttribute('height'),
              natural: img.naturalWidth,
            };
          }),
      );
      expect(report.length).toBeGreaterThanOrEqual(CARD_COUNT);
      expect(bad, 'image requests with 4xx/5xx').toEqual([]);
      expect(
        report.filter((i) => i.natural === 0).map((i) => i.src),
        'broken images',
      ).toEqual([]);
      expect(
        report.filter((i) => !i.alt).map((i) => i.src),
        'missing alt',
      ).toEqual([]);
    });

    test(`every <img> on ${route} has explicit width/height`, async ({ page }) => {
      await page.goto(route);
      const missing = await page.evaluate(() =>
        Array.from(document.querySelectorAll('main img'))
          .filter((img) => img.getAttribute('aria-hidden') !== 'true')
          .filter(
            (img) =>
              !(
                Number(img.getAttribute('width')) > 0 &&
                Number(img.getAttribute('height')) > 0
              ),
          )
          .map((img) => (img as HTMLImageElement).src),
      );
      expect(missing, 'missing width/height').toEqual([]);
    });
  }
});
