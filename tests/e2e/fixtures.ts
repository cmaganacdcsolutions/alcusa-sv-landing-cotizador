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

/** Presses the PDF button (chunk blocked) and returns the G-card text-only wa.me link. */
export async function textOnlyWaLink(page: Page): Promise<Locator> {
  await page.getByTestId('quote-share-button').locator('visible=true').click();
  const link = page.getByTestId('quote-share-text-only').locator('visible=true');
  await expect(link).toBeVisible();
  return link;
}

export { expect };
