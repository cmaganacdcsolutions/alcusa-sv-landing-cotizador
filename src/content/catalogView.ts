// View-model helpers for /catalogo pages: merge the model (catalog.ts) with the
// presentation data (catalogContent.ts). Pure; no DOM. Pages only call these.
import {
  CATEGORIES,
  formatFromPrice,
  hasVariants,
  subFromPrice,
  type Category,
  type Subcategory,
  type Variant,
} from './catalog';
import { contentFor, type CatalogImage, type PendingField } from './catalogContent';

/** Group key of the "Más opciones para tu jardín" panel. */
export const MORE_OPTIONS_GROUP = 'mas-opciones';
/** Titulo del sub-bloque "Más opciones" del inicio (solo la categoria de jardin lo usa). */
export const MORE_OPTIONS_TITLE = 'Más opciones para tu jardín';

/** Every slug the model exposes (categories, subcategories, variants). */
export function allCatalogSlugs(categories: readonly Category[] = CATEGORIES): string[] {
  return categories.flatMap((c) => [
    c.slug,
    ...c.subcategories.flatMap((s) => [s.slug, ...(hasVariants(s) ? s.variants.map((v) => v.slug) : [])]),
  ]);
}

export function cardTitle(node: { slug: string; name: string }): string {
  return contentFor(node.slug).cardTitle ?? node.name;
}

export function detailTitle(node: { slug: string; name: string }): string {
  const c = contentFor(node.slug);
  return c.detailTitle ?? c.cardTitle ?? node.name;
}

export function chipLabel(node: { slug: string; name: string }): string {
  return contentFor(node.slug).chip ?? node.name;
}

/** First image of the node, or null => render the "FOTO PRÓXIMAMENTE" placeholder. */
export function primaryImage(slug: string): CatalogImage | null {
  return contentFor(slug).images[0] ?? null;
}

export function isPending(slug: string, field: PendingField): boolean {
  return contentFor(slug).pending.includes(field);
}

export type PriceView =
  | { kind: 'from'; amount: number; text: string }
  | { kind: 'advisor' }
  | { kind: 'pending' };

/** "Desde $X" from the engine-guarded literal; advisor => no $; pending => amber chip. */
export function priceView(node: Subcategory | Variant): PriceView {
  if (isPending(node.slug, 'price')) return { kind: 'pending' };
  const from = subFromPrice(node as Subcategory);
  return from === null ? { kind: 'advisor' } : { kind: 'from', amount: from, text: formatFromPrice(from) };
}

export function splitSubcategories(category: Category): { main: Subcategory[]; more: Subcategory[] } {
  const main: Subcategory[] = [];
  const more: Subcategory[] = [];
  for (const s of category.subcategories) (s.group === MORE_OPTIONS_GROUP ? more : main).push(s);
  return { main, more };
}

/** Grid column class: the card count caps the columns (4 -> 4, 3 -> 3, 2 -> 2). */
export function gridColsClass(count: number): string {
  return `cols-${Math.min(Math.max(count, 1), 4)}`;
}

/** Lower-cased category name for CTA copy: "Ver puertas de baño". */
export function verLabel(category: Category): string {
  return `Ver ${category.name.toLocaleLowerCase('es')}`;
}

/** Variant chips of a subcategory, cheapest priced first selected. */
export function defaultVariant(variants: readonly Variant[]): Variant | undefined {
  return [...variants].filter((v) => !v.advisorOnly).sort((a, b) => (a.fromPrice ?? 0) - (b.fromPrice ?? 0))[0];
}

/** Informational chips of an index card; the "Más opciones" group collapses to one chip. */
export function indexChips(category: Category): string[] {
  const chips: string[] = [];
  for (const s of category.subcategories) {
    const label = s.group === MORE_OPTIONS_GROUP ? 'Más opciones' : chipLabel(s);
    if (!chips.includes(label)) chips.push(label);
  }
  return chips;
}
