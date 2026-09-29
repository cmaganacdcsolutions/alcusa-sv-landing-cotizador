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

  test('WhatsApp quick link in the info block is a bare wa.me URL', async ({ page }) => {
    await page.goto('/contacto');
    const href = await page
      .getByRole('link', { name: '7680-2410', exact: true })
      .getAttribute('href');
    expect(href).toBe('https://wa.me/50376802410');
  });

  test('hours and email show the literal placeholder text', async ({ page }) => {
    await page.goto('/contacto');
    await expect(page.getByText('[HORARIO — confirmar]')).toBeVisible();
    await expect(page.getByText('[correo — confirmar]')).toBeVisible();
  });
});

test.describe('contacto — webform lifecycle', () => {
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
  // Footer content is per-board (sf-landing5 fidelity pass, 2026-09-28):
  // mobile boards (Main.dc.html / android-01-inicio.dc.html) only show
  // Inicio/Cotizar/Contacto; Catálogo/Cómo funciona/Galería are desktop-only
  // (desktop-01-inicio.dc.html), and the footer label there is "Galería" (we ship "Proyectos reales", user decision),
  // not "Proyectos reales".
  test('mobile quick links: Inicio/Cotizar/Contacto only', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'desktop1920',
      'desktop has the full 6-link nav; see the next test',
    );
    await page.goto('/');
    const footerNav = page.getByRole('navigation', { name: 'Enlaces del pie' });
    await expect(footerNav.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'href',
      '/#inicio',
    );
    await expect(footerNav.getByRole('link', { name: 'Cotizar' })).toHaveAttribute(
      'href',
      '/cotizador',
    );
    await expect(footerNav.getByRole('link', { name: 'Contacto' })).toHaveAttribute(
      'href',
      '/contacto',
    );
    await expect(footerNav.getByRole('link', { name: 'Catálogo' })).toBeHidden();
    await expect(footerNav.getByRole('link', { name: 'Cómo funciona' })).toBeHidden();
    await expect(footerNav.getByRole('link', { name: 'Proyectos reales' })).toBeHidden();
  });

  test('desktop quick links: full 6-link nav, labelled "Proyectos reales"', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1920', 'desktop-only assertion');
    await page.goto('/');
    const footerNav = page.getByRole('navigation', { name: 'Enlaces del pie' });
    await expect(footerNav.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'href',
      '/#inicio',
    );
    await expect(footerNav.getByRole('link', { name: 'Catálogo' })).toHaveAttribute(
      'href',
      '/#modelos',
    );
    await expect(footerNav.getByRole('link', { name: 'Cómo funciona' })).toHaveAttribute(
      'href',
      '/#proceso',
    );
    await expect(
      footerNav.getByRole('link', { name: 'Proyectos reales' }),
    ).toHaveAttribute('href', '/#galeria');
    await expect(footerNav.getByRole('link', { name: 'Cotizar' })).toHaveAttribute(
      'href',
      '/cotizador',
    );
    await expect(footerNav.getByRole('link', { name: 'Contacto' })).toHaveAttribute(
      'href',
      '/contacto',
    );
  });

  test('legal name + WhatsApp CTA repeat (no NIT placeholder — not in any board)', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    // Two legal-text paragraphs exist (mobile copy has no "local 29 G",
    // desktop copy does) — only one is ever visible per breakpoint.
    const legal =
      testInfo.project.name === 'desktop1920'
        ? page.locator('.site-footer__legal--desktop')
        : page.locator('.site-footer__legal--mobile');
    await expect(legal).toContainText('Aluminios Cuzcatlán, S.A. de C.V.');
    await expect(legal).toBeVisible();
    await expect(page.getByText('[NIT — confirmar]')).toHaveCount(0);
    const waCta = page
      .getByRole('contentinfo')
      .getByRole('link', { name: /Cotizar por WhatsApp/ });
    await expect(waCta).toHaveAttribute('href', 'https://wa.me/50376802410');
  });
});
