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

  test('cómo funciona: desktop shows the "sin visitas previas" lead copy and step 4\'s filled badge', async ({
    page,
  }) => {
    // Both are desktop-only per desktop-01-inicio.dc.html — absent from the
    // mobile boards (Main.dc.html / android-01-inicio).
    test.skip((page.viewportSize()?.width ?? 0) < 1024, 'lead copy + filled step 4 badge are desktop-only');

    await page.goto('/');
    const proceso = page.locator('#proceso');
    await proceso.scrollIntoViewIfNeeded();
    await expect(
      proceso.getByText('Sin visitas previas para saber el precio', { exact: false }),
    ).toBeVisible();

    const step4Badge = proceso.getByText('04', { exact: true });
    await expect(step4Badge).toBeVisible();
    // Steps 1-3 keep the light tint background; only step 4 is solid
    // primary-filled (desktop-01-inicio.dc.html ~L88).
    await expect(step4Badge).toHaveCSS('background-color', 'rgb(7, 59, 146)');
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
    await expect(info.getByText('[Tasa 0% — confirmar si se mantiene]')).toBeVisible();
    await expect(info.getByText('Retiro en tienda −15%')).toBeVisible();
  });

  test('"Antes de comprar" and "¿Tienes dudas...?" share the same #info container', async ({ page }) => {
    // desktop-01-inicio.dc.html nests <aside id="contacto"> INSIDE
    // <section id="info"> as its 2nd grid column (~L186-207); both mobile
    // boards stack them but they remain the same merged section. Assert the
    // DOM nesting, not just co-visibility, so a future regression that pulls
    // ContactoTeaser back out to a sibling section fails here.
    await page.goto('/');
    const info = page.locator('#info');
    await info.scrollIntoViewIfNeeded();
    await expect(info.getByRole('heading', { name: 'Información importante' })).toBeVisible();

    const contacto = info.locator('#contacto');
    await expect(contacto).toBeVisible();
    await expect(contacto.getByRole('heading', { name: '¿Tienes dudas sobre tu medida?' })).toBeVisible();
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
