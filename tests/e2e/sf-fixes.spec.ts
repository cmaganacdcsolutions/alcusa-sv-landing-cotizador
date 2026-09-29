import { expect, test } from './fixtures';

// SF-fixes slice: logo/nav-link bugfixes, hero category CTAs, gallery
// prev/next controls, sticky top bar, and the Galeria/Footer fidelity
// follow-ups (Instagram caption + handles). New spec file (not shared with
// landing.spec.ts / catalogo-galeria.spec.ts) to avoid merge conflicts.

test.describe('sf-fixes — logo + nav links', () => {
  test('TopBar logo links to / (not the dangling #inicio) and works from /cotizador and /contacto', async ({
    page,
  }) => {
    for (const path of ['/', '/cotizador', '/contacto']) {
      await page.goto(path);
      const href = await page.getByRole('link', { name: 'ALCUSA, inicio' }).first().getAttribute('href');
      expect(href).toBe('/');
    }

    await page.goto('/cotizador');
    await page.getByRole('link', { name: 'ALCUSA, inicio' }).first().click();
    await expect(page).toHaveURL('/');
  });

  test('Drawer header brand also links to /', async ({ page }) => {
    await page.goto('/contacto');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    const href = await page.getByRole('link', { name: 'ALCUSA, inicio' }).last().getAttribute('href');
    expect(href).toBe('/');
  });

  test('drawer nav links close the drawer and scroll to the section on /', async ({ page }) => {
    await page.goto('/');
    const drawer = page.locator('#drawer-panel');
    const targets: Array<[string, string]> = [
      ['Catálogo', '#modelos'],
      ['Cómo funciona', '#proceso'],
      ['Proyectos reales', '#galeria'],
    ];
    for (const [label, id] of targets) {
      await page.getByRole('button', { name: 'Abrir menú' }).click();
      await drawer.getByRole('link', { name: label, exact: true }).click();
      await expect(drawer).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator(id)).toBeInViewport();
    }
  });

  test('drawer nav links navigate from /cotizador back to / and land on the section', async ({ page }) => {
    await page.goto('/cotizador');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.locator('#drawer-panel').getByRole('link', { name: 'Proyectos reales', exact: true }).click();
    await expect(page).toHaveURL(/\/#galeria$/);
    await expect(page.locator('#galeria')).toBeInViewport();
  });

  test('footer nav links scroll to each section on / and navigate from /contacto', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('.site-footer__nav');
    for (const [label, id] of [
      ['Catálogo', '#modelos'],
      ['Cómo funciona', '#proceso'],
      ['Proyectos reales', '#galeria'],
    ] as const) {
      await footer.getByRole('link', { name: label, exact: true }).click();
      await expect(page.locator(id)).toBeInViewport();
    }

    await page.goto('/contacto');
    await page.locator('.site-footer__nav').getByRole('link', { name: 'Catálogo', exact: true }).click();
    await expect(page).toHaveURL(/\/#modelos$/);
    await expect(page.locator('#modelos')).toBeInViewport();
  });

  test('footer nav links have no underline and a visible focus style', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('.site-footer__nav a').first();
    await expect(link).toHaveCSS('text-decoration-line', 'none');
    await link.focus();
    await expect(link).toBeFocused();
  });
});

test.describe('sf-fixes — hero category cards open the cotizador', () => {
  test('"Ventanas" card lands on /cotizador with Ventana preselected', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Ventanas.*desde \$108/i }).click();
    await expect(page).toHaveURL(/\/cotizador\?producto=ventana$/);
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByRole('button', { name: /Ventana Francesa o Bilbao/, pressed: true })).toBeVisible();
  });

  test('"Puertas de jardín" card lands on /cotizador with Puerta de jardín preselected', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Puertas de jardín.*desde \$410/i }).click();
    await expect(page).toHaveURL(/\/cotizador\?producto=jardin$/);
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByRole('button', { name: /Puerta de jardín/, pressed: true })).toBeVisible();
  });

  test('"Puertas de baño" card preselects the recta product (product-chooser decision)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Puertas de baño.*desde \$222/i }).click();
    await expect(page).toHaveURL(/\/cotizador\?producto=recta$/);
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByRole('button', { name: /Puerta de baño recta/, pressed: true })).toBeVisible();
  });

  test('a "Cotizar este modelo" catálogo CTA opens the cotizador hydrated with that product', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('#modelos li', { hasText: 'Puerta con bisagra' });
    await card.getByRole('link', { name: 'Cotizar este modelo' }).click();
    await expect(page).toHaveURL(/\/cotizador\?producto=bisagra$/);
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByRole('button', { name: /Puerta con bisagra/, pressed: true })).toBeVisible();
  });
});

test.describe('sf-fixes — sticky top bar', () => {
  const sizes = [
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 },
  ];

  test('top bar stays pinned to the viewport top after scrolling, at every breakpoint', async ({ page }) => {
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.goto('/');
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForTimeout(50);
      const box = await page.locator('.top-bar').boundingBox();
      expect(box?.y).toBe(0);
      await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();
    }
  });
});

test.describe('sf-fixes — galería lightbox prev/next + strip controls', () => {
  test('prev/next buttons and the n/6 counter move through the photos', async ({ page }) => {
    await page.goto('/');
    await page.locator('#galeria').scrollIntoViewIfNeeded();
    await page.locator('[data-lightbox-trigger]').first().click();

    const lightbox = page.locator('#galeria-lightbox');
    const counter = page.locator('#galeria-lightbox-counter');
    await expect(counter).toHaveText('1 / 6');

    await lightbox.getByRole('button', { name: 'Foto siguiente' }).click();
    await expect(counter).toHaveText('2 / 6');

    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('3 / 6');

    await page.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText('2 / 6');

    await lightbox.getByRole('button', { name: 'Foto anterior' }).click();
    await expect(counter).toHaveText('1 / 6');
  });

  test('swiping the lightbox image moves to the next photo', async ({ page }) => {
    await page.goto('/');
    await page.locator('#galeria').scrollIntoViewIfNeeded();
    await page.locator('[data-lightbox-trigger]').first().click();

    const box = page.locator('#galeria-lightbox');
    await box.dispatchEvent('touchstart', {
      touches: [{ identifier: 0, clientX: 300, clientY: 300 }],
    });
    await box.dispatchEvent('touchend', {
      changedTouches: [{ identifier: 0, clientX: 100, clientY: 300 }],
    });

    await expect(page.locator('#galeria-lightbox-counter')).toHaveText('2 / 6');
  });

  test('mobile snap-scroll strip has prev/next controls that scroll the strip', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop1920', 'strip nav is mobile-only; desktop uses the masonry');
    await page.goto('/');
    const strip = page.locator('#galeria-strip');
    await strip.scrollIntoViewIfNeeded();
    const before = await strip.evaluate((el) => el.scrollLeft);
    await page.getByRole('button', { name: 'Foto siguiente' }).first().click();
    await page.waitForTimeout(400);
    const after = await strip.evaluate((el) => el.scrollLeft);
    expect(after).toBeGreaterThan(before);
  });

  test('desktop hides the mobile strip prev/next controls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1920', 'desktop-only assertion');
    await page.goto('/');
    await expect(page.locator('.galeria__strip-nav').first()).toBeHidden();
  });
});

test.describe('sf-fixes — galería + footer fidelity follow-ups', () => {
  test('galería caption links out to Instagram', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: /Ver más fotos en Instagram/i });
    await expect(link).toHaveAttribute('href', 'https://instagram.com/alcusasv');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
  });

  test('footer shows the Instagram/TikTok handles next to the social icons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('@alcusasv · @alcusaes')).toBeVisible();
  });
});
