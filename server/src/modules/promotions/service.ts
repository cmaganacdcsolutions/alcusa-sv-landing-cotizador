import { randomBytes } from 'node:crypto';
import type { AuditEntry, PromoRepo, StoredPromo } from '../admin/store.ts';
import { publishPromotions } from './publish.ts';
import { type PromoRecord, validatePromo } from './schema.ts';

/** The landing shows at most 3 promos at once (decision 2026-09-30, MAX_PROMOS). */
export const MAX_ACTIVE = 3;

export interface PromoInput {
  title: string;
  description: string;
  image: string;
  image_alt: string;
  price_before: number | null;
  price_promo: number;
  product_slug: string;
  vidrio: string | null;
  starts_on: string;
  ends_on: string;
  rules: string[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; problems: string[] };

export interface PromoServiceOptions {
  repo: PromoRepo;
  outDir: string;
  audit: (e: AuditEntry) => Promise<void>;
  now?: () => Date;
}

const slugify = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

const overlaps = (a: PromoRecord, b: PromoRecord): boolean => a.starts_on <= b.ends_on && b.starts_on <= a.ends_on;

export class PromoService {
  constructor(private readonly o: PromoServiceOptions) {}
  private get now(): Date {
    return (this.o.now ?? (() => new Date()))();
  }

  list(): Promise<StoredPromo[]> {
    return this.o.repo.list();
  }
  get(id: string): Promise<StoredPromo | null> {
    return this.o.repo.get(id);
  }

  private toRecord(id: string, i: PromoInput): PromoRecord {
    return {
      id, placeholder: false, title: i.title.trim(), description: i.description.trim(), image: i.image, image_alt: i.image_alt.trim(),
      price_before: i.price_before, price_promo: i.price_promo, product_slug: i.product_slug,
      ...(i.vidrio ? { cotizador_params: { vidrio: i.vidrio } } : {}),
      starts_on: i.starts_on, ends_on: i.ends_on, rules: i.rules.map((r) => r.trim()).filter(Boolean),
    };
  }

  /** Cap check: a promo cannot be published if 3 other published promos already overlap its dates. */
  private async capProblem(rec: PromoRecord): Promise<string[]> {
    const others = (await this.o.repo.list()).filter((p) => p.status === 'published' && p.id !== rec.id && overlaps(p, rec));
    return others.length >= MAX_ACTIVE ? [`Ya hay ${MAX_ACTIVE} promociones publicadas en esas fechas. Despublica una o cambia la vigencia.`] : [];
  }

  async create(actor: string, input: PromoInput, publish: boolean): Promise<Result<StoredPromo>> {
    const id = `promo-${slugify(input.title) || 'sin-titulo'}-${randomBytes(2).toString('hex')}`;
    const rec = this.toRecord(id, input);
    return this.persist(actor, rec, publish, null);
  }

  async update(actor: string, id: string, input: PromoInput, publish?: boolean): Promise<Result<StoredPromo>> {
    const prev = await this.o.repo.get(id);
    if (!prev) return { ok: false, problems: ['La promoción no existe.'] };
    return this.persist(actor, this.toRecord(id, input), publish ?? prev.status === 'published', prev);
  }

  private async persist(actor: string, rec: PromoRecord, publish: boolean, prev: StoredPromo | null): Promise<Result<StoredPromo>> {
    const problems = [...validatePromo(rec), ...(publish ? await this.capProblem(rec) : [])];
    if (problems.length) return { ok: false, problems };
    const stamp = this.now.toISOString();
    const stored: StoredPromo = { ...rec, status: publish ? 'published' : 'draft', sort_order: prev?.sort_order ?? 0, created_at: prev?.created_at ?? stamp, updated_at: stamp };
    await this.o.repo.save(stored);
    await this.o.audit({ at: this.now, actor, action: prev ? 'promo.updated' : 'promo.created', detail: { id: rec.id, status: stored.status } });
    await this.republish();
    return { ok: true, value: stored };
  }

  async setStatus(actor: string, id: string, publish: boolean): Promise<Result<StoredPromo>> {
    const prev = await this.o.repo.get(id);
    if (!prev) return { ok: false, problems: ['La promoción no existe.'] };
    const problems = publish ? [...validatePromo(prev), ...(await this.capProblem(prev))] : [];
    if (problems.length) return { ok: false, problems };
    const stored: StoredPromo = { ...prev, status: publish ? 'published' : 'draft', updated_at: this.now.toISOString() };
    await this.o.repo.save(stored);
    await this.o.audit({ at: this.now, actor, action: publish ? 'promo.published' : 'promo.unpublished', detail: { id } });
    await this.republish();
    return { ok: true, value: stored };
  }

  async remove(actor: string, id: string): Promise<boolean> {
    const ok = await this.o.repo.remove(id);
    if (ok) {
      await this.o.audit({ at: this.now, actor, action: 'promo.deleted', detail: { id } });
      await this.republish();
    }
    return ok;
  }

  /** Regenerates promotions.json from the published promos (validated, atomic). */
  async republish(): Promise<string> {
    const published = (await this.o.repo.list()).filter((p) => p.status === 'published');
    return publishPromotions(published, this.o.outDir, this.now);
  }
}
