import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';


// S3: hero, cómo funciona, confianza, información importante. New spec file
// (not shared with cotizador.spec.ts / whatsapp-links.spec.ts) to avoid
// merge conflicts with parallel slices touching the same test directory.
test.describe('landing — hero, cómo funciona, confianza, info importante (S3)', () => {
  test('intro del inicio: H1 + enlace a promociones, sin hero ni tarjetas de categoría', async ({ page }) => {
    await page.goto('/');
    const intro = page.locator('#inicio');
    await expect(intro.getByRole('heading', { level: 1 })).toHaveText('¿Qué quieres cambiar en tu casa hoy?');
    await expect(intro.getByRole('link', { name: 'Ver promociones del mes' })).toHaveAttribute('href', '#promociones');
    // El hero viejo (botones "Cotizar ahora"/"Ver catálogo", foto, tarjetas) ya no existe.
    await expect(page.locator('.hero__category-card, [data-hero-cta]')).toHaveCount(0);
  });

  test('landing on /#promociones scrolls the promos into view on load', async ({ page }) => {
    await page.goto('/#promociones');
    await expect(page.locator('#promociones')).toBeInViewport();
  });

  test('cómo funciona renders all steps, visible, no display:none, no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    const proceso = page.locator('#proceso');
    await proceso.scrollIntoViewIfNeeded();
    await expect(proceso).toBeVisible();

    // 2026-10-06: guia detallada de 7 pasos (antes 4: Selecciona/Cotiza/Confirma/Recibe).
    for (const step of ['Elige tu producto', 'Toca el color y el vidrio', 'Toca el botón «Cotizar»', 'Escribe las medidas de tu espacio', 'Mira tu precio estimado', 'Elige cómo lo quieres recibir', 'Confirma tu pedido']) {
      const item = proceso.getByRole('heading', { level: 3 }).filter({ hasText: step });
      await expect(item).toBeVisible();
    }

    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHorizontalScroll).toBe(false);
  });

  test('cómo funciona: 7 pasos numerados, sin visitas previas inventadas', async ({ page }) => {
    await page.goto('/');
    const proceso = page.locator('#proceso');
    await proceso.scrollIntoViewIfNeeded();
    await expect(proceso.getByText('Sin visitas previas', { exact: false })).toHaveCount(0);
    await expect(proceso.locator('ol > li')).toHaveCount(7);
  });

  test('confianza shows the official ALCUSA figures (38 años, +10,000 clientes, +10,000 puertas), no placeholders', async ({
    page,
  }) => {
    await page.goto('/');
    const confianza = page.locator('#confianza');
    await confianza.scrollIntoViewIfNeeded();
    await expect(confianza.locator('li')).toHaveCount(6);
    await expect(confianza.getByText('Más de 38 años')).toBeVisible();
    await expect(confianza.getByText('+10,000 clientes')).toBeVisible();
    await expect(confianza.getByText('+10,000 puertas')).toBeVisible();
    await expect(confianza.getByText('instaladas o reemplazadas')).toBeVisible();
    await expect(confianza.getByText('4.2 en Google', { exact: false })).toBeVisible();
    await expect(confianza.getByText('6 meses', { exact: false })).toBeVisible();
    await expect(confianza.getByText('confirmar', { exact: false })).toHaveCount(0);
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
