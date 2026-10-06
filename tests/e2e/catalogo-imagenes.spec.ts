// assets-oficiales: official product images in /catalogo/**. Gallery counts + every <img>
// loads (naturalWidth>0, no 4xx in network), has a non-empty alt and explicit width/height.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Viewport-independent content check: one project is enough.
// eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop1920', 'content check, viewport independent');
});

const ROUTES = [
  '/catalogo/',
  '/catalogo/puertas-de-bano/',
  '/catalogo/puertas-de-jardin/',
  '/catalogo/ventanas/',
  '/catalogo/puertas-de-bano/en-l/',
  '/catalogo/puertas-de-jardin/jardin-1-hoja/',
  '/catalogo/puertas-de-jardin/jardin-2-hojas/',
  '/catalogo/ventanas/ventana-bilbao/',
  '/catalogo/ventanas/ventana-francesa/',
] as const;

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

test.describe('catálogo — imágenes oficiales', () => {
  test.describe.configure({ timeout: 30_000 });

  test('puertas de jardín renders 8 gallery images', async ({ page }) => {
    await page.goto('/catalogo/puertas-de-jardin/');
    await expect(
      page.getByTestId('catalogo-galeria').locator('img.photo-frame__img'),
    ).toHaveCount(8);
  });

  test('jardín 1 hoja renders 1 gallery image (hoja-b moved to the category gallery)', async ({ page }) => {
    await page.goto('/catalogo/puertas-de-jardin/jardin-1-hoja/');
    await expect(
      page.getByTestId('catalogo-galeria').locator('img.photo-frame__img'),
    ).toHaveCount(1);
  });

  test('jardin-2-fijas-2-corredizas has no official photo yet: placeholder, no <img>', async ({ page }) => {
    await page.goto('/catalogo/puertas-de-jardin/jardin-2-fijas-2-corredizas/');
    await expect(page.getByTestId('foto-proximamente')).toBeVisible();
    await expect(page.locator('main img.photo-frame__img')).toHaveCount(0);
  });

  test('ventana francesa renders 2 gallery images', async ({ page }) => {
    await page.goto('/catalogo/ventanas/ventana-francesa/');
    await expect(
      page.getByTestId('catalogo-galeria').locator('img.photo-frame__img'),
    ).toHaveCount(2);
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
      expect(report.length).toBeGreaterThan(0);
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
