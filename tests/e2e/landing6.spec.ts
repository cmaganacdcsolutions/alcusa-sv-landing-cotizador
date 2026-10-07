import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from './fixtures';

// sf-landing6: fidelity of ComoFunciona ("Tu pedido…" title). The old Hero checks (H1 size, "Cotizar ahora" box)
// were retired: the hero was replaced by the compact HomeIntro (no board counterpart).
// Rather than hardcoding pixel values, each check opens the matching
// approved board directly (file://) and compares the shipped page against
// what the board itself renders — the true source of truth.
// The boards live outside this (public) repo: next to the main checkout
// (../02-design) or two levels up from a 03-dev-wt/<slice> worktree. When
// neither exists (CI), these board-comparison checks are skipped.
const BOARDS_DIR = [
  path.resolve(process.cwd(), '..', '02-design', 'boards'),
  path.resolve(process.cwd(), '..', '..', '02-design', 'boards'),
].find((dir) => existsSync(dir));

test.skip(!BOARDS_DIR, 'Design boards not available in this checkout');

// Boards r01 (Revision 2026-09-29).
const R01_BY_PROJECT: Record<string, string> = {
  ios390: 'ios-r01-landing-promos.dc.html',
  android412: 'android-r01-landing-promos.dc.html',
  desktop1920: 'desktop-r01-landing-promos.dc.html',
};

function boardUrl(project: string): string {
  return pathToFileURL(path.join(BOARDS_DIR!, 'revision-2026-09-29', R01_BY_PROJECT[project])).toString();
}

test.describe('landing6 — cómo funciona fidelity (proceso title vs the r01 board)', () => {
  test('ComoFunciona title size matches the r01 board for this breakpoint', async ({ page }, testInfo) => {
    const board = await page.context().newPage();
    await board.goto(boardUrl(testInfo.project.name));
    const boardFontSize = await board
      .locator('#proceso h2')
      .evaluate((el) => getComputedStyle(el).fontSize);
    await board.close();

    await page.goto('/');
    const title = page.locator('#proceso-title');
    await title.scrollIntoViewIfNeeded();
    const shippedFontSize = await title.evaluate((el) => getComputedStyle(el).fontSize);

    expect(shippedFontSize).toBe(boardFontSize);
  });
});
