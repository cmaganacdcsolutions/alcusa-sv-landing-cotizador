import { defineConfig, devices } from '@playwright/test';

// Dev-mode smoke: runs against `astro dev` (NOT the production build), because some bugs only exist
// there (e.g. `_jsxDEV is not a function`, dev-only hydration errors). Port 4420 is reserved for this
// (4400 = the user's live dev server, 4410 = e2e preview). Playwright starts AND stops the server.
// SMOKE_AREAS=cotizador,home,... limits the pages (verify:area); unset = everything.
// SMOKE_PORT lets a parallel agent run it on its own port (never 4400/4410/4420 when those are taken).
const PORT = Number(process.env.SMOKE_PORT ?? 4420);

export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  forbidOnly: true,
  reporter: [['list'], ['html', { open: 'never', outputFolder: "playwright-report/smoke" }]],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx astro dev --port ${PORT} --host localhost --ignore-lock`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false, // never attach to a server we did not start (and never touch 4400)
    timeout: 180_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    env: {
      PUBLIC_COTIZADOR_MODE: 'mock',
      PUBLIC_QUOTE_API: 'mock',
      ALCUSA_PROMOS_TODAY: '2026-10-15',
    },
  },
  projects: [{ name: 'dev-desktop1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } }],
});
