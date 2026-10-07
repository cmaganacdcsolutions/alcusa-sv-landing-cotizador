import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';

// ADR-014 A5: la portada refresca las promos en runtime desde /api/promotions.json (lo que publica el admin)
// SIN rebuild. El HTML horneado es el respaldo. Aqui /api/promotions.json se simula con `page.route`
// (en los builds estaticos del e2e no existe: tests/e2e/fixtures.ts lo responde 204 = "nada publicado").
// "Hoy" del navegador se fija en 2026-10-15 (el seed vence el 2026-10-31); nada depende de la fecha real.

type Doc = { generated_at: string; promotions: Record<string, unknown>[] };
const SEED: Doc = JSON.parse(readFileSync(resolve('src/content/promotions.json'), 'utf8')) as Doc;
const seed = (): Doc => structuredClone(SEED);
const FLYER = readFileSync(resolve('public/images/promos/promo-1-900.webp'));
const TODAY = new Date('2026-10-15T12:00:00-06:00');

const section = (page: Page) => page.locator('#promociones');
const cards = (page: Page) => page.locator('#promociones .promo-card');

/** Publica `body` (objeto = JSON, string = crudo) en /api/promotions.json. */
async function publish(page: Page, body: unknown, status = 200): Promise<void> {
  await page.route('**/api/promotions.json', (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
  // Subidas del admin: no existen en el build estatico; se responden con un flyer valido.
  await page.route('**/media/promos/**', (route) => route.fulfill({ status: 200, contentType: 'image/webp', body: FLYER }));
}

async function open(page: Page, width = 1920, height = 1080): Promise<void> {
  await page.clock.setFixedTime(TODAY);
  await page.setViewportSize({ width, height });
  await page.goto('/');
}

const settled = async (page: Page, state: 'applied' | 'fallback') =>
  expect(section(page)).toHaveAttribute('data-runtime', state);

const css = (loc: Locator, prop: string) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

/** Arbol normalizado (tag, atributos ordenados, texto recortado) para comparar DOM horneado vs runtime. */
async function dump(page: Page, ignoreAttrs: string[] = []): Promise<unknown> {
  return page.locator('#promociones').evaluate((root, ignore) => {
    const walk = (n: Node): unknown => {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
        return t === '' ? null : t;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return null;
      const el = n as Element;
      const attrs = [...el.attributes]
        .filter((a) => !ignore.includes(a.name))
        .map((a) => [a.name, a.value] as const)
        .sort((a, b) => a[0].localeCompare(b[0]));
      return { tag: el.tagName.toLowerCase(), attrs, kids: [...el.childNodes].map(walk).filter((k) => k !== null) };
    };
    const attrs = ['id', 'class', 'aria-labelledby', 'data-count'].map((k) => [k, root.getAttribute(k)]);
    return { attrs, hidden: (root as HTMLElement).hidden, kids: [...root.childNodes].map(walk).filter((k) => k !== null) };
  }, ignoreAttrs);
}

test.describe('promos runtime — el panel cambia la portada sin rebuild', () => {
  test('promos cambiadas (texto, precio, enlace, imagen subida) reemplazan las horneadas', async ({ page }) => {
    const doc = seed();
    Object.assign(doc.promotions[0], {
      title: 'Puerta renovada desde el panel',
      description: 'Texto nuevo publicado por el admin.',
      price_before: 250,
      price_promo: 199,
      image: '/media/promos/9f2c1a7b3d4e-900.webp',
      image_alt: 'Flyer nuevo del admin',
      product_slug: 'ventana-francesa',
      cotizador_params: { color: 'blanco' },
      rules: ['Regla nueva 1', 'Regla nueva 2'],
    });
    await publish(page, doc);
    await open(page);
    await settled(page, 'applied');

    await expect(cards(page)).toHaveCount(3);
    const first = cards(page).first();
    await expect(first.locator('.promo-card__title')).toHaveText('Puerta renovada desde el panel');
    await expect(first.locator('.promo-card__title')).toHaveAttribute('title', 'Puerta renovada desde el panel');
    await expect(first.locator('.promo-card__desc')).toHaveText('Texto nuevo publicado por el admin.');
    await expect(first.locator('.promo-card__antes s')).toHaveText('Antes $250');
    await expect(first.locator('.promo-card__ahorras')).toHaveText('Ahorras $51');
    await expect(first.locator('.promo-card__ahora')).toHaveText('Ahora $199');
    await expect(first.locator('.promo-card__badge')).toHaveText('−20%');
    await expect(first.locator('.promo-card__rules li')).toHaveText(['Regla nueva 1', 'Regla nueva 2']);
    await expect(first.locator('[data-promo-cta]')).toHaveAttribute(
      'href',
      '/cotizador?producto=ventana-francesa&paso=medidas&color=blanco',
    );
    const img = first.locator('img.photo-frame__img');
    await expect(img).toHaveAttribute('src', '/media/promos/9f2c1a7b3d4e-900.webp');
    await expect(img).toHaveAttribute('alt', 'Flyer nuevo del admin');
    await expect(img).toHaveAttribute('srcset', '/media/promos/9f2c1a7b3d4e-600.webp 600w, /media/promos/9f2c1a7b3d4e-900.webp 900w');
    // las otras dos siguen siendo las del seed
    await expect(cards(page).nth(1).locator('.promo-card__title')).toHaveText('Puerta corrediza con vidrio nevado');
  });

  test('una promo archivada (ya no esta en el JSON) desaparece: quedan 2, titulo en plural', async ({ page }) => {
    const doc = seed();
    doc.promotions.splice(1, 1);
    await publish(page, doc);
    await open(page);
    await settled(page, 'applied');
    await expect(cards(page)).toHaveCount(2);
    await expect(section(page)).toHaveAttribute('data-count', '2');
    await expect(page.locator('[data-promo-id="promo-corrediza-nevado"]')).toHaveCount(0);
    await expect(page.locator('#promo-t')).toHaveText('Ofertas que puedes aprovechar hoy');
    await expect(page.locator('.promos__sub--mobile')).toHaveCount(1);
  });

  test('una sola promo: titulo en singular y sin el subtitulo movil "Desliza"', async ({ page }) => {
    const doc = seed();
    doc.promotions.splice(1, 2);
    await publish(page, doc);
    await open(page);
    await settled(page, 'applied');
    await expect(cards(page)).toHaveCount(1);
    await expect(page.locator('#promo-t')).toHaveText('Una oferta que puedes aprovechar hoy');
    await expect(page.locator('.promos__sub--mobile')).toHaveCount(0);
    await expect(section(page)).toHaveAttribute('data-count', '1');
  });

  test('lista vacia: la seccion sigue en el DOM pero oculta (0 px) y el enlace "Ver promociones" tambien', async ({ page }) => {
    await publish(page, { generated_at: SEED.generated_at, promotions: [] });
    await open(page);
    await settled(page, 'applied');
    await expect(section(page)).toHaveCount(1);
    await expect(section(page)).toBeHidden();
    expect(await css(section(page), 'display')).toBe('none');
    expect(await section(page).boundingBox()).toBeNull();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.locator('.hintro__link')).toBeHidden();
  });

  test('promos vencidas segun la fecha de hoy (SV) se filtran: todas vencidas = seccion oculta', async ({ page }) => {
    const doc = seed();
    for (const p of doc.promotions) Object.assign(p, { starts_on: '2026-09-01', ends_on: '2026-09-30' });
    await publish(page, doc);
    await open(page);
    await settled(page, 'applied');
    await expect(section(page)).toBeHidden();
  });

  test('una 4a promo en el JSON nunca se muestra (maximo 3)', async ({ page }) => {
    const doc = seed();
    doc.promotions.push({ ...doc.promotions[0], id: 'promo-cuarta', title: 'Cuarta promo que sobra' });
    await publish(page, doc);
    await open(page);
    await settled(page, 'applied');
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByText('Cuarta promo que sobra')).toHaveCount(0);
  });

  test('si el build no horneo ninguna promo (seccion oculta y vacia) el runtime la muestra y la llena', async ({ page }) => {
    // Simula el HTML de un build sin promos vigentes: justo antes de los scripts diferidos (readyState
    // "interactive") la seccion queda como la deja Promotions.astro con count = 0.
    await page.addInitScript(() => {
      document.addEventListener('readystatechange', () => {
        const el = document.getElementById('promociones');
        if (document.readyState !== 'interactive' || !el) return;
        el.hidden = true;
        el.setAttribute('data-count', '0');
        el.replaceChildren();
      });
    });
    const doc = seed();
    doc.promotions.splice(2, 1);
    await publish(page, doc);
    await open(page);
    await settled(page, 'applied');
    await expect(section(page)).toBeVisible();
    await expect(cards(page)).toHaveCount(2);
    await expect(section(page)).toHaveAttribute('data-count', '2');
  });
});

test.describe('promos runtime — si algo falla se conserva el HTML horneado', () => {
  const bakedTitles = ['Puerta Aquaclara', 'Puerta corrediza con vidrio nevado', 'Modelo Aquafold'];
  const expectBaked = async (page: Page) => {
    await settled(page, 'fallback');
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).locator('.promo-card__title')).toHaveText(bakedTitles);
    await expect(section(page)).toBeVisible();
  };

  test('JSON invalido (texto que no es JSON)', async ({ page }) => {
    await publish(page, '{esto no es json');
    await open(page);
    await expectBaked(page);
  });

  test('HTTP 500', async ({ page }) => {
    await publish(page, 'boom', 500);
    await open(page);
    await expectBaked(page);
  });

  test('HTTP 404', async ({ page }) => {
    await publish(page, 'not found', 404);
    await open(page);
    await expectBaked(page);
  });

  test('204 (nada publicado, default de los e2e)', async ({ page }) => {
    await open(page);
    await expectBaked(page);
  });

  test('error de red (la peticion se aborta)', async ({ page }) => {
    await page.route('**/api/promotions.json', (route) => route.abort());
    await open(page);
    await expectBaked(page);
  });

  test('JSON bien formado pero con datos invalidos (precio negativo / slug inexistente / sin arreglo)', async ({ page }) => {
    const bad = seed();
    bad.promotions[0].price_promo = -5;
    await publish(page, bad);
    await open(page);
    await expectBaked(page);

    const slug = seed();
    slug.promotions[1].product_slug = 'producto-que-no-existe';
    await page.unroute('**/api/promotions.json');
    await publish(page, slug);
    await page.reload();
    await expectBaked(page);

    await page.unroute('**/api/promotions.json');
    await publish(page, { promotions: 'no' });
    await page.reload();
    await expectBaked(page);
  });

  test('imagen fuera de /media/promos/ o /images/promos/: se rechaza todo el JSON y no se pide el host externo', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (/evil\.example/.test(r.url())) external.push(r.url());
    });
    const doc = seed();
    doc.promotions[0].image = 'https://evil.example/x-900.webp';
    await publish(page, doc);
    await open(page);
    await expectBaked(page);
    expect(external).toEqual([]);
  });

  test('texto con HTML del JSON se muestra como texto, nunca se interpreta', async ({ page }) => {
    const doc = seed();
    doc.promotions[0].title = '<img src=x onerror="window.__pwned=1">Hola';
    doc.promotions[0].description = '<script>window.__pwned=2</script>';
    doc.promotions[0].rules = ['<b>negrita</b>'];
    await publish(page, doc);
    await open(page);
    await settled(page, 'applied');
    await expect(cards(page).first().locator('.promo-card__title')).toHaveText('<img src=x onerror="window.__pwned=1">Hola');
    await expect(cards(page).first().locator('.promo-card__rules li')).toHaveText('<b>negrita</b>');
    await expect(page.locator('#promociones img[src="x"], #promociones b, #promociones script')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  });
});

test.describe('promos runtime — mismo diseno que el HTML horneado', () => {
  test('con los MISMOS datos que el build, el DOM del runtime equivale al horneado', async ({ page }) => {
    await open(page);
    await settled(page, 'fallback'); // 204: queda el horneado
    const baked = await dump(page);
    await publish(page, seed());
    await page.reload();
    await settled(page, 'applied');
    expect(await dump(page)).toEqual(baked);
  });

  test('1 y 2 promos: el DOM del runtime equivale al del build con 1 y 2 promos (fixtures one/states)', async ({ page, baseURL }) => {
    const port = Number(new URL(baseURL ?? 'http://localhost:4321').port);
    for (const [offset, file] of [
      [1, 'tests/e2e/promo-data/one.json'],
      [2, 'tests/e2e/promo-data/states.json'],
    ] as const) {
      const variant = `http://localhost:${port + offset}`;
      await page.unroute('**/api/promotions.json');
      await page.route('**/api/promotions.json', (route) => route.fulfill({ status: 204 })); // "nada publicado"
      await page.clock.setFixedTime(TODAY);
      await page.goto(variant);
      await settled(page, 'fallback');
      const baked = await dump(page, ['src', 'srcset']);
      // Las fixtures usan fotos del catalogo (el runtime solo acepta /images/promos/): se cambia la foto y se ignora src/srcset.
      const doc = JSON.parse(readFileSync(resolve(file), 'utf8')) as Doc;
      for (const p of doc.promotions) p.image = '/images/promos/promo-1-900.webp';
      await page.unroute('**/api/promotions.json');
      await publish(page, doc);
      await page.reload();
      await settled(page, 'applied');
      expect(await dump(page, ['src', 'srcset'])).toEqual(baked);
    }
  });

  test('@1920 dos promos del runtime = 2 columnas de 376 px en la misma fila', async ({ page }) => {
    const doc = seed();
    doc.promotions.splice(2, 1);
    await publish(page, doc);
    await open(page, 1920, 1080);
    await settled(page, 'applied');
    const a = (await cards(page).nth(0).boundingBox())!;
    const b = (await cards(page).nth(1).boundingBox())!;
    expect(Math.round(a.width)).toBe(376);
    expect(Math.abs(a.width - b.width)).toBeLessThan(1);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  });

  test('@390 tres promos del runtime = carrusel con snap (88vw), el CTA sigue de 44 px', async ({ page }) => {
    await publish(page, seed());
    await open(page, 390, 844);
    await settled(page, 'applied');
    const list = page.locator('#promociones .promos__list');
    expect(await css(list, 'overflow-x')).toBe('auto');
    expect(await css(list, 'scroll-snap-type')).toContain('x mandatory');
    expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const a = (await cards(page).nth(0).boundingBox())!;
    expect(Math.round(a.width)).toBe(Math.round(390 * 0.88));
    const cta = cards(page).first().locator('[data-promo-cta]');
    expect(Math.round((await cta.boundingBox())!.height)).toBe(44);
  });

  test('el CTA de una promo del runtime cae en Medidas con producto, color y vidrio', async ({ page }) => {
    await publish(page, seed());
    await open(page);
    await settled(page, 'applied');
    const cta = cards(page).nth(2).locator('[data-promo-cta]');
    await expect(cta).toHaveAttribute('href', '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=aquafold');
  });
});
