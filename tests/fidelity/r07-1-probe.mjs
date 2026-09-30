// R07.1 fidelity probe: customer dialog (site .cf-*) vs the r07 boards rendered with the canvas runtime.
// Run: node tests/fidelity/r07-1-probe.mjs <port> <outdir> <boardsDir>
//   boardsDir holds {ios,android,desktop}-r07-cotizador-pdf.dc.html and ../support.js resolves (canvas runtime).
//   Needs `npm run preview -- --port <port>`.
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = process.argv[2] ?? '4371';
const OUT = process.argv[3] ?? '.';
const BOARDS = process.argv[4] ?? '.';
const base = `http://localhost:${PORT}`;
const STORE = 'alcusa.cliente.v1';
const rows = [];

// logical element -> [name, board selector (mobile), board selector (desktop), site selector]
const ELS = [
  ['sheet', '.cfs', '.mdl', '.cf-dialog'],
  ['grabber', '.gr', null, '.cf-grabber'],
  ['title-wrap', '.ti', '.ti', '.cf-title'],
  ['h2', 'h2', 'h2', '.cf-title h2'],
  ['sub', '.sb', '.sb', '.cf-sub'],
  ['close', '.cx', '.cx', '.cf-x'],
  ['fields', '.fl', '.fl', '.cf-fields'],
  ['field', '.f', '.f', '.cf-field'],
  ['label', '.f label', '.f label', '.cf-field label'],
  ['input', '.qi', '.qi', '.cf-input'],
  ['input-text', '.qi input', '.qi input', '.cf-input input'],
  ['prefix', '.qp', '.qp', '.cf-prefix'],
  ['hint', '.qh', '.qh', '.cf-hint'],
  ['err', '.f .qe', '.f .qe', '.cf-field .cf-err'],
  ['err-consent', '.qc + .qe', '.cc + .qe', '.cf-err--consent'],
  ['note', '.qn', '.qn', '.cf-note'],
  ['consent', 'div.qc', '.cc', '.cf-consent'],
  ['cb-hit', '.bx', '.bx', '.cf-box'],
  ['cbv', '.cbv', '.cbv', '.cf-cbv'],
  ['ct', '.ct', '.ct', '.cf-ct'],
  ['ct-link', '.ct a', '.ct a', '.cf-ct a'],
  ['server', '.qs', '.qs', '.cf-server'],
  ['cta', '.wa', '.pill.wa', '.cf-cta'],
  ['link', '.tl', '.qn button, button.qc', '.cf-link'],
];
const PROPS = [
  'display', 'flexDirection', 'alignItems', 'justifyContent', 'rowGap', 'columnGap',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'textDecorationLine', 'textUnderlineOffset',
  'borderTopWidth', 'borderTopColor', 'borderRightWidth', 'borderRightColor', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopLeftRadius', 'borderBottomRightRadius', 'boxShadow', 'opacity',
];

// Serialised into the page. Positions (x, y) are relative to the sheet root.
const MEASURE_SRC = `(root, specs, props) => {
  const out = {};
  const rr = root.getBoundingClientRect();
  for (const [name, sel] of specs) {
    if (!sel) continue;
    const list = [...root.querySelectorAll(sel)];
    if (root.matches(sel)) list.unshift(root);
    out[name] = list.map((e) => {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const o = { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, x: Math.round((r.left - rr.left) * 10) / 10, y: Math.round((r.top - rr.top) * 10) / 10 };
      for (const p of props) o[p] = s[p];
      o.font = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      return o;
    });
  }
  return out;
}`;

function compare(vp, state, b, s) {
  for (const [name] of ELS) {
    const bl = b[name] ?? [];
    const sl = s[name] ?? [];
    if (bl.length !== sl.length) {
      rows.push({ vp, state, el: name, prop: 'count', board: bl.length, site: sl.length, ok: false });
      continue;
    }
    bl.forEach((bo, i) => {
      const so = sl[i];
      const el = bl.length > 1 ? `${name}[${i}]` : name;
      for (const k of Object.keys(bo)) {
        if (name === 'sheet' && (k === 'x' || k === 'y')) continue; // placement differs between artboard and viewport
        if (name === 'close' && (k.startsWith('padding') || k === 'font')) continue; // icon-only button, fixed size
        rows.push({ vp, state, el, prop: k, board: bo[k], site: so[k], ok: String(bo[k]) === String(so[k]) });
      }
    });
  }
}

async function boardMeasure(browser, file, vpw, vph, desktop, ua) {
  const ctx = await browser.newContext({ viewport: { width: vpw, height: vph }, ...(ua ? { userAgent: ua } : {}) });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(path.join(BOARDS, file)).href);
  await p.waitForSelector(desktop ? '.mdl' : '.cfs', { timeout: 20000 });
  await p.addStyleTag({ content: '.ph{border:0!important}' }); // artboard frame border would make the sheet 2px narrower
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);
  const res = await p.evaluate(
    ([src, specs, props, sheetSel]) => {
      const fn = (0, eval)(src);
      return [...document.querySelectorAll(sheetSel)].map((sh) => {
        const full = sh.getBoundingClientRect().height;
        sh.querySelectorAll('.am').forEach((e) => (e.style.display = 'none')); // board-only [URL pendiente] chip
        return { fullHeight: full, m: fn(sh, specs, props) };
      });
    },
    [MEASURE_SRC, ELS.map(([n, m, d]) => [n, desktop ? d : m]), PROPS, desktop ? '.mdl' : '.cfs'],
  );
  await ctx.close();
  return res;
}

async function siteState(browser, ctxOpts, tag, state) {
  const ctx = await browser.newContext(ctxOpts);
  const p = await ctx.newPage();
  await p.addInitScript(
    ([st, key]) => {
      window.open = () => null;
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
      if (st === 'H4') sessionStorage.setItem(key, JSON.stringify({ name: 'María López', whatsapp: '7123-4567', consent: { accepted: true, noticeVersion: '2026-10-v1' }, savedAt: new Date().toISOString() }));
      if (st === 'H5') sessionStorage.setItem('alcusa.mock.quote', 'rate_limited');
      if (st === 'H3') sessionStorage.setItem('alcusa.mock.quote-delay', '8000');
    },
    [state, STORE],
  );
  await p.route('**/_astro/render*.js', (r) => r.abort());
  await p.goto(`${base}/cotizador`);
  await p.waitForSelector('[data-hydrated="true"]');
  await p.getByRole('button', { name: /Puerta de baño recta/ }).click();
  await p.getByRole('button', { name: 'Siguiente' }).click();
  await p.getByRole('button', { name: 'Siguiente' }).click();
  await p.locator('#municipio').selectOption('Soyapango');
  await p.getByRole('button', { name: 'Siguiente' }).click();
  await p.getByRole('heading', { name: 'Resumen de tu cotización' }).waitFor();
  await p.getByTestId('quote-share-button').locator('visible=true').first().click();
  const d = p.getByRole('dialog', { name: 'Tus datos para la cotización' });
  await d.waitFor();
  await p.waitForTimeout(500);
  const cta = d.locator('.cf-cta');
  if (state === 'H2') {
    await d.getByLabel('Nombre').fill('M');
    await d.getByLabel('WhatsApp').fill('51234567');
    await cta.click();
    await d.locator('.cf-err--consent').waitFor();
    await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()); // board shows the error state unfocused
  }
  if (state === 'H3' || state === 'H5') {
    await d.getByLabel('Nombre').fill('María López');
    await d.getByLabel('WhatsApp').fill('71234567');
    await d.getByRole('checkbox').check();
    await cta.click();
    await (state === 'H3' ? d.locator('.cf-cta[aria-busy="true"]') : d.locator('.cf-server')).waitFor();
    await p.waitForTimeout(300);
  }
  await p.mouse.move(1, 1); // keep :hover off the CTA
  const m = await d.evaluate(
    (root, [src, specs, props]) => (0, eval)(src)(root, specs, props),
    [MEASURE_SRC, ELS.map(([n, , , s]) => [n, s]), PROPS],
  );
  const gap = await d.evaluate((e) => innerHeight - e.getBoundingClientRect().bottom);
  await p.screenshot({ path: `${OUT}/${tag}-${state}.png` });
  await ctx.close();
  return { m, gap };
}

const browser = await chromium.launch();
const VPS = [
  { vp: 'm390', file: 'ios-r07-cotizador-pdf.dc.html', w: 390, h: 844, dev: 'iPhone 13', desk: false },
  { vp: 'm412', file: 'android-r07-cotizador-pdf.dc.html', w: 412, h: 915, dev: 'Pixel 7', desk: false },
  { vp: 'd1920', file: 'desktop-r07-cotizador-pdf.dc.html', w: 1920, h: 1080, dev: null, desk: true },
];
const HEIGHTS = { m: { H1: 552, H2: 592, H3: 552, H4: 648, H5: 658 }, d: { H1: 616, H2: 656, H3: 616, H4: 712, H5: 716 } };
const STATES = ['H1', 'H2', 'H3', 'H4', 'H5'];
const heights = [];
for (const v of VPS) {
  const ua = v.dev ? devices[v.dev].userAgent : undefined;
  const bm = await boardMeasure(browser, v.file, v.w, v.h, v.desk, ua);
  for (let i = 0; i < STATES.length; i++) {
    const st = STATES[i];
    const ctxOpts = v.dev ? { ...devices[v.dev], viewport: { width: v.w, height: v.h } } : { viewport: { width: v.w, height: v.h } };
    const s = await siteState(browser, ctxOpts, v.vp, st);
    compare(v.vp, st, bm[i].m, s.m);
    heights.push({
      vp: v.vp,
      state: st,
      spec: HEIGHTS[v.desk ? 'd' : 'm'][st],
      boardWithChip: bm[i].fullHeight,
      boardNoChip: bm[i].m.sheet[0].h,
      site: s.m.sheet[0].h,
      siteBottomGap: Math.round(s.gap * 10) / 10,
    });
  }
}
await browser.close();
const bad = rows.filter((r) => !r.ok);
console.log(`checks ${rows.length}, mismatches ${bad.length}`);
for (const r of bad) console.log(`X ${r.vp} ${r.state} | ${r.el} | ${r.prop} | board ${r.board} | site ${r.site}`);
console.log('HEIGHTS');
for (const h of heights) console.log(JSON.stringify(h));
fs.writeFileSync(`${OUT}/r07-1-fidelity.json`, JSON.stringify({ rows, heights }, null, 1));
