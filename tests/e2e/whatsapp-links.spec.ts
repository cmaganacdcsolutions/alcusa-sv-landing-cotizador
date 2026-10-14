import { expect, pickProduct, test, textOnlyWaLink } from './fixtures';
import { fillAddress } from '../support/address';

test.use({ blockQuotePdf: true });

// Asserts the built wa.me href matches the expected encoded template.
// Never clicks through (ADR-006) — fixtures.ts also aborts wa.me
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

  test('resumen "Hablar con un asesor por WhatsApp" href matches the §2.6 template', async ({ page }) => {
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
            '   Subtotal: $258.00\n\n' +
            'Transporte: $40.00\n' +
            'Total estimado: $298.00\n' +
            'Anticipo (80%): $238.40 · Saldo (20% al entregar): $59.60\n' +
            'Dirección: Residencial Las Flores, Pasaje 3, casa 12 · Ref: frente a la iglesia, portón negro · Soyapango · Tel: 7123-4567\n\n' +
            'Por favor confirmen medidas, disponibilidad y forma de pago. ¡Gracias!',
        ),
    );
  });

  test('el Resumen cierra el flujo: CTA PDF + enlace al asesor con el mismo wa.me, sin pasos de pago', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pagar ahora' })).toHaveCount(0);
    await expect(page.getByTestId('quote-share-button').locator('visible=true').first()).toHaveText('Obtener cotización en PDF');
    const advisor = page.getByTestId('resumen-whatsapp-advisor').locator('visible=true').first();
    await expect(advisor).toHaveText('Hablar con un asesor por WhatsApp');
    expect(await advisor.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/50376802410\?text=/);
  });
});
