import { defineConfig } from 'tsup';

// Production bundle. Entries:
//   index                -> quotes API (ADR-013)
//   admin-server         -> admin panel SSR (ADR-014); `npm run admin:dev` runs the same file through tsx
//   cli/*                -> ops CLIs that must run on the VPS without tsx (devDependency, absent after `npm ci --omit=dev`)
// `splitting: false` keeps every entry self-contained: `src/db/paths.ts` resolves db/ with `import.meta.url`
// ('../../db'), which is only correct from `dist/cli/<x>.js` (a shared chunk in `dist/` would resolve one level too high).
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'admin-server': 'src/admin-server.ts',
    'cli/migrate': 'src/cli/migrate.ts',
    'cli/grants': 'src/cli/grants.ts',
    'cli/create-admin': 'src/cli/create-admin.ts',
    'cli/import-promos': 'src/cli/import-promos.ts',
    'cli/promos-status': 'src/cli/promos-status.ts',
  },
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
});
