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
// Todo lo que no cumpla ese patron (flyers de promos en /images/promos/*, URLs ajenas) devuelve
// `undefined`: la capa conserva el blur en vivo de siempre, que es el fallback seguro.

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
