import type { WindowModel } from '@engine/pricing';

// "Modelo" (Francesa/Bilbao) option-card photos — sf-cot-models, replacing
// the old text-only chip row per 02-design/specs/ventana-modelo-selector.md
// §2. Same folder/convention as PRODUCT_IMAGES (steps/productImages.ts) and
// GLASS_SWATCHES (measures/glassSwatches.tsx); the per-model `objectPosition`
// travels with the src/srcSet here (composition data, not a design token —
// see spec §3.4 "SIN TOKEN") instead of living in the CSS file.
//
// Both photos are the OFFICIAL ALCUSA catalog images (06-assets/images/MANIFEST.md);
// 4:3 center crops of ventanas/ventana-bilbao and ventana-francesa. Formerly: Bilbao was the same
// source photo as public/images/hero-ventana-bilbao-*.webp
// (01-discovery/assets/product-ventana-bilbao.jpeg); Francesa is the same
// source photo as the existing public/img/cotizador/product-ventana.webp
// (alcusasv.com "Ventanas francesas"), re-cropped to the top window only.
// Two widths (400w/800w) exported per spec §2, same pattern as
// hero-ventana-bilbao-*.webp's srcset.
export interface WindowModelImage {
  src: string;
  srcSet: string;
  objectPosition: string;
}

export const WINDOW_MODEL_IMAGES: Readonly<Record<WindowModel, WindowModelImage>> = {
  francesa: {
    src: '/img/cotizador/product-ventana-francesa-800.webp',
    srcSet:
      '/img/cotizador/product-ventana-francesa-400.webp 400w, /img/cotizador/product-ventana-francesa-800.webp 800w',
    objectPosition: '50% 50%',
  },
  bilbao: {
    src: '/img/cotizador/product-ventana-bilbao-800.webp',
    srcSet: '/img/cotizador/product-ventana-bilbao-400.webp 400w, /img/cotizador/product-ventana-bilbao-800.webp 800w',
    objectPosition: '50% 50%',
  },
};
