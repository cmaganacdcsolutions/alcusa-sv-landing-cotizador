// Shared "3 category" teaser copy (Puertas de baño / Ventanas / Puertas de
// jardín) used by both Hero's category cards (spec §1 item 1) and
// CotizadorTeaser's desktop mini product-list column (desktop-01-inicio
// #cotizador). Single source so labels/subtitles/images never drift between
// the two — prices still come from CATALOG_PRODUCTS (@content/catalog).
import { CATALOG_PRODUCTS, type ProductId } from '@content/catalog';
import { CATEGORY_MEDIA, type MediaRef } from '@content/home-media';

export interface CategoryTeaser {
  productId: ProductId;
  label: string;
  subtitle: string;
  /** Render de estudio (nunca foto de cliente). */
  image: MediaRef;
}

export const CATEGORY_TEASERS: readonly CategoryTeaser[] = [
  {
    productId: 'recta',
    label: 'Puertas de baño',
    subtitle: 'Rectas, en L y templado',
    image: CATEGORY_MEDIA['puertas-de-bano']!,
  },
  {
    productId: 'ventana',
    label: 'Ventanas',
    subtitle: 'Francesas y Bilbao a tu medida',
    image: CATEGORY_MEDIA['ventanas']!,
  },
  {
    productId: 'jardin',
    label: 'Puertas de jardín',
    subtitle: 'Una, dos o tres hojas corredizas',
    image: CATEGORY_MEDIA['puertas-de-jardin']!,
  },
] as const;

export interface CategoryTeaserWithPrice extends CategoryTeaser {
  fromPrice: number;
}

export function getCategoryTeasers(): CategoryTeaserWithPrice[] {
  return CATEGORY_TEASERS.map((teaser) => {
    const product = CATALOG_PRODUCTS.find((p) => p.id === teaser.productId);
    if (!product) {
      throw new Error(`Category teaser references unknown product id "${teaser.productId}"`);
    }
    return { ...teaser, fromPrice: product.fromPrice };
  });
}
