import type { Locator, Page } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';
import { fillAddress } from '../support/address';

// 2026-10-06 — hover de TODOS los botones "como el del navbar": cambio suave de relleno/color/borde, SIN elevacion
// y SIN sombra. Cotizador + /contacto, a 1440 con puntero fino (en un movil tactil no hay hover).
// Por clase de boton: la propiedad que cambia al pasar el raton (relleno o borde, segun el tipo), el transform
// sigue en `none`, el box-shadow no cambia; un boton deshabilitado o una opcion elegida no cambia en nada.

test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });
// eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop1920', 'hover = puntero fino; se verifica solo a 1440 de escritorio');
});

type Prop = 'backgroundColor' | 'borderColor' | 'color';
interface Snap {
  backgroundColor: string;
  borderColor: string;
  color: string;
  transform: string;
  boxShadow: string;
}

async function snap(loc: Locator): Promise<Snap> {
  return loc.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      backgroundColor: cs.backgroundColor,
      borderColor: cs.borderTopColor,
      color: cs.color,
      transform: cs.transform,
      boxShadow: cs.boxShadow,
    };
  });
}

async function hydrated(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

/** El boton cambia `prop` al pasar el raton; nunca se eleva ni cambia de sombra. */
async function expectHoverChanges(page: Page, loc: Locator, prop: Prop): Promise<void> {
  await loc.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const before = await snap(loc);
  expect(before.transform).toBe('none');
  await loc.hover();
  await expect.poll(async () => (await snap(loc))[prop]).not.toBe(before[prop]);
  await page.waitForTimeout(250); // fin de la transicion de 160 ms
  const after = await snap(loc);
  expect(after.transform).toBe('none');
  expect(after.boxShadow).toBe(before.boxShadow);
  await page.mouse.move(0, 0);
}

/** Deshabilitado / elegido: pasar el raton no cambia nada. */
async function expectHoverUnchanged(page: Page, loc: Locator): Promise<void> {
  await loc.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  const before = await snap(loc);
  await loc.hover({ force: true });
  await page.waitForTimeout(350);
  expect(await snap(loc)).toEqual(before);
  await page.mouse.move(0, 0);
}

test.describe('hover de botones — cotizador (1440)', () => {
  test('paso 0: volver (fantasma sobre azul), ficha de categoria, ficha elegida y boton deshabilitado', async ({
    page,
  }) => {
    await page.goto('/cotizador');
    await hydrated(page);

    await expectHoverChanges(page, page.locator('.cotizador__back').first(), 'backgroundColor');

    const tile = page.locator('.sel-tile--cat').first();
    await expectHoverChanges(page, tile, 'borderColor');

    // Las etiquetas solo parten entre palabras ("Puertas", no "Puer-tas") y no se desbordan de su ficha.
    const labels = page.locator('.sel-tile--cat .sel-tile__n');
    for (let i = 0; i < (await labels.count()); i++) {
      const m = await labels.nth(i).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { wrap: cs.overflowWrap, brk: cs.wordBreak, hy: cs.hyphens, over: el.scrollWidth - el.clientWidth };
      });
      expect(m).toEqual({ wrap: 'normal', brk: 'normal', hy: 'none', over: expect.any(Number) });
      expect(m.over).toBeLessThanOrEqual(1);
    }

    await tile.click(); // queda elegida (.on): pasar el raton no la cambia
    await expect(tile).toHaveClass(/\bon\b/);
    await expectHoverUnchanged(page, tile);
    const type = page.locator('.sel-tile:not(.sel-tile--cat)').first();
    await expectHoverChanges(page, type, 'borderColor');

    // Boton primario deshabilitado del aside: sin hover.
    const disabled = page.locator('.bt.bd:disabled').first();
    if (await disabled.count()) await expectHoverUnchanged(page, disabled);
  });

  test('medidas: chips de color y de vidrio, primario Siguiente, secundario WhatsApp y opcion elegida', async ({
    page,
  }) => {
    await page.goto('/cotizador');
    await hydrated(page);
    await pickProduct(page, 'recta');
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();

    await expectHoverChanges(page, page.locator('.chip:not([aria-pressed="true"])').first(), 'borderColor');
    await expectHoverUnchanged(page, page.locator('.chip[aria-pressed="true"]').first());
    await expectHoverChanges(page, page.locator('.glass-chip:not([aria-pressed="true"])').first(), 'borderColor');
    await expectHoverUnchanged(page, page.locator('.glass-chip[aria-pressed="true"]').first());

    await expectHoverChanges(
      page,
      page.locator('.cotizador-aside__cta.btn-primary:not([aria-disabled="true"])').first(),
      'backgroundColor',
    );
    await expectHoverChanges(page, page.locator('.btn-whatsapp-outline').first(), 'backgroundColor');
  });

  test('entrega y zona, resumen y forma de pago: opciones, selects, enlaces y WhatsApp', async ({ page }) => {
    await page.goto('/cotizador');
    await hydrated(page);
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();

    await expectHoverChanges(page, page.locator('.delivery-option:not([aria-pressed="true"])').first(), 'borderColor');
    await expectHoverUnchanged(page, page.locator('.delivery-option[aria-pressed="true"]').first());
    await expectHoverChanges(page, page.locator('.select-field').first(), 'borderColor');

    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expectHoverChanges(page, page.locator('.summary-add').first(), 'backgroundColor');
    await expectHoverChanges(page, page.locator('.summary-card__zone-change').first(), 'backgroundColor');

    await page.getByRole('button', { name: 'Pagar ahora' }).click();
    await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();
    const unchecked = page.locator('.payment-option[data-checked="false"]').first();
    await expectHoverChanges(page, unchecked, 'borderColor'); // hover sobre la tarjeta entera
    await expectHoverUnchanged(page, page.locator('.payment-option[data-checked="true"]').first());
    await page.locator('.payment-option__head').first().click(); // WhatsApp elegido -> boton verde
    const wa = page.locator('.btn-whatsapp:visible').first();
    await expect(wa).toBeVisible();
    await expectHoverChanges(page, wa, 'backgroundColor');
  });
});

test.describe('hover de botones — /contacto (1440)', () => {
  test('enviar: sin hover mientras esta deshabilitado; verde fuerte al completarlo', async ({ page }) => {
    await page.goto('/contacto');
    const disabled = page.locator('.contact-form__submit--disabled');
    await expect(disabled).toBeVisible();
    await expectHoverUnchanged(page, disabled);

    await page.getByLabel('Nombre').fill('María');
    await page.getByLabel('Teléfono').fill('77778888');
    const submit = page.locator('a.contact-form__submit');
    await expect(submit).toBeVisible();
    await expectHoverChanges(page, submit, 'backgroundColor');
  });
});
