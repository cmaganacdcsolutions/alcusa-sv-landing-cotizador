// Capa ambiental "horneada" de PhotoFrame (BUG-1008-01). Modulo puro: sin React, sin DOM, sin fs.
//
// Detras de cada foto oficial (fit contain) PhotoFrame pone la misma imagen difuminada. Con
// `filter: blur(32px)` en vivo, 19 capas hacian WebKit @DPR3 3-4x mas lento. La solucion: el
// desenfoque, la saturacion y el brillo ya vienen en los pixeles de una miniatura minuscula
// (`<stem>-amb.webp`, ~40px de ancho, generada por scripts/bake-ambient.mjs) y el CSS solo la
// escala. La URL de la miniatura se DERIVA de la de la foto: no hay que tocar ningun dato.
//
//   /images/fotos/<stem>-<ancho>.webp  ->  /images/fotos/<stem>-amb.webp
//
// Los flyers de promos siguen la MISMA convencion (`<stem>-<ancho>.webp` -> `<stem>-amb.webp`) en las dos
// carpetas que permite el parser: /images/promos/ (las del build) y /media/promos/ (subidas del admin, que el
// admin-server hornea al subir con los mismos parametros). Ver `bakedFlyerAmbientSrc`.
// Todo lo que no cumpla el patron (URLs ajenas, flyers .jpg antiguos) devuelve `undefined`: la capa NO usa blur
// en vivo, queda un color solido de token (`.photo-frame__ambient--solid`).

/** Sufijo (sin guion ni extension) de la miniatura ambiental. scripts/bake-ambient.mjs escribe el mismo; el test de fs vigila que coincidan. */
export const AMBIENT_SUFFIX = 'amb';

// Prefijo o base arbitrarios hasta `/images/fotos/`; el nombre no cruza carpetas, query ni hash.
const FOTO_URL = /^(.*\/images\/fotos\/[^/?#]+)-\d+\.webp$/;

/**
 * Miniatura ambiental de una foto oficial, o `undefined` si `src` no es una foto de
 * `/images/fotos/<stem>-<ancho>.webp` (entonces la capa usa el blur en vivo).
 */
export function bakedAmbientSrc(src: string): string | undefined {
  const match = FOTO_URL.exec(src);
  return match ? `${match[1]}-${AMBIENT_SUFFIX}.webp` : undefined;
}

// Flyers de promos: /images/promos/<stem>-<ancho>.webp (build) o /media/promos/<stem>-<ancho>.webp (admin).
const PROMO_URL = /^(.*\/(?:images|media)\/promos\/[^/?#]+)-\d+\.webp$/;

/**
 * Miniatura ambiental de un flyer de promo (`<stem>-<ancho>.webp` -> `<stem>-amb.webp`), o `undefined` si la URL
 * no sigue la convencion (entonces el marco usa el color solido, nunca blur en vivo). La miniatura puede no
 * existir (flyer subido antes de hornear, 404): el `background` solido de la propia capa cubre ese caso.
 */
export function bakedFlyerAmbientSrc(src: string): string | undefined {
  const match = PROMO_URL.exec(src);
  return match ? `${match[1]}-${AMBIENT_SUFFIX}.webp` : undefined;
}

/** Miniatura ambiental de cualquier imagen de un PhotoFrame: foto oficial o flyer de promo. */
export function ambientThumbSrc(src: string): string | undefined {
  return bakedAmbientSrc(src) ?? bakedFlyerAmbientSrc(src);
}
