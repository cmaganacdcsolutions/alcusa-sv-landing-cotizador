// Idempotent import of the site's live promos (src/content/promotions.json) into the admin store.
// Pure of CLI/env concerns: src/cli/import-promos.ts wires config, flags and the production guard.
//
// Contract (see docs/architecture/adr/adr-014 + the round-trip test in test/admin/promo-roundtrip.test.ts):
//  * Stable key = the promo `id` of the file (stored as promotions.public_id). Re-running never duplicates.
//  * Every promo lands as status 'published' with sort_order = its position in the file, so a later publish
//    from the admin writes the same set, in the same order, with the same prices / links / images.
//  * Flyers are COPIED (never re-encoded) into the admin image store under the same file name; the stored URL is
//    `<imageUrlPrefix>/<file>`. With the default prefix (/images/promos) the URL equals the site's.
//  * Validation is all-or-nothing: if anything is wrong nothing is written (no store row, no image, no audit).
//  * Placeholder promos (`placeholder: true`) are not live content and are skipped.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import sharp from 'sharp';
import type { AuditEntry, PromoRepo, StoredPromo } from '../admin/store.ts';
import { type PromoRecord, validateAdminLimits, validatePromotions } from './schema.ts';
import { MAX_ACTIVE } from './service.ts';

export class ImportError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`importacion rechazada: ${problems.join('; ')}`);
    this.name = 'ImportError';
    this.problems = problems;
  }
}

export type ImportAction = 'create' | 'update' | 'unchanged' | 'skipped';

export interface ImportItem {
  id: string;
  title: string;
  action: ImportAction;
  /** Fields that differ from the stored promo (update only), or the skip reason. */
  changes: string[];
  price_promo: number;
  price_before: number | null;
  starts_on: string;
  ends_on: string;
  /** Cotizador deep link the site builds from product_slug + cotizador_params (color, vidrio). */
  link: string;
  /** URL stored in the admin (and published). */
  image: string;
  images: Array<{ file: string; action: 'copy' | 'unchanged' }>;
}

export interface ImportReport {
  dryRun: boolean;
  items: ImportItem[];
  counts: Record<ImportAction, number>;
  imagesToCopy: number;
}

export interface ImportOptions {
  repo: PromoRepo;
  /** Directory the file's image URLs are relative to (the site's `public/`). */
  sitePublicDir: string;
  /** Admin image store (PROMO_IMAGES_DIR). */
  imagesDir: string;
  /** URL prefix of the admin image store (PROMO_IMAGE_URL_PREFIX). */
  imageUrlPrefix: string;
  dryRun?: boolean;
  now?: () => Date;
  audit?: (e: AuditEntry) => Promise<void>;
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const IMAGE_RE = /^([A-Za-z0-9-]+)-900\.webp$/;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const overlaps = (a: PromoRecord, b: PromoRecord): boolean => a.starts_on <= b.ends_on && b.starts_on <= a.ends_on;

/**
 * Same URL the site builds for the promo CTA (promoHref in src/content/promotions.ts): with finishes it lands on Medidas
 * (`?producto=<slug>&paso=medidas&color=<c>&vidrio=<v>`), without them it is the plain `?producto=<slug>`.
 */
export const cotizadorLink = (slug: string, params: { color?: string; vidrio?: string } = {}): string => {
  const q = new URLSearchParams({ producto: slug });
  if (!params.color && !params.vidrio) return `/cotizador?${q.toString()}`;
  q.set('paso', 'medidas');
  if (params.color) q.set('color', params.color);
  if (params.vidrio) q.set('vidrio', params.vidrio);
  return `/cotizador?${q.toString()}`;
};

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

async function readIfExists(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Maps one validated file entry to the admin record. Strings are kept verbatim (no trimming): that is what makes the round trip exact. */
function toRecord(item: Record<string, unknown>, image: string): PromoRecord {
  const cp = item['cotizador_params'];
  const vidrio = isRec(cp) && typeof cp['vidrio'] === 'string' ? cp['vidrio'] : undefined;
  const color = isRec(cp) && typeof cp['color'] === 'string' ? cp['color'] : undefined;
  return {
    id: item['id'] as string,
    placeholder: false,
    title: item['title'] as string,
    description: item['description'] as string,
    image,
    image_alt: item['image_alt'] as string,
    price_before: (item['price_before'] as number | null | undefined) ?? null,
    price_promo: item['price_promo'] as number,
    product_slug: item['product_slug'] as string,
    ...(color || vidrio ? { cotizador_params: { ...(color ? { color } : {}), ...(vidrio ? { vidrio } : {}) } } : {}),
    starts_on: item['starts_on'] as string,
    ends_on: item['ends_on'] as string,
    rules: [...((item['rules'] as string[] | undefined) ?? [])],
  };
}

function changedFields(prev: StoredPromo, next: StoredPromo): string[] {
  const out: string[] = [];
  const keys = ['title', 'description', 'image', 'image_alt', 'price_before', 'price_promo', 'product_slug', 'starts_on', 'ends_on', 'status', 'sort_order'] as const;
  for (const k of keys) if (prev[k] !== next[k]) out.push(k);
  if ((prev.cotizador_params?.vidrio ?? null) !== (next.cotizador_params?.vidrio ?? null) || (prev.cotizador_params?.color ?? null) !== (next.cotizador_params?.color ?? null)) out.push('cotizador_params');
  if (JSON.stringify(prev.rules) !== JSON.stringify(next.rules)) out.push('rules');
  return out;
}

interface ImagePlan {
  /** Final URL stored in the admin. */
  url: string;
  copies: Array<{ file: string; src: string; dest: string; bytes: Buffer; action: 'copy' | 'unchanged' }>;
}

/** Resolves + validates the flyer of one promo and decides which files must be copied. Problems are pushed, never thrown. */
async function planImage(image: string, o: ImportOptions, at: (m: string) => void): Promise<ImagePlan> {
  if (/^https?:\/\//i.test(image)) return { url: image, copies: [] }; // external URL: nothing to copy
  const name = basename(image);
  const m = IMAGE_RE.exec(name);
  if (!image.startsWith('/') || image.split('/').includes('..') || !m) {
    at(`"image" "${image}" no es una imagen soportada (ruta local que termine en <nombre>-900.webp)`);
    return { url: image, copies: [] };
  }
  const root = resolve(o.sitePublicDir);
  const copies: ImagePlan['copies'] = [];
  for (const file of [name, `${m[1]}-600.webp`]) {
    const src = resolve(root, `.${image.slice(0, image.length - name.length)}${file}`);
    if (src !== root && !src.startsWith(root + sep)) {
      at(`"image" "${image}" sale del directorio publico del sitio`);
      continue;
    }
    const bytes = await readIfExists(src);
    if (!bytes) {
      if (file === name) at(`falta el archivo de imagen ${file} en ${o.sitePublicDir}`);
      continue; // the 600 px variant is optional
    }
    if (file === name) {
      try {
        const meta = await sharp(bytes).metadata();
        if (meta.format !== 'webp') at(`${file} no es una imagen WebP valida`);
      } catch {
        at(`${file} no se pudo leer como imagen`);
      }
    }
    const dest = resolve(o.imagesDir, file);
    const current = await readIfExists(dest);
    copies.push({ file, src, dest, bytes, action: current && sha256(current) === sha256(bytes) ? 'unchanged' : 'copy' });
  }
  return { url: `${o.imageUrlPrefix.replace(/\/+$/, '')}/${name}`, copies };
}

async function writeAtomic(dest: string, bytes: Buffer): Promise<void> {
  await mkdir(resolve(dest, '..'), { recursive: true });
  const tmp = `${dest}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, dest);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** Parses + validates + (unless dryRun) applies the import. Throws ImportError with every problem found, before writing anything. */
export async function importPromotions(doc: unknown, o: ImportOptions): Promise<ImportReport> {
  const dryRun = o.dryRun === true;
  const schemaProblems = validatePromotions(doc);
  if (schemaProblems.length) throw new ImportError(schemaProblems);
  const list = (isRec(doc) ? doc['promotions'] : []) as Array<Record<string, unknown>>;
  const real = list.filter((p) => p['placeholder'] !== true);
  if (list.length > 0 && real.length === 0) {
    throw new ImportError(['todas las promociones del archivo son placeholder (no son contenido vivo); revisa que sea el promotions.json correcto']);
  }

  const run = async (): Promise<ImportReport> => {
    const problems: string[] = [];
    const plans: Array<{ rec: PromoRecord; plan: ImagePlan }> = [];
    for (const item of real) {
      const id = String(item['id']);
      const at = (m: string): void => void problems.push(`${id}: ${m}`);
      if (!ID_RE.test(id)) at('el id debe ser ASCII (letras, numeros, guion), maximo 80 caracteres');
      const plan = await planImage(item['image'] as string, o, at);
      const rec = toRecord(item, plan.url);
      for (const p of validateAdminLimits(rec)) at(p);
      plans.push({ rec, plan });
    }

    const existing = new Map((await o.repo.list()).map((p) => [p.id, p]));
    // 3-active cap, evaluated on the state AFTER the import (planned promos replace stored ones by id).
    const after = new Map(existing);
    const stamp = (o.now ?? (() => new Date()))().toISOString();
    const stored: StoredPromo[] = plans.map(({ rec }, i) => {
      const prev = existing.get(rec.id);
      const s: StoredPromo = { ...rec, status: 'published', sort_order: i, created_at: prev?.created_at ?? stamp, updated_at: stamp };
      after.set(rec.id, s);
      return s;
    });
    for (const s of stored) {
      const clash = [...after.values()].filter((p) => p.status === 'published' && p.id !== s.id && overlaps(p, s));
      if (clash.length >= MAX_ACTIVE) {
        problems.push(`${s.id}: ya hay ${MAX_ACTIVE} promociones publicadas en esas fechas (${clash.map((p) => p.id).join(', ')}); despublica o archiva alguna primero`);
      }
    }
    if (problems.length) throw new ImportError(problems);

    const items: ImportItem[] = stored.map((s, i) => {
      const prev = existing.get(s.id);
      const changes = prev ? changedFields(prev, s) : [];
      const plan = plans[i]?.plan as ImagePlan;
      return {
        id: s.id,
        title: s.title,
        action: !prev ? 'create' : changes.length ? 'update' : 'unchanged',
        changes,
        price_promo: s.price_promo,
        price_before: s.price_before,
        starts_on: s.starts_on,
        ends_on: s.ends_on,
        link: cotizadorLink(s.product_slug, s.cotizador_params),
        image: s.image,
        images: plan.copies.map((c) => ({ file: c.file, action: c.action })),
      };
    });
    for (const p of list.filter((x) => x['placeholder'] === true)) {
      items.push({ id: String(p['id']), title: String(p['title']), action: 'skipped', changes: ['placeholder'], price_promo: Number(p['price_promo']), price_before: null, starts_on: String(p['starts_on']), ends_on: String(p['ends_on']), link: '', image: String(p['image']), images: [] });
    }

    if (!dryRun) {
      for (const [i, s] of stored.entries()) {
        for (const c of plans[i]?.plan.copies ?? []) if (c.action === 'copy') await writeAtomic(c.dest, c.bytes);
        const item = items[i] as ImportItem;
        if (item.action === 'unchanged') continue;
        await o.repo.save(s);
        await o.audit?.({ at: new Date(stamp), actor: 'cli', action: 'promo.imported', detail: { id: s.id, op: item.action, source: 'promotions.json' } });
      }
    }

    const counts: Record<ImportAction, number> = { create: 0, update: 0, unchanged: 0, skipped: 0 };
    for (const it of items) counts[it.action] += 1;
    const imagesToCopy = items.reduce((n, it) => n + it.images.filter((im) => im.action === 'copy').length, 0);
    return { dryRun, items, counts, imagesToCopy };
  };

  // The cap is a check-then-write: take the same lock the admin uses when publishing (writes only).
  return dryRun ? run() : o.repo.withPublishLock(run);
}
