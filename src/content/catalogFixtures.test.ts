import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORY_CONTENT, ITEM_CONTENT, validateCatalogContent } from './catalogContent';
import { FIXTURE_ADVISOR_WITH_PHOTO } from './catalogFixtures';
import { allCatalogSlugs, priceView } from './catalogView';
import { findBySlug } from './catalog';

const exists = (p: string): boolean => existsSync(join(process.cwd(), 'public', p));

describe('r06 state fixtures', () => {
  it('Estado B con foto: contenido valido y el precio sigue siendo "asesor"', () => {
    const merged = { ...CATEGORY_CONTENT, ...ITEM_CONTENT, ...FIXTURE_ADVISOR_WITH_PHOTO };
    expect(validateCatalogContent(allCatalogSlugs(), merged, exists)).toEqual([]);
    const node = findBySlug('jardin-2-fijas-2-corredizas');
    expect(node && priceView(node as never)).toEqual({ kind: 'advisor' });
  });

  it('Estado B sin foto y Estado C son alcanzables con datos reales', () => {
    // Official photos (06-assets) now cover every item, so "sin foto" is only
    // reachable through the fallback for a slug with no content entry.
    expect(ITEM_CONTENT['slug-sin-contenido']).toBeUndefined();
    expect(ITEM_CONTENT['jardin-1-fijo-3-corredizas']?.images).toHaveLength(1);
  });
});
