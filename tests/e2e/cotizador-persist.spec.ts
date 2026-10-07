import type { Page } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';
import { fillAddress } from '../support/address';

// Wizard persistence (src/islands/Cotizador/state/persist.ts, sessionStorage key
// `alcusa-cotizador-wizard`). Born from the bug "al hacer click en utilizar mi ubicacion me reinicio el
// flujo del cotizador": nothing in the click path reloads the page, but a reload (HMR, or a mobile tab
// reload around the geolocation permission prompt) used to wipe everything but the cart and bounce to
// step 0. The geo matrix below proves the click itself keeps the flow; the reload tests prove a reload does.
//
// Never opens a real WhatsApp/Wompi link (fixtures.ts blocks those routes).
const WIZARD_KEY = 'alcusa-cotizador-wizard';
const GEO = { latitude: 13.69294, longitude: -89.21819 } as const;
const MEDIDAS = 'Medidas y acabado';
const ZONA = 'Entrega y zona';
const RESUMEN = 'Resumen de tu cotización';

async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

/** recta 150 cm (Natural/Claro) up to "Entrega y zona". */
async function toZona(page: Page, width = '150'): Promise<void> {
  await page.goto('/cotizador');
  await waitForHydration(page);
  await pickProduct(page, 'recta');
  await expect(page.getByRole('heading', { name: MEDIDAS })).toBeVisible();
  await page.locator('#ancho').fill(width);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: ZONA })).toBeVisible();
}

type StoredSnapshot = Record<string, unknown> & { address: Record<string, unknown> };

async function readSnapshot(page: Page): Promise<StoredSnapshot | null> {
  return page.evaluate((key) => {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredSnapshot) : null;
  }, WIZARD_KEY);
}

// ---------------------------------------------------------------------------
// The reported bug: "Usar mi ubicación" must keep the flow (granted / denied / unavailable).
// ---------------------------------------------------------------------------
const GEO_SCENARIOS = {
  granted: { status: 'Ubicación guardada ✓' },
  denied: { status: 'No pudimos usar tu ubicación porque no diste permiso' },
  unavailable: { status: 'Tu dispositivo no pudo darnos la ubicación' },
} as const;

for (const scenario of ['granted', 'denied', 'unavailable'] as const) {
  test.describe(`cotizador — "Usar mi ubicación" (${scenario}) keeps the flow`, () => {
    if (scenario === 'granted') test.use({ permissions: ['geolocation'], geolocation: GEO });

    test('the click does not reload or reset: product, measures, step and typed address stay; a reload keeps them too', async ({
      page,
    }) => {
      if (scenario === 'unavailable') {
        // No Geolocation API at all (some in-app browsers/webviews): requestGeo's "unavailable" branch.
        await page.addInitScript(() => {
          Reflect.deleteProperty(Navigator.prototype, 'geolocation');
        });
      }
      await toZona(page);
      await page.locator('#addr-departamento').selectOption({ label: 'San Salvador' });

      // Proof of "no reload": a marker on <html> and a counter of full page loads after the click.
      await page.evaluate(() => {
        document.documentElement.dataset.noReload = '1';
      });
      let loads = 0;
      page.on('load', () => (loads += 1));

      await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
      await expect(page.getByTestId('geo-status')).toContainText(GEO_SCENARIOS[scenario].status, { timeout: 15_000 });

      expect(loads).toBe(0);
      expect(await page.evaluate(() => document.documentElement.dataset.noReload)).toBe('1');
      await expect(page.getByRole('heading', { name: ZONA })).toBeVisible();
      await expect(page).toHaveURL(/#cotizador\/3-zona-entrega$/);
      await expect(page.locator('#addr-departamento option:checked')).toHaveText('San Salvador');
      await expect.poll(() => readSnapshot(page)).toMatchObject({ step: 'zonaEntrega', productId: 'recta', width: '150' });

      // The mobile permission prompt can reload the tab: the flow must come back where it was.
      await page.reload();
      await expect(page.getByRole('heading', { name: ZONA })).toBeVisible();
      await expect(page.locator('#addr-departamento option:checked')).toHaveText('San Salvador');
      await expect(page).toHaveURL(/#cotizador\/3-zona-entrega$/);
      if (scenario === 'granted') {
        await expect(page.getByTestId('geo-status')).toContainText('Ubicación guardada ✓');
        await expect.poll(async () => (await readSnapshot(page))?.address.geo).toEqual({ lat: 13.69294, lng: -89.21819 });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Reload mid-flow restores product, measures, address and geo.
// ---------------------------------------------------------------------------
test.describe('cotizador — reload mid-flow restores the wizard', () => {
  test.use({ permissions: ['geolocation'], geolocation: GEO });

  test('product, measures, address, geo and zone come back; the flow continues to the right Resumen', async ({ page }) => {
    await toZona(page, '150');
    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
    await expect(page.getByTestId('geo-status')).toContainText('Ubicación guardada ✓');
    // recta 150 cm Natural/Claro = $328 + $40 Soyapango.
    await expect(page.getByTestId('zona-total-value')).toHaveText('$368.00');

    await page.reload();
    await expect(page.getByRole('heading', { name: ZONA })).toBeVisible();
    await expect(page.locator('#addr-colonia')).toHaveValue('Residencial Las Flores');
    await expect(page.locator('#addr-calle')).toHaveValue('Pasaje 3, casa 12');
    await expect(page.locator('#addr-telefono')).toHaveValue('7123-4567');
    await expect(page.locator('#addr-distrito option:checked')).toHaveText('Soyapango');
    await expect(page.getByTestId('geo-status')).toContainText('Ubicación guardada ✓');
    await expect(page.getByTestId('zona-total-value')).toHaveText('$368.00');

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: RESUMEN })).toBeVisible();
    await expect(page.locator('.summary-item')).toContainText('1.50 × 1.85 m');
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$368.00');
  });

  test('a reload at Medidas keeps the product and the typed width', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'recta');
    await page.locator('#ancho').fill('135');
    await expect(page.locator('#ancho')).toHaveValue('135');

    await page.reload();
    await expect(page.getByRole('heading', { name: MEDIDAS })).toBeVisible();
    await expect(page.locator('#ancho')).toHaveValue('135');
  });

  test('the payment method and Wompi data are never restored: a reload at Forma de pago falls back to the default method', async ({ page }) => {
    await toZona(page);
    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Pagar ahora' }).click();
    await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();
    await page.getByRole('radio', { name: /Enviar por WhatsApp/ }).click();
    await expect(page.getByRole('radio', { name: /Enviar por WhatsApp/ })).toBeChecked();

    const stored = await readSnapshot(page);
    expect(stored).toMatchObject({ step: 'formaPago' });
    for (const key of ['payMethod', 'payMethodChosen', 'payAmountPct', 'wompiOutcome', 'wompiOrderNumber']) {
      expect(stored).not.toHaveProperty(key);
    }

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();
    // The WhatsApp pick is not restored: the default method (Wompi) is selected again.
    await expect(page.getByRole('radio', { name: /Pagar ahora/ })).toBeChecked();
    await expect(page.getByRole('radio', { name: /Enviar por WhatsApp/ })).not.toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// Eligibility: a fresh arrival does not inherit stale state.
// ---------------------------------------------------------------------------
test.describe('cotizador — a fresh arrival wins over stored state', () => {
  test('a deep link (?producto=...) overrides the stored wizard and replaces the snapshot', async ({ page }) => {
    await toZona(page); // recta, stored at Entrega y zona

    await page.goto('/cotizador?producto=jardin-3-hojas');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: MEDIDAS })).toBeVisible();
    await expect(page.getByRole('button', { name: /3 hojas/i })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => readSnapshot(page)).toMatchObject({ productId: 'jardin', step: 'medidas', gardenHojas: 3 });
  });

  test('a plain navigation to /cotizador (no hash, no reload) starts clean and drops the stale snapshot', async ({ page }) => {
    await toZona(page);
    await expect.poll(() => readSnapshot(page)).toMatchObject({ step: 'zonaEntrega' });

    await page.goto('/cotizador');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    await expect.poll(() => readSnapshot(page)).toBeNull();
  });

  test('a corrupt snapshot is ignored (clean start, no errors)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await toZona(page);
    await page.evaluate((key) => window.sessionStorage.setItem(key, '{"v":1,"step":"zonaEntrega","productId":"puerta-magica"}'), WIZARD_KEY);

    await page.reload();
    await waitForHydration(page);
    // The hash still names a step but there is no valid product: the app falls back to step 0 as before.
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Storage blocked: the page must keep working.
// ---------------------------------------------------------------------------
test.describe('cotizador — storage blocked', () => {
  test('sessionStorage throwing does not break the flow or the reload', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });

    await toZona(page);
    await fillAddress(page, 'Soyapango');
    await expect(page.getByTestId('zona-total-value')).toHaveText('$368.00');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: RESUMEN })).toBeVisible();

    // Nothing can be restored, but the reload must not crash: clean step 0.
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Completion clears the snapshot (forces PUBLIC_COTIZADOR_MODE=mock, like wompi-mock-flow.spec.ts).
// ---------------------------------------------------------------------------
async function toWompi(page: Page, outcome: 'approved' | 'declined'): Promise<void> {
  await page.goto(`/cotizador?wompiOutcome=${outcome}`);
  await waitForHydration(page);
  await pickProduct(page, 'recta');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await fillAddress(page, 'Soyapango');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Pagar ahora' }).click();
  await page.getByRole('radio', { name: /Pagar ahora/ }).click();
  await expect.poll(() => readSnapshot(page)).toMatchObject({ step: 'formaPago' });
  await page.getByRole('button', { name: /Pagar \$\d+\.\d{2} con Wompi/ }).click();
}

test.describe('cotizador — completion clears the snapshot', () => {
  test('an approved payment clears it, so a reload does not resurrect the finished quote', async ({ page }) => {
    await toWompi(page, 'approved');
    await expect(page.getByRole('heading', { name: 'Pago completado' })).toBeVisible();
    await expect.poll(() => readSnapshot(page)).toBeNull();
  });

  test('a declined payment keeps the order at Forma de pago: a reload resumes there (never at the payment)', async ({ page }) => {
    await toWompi(page, 'declined');
    await expect(page.getByRole('heading', { name: 'Tu pago no se completó.' })).toBeVisible();
    await expect.poll(() => readSnapshot(page)).toMatchObject({ step: 'formaPago', productId: 'recta' });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();
    await expect(page).toHaveURL(/#cotizador\/5-forma-pago$/);
  });
});
