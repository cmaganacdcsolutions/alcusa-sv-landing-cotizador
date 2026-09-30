import { expect, pickProduct, test } from './fixtures';

// Asserts the built wa.me href matches the expected encoded template.
// Never clicks through (ADR-006) — fixtures.ts also aborts wa.me/wompi
// network routes as an independent guard.
test.describe('whatsapp links — cotizador handoff', () => {
  test('quick-contact icon (top bar) links to a bare wa.me URL with no prefill', async ({ page }) => {
    await page.goto('/');
    const href = await page.getByRole('link', { name: 'Escribir por WhatsApp' }).getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/50376802410$/);
  });

  test('resumen "Enviar por WhatsApp para confirmar" href matches the §2.6 template', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.locator('#municipio').selectOption('Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    const href = await page.getByRole('link', { name: 'Enviar por WhatsApp para confirmar' }).getAttribute('href');
    expect(href).toBe(
      'https://wa.me/50376802410?text=' +
        encodeURIComponent(
          'Hola ALCUSA, quiero confirmar esta cotización:\n\n' +
            '1. Puerta de baño recta — 1.10×1.85 m · Color: Natural · Vidrio: Claro 5 mm\n' +
            '   Zona: Soyapango · Entrega: con instalación\n' +
            '   Subtotal: $222.00\n\n' +
            'Transporte: $40.00\n' +
            'Total estimado: $262.00\n' +
            'Anticipo (80%): $209.60 · Saldo (20% al entregar): $52.40\n' +
            'Dirección: [dirección]\n\n' +
            'Por favor confirmen medidas, disponibilidad y forma de pago. ¡Gracias!',
        ),
    );
  });

  // "Pagar ahora" (Wompi) is enabled as of sf-cot-checkout (mock-only local
  // amount toggle, no real network/keys — S8 wires the real gateway); this
  // spec now covers both radios instead of asserting Wompi stays disabled.
  test('forma de pago step exposes the same WhatsApp handoff; Wompi is selectable with no real network call', async ({
    page,
  }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.locator('#municipio').selectOption('Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Pagar ahora' }).click();

    await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();
    const payRadio = page.getByRole('radio', { name: /Pagar ahora/ });
    await expect(payRadio).toBeEnabled();
    await expect(payRadio).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('radio', { name: /Enviar por WhatsApp para confirmar/ }).click();
    const href = await page.getByRole('link', { name: 'Enviar por WhatsApp' }).getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/50376802410\?text=/);
  });
});
