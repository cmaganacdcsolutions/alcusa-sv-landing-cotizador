import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from './fixtures';

// sf-landing6: fidelity fixes for Hero (bigger H1 / smaller category cards)
// and ComoFunciona (bigger "Tu pedido, en cuatro pasos claros" title).
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

const BOARD_BY_PROJECT: Record<string, string> = {
  ios390: 'Main.dc.html',
  android412: 'android-01-inicio.dc.html',
  desktop1920: 'desktop-01-inicio.dc.html',
};

function boardUrl(project: string): string {
  const file = BOARD_BY_PROJECT[project];
  if (!file) throw new Error(`No board mapped for project "${project}"`);
  return pathToFileURL(path.join(BOARDS_DIR!, file)).toString();
}

test.describe('landing6 — hero + cómo funciona fidelity (desktop H1/cards bigger/smaller, proceso title break)', () => {
  test('hero H1 computed font-size matches the board for this breakpoint', async ({
    page,
  }, testInfo) => {
    const board = await page.context().newPage();
    await board.goto(boardUrl(testInfo.project.name));
    const boardH1 =
      testInfo.project.name === 'desktop1920'
        ? board.locator('#hero-title')
        : board.locator('h1').first();
    const boardFontSize = await boardH1.evaluate((el) => getComputedStyle(el).fontSize);
    await board.close();

    await page.goto('/');
    const h1 = page.locator('#hero-title');
    await expect(h1).toBeVisible();
    const shippedFontSize = await h1.evaluate((el) => getComputedStyle(el).fontSize);

    expect(shippedFontSize).toBe(boardFontSize);
  });

  test('a hero category card bounding box matches the board within ±2px', async ({
    page,
  }, testInfo) => {
    const board = await page.context().newPage();
    await board.goto(boardUrl(testInfo.project.name));
    // :has(img) excludes the unrelated header "Cotizar" CTA on the desktop
    // board, which also links to a producto-medidas board but has no image.
    const boardCard = board.locator('a[href*="producto-medidas"]:has(img)').first();
    const boardBox = await boardCard.boundingBox();
    await board.close();
    expect(boardBox).not.toBeNull();

    await page.goto('/');
    const card = page.locator('.hero__category-card').first();
    await card.scrollIntoViewIfNeeded();
    const shippedBox = await card.boundingBox();
    expect(shippedBox).not.toBeNull();

    expect(Math.abs(shippedBox!.width - boardBox!.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(shippedBox!.height - boardBox!.height)).toBeLessThanOrEqual(2);
  });

  test('ComoFunciona title size matches the board for this breakpoint', async ({
    page,
  }, testInfo) => {
    const board = await page.context().newPage();
    await board.goto(boardUrl(testInfo.project.name));
    const boardTitle =
      testInfo.project.name === 'desktop1920'
        ? board.locator('#proceso-title')
        : board.locator('h2').first();
    const boardFontSize = await boardTitle.evaluate(
      (el) => getComputedStyle(el).fontSize,
    );
    await board.close();

    await page.goto('/');
    const title = page.locator('#proceso-title');
    await title.scrollIntoViewIfNeeded();
    const shippedFontSize = await title.evaluate((el) => getComputedStyle(el).fontSize);

    expect(shippedFontSize).toBe(boardFontSize);
  });

  test('ComoFunciona title renders on 2 lines on desktop, breaking after "en"', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop1920',
      'AC only requires the 2-line check at desktop',
    );

    await page.goto('/');
    const title = page.locator('#proceso-title');
    await title.scrollIntoViewIfNeeded();

    const hasExplicitBreak = (await title.locator('br').count()) > 0;
    const { height, lineHeight } = await title.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return {
        height: box.height,
        lineHeight: parseFloat(getComputedStyle(el).lineHeight),
      };
    });

    expect(hasExplicitBreak || height >= lineHeight * 1.8).toBe(true);
  });
});
