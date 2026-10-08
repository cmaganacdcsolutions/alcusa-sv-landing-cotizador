import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { waitForPageSettled } from '../support/settle';

// Catalogo del inicio (sustituye a los specs de las paginas /catalogo/** eliminadas: catalogo-r2 y catalogo-galeria,
// ver catalogo-redirects.spec.ts para las URLs viejas). El catalogo completo vive en `/`: 3 secciones y una tarjeta
// por producto (#p-<slug>) con su render, su precio "Desde $X" y un formulario GET hacia el cotizador.
// Never opens wa.me (asserts hrefs).

const WIDTHS = [360, 390, 412, 768, 1366, 1920] as const;

/** Orden fijo del inicio (Puertas de bano, Puertas de jardin, Ventanas) con [slug de tarjeta, titulo, precio, producto]. */
const SECTIONS = [
  {
    id: 'puertas-de-bano',
    cards: [
      ['templada-10mm', 'Templada 10 mm', 'Desde $672', 'templada-10mm'],
      ['recta', 'Rectas', 'Desde $222', 'recta'],
      // En L: el producto que viaja al cotizador es su acabado por defecto (Aquaclara).
      ['en-l', 'En L', 'Desde $444', 'l-aquaclara'],
      ['bisagra', 'De bisagra', 'Desde $253', 'bisagra'],
    ],
  },
  {
    id: 'puertas-de-jardin',
    cards: [
      ['jardin-1-hoja', '1 hoja corrediza', 'Desde $410', 'jardin-1-hoja'],
      ['jardin-2-hojas', '2 hojas corredizas', 'Desde $819', 'jardin-2-hojas'],
      ['jardin-3-hojas', '3 hojas corredizas', 'Desde $1229', 'jardin-3-hojas'],
    ],
  },
  {
    id: 'ventanas',
    cards: [
      ['ventana-francesa', 'Francesa', 'Desde $108', 'ventana-francesa'],
      ['ventana-bilbao', 'Bilbao', 'Desde $153.60', 'ventana-bilbao'],
    ],
  },
] as const;

test.describe('inicio — catálogo completo', () => {
  test('3 secciones en orden, cada tarjeta con su título y su precio "Desde $X"', async ({ page }) => {
    await page.goto('/');
    for (const section of SECTIONS) {
      // Las 2 tarjetas de asesor ("Más opciones para tu jardín") se cubren en jardin-mas-opciones.spec.ts.
      const cards = page.locator(`#${section.id} article.pcard:not(.pcard--advisor)`);
      await expect(cards, `${section.id}: tarjetas`).toHaveCount(section.cards.length);
      const ids = await cards.evaluateAll((els) => els.map((e) => e.id));
      expect(ids, `${section.id}: orden`).toEqual(section.cards.map(([slug]) => `p-${slug}`));
      await expect(cards.locator('.pcard__title')).toHaveText(section.cards.map(([, title]) => title));
      await expect(cards.locator('.pcard__price')).toHaveText(section.cards.map(([, , price]) => price));
    }
  });

  test('cada tarjeta lleva a SU producto del cotizador, directo a Medidas, sin destinos repetidos', async ({ page }) => {
    await page.goto('/');
    // Destino real de cada tarjeta: el href del enlace (sin opciones) o la URL que arma el formulario GET (con opciones).
    const destinations = await page.locator('#catalogo article.pcard:not(.pcard--advisor)').evaluateAll((cards) =>
      cards.map((card) => {
        const form = card.querySelector('form');
        if (form) {
          const q = new URLSearchParams();
          new FormData(form).forEach((value, key) => q.append(key, String(value)));
          return `${form.getAttribute('action')}?${q.toString()}`;
        }
        return card.querySelector('a[data-go]')?.getAttribute('href') ?? '';
      }),
    );
    const expected = SECTIONS.flatMap((s) => s.cards.map(([, , , producto]) => producto));
    expect(destinations).toHaveLength(expected.length);
    expect(new Set(destinations).size, 'ninguna tarjeta comparte destino').toBe(expected.length);
    destinations.forEach((href, i) => {
      const url = new URL(href, 'http://localhost');
      expect(url.pathname, href).toBe('/cotizador');
      expect(url.searchParams.get('producto'), href).toBe(expected[i]);
      expect(url.searchParams.get('paso'), href).toBe('medidas');
    });
  });

  test('En L: elegir el acabado Frosted cambia el producto del enlace al cotizador (l-frosted)', async ({ page }) => {
    await page.goto('/');
    // la tarjeta se mejora con JS (catalogHome.client): esperar a que termine antes de abrir el selector
    await page.waitForSelector('html[data-js]');
    const card = page.locator('#p-en-l');
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('combobox', { name: 'Acabado' }).click();
    await card.getByRole('option', { name: /^Frosted/ }).click();
    await card.getByRole('button', { name: /Continuar al cotizador/ }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname.replace(/\/$/, '') === '/cotizador' &&
        url.searchParams.get('producto') === 'l-frosted' &&
        url.searchParams.get('paso') === 'medidas',
    );
  });
});

// Los 3 viewports de proyecto no aplican: estos casos fijan sus propios anchos.
test.describe('inicio — catálogo en distintos anchos', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop1920', 'sets its own viewports');
  });

  test.describe('sin desborde horizontal (360/390/412/768/1366/1920)', () => {
    for (const w of WIDTHS) {
      test(`@${w}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto('/');
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `/ @${w}`).toBeLessThanOrEqual(0);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      });
    }
  });

  test.describe('a11y (axe, wcag2a/aa)', () => {
    for (const w of [390, 1920] as const) {
      test(`@${w}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto('/');
        // El inicio hace fade-in de secciones y de tarjetas: axe leeria colores intermedios (contraste transitorio).
        await waitForPageSettled(page);
        const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(
          res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
          `/ @${w}`,
        ).toEqual([]);
      });
    }
  });
});

// image-frame-rule: ningun marco de foto visible puede colapsar a 0x0 (la pagina "se ve" pero sin foto).
test.describe('fotos — marcos con tamaño', () => {
  for (const route of ['/', '/cotizador']) {
    test(`${route}: every visible main .photo-frame has width and height > 0`, async ({ page }) => {
      await page.goto(route);
      const bad = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('main .photo-frame'))
          .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width <= 0 || r.height <= 0;
          })
          .map((el) => el.className),
      );
      expect(bad).toEqual([]);
    });
  }
});
