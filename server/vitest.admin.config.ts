import { defineConfig } from 'vitest/config';

// Admin tests need no database (in-memory store); the DB-backed suite keeps its own config.
export default defineConfig({
  test: { include: ['test/admin/**/*.test.ts'], environment: 'node', fileParallelism: false, testTimeout: 30_000 },
});
