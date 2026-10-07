import { onlyVisualProjects, settleForScreenshot } from '../support/visual';
import { expect, test } from './fixtures';

// Visual baselines of the landing: hero and the "Promociones" section (390 and 1920).
// The e2e build freezes "today" (2026-10-15) so the seeded promos are always live.
test.describe('visual - home', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
  test.beforeEach(({}, testInfo) => {
    test.skip(!onlyVisualProjects(testInfo), 'baselines solo en 390 (ios390) y 1920 (desktop1920)');
  });

  test('hero', async ({ page }) => {
    await page.goto('/');
    await settleForScreenshot(page);
    await expect(page).toHaveScreenshot('hero.png', { timeout: 15_000 });
  });

  test('promociones', async ({ page }) => {
    await page.goto('/');
    await settleForScreenshot(page);
    const promos = page.locator('#promociones');
    await promos.scrollIntoViewIfNeeded();
    await expect(promos.locator('.promo-card')).toHaveCount(3);
    await settleForScreenshot(page);
    await expect(promos).toHaveScreenshot('promociones.png', { timeout: 15_000 });
  });
});
