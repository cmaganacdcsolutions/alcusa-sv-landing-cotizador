import type { Locator, Page } from '@playwright/test';
import { formatQuoteCode, makeQuoteCode } from '../../src/integrations/quotes/code';
import { mockCodes } from '../../src/integrations/quotes/mockClient';
import { expect, test } from './fixtures';

// BUG-1025-01/02/03: bloque "¿Ya tienes una cotización?" — layout en error a cualquier ancho,
// anuncio del error en region viva y folio de contingencia tecleable. Corre contra el adapter mock.
const codes = mockCodes();
const show = (c: string): string => formatQuoteCode(c);
const NOT_FOUND = 'No encontramos una cotización con ese código.';
const CONTINGENCY = 'ALC-20260930-UK7Q-M3X9';

/** Folio valido (digito verificador correcto, fecha reciente) que el mock no conoce -> not_found. */
function unknownCode(): string {
  const d = new Date(Date.now() - 2 * 86_400_000);
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return show(makeQuoteCode(ymd, 'A1B2C3D'));
}

async function openBlock(page: Page): Promise<void> {
  await page.goto('/cotizador');
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
  const toggle = page.getByRole('button', { name: '¿Ya tienes una cotización?', expanded: false });
  if (await toggle.count()) await toggle.click();
}

const field = (page: Page): Locator => page.getByLabel('Código de tu cotización');
const submit = (page: Page): Locator => page.locator('.qbtns button[type=submit]');

type Box = { x: number; y: number; width: number; height: number };
async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error('sin caja');
  return b;
}
const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x - 1 &&
  inner.y >= outer.y - 1 &&
  inner.x + inner.width <= outer.x + outer.width + 1 &&
  inner.y + inner.height <= outer.y + outer.height + 1;
const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

async function assertLayout(page: Page): Promise<void> {
  // Todas las cajas en un solo evaluate: lectura atomica (sin scroll/reflow entre medidas).
  const m = await page.evaluate(() => {
    const r = (el: Element | null): { x: number; y: number; width: number; height: number } | null => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    const all = (sel: string): Array<{ x: number; y: number; width: number; height: number }> =>
      [...document.querySelectorAll(sel)].map((el) => r(el) as { x: number; y: number; width: number; height: number });
    return {
      card: r(document.querySelector('#qc-panel')),
      body: r(document.querySelector('#qc-body')),
      input: r(document.querySelector('#qc-in')),
      label: r(document.querySelector('.ql')),
      kids: all('.qbtns > *, .ql, .qm, .qw'),
      btns: all('.qbtns > *'),
      msg: r(document.querySelector('.qm, .qw')),
      over: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  const card = m.card as Box;
  const body = m.body as Box;
  const input = m.input as Box;
  expect(input.width, 'input >= 60% del bloque').toBeGreaterThanOrEqual(body.width * 0.6);
  m.kids.forEach((k, i) => expect(inside(k, card), `elemento ${i} dentro de la tarjeta`).toBe(true));
  const parts: Box[] = [input, ...m.btns];
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      expect(overlap(parts[i] as Box, parts[j] as Box), `solape ${i}/${j}`).toBe(false);
    }
  }
  if (m.msg) expect(m.msg.width).toBeGreaterThanOrEqual(Math.min(240, body.width * 0.6));
  expect((m.label as Box).height, 'etiqueta en <= 2 lineas').toBeLessThan(60);
  expect(m.over).toBeLessThanOrEqual(0);
}

const WIDTHS = [1024, 1280, 1366, 1440, 1920, 360, 390];
const STATES: Array<{ name: string; code: () => string; send: boolean }> = [
  { name: 'not_found', code: unknownCode, send: true },
  { name: 'contingency', code: () => CONTINGENCY, send: true },
  { name: 'offline', code: () => show(codes.offline), send: true },
  { name: 'server', code: () => show(codes.server), send: true },
  { name: 'rate_limited', code: () => show(codes.rateLimited), send: true },
  { name: 'incomplete', code: () => 'ALC-20260930-K7QM', send: false },
  { name: 'check', code: () => show(codes.found).slice(0, -1) + 'Z', send: false },
];

test.describe('BUG-1025-01 layout del bloque en error', () => {
  for (const w of WIDTHS) {
    for (const s of STATES) {
      test(`${s.name} @${w}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 900 });
        await openBlock(page);
        await assertLayout(page); // vacio
        await field(page).fill(s.code());
        if (s.send) await submit(page).click();
        else await field(page).blur();
        await expect(page.locator('.qm, .qw').first()).toBeVisible();
        await assertLayout(page);
        if (w <= 430) {
          const btns = page.locator('.qbtns > *');
          for (let i = 0; i < (await btns.count()); i += 1) expect((await box(btns.nth(i))).height).toBeGreaterThanOrEqual(44);
        }
      });
    }
  }
});

test.describe('BUG-1025-02 anuncio en region viva', () => {
  test('not_found: role=alert con el texto, asociado al input, sin duplicar', async ({ page }) => {
    await openBlock(page);
    await field(page).fill(unknownCode());
    await submit(page).click();
    const alert = page.getByRole('alert').filter({ hasText: NOT_FOUND });
    await expect(alert).toHaveCount(1);
    const id = await alert.first().getAttribute('id');
    expect(id).toBeTruthy();
    expect(await field(page).getAttribute('aria-describedby')).toContain(id as string);
    await expect(page.getByText(NOT_FOUND)).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: NOT_FOUND })).toHaveCount(0);
  });

  test('offline y contingencia tambien se anuncian como alert', async ({ page }) => {
    await openBlock(page);
    await field(page).fill(show(codes.offline));
    await submit(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'No pudimos consultar tu cotización.' })).toHaveCount(1);
    await field(page).fill(CONTINGENCY);
    await submit(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'se generó sin conexión' })).toHaveCount(1);
  });
});

test.describe('BUG-1025-03 folio de contingencia tecleado', () => {
  test('el boton se habilita y enviar muestra el mensaje con WhatsApp', async ({ page }) => {
    await openBlock(page);
    await field(page).fill(CONTINGENCY);
    const cta = page.getByRole('button', { name: 'Cargar cotización' });
    await expect(cta).toBeEnabled();
    await cta.click();
    await expect(page.getByText(/se generó sin conexión y no quedó guardada/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Escribir por WhatsApp', exact: true })).toBeVisible();
  });
});
