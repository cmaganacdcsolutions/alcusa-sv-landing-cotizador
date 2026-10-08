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

// One Vite dep cache per process kind and port (VITE_CACHE_DIR overrides).
function viteCacheDir() {
  if (process.env.VITE_CACHE_DIR) return process.env.VITE_CACHE_DIR;
  const args = process.argv.slice(2);
  const command = ['dev', 'build', 'preview', 'check', 'sync'].find((c) => args.includes(c)) ?? 'other';
  const portAt = args.indexOf('--port');
  const port = portAt >= 0 ? args[portAt + 1] : 'default';
  return `.vite-cache/${command}-${port}`;
}

// Paginas /catalogo/** eliminadas: el catalogo vive en el home (anclas). Subpaginas por
// producto -> #p-<slug> (incluidos los 2 combos de asesor de "Más opciones para tu jardín").
const CATALOG_REDIRECTS = (() => {
  const tree = {
    'puertas-de-bano': ['templada-10mm', 'recta', 'en-l', 'bisagra'],
    'puertas-de-jardin': ['jardin-1-hoja', 'jardin-2-hojas', 'jardin-3-hojas', 'jardin-2-fijas-2-corredizas', 'jardin-1-fijo-3-corredizas'],
    ventanas: ['ventana-francesa', 'ventana-bilbao'],
  };
  const out = { '/catalogo': '/#catalogo' };
  for (const [cat, subs] of Object.entries(tree)) {
    out[`/catalogo/${cat}`] = `/#${cat}`;
    for (const sub of subs) out[`/catalogo/${cat}/${sub}`] = `/#p-${sub}`;
  }
  return out;
})();

// ALCUSA landing + cotizador — static output, React islands only for the
// cotizador wizard and contact form. See docs/architecture/adr/adr-001.
export default defineConfig({
  output: 'static',
  site: process.env.PUBLIC_SITE_URL ?? 'https://alcusasv.com',
  integrations: [react()],
  redirects: CATALOG_REDIRECTS,
  vite: {
    // Fecha congelada de promos (solo e2e/smoke): el cotizador valida la vigencia de `?promo=` con ella.
    define: { __PROMOS_TODAY__: JSON.stringify(process.env.ALCUSA_PROMOS_TODAY ?? '') },
    // Per-checkout Vite dep cache. Parallel git worktrees share node_modules
    // through a junction, so the default node_modules/.vite cache was being
    // rewritten by one worktree's server under another's (React islands then
    // crashed in dev with "_jsxDEV is not a function").
    // Each process also gets its own subfolder (command + port): the user's
    // dev server, the e2e builds and the smoke server in this same checkout
    // used to share one cache, and a production-mode optimize under a running
    // dev server served production React next to dev JSX (_jsxDEV again).
    cacheDir: viteCacheDir(),
    // Gate runs (vitest coverage, astro build, Playwright) write into the
    // same checkout the dev server watches; reacting to those writes made
    // Vite re-optimize deps mid-session and the islands crashed again with
    // "_jsxDEV is not a function". Generated output is never source.
    server: {
      proxy: apiProxy,
      watch: {
        ignored: [
          '**/.vite-cache/**',
          '**/coverage/**',
          '**/dist/**',
          '**/dist-e2e/**',
          '**/dist-*/**',
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
