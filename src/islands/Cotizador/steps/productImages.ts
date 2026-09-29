import type { ProductId } from '@content/catalog';

// Product thumbnails for Step0's picker card + Step2's estimate card.
// Sourced from the approved boards (desktop-03/ios-03 `products[].img`,
// resolved through 02-design/canvas-assets.json to their real files under
// 01-discovery/assets/) and re-exported here as optimized 256x256 webp
// crops in public/img/cotizador/ — sf-cot-medidas gap #1.
export const PRODUCT_IMAGES: Readonly<Record<ProductId, string>> = {
  recta: '/img/cotizador/product-recta.webp',
  l: '/img/cotizador/product-l.webp',
  templado: '/img/cotizador/product-templado.webp',
  bisagra: '/img/cotizador/product-bisagra.webp',
  jardin: '/img/cotizador/product-jardin.webp',
  ventana: '/img/cotizador/product-ventana.webp',
};
