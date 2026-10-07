import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';


// ContactForm hydrates `client:visible` (async, on intersection) — wait for
// the marker before driving inputs so the fill isn't lost to a not-yet-
// mounted controlled component re-rendering back to its empty initial state.
async function waitForFormReady(page: Page): Promise<void> {
  const form = page.locator('[data-testid="contact-form-root"]');
  await form.scrollIntoViewIfNeeded();
  await expect(form).toHaveAttribute('data-hydrated', 'true');
}

// #contacto section (T9.1) + webform (T9.2) + footer (T9.3), slice S9.
// Never clicks the WhatsApp link — asserts hrefs only (ADR-006);
// fixtures.ts also aborts wa.me/wompi network routes as an independent guard.
test.describe('contacto — info block + socials', () => {
  test('social row links to the exact 3 handles', async ({ page }) => {
    await page.goto('/contacto');
    await expect(
      page.getByRole('link', { name: 'Instagram @alcusasv' }).first(),
    ).toHaveAttribute('href', 'https://instagram.com/alcusasv');
    await expect(
      page.getByRole('link', { name: 'TikTok @alcusaes' }).first(),
    ).toHaveAttribute('href', 'https://tiktok.com/@alcusaes');
    await expect(
      page.getByRole('link', { name: 'YouTube @alcusaelsalvador8209' }).first(),
    ).toHaveAttribute('href', 'https://youtube.com/@alcusaelsalvador8209');
  });

  test('WhatsApp quick link in the info block is a bare wa.me URL', async ({
    page,
  }, testInfo) => {
    await page.goto('/contacto');
    // ios-08/android-08 show "7680-2410"; desktop-08 shows "+503 7680-2410"
    // (~L49) — two nodes swapped by CSS per breakpoint, same href.
    const label = testInfo.project.name === 'desktop1920' ? '+503 7680-2410' : '7680-2410';
    const href = await page.getByRole('link', { name: label, exact: true }).getAttribute('href');
    expect(href).toBe('https://wa.me/50376802410');
  });

  test('hours show the official schedule; email is the official address', async ({ page }) => {
    await page.goto('/contacto');
    // /contacto repite el horario en el bloque de info y en la seccion #visitanos: se acota al bloque de info.
    const info = page.getByTestId('contacto-info-list');
    await expect(info.getByText('Lunes a viernes: 7:30 a. m. – 5:00 p. m.')).toBeVisible();
    await expect(info.getByText('Sábados: 7:00 a. m. – 12:00 m.')).toBeVisible();
    await expect(info.getByText('Domingos: cerrado')).toBeVisible();
    await expect(page.getByText('[HORARIO — confirmar]')).toHaveCount(0);
    await expect(page.locator('a[href="tel:+50325637742"]')).toHaveCount(0);
    await expect(page.getByText('[CORREO — confirmar]')).toHaveCount(0);
    const mail = page.locator('a[href="mailto:administracion@alcusa.com.sv"]');
    await expect(mail).toBeVisible();
    await expect(mail).toHaveText('administracion@alcusa.com.sv');
    // The address must fit its box at phone width (no horizontal overflow).
    const fits = await mail.evaluate((a) => {
      const box = a.closest('li')!.getBoundingClientRect();
      const r = a.getBoundingClientRect();
      return r.right <= box.right + 1 && document.documentElement.scrollWidth <= window.innerWidth;
    });
    expect(fits).toBe(true);
  });

  test('the 4 info boxes (WhatsApp/Teléfonos/Horario/Correo) share one parent, in that order', async ({
    page,
  }) => {
    await page.goto('/contacto');
    const list = page.getByTestId('contacto-info-list');
    const items = list.locator('> li');
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toContainText('WhatsApp');
    await expect(items.nth(1)).toContainText('Teléfonos');
    await expect(items.nth(2)).toContainText('Horario');
    await expect(items.nth(3)).toContainText('Correo');
  });

  test('layout order: info list, then the map, then the 3 social cards', async ({ page }) => {
    await page.goto('/contacto');
    const info = page.locator('.contacto__info');
    const children = info.locator('> *');
    const classes = await children.evaluateAll((els) => els.map((el) => el.className));
    const listIdx = classes.findIndex((c) => c.includes('contacto__list'));
    const mapIdx = classes.findIndex((c) => c.includes('contacto__map'));
    const socialIdx = classes.findIndex((c) => c.includes('contacto__social'));
    expect(listIdx).toBeGreaterThanOrEqual(0);
    expect(mapIdx).toBeGreaterThan(listIdx);
    expect(socialIdx).toBeGreaterThan(mapIdx);
  });

  test('the map is a real embedded iframe with an accessible title', async ({ page }) => {
    await page.goto('/contacto');
    const iframe = page.getByTestId('contacto-map-iframe');
    await expect(iframe).toBeVisible();
    await expect(iframe).toHaveAttribute('title', 'Mapa de ALCUSA, taller en Ciudad Merliot');
    await expect(iframe).toHaveAttribute('loading', 'lazy');
    const src = await iframe.getAttribute('src');
    expect(src).toContain('google.com/maps');
    expect(src).toContain('output=embed');
    await expect(
      page.getByRole('link', { name: /Ver ubicación en el mapa/ }),
    ).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=ALCUSA+Calle+El+Pedregal+Ciudad+Merliot',
    );
  });

  test('the 3 social cards are visible below the map, each with a non-empty icon', async ({
    page,
  }) => {
    await page.goto('/contacto');
    const cards = page.getByTestId('contacto-social-grid').locator('> a');
    await expect(cards).toHaveCount(3);
    for (const name of ['Instagram', 'TikTok', 'YouTube']) {
      await expect(cards.filter({ hasText: name })).toBeVisible();
    }
  });

  test('desktop: the 3 social cards form a single row (1x3 grid, not stacked)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1920', 'desktop-08 only draws the named-card grid at >=1024');
    await page.goto('/contacto');
    const cards = page.getByTestId('contacto-social-grid').locator('> a');
    await expect(cards).toHaveCount(3);
    const tops = await cards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(tops[0]).toBe(tops[1]);
    expect(tops[1]).toBe(tops[2]);
  });

  test('every info/map/social icon renders a visible, non-empty stroked svg', async ({ page }) => {
    await page.goto('/contacto');
    // Some icons are breakpoint-conditional (mobile-only social cards drop
    // the arrow glyph per ios-08/android-08 ~L45-48; the Teléfonos icon
    // swaps between two board-literal paths per breakpoint, desktop-08
    // ~L50) — CSS-hidden at the current viewport, so only the ones actually
    // rendered here are asserted.
    const icons = page.locator(
      '.contacto__list svg, .contacto__map svg, .contacto__social svg',
    );
    const count = await icons.count();
    expect(count).toBeGreaterThan(0);
    let visibleCount = 0;
    for (let i = 0; i < count; i++) {
      const icon = icons.nth(i);
      if (!(await icon.isVisible())) continue;
      visibleCount++;
      const box = await icon.boundingBox();
      expect(box?.width).toBeGreaterThan(0);
      expect(box?.height).toBeGreaterThan(0);
      const stroke = await icon.evaluate((el) => getComputedStyle(el).stroke);
      expect(stroke).not.toBe('none');
    }
    expect(visibleCount).toBeGreaterThan(0);
  });
});

test.describe('contacto — webform lifecycle', () => {
  test('inputs show the boards’ exact placeholder copy (desktop-08 ~L98-124)', async ({
    page,
  }) => {
    await page.goto('/contacto');
    await expect(page.getByLabel('Nombre')).toHaveAttribute('placeholder', 'Tu nombre');
    await expect(page.getByLabel('Teléfono')).toHaveAttribute('placeholder', '7680-2410');
    await expect(page.getByLabel('Mensaje')).toHaveAttribute(
      'placeholder',
      'Cuéntanos medidas aproximadas, ubicación o cualquier duda.',
    );
  });

  test('"prefer the cotizador" note links to /cotizador', async ({ page }) => {
    await page.goto('/contacto');
    await expect(
      page.getByRole('link', { name: 'Usa el cotizador' }),
    ).toHaveAttribute('href', '/cotizador');
  });

  test('empty state: submit is disabled with no name/phone', async ({ page }) => {
    await page.goto('/contacto');
    await expect(
      page.getByRole('button', { name: 'Enviar por WhatsApp' }),
    ).toBeDisabled();
    await expect(
      page.getByText('Completa tu nombre y teléfono para enviar.'),
    ).toBeVisible();
  });

  test('error state: invalid phone shows the inline helper text', async ({ page }) => {
    await page.goto('/contacto');
    await waitForFormReady(page);
    await page.getByLabel('Nombre').fill('María');
    await page.getByLabel('Teléfono').fill('777');
    await expect(page.getByRole('alert')).toHaveText(
      'Ingresa un teléfono de 8 dígitos, por ejemplo 7680-2410.',
    );
    await expect(page.getByLabel('Teléfono')).toHaveAttribute('aria-invalid', 'true');
    // Still not ready — a disabled button, never a real link.
    await expect(
      page.getByRole('button', { name: 'Enviar por WhatsApp' }),
    ).toBeDisabled();
  });

  test('success: valid name + phone enables a link that builds the exact §2.9 message', async ({
    page,
  }) => {
    await page.goto('/contacto');
    await waitForFormReady(page);
    await page.getByLabel('Nombre').fill('María');
    await page.getByLabel('Teléfono').fill('77778888');
    await page
      .getByLabel('Producto de interés')
      .selectOption('Ventana Francesa o Bilbao');
    await page.getByLabel('Mensaje').fill('Cotización urgente');

    const link = page.getByRole('link', { name: 'Enviar por WhatsApp' });
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toBe(
      'https://wa.me/50376802410?text=' +
        encodeURIComponent(
          'Hola ALCUSA, soy María (77778888). Me interesa: Ventana Francesa o Bilbao. Cotización urgente',
        ),
    );
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('producto/mensaje are optional: link still builds once nombre+telefono are valid', async ({
    page,
  }) => {
    await page.goto('/contacto');
    await waitForFormReady(page);
    await page.getByLabel('Nombre').fill('Luis');
    await page.getByLabel('Teléfono').fill('77778888');

    const link = page.getByRole('link', { name: 'Enviar por WhatsApp' });
    const href = await link.getAttribute('href');
    expect(href).toBe(
      'https://wa.me/50376802410?text=' +
        encodeURIComponent('Hola ALCUSA, soy Luis (77778888). Me interesa: Otro. '),
    );
  });
});

test.describe('footer — quick links + legal', () => {
  // Footer nuevo (navbar spec 01d §3): dos columnas de enlaces, "Explora" y "Alcusa" (sin "Inicio";
  // el logo del navbar ya lleva a /). El catalogo vive en /#catalogo.
  test('quick links: Explora (Catálogo/Promociones/Cotizar/Cómo funciona) + Alcusa (Nosotros/Contacto/Visítanos)', async ({
    page,
  }) => {
    await page.goto('/');
    const explora = page.getByRole('navigation', { name: 'Explora', exact: true });
    const alcusa = page.getByRole('navigation', { name: 'Alcusa', exact: true });
    await expect(explora.getByRole('link')).toHaveText([
      'Catálogo',
      'Promociones',
      'Cotizar',
      'Cómo funciona',
    ]);
    await expect(explora.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '/#catalogo');
    await expect(explora.getByRole('link', { name: 'Promociones' })).toHaveAttribute('href', '/#promociones');
    await expect(explora.getByRole('link', { name: 'Cotizar' })).toHaveAttribute('href', '/cotizador');
    await expect(explora.getByRole('link', { name: 'Cómo funciona' })).toHaveAttribute('href', '/#proceso');

    await expect(alcusa.getByRole('link')).toHaveText(['Nosotros', 'Contacto', 'Visítanos']);
    await expect(alcusa.getByRole('link', { name: 'Nosotros' })).toHaveAttribute('href', '/nosotros');
    await expect(alcusa.getByRole('link', { name: 'Contacto', exact: true })).toHaveAttribute('href', '/contacto');
    await expect(alcusa.getByRole('link', { name: 'Visítanos' })).toHaveAttribute('href', '/contacto#visitanos');

    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: 'Inicio', exact: true })).toHaveCount(0);
    await expect(footer.getByRole('link', { name: 'Proyectos reales' })).toHaveCount(0);
    await expect(footer.getByRole('link', { name: 'Galería' })).toHaveCount(0);
  });

  test('legal name + WhatsApp CTA repeat (no NIT placeholder — not in any board)', async ({
    page,
  }) => {
    await page.goto('/');
    const legal = page.locator('.site-footer__legal');
    await expect(legal).toContainText('Aluminios Cuzcatlán, S.A. de C.V.');
    await expect(legal).toBeVisible();
    await expect(page.getByText('[NIT — confirmar]')).toHaveCount(0);
    const waCta = page
      .getByRole('contentinfo')
      .getByRole('link', { name: /Cotizar por WhatsApp/ });
    await expect(waCta).toHaveAttribute('href', 'https://wa.me/50376802410');
  });
});
