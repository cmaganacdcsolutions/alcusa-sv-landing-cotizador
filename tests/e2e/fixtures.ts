import { test as base, expect, type Page } from '@playwright/test';

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
