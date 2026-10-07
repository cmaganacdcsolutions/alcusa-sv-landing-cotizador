import { coverFor, type VariantChoice } from '@content/home-media';
import type { WindowModel } from '@engine/pricing';

// "Modelo" (Francesa/Bilbao) option-card images. 2026-10-06: son los RENDERS del sitio,
// resueltos por el unico mapa `@content/home-media` (PRODUCT_MEDIA / coverFor); ya no se usa
// ninguna foto de Alcusa. Para cambiar un render basta con editar ese mapa.
// Photos are shown whole (object-fit: contain, centered; image-frame-rule.md).
export interface WindowModelImage {
  src: string;
  srcSet: string;
}

/** Slug del catalogo (clave de PRODUCT_MEDIA) de cada modelo de ventana. */
export const WINDOW_MODEL_SLUG: Readonly<Record<WindowModel, string>> = {
  francesa: 'ventana-francesa',
  bilbao: 'ventana-bilbao',
};

/**
 * Render del modelo. Sin `choice` es la portada; con marco/vidrio elegidos (`{ color, vidrio }`) es la variante
 * exacta de ese modelo, asi las tarjetas "Modelo" reflejan lo que el cliente va eligiendo.
 */
export function modelImage(model: WindowModel, choice?: VariantChoice): WindowModelImage {
  const slug = WINDOW_MODEL_SLUG[model];
  const media = coverFor(slug, choice);
  if (!media) throw new Error(`home-media: falta el render de "${slug}"`);
  return { src: media.src, srcSet: `${media.src} ${media.width}w` };
}

export const WINDOW_MODEL_IMAGES: Readonly<Record<WindowModel, WindowModelImage>> = {
  francesa: modelImage('francesa'),
  bilbao: modelImage('bilbao'),
};
