// Shared catalog model (ADR-008, R1): Category > Subcategory > Variant.
// Pure data + pure helpers, no React/DOM. Feeds /catalogo, the cotizador deep
// link and the WhatsApp advisor path. Prices are literals guarded against
// engine/pricing by content/catalog.test.ts (never recomputed at runtime).

// The 6 pricing-engine models the cotizador wizard supports.
export type ProductId = 'recta' | 'l' | 'templado' | 'bisagra' | 'jardin' | 'ventana';
export type CategorySlug = 'puertas-de-bano' | 'puertas-de-jardin' | 'ventanas';
/** Which pricing-engine model a leaf uses. Reuses today's ProductId. */
export type QuoterModel = ProductId;

/** Fixed engine inputs a slug preselects. Only keys the store already has. */
export interface QuoterPreset {
  cornerFinish?: 'aquaclara' | 'frosted' | 'aquafold'; // model 'l'
  gardenHojas?: 1 | 2 | 3; // model 'jardin'
  windowType?: 'francesa' | 'bilbao'; // model 'ventana'
}

type Priced = { quoterModel: QuoterModel; preset?: QuoterPreset; fromPrice: number; advisorOnly?: false };
// XOR enforced by the type: an advisor leaf has no price field at all.
type Advisor = { advisorOnly: true; quoterModel?: never; preset?: never; fromPrice?: never };
type WithVariants = {
  variants: readonly Variant[];
  quoterModel?: never;
  preset?: never;
  advisorOnly?: never;
  fromPrice?: never;
};

export type Variant = { slug: string; name: string; photo?: string } & (Priced | Advisor);
export type Subcategory = {
  slug: string;
  name: string;
  description?: string;
  photo?: string;
  altoText?: string;
  group?: string; // UI grouping only, e.g. 'mas-opciones'
} & (Priced | Advisor | WithVariants);
export interface Category {
  slug: CategorySlug;
  name: string;
  blurb?: string;
  photo?: string;
  subcategories: readonly Subcategory[];
}

export const CATEGORIES: readonly Category[] = [
  {
    slug: 'puertas-de-bano',
    name: 'Puertas de baño',
    subcategories: [
      { slug: 'templada-10mm', name: 'Templadas 10 mm', quoterModel: 'templado', fromPrice: 672, altoText: 'Alto fijo 2.00 m' },
      { slug: 'recta', name: 'Rectas', quoterModel: 'recta', fromPrice: 242, altoText: 'Alto estándar 1.85 m' },
      {
        slug: 'en-l',
        name: 'En L',
        altoText: 'Medida fija 0.80 × 0.80 × 1.85 m',
        variants: [
          { slug: 'l-aquaclara', name: 'Aquaclara en L', quoterModel: 'l', preset: { cornerFinish: 'aquaclara' }, fromPrice: 444 },
          { slug: 'l-frosted', name: 'Frosted en L', quoterModel: 'l', preset: { cornerFinish: 'frosted' }, fromPrice: 580 },
          { slug: 'l-aquafold', name: 'Aquafold en L', quoterModel: 'l', preset: { cornerFinish: 'aquafold' }, fromPrice: 650 },
        ],
      },
      { slug: 'bisagra', name: 'Bisagra', quoterModel: 'bisagra', fromPrice: 253, altoText: 'Alto fijo 1.85 m' },
      { slug: 'templada-10mm-abatible', name: 'Abatible templada 10 mm', advisorOnly: true, group: 'mas-opciones' },
    ],
  },
  {
    slug: 'puertas-de-jardin',
    name: 'Puertas de jardín',
    subcategories: [
      { slug: 'jardin-1-hoja', name: '1 hoja corrediza', quoterModel: 'jardin', preset: { gardenHojas: 1 }, fromPrice: 410, altoText: 'Alto 2.10 o 2.40 m' },
      { slug: 'jardin-2-hojas', name: '2 hojas corredizas', quoterModel: 'jardin', preset: { gardenHojas: 2 }, fromPrice: 819, altoText: 'Alto 2.10 o 2.40 m' },
      { slug: 'jardin-3-hojas', name: '3 hojas corredizas', quoterModel: 'jardin', preset: { gardenHojas: 3 }, fromPrice: 1229, altoText: 'Alto 2.10 o 2.40 m' },
      { slug: 'jardin-2-fijas-2-corredizas', name: '2 fijas + 2 corredizas', advisorOnly: true, group: 'mas-opciones', altoText: 'Alto 2.10 o 2.40 m' },
      { slug: 'jardin-1-fijo-3-corredizas', name: '1 fijo + 3 corredizas', advisorOnly: true, group: 'mas-opciones', altoText: 'Alto 2.10 o 2.40 m' },
      { slug: 'abatible-interior-exterior', name: 'Abatible chapa doble manija', advisorOnly: true, group: 'mas-opciones' },
      { slug: 'abatible-oficina-vidrio-fijo', name: 'Abatible con vidrio fijo arriba', advisorOnly: true, group: 'mas-opciones' },
      { slug: 'abatible-oficina-cerrador', name: 'Abatible con cerrador automático', advisorOnly: true, group: 'mas-opciones' },
    ],
  },
  {
    slug: 'ventanas',
    name: 'Ventanas',
    subcategories: [
      { slug: 'ventana-francesa', name: 'Francesa', quoterModel: 'ventana', preset: { windowType: 'francesa' }, fromPrice: 108, altoText: 'Alto a tu medida' },
      { slug: 'ventana-bilbao', name: 'Bilbao', quoterModel: 'ventana', preset: { windowType: 'bilbao' }, fromPrice: 153.6, altoText: 'Alto a tu medida' },
      { slug: 'ventana-bilbao-medio-punto', name: 'Bilbao con medio punto', advisorOnly: true, group: 'mas-opciones', altoText: 'Alto a tu medida' },
    ],
  },
];

/** Legacy ids / renamed slugs that must keep resolving (ADR-008 §3). */
export const SLUG_ALIASES: Readonly<Record<string, string>> = {
  l: 'en-l',
  templado: 'templada-10mm',
  jardin: 'puertas-de-jardin',
  ventana: 'ventanas',
  recta: 'recta',
  bisagra: 'bisagra',
};

/** A subcategory without variants, or a variant. */
export type Leaf = Variant | Exclude<Subcategory, WithVariants>;
export type CatalogNode = Category | Subcategory | Variant;

export function hasVariants(sub: Subcategory): sub is Extract<Subcategory, WithVariants> {
  return 'variants' in sub && sub.variants !== undefined;
}

/** Every leaf, in display order (variants replace their parent subcategory). */
export function allLeaves(categories: readonly Category[] = CATEGORIES): Leaf[] {
  return categories.flatMap((c) => c.subcategories.flatMap((s): Leaf[] => (hasVariants(s) ? [...s.variants] : [s])));
}

export function findBySlug(slug: string, categories: readonly Category[] = CATEGORIES): CatalogNode | null {
  for (const c of categories) {
    if (c.slug === slug) return c;
    for (const s of c.subcategories) {
      if (s.slug === slug) return s;
      if (hasVariants(s)) {
        const v = s.variants.find((x) => x.slug === slug);
        if (v) return v;
      }
    }
  }
  return null;
}

/** Cheapest priced leaf under a subcategory; null when it has none (advisor). */
export function subFromPrice(sub: Subcategory): number | null {
  const leaves: Array<Variant | Subcategory> = hasVariants(sub) ? [...sub.variants] : [sub];
  const prices = leaves.flatMap((l) => (typeof l.fromPrice === 'number' ? [l.fromPrice] : []));
  return prices.length ? Math.min(...prices) : null;
}

export type DeepLinkResolution =
  | {
      kind: 'priced';
      slug: string;
      name: string;
      quoterModel: QuoterModel;
      preset: QuoterPreset;
      /** false for legacy ids: preselect on Step 0 (old contract); true: jump to Medidas. */
      advance: boolean;
    }
  | { kind: 'advisor'; slug: string; name: string }
  | { kind: 'category'; slug: string }
  | { kind: 'none' };

/**
 * Legacy `?producto=<ProductId>` values keep their pre-R1 behaviour (preselect
 * the card, stay on Step 0): the landing Hero/Catalogo cards and their e2e rely
 * on it. `recta` and `bisagra` are both legacy ids and canonical slugs, so
 * until R3 retargets those landing links they also stay on Step 0. R3: delete
 * this set and every leaf advances to Medidas.
 */
const LEGACY_STEP0_IDS: ReadonlySet<string> = new Set(Object.keys(SLUG_ALIASES));

function leafToResolution(node: Leaf, raw: string): DeepLinkResolution {
  return node.advisorOnly
    ? { kind: 'advisor', slug: node.slug, name: node.name }
    : {
        kind: 'priced',
        slug: node.slug,
        name: node.name,
        quoterModel: node.quoterModel,
        preset: node.preset ?? {},
        advance: !LEGACY_STEP0_IDS.has(raw),
      };
}

function cheapestPricedVariant(variants: readonly Variant[]): Variant | undefined {
  return [...variants].filter((v) => !v.advisorOnly).sort((a, b) => (a.fromPrice ?? 0) - (b.fromPrice ?? 0))[0];
}

/**
 * Resolves a `?producto=` value (leaf, subcategory, variant or legacy alias).
 * A subcategory with variants resolves to its cheapest priced variant. A
 * legacy alias that lands on a category (`jardin`, `ventana`) keeps its old
 * behaviour: the category's first priced leaf. A direct category slug is
 * `category` (R5 opens it in Step 0). Unknown -> `none`.
 */
export function resolveDeepLink(raw: string | null | undefined): DeepLinkResolution {
  if (!raw) return { kind: 'none' };
  const viaAlias = Object.prototype.hasOwnProperty.call(SLUG_ALIASES, raw);
  const slug = viaAlias ? (SLUG_ALIASES[raw] as string) : raw;
  const node = findBySlug(slug);
  if (!node) return { kind: 'none' };
  if ('subcategories' in node) {
    if (!viaAlias) return { kind: 'category', slug: node.slug };
    const first = allLeaves([node]).find((l) => !l.advisorOnly);
    return first ? leafToResolution(first, raw) : { kind: 'none' };
  }
  if ('variants' in node && node.variants) {
    const cheapest = cheapestPricedVariant(node.variants);
    return cheapest ? leafToResolution(cheapest, raw) : { kind: 'none' };
  }
  return leafToResolution(node as Leaf, raw); // variants-less subcategory or a variant
}

// --- Derived legacy view (kept until R5; Hero, Catalogo.astro, Step0/4/5 and
// order.test.ts read it). Display copy per engine model lives here; prices are
// derived from CATEGORIES so there is a single source of truth.
export interface CatalogProduct {
  id: ProductId;
  name: string;
  fromPrice: number;
  altoText: string;
  enabled: boolean;
}

const PRODUCT_CARD_META: ReadonlyArray<{ id: ProductId; name: string; altoText: string }> = [
  { id: 'recta', name: 'Puerta de baño recta', altoText: 'Alto estándar 1.85 m' },
  { id: 'l', name: 'Cabina en L', altoText: 'Medida fija 0.80 × 0.80 × 1.85 m' },
  { id: 'templado', name: 'Templado 10 mm', altoText: 'Alto fijo 2.00 m' },
  { id: 'bisagra', name: 'Puerta con bisagra', altoText: 'Alto fijo 1.85 m' },
  { id: 'jardin', name: 'Puerta de jardín', altoText: 'Alto 2.10 o 2.40 m' },
  { id: 'ventana', name: 'Ventana Francesa o Bilbao', altoText: 'Alto a tu medida' },
];

function minPriceOfModel(model: ProductId): number {
  const prices = allLeaves().flatMap((l) => (l.quoterModel === model ? [l.fromPrice] : []));
  return Math.min(...prices);
}

export const CATALOG_PRODUCTS: readonly CatalogProduct[] = PRODUCT_CARD_META.map((m) => ({
  ...m,
  fromPrice: minPriceOfModel(m.id),
  enabled: true,
}));

/** "Desde" price text: whole dollars as `$108`, engine cents as `$153.60`. */
export function formatFromPrice(price: number): string {
  return Number.isInteger(price) ? `$${price}` : `$${price.toFixed(2)}`;
}
