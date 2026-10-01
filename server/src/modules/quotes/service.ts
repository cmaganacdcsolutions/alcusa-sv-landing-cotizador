// Domain/service layer for quotes (ADR-013 §2.6, ADR-011 §5, ADR-012).
import type { Pool } from 'mysql2/promise';
import { AppError } from '../../http/errors.ts';
import { DbRateLimiter, hmacHex } from '../../http/rate-limit-db.ts';
import type { QuoteLoadResponse } from '../../../../src/integrations/quotes/types.ts';
import type { ValidCreate } from './create-request.ts';
import { QUOTE_VALIDITY_DAYS, addDays, generateQuoteCode, normalizeQuoteCode, svDate } from './folio.ts';
import { decimalToCents, centsToNumber } from './money.ts';
import { findByIdempotencyKey, findIdByCode, findPublicByCode, insertQuote, type ExistingQuote } from './repository.ts';

export interface RateLimits {
  /** POST quote-create per ip_hash per hour (ADR-011 §5). */
  createPerIpHour: number;
  /** POST quote-create per WhatsApp (HMAC) per hour. */
  createPerWhatsappHour: number;
  /** GET quotes/{code} total per ip_hash per hour (ADR-012 §4). */
  loadPerIpHour: number;
  /** GET failures (404/422) per ip_hash per hour. */
  loadFailuresPerIpHour: number;
}

export const DEFAULT_LIMITS: RateLimits = {
  createPerIpHour: 20,
  createPerWhatsappHour: 5,
  loadPerIpHour: 30,
  loadFailuresPerIpHour: 10,
};

const HOUR = 3600;
const MAX_CODE_ATTEMPTS = 5;

export interface QuoteServiceDeps {
  pool: Pool;
  pepper: string;
  limits?: Partial<RateLimits>;
  now?: () => Date;
  /** Tests force collisions with this; defaults to the random generator. */
  generateCode?: (now: Date) => string;
}

export interface CreateOutcome {
  status: 200 | 201;
  body: { code: string; validUntil: string; total: number };
}

function rateLimited(retryAfterSec: number): AppError & { retryAfterSec: number } {
  const e = new AppError(429, 'rate_limited', 'Demasiadas solicitudes. Intenta más tarde.') as AppError & { retryAfterSec: number };
  e.retryAfterSec = retryAfterSec;
  return e;
}

export function isRateLimited(e: unknown): e is AppError & { retryAfterSec: number } {
  return e instanceof AppError && e.statusCode === 429 && typeof (e as { retryAfterSec?: unknown }).retryAfterSec === 'number';
}

function utcStamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function isDup(err: unknown, key: string): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === 'ER_DUP_ENTRY' && typeof e.message === 'string' && e.message.includes(key);
}

export class QuoteService {
  private readonly limiter: DbRateLimiter;
  private readonly limits: RateLimits;
  private readonly now: () => Date;

  constructor(private readonly deps: QuoteServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.limiter = new DbRateLimiter(deps.pool, this.now);
    this.limits = { ...DEFAULT_LIMITS, ...deps.limits };
  }

  ipHash(ip: string): string {
    return hmacHex(this.deps.pepper, `ip:${ip}`);
  }

  private replay(existing: ExistingQuote, d: ValidCreate): CreateOutcome {
    // Same key + different cart/customer/delivery => 409 (ADR-011 §5).
    if (existing.cartHash !== d.cartHash) {
      throw new AppError(409, 'idempotency_conflict', 'Esta clave ya se usó con otra cotización.');
    }
    return { status: 200, body: { code: existing.code, validUntil: existing.validUntil, total: Number(existing.total) } };
  }

  async create(d: ValidCreate, ip: string): Promise<CreateOutcome> {
    const { pool } = this.deps;
    const first = await findByIdempotencyKey(pool, d.idempotencyKey);
    if (first) return this.replay(first, d);

    const ipHash = this.ipHash(ip);
    const byIp = await this.limiter.hit(`qc:${ipHash}`, HOUR, this.limits.createPerIpHour);
    if (!byIp.allowed) throw rateLimited(byIp.retryAfterSec);
    const byWa = await this.limiter.hit(`qw:${hmacHex(this.deps.pepper, `wa:${d.customerWhatsapp}`)}`, HOUR, this.limits.createPerWhatsappHour);
    if (!byWa.allowed) throw rateLimited(byWa.retryAfterSec);

    // supersedesCode only links; an unknown folio is ignored (never an existence oracle, never an error).
    const supersedesQuoteId = d.supersedesCode ? await findIdByCode(pool, d.supersedesCode) : null;

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      const now = this.now();
      const code = (this.deps.generateCode ?? generateQuoteCode)(now);
      const validUntil = addDays(svDate(now), QUOTE_VALIDITY_DAYS);
      try {
        await insertQuote(pool, d, { code, validUntil, consentAt: utcStamp(now), ipHash, supersedesQuoteId });
        return { status: 201, body: { code, validUntil, total: centsToNumber(d.totalCents) } };
      } catch (err) {
        if (isDup(err, 'uq_quotes_code')) continue; // folio collision: new random suffix
        if (isDup(err, 'uq_quotes_idempotency')) {
          // concurrent double submit: the other request won; answer from its row
          const winner = await findByIdempotencyKey(pool, d.idempotencyKey);
          if (winner) return this.replay(winner, d);
        }
        throw err;
      }
    }
    throw new Error('quote code collision: attempts exhausted');
  }

  /**
   * ADR-012 §3/§4. Returns the PII-free snapshot, or throws AppError 422/404/429.
   * Format failures never read `quotes` (only the rate_limits counters).
   */
  async load(rawCode: string, ip: string): Promise<{ result: 'ok' | 'not_found' | 'invalid'; body: QuoteLoadResponse; codeKey: string }> {
    const ipHash = this.ipHash(ip);
    const total = await this.limiter.hit(`ql:${ipHash}`, HOUR, this.limits.loadPerIpHour);
    if (!total.allowed) throw rateLimited(total.retryAfterSec);
    const failures = await this.limiter.peek(`qf:${ipHash}`, HOUR, this.limits.loadFailuresPerIpHour);
    if (!failures.allowed) throw rateLimited(failures.retryAfterSec);

    const fail = async (status: 404 | 422): Promise<never> => {
      await this.limiter.hit(`qf:${ipHash}`, HOUR, this.limits.loadFailuresPerIpHour);
      throw status === 422
        ? new AppError(422, 'invalid_code', 'El folio no es válido.')
        : new AppError(404, 'not_found', 'No encontramos una cotización con ese folio.');
    };

    const n = rawCode.length > 100 ? ({ ok: false } as const) : normalizeQuoteCode(rawCode, this.now());
    if (!n.ok) return fail(422);

    const row = await findPublicByCode(this.deps.pool, n.code);
    if (!row) return fail(404);

    const today = svDate(this.now());
    const body: QuoteLoadResponse = {
      code: row.code,
      createdAt: svDate(new Date(`${row.createdAt.replace(' ', 'T')}Z`)),
      validUntil: row.validUntil,
      expired: row.validUntil < today,
      currency: 'USD',
      delivery: { mode: row.deliveryMode, zone: row.deliveryZone },
      items: row.items.map((it) => ({
        position: it.position,
        productSlug: it.productSlug,
        description: it.description,
        qty: it.qty,
        savedUnitPrice: centsToNumber(decimalToCents(it.unitPrice)),
        savedLineTotal: centsToNumber(decimalToCents(it.lineTotal)),
        promoRef: it.promoRef,
        configSchemaVersion: it.configSchemaVersion,
        config: (typeof it.config === 'string' ? JSON.parse(it.config) : it.config) as Record<string, unknown>,
      })),
      saved: {
        subtotal: centsToNumber(decimalToCents(row.subtotal)),
        transportFee: centsToNumber(decimalToCents(row.transportFee)),
        total: centsToNumber(decimalToCents(row.total)),
      },
    };
    return { result: 'ok', body, codeKey: n.code };
  }
}
