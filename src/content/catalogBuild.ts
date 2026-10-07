// Build-time guard (runs from every /catalogo page's frontmatter): fails the
// Astro build when catalogContent.ts contradicts the model or points at a
// missing file in public/. Node-only (fs), so it is not part of the pure view.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertCatalogContent } from './catalogContent';
import { allCatalogSlugs } from './catalogView';

export function assertCatalogForBuild(publicDir: string = join(process.cwd(), 'public')): void {
  const exists = (p: string): boolean => existsSync(join(publicDir, p));
  assertCatalogContent(allCatalogSlugs(), exists);
}
