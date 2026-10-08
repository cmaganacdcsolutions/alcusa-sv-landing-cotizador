// R1 tracer: catalogo (ahora en el inicio, /#catalogo) -> /cotizador?producto=<slug> (ADR-008 §3/§4).
// Las paginas /catalogo/** ya son redirects a anclas del inicio (ver catalogo-redirects.spec.ts):
// los casos del catalogo se reescribieron contra las tarjetas del inicio (#p-<slug>).
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function waitForHydration(page: Page): Promise<void> {
  await page.locator('[data-testid="cotizador-root"][data-hydrated="true"]').waitFor();
}

const MEDIDAS = 'Medidas y acabado';

test.describe('catalogo -> cotizador deep link', () => {
  test('home shows the 3 categories in order; each tab scrolls to its section with its cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const titles = page.locator('#catalogo .csec .csec__title');
    await expect(titles).toHaveText(['Puertas de baño', 'Puertas de jardín', 'Ventanas']);
    const ids = await page.locator('#catalogo .csec').evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(['puertas-de-bano', 'puertas-de-jardin', 'ventanas']);

    await page
      .getByRole('navigation', { name: 'Categorías' })
      .getByRole('link', { name: 'Puertas de jardín', exact: true })
      .click();
    await expect(page).toHaveURL(/\/#puertas-de-jardin$/);
    await expect(page.locator('#puertas-de-jardin')).toBeInViewport();
    // 3 modelos de jardin con opciones + las 2 combinaciones "solo asesor" de "Más opciones para tu jardín"
    await expect(page.locator('#puertas-de-jardin article.pcard')).toHaveCount(5);
    await expect(page.locator('#puertas-de-jardin article.pcard:not(.pcard--advisor)')).toHaveCount(3);
  });

  test('home card CTA (sin opciones) lands in the cotizador with the product preselected on Medidas', async ({ page }) => {
    await page.goto('/');
    const cta = page.locator('#p-templada-10mm [data-go]');
    await expect(cta).toHaveText('Continuar al cotizador');
    await expect(cta).toHaveAttribute('href', '/cotizador?producto=templada-10mm&paso=medidas');
    await cta.click();
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: MEDIDAS })).toBeVisible();
  });

  test('home card form (con opciones) submits the deep link with the chosen color + vidrio and lands on Medidas', async ({ page }) => {
    await page.goto('/');
    // la tarjeta se mejora con JS (catalogHome.client): esperar a que termine antes de pulsar
    await page.waitForSelector('html[data-js]');
    const card = page.locator('#p-recta');
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', { name: /Continuar al cotizador/ }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname.replace(/\/$/, '') === '/cotizador' &&
        url.searchParams.get('producto') === 'recta' &&
        url.searchParams.get('paso') === 'medidas',
    );
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: MEDIDAS })).toBeVisible();
  });

  test('a variant slug applies its preset (garden 3 hojas)', async ({ page }) => {
    await page.goto('/cotizador?producto=jardin-3-hojas');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: MEDIDAS })).toBeVisible();
    await expect(page.getByRole('button', { name: /3 hojas/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('legacy ids keep the old contract (?producto=ventana preselects on step 0)', async ({ page }) => {
    await page.goto('/cotizador?producto=ventana');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Ventanas/, pressed: true })).toBeVisible();
  });

  test('an invalid slug is ignored: step 0, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/cotizador?producto=no-existe');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('advisorOnly leaf: home card without price/form (WhatsApp CTA); cotizador never enters the wizard and offers the WhatsApp advisor', async ({ page }) => {
    // El inicio SI tiene tarjeta ("Más opciones para tu jardín"), pero sin precio, sin formulario y sin entrada al asistente.
    await page.goto('/');
    const cards = page.locator('#p-jardin-2-fijas-2-corredizas, #p-jardin-1-fijo-3-corredizas');
    await expect(cards).toHaveCount(2);
    await expect(cards.locator('form, [data-go]')).toHaveCount(0);
    await expect(cards.locator('a[href^="https://wa.me/"]')).toHaveCount(2);
    await expect(cards.getByText(/Desde $/)).toHaveCount(0);

    await page.goto('/cotizador?producto=jardin-2-fijas-2-corredizas');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    await expect(page.getByTestId('advisor-notice').getByRole('link')).toHaveAttribute('href', /^https:\/\/wa\.me\//);
  });
});
