import { expect, test } from './fixtures';

// Desktop grid regression: the "TU COTIZACIÓN" aside lost its grid placement
// in the shell rewrite, auto-placed into row 1 and stretched it to its own
// height, which pushed every step's content ~400px below the page title.
test.describe('cotizador — desktop layout', () => {
  test('step content starts right under the page title, aside in its own column', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1920', 'desktop grid only');
    await page.goto('/cotizador');
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
    await page.getByRole('button', { name: /Puerta de baño recta/ }).click();

    const header = await page.locator('.cotizador__header').boundingBox();
    const form = await page.locator('.cotizador__form-col').boundingBox();
    const aside = await page.locator('.cotizador-aside').boundingBox();
    expect(header && form && aside).toBeTruthy();
    expect(form!.y - (header!.y + header!.height)).toBeLessThanOrEqual(48);
    expect(aside!.x).toBeGreaterThanOrEqual(form!.x + form!.width);
    expect(Math.abs(aside!.y - header!.y)).toBeLessThanOrEqual(2);
  });
});

test.describe('drawer — closed state', () => {
  test('the closed drawer and its shadow sit fully off-screen', async ({ page }) => {
    await page.goto('/');
    const box = await page.locator('#drawer-panel').boundingBox();
    expect(box).not.toBeNull();
    // Box-shadow blur is 60px on desktop; keep the panel past it.
    expect(box!.x + box!.width).toBeLessThanOrEqual(-60);
  });
});
