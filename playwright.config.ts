import { defineConfig, devices } from '@playwright/test';

// 3 viewport projects per ADR-006 / task brief. Named for reuse across
// every later e2e spec: ios390, android412, desktop1920.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    env: {
      PUBLIC_COTIZADOR_MODE: 'mock',
    },
  },
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
