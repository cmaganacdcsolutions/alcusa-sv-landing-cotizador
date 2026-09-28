import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

// Slice 0 smoke test: the placeholder home renders, the h1 is visible, and
// axe reports zero serious/critical violations. Later slices add the
// drawer/cotizador-step/contact-form scans this file's name promises
// (ADR-006).
test.describe('a11y — home (Slice 0 smoke)', () => {
  test('loads with a visible h1 and no serious/critical a11y violations', async ({
    page,
  }) => {
    await page.goto('/');

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Sitio en construcción');

    const results = await new AxeBuilder({ page }).analyze();
    const seriousOrCritical = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );

    expect(seriousOrCritical).toEqual([]);
  });
});
