// `npm run test:db`: migra alcusa_test (mismo paso que test/global-setup.ts) y luego corre vitest.
// Evita el problema de orden: test:admin NO migra, asi que sobre una base recien creada fallaria.
import { spawnSync } from 'node:child_process';
import setup from '../test/global-setup.ts';

process.env['NODE_ENV'] = 'test';
await setup();
const r = spawnSync('npx', ['vitest', 'run', ...process.argv.slice(2)], { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
