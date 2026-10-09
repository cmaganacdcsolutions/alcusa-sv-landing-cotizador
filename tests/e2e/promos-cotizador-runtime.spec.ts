import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { test, expect } from './fixtures';

// ADR-014 add.2: el cotizador resuelve las promos desde /api/promotions.json (lo que publica el admin), con el
// build como semilla. Aqui el endpoint se simula con `page.route` (patron de promos-runtime.spec.ts); sin
// override, tests/e2e/fixtures.ts lo responde 204 = "nada publicado" (semilla del build).
// "Hoy" lo congela el build e2e (`__PROMOS_TODAY__` = 2026-10-15; el seed vence el 2026-10-31). No se usa page.clock:
// congelar Date rompe la restauracion del snapshot en recarga.

type Raw = Record<string, unknown> & { id: string };
type Doc = { generated_at: string; promotions: Raw[] };
const SEED: Doc = JSON.parse(readFileSync(resolve('src/content/promotions.json'), 'utf8')) as Doc;
const [AQUACLARA, NEVADO] = SEED.promotions as [Raw, Raw, Raw];
const WIDE = { starts_on: '2000-01-01', ends_on: '2999-12-31' };
const doc = (promotions: Raw[]): Doc => ({ generated_at: '2026-10-15T00:00:00-06:00', promotions });
const seedDoc = (): Doc => structuredClone(SEED);
/** Documento con el "ahora" de Nevado editado (el build dice $260). */
const editedDoc = (ahora: number): Doc => {
  const d = seedDoc();
  d.promotions[1] = { ...NEVADO, price_promo: ahora };
  return d;
};

const NEVADO_URL = '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=nevado&promo=promo-corrediza-nevado';
const AQUACLARA_URL = '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=claro&promo=promo-puerta-aquaclara';
const DEEP_LINKS = [
  { url: AQUACLARA_URL, price: '$222.00', ancho: '110' },
  { url: NEVADO_URL, price: '$260.00', ancho: '110' },
  {
    url: '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=aquafold&promo=promo-aquafold',
    price: '$279.99',
    ancho: '110',
  },
] as const;
const ONLY_RUNTIME: Raw = {
  ...structuredClone(NEVADO),
  ...WIDE,
  id: 'promo-solo-runtime',
  price_promo: 333,
  cotizador_params: { color: 'negro', vidrio: 'claro' },
  quote_rules: { width_min_cm: 80, width_max_cm: 130, alto_m: 1.85 },
};

const root = (page: Page) => page.getByTestId('cotizador-root');
const hydrated = (page: Page) => expect(root(page)).toHaveAttribute('data-hydrated', 'true', { timeout: 10_000 });
const price = (page: Page) => page.getByTestId('step2-price-value');
const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

/** Cuenta los pedidos al JSON publicado y responde con `handler` (un documento = 200 con ese cuerpo). */
async function publish(page: Page, handler: Doc | ((route: Route) => Promise<void> | void)): Promise<{ hits: () => number }> {
  let n = 0;
  await page.route('**/api/promotions.json', async (route) => {
    n += 1;
    if (typeof handler === 'function') await handler(route);
    else await route.fulfill(json(handler));
  });
  return { hits: () => n };
}

/** Compuerta controlada: la respuesta se retiene hasta `release()` (evento, no sleep). */
function gate(): { wait: Promise<void>; release: () => void } {
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  return { wait, release };
}

/** Errores de consola/pagina de la app. Los "Failed to load resource" son del propio navegador ante el 500/abort simulado. */
function watchConsole(page: Page): string[] {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errs.push(m.text());
  });
  return errs;
}

async function quoteAt(page: Page, ancho: string): Promise<void> {
  await page.locator('#ancho').fill(ancho);
  await expect(page.locator('#ancho-ayuda')).toContainText(`Medida reconocida: ${ancho} cm`); // validacion lista
  await page.getByRole('button', { name: 'Siguiente' }).click();
}


test.describe('cotizador - promos desde el JSON publicado', () => {
  test('un ahora editado ($260 -> $245) se cotiza con el precio editado', async ({ page }) => {
    const pub = await publish(page, editedDoc(245));
    await page.goto(NEVADO_URL);
    await hydrated(page);
    await expect(page.getByTestId('promo-banner')).toBeVisible();
    await quoteAt(page, '110');
    await expect(price(page)).toHaveText('$245.00');
    expect(pub.hits()).toBe(1);
  });

  test('un id que solo existe en runtime abre en contexto promo con su reglaje y precio', async ({ page }) => {
    await publish(page, doc([ONLY_RUNTIME]));
    await page.goto('/cotizador?promo=promo-solo-runtime');
    await hydrated(page);
    await expect(page.getByTestId('promo-banner')).toBeVisible();
    const locked = page.getByTestId('promo-locked');
    await expect(locked).toContainText('Negro');
    await expect(locked).toContainText('Claro 5 mm');
    await page.locator('#ancho').fill('131');
    await expect(page.locator('#ancho-ayuda')).toContainText('1.30');
    await quoteAt(page, '125');
    await expect(price(page)).toHaveText('$333.00');
  });

  test('sin ?promo= no hay contexto promo (hidrata en segundo plano, 1 solo fetch)', async ({ page }) => {
    const pub = await publish(page, seedDoc());
    await page.goto('/cotizador');
    await hydrated(page);
    await expect(page.getByTestId('promo-banner')).toHaveCount(0);
    await expect.poll(pub.hits).toBe(1);
  });

  test('mas de 3 vigentes en el JSON: solo cuentan 3', async ({ page }) => {
    const extra = (n: number): Raw => ({ ...structuredClone(NEVADO), ...WIDE, id: `promo-extra-${n}` });
    await publish(page, doc([extra(1), extra(2), extra(3), extra(4)]));
    await page.goto('/cotizador?promo=promo-extra-3');
    await hydrated(page);
    await expect(page.getByTestId('promo-banner')).toBeVisible();
    await page.goto('/cotizador?promo=promo-extra-4');
    await hydrated(page);
    await expect(page.getByTestId('promo-banner')).toHaveCount(0);
    await expect(page).not.toHaveURL(/promo=/);
  });
});

test.describe('cotizador - runtime con falla: usa la semilla del build', () => {
  const failures: [string, (page: Page) => Promise<unknown>][] = [
    ['HTTP 500', (p) => publish(p, (r) => r.fulfill(json('boom', 500)))],
    ['JSON invalido', (p) => publish(p, (r) => r.fulfill(json('{no es json')))],
    ['route.abort', (p) => publish(p, (r) => r.abort())],
    ['imagen fuera de rutas permitidas', (p) => publish(p, doc([{ ...NEVADO, image: 'https://evil.example/x.webp' }]))],
  ];
  for (const [name, setup] of failures) {
    test(`${name}: los 3 deep links cotizan con el precio del build, sin errores de consola`, async ({ page }) => {
      const errs = watchConsole(page);
      await setup(page);
      for (const dl of DEEP_LINKS) {
        await page.goto(dl.url);
        await hydrated(page);
        await expect(page.getByTestId('promo-banner')).toBeVisible();
        await quoteAt(page, dl.ancho);
        await expect(price(page)).toHaveText(dl.price);
      }
      expect(errs).toEqual([]);
    });
  }

  test('timeout (la respuesta tarda mas de 2.5 s): arranca con la semilla y no se cuelga', async ({ page }) => {
    const errs = watchConsole(page);
    const slow = gate();
    await publish(page, async (route) => {
      await slow.wait;
      await route.fulfill(json(editedDoc(245))).catch(() => undefined); // el cliente ya abandono el pedido
    });
    await page.goto(NEVADO_URL);
    await hydrated(page); // solo llega a hidratado si el timeout de 2.5 s corto la espera (el expect admite 10 s)
    await quoteAt(page, '110');
    await expect(price(page)).toHaveText('$260.00');
    slow.release();
    expect(errs).toEqual([]);
  });
});

test.describe('cotizador - ningun precio de promo antes de hidratar', () => {
  test('con la respuesta retenida no hay contexto ni precio; al liberarla manda el precio editado', async ({ page }) => {
    const hold = gate();
    const pub = await publish(page, async (route) => {
      await hold.wait;
      await route.fulfill(json(editedDoc(245)));
    });
    await page.goto(NEVADO_URL);
    await expect.poll(pub.hits).toBe(1);
    await expect(root(page)).not.toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByTestId('promo-banner')).toHaveCount(0);
    await expect(page.getByTestId('promo-locked')).toHaveCount(0);
    hold.release();
    await hydrated(page);
    await expect(page.getByTestId('promo-banner')).toBeVisible();
    await quoteAt(page, '110');
    await expect(price(page)).toHaveText('$245.00');
    expect(pub.hits()).toBe(1);
  });

  test('runtime lento (1.2 s, bajo el timeout): espera y usa el precio editado', async ({ page }) => {
    await publish(page, async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill(json(editedDoc(245)));
    });
    await page.goto(NEVADO_URL);
    await hydrated(page);
    await quoteAt(page, '110');
    await expect(price(page)).toHaveText('$245.00');
  });
});

test.describe('cotizador - vencida, ausente o desconocida cae a normal', () => {
  const cases: [string, Doc, string][] = [
    ['vencida en el JSON', doc([{ ...NEVADO, starts_on: '2000-01-01', ends_on: '2000-01-31' }]), 'promo-corrediza-nevado'],
    ['ausente del JSON (archivada)', doc([AQUACLARA]), 'promo-no-publicada'],
    ['id desconocido', seedDoc(), 'promo-no-existe'],
  ];
  for (const [name, body, id] of cases) {
    test(`${name}: contexto normal y se limpia ?promo=`, async ({ page }) => {
      await publish(page, body);
      await page.goto(`/cotizador?producto=recta&paso=medidas&promo=${id}`);
      await hydrated(page);
      await expect(page.getByTestId('promo-banner')).toHaveCount(0);
      await expect(page.getByTestId('promo-locked')).toHaveCount(0);
      await expect(page).not.toHaveURL(/promo=/);
    });
  }

  test('snapshot de una promo archivada (publicada antes, ya fuera del JSON): arranca en contexto normal', async ({ page }) => {
    await publish(page, doc([ONLY_RUNTIME]));
    await page.goto('/cotizador?promo=promo-solo-runtime');
    await hydrated(page);
    await quoteAt(page, '120');
    await expect(price(page)).toHaveText('$333.00');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await publish(page, doc([AQUACLARA])); // el panel archivo la promo
    await page.reload();
    await hydrated(page);
    await expect(page.getByTestId('promo-banner')).toHaveCount(0);
    await expect(price(page)).toHaveCount(0);
  });
});

test.describe('cotizador - snapshot y retorno de Wompi usan el precio de runtime', () => {
  test('un snapshot de promo publicada se restaura con el precio editado (sin stash)', async ({ page }) => {
    await publish(page, editedDoc(245));
    await page.goto(NEVADO_URL);
    await hydrated(page);
    await quoteAt(page, '110');
    await expect(price(page)).toHaveText('$245.00');
    await page.reload();
    await hydrated(page);
    await expect(page.getByTestId('promo-banner')).toBeVisible();
    await expect(price(page)).toHaveText('$245.00');
    await expect(page.getByTestId('stash-banner')).toHaveCount(0);
  });

  test('el stash de trabajo en curso se aparta y se recupera igual con el runtime activo', async ({ page }) => {
    await publish(page, seedDoc());
    await page.goto('/cotizador?producto=recta&paso=medidas');
    await hydrated(page);
    await quoteAt(page, '110');
    await expect(price(page)).toBeVisible();
    await page.goto(NEVADO_URL);
    await hydrated(page);
    await expect(page.getByTestId('promo-banner')).toBeVisible();
    await expect(page.getByTestId('stash-banner')).toBeVisible();
    await page.getByTestId('stash-recover').click();
    await expect(page.getByTestId('stash-banner')).toHaveCount(0);
    await expect(page.getByTestId('promo-banner')).toHaveCount(0);
  });

  test('retorno de Wompi con promoId: espera la hidratacion (1 fetch) y muestra el resultado', async ({ page }) => {
    const pub = await publish(page, editedDoc(245));
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'alcusa-wompi-pending',
        JSON.stringify({ reference: 'ALC-2026-0ABCDE', pct: 100, zone: '', entrega: 'retiro', promoId: 'promo-corrediza-nevado' }),
      );
    });
    await page.goto('/cotizador#cotizador/7-resultado?pago=aprobado&ref=ALC-2026-0ABCDE');
    await hydrated(page);
    // El resultado no pinta banner ni precio de promo sin carrito: se verifica que el retorno espera la hidratacion
    // (1 fetch, sin errores) y muestra el pedido; el precio de runtime en lookupPromo lo cubre promoRegistry.test.ts.
    await expect(page.getByText('ALC-2026-0ABCDE').first()).toBeVisible();
    expect(pub.hits()).toBe(1);
  });
});
