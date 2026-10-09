// Miniatura ambiental horneada de los flyers (BUG-1008-01): `<stem>-amb.webp` junto a `<stem>-<ancho>.webp`.
// El sitio no hace blur en vivo; deriva la URL con bakedAmbientSrc (src/lib/photo-ambient) y, si el archivo no
// existe, cae a un color solido. Este modulo es el espejo del scripts/bake-ambient.mjs del sitio (renderAmbient +
// PARAMS): test/admin/promo-ambient.test.ts compara bytes contra el script, asi que los numeros no pueden divergir.
import { randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/** Mismo sufijo que AMBIENT_SUFFIX del sitio. */
export const AMBIENT_SUFFIX = 'amb';
/** Ancho del que sale la miniatura: el flyer grande (el script usa 800 o, si no hay, el mayor = 900 en promos). */
export const AMBIENT_SOURCE_WIDTH = 900;
export const AMBIENT_PARAMS = { width: 40, blur: 4, saturation: 0.6, brightness: 1.04, quality: 60 } as const;

/** Matriz de `saturate(s)` de CSS (Filter Effects 1), igual que en el script. */
function saturateMatrix(s: number): [[number, number, number], [number, number, number], [number, number, number]] {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
}

export function ambientFileName(stem: string): string {
  return `${stem}-${AMBIENT_SUFFIX}.webp`;
}

/** Miniatura ambiental (webp) a partir de los bytes de un flyer. */
export async function renderAmbient(source: Buffer | string): Promise<Buffer> {
  const p = AMBIENT_PARAMS;
  return sharp(source)
    .resize({ width: p.width })
    .blur(p.blur)
    .recomb(saturateMatrix(p.saturation))
    .linear(p.brightness, 0)
    .webp({ quality: p.quality })
    .toBuffer();
}

/**
 * Escribe (atomico, idempotente) `<stem>-amb.webp` en `dir` a partir del flyer `<stem>-900.webp` ya presente en `dir`.
 * Devuelve true si escribio. Si falta el 900 o no se puede leer, no hace nada: el sitio cae a color solido.
 */
export async function ensureAmbient(dir: string, stem: string): Promise<boolean> {
  let bytes: Buffer;
  try {
    bytes = await renderAmbient(await readFile(join(dir, `${stem}-${AMBIENT_SOURCE_WIDTH}.webp`)));
  } catch {
    return false;
  }
  const final = join(dir, ambientFileName(stem));
  const current = await readFile(final).catch(() => null);
  if (current?.equals(bytes)) return false;
  const tmp = `${final}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, final);
  } catch {
    await rm(tmp, { force: true });
    return false;
  }
  return true;
}
