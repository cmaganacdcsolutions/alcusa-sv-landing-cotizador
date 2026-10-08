import type { Page } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';
import { fillAddress, TEST_PHONE } from '../support/address';

// "Entrega y zona": direccion completa (solo Con instalacion), aviso de envio en Precio,
// ubicacion opcional y telefono precargado en "Tus datos para la cotizacion".
const NOTICE = 'Al ingresar tu dirección se agregarán los costos de envío.';

async function toPrecio(page: Page): Promise<void> {
  await page.goto('/cotizador');
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
  await pickProduct(page, 'recta');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
}

async function toEntrega(page: Page): Promise<void> {
  await toPrecio(page);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
}

test.describe('cotizador — aviso de envio en Precio', () => {
  test('el precio se muestra antes del envio y el aviso es visible', async ({ page }) => {
    await toPrecio(page);
    await expect(page.getByTestId('step2-price-value')).toHaveText('$222.00');
    await expect(page.locator('.estimate-card__label')).toHaveText('ESTIMADO SIN TRANSPORTE');
    await expect(page.getByTestId('shipping-notice')).toBeVisible();
    await expect(page.getByTestId('shipping-notice')).toHaveText(NOTICE);
  });
});

test.describe('cotizador — direccion de entrega', () => {
  test('instalacion: el total con envio aparece solo con todos los campos validos', async ({ page }) => {
    await toEntrega(page);
    await expect(page.getByTestId('address-fields')).toBeVisible();
    await expect(page.getByTestId('zona-total-value')).toHaveCount(0);

    // Solo zona: sigue sin total.
    await fillAddress(page, 'Soyapango', { onlyZone: true });
    await expect(page.getByTestId('zona-total-value')).toHaveCount(0);
    await page.locator('#addr-colonia').fill('Residencial Las Flores');
    await page.locator('#addr-calle').fill('Pasaje 3, casa 12');
    await page.locator('#addr-referencia').fill('frente a la iglesia, portón negro');
    await expect(page.getByTestId('zona-total-value')).toHaveCount(0);

    // Telefono invalido: sin total y con mensaje.
    await page.locator('#addr-telefono').fill('1234');
    await page.locator('#addr-telefono').blur();
    await expect(page.locator('#addr-telefono-msg')).toContainText('deben ser 8 dígitos');
    await expect(page.getByTestId('zona-total-value')).toHaveCount(0);

    await page.locator('#addr-telefono').fill(TEST_PHONE);
    await expect(page.getByTestId('zona-total-value')).toHaveText('$262.00');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.getByTestId('resumen-address').locator('visible=true').first()).toContainText('Residencial Las Flores');
  });

  test('Siguiente con datos incompletos muestra errores y lleva el foco al primer campo invalido', async ({ page }) => {
    await toEntrega(page);
    await fillAddress(page, 'Soyapango', { onlyZone: true });
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.locator('#addr-colonia')).toBeFocused();
    await expect(page.locator('#addr-colonia')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#addr-colonia-msg')).toContainText('colonia, residencial o barrio');
    await expect(page.locator('#addr-telefono-msg')).toContainText('Escribe tu teléfono');
    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
  });

  test('dropdown de zonas: cada opcion muestra su precio, en orden de tabla, y Otra zona al final', async ({ page }) => {
    await toEntrega(page);
    // Ya no hay cascada departamento/municipio/distrito.
    await expect(page.locator('#addr-departamento, #addr-municipio, #addr-distrito')).toHaveCount(0);
    await expect(page.locator('label[for="addr-zona"]')).toHaveText('Ubicación / zona de cobertura');
    const labels = await page.locator('#addr-zona option').allTextContents();
    expect(labels[0]).toBe('Elige tu zona');
    expect(labels[1]).toBe('San Salvador (zona metropolitana) — Incluido');
    expect(labels[2]).toBe('Santa Tecla — Incluido');
    expect(labels[3]).toBe('San Marcos — $25.00');
    expect(labels).toContain('Soyapango — $40.00');
    expect(labels[labels.length - 2]).toBe('Ciudad Arce — $85.00');
    expect(labels[labels.length - 1]).toBe('Otra zona — envío por confirmar');
    // 8 zonas que antes eran inalcanzables (colonias/puntos de referencia) ahora se pueden elegir.
    for (const z of ['Planes de Renderos', 'Redondel Integración', 'Paseo del Prado', 'San Bartolo', 'Altavista', 'Ciudad Versalles', 'Lourdes', 'Desvío de Opico']) {
      await expect(page.locator(`#addr-zona option[value="${z}"]`)).toHaveCount(1);
    }
  });

  test('zona elegida muestra su envio de inmediato, pero el total espera a la direccion completa', async ({ page }) => {
    await toEntrega(page);
    await page.locator('#addr-zona').selectOption({ value: 'Planes de Renderos' });
    await expect(page.getByTestId('zona-total-value')).toHaveCount(0);
    await expect(page.getByText('Envío a Planes de Renderos: $30.00, una vez por pedido.')).toBeVisible();
    await expect(page.getByText('Completa tu dirección para ver el total.')).toBeVisible();
    await fillAddress(page, 'Planes de Renderos');
    // recta 1.10 m promo claro $222 + $30.
    await expect(page.getByTestId('zona-total-value')).toHaveText('$252.00');
  });

  test('"Otra zona" no bloquea: envio por confirmar y el flujo sigue', async ({ page }) => {
    await toEntrega(page);
    await page.locator('#addr-zona').selectOption({ value: 'otro' });
    await expect(page.getByText('Envío por confirmar: te lo confirmamos por WhatsApp.').first()).toBeVisible();
    await expect(page.getByTestId('zona-total-value')).toHaveCount(0);
    await fillAddress(page, 'Santa Ana');
    await expect(page.getByTestId('zona-envio-pendiente')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
  });

  test('campos de texto >= 16px y autocomplete correcto', async ({ page }) => {
    await toEntrega(page);
    for (const [id, token] of [
      ['addr-calle', 'street-address'],
      ['addr-telefono', 'tel'],
    ] as const) {
      await expect(page.locator(`#${id}`)).toHaveAttribute('autocomplete', token);
    }
    await expect(page.locator('#addr-telefono')).toHaveAttribute('inputmode', 'tel');
    for (const id of ['addr-colonia', 'addr-calle', 'addr-referencia', 'addr-telefono', 'addr-zona']) {
      const px = await page.locator(`#${id}`).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(px).toBeGreaterThanOrEqual(16);
    }
  });

  test('retiro en tienda no pide direccion y el total sigue igual', async ({ page }) => {
    await toEntrega(page);
    await page.getByRole('button', { name: /Retiro en tienda/ }).first().click();
    await expect(page.getByTestId('address-fields')).toHaveCount(0);
    await expect(page.getByTestId('zona-total-value')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.getByTestId('resumen-address')).toHaveCount(0);
  });

  test('el telefono capturado se precarga en "Tus datos para la cotizacion" y sigue editable', async ({ page }) => {
    await toEntrega(page);
    await fillAddress(page, 'Soyapango', { phone: '7999-8888' });
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await page.getByTestId('quote-share-button').locator('visible=true').click();
    const d = page.getByRole('dialog', { name: 'Tus datos para la cotización' });
    await expect(d).toBeVisible();
    await expect(d.getByLabel('WhatsApp')).toHaveValue('7999-8888');
    await d.getByLabel('WhatsApp').fill('7111-2222');
    await expect(d.getByLabel('WhatsApp')).toHaveValue('7111-2222');
  });
});

test.describe('cotizador — ubicacion opcional', () => {
  test('permiso concedido: guarda la ubicacion y ofrece "Ver en mapa" sin llamadas externas', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 13.69294, longitude: -89.21819 });
    await toEntrega(page);
    await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
    const status = page.getByTestId('geo-status');
    await expect(status).toContainText('Ubicación guardada ✓');
    const link = status.getByRole('link', { name: 'Ver en mapa' });
    await expect(link).toHaveAttribute('href', 'https://www.google.com/maps?q=13.69294,-89.21819');
    await expect(link).toHaveAttribute('rel', /noopener/);
    // No reemplaza la direccion escrita: sigue sin total.
    await expect(page.getByTestId('zona-total-value')).toHaveCount(0);
  });

  test('permiso denegado: mensaje amable y el flujo no se bloquea', async ({ page, context }) => {
    await context.clearPermissions();
    await toEntrega(page);
    await page.evaluate(() => {
      // Simula la negativa del usuario de forma determinista (sin depender del prompt del navegador).
      navigator.geolocation.getCurrentPosition = (_ok, err) =>
        err?.({ code: 1, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    });
    await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
    await expect(page.getByTestId('geo-status')).toContainText('No pudimos usar tu ubicación');
    await fillAddress(page, 'Soyapango');
    await expect(page.getByTestId('zona-total-value')).toHaveText('$262.00');
  });
});
