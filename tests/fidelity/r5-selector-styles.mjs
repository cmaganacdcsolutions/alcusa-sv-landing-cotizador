// R5/F4 fidelity: getComputedStyle vs board REDLINE values (ios/android 390, desktop 1920)
// plus a no-horizontal-overflow sweep at 360/390/412/768/1366/1920.
// Usage: node tests/fidelity/r5-selector-styles.mjs [baseURL]  (preview must be running)
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4392';
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

// [label, selector, prop, expected(mobile 390), expected(desktop 1920)]
const ROWS = [
  ['Tile cat', '.sel-tile--cat', 'borderRadius', '20px', '20px'],
  ['Tile cat', '.sel-tile--cat', 'minHeight', '72px', '96px'],
  ['Tile cat', '.sel-tile--cat', 'borderTopColor', rgb('#dfe6ef'), rgb('#dfe6ef')],
  ['Tile cat name', '.sel-tile--cat .sel-tile__n', 'fontSize', '16px', '17px'],
  ['Tile cat name', '.sel-tile--cat .sel-tile__n', 'fontWeight', '700', '700'],
  ['Tile cat photo', '.sel-tile--cat .photo-frame', 'width', '48px', '64px'],
  ['Kicker', '.sel__kicker', 'fontSize', '12px', '13px'],
  ['Kicker', '.sel__kicker', 'letterSpacing', '1.68px', '1.82px'],
  ['Kicker', '.sel__kicker', 'color', rgb('#073b92'), rgb('#073b92')],
  ['Qload card (expanded)', '#qc-panel', 'borderRadius', '24px', '24px'],
  ['Input', '.qin', 'height', '52px', '56px'],
  ['Input', '.qin', 'borderRadius', '16px', '16px'],
  ['Input', '.qin', 'fontSize', '16px', '17px'],
  ['Input', '.qin', 'letterSpacing', '0.64px', '0.68px'],
  ['Input', '.qin', 'textTransform', 'uppercase', 'uppercase'],
  ['Button disabled', '.qbtns .bt', 'backgroundColor', rgb('#dfe6ef'), rgb('#dfe6ef')],
  ['Button', '.qbtns .bt', 'minHeight', '52px', '56px'],
  ['Siguiente bar btn', '.sel-bar .bt', 'minHeight', '52px', '56px'],
];

const browser = await chromium.launch();
let bad = 0;
for (const [w, h, idx] of [[390, 844, 3], [1920, 1080, 4]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${base}/cotizador`);
  await page.getByTestId('cotizador-root').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid=cotizador-root]')?.getAttribute('data-hydrated') === 'true');
  if (w < 768) await page.getByRole('button', { name: '¿Ya tienes una cotización?', expanded: false }).click();
  for (const [label, sel, prop, m, d] of ROWS) {
    const want = w < 768 ? m : d;
    const got = await page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p], prop);
    const ok = got === want;
    if (!ok) bad += 1;
    console.log(`${w}\t${label}\t${prop}\t${want}\t${got}\t${ok ? 'OK' : 'X'}`);
  }
  await page.close();
  void idx;
}
for (const w of [360, 390, 412, 768, 1366, 1920]) {
  const page = await browser.newPage({ viewport: { width: w, height: 800 } });
  await page.goto(`${base}/cotizador`);
  await page.waitForFunction(() => document.querySelector('[data-testid=cotizador-root]')?.getAttribute('data-hydrated') === 'true');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${w}\toverflow-x\t0\t${over}\t${over <= 0 ? 'OK' : 'X'}`);
  if (over > 0) bad += 1;
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
