// R4 fidelity probe (computed style vs r07 board values).
// Run: node tests/fidelity/r07-probe.mjs <port> <outdir>   (needs `npm run preview -- --port <port>`)
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';

const PORT = process.argv[2] ?? '4401';
const OUT = process.argv[3] ?? '.';
const base = `http://localhost:${PORT}`;
const rows = [];
const check = (vp, el, prop, board, site) => rows.push({ vp, el, prop, board: String(board), site: String(site), ok: String(site) === String(board) });

const stub = (m) => {
  window.open = () => null;
  if (m === 'none') {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'canShare', { value: undefined });
    return;
  }
  let n = 0;
  Object.defineProperty(navigator, 'canShare', { value: () => true });
  Object.defineProperty(navigator, 'share', {
    value: () => {
      n++;
      return m === 'ok' || (m === 'np' && n > 1) ? Promise.resolve() : Promise.reject(new DOMException('x', m === 'np' ? 'NotAllowedError' : 'AbortError'));
    },
  });
};

async function toResumen(page) {
  await page.goto(`${base}/cotizador`);
  await page.waitForSelector('[data-hydrated="true"]');
  await page.getByRole('button', { name: /Puerta de baño recta/ }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.locator('#municipio').selectOption('Soyapango');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('heading', { name: 'Resumen de tu cotización' }).waitFor();
}
const cs = (loc, props) =>
  loc.evaluate((e, ps) => {
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return { ...Object.fromEntries(ps.map((p) => [p, s[p]])), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  }, props);
const vis = (page, tid) => page.getByTestId(tid).locator('visible=true').first();
const px = (v) => String(v).replace('px', '');

async function mobile(browser, name, dev, vpw, tap) {
  const ctx = await browser.newContext({ ...devices[dev] });
  const mk = async (mode, block) => {
    const p = await ctx.newPage();
    await p.addInitScript(stub, mode);
    if (block) await p.route('**/_astro/render*.js', (r) => r.abort());
    return p;
  };
  let p = await mk('none', true);
  await toResumen(p);
  const btn = vis(p, 'quote-share-button');
  let s = await cs(btn, ['backgroundColor', 'color', 'borderRadius', 'fontSize', 'fontWeight', 'lineHeight']);
  check(name, 'A button', 'bg', 'rgb(8, 115, 72)', s.backgroundColor);
  check(name, 'A button', 'color', 'rgb(255, 255, 255)', s.color);
  check(name, 'A button', 'height', 52, s.h);
  check(name, 'A button', 'radius', '14px', s.borderRadius);
  check(name, 'A button', 'font', '16px/700/22px', `${s.fontSize}/${s.fontWeight}/${s.lineHeight}`);
  check(name, 'A button', 'width', vpw - 48, s.w);
  await p.screenshot({ path: `${OUT}/${name}-A.png` });
  await btn.click();
  const card = p.locator('.qs-card--error').locator('visible=true');
  await card.waitFor();
  s = await cs(card, ['backgroundColor', 'borderTopColor', 'borderTopWidth', 'borderRadius', 'paddingTop', 'paddingLeft', 'rowGap']);
  check(name, 'G card', 'bg', 'rgb(253, 238, 238)', s.backgroundColor);
  check(name, 'G card', 'border', '1px rgb(240, 194, 194)', `${s.borderTopWidth} ${s.borderTopColor}`);
  check(name, 'G card', 'radius', '20px', s.borderRadius);
  check(name, 'G card', 'padding', '16/20', `${px(s.paddingTop)}/${px(s.paddingLeft)}`);
  check(name, 'G card', 'gap', '8px', s.rowGap);
  check(name, 'G card', 'width', vpw - 40, s.w);
  s = await cs(card.locator('.qs-outline'), ['borderRadius', 'borderTopWidth', 'borderTopColor', 'color', 'fontSize', 'fontWeight']);
  check(name, 'G Descargar PDF', 'height', tap, s.h);
  check(name, 'G Descargar PDF', 'radius', '14px', s.borderRadius);
  check(name, 'G Descargar PDF', 'border', '1.5px rgb(9, 86, 216)', `${s.borderTopWidth} ${s.borderTopColor}`);
  check(name, 'G Descargar PDF', 'color', 'rgb(7, 59, 146)', s.color);
  check(name, 'G Descargar PDF', 'font', '15px/700', `${s.fontSize}/${s.fontWeight}`);
  s = await cs(card.locator('.qs-link').first(), ['fontSize', 'fontWeight', 'textDecorationLine']);
  check(name, 'G Intentar', 'height', tap, s.h);
  check(name, 'G Intentar', 'font', '14px/700/underline', `${s.fontSize}/${s.fontWeight}/${s.textDecorationLine}`);
  await p.screenshot({ path: `${OUT}/${name}-G.png` });

  p = await ctx.newPage();
  await p.addInitScript(stub, 'ok');
  await p.route('**/_astro/render*.js', async (r) => {
    await new Promise((x) => setTimeout(x, 2500));
    await r.continue();
  });
  await toResumen(p);
  await vis(p, 'quote-share-button').click();
  await p.waitForFunction(() => document.querySelector('[data-testid=quote-share-button][aria-busy=true]'));
  const b = vis(p, 'quote-share-button');
  s = await cs(b, ['backgroundColor']);
  check(name, 'B button', 'height', 52, s.h);
  check(name, 'B button', 'bg', 'rgb(8, 115, 72)', s.backgroundColor);
  const sp = await cs(b.locator('svg'), ['animationDuration', 'animationTimingFunction']);
  const ow = await b.locator('svg').evaluate((e) => e.clientWidth + 'x' + e.clientHeight);
  check(name, 'B spinner', 'size', '22x22', ow);
  check(name, 'B spinner', 'anim', '1.4s linear', `${sp.animationDuration} ${sp.animationTimingFunction}`);
  s = await cs(p.locator('.cotizador__mobile-only-ctas .btn-primary'), ['backgroundColor', 'color']);
  check(name, 'B Pagar ahora', 'disabled', 'rgb(223, 230, 239)/rgb(68, 80, 104)', `${s.backgroundColor}/${s.color}`);
  await p.screenshot({ path: `${OUT}/${name}-B.png` });

  p = await mk('ok');
  await toResumen(p);
  await vis(p, 'quote-share-button').click();
  const d = p.locator('.qs-card--info').locator('visible=true');
  await d.waitFor();
  s = await cs(d, ['backgroundColor', 'borderTopColor', 'borderRadius']);
  check(name, 'D card', 'bg', 'rgb(234, 242, 255)', s.backgroundColor);
  check(name, 'D card', 'border', 'rgb(207, 224, 255)', s.borderTopColor);
  check(name, 'D card', 'radius', '20px', s.borderRadius);
  check(name, 'D card', 'width', vpw - 40, s.w);
  await p.screenshot({ path: `${OUT}/${name}-D.png` });

  p = await mk('np');
  await toResumen(p);
  await vis(p, 'quote-share-button').click();
  await p.getByText('Listo: toca para compartir').locator('visible=true').waitFor();
  s = await cs(vis(p, 'quote-share-button'), ['boxShadow']);
  check(name, 'E button', 'ring', 'rgba(8, 115, 72, 0.22) 0px 0px 0px 3px', s.boxShadow);
  s = await cs(p.locator('.qs-help').locator('visible=true'), ['fontSize', 'lineHeight', 'color']);
  check(name, 'E help', 'font', '14px/20px/rgb(68, 80, 104)', `${s.fontSize}/${s.lineHeight}/${s.color}`);
  await p.screenshot({ path: `${OUT}/${name}-E.png` });
  await ctx.close();
}

async function desktop(browser, name, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 1366 ? 768 : 1080 }, acceptDownloads: true });
  const p = await ctx.newPage();
  await p.addInitScript(stub, 'none');
  await toResumen(p);
  const btn = vis(p, 'quote-share-button');
  let s = await cs(btn, ['backgroundColor', 'borderRadius', 'fontSize', 'fontWeight', 'lineHeight', 'paddingLeft']);
  check(name, 'A button', 'height', 56, s.h);
  check(name, 'A button', 'bg', 'rgb(8, 115, 72)', s.backgroundColor);
  check(name, 'A button', 'radius', '9999px', s.borderRadius);
  check(name, 'A button', 'font', '17px/700/22px', `${s.fontSize}/${s.fontWeight}/${s.lineHeight}`);
  check(name, 'A button', 'padding-x', '28px', s.paddingLeft);
  await p.screenshot({ path: `${OUT}/${name}-A.png` });
  await btn.click();
  const t = p.getByTestId('quote-share-toast');
  await t.waitFor();
  await p.waitForTimeout(400);
  s = await cs(t, ['position', 'backgroundColor', 'borderRadius', 'paddingTop', 'paddingLeft', 'paddingRight', 'rowGap']);
  const r = await t.evaluate((e) => {
    const b = e.getBoundingClientRect();
    return { right: innerWidth - b.right, bottom: innerHeight - b.bottom };
  });
  check(name, 'Toast', 'position', 'fixed', s.position);
  check(name, 'Toast', 'right', 160, r.right);
  check(name, 'Toast', 'bottom', 24, r.bottom);
  check(name, 'Toast', 'width', width === 1920 ? 560 : 480, s.w);
  check(name, 'Toast', 'bg', 'rgb(16, 33, 61)', s.backgroundColor);
  check(name, 'Toast', 'radius', '20px', s.borderRadius);
  check(name, 'Toast', 'padding', '20/24/20', `${px(s.paddingTop)}/${px(s.paddingLeft)}/${px(s.paddingRight)}`);
  check(name, 'Toast', 'gap', '14px', s.rowGap);
  s = await cs(t.getByRole('button', { name: 'Volver a descargar' }), ['backgroundColor', 'color', 'borderRadius', 'fontSize']);
  check(name, 'Toast Volver', 'h/bg/color', '44/rgb(255, 255, 255)/rgb(7, 59, 146)', `${s.h}/${s.backgroundColor}/${s.color}`);
  check(name, 'Toast Volver', 'radius/font', '9999px/15px', `${s.borderRadius}/${s.fontSize}`);
  s = await cs(t.getByRole('link', { name: 'Abrir WhatsApp' }), ['borderTopWidth', 'borderTopColor', 'color']);
  check(name, 'Toast Abrir', 'h/border/color', '44/1.5px rgb(255, 255, 255)/rgb(255, 255, 255)', `${s.h}/${s.borderTopWidth} ${s.borderTopColor}/${s.color}`);
  s = await cs(t.getByRole('button', { name: 'Cerrar aviso' }), ['borderRadius']);
  check(name, 'Toast X', 'size', '44x44', `${s.w}x${s.h}`);
  s = await cs(t.locator('.qs-toast__msg'), ['fontSize', 'lineHeight', 'fontWeight']);
  check(name, 'Toast msg', 'font', '16px/24px/600', `${s.fontSize}/${s.lineHeight}/${s.fontWeight}`);
  await p.screenshot({ path: `${OUT}/${name}-C.png` });
  await ctx.close();
}

const browser = await chromium.launch();
await mobile(browser, 'm390', 'iPhone 13', 390, 44);
await mobile(browser, 'm412', 'Pixel 7', 412, 48);
await desktop(browser, 'd1366', 1366);
await desktop(browser, 'd1920', 1920);
await browser.close();
const bad = rows.filter((r) => !r.ok);
console.log(`checks ${rows.length}, mismatches ${bad.length}`);
for (const r of bad) console.log(`X ${r.vp} | ${r.el} | ${r.prop} | board ${r.board} | site ${r.site}`);
fs.writeFileSync(`${OUT}/r07-fidelity.json`, JSON.stringify(rows, null, 1));
