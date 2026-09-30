import { expect, test } from './fixtures';


// R3 (2026-09-30): el grid de catalogo, la galeria, el banner del cotizador y las anclas
// /#modelos /#galeria salieron de la landing. Estos casos se marcan fixme (NO se borran):
// los de catalogo/galeria se re-hospedan en /catalogo (slice R2); los de nav se reescriben
// contra el drawer/footer nuevos. Ver HANDOFF R3.
const R3_MOVED = new Set<string>([".catalogo__title matches the board size", ".cotizador-teaser__title matches the board size", ".galeria__title matches the board size"]);
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.fixme(R3_MOVED.has(info.title), 'R3: seccion fuera de la landing; migrar (ver HANDOFF R3)');
});

// Landing section h2s per the boards (Main.dc.html, android-01-inicio.dc.html,
// desktop-01-inicio.dc.html): 30px/1.15 on mobile, 44px/52px on desktop (boards r01).
const TITLES = [
  { selector: '#proceso-title', mobile: 30 },
  { selector: '.catalogo__title', mobile: 30 },
  { selector: '.galeria__title', mobile: 30 },
  { selector: '.confianza__title', mobile: 30 },
  { selector: '.cotizador-teaser__title', mobile: 28 },
  { selector: '.info__title', mobile: 30 },
];

test.describe('landing — section title typography', () => {
  for (const { selector, mobile } of TITLES) {
    test(`${selector} matches the board size`, async ({ page }, testInfo) => {
      const isDesktop = testInfo.project.name === 'desktop1920';
      await page.goto('/');
      const title = page.locator(selector).first();
      await title.scrollIntoViewIfNeeded();
      const { fontSize, lineHeight } = await title.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          fontSize: parseFloat(cs.fontSize),
          lineHeight: parseFloat(cs.lineHeight),
        };
      });
      if (isDesktop) {
        expect(fontSize).toBe(44);
        expect(Math.abs(lineHeight - 52)).toBeLessThanOrEqual(0.5);
      } else {
        expect(fontSize).toBe(mobile);
        expect(Math.abs(lineHeight - mobile * 1.15)).toBeLessThanOrEqual(0.5);
      }
    });
  }
});
