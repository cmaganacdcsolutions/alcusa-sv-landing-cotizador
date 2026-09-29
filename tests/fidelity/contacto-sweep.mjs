// Fidelity sweep for /contacto vs the approved boards (ios-08 @390,
// desktop-08 @1920). Dev tool, not part of the CI test suite.
//
// Usage: node tests/fidelity/contacto-sweep.mjs
// Requires the preview server running at E2E_PORT (default 4341) and the
// boards reachable on disk (BOARD_DIR).
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOARD_DIR = path.resolve(
  __dirname,
  '../../../../02-design/boards'
);
const SITE_PORT = process.env.E2E_PORT ?? 4341;
const SITE_URL = `http://localhost:${SITE_PORT}/contacto`;

const PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'color',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'columnGap',
  'rowGap',
  'width',
  'height',
  'borderTopWidth',
  'borderTopStyle',
  'borderTopColor',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRadius',
  'boxShadow',
  'backgroundColor',
];

async function styleOf(locator, props = PROPS) {
  const handle = await locator.elementHandle();
  if (!handle) return null;
  return handle.evaluate((el, props) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of props) out[p] = cs[p];
    return out;
  }, props);
}

function diffRows(label, boardStyle, siteStyle, props = PROPS) {
  const rows = [];
  if (!boardStyle || !siteStyle) {
    rows.push([label, '(missing element)', boardStyle ? 'found' : 'MISSING', siteStyle ? 'found' : 'MISSING', 'X']);
    return rows;
  }
  for (const p of props) {
    const b = boardStyle[p];
    const s = siteStyle[p];
    const ok = b === s;
    rows.push([label, p, b, s, ok ? 'OK' : 'X']);
  }
  return rows;
}

async function main() {
  const browser = await chromium.launch();
  const results = [];

  // ---- Mobile: ios-08 @390 vs site @390 ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 1560 } });
    const board = await ctx.newPage();
    await board.goto('file:///' + path.join(BOARD_DIR, 'ios-08-contacto-webform.dc.html').replace(/\\/g, '/'));
    const site = await ctx.newPage();
    await site.goto(SITE_URL, { waitUntil: 'networkidle' });

    const pairs = [
      ['kicker', board.getByText('CONTACTO', { exact: true }), site.locator('.contacto__kicker')],
      ['h1/title', board.locator('h1'), site.locator('.contacto__title')],
      ['lead', board.locator('div > p').filter({ hasText: 'Escríbenos por WhatsApp' }), site.locator('.contacto__lead')],
      ['info-list', board.locator('ul[style]').first(), site.locator('.contacto__list')],
      ['item-1 (WhatsApp) li', board.locator('li').nth(0), site.locator('.contacto__item').nth(0)],
      ['item-1 icon', board.locator('li').nth(0).locator('span').first(), site.locator('.contacto__item').nth(0).locator('.contacto__icon')],
      ['item-1 label', board.getByText('WhatsApp', { exact: true }), site.locator('.contacto__item-label').nth(0)],
      ['item-2 (Telefonos) li', board.locator('li').nth(1), site.locator('.contacto__item').nth(1)],
      ['item-2 icon svg path', board.locator('li').nth(1).locator('svg path').first(), site.locator('.contacto__item').nth(1).locator('svg path').first()],
      // NOTE: ios board li[2] is "Taller" (folded into the map figure on the
      // site, allowed deviation) — not compared 1:1 here.
      ['item-4 (Horario) li', board.locator('li').nth(3), site.locator('.contacto__item').nth(2)],
      ['social label', board.getByText('Síguenos', { exact: true }), site.locator('.contacto__social-label')],
      ['social card 1', board.locator('a[href*="instagram"]'), site.locator('.contacto__social-card').nth(0)],
      ['form card', board.locator('form'), site.locator('.contact-form')],
      ['form title', board.locator('#form-title'), site.locator('.contact-form__title')],
      ['form subtitle', board.locator('form span').first(), site.locator('.contact-form__subtitle')],
      ['label[for=nombre]', board.locator('label[for="nombre"]'), site.locator('label[for="nombre"]')],
      ['#nombre input', board.locator('#nombre'), site.locator('#nombre')],
      ['label[for=telefono]', board.locator('label[for="telefono"]'), site.locator('label[for="telefono"]')],
      ['#telefono input', board.locator('#telefono'), site.locator('#telefono')],
      ['#producto select', board.locator('#producto'), site.locator('#producto')],
      ['#mensaje textarea', board.locator('#mensaje'), site.locator('#mensaje')],
      ['field gap (nombre wrapper)', board.locator('label[for="nombre"]').locator('xpath=..'), site.locator('label[for="nombre"]').locator('xpath=..')],
      ['submit disabled button', board.getByRole('button', { name: 'Enviar por WhatsApp' }), site.getByRole('button', { name: 'Enviar por WhatsApp' })],
      ['submit helper', board.getByText('Completa tu nombre y teléfono'), site.locator('.contact-form__submit-helper')],
    ];

    for (const [label, b, s] of pairs) {
      results.push(...diffRows(`[m390] ${label}`, await styleOf(b).catch(() => null), await styleOf(s).catch(() => null)));
    }

    // gap is not directly a computed style prop name for row-gap when
    // display:flex column -> rowGap covers it; already included above.

    // tel error state: fill an invalid phone to trigger it
    await board.locator('#telefono').fill('123');
    await site.locator('#telefono').fill('123');
    await board.locator('#telefono').dispatchEvent('change');
    await site.locator('#telefono').dispatchEvent('input');
    await board.waitForTimeout(50);
    await site.waitForTimeout(50);
    const boardErr = board.locator('#tel-ayuda');
    const siteErr = site.locator('.contact-form__error');
    results.push(
      ...diffRows(
        '[m390] tel error text',
        await styleOf(boardErr, ['color', 'fontSize', 'fontWeight']).catch(() => null),
        await styleOf(siteErr, ['color', 'fontSize', 'fontWeight']).catch(() => null),
        ['color', 'fontSize', 'fontWeight']
      )
    );

    await ctx.close();
  }

  // ---- Desktop: desktop-08 @1920 vs site @1920 ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const board = await ctx.newPage();
    await board.goto('file:///' + path.join(BOARD_DIR, 'desktop-08-contacto-webform.dc.html').replace(/\\/g, '/'));
    const site = await ctx.newPage();
    await site.goto(SITE_URL, { waitUntil: 'networkidle' });

    const pairs = [
      ['kicker', board.getByText('CONTACTO', { exact: true }), site.locator('.contacto__kicker')],
      ['h1/title', board.locator('h1'), site.locator('.contacto__title')],
      ['lead', board.locator('p').filter({ hasText: 'Escríbenos por WhatsApp' }), site.locator('.contacto__lead')],
      ['info-list', board.locator('ul[aria-label="Datos de contacto"]'), site.locator('.contacto__list')],
      ['item-1 (WhatsApp) li', board.locator('li').nth(0), site.locator('.contacto__item').nth(0)],
      ['item-1 cta (Escribir)', board.getByText('Escribir', { exact: true }), site.locator('.contacto__item-cta').first()],
      ['item-2 (Telefonos) icon path', board.locator('li').nth(1).locator('svg path').first(), site.locator('.contacto__item').nth(1).locator('svg path').first()],
      ['social card 1', board.locator('a[href*="instagram"]').first(), site.locator('.contacto__social-card').nth(0)],
      ['map figure', board.locator('figure'), site.locator('.contacto__map')],
      ['map caption', board.locator('figcaption'), site.locator('.contacto__map-caption')],
      ['map cta', board.getByText('Ver ubicación en el mapa'), site.locator('.contacto__map-cta')],
      ['form card', board.locator('form'), site.locator('.contact-form')],
      ['form title', board.locator('#form-title'), site.locator('.contact-form__title')],
      ['label[for=nombre]', board.locator('label[for="nombre"]'), site.locator('label[for="nombre"]')],
      ['#nombre input', board.locator('#nombre'), site.locator('#nombre')],
      ['#telefono input', board.locator('#telefono'), site.locator('#telefono')],
      ['#mensaje textarea', board.locator('#mensaje'), site.locator('#mensaje')],
      ['field gap (nombre wrapper)', board.locator('label[for="nombre"]').locator('xpath=..'), site.locator('label[for="nombre"]').locator('xpath=..')],
      ['form fields row (nombre+telefono grid)', board.locator('label[for="nombre"]').locator('xpath=../..'), site.locator('label[for="nombre"]').locator('xpath=../..')],
      ['quote-note', board.getByText('¿Prefieres conocer tu precio primero?'), site.locator('.contact-form__quote-note')],
    ];

    for (const [label, b, s] of pairs) {
      results.push(...diffRows(`[d1920] ${label}`, await styleOf(b).catch(() => null), await styleOf(s).catch(() => null)));
    }

    await board.locator('#telefono').fill('123');
    await site.locator('#telefono').fill('123');
    await board.locator('#telefono').dispatchEvent('change');
    await site.locator('#telefono').dispatchEvent('input');
    await board.waitForTimeout(50);
    await site.waitForTimeout(50);
    const boardErr = board.locator('#tel-ayuda');
    const siteErr = site.locator('.contact-form__error');
    results.push(
      ...diffRows(
        '[d1920] tel error text',
        await styleOf(boardErr, ['color', 'fontSize', 'fontWeight']).catch(() => null),
        await styleOf(siteErr, ['color', 'fontSize', 'fontWeight']).catch(() => null),
        ['color', 'fontSize', 'fontWeight']
      )
    );

    await ctx.close();
  }

  await browser.close();

  const bad = results.filter((r) => r[4] !== 'OK');
  console.log(`\nTotal checks: ${results.length}  |  Deltas: ${bad.length}\n`);
  for (const [label, prop, b, s, status] of results) {
    if (status !== 'OK') {
      console.log(`X  ${label} :: ${prop}\n     board = ${JSON.stringify(b)}\n     site  = ${JSON.stringify(s)}`);
    }
  }
  if (bad.length === 0) console.log('No deltas found.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
