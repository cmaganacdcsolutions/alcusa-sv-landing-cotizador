// R1 (ADR-008): model integrity + per-leaf fromPrice derived from the engine
// at minimum valid measures (never a copy of the tables). Complements the
// legacy per-product guard in catalog.test.ts.
import { describe, expect, it } from 'vitest';
import {
  CATALOG_PRODUCTS,
  CATEGORIES,
  SLUG_ALIASES,
  allLeaves,
  findBySlug,
  hasVariants,
  subFromPrice,
  type Leaf,
} from './catalog';
import { GARDEN_PROMO_BANDS } from './pricingTables';
import { priceStraight } from '@engine/pricing/straight';
import { priceCorner } from '@engine/pricing/corner';
import { priceTempered } from '@engine/pricing/tempered';
import { priceHinged } from '@engine/pricing/hinged';
import { priceWindow } from '@engine/pricing/windows';
import { priceGarden } from '@engine/pricing/garden';

const CATEGORY_NAMES = ['Puertas de baño', 'Puertas de jardín', 'Ventanas'];
const ADVISOR_SLUGS = ['jardin-2-fijas-2-corredizas', 'jardin-1-fijo-3-corredizas'];

function allSlugs(): string[] {
  return CATEGORIES.flatMap((c) => [
    c.slug,
    ...c.subcategories.flatMap((s) => [s.slug, ...(hasVariants(s) ? s.variants.map((v) => v.slug) : [])]),
  ]);
}

const windowInput = (model: 'francesa' | 'bilbao') => ({
  widthM: 0.8,
  heightM: 1,
  model,
  frame: 'blanco' as const,
  glass: 'claro' as const,
  zaranda: false,
  desmontaje: false,
  qty: 1,
});

// Engine output at the minimum valid measures with default color/glass.
function enginePrice(leaf: Leaf): number {
  const preset = leaf.preset ?? {};
  switch (leaf.quoterModel) {
    case 'recta':
      return priceStraight({ widthCm: 80, color: 'natural', glass: 'claro', pickup: false }).price ?? NaN;
    case 'templado':
      return priceTempered({ widthCm: 120 }).price ?? NaN;
    case 'bisagra':
      return priceHinged({ widthCm: 40, color: 'natural', glass: 'claro', qty: 1 }).subtotal ?? NaN;
    case 'l':
      return priceCorner({ color: 'natural', model: preset.cornerFinish ?? 'aquaclara' }).price ?? NaN;
    case 'jardin': {
      const hojas = preset.gardenHojas ?? 1;
      const widthM = GARDEN_PROMO_BANDS[hojas].minWidthM;
      return priceGarden({ widthM, heightM: 2.1, hojas, color: 'blanco', glass: 'claro', qty: 1 }).subtotal ?? NaN;
    }
    case 'ventana':
      return priceWindow(windowInput(preset.windowType ?? 'francesa')).subtotal ?? NaN;
    default:
      throw new Error(`leaf ${leaf.slug} has no quoterModel`);
  }
}

describe('content/catalog: R1 model integrity', () => {
  it('has the 3 categories with their exact names, in order', () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual(CATEGORY_NAMES);
  });

  it('slugs are unique across ALL levels and kebab-case ASCII', () => {
    const slugs = allSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('every leaf has EXACTLY one of quoterModel / advisorOnly (advisor leaves carry no price)', () => {
    for (const leaf of allLeaves()) {
      const priced = leaf.quoterModel !== undefined;
      const advisor = leaf.advisorOnly === true;
      expect(priced !== advisor, leaf.slug).toBe(true);
      if (advisor) expect(leaf.fromPrice, leaf.slug).toBeUndefined();
      else expect(typeof leaf.fromPrice, leaf.slug).toBe('number');
    }
  });

  it('subcategories with variants store no price of their own', () => {
    for (const c of CATEGORIES)
      for (const s of c.subcategories)
        if (hasVariants(s)) {
          expect(s.fromPrice).toBeUndefined();
          expect(s.quoterModel).toBeUndefined();
        }
  });

  it('taxonomy is complete: 11 subcategories, 3 En L finishes, exactly the 2 garden combos are advisorOnly', () => {
    expect(CATEGORIES.flatMap((c) => c.subcategories)).toHaveLength(11);
    const enL = findBySlug('en-l');
    expect(enL && 'variants' in enL ? enL.variants.map((v) => v.slug) : []).toEqual(['l-aquaclara', 'l-frosted', 'l-aquafold']);
    expect(allLeaves().filter((l) => l.advisorOnly).map((l) => l.slug)).toEqual(ADVISOR_SLUGS);
  });

  it('every SLUG_ALIASES target exists', () => {
    for (const target of Object.values(SLUG_ALIASES)) expect(findBySlug(target), target).not.toBeNull();
  });

  it('Francesa (135/m2) and Bilbao (192/m2) never share a copied price', () => {
    expect(enginePrice(findLeaf('ventana-francesa'))).not.toBe(enginePrice(findLeaf('ventana-bilbao')));
  });
});

function findLeaf(slug: string): Leaf {
  const leaf = allLeaves().find((l) => l.slug === slug);
  if (!leaf) throw new Error(`leaf not found: ${slug}`);
  return leaf;
}

describe('content/catalog: fromPrice per priced leaf == engine at minimum measures', () => {
  const priced = allLeaves().filter((l) => !l.advisorOnly);
  it.each(priced.map((l) => [l.slug, l] as const))('%s', (_slug, leaf) => {
    expect(leaf.fromPrice).toBe(enginePrice(leaf));
  });

  it('subFromPrice = cheapest variant; null for advisor leaves', () => {
    const enL = CATEGORIES[0]?.subcategories.find((s) => s.slug === 'en-l');
    expect(enL && subFromPrice(enL)).toBe(444);
    const advisor = CATEGORIES[1]?.subcategories.find((s) => s.slug === ADVISOR_SLUGS[0]);
    expect(advisor && subFromPrice(advisor)).toBeNull();
  });

  it('CATALOG_PRODUCTS legacy view: 6 items in the old order, prices derived from the model', () => {
    expect(CATALOG_PRODUCTS.map((p) => [p.id, p.fromPrice])).toEqual([
      ['recta', 222],
      ['l', 444],
      ['templado', 672],
      ['bisagra', 253],
      ['jardin', 410],
      ['ventana', 108],
    ]);
  });
});
