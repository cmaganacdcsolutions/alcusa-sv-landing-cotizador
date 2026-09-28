import { defineConfig } from 'vitest/config';

// Unit tests for engine/ + integrations/ only (README §6). Coverage gate:
// engine/pricing/* >= 90% per ADR-006.
export default defineConfig({
  resolve: {
    alias: {
      '@components': '/src/components',
      '@islands': '/src/islands',
      '@engine': '/src/engine',
      '@integrations': '/src/integrations',
      '@content': '/src/content',
      '@styles': '/src/styles',
      '@layouts': '/src/layouts',
    },
  },
  test: {
    include: ['src/engine/**/*.test.ts', 'src/integrations/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/engine/**', 'src/integrations/**'],
      thresholds: {
        'src/engine/pricing/**': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
