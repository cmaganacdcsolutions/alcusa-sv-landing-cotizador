// Suggests which areas a change touches, from `git diff` (staged + unstaged + untracked) vs HEAD,
// or vs a base ref:  node scripts/suggest-areas.mjs [baseRef]      (npm run verify:suggest)
// It only PRINTS a suggestion; nothing is executed. Rules live in tests/areas.json ("paths").
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(readFileSync(join(root, 'tests/areas.json'), 'utf8'));
const base = process.argv[2] ?? 'HEAD';
const run = (c) => execSync(c, { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);

const files = [...new Set([...run(`git diff --name-only ${base}`), ...run('git ls-files --others --exclude-standard')])];
const found = new Set();
const unmatched = [];
for (const f of files) {
  const rule = map.paths.find(([prefix]) => f.startsWith(prefix));
  if (rule) rule[1].split(',').forEach((a) => found.add(a));
  else if (f.startsWith('src/')) { found.add('layout'); unmatched.push(f); } // unknown shared src => be safe
}
if (!files.length) {
  console.log('No hay cambios contra', base);
} else {
  const areas = [...found];
  console.log(`${files.length} archivos cambiados -> areas: ${areas.join(', ') || '(ninguna: solo docs/config sin efecto)'}`);
  if (unmatched.length) console.log(`(sin regla, tratados como layout: ${unmatched.slice(0, 5).join(', ')})`);
  if (found.has('layout')) console.log('Hay codigo compartido/layout: corre el gate completo ->  npm run verify');
  else if (areas.length) console.log(`Sugerido ->  npm run verify:area -- ${areas.join(',')}`);
  console.log('Recuerda: antes de mergear a dev siempre  npm run verify');
}
