import { expect, test } from './fixtures';

// Motion 02 (02-design/specs/motion-02-cinematic-proposal.md). Unico spec que corre con movimiento REAL:
// el proyecto "motion" usa reducedMotion:'no-preference'; los demas proyectos lo ignoran (testIgnore).
// Sin screenshots: afirma estados finales esperando eventos del navegador, nunca waitForTimeout.

// El minificador reescribe 720ms como .72s: se normaliza a numero (ms o px) para comparar.
const token = (name: string) => `(() => {
  const v = getComputedStyle(document.documentElement).getPropertyValue('${name}').trim();
  return v.endsWith('ms') ? parseFloat(v) : v.endsWith('s') ? Math.round(parseFloat(v) * 1000) : parseFloat(v);
})()`;

test.describe('motion: tokens', () => {
  test('los tokens nuevos existen con movimiento normal y se anulan con reduce', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(token('--motion-duration-reveal'))).toBe(720);
    expect(await page.evaluate(token('--motion-stagger'))).toBe(70);
    expect(await page.evaluate(token('--motion-dist-reveal'))).toBe(14);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(token('--motion-duration-reveal'))).toBe(0);
    expect(await page.evaluate(token('--motion-dist-reveal'))).toBe(0);
  });
});
