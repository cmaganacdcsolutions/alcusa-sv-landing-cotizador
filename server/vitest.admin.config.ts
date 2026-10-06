import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Admin tests run on the in-memory store. The MariaDB contract/persistence suites additionally need the DB
// credentials from the gitignored server/.env (created by `npm run db:setup-local`); without them they are
// SKIPPED with a message. NODE_ENV=test makes the app talk to DB_TEST_NAME (alcusa_test), never alcusa_dev.
process.env['NODE_ENV'] = 'test';
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: { include: ['test/admin/**/*.test.ts'], environment: 'node', fileParallelism: false, testTimeout: 30_000 },
});
