import { test as base, expect, type Locator, type Page } from '@playwright/test';

// Safety net (ADR-006): every e2e spec must import `test` from here instead
// of '@playwright/test' directly. Blocks wa.me, api.whatsapp.com and any
// *wompi* host so a test can never send a real WhatsApp message or touch
// real Wompi, even if PUBLIC_COTIZADOR_MODE is misconfigured.
//
// R4: `blockQuotePdf` aborts the lazy PDF chunk so "Enviar por WhatsApp (PDF)"
// lands in the G error state, where the text-only wa.me link (the pre-R4
// message, still built by buildQuoteMessage) is exposed. Specs that assert that
// message use `test.use({ blockQuotePdf: true })` + `textOnlyWaLink(page)`.
export const test = base.extend<{ blockQuotePdf: boolean }>({
  blockQuotePdf: [false, { option: true }],
  page: async ({ page, blockQuotePdf }, use) => {
    await page.route('**wa.me/**', (route) => route.abort());
    await page.route('**api.whatsapp.com/**', (route) => route.abort());
    await page.route('**wompi**/**', (route) => route.abort());
    if (blockQuotePdf) await page.route('**/_astro/render*.js', (route) => route.abort());
    await use(page);
  },
});

/**
 * Presses the PDF button, completes the R07.1 customer dialog (mock folio) and, with the PDF chunk
 * blocked, returns the G-card text-only wa.me link.
 */
export async function textOnlyWaLink(page: Page): Promise<Locator> {
  await page.getByTestId('quote-share-button').locator('visible=true').click();
  const dialog = page.getByRole('dialog', { name: 'Tus datos para la cotización' });
  await dialog.getByLabel('Nombre').fill('María López');
  await dialog.getByLabel('WhatsApp').fill('7123-4567');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Generar mi cotización' }).click();
  const link = page.getByTestId('quote-share-text-only').locator('visible=true');
  await expect(link).toBeVisible();
  return link;
}

export { expect };

// R5: step 0 is a 3-level selector (Categoria > Tipo > Acabado) + Siguiente.
const PICKS = {
  recta: ['Puertas de baño', 'Rectas'],
  jardin: ['Puertas de jardín', '1 hoja'],
  ventana: ['Ventanas', 'Francesa'],
  l: ['Puertas de baño', 'En L', 'Aquaclara'],
  templado: ['Puertas de baño', 'Templada'],
  bisagra: ['Puertas de baño', 'De bisagra'],
} as const;

/** Picks a product through the selector and advances to Medidas. Retries the
 * first click until the island is hydrated (same flake guard as before). */
export async function pickProduct(page: Page, which: keyof typeof PICKS): Promise<void> {
  const [cat, type, finish] = PICKS[which] as readonly [string, string, string?];
  const typeBtn = page.getByRole('button', { name: new RegExp('^' + type) });
  await expect(async () => {
    await page.getByRole('button', { name: new RegExp('^' + cat) }).click();
    await expect(typeBtn).toBeVisible({ timeout: 1500 });
  }).toPass();
  await typeBtn.click();
  if (finish) await page.getByRole('button', { name: new RegExp('^' + finish) }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
}
