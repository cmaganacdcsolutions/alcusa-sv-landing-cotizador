import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';
import { fillAddress } from '../support/address';

// R07.1 — customer mini form (ios/android-r07 estado H1-H5, desktop-r07 estado E1-E5).
// The mock folio provider is scripted through sessionStorage (alcusa.mock.quote / -delay).

const STORE = 'alcusa.cliente.v1';

async function setup(page: Page, scenario?: string, delay?: number): Promise<void> {
  await page.addInitScript(
    ([sc, dl]) => {
      (window as unknown as { __opened: string[] }).__opened = [];
      window.open = ((u?: string | URL) => {
        (window as unknown as { __opened: string[] }).__opened.push(String(u));
        return null;
      }) as typeof window.open;
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
      if (sc && !sessionStorage.getItem('alcusa.mock.set')) {
        sessionStorage.setItem('alcusa.mock.quote', sc);
        sessionStorage.setItem('alcusa.mock.set', '1');
      }
      if (dl) sessionStorage.setItem('alcusa.mock.quote-delay', dl);
    },
    [scenario ?? '', delay ? String(delay) : ''],
  );
}

async function gotoResumen(page: Page): Promise<void> {
  await page.goto('/cotizador');
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
  await pickProduct(page, 'recta');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await fillAddress(page, 'Soyapango');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
}

const trigger = (page: Page): Locator => page.getByTestId('quote-share-button').locator('visible=true');
const dialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Tus datos para la cotización' });
const cta = (d: Locator): Locator => d.getByRole('button', { name: /Generar mi cotización|Intentar de nuevo|Preparando/ });

async function fill(d: Locator, name: string, wa: string, consent = true): Promise<void> {
  await d.getByLabel('Nombre').fill(name);
  await d.getByLabel('WhatsApp').fill(wa);
  if (consent) await d.getByRole('checkbox').check();
}

test.describe('customer dialog — H1/E1 empty', () => {
  test('opens from the trigger with the exact copy, unchecked consent, focus on Nombre; nothing is generated yet', async ({ page }) => {
    await setup(page);
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d).toHaveAttribute('aria-modal', 'true');
    await expect(d.getByRole('heading', { name: 'Tus datos para la cotización' })).toBeVisible();
    await expect(d.getByText('Son obligatorios y aparecerán en tu PDF.')).toBeVisible();
    await expect(d.getByLabel('Nombre')).toBeFocused();
    await expect(d.getByLabel('Nombre')).toHaveAttribute('autocomplete', 'name');
    await expect(d.getByLabel('Nombre')).toHaveAttribute('placeholder', 'Ej. María López');
    const wa = d.getByLabel('WhatsApp');
    await expect(wa).toHaveAttribute('type', 'tel');
    await expect(wa).toHaveAttribute('inputmode', 'tel');
    await expect(wa).toHaveAttribute('autocomplete', 'tel');
    await expect(d.getByText('+503', { exact: true })).toBeVisible();
    await expect(d.getByText('Entre 2 y 80 caracteres.')).toBeVisible();
    await expect(d.getByText('Celular de El Salvador · 8 dígitos')).toBeVisible();
    const box = d.getByRole('checkbox');
    await expect(box).not.toBeChecked();
    await expect(box).toHaveAttribute('required', '');
    await expect(box).toHaveAttribute('aria-invalid', 'false');
    await expect(d.getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', '#aviso-de-privacidad-pendiente');
    await expect(cta(d)).toBeEnabled();
    expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(0);
    expect(await page.evaluate((k) => sessionStorage.getItem(k), STORE)).toBeNull();
  });

  test('mask: typing digits formats ####-#### and a pasted +503 prefix is dropped', async ({ page }) => {
    await setup(page);
    await gotoResumen(page);
    await trigger(page).click();
    const wa = dialog(page).getByLabel('WhatsApp');
    await wa.fill('71234567');
    await expect(wa).toHaveValue('7123-4567');
    await wa.fill('+503 6123 4567');
    await expect(wa).toHaveValue('6123-4567');
  });
});

test.describe('customer dialog — H2/E2 inline errors', () => {
  test('empty submit: three errors, focus to Nombre, no folio; live correction; blur validation', async ({ page }) => {
    await setup(page);
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    // El telefono viene precargado desde "Entrega y zona"; se vacia para probar los tres errores.
    await d.getByLabel('WhatsApp').fill('');
    await cta(d).click();
    await expect(d.getByText('Escribe tu nombre.')).toBeVisible();
    await expect(d.getByText('Escribe tu número de WhatsApp.')).toBeVisible();
    await expect(d.getByText('Marca la casilla para continuar.')).toBeVisible();
    await expect(d.getByLabel('Nombre')).toBeFocused();
    await expect(d.getByLabel('Nombre')).toHaveAttribute('aria-invalid', 'true');
    await expect(d.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
    await expect(d.getByRole('checkbox')).toHaveAttribute('aria-describedby', /.+/);
    expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(0);

    await d.getByLabel('Nombre').fill('M');
    await expect(d.getByText('El nombre debe tener al menos 2 letras.')).toBeVisible();
    await d.getByLabel('Nombre').fill('María');
    await expect(d.getByText('El nombre debe tener al menos 2 letras.')).toHaveCount(0);
    await d.getByRole('checkbox').check();
    await expect(d.getByText('Marca la casilla para continuar.')).toHaveCount(0);

    await d.getByLabel('WhatsApp').fill('5123-4567');
    await d.getByLabel('Nombre').focus(); // blur
    await expect(d.getByText('Revisa el número: deben ser 8 dígitos y empezar con 6 o 7.')).toBeVisible();
    await cta(d).click();
    await expect(d.getByLabel('WhatsApp')).toBeFocused();
    await d.getByLabel('Nombre').fill('Ana 123');
    await d.getByLabel('WhatsApp').focus();
    await expect(d.getByText('Usa solo letras y espacios.')).toBeVisible();
  });

  test('a 422 from the server maps to the field errors (invalid_customer)', async ({ page }) => {
    await setup(page, 'invalid_customer');
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    await fill(d, 'María López', '7123-4567');
    await cta(d).click();
    await expect(d.getByText('Usa solo letras y espacios.')).toBeVisible();
    await expect(d.getByText('Revisa el número: deben ser 8 dígitos y empezar con 6 o 7.')).toBeVisible();
    await expect(d).toBeVisible();
    expect(await page.evaluate((k) => sessionStorage.getItem(k), STORE)).toBeNull();
  });

  test('consent_required maps to the checkbox error', async ({ page }) => {
    await setup(page, 'consent_required');
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    await fill(d, 'María López', '7123-4567');
    await cta(d).click();
    await expect(d.getByText('Marca la casilla para continuar.')).toBeVisible();
    await expect(d.getByRole('checkbox')).toBeFocused();
  });
});

test.describe('customer dialog — H3/E3 sending', () => {
  test('readonly fields, busy CTA, X and Cancelar inactive; then the dialog closes and the PDF flow runs', async ({ page }) => {
    await setup(page, undefined, 1200);
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    await fill(d, 'María López', '7123-4567');
    await cta(d).click();
    await expect(d).toHaveAttribute('aria-busy', 'true');
    await expect(d.getByLabel('Nombre')).toHaveAttribute('readonly', '');
    await expect(d.getByLabel('WhatsApp')).toHaveAttribute('aria-readonly', 'true');
    await expect(d.getByRole('button', { name: 'Preparando tu cotización en PDF' })).toHaveAttribute('aria-disabled', 'true');
    await expect(d.getByRole('button', { name: 'Cancelar' })).toHaveAttribute('aria-disabled', 'true');
    await expect(d.getByRole('button', { name: 'Cerrar' })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape'); // inert while sending
    await expect(d).toBeVisible();
    await expect(d).toHaveCount(0, { timeout: 6000 });
  });
});

test.describe('customer dialog — H4/E4 remembered + success', () => {
  test('after success the data is saved for this tab; 2nd use prefills, consent checked, focus on the CTA; Borrar mis datos clears', async ({ page }) => {
    await setup(page);
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    const download = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
    await fill(d, '  María   López ', '+503 7123-4567');
    await cta(d).click();
    await expect(d).toHaveCount(0);
    await download;
    const stored = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) ?? 'null') as Record<string, unknown>, STORE);
    expect(stored).toMatchObject({ name: 'María López', whatsapp: '+50371234567', consent: { accepted: true, noticeVersion: '2026-10-v1' } });
    expect(typeof stored.savedAt).toBe('string');
    // No customer PII in localStorage. The dev-only mock quote store (PII-free snapshot, mockStore.ts) is excluded on purpose.
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'alcusa.mock.quotes.v1').length)).toBe(0);
    await expect(trigger(page)).toBeFocused();

    // a new cart state (remove nothing; reload keeps sessionStorage) -> dialog again with remembered data.
    // Since the wizard snapshot (state/persist.ts) a reload at Resumen STAYS at Resumen: no re-walk
    // through the steps (the heading only exists after the island restored the stored flow).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await trigger(page).click();
    const d2 = dialog(page);
    await expect(d2.getByLabel('Nombre')).toHaveValue('María López');
    await expect(d2.getByLabel('WhatsApp')).toHaveValue('7123-4567');
    await expect(d2.getByRole('checkbox')).toBeChecked();
    await expect(cta(d2)).toBeFocused();
    await expect(d2.getByText('Usamos los datos que escribiste en esta visita.')).toBeVisible();
    await expect(d2.getByText('Tu autorización sigue marcada solo en esta pestaña.')).toBeVisible();
    await d2.getByRole('button', { name: 'Borrar mis datos' }).click();
    await expect(d2.getByLabel('Nombre')).toHaveValue('');
    await expect(d2.getByLabel('Nombre')).toBeFocused();
    await expect(d2.getByRole('checkbox')).not.toBeChecked();
    await expect(d2.getByText('Datos borrados')).toBeAttached();
    expect(await page.evaluate((k) => sessionStorage.getItem(k), STORE)).toBeNull();
  });
});

test.describe('customer dialog — ADR-011 s5 renew notice (proposal, not on the boards)', () => {
  test('after a folio exists, changing the cart announces that the next send issues a new folio', async ({ page }) => {
    await setup(page);
    await gotoResumen(page);
    await expect(page.getByTestId('quote-share-renew')).toHaveCount(0);
    await trigger(page).click();
    const d = dialog(page);
    const download = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
    await fill(d, 'María López', '7123-4567');
    await cta(d).click();
    await expect(d).toHaveCount(0);
    await download;
    // The persistent share toast ("Cerrar aviso") sits over "Cambiar" on narrow
    // viewports (390px) now that the banner is gone and the layout shifted 61px.
    // Dismissing it is the natural user action before editing the cart.
    await page.getByRole('button', { name: 'Cerrar aviso' }).click();
    await expect(page.getByTestId('quote-share-toast')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cambiar' }).locator('visible=true').first().click();
    await fillAddress(page, 'Apopa');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.getByTestId('quote-share-renew').locator('visible=true').first()).toHaveText(
      'Cambiaste tu cotización: al enviarla se generará un folio nuevo.',
    );
  });
});

test.describe('customer dialog — H5/E5 server error', () => {
  test('429 keeps the values, shows the alert and "Intentar de nuevo"; retry succeeds', async ({ page }) => {
    await setup(page, 'rate_limited');
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    await fill(d, 'María López', '7123-4567');
    await cta(d).click();
    const alert = d.getByRole('alert');
    await expect(alert).toContainText('No pudimos guardar tus datos');
    await expect(alert).toContainText('Revisa tu conexión e inténtalo de nuevo. Lo que escribiste sigue aquí.');
    await expect(d.getByLabel('Nombre')).toHaveValue('María López');
    await expect(d.getByRole('checkbox')).toBeChecked();
    await expect(d.getByRole('button', { name: 'Intentar de nuevo' })).toBeVisible();
    expect(await page.evaluate((k) => sessionStorage.getItem(k), STORE)).toBeNull();

    await page.evaluate(() => sessionStorage.setItem('alcusa.mock.quote', 'ok'));
    await d.getByRole('button', { name: 'Intentar de nuevo' }).click();
    await expect(d).toHaveCount(0);
  });

  test('a 5xx falls to the contingency folio (U) and the flow continues', async ({ page }) => {
    await setup(page, 'server_error');
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    const download = page.waitForEvent('download', { timeout: 15_000 });
    await fill(d, 'María López', '7123-4567');
    await cta(d).click();
    expect((await download).suggestedFilename()).toMatch(/^Cotizacion-ALC-\d{8}-U[0-9A-Z]{7}\.pdf$/);
  });
});

test.describe('customer dialog — cancel, focus, layout', () => {
  test('Esc, X and scrim cancel silently and return focus to the trigger; Cancelar too', async ({ page }) => {
    await setup(page);
    await gotoResumen(page);
    for (const how of ['esc', 'x', 'scrim', 'cancel'] as const) {
      await trigger(page).click();
      const d = dialog(page);
      await expect(d).toBeVisible();
      await d.getByLabel('Nombre').fill('Ana');
      if (how === 'esc') await page.keyboard.press('Escape');
      else if (how === 'x') await d.getByRole('button', { name: 'Cerrar' }).click();
      else if (how === 'cancel') await d.getByRole('button', { name: 'Cancelar' }).click();
      else await page.getByTestId('customer-dialog-scrim').click({ position: { x: 5, y: 5 } });
      await expect(d).toHaveCount(0);
      await expect(trigger(page)).toBeFocused();
    }
    expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(0);
  });

  test('focus is trapped inside the dialog', async ({ page }) => {
    await setup(page);
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab');
      expect(await d.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await d.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
  });

  test('geometry: sheet anchored at the bottom on phones, 480 centered modal on desktop', async ({ page, isMobile }) => {
    await setup(page);
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    const vp = page.viewportSize()!;
    await page.waitForTimeout(450); // entrance animation
    const r = (await d.boundingBox())!;
    if (isMobile) {
      expect(Math.round(r.width)).toBe(vp.width);
      expect(Math.round(r.y + r.height)).toBe(vp.height);
    } else {
      expect(Math.round(r.width)).toBe(480);
      expect(Math.abs(r.x + r.width / 2 - vp.width / 2)).toBeLessThan(1);
      expect(Math.abs(r.y + r.height / 2 - vp.height / 2)).toBeLessThan(1);
    }
  });
});

test.describe('customer dialog — a11y (axe with the dialog open)', () => {
  const serious = async (page: Page): Promise<unknown[]> => {
    await page.waitForTimeout(450); // entrance animation: axe must not read mid-fade colours
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  };

  test('H1/E1 empty — no serious/critical violations', async ({ page }) => {
    await setup(page);
    await gotoResumen(page);
    await trigger(page).click();
    await expect(dialog(page)).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });

  test('H2/E2 inline errors — no serious/critical violations', async ({ page }) => {
    await setup(page);
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    await d.getByLabel('Nombre').fill('M');
    await d.getByLabel('WhatsApp').fill('51234567');
    await cta(d).click();
    await expect(d.getByText('Marca la casilla para continuar.')).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
});

test.describe('generate -> load it back (mock adapter, interim for B3/B6)', () => {
  test('the code of a freshly generated quote loads the same cart after a reload', async ({ page }) => {
    await setup(page);
    await gotoResumen(page);
    await trigger(page).click();
    const d = dialog(page);
    const download = page.waitForEvent('download', { timeout: 15_000 });
    await fill(d, 'María López', '7123-4567');
    await cta(d).click();
    const name = (await download).suggestedFilename();
    const m = /^Cotizacion-(ALC-\d{8}-[0-9A-HJKMNP-TV-Z]{8})\.pdf$/.exec(name);
    expect(m, 'canonical folio (no U contingency marker) in mock mode').not.toBeNull();
    const code = m![1]!;

    await page.evaluate(() => sessionStorage.removeItem('alcusa-cotizador-cart')); // empty cart: no "Reemplazar" confirm
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    const toggle = page.getByRole('button', { name: '¿Ya tienes una cotización?', expanded: false });
    if (await toggle.count()) await toggle.click();
    await page.getByLabel('Código de tu cotización').fill(code.toLowerCase());
    await page.getByRole('button', { name: 'Cargar cotización' }).click();
    await expect(page).toHaveURL(/#cotizador\/4-resumen/);
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Resumen de tu cotización' }).getByText('Puerta de baño recta')).toBeVisible();
  });
});
