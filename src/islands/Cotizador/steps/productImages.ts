import type { ProductId } from '@content/catalog';
import { defaultChoices, PRODUCT_CONFIGS } from '@content/catalogHome';
import { CATEGORY_MEDIA, coverFor, type VariantChoice } from '@content/home-media';
import type { CornerModel } from '@engine/pricing';
import type { CotizadorState } from '../state/cotizadorStore';
import { WINDOW_MODEL_SLUG } from './measures/windowModelImages';

// Imagenes de producto del cotizador (Step0 selector, Step2 estimado, Step4 resumen).
//
// 2026-10-06: NINGUNA foto enviada por Alcusa se usa aqui. Todo se resuelve por el UNICO
// mapa de renders del sitio (`@content/home-media`: PRODUCT_MEDIA / coverFor / variantsOf).
// Cuando llegue un render nuevo o una variante nueva se registra alli y el cotizador la
// recoge sin tocar este archivo. Hay un render por cada combinacion color x vidrio (cabina en
// L: color x acabado) de PRODUCT_CONFIGS, asi que la imagen cambia con la eleccion del cliente;
// si alguna faltara, la escalera de coverFor cae a la portada del producto: nunca a una foto de Alcusa.

/** Render de un slug del catalogo; si el mapa no lo conoce, la portada de "recta". */
function renderSrc(slug: string, choice?: VariantChoice): string {
  const media = coverFor(slug, choice) ?? coverFor('recta');
  if (!media) throw new Error(`home-media: falta el render de "${slug}"`);
  return media.src;
}

/** Slug del catalogo (clave de PRODUCT_MEDIA) que representa a cada producto del cotizador. */
const PRODUCT_SLUG: Readonly<Record<ProductId, string>> = {
  recta: 'recta',
  l: 'en-l',
  templado: 'templada-10mm',
  bisagra: 'bisagra',
  jardin: 'jardin-3-hojas', // misma portada que la categoria "Puertas de jardin" del inicio
  ventana: 'ventana-francesa',
};

export const PRODUCT_IMAGES: Readonly<Record<ProductId, string>> = {
  recta: renderSrc(PRODUCT_SLUG.recta),
  l: renderSrc(PRODUCT_SLUG.l),
  templado: renderSrc(PRODUCT_SLUG.templado),
  bisagra: renderSrc(PRODUCT_SLUG.bisagra),
  jardin: renderSrc(PRODUCT_SLUG.jardin),
  ventana: renderSrc(PRODUCT_SLUG.ventana),
};

// Acabados de la cabina en L: un render por acabado x color. Aqui, para el tile "Acabado" del
// Step0 (todavia sin color elegido), el color por defecto de la tarjeta "en-l" del inicio.
const L_CONFIG = PRODUCT_CONFIGS['en-l'];
const L_DEFAULT_COLOR = L_CONFIG ? defaultChoices(L_CONFIG).color : undefined;
export const CORNER_IMAGES: Readonly<Record<CornerModel, string>> = {
  aquaclara: renderSrc('en-l', { color: L_DEFAULT_COLOR, acabado: 'l-aquaclara' }),
  frosted: renderSrc('en-l', { color: L_DEFAULT_COLOR, acabado: 'l-frosted' }),
  aquafold: renderSrc('en-l', { color: L_DEFAULT_COLOR, acabado: 'l-aquafold' }),
};

// Miniaturas del tile "Tipo de puerta / ventana" (Step0 nivel 2), por slug de subcategoria
// del catalogo. Cada tipo tiene su propio render en PRODUCT_MEDIA. Un slug sin entrada (el
// tile "Más opciones", solo asesor) muestra el placeholder de WhatsApp.
const TYPE_SLUGS: readonly string[] = [
  'templada-10mm',
  'recta',
  'en-l',
  'bisagra',
  'jardin-1-hoja',
  'jardin-2-hojas',
  'jardin-3-hojas',
  'ventana-francesa',
  'ventana-bilbao',
];

/** Portada de categoria (foto oficial) para el tile del paso 1. */
export function categoryImage(slug: string): string {
  const media = CATEGORY_MEDIA[slug];
  if (!media) throw new Error(`home-media: falta la portada de la categoria "${slug}"`);
  return media.src;
}

export const TYPE_IMAGES: Readonly<Record<string, string>> = Object.fromEntries(
  TYPE_SLUGS.map((slug) => [slug, renderSrc(slug)]),
);

export function typeImage(slug: string): string | null {
  return TYPE_IMAGES[slug] ?? null;
}

/** Slug del catalogo de la puerta de jardin segun sus hojas (1 / 2 / 3), igual que el tile del Step0. */
const GARDEN_SLUG: Readonly<Record<1 | 2 | 3, string>> = {
  1: 'jardin-1-hoja',
  2: 'jardin-2-hojas',
  3: 'jardin-3-hojas',
};

/**
 * Lo que decide el render: el subconjunto del estado del cotizador (o de un CartItem, que lo comparte)
 * con modelo/hojas y las elecciones de color y vidrio de cada producto.
 */
export type ImageSelection = Partial<
  Pick<
    CotizadorState,
    'color' | 'glass' | 'cornerModel' | 'windowModel' | 'windowFrame' | 'windowGlass' | 'gardenHojas' | 'gardenColor' | 'gardenGlass'
  >
>;

/**
 * Step2 / Step4 image for a product (el mismo render que la tarjeta del inicio para esa eleccion):
 * ventana: modelo + marco + vidrio; jardin: hojas + color + vidrio; recta/bisagra: color + vidrio;
 * cabina en L: color + acabado. Sin eleccion (p. ej. el tile del Step0) devuelve la portada.
 */
export function estimateImage(productId: ProductId, sel: ImageSelection = {}): string {
  switch (productId) {
    case 'ventana':
      return renderSrc(WINDOW_MODEL_SLUG[sel.windowModel ?? 'francesa'], { color: sel.windowFrame, vidrio: sel.windowGlass });
    case 'jardin': {
      const slug = sel.gardenHojas !== undefined && sel.gardenHojas !== 'custom' ? GARDEN_SLUG[sel.gardenHojas] : PRODUCT_SLUG.jardin;
      return renderSrc(slug, { color: sel.gardenColor, vidrio: sel.gardenGlass });
    }
    case 'recta':
    case 'bisagra':
      return renderSrc(PRODUCT_SLUG[productId], { color: sel.color, vidrio: sel.glass });
    case 'l':
      return renderSrc(PRODUCT_SLUG.l, { color: sel.color, acabado: sel.cornerModel ? `l-${sel.cornerModel}` : undefined });
    default:
      return PRODUCT_IMAGES[productId];
  }
}

/** Step0 "Acabado" tile image for an L variant slug (l-aquaclara / l-frosted / l-aquafold). */
export function variantImage(slug: string): string | null {
  const m = slug.replace(/^l-/, '') as CornerModel;
  return slug.startsWith('l-') ? (CORNER_IMAGES[m] ?? null) : null;
}
