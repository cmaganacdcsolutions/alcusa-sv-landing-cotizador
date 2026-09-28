import { expect, test } from './fixtures';

// Full step 0->5 happy path for "recta" (T1.2/T1.3) + the out-of-range /
// requiresQuote edge states from prototype-spec.md §2.3. Never opens a real
// WhatsApp link — fixtures.ts blocks wa.me/wompi routes as a second guard.
test.describe('cotizador — recta, step 0 to 5', () => {
  test('drawer "Cotizar" opens the wizard at step 0', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    const drawerNav = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(drawerNav).toBeVisible();
    await drawerNav.getByRole('link', { name: 'Cotizar', exact: true }).click();
    await expect(page).toHaveURL(/#cotizador\/0-producto$/);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
  });

  test('happy path: recta 110cm Natural Claro, Soyapango, con instalación → $262.00 total + WhatsApp href', async ({
    page,
  }) => {
    await page.goto('/#cotizador/0-producto');

    await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();

    await expect(page.locator('#ancho')).toHaveValue('110');
    await page.getByRole('button', { name: 'Natural' }).click();
    await page.getByRole('button', { name: 'Claro 5 mm' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$222.00');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
    await page.locator('#municipio').selectOption('Soyapango');
    await expect(page.getByTestId('zona-total-value')).toHaveText('$262.00');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$262.00');

    const waLink = page.getByRole('link', { name: 'Enviar por WhatsApp para confirmar' });
    const href = await waLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toMatch(/^https:\/\/wa\.me\/50376802410\?text=/);

    const decoded = decodeURIComponent(href!.split('?text=')[1]);
    expect(decoded).toContain('Hola ALCUSA, quiero confirmar esta cotización:');
    expect(decoded).toContain('Puerta de baño recta — 1.10×1.85 m · Color: Natural · Vidrio: Claro 5 mm');
    expect(decoded).toContain('Zona: Soyapango · Entrega: con instalación');
    expect(decoded).toContain('Subtotal: $222.00');
    expect(decoded).toContain('Transporte: $40.00');
    expect(decoded).toContain('Total estimado: $262.00');
    expect(decoded).toContain('Anticipo (80%): $209.60 · Saldo (20% al entregar): $52.40');
    expect(decoded).toContain('Dirección: [dirección]');
  });

  test('retiro en tienda: 110cm Natural Claro → $188.70, sin transporte', async ({ page }) => {
    await page.goto('/#cotizador/0-producto');
    await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await page.getByRole('button', { name: 'Retiro en tienda −15%' }).click();
    await expect(page.getByTestId('zona-total-value')).toHaveText('$188.70');
  });

  test('out-of-range width (75cm) shows the "Cotización personalizada por WhatsApp" card, Siguiente disabled', async ({
    page,
  }) => {
    await page.goto('/#cotizador/0-producto');
    await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
    await page.locator('#ancho').fill('75');

    await expect(page.getByText('Cotización personalizada por WhatsApp')).toBeVisible();
    await expect(
      page.getByText('El ancho debe ser de 80 a 200 cm y la altura de 1.85 m. Para otras medidas, consulta con ALCUSA.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  test('out-of-range width (201cm) shows the same personalized-quote card', async ({ page }) => {
    await page.goto('/#cotizador/0-producto');
    await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
    await page.locator('#ancho').fill('201');

    await expect(page.getByText('Cotización personalizada por WhatsApp')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  test('municipio outside the 23-zone list shows the transport empty state', async ({ page }) => {
    await page.goto('/#cotizador/0-producto');
    await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await page.locator('#municipio').selectOption('otro');
    await expect(page.getByText('Tu zona aún no tiene tarifa de transporte automática')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  test('125cm Blanco Claro prices at $366 (Table C tier 1.3)', async ({ page }) => {
    await page.goto('/#cotizador/0-producto');
    await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
    await page.locator('#ancho').fill('125');
    await page.getByRole('button', { name: 'Blanco' }).click();
    await page.getByRole('button', { name: 'Claro 5 mm' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByTestId('step2-price-value')).toHaveText('$366.00');
  });
});
