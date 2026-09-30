import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';


// R3 (2026-09-30): el grid de catalogo, la galeria, el banner del cotizador y las anclas
// /#modelos /#galeria salieron de la landing. Estos casos se marcan fixme (NO se borran):
// los de catalogo/galeria se re-hospedan en /catalogo (slice R2); los de nav se reescriben
// contra el drawer/footer nuevos. Ver HANDOFF R3.
const R3_MOVED = new Set<string>(["landing on /#cotizador scrolls the cotizador teaser into view on load"]);
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.fixme(R3_MOVED.has(info.title), 'R3: seccion fuera de la landing; migrar (ver HANDOFF R3)');
});

// S3: hero, cómo funciona, confianza, información importante. New spec file
// (not shared with cotizador.spec.ts / whatsapp-links.spec.ts) to avoid
// merge conflicts with parallel slices touching the same test directory.
test.describe('landing — hero, cómo funciona, confianza, info importante (S3)', () => {
  test('hero (r01): H1 + botones "Cotizar ahora" y "Ver catálogo", sin tarjetas de categoría', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('#inicio');
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('¿Qué quieres cambiar en tu casa hoy?');
    await expect(hero.getByRole('link', { name: /Cotizar ahora/ })).toHaveAttribute('href', '/cotizador');
    await expect(hero.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/catalogo');
    await expect(hero.locator('.hero__category-card')).toHaveCount(0);
  });

  test('landing on /#cotizador scrolls the cotizador teaser into view on load', async ({ page }) => {
    await page.goto('/#cotizador');
    await expect(page.locator('#cotizador')).toBeInViewport();
  });

  test('cómo funciona renders all 4 steps, visible, no display:none, no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    const proceso = page.locator('#proceso');
    await proceso.scrollIntoViewIfNeeded();
    await expect(proceso).toBeVisible();

    for (const step of ['Selecciona', 'Cotiza', 'Confirma', 'Recibe']) {
      const item = proceso.getByText(step, { exact: true });
      await expect(item).toBeVisible();
    }

    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHorizontalScroll).toBe(false);
  });

  test('cómo funciona: r01 no dibuja lead, conectores ni insignia rellena (4 tarjetas planas de texto)', async ({ page }) => {
    await page.goto('/');
    const proceso = page.locator('#proceso');
    await proceso.scrollIntoViewIfNeeded();
    await expect(proceso.getByText('Sin visitas previas', { exact: false })).toHaveCount(0);
    await expect(proceso.locator('li')).toHaveCount(4);
    // El numero es texto Fraunces #0956d8 sin fondo, tambien el 04.
    await expect(proceso.getByText('04', { exact: true })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });

  test('confianza shows the literal bracketed placeholder for años (4 items, as on the board), not a picked number', async ({
    page,
  }) => {
    await page.goto('/');
    const confianza = page.locator('#confianza');
    await confianza.scrollIntoViewIfNeeded();
    await expect(confianza.getByText('[AÑOS — confirmar 35/39]')).toBeVisible();
    // R3 fidelity: the board draws exactly 4 items; the pending clients figure is not in the UI.
    await expect(confianza.getByText('[+10,000/+15,000 — confirmar]')).toHaveCount(0);
    await expect(confianza.locator('li')).toHaveCount(4);
    await expect(confianza.getByText('4.2 en Google', { exact: false })).toBeVisible();
    await expect(confianza.getByText('6 meses', { exact: false })).toBeVisible();
  });

  test('info importante: AMEX-exclusion and 80/20 copy match the cotizador payment step wording exactly', async ({
    page,
  }) => {
    await page.goto('/');
    const info = page.locator('#info');
    await info.scrollIntoViewIfNeeded();
    await expect(info.getByText('Anticipo 80% · saldo 20%')).toBeVisible();
    await expect(info.getByText('Crédito y débito, excepto American Express.')).toBeVisible();
    // r01 dibuja 4 items; la fila placeholder "Tasa 0%" ya no esta en la UI.
    await expect(info.getByText('Tasa 0%', { exact: false })).toHaveCount(0);
    await expect(info.locator('li')).toHaveCount(4);
    await expect(info.getByText('Retiro en tienda −15%')).toBeVisible();
  });

  test('"¿Tienes dudas...?" es una seccion propia tras #info: visible en movil, oculta en desktop (r01)', async ({
    page,
  }) => {
    await page.goto('/');
    const contacto = page.locator('#contacto');
    await expect(page.locator('#info #contacto')).toHaveCount(0);
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await expect(contacto).toBeHidden();
      return;
    }
    await contacto.scrollIntoViewIfNeeded();
    await expect(contacto.getByRole('heading', { name: '¿Tienes dudas sobre tu medida?' })).toBeVisible();
    await expect(contacto.getByRole('link', { name: 'Contacto' })).toBeVisible();
    await expect(contacto.getByRole('link', { name: 'WhatsApp' })).toBeVisible();
  });

  test('landing sections (hero, proceso, confianza, info) have zero critical/serious axe violations', async ({
    page,
  }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .include('#inicio')
      .include('#proceso')
      .include('#confianza')
      .include('#info')
      .analyze();

    const seriousOrCritical = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(seriousOrCritical).toEqual([]);
  });
});
