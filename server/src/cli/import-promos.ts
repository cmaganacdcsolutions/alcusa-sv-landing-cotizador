// Usage: npm run promos:import -- <path-to-promotions.json> [--dry-run] [--publish] [--allow-production]
// Idempotent upsert of the site's live promos into the admin store (ADMIN_STORE=file|mariadb). See modules/promotions/import.ts.
import { runImportCli } from '../modules/promotions/import-cli.ts';

runImportCli(process.argv.slice(2), process.env, { out: (s) => process.stdout.write(`${s}\n`), err: (s) => process.stderr.write(`${s}\n`) })
  .then((code) => {
    process.exitCode = code;
  })
  .catch(() => {
    process.stderr.write('promos:import fallo\n');
    process.exitCode = 1;
  });
