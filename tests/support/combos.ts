import { CATEGORIES, hasVariants, type Category, type ProductId, type QuoterPreset, type Subcategory } from '@content/catalog';

// Every priced leaf reachable in the cotizador, derived from the SAME catalog the UI renders from.
export interface Combo {
  category: Category;
  categoryIndex: number;
  typeIndex: number;
  variantIndex: number | null;
  sub: Subcategory;
  model: ProductId;
  preset: QuoterPreset;
  label: string;
}

/** Same collapse Step0 applies: all advisor-only subcategories become ONE "Más opciones" tile. */
export function typeTiles(c: Category): Subcategory[] {
  return c.subcategories.filter((s, i, all) => !(s.advisorOnly && all.findIndex((x) => x.advisorOnly) !== i));
}

export const COMBOS: Combo[] = [];
CATEGORIES.forEach((category, categoryIndex) => {
  typeTiles(category).forEach((sub, typeIndex) => {
    if (sub.advisorOnly) return;
    if (hasVariants(sub)) {
      sub.variants.forEach((v, variantIndex) => {
        if (v.advisorOnly) return;
        COMBOS.push({ category, categoryIndex, typeIndex, variantIndex, sub, model: v.quoterModel, preset: v.preset ?? {}, label: `${category.slug}/${sub.slug}/${v.slug}` });
      });
    } else {
      COMBOS.push({ category, categoryIndex, typeIndex, variantIndex: null, sub, model: sub.quoterModel, preset: sub.preset ?? {}, label: `${category.slug}/${sub.slug}` });
    }
  });
});

/** One representative leaf per product family (model) for smoke / critical flows. */
export const FAMILIES: Combo[] = Array.from(new Map(COMBOS.map((c) => [c.model, c])).values());
