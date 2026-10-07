import type { Page, TestInfo } from '@playwright/test';
import path from 'node:path';
import { expect, test } from '../e2e/fixtures';
import { runAudit, type Violation } from './audit';
import { fillAddress } from '../support/address';

// qa-cot-resp — full-flow responsive sweep, every product, every viewport in
// playwright.responsive.config.ts (15 real device sizes). Producto -> Medidas
// -> Precio -> Zona/Entrega -> Resumen -> Forma de pago -> Wompi (mock) ->
// Resultado. Read-only assertions only (no product code edited by this spec).
// Run: E2E_PORT=4361 npx playwright test --config=playwright.responsive.config.ts

async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

// android412-style hydration race documented in the existing e2e suite
// (cotizador-ventana.spec.ts / cotizador-jardin.spec.ts) — same guard here so
// a slow first hydration doesn't produce a false-positive bug in this sweep.
async function openProduct(page: Page, nameRe: RegExp): Promise<void> {
  await page.goto('/cotizador');
  await waitForHydration(page);
  const card = page.getByRole('button', { name: nameRe });
  const nextBtn = page.getByRole('button', { name: 'Siguiente' });
  await expect(async () => {
    await card.click();
    await expect(nextBtn).toBeVisible({ timeout: 1500 });
  }).toPass();
}

async function clickSiguiente(page: Page): Promise<void> {
  // Mobile viewports move "Siguiente" into the `position: fixed` bottom bar;
  // Chromium/CDP mis-hit-tests fixed elements during emulated touch input on
  // tall forms (documented in cotizador-ventana.spec.ts) — force skips only
  // that hit-test re-check, every other actionability check still runs.
  await page.getByRole('button', { name: 'Siguiente' }).click({ force: true });
}

interface Bug extends Violation {
  product: string;
  viewport: string;
  step: string;
}

async function audit(page: Page, testInfo: TestInfo, ctx: { product: string; step: string }, checkModelImages = false): Promise<void> {
  const viewport = page.viewportSize();
  const vpLabel = viewport ? `${viewport.width}x${viewport.height}` : 'unknown';
  const violations = await runAudit(page, checkModelImages);
  if (violations.length === 0) return;

  const shotPath = path.join(
    'test-results',
    'qa-resp',
    `${ctx.product}__${vpLabel}__${ctx.step.replace(/\s+/g, '-')}.png`,
  );
  await page.screenshot({ path: shotPath, fullPage: true }).catch(() => undefined);

  const bugs: Bug[] = violations.map((v) => ({ ...v, product: ctx.product, viewport: vpLabel, step: ctx.step }));
  // Machine-readable record for the HANDOFF bug table — pulled from
  // results.json's per-test attachments after the run (see the parse step in
  // the HANDOFF), not from stdout (which reporters may truncate/interleave).
  await testInfo.attach('qa-resp-violations', { body: JSON.stringify(bugs, null, 2), contentType: 'application/json' });

  // sf-cot-models — `missing-model-image` is back in the gate: WindowForm.tsx
  // now renders a real <img> per Modelo option (Francesa/Bilbao), so this
  // check (audit.ts #8) should never fire again. Previously excluded here by
  // sf-cot-resp while that slice was owned elsewhere (see git history).
  expect
    .soft(
      violations,
      `${violations.length} violation(s) at ${ctx.product} / ${ctx.step} / ${vpLabel} — screenshot: ${shotPath}`,
    )
    .toEqual([]);
}

async function selectZonaAndAdvance(page: Page, testInfo: TestInfo, product: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
  await fillAddress(page, 'Soyapango');
  await audit(page, testInfo, { product, step: '3-zona' });
  await clickSiguiente(page);
}

async function throughResumenAndPayment(page: Page, testInfo: TestInfo, product: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
  await audit(page, testInfo, { product, step: '4-resumen' });

  await page.getByRole('button', { name: 'Pagar ahora' }).click();
  await expect(page.getByRole('heading', { name: 'Forma de pago' })).toBeVisible();
  await page.getByRole('radio', { name: /Pagar ahora/ }).click();
  await audit(page, testInfo, { product, step: '5-forma-pago' });

  await page.getByRole('button', { name: /Pagar \$\d+\.\d{2} con Wompi/ }).click();
  await expect(page.getByRole('heading', { name: 'Pago completado' })).toBeVisible({ timeout: 10000 });
  await audit(page, testInfo, { product, step: '7-resultado' });
}

// ---- per-product Medidas fillers (minimal valid data, mirrors tests/e2e) ----

async function fillRecta(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Natural' }).click();
  await page.getByRole('button', { name: 'Claro 5 mm' }).click();
}

async function fillL(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Natural' }).click();
  await page.getByRole('button', { name: 'Aquaclara' }).click();
}

async function fillTemplado(page: Page): Promise<void> {
  await page.locator('#ancho').fill('150');
}

async function fillBisagra(page: Page): Promise<void> {
  await page.locator('#ancho').fill('70');
  await page.getByRole('button', { name: 'Natural' }).click();
  await page.getByRole('button', { name: 'Claro 5 mm' }).click();
}

async function fillJardin(page: Page): Promise<void> {
  await page.getByLabel('Ancho exacto de tu espacio').fill('1.00');
  await page.getByRole('button', { name: '2.10 m', exact: true }).click();
}

async function fillVentana(page: Page, model: 'Francesa' | 'Bilbao', addSecondRow: boolean): Promise<void> {
  await page.getByRole('button', { name: model, exact: true }).click();
  await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
  await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
  await page.getByRole('button', { name: 'Blanco', exact: true }).click();
  await page.getByRole('button', { name: 'Claro', exact: true }).click();
  if (addSecondRow) {
    // WindowForm.tsx's actual label is "+ Agregar otra ventana" (the
    // original /Agregar ventana/ regex never matched — a spec typo, not a
    // real product bug — and timed out on every viewport in this flow).
    await page.getByRole('button', { name: /Agregar otra ventana/ }).click();
    await page.getByLabel('Cantidad, ventana 2').fill('1');
    await page.getByLabel('Ancho en metros, ventana 2').fill('1.50');
    await page.getByLabel('Alto en metros, ventana 2').fill('1.20');
  }
}

// ---- flow definitions ----

interface ProductFlow {
  id: string;
  cardNameRe: RegExp;
  fill: (page: Page) => Promise<void>;
  checkModelImages?: boolean;
}

const FLOWS: ProductFlow[] = [
  { id: 'recta', cardNameRe: /Puerta de baño recta/, fill: fillRecta },
  { id: 'l', cardNameRe: /Cabina en L/, fill: fillL },
  { id: 'templado', cardNameRe: /Templado 10 mm/, fill: fillTemplado },
  { id: 'bisagra', cardNameRe: /Puerta con bisagra/, fill: fillBisagra },
  { id: 'jardin', cardNameRe: /^Puerta de jardín/, fill: fillJardin },
  {
    id: 'ventana-francesa',
    cardNameRe: /Ventana Francesa o Bilbao/,
    fill: (p) => fillVentana(p, 'Francesa', false),
    checkModelImages: true,
  },
  {
    id: 'ventana-bilbao',
    cardNameRe: /Ventana Francesa o Bilbao/,
    fill: (p) => fillVentana(p, 'Bilbao', false),
    checkModelImages: true,
  },
  {
    id: 'ventana-multi-row',
    cardNameRe: /Ventana Francesa o Bilbao/,
    fill: (p) => fillVentana(p, 'Francesa', true),
    checkModelImages: true,
  },
];

for (const flow of FLOWS) {
  test(`${flow.id} — full flow, no overflow/overlap/clipping/broken images`, async ({ page }, testInfo) => {
    await openProduct(page, flow.cardNameRe);
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();
    await flow.fill(page);
    await audit(page, testInfo, { product: flow.id, step: '1-medidas' }, flow.checkModelImages ?? false);

    await clickSiguiente(page);
    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await audit(page, testInfo, { product: flow.id, step: '2-precio' });

    await clickSiguiente(page);
    await selectZonaAndAdvance(page, testInfo, flow.id);

    await throughResumenAndPayment(page, testInfo, flow.id);
  });
}

// Step 0 (Producto picker) is identical DOM regardless of which product gets
// picked afterwards — audited once per viewport here instead of once per
// product above, to avoid 8x redundant coverage of the same screen.
test('producto picker — no overflow/overlap/clipping', async ({ page }, testInfo) => {
  await page.goto('/cotizador');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
  await audit(page, testInfo, { product: 'picker', step: '0-producto' });
});
