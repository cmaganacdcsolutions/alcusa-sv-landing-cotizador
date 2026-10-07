import { expect, test } from './fixtures';

// SF-fixes slice: logo/nav-link bugfixes, promo CTAs and footer fidelity follow-ups.
// Reescrito contra el navbar fijo + footer nuevos (no hay drawer, ni top bar, ni galeria,
// ni caja CTA de catalogo; el catalogo vive en /#catalogo). New spec file (not shared with
// landing.spec.ts / catalogo-galeria.spec.ts) to avoid merge conflicts.

test.describe('sf-fixes — logo + nav links', () => {
  test('navbar logo links to / (not the dangling #inicio) and works from /cotizador and /contacto', async ({
    page,
  }) => {
    for (const path of ['/', '/cotizador', '/contacto']) {
      await page.goto(path);
      const href = await page
        .getByRole('link', { name: 'ALCUSA, inicio' })
        .first()
        .getAttribute('href');
      expect(href).toBe('/');
    }

    await page.goto('/cotizador');
    await page.getByRole('link', { name: 'ALCUSA, inicio' }).first().click();
    await expect(page).toHaveURL('/');
  });

  test('navbar "Promociones" scrolls to #promociones on /', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Promociones', exact: true })
      .click();
    await expect(page).toHaveURL(/\/#promociones$/);
    await expect(page.locator('#promociones')).toBeInViewport();
  });

  test('navbar "Catálogo" stays on / and lands on #catalogo (el catálogo vive en el inicio)', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Catálogo', exact: true })
      .click();
    await expect(page).toHaveURL(/\/#catalogo$/);
    await expect(page.locator('#catalogo')).toBeInViewport();
  });

  test('navbar "Promociones" navigates from /contacto back to / and lands on the section', async ({
    page,
  }) => {
    await page.goto('/contacto');
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Promociones', exact: true })
      .click();
    await expect(page).toHaveURL(/\/#promociones$/);
    await expect(page.locator('#promociones')).toBeInViewport();
  });

  test('/cotizador compact navbar "Volver al catálogo" returns to /#catalogo', async ({ page }) => {
    await page.goto('/cotizador');
    await page.getByRole('link', { name: 'Volver al catálogo' }).click();
    await expect(page).toHaveURL(/\/#catalogo$/);
    await expect(page.locator('#catalogo')).toBeInViewport();
  });

  test('footer "Cómo funciona" scrolls to #proceso on /', async ({ page }) => {
    await page.goto('/');
    await page
      .locator('.site-footer__nav')
      .getByRole('link', { name: 'Cómo funciona', exact: true })
      .click();
    await expect(page).toHaveURL(/\/#proceso$/);
    await expect(page.locator('#proceso')).toBeInViewport();
  });

  test('footer "Catálogo" navigates from /contacto back to /#catalogo', async ({ page }) => {
    await page.goto('/contacto');
    await page
      .locator('.site-footer__nav')
      .getByRole('link', { name: 'Catálogo', exact: true })
      .click();
    await expect(page).toHaveURL(/\/#catalogo$/);
    await expect(page.locator('#catalogo')).toBeInViewport();
  });

  test('footer nav links have no underline and a visible focus style', async ({
    page,
  }) => {
    await page.goto('/');
    const link = page.locator('.site-footer__nav a').first();
    await expect(link).toHaveCSS('text-decoration-line', 'none');
    await link.focus();
    await expect(link).toBeFocused();
  });
});

test.describe('sf-fixes — promo CTAs open the cotizador (R3: reemplazan las tarjetas de categoría del hero)', () => {
  for (const [slug, producto] of [
    ['recta', 'recta'],
  ] as const) {
    test(`promo "${slug}" CTA lands on /cotizador hydrated with the product`, async ({ page }) => {
      await page.goto('/');
      await page.locator(`[data-promo-cta][href*="producto=${producto}"]`).first().click();
      await expect(page).toHaveURL((url) => url.pathname.replace(/\/$/, '') === '/cotizador' && url.searchParams.get('producto') === producto);
      await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    });
  }

  test('promo "recta" preselects Puerta de baño recta and lands on Medidas', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-promo-cta][href*="producto=recta"]').first().click();
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    // The promo link carries paso=medidas + color + vidrio: product already chosen, no selector step.
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await expect(page.locator('section[aria-labelledby="step1-heading"]').getByText('Puerta de baño recta', { exact: true })).toBeVisible();
  });
});

test.describe('sf-fixes — footer fidelity follow-ups', () => {
  test('footer keeps the three social links + the phone and drops the handles line (board r01)', async ({
    page,
  }) => {
    await page.goto('/');
    const footer = page.locator('.site-footer');
    await expect(footer.getByRole('link', { name: /Instagram @alcusasv/ })).toBeVisible();
    await expect(footer.getByRole('link', { name: /TikTok @alcusaes/ })).toBeVisible();
    await expect(footer.getByRole('link', { name: /YouTube/ })).toBeVisible();
    await expect(footer.getByText('@alcusasv · @alcusaes')).toHaveCount(0);
    // el telefono fijo vive en el footer (el navbar ya no lo lleva)
    const phone = footer.getByRole('link', { name: '2278-2460', exact: true });
    await expect(phone).toBeVisible();
    await expect(phone).toHaveAttribute('href', 'tel:+50322782460');
  });
});
