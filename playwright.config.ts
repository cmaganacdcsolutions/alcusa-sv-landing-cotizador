import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets parallel worktrees run their own preview server side by side.
const PORT = Number(process.env.E2E_PORT ?? 4321);
const BASE_URL = `http://localhost:${PORT}`;
// Variantes de promos (ver webServer): PORT+1 = 1 promo, PORT+2 = estados C y D.

// 3 viewport projects per ADR-006 / task brief. Named for reuse across
// every later e2e spec: ios390, android412, desktop1920.
export default defineConfig({
  testDir: './tests/e2e',
  // Refuses to run against a missing/stale dist-e2e (i.e. when `pretest:e2e` was skipped by calling
  // `playwright test` directly). Always use `npm run test:e2e`, `verify`, or `verify:area`.
  globalSetup: './tests/support/e2e-fresh-build.ts',
  fullyParallel: true,
  // Capped: with the machine shared (dev server, browsers, other agents) 6 workers made touch-emulated
  // click/screenshot actions time out. Override with E2E_WORKERS.
  workers: Number(process.env.E2E_WORKERS ?? 3),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{-projectName}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
      // Visual baselines are per OS (font rendering differs win32 vs linux). Golden JSON (toMatchSnapshot)
      // keeps the global snapshotPathTemplate above and stays platform independent.
      pathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{-projectName}-{platform}{ext}',
    },
  },
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Motion 02: todo e2e corre con movimiento reducido (estado final, determinista). Solo el proyecto 'motion' lo anula.
    reducedMotion: 'reduce',
  },
  // Las variantes salen de scripts/build-e2e-fixtures.mjs (pretest:e2e): hoy congelado y
  // fixtures de promos, para que el e2e no dependa de la vigencia del seed.
  webServer: [
    { name: 'base', port: 0 },
    { name: 'one', port: 1 },
    { name: 'states', port: 2 },
  ].map(({ name, port }) => ({
    command: `node scripts/serve-static.mjs dist-e2e/p${PORT}/${name} ${PORT + port}`,
    url: `http://localhost:${PORT + port}`,
    reuseExistingServer: !process.env.CI,
  })),
  projects: [
    {
      name: 'ios390',
      testIgnore: /motion\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'android412',
      testIgnore: /motion\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop1920',
      testIgnore: /motion\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      // Motion 02: unico proyecto con movimiento real. Sin screenshots; afirma estados finales (tests/e2e/motion.spec.ts).
      name: 'motion',
      testMatch: /motion\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' },
    },
  ],
});
