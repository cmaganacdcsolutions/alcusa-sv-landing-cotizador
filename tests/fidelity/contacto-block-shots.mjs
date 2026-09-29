import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOARD_DIR = path.resolve(__dirname, '../../../../02-design/boards');
const SITE_PORT = process.env.E2E_PORT ?? 4341;
const OUT = process.env.SHOT_DIR ?? 'C:/tmp/shots';

async function main() {
  const browser = await chromium.launch();

  // Desktop 1920
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
    const board = await ctx.newPage();
    await board.goto('file:///' + path.join(BOARD_DIR, 'desktop-08-contacto-webform.dc.html').replace(/\\/g, '/'));
    await board.locator('figure').screenshot({ path: `${OUT}/board-1920-map.png` });
    await board.locator('nav[aria-labelledby="redes-title"]').screenshot({ path: `${OUT}/board-1920-social.png` });

    const site = await ctx.newPage();
    await site.goto(`http://localhost:${SITE_PORT}/contacto`, { waitUntil: 'networkidle' });
    await site.locator('.contacto__map').screenshot({ path: `${OUT}/site-1920-map.png` });
    await site.locator('.contacto__social').screenshot({ path: `${OUT}/site-1920-social.png` });
    await ctx.close();
  }

  // Mobile 390 (ios board)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 1560 } });
    const board = await ctx.newPage();
    await board.goto('file:///' + path.join(BOARD_DIR, 'ios-08-contacto-webform.dc.html').replace(/\\/g, '/'));
    await board.locator('ul').first().screenshot({ path: `${OUT}/board-390-list.png` });

    const site = await ctx.newPage();
    await site.goto(`http://localhost:${SITE_PORT}/contacto`, { waitUntil: 'networkidle' });
    await site.locator('.contacto__map').screenshot({ path: `${OUT}/site-390-map.png` });
    await site.locator('.contacto__social').screenshot({ path: `${OUT}/site-390-social.png` });
    await ctx.close();
  }

  await browser.close();
}
main();
