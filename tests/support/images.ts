import type { Page } from '@playwright/test';

/**
 * Regression guard for "images render at 0x0 / go missing".
 * Forces lazy images to load, then returns a description of every RENDERED <img>
 * (one that has a layout box, i.e. not display:none) that failed to decode or
 * has a zero-sized box. Empty array = healthy page.
 */
export async function findBrokenImages(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => ((i as HTMLImageElement).loading = 'eager'));
  });
  await page
    .waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 20_000 })
    .catch(() => undefined);
  return page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.getClientRects().length > 0)
      .flatMap((img) => {
        const r = img.getBoundingClientRect();
        const name = (img.getAttribute('src') ?? img.currentSrc ?? '').slice(0, 120);
        const problems: string[] = [];
        if (!img.complete || img.naturalWidth === 0) problems.push('not decoded');
        if (r.width < 1 || r.height < 1) problems.push(`zero box ${Math.round(r.width)}x${Math.round(r.height)}`);
        return problems.length ? [`${name} -> ${problems.join(', ')}`] : [];
      }),
  );
}
