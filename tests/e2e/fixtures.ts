import { test as base, expect } from '@playwright/test';

// Safety net (ADR-006): every e2e spec must import `test` from here instead
// of '@playwright/test' directly. Blocks wa.me, api.whatsapp.com and any
// *wompi* host so a test can never send a real WhatsApp message or touch
// real Wompi, even if PUBLIC_COTIZADOR_MODE is misconfigured.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**wa.me/**', (route) => route.abort());
    await page.route('**api.whatsapp.com/**', (route) => route.abort());
    await page.route('**wompi**/**', (route) => route.abort());
    await use(page);
  },
});

export { expect };
