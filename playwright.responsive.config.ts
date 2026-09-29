import { defineConfig, devices } from '@playwright/test';

// Dedicated config for the responsive sweep (qa-cot-resp). Separate from
// playwright.config.ts (which owns the 3-project ios390/android412/
// desktop1920 matrix used by every other e2e spec) so this file's 15-viewport
// matrix never multiplies onto the rest of the suite. Run with:
//   E2E_PORT=4361 npx playwright test --config=playwright.responsive.config.ts
const PORT = Number(process.env.E2E_PORT ?? 4361);
const BASE_URL = `http://localhost:${PORT}`;

// Task qa-cot-resp viewport matrix: real device CSS-px sizes (phones,
// tablets, laptops/desktops) requested by Carlos 2026-09-29.
export const VIEWPORTS: { width: number; height: number }[] = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

export default defineConfig({
  testDir: './tests/responsive',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 45000,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report-responsive' }],
    ['json', { outputFile: 'test-results/qa-resp/results.json' }],
    ['line'],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    env: {
      PUBLIC_COTIZADOR_MODE: 'mock',
    },
  },
  projects: VIEWPORTS.map((vp) => ({
    name: `${vp.width}x${vp.height}`,
    use: { ...devices['Desktop Chrome'], viewport: vp },
  })),
});
