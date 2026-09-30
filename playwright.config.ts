import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets parallel worktrees run their own preview server side by side.
const PORT = Number(process.env.E2E_PORT ?? 4321);
const BASE_URL = `http://localhost:${PORT}`;
// Variantes de promos (ver webServer): PORT+1 = 1 promo, PORT+2 = estados C y D.

// 3 viewport projects per ADR-006 / task brief. Named for reuse across
// every later e2e spec: ios390, android412, desktop1920.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  // Las variantes salen de scripts/build-e2e-fixtures.mjs (pretest:e2e): hoy congelado y
  // fixtures de promos, para que el e2e no dependa de la vigencia del seed.
  webServer: [
    { name: 'base', port: 0 },
    { name: 'one', port: 1 },
    { name: 'states', port: 2 },
  ].map(({ name, port }) => ({
    command: `node scripts/serve-static.mjs dist-e2e/${name} ${PORT + port}`,
    url: `http://localhost:${PORT + port}`,
    reuseExistingServer: !process.env.CI,
  })),
  projects: [
    {
      name: 'ios390',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'android412',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop1920',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
});
