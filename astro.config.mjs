import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Local API (ADR-013 §2.5): the Fastify server in server/ listens on 127.0.0.1:3001.
// Both `astro dev` and `astro preview` forward /api (and the admin base path) to it.
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3001';
const ADMIN_BASE_PATH = process.env.ADMIN_BASE_PATH ?? '/dev-ops-local'; // placeholder, same default as server/.env.example
const apiProxy = {
  '/api': { target: API_ORIGIN, changeOrigin: false },
  [ADMIN_BASE_PATH]: { target: API_ORIGIN, changeOrigin: false },
};

// ALCUSA landing + cotizador — static output, React islands only for the
// cotizador wizard and contact form. See docs/architecture/adr/adr-001.
export default defineConfig({
  output: 'static',
  site: process.env.PUBLIC_SITE_URL ?? 'https://alcusasv.com',
  integrations: [react()],
  vite: {
    // Per-checkout Vite dep cache. Parallel git worktrees share node_modules
    // through a junction, so the default node_modules/.vite cache was being
    // rewritten by one worktree's server under another's (React islands then
    // crashed in dev with "_jsxDEV is not a function").
    cacheDir: '.vite-cache',
    // Gate runs (vitest coverage, astro build, Playwright) write into the
    // same checkout the dev server watches; reacting to those writes made
    // Vite re-optimize deps mid-session and the islands crashed again with
    // "_jsxDEV is not a function". Generated output is never source.
    server: {
      proxy: apiProxy,
      watch: {
        ignored: [
          '**/coverage/**',
          '**/dist/**',
          '**/dist-e2e/**',
          '**/test-results/**',
          '**/playwright-report/**',
          '**/playwright-report-responsive/**',
        ],
      },
    },
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
  },
});
