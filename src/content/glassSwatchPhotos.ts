// Fotos reales (recortes de textura) para los swatches de vidrio. Decision 2026-10-17: reemplaza los
// circulos CSS puros de 2026-10-06 SOLO donde existe foto de Alcusa (mallado, nevado, aquafold).
// claro / duplex / decorado siguen en CSS. Para sumar decorado o aquaclara: agregar
// `glass-<clave>-{64,128}.webp` en public/images/vidrios/ (ver scripts/convert-vidrios.mjs) y UNA entrada
// aqui (y, en el inicio, la regla `.pcard__sw[data-sw='glass:<clave>']` de components/home/ProductCard.astro,
// que un test mantiene en paridad con este mapa). Cero JS: es un `background` CSS.
export const GLASS_PHOTO_KEYS = ['mallado', 'nevado', 'aquafold'] as const;
export type GlassPhotoKey = (typeof GLASS_PHOTO_KEYS)[number];

export const GLASS_PHOTO_SIZES = [64, 128] as const; // 1x / 2x

export function glassPhotoUrl(key: GlassPhotoKey, px: (typeof GLASS_PHOTO_SIZES)[number]): string {
  return `/images/vidrios/glass-${key}-${px}.webp`;
}

/** Valor de `background` (misma cadena que usa la regla del inicio). */
export function glassPhotoCss(key: GlassPhotoKey): string {
  return `image-set(url(${glassPhotoUrl(key, 64)}) 1x, url(${glassPhotoUrl(key, 128)}) 2x) center / cover no-repeat`;
}

export function isGlassPhotoKey(key: string): key is GlassPhotoKey {
  return (GLASS_PHOTO_KEYS as readonly string[]).includes(key);
}
