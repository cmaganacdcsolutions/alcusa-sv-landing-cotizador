import type { Page } from '@playwright/test';
import { expect, test, textOnlyWaLink } from './fixtures';

test.use({ blockQuotePdf: true });

// S7 — multi-item cart. Never opens a real WhatsApp/Wompi link (fixtures.ts
// blocks those routes); every assertion decodes the built href instead.
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

// recta 110cm/Natural/Claro con instalación a Soyapango ($222 + $40 = $262,
// same check-values as tests/e2e/cotizador.spec.ts) then "+ Agregar otro
// producto" commits it and loops back to step 0.
async function addRectaThenLoop(page: Page): Promise<void> {
  await page.goto('/cotizador');
  await waitForHydration(page);

  await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
  await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
  await page.locator('#municipio').selectOption('Soyapango');
  await expect(page.getByTestId('zona-total-value')).toHaveText('$262.00');
  await page.getByRole('button', { name: 'Siguiente' }).click();

  await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
  await expect(page.locator('.summary-item')).toHaveCount(1);

  await page.getByRole('button', { name: 'Agregar otro producto' }).click();
  await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
}

test.describe('cotizador cart — S7 multi-item resumen', () => {
  test('adding a 2nd product (Cabina en L) shows 2 rows, ONE transport line, and the correct total', async ({
    page,
  }) => {
    await addRectaThenLoop(page);

    // Item 2 — Cabina en L (defaults: Aquaclara/Natural = $444 pre-zone,
    // quote.test.ts's own check-value). The zone step is order-level and
    // was already set on item 1, so "Siguiente" from Precio skips straight
    // to Resumen (T7.2 — never re-asks for zone/transport per item).
    await page.getByRole('button', { name: 'Cabina en L' }).click();
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$444.00');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.locator('.summary-item')).toHaveCount(2);
    await expect(page.getByText('Tus productos · 2 productos')).toBeVisible();
    await expect(page.getByText('Transporte · Soyapango')).toBeVisible();
    // 222 (recta) + 444 (corner) + 40 (Soyapango, ONCE) = 706 — never 40x2.
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$706.00');

    const waLink = (await textOnlyWaLink(page));
    const href = await waLink.getAttribute('href');
    const decoded = decodeURIComponent(href!.split('?text=')[1]);
    expect(decoded).toContain('1. Puerta de baño recta');
    expect(decoded).toContain('2. Cabina en L');
    expect(decoded).toContain('Transporte: $40.00');
    expect(decoded).toContain('Total estimado: $706.00');

    // Quitar the recta row — only Cabina en L (+ its $40 transport) remains.
    await page.getByRole('button', { name: 'Quitar Puerta de baño recta' }).click();
    await expect(page.locator('.summary-item')).toHaveCount(1);
    await expect(page.getByText('Tus productos · 1 producto')).toBeVisible();
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$484.00');
  });

  test('sf-cot-s7gaps gap 1 — desktop Editar on item 1 updates it in place (same row order)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1920', 'desktop-only affordance, desktop-05-cotizador-resumen.dc.html');
    await addRectaThenLoop(page);
    await page.getByRole('button', { name: 'Cabina en L' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.locator('.summary-item')).toHaveCount(2);

    // Item 1 (recta) is the first row — its Editar takes us to Medidas with
    // the recta fields loaded (not Cabina en L's).
    await page.getByRole('button', { name: 'Editar Puerta de baño recta' }).click();
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await expect(page.locator('#ancho')).toHaveValue('110');

    await page.locator('#ancho').fill('150');
    await page.getByRole('button', { name: 'Siguiente' }).click(); // -> Precio
    await page.getByRole('button', { name: 'Siguiente' }).click(); // zoneDecided -> straight to Resumen

    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    const rows = page.locator('.summary-item');
    await expect(rows).toHaveCount(2);
    // still 2 rows, recta FIRST (its position kept) with the updated detail.
    await expect(rows.nth(0)).toContainText('Puerta de baño recta');
    await expect(rows.nth(0)).toContainText('1.50 × 1.85 m');
    await expect(rows.nth(1)).toContainText('Cabina en L');
    // 328 (recta 150cm natural/claro) + 444 (corner) + 40 (Soyapango) = 812.
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$812.00');
  });

  test('sf-cot-s7gaps gap 2 — "Cambiar" zone with 2 items shows the whole-order breakdown, total matches Resumen', async ({
    page,
  }) => {
    await addRectaThenLoop(page);
    await page.getByRole('button', { name: 'Cabina en L' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    const resumenTotal = await page.getByTestId('resumen-total-value').textContent();
    expect(resumenTotal).toBe('$706.00');

    await page.getByRole('button', { name: 'Cambiar' }).click();
    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();

    // Breakdown's first row rolls up into "N productos" + the order
    // subtotal (222 + 444 = 666) instead of just Cabina en L's own price —
    // consistent with Resumen/orderTotal (gap 2).
    await expect(page.getByText('2 productos · con instalación')).toBeVisible();
    await expect(page.locator('.breakdown__row', { hasText: '2 productos' })).toContainText('$666.00');
    await expect(page.getByTestId('zona-total-value')).toHaveText(resumenTotal!);
  });

  test('the cart survives a reload (sessionStorage) — the committed item is still there', async ({ page }) => {
    await addRectaThenLoop(page); // cart: [recta $222], back at step 0

    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();

    // Only the CART is persisted, not the order-level zone (session-only by
    // design) — so a fresh session still asks for the zone once more before
    // Resumen, same as item 1's very first pass.
    await page.getByRole('button', { name: 'Cabina en L' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
    await page.locator('#municipio').selectOption('Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    // The recta committed BEFORE the reload is still in the cart (proof of
    // persistence) alongside the freshly-configured Cabina en L.
    const summaryCard = page.locator('.summary-card');
    await expect(summaryCard.locator('.summary-item')).toHaveCount(2);
    await expect(summaryCard.getByText('Puerta de baño recta')).toBeVisible();
    await expect(summaryCard.getByText('Cabina en L')).toBeVisible();
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$706.00');
  });
});
