import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { colorToken } from '../support/tokens';

// Fondo diagonal de todo el sitio (pedido 2026-10-07, variante C "celeste mas claro"): degradado a 135deg, azul noche
// arriba-izquierda -> celeste profundo abajo-derecha, anclado al VIEWPORT (body::before fixed), no al documento.
// Reemplaza la prueba del degradado vertical que progresaba con el scroll (site-chrome.spec.ts).

type Rgb = readonly [number, number, number];

const PAGES = ['/', '/cotizador', '/contacto', '/nosotros'] as const;
const CORNER_TOLERANCE = 3; // niveles por canal: el pixel de muestreo esta ~1px dentro de la esquina
const AA_TEXT = 4.5;

function parseRgb(css: string): Rgb {
  const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(css);
  if (!m) throw new Error(`color no reconocido: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Aisla la capa de fondo: oculta todo el contenido (el pseudo-elemento body::before no es hijo y se sigue pintando). */
async function isolateBackground(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      '* { animation: none !important; transition: none !important; } html { scroll-behavior: auto !important; } body > * { visibility: hidden !important; }',
  });
}

/** Color renderizado (captura real, no el CSS declarado) de un pixel dentro de la esquina indicada del viewport. */
async function cornerColor(page: Page, corner: 'top-left' | 'bottom-right'): Promise<Rgb> {
  const { w, h } = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const x = corner === 'top-left' ? 1 : w - 3;
  const y = corner === 'top-left' ? 1 : h - 3;
  // El decodificador de imagenes de WebKit falla de vez en cuando en la PRIMERA captura de la sesion ("Loading error"):
  // es ruido del medidor, no del fondo, asi que se reintenta la captura + decodificacion.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const buf = await page.screenshot({ clip: { x, y, width: 2, height: 2 } });
      const px = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
      }, buf.toString('base64'));
      if (px) return [px[0] ?? 0, px[1] ?? 0, px[2] ?? 0];
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(150);
    }
  }
  throw new Error(`no se pudo leer el pixel de la captura: ${String(lastError)}`);
}

async function scrollInstant(page: Page, top: number): Promise<number> {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);
  await page.waitForFunction((y) => Math.abs(window.scrollY - y) < 2 || window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 2, top);
  await page.waitForTimeout(100);
  return page.evaluate(() => window.scrollY);
}

function expectNear(actual: Rgb, expected: Rgb, label: string): void {
  for (let i = 0; i < 3; i += 1) {
    expect(Math.abs((actual[i] ?? 0) - (expected[i] ?? 0)), `${label}: canal ${i} ${actual.join(',')} vs ${expected.join(',')}`).toBeLessThanOrEqual(CORNER_TOLERANCE);
  }
}

test.describe('fondo diagonal anclado al viewport', () => {
  for (const path of PAGES) {
    test(`${path}: body::before es fixed y cubre el viewport con el degradado diagonal`, async ({ page }) => {
      await page.goto(path);
      const layer = await page.evaluate(() => {
        const s = getComputedStyle(document.body, '::before');
        return { position: s.position, image: s.backgroundImage, width: parseFloat(s.width), height: parseFloat(s.height), vw: document.documentElement.clientWidth, vh: window.innerHeight };
      });
      expect(layer.position).toBe('fixed');
      expect(layer.image).toContain('linear-gradient');
      expect(layer.image).toContain('135deg');
      expect(Math.abs(layer.width - layer.vw)).toBeLessThanOrEqual(1);
      expect(layer.height).toBeGreaterThanOrEqual(layer.vh - 1);
    });

    test(`${path}: esquina superior izquierda mas oscura que la inferior derecha, igual en cualquier scroll`, async ({ page }) => {
      await page.goto(path);
      await isolateBackground(page);
      const start = parseRgb(await colorToken(page, '--color-page-diag-start'));
      const end = parseRgb(await colorToken(page, '--color-page-diag-end'));

      const tl0 = await cornerColor(page, 'top-left');
      const br0 = await cornerColor(page, 'bottom-right');
      expect(luminance(tl0), `arriba-izquierda ${tl0.join(',')} vs abajo-derecha ${br0.join(',')}`).toBeLessThan(luminance(br0) - 0.05);
      // Las esquinas son los extremos del degradado (0% y 100%).
      expectNear(tl0, start, 'esquina superior izquierda = --color-page-diag-start');
      expectNear(br0, end, 'esquina inferior derecha = --color-page-diag-end');

      // Segunda posicion de scroll (fondo del documento, o lo mas lejos posible si la pagina es corta).
      const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      const scrolled = await scrollInstant(page, Math.max(0, Math.floor(maxScroll / 2)));
      if (maxScroll > 200) expect(scrolled, 'la pagina deberia haberse desplazado').toBeGreaterThan(50);
      const tl1 = await cornerColor(page, 'top-left');
      const br1 = await cornerColor(page, 'bottom-right');
      expect(tl1, 'esquina superior izquierda tras el scroll').toEqual(tl0);
      expect(br1, 'esquina inferior derecha tras el scroll').toEqual(br0);

      await scrollInstant(page, Math.max(0, maxScroll));
      expect(await cornerColor(page, 'top-left'), 'esquina superior izquierda al final de la pagina').toEqual(tl0);
      expect(await cornerColor(page, 'bottom-right'), 'esquina inferior derecha al final de la pagina').toEqual(br0);
    });

    test(`${path}: el punto mas claro del fondo mantiene >= 4.5:1 con blanco, secundario y acento`, async ({ page }) => {
      await page.goto(path);
      await isolateBackground(page);
      const br = await cornerColor(page, 'bottom-right');
      const tokens = {
        '--color-text-on-dark': 'blanco',
        '--color-text-on-dark-muted': 'secundario',
        '--color-accent-on-dark': 'acento',
      } as const;
      for (const [token, label] of Object.entries(tokens)) {
        const fg = parseRgb(await colorToken(page, token as `--${string}`));
        expect(contrast(fg, br), `${label} (${token}) sobre ${br.join(',')}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  }

  test('/: el aro de foco (blanco) mantiene >= 3:1 contra el punto mas claro del fondo y contra la tarjeta elevada', async ({ page }) => {
    await page.goto('/');
    await isolateBackground(page);
    const br = await cornerColor(page, 'bottom-right');
    const ring = parseRgb(await colorToken(page, '--color-ring-on-dark'));
    const raised = parseRgb(await colorToken(page, '--color-surface-dark-raised'));
    expect(contrast(ring, br), 'aro vs fondo mas claro').toBeGreaterThanOrEqual(3);
    expect(contrast(ring, raised), 'aro vs tarjeta elevada').toBeGreaterThanOrEqual(3);
  });
});
