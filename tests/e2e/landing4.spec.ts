import { expect, test } from './fixtures';

// landing4 slice: same-page Contacto links (navbar + footer) must not full-reload the page, and the
// /contacto webform must stay hydrated throughout. The drawer short-viewport checks ("Síguenos" + social
// icons inside a 1366x768 / 360x640 viewport, 1920x1080 sizing) were retired with the drawer: the navbar
// has no panel, and the footer socials are covered in sf-fixes.spec.ts.

test.describe('landing4 — Contacto from the navbar hydrates the webform', () => {
  test('home → navbar → Contacto lands hydrated and interactive, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Contacto', exact: true }).click();
    await expect(page).toHaveURL(/\/contacto$/);

    const form = page.locator('[data-testid="contact-form-root"]');
    await form.scrollIntoViewIfNeeded();
    await expect(form).toHaveAttribute('data-hydrated', 'true');

    const nameInput = form.locator('input[name="nombre"]');
    await nameInput.fill('Prueba E2E');
    await expect(nameInput).toHaveValue('Prueba E2E');
    await expect(page.getByRole('button', { name: 'Enviar por WhatsApp' })).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe('landing4 — same-page Contacto links do not reload /contacto', () => {
  test('clicking Contacto in the navbar, then in the footer, while already on /contacto never navigates', async ({
    page,
  }) => {
    await page.goto('/contacto');
    await page.evaluate(() => {
      (window as unknown as { __marker: number }).__marker = 1;
    });

    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Contacto', exact: true }).click();
    await expect(page).toHaveURL(/\/contacto$/);
    expect(await page.evaluate(() => (window as unknown as { __marker: number }).__marker)).toBe(1);

    await page.locator('.site-footer__nav').getByRole('link', { name: 'Contacto', exact: true }).click();
    await expect(page).toHaveURL(/\/contacto$/);
    expect(await page.evaluate(() => (window as unknown as { __marker: number }).__marker)).toBe(1);

    const form = page.locator('[data-testid="contact-form-root"]');
    await form.scrollIntoViewIfNeeded();
    await expect(form).toHaveAttribute('data-hydrated', 'true');
  });
});
