// Promo image ingest (ADR-014 §3.5, sizes of the site: promo-N-600.webp / promo-N-900.webp).
// Never crops or forces a ratio (fit: inside), never upscales, re-encodes (drops metadata/payloads).
import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const WIDTHS = [600, 900] as const;
const FORMATS = new Set(['jpeg', 'png', 'webp']);

export class ImageError extends Error {}

export interface IngestResult {
  key: string;
  /** Public path of the 900 px variant, as the site expects it in promotions.json. */
  publicPath: string;
}

export async function ingestPromoImage(buf: Buffer, dir: string, urlPrefix: string): Promise<IngestResult> {
  if (buf.length === 0 || buf.length > MAX_UPLOAD_BYTES) throw new ImageError('La imagen debe pesar 5 MB o menos.');
  let meta;
  try {
    meta = await sharp(buf, { limitInputPixels: 24_000_000 }).metadata();
  } catch {
    throw new ImageError('No se pudo leer la imagen. Usa JPG, PNG o WebP.');
  }
  if (!meta.format || !FORMATS.has(meta.format)) throw new ImageError('Formato no permitido. Usa JPG, PNG o WebP.');
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (Math.max(w, h) > 6000) throw new ImageError('La imagen es demasiado grande (máximo 6000 px por lado).');
  if (Math.max(w, h) < 600) throw new ImageError('La imagen es muy pequeña (mínimo 600 px en el lado largo).');

  await mkdir(dir, { recursive: true });
  const key = `promo-${randomBytes(8).toString('hex')}`;
  const written: string[] = [];
  try {
    for (const width of WIDTHS) {
      const out = await sharp(buf, { limitInputPixels: 24_000_000 })
        .rotate()
        .resize({ width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const final = join(dir, `${key}-${width}.webp`);
      const tmp = `${final}.${randomBytes(4).toString('hex')}.tmp`;
      await writeFile(tmp, out);
      await rename(tmp, final);
      written.push(final);
    }
  } catch (err) {
    await Promise.all(written.map((f) => rm(f, { force: true })));
    throw new ImageError(err instanceof ImageError ? err.message : 'No se pudo procesar la imagen.');
  }
  return { key, publicPath: `${urlPrefix.replace(/\/$/, '')}/${key}-900.webp` };
}
