import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Tests always run with NODE_ENV=test (=> the app talks to DB_TEST_NAME) and read
// credentials from the gitignored server/.env (created by `npm run db:setup-local`).
process.env['NODE_ENV'] = 'test';
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15_000,
    typecheck: { enabled: true, include: ['test/**/*.test-d.ts'], tsconfig: './tsconfig.json' },
  },
});
