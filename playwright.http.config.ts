import { defineConfig, devices } from '@playwright/test';

// ADR-013 N2-FE: the cotizador against the REAL local Node API (PUBLIC_QUOTE_API=http, DB alcusa_test).
//   npm run test:e2e:http      (builds dist-e2e/http first, see package.json)
// The mock suite (playwright.config.ts) is untouched. Ports: astro-like static+proxy 4431, API 3001.
try {
  process.loadEnvFile('server/.env'); // DB credentials for the helper / server; never printed
} catch {
  /* CI provides the env */
}
process.env.NODE_ENV = 'test';

const WEB_PORT = Number(process.env.E2E_HTTP_PORT ?? 4431);
const API_PORT = 3001;

export default defineConfig({
  testDir: './tests/e2e-http',
  fullyParallel: true,
  workers: 3,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-http' }]],
  globalSetup: './tests/e2e-http/global-setup.ts',
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'on-first-retry' },
  webServer: [
    {
      name: 'api',
      command: 'npm run server:dev',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: { NODE_ENV: 'test', PORT: String(API_PORT), LOG_LEVEL: 'silent' },
      timeout: 60_000,
    },
    {
      name: 'web',
      command: `node scripts/serve-static.mjs dist-e2e/http ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { API_ORIGIN: `http://127.0.0.1:${API_PORT}` },
    },
  ],
  projects: [
    { name: 'ios390', use: { ...devices['iPhone 13'] } },
    { name: 'android412', use: { ...devices['Pixel 7'] } },
    { name: 'desktop1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  ],
});
