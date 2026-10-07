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
  /** Aluminium colour preselected by the promo link. undefined (caller does not know it) keeps the stored one on update; null clears it. */
  color?: string | null;
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
      ...(i.color || i.vidrio ? { cotizador_params: { ...(i.color ? { color: i.color } : {}), ...(i.vidrio ? { vidrio: i.vidrio } : {}) } } : {}),
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
    const color = input.color === undefined ? (prev.cotizador_params?.color ?? null) : input.color;
    return this.persist(actor, this.toRecord(id, { ...input, color }), publish ?? prev.status === 'published', prev);
  }

  private persist(actor: string, rec: PromoRecord, publish: boolean, prev: StoredPromo | null): Promise<Result<StoredPromo>> {
    // The cap is a check-then-write: serialize it so two concurrent publishes cannot both pass (ADR-011 §4).
    return publish ? this.o.repo.withPublishLock(() => this.persistInner(actor, rec, publish, prev)) : this.persistInner(actor, rec, publish, prev);
  }

  private async persistInner(actor: string, rec: PromoRecord, publish: boolean, prev: StoredPromo | null): Promise<Result<StoredPromo>> {
    const problems = [...validatePromo(rec), ...(publish ? await this.capProblem(rec) : [])];
    if (problems.length) return { ok: false, problems };
    const stamp = this.now.toISOString();
    if (prev?.status === 'archived') return { ok: false, problems: ['La promoción está archivada. Reactívala primero.'] };
    const stored: StoredPromo = { ...rec, status: publish ? 'published' : 'draft', sort_order: prev?.sort_order ?? 0, created_at: prev?.created_at ?? stamp, updated_at: stamp };
    await this.o.repo.save(stored);
    await this.o.audit({ at: this.now, actor, action: prev ? 'promo.updated' : 'promo.created', detail: { id: rec.id, status: stored.status } });
    await this.republish();
    return { ok: true, value: stored };
  }

  setStatus(actor: string, id: string, publish: boolean): Promise<Result<StoredPromo>> {
    return publish ? this.o.repo.withPublishLock(() => this.setStatusInner(actor, id, publish)) : this.setStatusInner(actor, id, publish);
  }

  private async setStatusInner(actor: string, id: string, publish: boolean): Promise<Result<StoredPromo>> {
    const prev = await this.o.repo.get(id);
    if (!prev) return { ok: false, problems: ['La promoción no existe.'] };
    if (prev.status === 'archived') return { ok: false, problems: ['La promoción está archivada. Reactívala primero.'] };
    const problems = publish ? [...validatePromo(prev), ...(await this.capProblem(prev))] : [];
    if (problems.length) return { ok: false, problems };
    const stored: StoredPromo = { ...prev, status: publish ? 'published' : 'draft', updated_at: this.now.toISOString() };
    await this.o.repo.save(stored);
    await this.o.audit({ at: this.now, actor, action: publish ? 'promo.published' : 'promo.unpublished', detail: { id } });
    await this.republish();
    return { ok: true, value: stored };
  }

  /** Archive (replaces delete): leaves promotions.json and the active list, keeps the row and history. */
  async archive(actor: string, id: string): Promise<Result<StoredPromo>> {
    const prev = await this.o.repo.get(id);
    if (!prev) return { ok: false, problems: ['La promoción no existe.'] };
    if (prev.status === 'archived') return { ok: true, value: prev };
    const stored: StoredPromo = { ...prev, status: 'archived', updated_at: this.now.toISOString() };
    await this.o.repo.save(stored);
    await this.o.audit({ at: this.now, actor, action: 'promo.archived', detail: { id, from: prev.status } });
    await this.republish();
    return { ok: true, value: stored };
  }

  /** Reactivate: archived -> draft only. Publishing again goes through setStatus, so the 3-active cap applies. */
  async reactivate(actor: string, id: string): Promise<Result<StoredPromo>> {
    const prev = await this.o.repo.get(id);
    if (!prev) return { ok: false, problems: ['La promoción no existe.'] };
    if (prev.status !== 'archived') return { ok: false, problems: ['La promoción no está archivada.'] };
    const stored: StoredPromo = { ...prev, status: 'draft', updated_at: this.now.toISOString() };
    await this.o.repo.save(stored);
    await this.o.audit({ at: this.now, actor, action: 'promo.reactivated', detail: { id } });
    return { ok: true, value: stored };
  }

  /** Regenerates promotions.json from the published promos (validated, atomic). */
  async republish(): Promise<string> {
    const published = (await this.o.repo.list()).filter((p) => p.status === 'published');
    return publishPromotions(published, this.o.outDir, this.now);
  }
}
