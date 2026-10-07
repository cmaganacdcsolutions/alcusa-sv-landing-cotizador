import { expect, pickProduct, test, textOnlyWaLink } from './fixtures';
import { fillAddress } from '../support/address';

test.use({ blockQuotePdf: true });

// Asserts the built wa.me href matches the expected encoded template.
// Never clicks through (ADR-006) — fixtures.ts also aborts wa.me/wompi
// network routes as an independent guard.
test.describe('whatsapp links — cotizador handoff', () => {
  // La barra superior vieja ya no existe: los accesos de WhatsApp del inicio viven en el navbar fijo, en el bloque de
  // contacto (#contacto, solo < 1024 px: desktop-r01 no lo dibuja) y en el footer. Todos enlazan al numero pelado,
  // sin texto prellenado.
  test('navbar, bloque de contacto y footer enlazan a un wa.me pelado, sin texto prellenado', async ({ page }) => {
    await page.goto('/');
    const bare = /^https:\/\/wa\.me\/50376802410$/;
    const navbar = page.getByRole('banner').getByRole('link', { name: 'Escribir por WhatsApp al 7680-2410' });
    await expect(navbar).toHaveCount(1);
    expect(await navbar.getAttribute('href')).toMatch(bare);

    if ((page.viewportSize()?.width ?? 0) < 1024) {
      const contacto = page.locator('#contacto').getByRole('link', { name: 'WhatsApp', exact: true });
      await expect(contacto).toHaveCount(1);
      expect(await contacto.getAttribute('href')).toMatch(bare);
    } else {
      await expect(page.locator('#contacto')).toBeHidden();
    }

    const footer = page.getByRole('contentinfo').getByRole('link', { name: /Cotizar por WhatsApp/ });
    await expect(footer).toHaveCount(1);
    expect(await footer.getAttribute('href')).toMatch(bare);
  });

  test('resumen "Enviar por WhatsApp para confirmar" href matches the §2.6 template', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    const href = await (await textOnlyWaLink(page)).getAttribute('href');
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
            'Dirección: Residencial Las Flores, Pasaje 3, casa 12 · Ref: frente a la iglesia, portón negro · Soyapango, San Salvador Este, San Salvador · Tel: 7123-4567\n\n' +
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
    await fillAddress(page, 'Soyapango');
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
