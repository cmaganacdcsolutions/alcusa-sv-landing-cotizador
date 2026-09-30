// Construye las variantes de la landing que usa el e2e, con la fecha "hoy" congelada
// (2026-09-30) para que las promos semilla (vencen 2026-10-31) no caduquen bajo prueba.
//   dist-e2e/base   -> seed real de promotions.json (3 promos), hoy congelado
//   dist-e2e/one    -> fixture de 1 promo (tarjeta horizontal)
//   dist-e2e/states -> fixture estados C (titulo largo) y D (sin % ni "Antes")
// Los ganchos ALCUSA_PROMOS_* solo se leen en build (src/content/promotions.ts).
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const TODAY = '2026-09-30';
const variants = [
  { name: 'base', file: undefined },
  { name: 'one', file: 'tests/e2e/promo-data/one.json' },
  { name: 'states', file: 'tests/e2e/promo-data/states.json' },
];

for (const v of variants) {
  const env = { ...process.env, ALCUSA_PROMOS_TODAY: TODAY, PUBLIC_COTIZADOR_MODE: 'mock' };
  if (v.file) env.ALCUSA_PROMOS_FILE = resolve(v.file);
  const r = spawnSync('npx', ['astro', 'build', '--outDir', `dist-e2e/${v.name}`], {
    env,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
