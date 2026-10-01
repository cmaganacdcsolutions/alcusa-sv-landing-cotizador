import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'cli/migrate': 'src/cli/migrate.ts' },
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
});
