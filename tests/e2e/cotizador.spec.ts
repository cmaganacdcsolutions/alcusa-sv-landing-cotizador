import type { Page } from '@playwright/test';
import { expect, pickProduct, test, textOnlyWaLink } from './fixtures';

test.use({ blockQuotePdf: true });

// android412 flake fix: Cotizador is `client:load`, hydrating asynchronously.
// Same wait pattern as tests/e2e/contacto.spec.ts for ContactForm.
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

// Full step 0->5 happy path for "recta" (T1.2/T1.3) + the out-of-range /
// requiresQuote edge states from prototype-spec.md §2.3. Never opens a real
// WhatsApp link — fixtures.ts blocks wa.me/wompi routes as a second guard.
test.describe('cotizador — recta, step 0 to 5', () => {
  test('drawer "Cotizar" navigates to the standalone /cotizador page at step 0', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    const drawerNav = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(drawerNav).toBeVisible();
    await drawerNav.getByRole('link', { name: 'Cotizar', exact: true }).click();
    await expect(page).toHaveURL(/\/cotizador$/);
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
  });

  test('happy path: recta 110cm Natural Claro, Soyapango, con instalación → $262.00 total + WhatsApp href', async ({
    page,
  }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);

    await pickProduct(page, 'recta');
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();

    await expect(page.locator('#ancho')).toHaveValue('110');
    await page.getByRole('button', { name: 'Natural' }).click();
    await page.getByRole('button', { name: 'Claro 5 mm' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Precio estimado' })).toBeVisible();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$222.00');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Entrega y zona' })).toBeVisible();
    await page.locator('#municipio').selectOption('Soyapango');
    await expect(page.getByTestId('zona-total-value')).toHaveText('$262.00');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
    await expect(page.getByTestId('resumen-total-value')).toHaveText('$262.00');

    const waLink = (await textOnlyWaLink(page));
    const href = await waLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toMatch(/^https:\/\/wa\.me\/50376802410\?text=/);

    const decoded = decodeURIComponent(href!.split('?text=')[1]);
    expect(decoded).toContain('Hola ALCUSA, quiero confirmar esta cotización:');
    expect(decoded).toContain('Puerta de baño recta — 1.10×1.85 m · Color: Natural · Vidrio: Claro 5 mm');
    expect(decoded).toContain('Zona: Soyapango · Entrega: con instalación');
    expect(decoded).toContain('Subtotal: $222.00');
    expect(decoded).toContain('Transporte: $40.00');
    expect(decoded).toContain('Total estimado: $262.00');
    expect(decoded).toContain('Anticipo (80%): $209.60 · Saldo (20% al entregar): $52.40');
    expect(decoded).toContain('Dirección: [dirección]');
  });

  test('retiro en tienda: 110cm Natural Claro → $188.70, sin transporte', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await page.getByRole('button', { name: 'Retiro en tienda −15%' }).click();
    await expect(page.getByTestId('zona-total-value')).toHaveText('$188.70');
  });

  test('out-of-range width (75cm) shows the "Cotización personalizada por WhatsApp" card, Siguiente disabled', async ({
    page,
  }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'recta');
    await page.locator('#ancho').fill('75');

    await expect(page.getByText('Cotización personalizada por WhatsApp')).toBeVisible();
    await expect(
      page.getByText('El ancho debe ser de 80 a 200 cm y la altura de 1.85 m. Para otras medidas, consulta con ALCUSA.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  test('out-of-range width (201cm) shows the same personalized-quote card', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'recta');
    await page.locator('#ancho').fill('201');

    await expect(page.getByText('Cotización personalizada por WhatsApp')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  test('municipio outside the 23-zone list shows the transport empty state', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await page.locator('#municipio').selectOption('otro');
    await expect(page.getByText('Tu zona aún no tiene tarifa de transporte automática')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  test('125cm Blanco Claro prices at $366 (Table C tier 1.3)', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'recta');
    await page.locator('#ancho').fill('125');
    await page.getByRole('button', { name: 'Blanco' }).click();
    await page.getByRole('button', { name: 'Claro 5 mm' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByTestId('step2-price-value')).toHaveText('$366.00');
  });
});

// S5 T5.1 — Cabina en L (corner). Fixed 0.80x0.80x1.85m, no width input.
// NOTE: the slice doc's AC says "zone San Salvador" (fee $0) but its dollar
// figures ($484/$620/$690) are the exploratory-report.md §3.1 "Verified UI
// outputs" table, which is explicitly captioned "zone Soyapango = +$40" —
// pre-zone engine price is $444/$580/$650 (see corner.test.ts). Asserting
// the Soyapango-zone TOTAL here matches the actual source data; flagged in
// tech-debt.md / HANDOFF as a slice-doc wording bug, not an engine bug.
test.describe('cotizador — corner (Cabina en L)', () => {
  test('Natural Aquaclara/Frosted/Aquafold total $484/$620/$690 at Soyapango (T5.1 AC)', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'l');
    await expect(page.getByRole('heading', { name: 'Medidas y acabado' })).toBeVisible();

    await page.getByRole('button', { name: 'Natural' }).click();
    await page.getByRole('button', { name: 'Aquaclara' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$444.00');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.locator('#municipio').selectOption('Soyapango');
    await expect(page.getByTestId('zona-total-value')).toHaveText('$484.00');
  });

  test('Frosted totals $620 at Soyapango', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'l');
    await page.getByRole('button', { name: 'Natural' }).click();
    await page.getByRole('button', { name: 'Frosted' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$580.00');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.locator('#municipio').selectOption('Soyapango');
    await expect(page.getByTestId('zona-total-value')).toHaveText('$620.00');
  });

  test('Aquafold totals $690 at Soyapango', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'l');
    await page.getByRole('button', { name: 'Natural' }).click();
    await page.getByRole('button', { name: 'Aquafold' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$650.00');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.locator('#municipio').selectOption('Soyapango');
    await expect(page.getByTestId('zona-total-value')).toHaveText('$690.00');
  });

  test('no "Blanco" chip is rendered for corner (T5.1 AC)', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'l');
    await expect(page.getByRole('button', { name: 'Blanco', exact: true })).toHaveCount(0);
  });
});

// S5 T5.2 — Templado 10mm. Ancho 120-200cm, alto fijo 2.00m. Same Soyapango
// caveat as corner above: pre-zone engine price is $672/$840/$980/$1120
// (widthM x 560, see tempered.test.ts); the AC's $712/$880/$1,020/$1,160
// are the Soyapango-zone totals (+$40) per exploratory-report.md §3.1.
test.describe('cotizador — tempered (Templado 10 mm)', () => {
  for (const [width, rawText, totalText] of [
    ['120', '$672.00', '$712.00'],
    ['150', '$840.00', '$880.00'],
    ['175', '$980.00', '$1020.00'],
    ['200', '$1120.00', '$1160.00'],
  ] as const) {
    test(`${width}cm totals ${totalText} at Soyapango (T5.2 AC)`, async ({ page }) => {
      await page.goto('/cotizador');
      await waitForHydration(page);
      await pickProduct(page, 'templado');
      await page.locator('#ancho').fill(width);
      await page.getByRole('button', { name: 'Siguiente' }).click();
      await expect(page.getByTestId('step2-price-value')).toHaveText(rawText);
      await page.getByRole('button', { name: 'Siguiente' }).click();
      await page.locator('#municipio').selectOption('Soyapango');
      await expect(page.getByTestId('zona-total-value')).toHaveText(totalText);
    });
  }

  test('119cm and 201cm show the "Cotización personalizada por WhatsApp" card (T5.2 AC)', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'templado');

    await page.locator('#ancho').fill('119');
    await expect(page.getByText('Cotización personalizada por WhatsApp')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    await page.locator('#ancho').fill('201');
    await expect(page.getByText('Cotización personalizada por WhatsApp')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});

// S5 T5.3 — Puerta con bisagra (hinged). Ancho 40-90cm, cantidad 1-50.
test.describe('cotizador — hinged (Puerta con bisagra)', () => {
  test('70cm natural claro qty1 prices at $270 (T5.3 AC)', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'bisagra');
    await page.locator('#ancho').fill('70');
    await page.getByRole('button', { name: 'Natural' }).click();
    await page.getByRole('button', { name: 'Claro 5 mm' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$270.00');
  });

  test('65cm natural nevado qty2 prices at $622 (T5.3 AC)', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'bisagra');
    await page.locator('#ancho').fill('65');
    await page.getByRole('button', { name: 'Natural' }).click();
    await page.getByRole('button', { name: 'Nevado 5 mm' }).click();
    await page.locator('#cantidad').fill('2');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$622.00');
  });

  test('40cm decorado (blanco) qty1 prices at $449 exactly as encoded (T5.3 AC)', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'bisagra');
    await page.locator('#ancho').fill('40');
    await page.getByRole('button', { name: 'Blanco' }).click();
    // Scoped to cotizador-root: Galeria's lightbox trigger aria-labels also
    // contain "Decorado" (e.g. "...vidrio decorado instalada"), which makes
    // the unscoped locator ambiguous (strict-mode violation) now that the
    // gallery section renders on the same page.
    await page.getByTestId('cotizador-root').getByRole('button', { name: 'Decorado' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('step2-price-value')).toHaveText('$449.00');
  });

  test('qty 0 or 51 shows "Ingresa una cantidad entre 1 y 50.", Siguiente disabled (T5.3 AC)', async ({ page }) => {
    await page.goto('/cotizador');
    await waitForHydration(page);
    await pickProduct(page, 'bisagra');
    await page.locator('#ancho').fill('70');

    await page.locator('#cantidad').fill('0');
    await expect(page.getByText('Ingresa una cantidad entre 1 y 50.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    await page.locator('#cantidad').fill('51');
    await expect(page.getByText('Ingresa una cantidad entre 1 y 50.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    await page.locator('#cantidad').fill('50');
    await expect(page.getByText('Ingresa una cantidad entre 1 y 50.')).not.toBeVisible();
  });
});

// S5 — "?producto=<id>" preselect contract (Foreman correction: the
// cotizador becomes its own /cotizador page after this wave; catalog CTAs
// will link with this query param instead of a hash suffix).
test.describe('cotizador — ?producto=<id> preselect', () => {
  test('preselects the product card on mount without leaving step 0', async ({ page }) => {
    await page.goto('/cotizador?producto=l');
    await waitForHydration(page);
    await expect(page.getByRole('button', { name: /^En L/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
