import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type PromoRecord, validatePromotions } from './schema.ts';

export class PublishError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`promotions.json invalido: ${problems.join('; ')}`);
    this.name = 'PublishError';
    this.problems = problems;
  }
}

/** cotizador_params as published: only the finishes present, always in the order color, vidrio (same order the site builds its link in). */
function publishedParams(cp: PromoRecord['cotizador_params']): { cotizador_params?: { color?: string; vidrio?: string } } {
  if (!cp || (!cp.color && !cp.vidrio)) return {};
  return { cotizador_params: { ...(cp.color ? { color: cp.color } : {}), ...(cp.vidrio ? { vidrio: cp.vidrio } : {}) } };
}

export function buildDocument(promos: readonly PromoRecord[], now: Date): { generated_at: string; promotions: PromoRecord[] } {
  return {
    generated_at: now.toISOString(),
    promotions: promos.map((p) => ({
      id: p.id,
      placeholder: false,
      title: p.title,
      description: p.description,
      image: p.image,
      image_alt: p.image_alt,
      price_before: p.price_before,
      price_promo: p.price_promo,
      product_slug: p.product_slug,
      ...publishedParams(p.cotizador_params),
      starts_on: p.starts_on,
      ends_on: p.ends_on,
      rules: [...p.rules],
    })),
  };
}

/**
 * Validates with the site's rules, then writes temp file + rename in the same directory, so a reader
 * (or a crash) sees either the old or the new file, never a partial one. Nothing is written if invalid.
 */
export async function publishPromotions(promos: readonly PromoRecord[], outDir: string, now: Date = new Date()): Promise<string> {
  const doc = buildDocument(promos, now);
  const problems = validatePromotions(doc);
  if (problems.length) throw new PublishError(problems);
  await mkdir(outDir, { recursive: true });
  const target = join(outDir, 'promotions.json');
  const tmp = join(outDir, `.promotions.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  return target;
}
