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

const opacity = (el: import('@playwright/test').Locator) => el.evaluate((n) => getComputedStyle(n).opacity);

test.describe('motion E1: revelado escalonado', () => {
  test('con movimiento: lo visible al cargar no se anima; lo de abajo parte oculto y termina visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    const intro = page.locator('.hintro');
    const first = page.locator('.pcard').first();
    await expect(intro).toHaveClass(/\bin\b/);
    await expect(intro).not.toHaveClass(/\brv\b/);
    await expect(first).toHaveClass(/\bin\b/);
    await expect(first).not.toHaveClass(/\brv\b/);
    const last = page.locator('.pcard').last();
    await expect(last).not.toHaveClass(/\bin\b/);
    expect(await opacity(last)).toBe('0');
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveClass(/\bin\b/);
    await expect(last).toHaveCSS('opacity', '1'); // reintenta hasta que termina la animacion
    await expect(last).toHaveCSS('transform', 'none');
  });

  test('el estado final se alcanza con cada elemento revelado una sola vez (clase in permanente)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    const heads = page.locator('.csec__head');
    const n = await heads.count();
    await heads.nth(n - 1).scrollIntoViewIfNeeded();
    await expect(heads.nth(n - 1)).toHaveClass(/\bin\b/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(heads.nth(n - 1)).toHaveClass(/\bin\b/);
    await expect(heads.nth(n - 1)).toHaveCSS('opacity', '1');
  });

  test('reduced-motion: nada se oculta ni se anima', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForSelector('html[data-js]');
    await expect(page.locator('html')).not.toHaveAttribute('data-motion', '');
    for (const el of await page.locator('[data-reveal]').all()) expect(await opacity(el)).toBe('1');
  });

  test('?motion=off: modo estatico', async ({ page }) => {
    await page.goto('/?motion=off');
    await page.waitForSelector('html[data-js]');
    await expect(page.locator('html')).toHaveAttribute('data-motion-off', '');
    await expect(page.locator('html')).not.toHaveAttribute('data-motion', '');
    expect(await opacity(page.locator('.pcard').last())).toBe('1');
  });

  test('sin JS: todo visible', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.goto('/');
    expect(await opacity(page.locator('.pcard').last())).toBe('1');
    expect(await opacity(page.locator('.hintro__title'))).toBe('1');
    await ctx.close();
  });
});

