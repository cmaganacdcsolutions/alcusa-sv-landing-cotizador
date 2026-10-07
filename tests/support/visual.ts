import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Combo } from './combos';

/** Visual baselines only exist for 390 (ios390) and 1920 (desktop1920); android412 is skipped. */
export function onlyVisualProjects(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'ios390' || testInfo.project.name === 'desktop1920';
}

/** Deterministic page: no motion (also stops carousel autoplay), fonts + every image decoded, top of page. */
export async function settleForScreenshot(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => ((i as HTMLImageElement).loading = 'eager'));
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))),
    );
  });
  // layout must stop moving (step transitions / focus / entering animations) before we shoot.
  let prev = '';
  for (let i = 0; i < 30; i++) {
    const sig = await page.evaluate(() => {
      window.scrollTo(0, 0);
      const h = document.querySelector('h1, h2, h3');
      return JSON.stringify([document.documentElement.scrollHeight, h?.getBoundingClientRect().top, document.querySelectorAll('*').length]);
    });
    if (sig === prev) break;
    prev = sig;
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

export async function openCotizador(page: Page): Promise<void> {
  await page.goto('/cotizador#cotizador/0-producto');
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

/** Selects a leaf in step 0 and clicks Siguiente -> step 1 (Medidas). */
export async function chooseLeaf(page: Page, combo: Combo): Promise<void> {
  const types = page.getByRole('group', { name: /^(Tipo de|Hojas de la)/ });
  await expect(async () => {
    await page.getByRole('group', { name: 'Categoría' }).getByRole('button').nth(combo.categoryIndex).click();
    await expect(types).toBeVisible({ timeout: 1500 });
  }).toPass();
  await types.getByRole('button').nth(combo.typeIndex).click();
  if (combo.variantIndex !== null) await page.getByRole('group', { name: /^Acabado/ }).getByRole('button').nth(combo.variantIndex).click();
  await page.getByRole('button', { name: 'Siguiente' }).click({ force: true });
  await expect(page.locator('#step1-heading')).toBeVisible();
}
