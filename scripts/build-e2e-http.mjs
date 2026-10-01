// Build for the http e2e (ADR-013 N2-FE): same site, but PUBLIC_QUOTE_API=http so the cotizador talks to the
// real local API (proxied by scripts/serve-static.mjs). Output: dist-e2e/http.
import { spawnSync } from 'node:child_process';

const env = { ...process.env, ALCUSA_PROMOS_TODAY: '2026-09-30', PUBLIC_COTIZADOR_MODE: 'mock', PUBLIC_QUOTE_API: 'http' };
const r = spawnSync('npx', ['astro', 'build', '--outDir', 'dist-e2e/http'], { env, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
