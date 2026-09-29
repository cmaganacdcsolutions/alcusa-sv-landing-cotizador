import { expect, test } from './fixtures';

// landing4 slice: (1) drawer short-viewport compaction — "Síguenos" + the
// social icons must stay reachable without relying on scroll at common
// laptop heights; (2) same-page Contacto links (drawer + footer) must not
// full-reload the page, and the /contacto webform must stay hydrated
// throughout.

test.describe('landing4 — drawer fits short viewports without clipping "Síguenos"', () => {
  const sizes = [
    { width: 1366, height: 768 },
    { width: 360, height: 640 },
  ];

  for (const size of sizes) {
    test(`Síguenos label + social icons are inside the ${size.width}x${size.height} viewport`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await page.getByRole('button', { name: 'Abrir menú' }).click();

      const drawer = page.locator('#drawer-panel');
      await expect(drawer).toHaveAttribute('aria-hidden', 'false');
      // The open/close transform transitions (--motion-duration-base, 200ms);
      // wait for the panel to finish sliding in before reading bounding
      // boxes, otherwise a mid-transition frame reads as off-screen.
      await expect
        .poll(async () => (await drawer.boundingBox())?.x)
        .toBeGreaterThanOrEqual(-1);

      const label = drawer.getByText('Síguenos', { exact: true });
      await expect(label).toBeVisible();
      const labelBox = await label.boundingBox();
      expect(labelBox).not.toBeNull();
      expect(labelBox!.y).toBeGreaterThanOrEqual(0);
      expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(size.height);

      const icons = drawer.locator('.drawer__social-icon');
      const count = await icons.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        const box = await icons.nth(i).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
      }
    });
  }

  test('at 1920x1080 the drawer keeps the board (uncompacted) sizing', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menú' }).click();

    const brandImg = page.locator('#drawer-panel .drawer__brand-img');
    const brandBox = await brandImg.boundingBox();
    expect(brandBox).not.toBeNull();
    expect(Math.round(brandBox!.width)).toBe(160);
    expect(Math.round(brandBox!.height)).toBe(90);

    const inicioLink = page.locator('#drawer-panel .drawer__link', { hasText: 'Inicio' });
    const linkBox = await inicioLink.boundingBox();
    expect(linkBox).not.toBeNull();
    expect(linkBox!.height).toBeGreaterThanOrEqual(56);
  });
});

test.describe('landing4 — Contacto from the drawer hydrates the webform', () => {
  test('home → drawer → Contacto lands hydrated and interactive, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.locator('#drawer-panel').getByRole('link', { name: 'Contacto', exact: true }).click();
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
  test('clicking Contacto in the drawer, then in the footer, while already on /contacto never navigates', async ({
    page,
  }) => {
    await page.goto('/contacto');
    await page.evaluate(() => {
      (window as unknown as { __marker: number }).__marker = 1;
    });

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.locator('#drawer-panel').getByRole('link', { name: 'Contacto', exact: true }).click();
    await expect(page.locator('#drawer-panel')).toHaveAttribute('aria-hidden', 'true');
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
