import { chromium } from '@playwright/test';

const SITE_PORT = process.env.E2E_PORT ?? 4341;
const OUT = process.env.SHOT_DIR ?? 'C:/tmp/shots';

async function main() {
  const browser = await chromium.launch();

  const d = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await d.setViewportSize({ width: 1920, height: 1080 });
  await d.goto(`http://localhost:${SITE_PORT}/contacto`, { waitUntil: 'networkidle' });
  await d.screenshot({ path: `${OUT}/site-1920-full.png`, fullPage: true });

  const m = await browser.newPage();
  await m.setViewportSize({ width: 390, height: 1560 });
  await m.goto(`http://localhost:${SITE_PORT}/contacto`, { waitUntil: 'networkidle' });
  await m.screenshot({ path: `${OUT}/site-390-full.png`, fullPage: true });

  await browser.close();
}
main();
