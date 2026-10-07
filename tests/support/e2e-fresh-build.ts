import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Playwright globalSetup: the e2e serves a PRODUCTION build (dist-e2e/p<PORT>). Calling `npx playwright test`
// directly skips `pretest:e2e` and silently tests stale code. Fail loudly instead.
function newestMtime(path: string): number {
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  return readdirSync(path).reduce((max, name) => Math.max(max, newestMtime(join(path, name))), st.mtimeMs);
}

export default function globalSetup(): void {
  const port = Number(process.env.E2E_PORT ?? 4321);
  const stamp = join('dist-e2e', `p${port}`, '.built-at');
  if (!existsSync(stamp)) {
    throw new Error(`No hay build e2e para el puerto ${port}. Corre "E2E_PORT=${port} npm run test:e2e" (nunca "npx playwright test" directo: se salta pretest:e2e).`);
  }
  const builtAt = Number(readFileSync(stamp, 'utf8'));
  const sources = ['src', 'public', 'astro.config.mjs', 'package.json'].filter(existsSync);
  const newest = Math.max(...sources.map(newestMtime));
  if (newest > builtAt + 1000) {
    throw new Error(`dist-e2e/p${port} es MAS VIEJO que el codigo (${new Date(newest).toISOString()} > ${new Date(builtAt).toISOString()}). Reconstruye con "E2E_PORT=${port} npm run test:e2e" (nunca playwright directo).`);
  }
}
