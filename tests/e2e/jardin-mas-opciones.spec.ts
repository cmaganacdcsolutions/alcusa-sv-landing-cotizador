import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

// "Más opciones para tu jardín" (inicio, categoria Puertas de jardin): 2 combinaciones SOLO ASESOR despues de las 3 tarjetas
// con opciones. Misma tarjeta (.pcard) en su variante --advisor: solo portada foto, sin selects ni precio "Desde";
// el CTA abre WhatsApp con un asesor (nunca el cotizador). Never opens wa.me (asserts hrefs; fixtures.ts aborts the route).

const WA_NUMBER = '50376802410';
const CARDS = [
  { slug: 'jardin-2-fijas-2-corredizas', title: '2 fijas + 2 corredizas', alt: /un vidrio fijo en cada extremo y dos hojas corredizas/, h: '600' },
  { slug: 'jardin-1-fijo-3-corredizas', title: '1 fijo + 3 corredizas', alt: /un vidrio fijo y tres hojas corredizas/, h: '1067' },
] as const;
const waHref = (title: string): string =>
  `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Hola, quiero cotizar una puerta de jardín ${title}`)}`;

// Contenido independiente del viewport: un solo proyecto basta (los anchos 390/1440 se fijan abajo).
// eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop1920', 'content check, sets its own viewports');
});

test.describe('inicio - Más opciones para tu jardín', () => {
  test('sub-bloque con su titulo, despues de las 3 tarjetas de jardin, con 2 tarjetas ancladas #p-<slug>', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#puertas-de-jardin');
    const more = section.getByRole('region', { name: 'Más opciones para tu jardín' });
    await expect(more).toBeVisible();
    await expect(more.getByRole('heading', { level: 3, name: 'Más opciones para tu jardín' })).toHaveCount(1);
    await expect(more.locator('article.pcard')).toHaveCount(2);
    await expect(more.locator('article.pcard').evaluateAll((els) => els.map((e) => e.id))).resolves.toEqual(
      CARDS.map((c) => `p-${c.slug}`),
    );
    // Titulos de tarjeta un nivel bajo el titulo del sub-bloque (h3 -> h4).
    await expect(more.getByRole('heading', { level: 4 })).toHaveText(CARDS.map((c) => c.title));
    // Orden: las 3 tarjetas con opciones primero, el sub-bloque despues.
    const order = await section.locator('article.pcard').evaluateAll((els) => els.map((e) => e.id));
    expect(order).toEqual(['p-jardin-1-hoja', 'p-jardin-2-hojas', 'p-jardin-3-hojas', ...CARDS.map((c) => `p-${c.slug}`)]);
  });

  test('cada tarjeta: sin selects ni precio "Desde", linea de alto, "Cotización personalizada" y CTA de asesor a WhatsApp', async ({
    page,
  }) => {
    await page.goto('/');
    for (const { slug, title } of CARDS) {
      const card = page.locator(`#p-${slug}`);
      await expect(card.getByRole('heading', { name: title })).toBeVisible();
      await expect(card.locator('.pcard__line')).toHaveText('Alto 2.10 o 2.40 m');
      await expect(card.locator('.pcard__price')).toHaveText('Cotización personalizada');
      await expect(card.locator('form, select, [role="combobox"]')).toHaveCount(0);
      await expect(card.getByText(/Desde/)).toHaveCount(0);
      const cta = card.getByRole('link', { name: /Cotizar con un asesor/ });
      await expect(cta).toHaveText('Cotizar con un asesor');
      await expect(cta).toHaveAttribute('href', waHref(title));
      await expect(cta).toHaveAttribute('target', '_blank');
      await expect(cta).toHaveAttribute('rel', /noopener/);
      // Nunca entra al cotizador: ningun enlace de la tarjeta apunta a /cotizador.
      await expect(card.locator('a[href*="/cotizador"]')).toHaveCount(0);
    }
  });

  test('2 fotos oficiales que cargan, con alt y width/height explicitos', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/images/fotos/') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    await page.goto('/');
    await page.evaluate(() => document.querySelectorAll('img').forEach((img) => (img.loading = 'eager')));
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete), undefined, { timeout: 10_000 });
    for (const { slug, alt, h } of CARDS) {
      const img = page.locator(`#p-${slug} img.photo-frame__img`);
      await expect(img).toHaveCount(1);
      await expect(img).toHaveAttribute('src', `/images/fotos/${slug}-800.webp`);
      await expect(img).toHaveAttribute('alt', alt);
      await expect(img).toHaveAttribute('width', '800');
      await expect(img).toHaveAttribute('height', h);
      expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth), `${slug}: naturalWidth`).toBeGreaterThan(0);
    }
    await expect(page.locator('#puertas-de-jardin .pcard__nophoto')).toHaveCount(0);
    expect(failed).toEqual([]);
  });

  for (const w of [390, 1440] as const) {
    test(`sin desborde horizontal @${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/');
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `/ @${w}`).toBeLessThanOrEqual(0);
      // Las tarjetas del sub-bloque caben en su columna (sin recortes ni salir del viewport).
      for (const { slug } of CARDS) {
        const box = await page.locator(`#p-${slug}`).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right };
        });
        expect(box.left, `${slug} @${w}`).toBeGreaterThanOrEqual(0);
        expect(box.right, `${slug} @${w}`).toBeLessThanOrEqual(w);
      }
    });
  }

  for (const w of [390, 1440] as const) {
    test(`axe: la categoria Puertas de jardin (con el sub-bloque) no tiene violaciones @${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/');
      await page.locator('#puertas-de-jardin').scrollIntoViewIfNeeded();
      const summary = (r: Awaited<ReturnType<AxeBuilder['analyze']>>): string[] =>
        r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
      // Toda la categoria (con el sub-bloque): WCAG A/AA, como el resto de specs de axe del inicio.
      const wcag = await new AxeBuilder({ page }).include('#puertas-de-jardin').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(summary(wcag)).toEqual([]);
      // El sub-bloque nuevo ademas pasa las buenas practicas (jerarquia de titulos, landmarks, roles).
      const best = await new AxeBuilder({ page }).include('.csec__more').withTags(['wcag2a', 'wcag2aa', 'best-practice']).analyze();
      expect(summary(best)).toEqual([]);
    });
  }
});
