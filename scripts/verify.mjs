// Regression gate runner.   node scripts/verify.mjs <full|quick|area> [area[,area]...]
//   full   : lint, typecheck, unit, build, bundle size, FULL e2e (3 projects, :4410), dev-mode smoke (:4420)
//   quick  : lint, typecheck, unit, build + bundle size, @critical e2e on desktop1920 + ios390   (pre-push hook)
//   area   : lint, typecheck, unit, e2e specs of the areas (3 projects), dev smoke limited to the areas
// Area map: tests/areas.json. 'layout' (shared code) pulls in EVERY area.
// Ports: e2e uses 4410 (4411/4412 promo variants), dev smoke uses 4420. 4400 is the user's live dev
// server and is never used, stopped or restarted by this script.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [mode, ...rest] = process.argv.slice(2);
const map = JSON.parse(readFileSync(join(root, 'tests/areas.json'), 'utf8'));
const E2E_PORT = process.env.E2E_PORT ?? '4410';
const SMOKE_PORT = process.env.SMOKE_PORT ?? '4420'; // override to run alongside another verify (never 4400)

function fail(msg) {
  console.error(`\n[verify] ${msg}`);
  process.exit(1);
}
if (!['full', 'quick', 'area'].includes(mode)) fail('uso: verify.mjs <full|quick|area> [areas]');
if (['4400', '4420'].includes(E2E_PORT)) fail(`E2E_PORT=${E2E_PORT} esta reservado (4400 = dev del usuario, 4420 = smoke). Usa 4410.`);

// Guard: every e2e spec must be mapped to at least one area (a new spec cannot silently escape verify:area).
const specs = readdirSync(join(root, 'tests/e2e')).filter((f) => f.endsWith('.spec.ts'));
const unmapped = specs.filter((f) => !map.specs[f]);
const stale = Object.keys(map.specs).filter((f) => !specs.includes(f));
if (unmapped.length) fail(`specs sin area en tests/areas.json: ${unmapped.join(', ')}`);
if (stale.length) fail(`tests/areas.json lista specs que no existen: ${stale.join(', ')}`);

let areas = [];
if (mode === 'area') {
  areas = rest.join(',').split(',').map((a) => a.trim()).filter(Boolean);
  if (!areas.length) fail('indica al menos un area: npm run verify:area -- cotizador,promos');
  const bad = areas.filter((a) => !map.areas.includes(a));
  if (bad.length) fail(`area desconocida: ${bad.join(', ')} (validas: ${map.areas.join(', ')})`);
  if (areas.includes('layout')) {
    console.log('[verify] "layout" es codigo compartido: se corren TODAS las areas.');
    areas = map.areas;
  }
}

function portBusy(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });
}

const steps = [];
const npm = (script, args = '') => `npm run ${script}${args ? ` -- ${args}` : ''}`;
steps.push({ name: 'lint', cmd: npm('lint') });
steps.push({ name: 'typecheck', cmd: npm('typecheck') });
steps.push({ name: 'unit', cmd: npm('test') });
if (mode === 'full') {
  steps.push({ name: 'build', cmd: npm('build') });
  steps.push({ name: 'bundle size', cmd: 'node scripts/check-bundle-size.mjs' });
  steps.push({ name: 'e2e (full, 3 projects)', cmd: npm('test:e2e') });
  steps.push({ name: 'dev smoke', cmd: 'npx playwright test --config=playwright.smoke.config.ts' });
} else if (mode === 'quick') {
  // quick no genera dist/ (el e2e usa dist-e2e/p<PUERTO>); el gate mide dist/, asi que se construye aqui (~20 s).
  steps.push({ name: 'build', cmd: npm('build') });
  steps.push({ name: 'bundle size', cmd: 'node scripts/check-bundle-size.mjs' });
  steps.push({ name: 'e2e @critical (desktop1920 + ios390)', cmd: npm('test:e2e', '--grep @critical --project=desktop1920 --project=ios390') });
} else {
  const files = specs.filter((f) => map.specs[f].some((a) => areas.includes(a)));
  steps.push({ name: `e2e [${areas.join(',')}] (${files.length} specs, 3 projects)`, cmd: npm('test:e2e', files.map((f) => `tests/e2e/${f}`).join(' ')) });
  steps.push({ name: `dev smoke [${areas.join(',')}]`, cmd: 'npx playwright test --config=playwright.smoke.config.ts', env: { SMOKE_AREAS: areas.join(',') } });
}

if (steps.some((s) => s.name.includes('smoke')) && (await portBusy(Number(SMOKE_PORT)))) {
  fail(`el puerto ${SMOKE_PORT} (dev smoke) esta ocupado: algo viejo sigue corriendo. Cierralo (NO toques el 4400).`);
}

{
  for (const off of [0, 1, 2]) {
    if (await portBusy(Number(E2E_PORT) + off)) {
      fail(`el puerto ${Number(E2E_PORT) + off} (e2e) ya esta ocupado: un server viejo serviria un dist-e2e equivocado. Cierra ese proceso (o usa otro E2E_PORT). Nunca toques el 4400.`);
    }
  }
}

const results = [];
const t0 = Date.now();
for (const step of steps) {
  console.log(`\n[verify] >>> ${step.name}\n[verify]     ${step.cmd}`);
  const start = Date.now();
  const r = spawnSync(step.cmd, { cwd: root, shell: true, stdio: 'inherit', env: { ...process.env, E2E_PORT, ...step.env } });
  const secs = Math.round((Date.now() - start) / 1000);
  results.push({ name: step.name, ok: r.status === 0, secs });
  if (r.status !== 0) break;
}
const total = Math.round((Date.now() - t0) / 1000);
console.log(`\n[verify] ===== ${mode}${areas.length ? ` [${areas.join(',')}]` : ''} =====`);
for (const r of results) console.log(`[verify] ${r.ok ? 'OK  ' : 'FAIL'} ${String(r.secs).padStart(4)}s  ${r.name}`);
const ok = results.length === steps.length && results.every((r) => r.ok);
console.log(`[verify] ${ok ? 'VERDE' : 'ROJO'} en ${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`);
process.exit(ok ? 0 : 1);
