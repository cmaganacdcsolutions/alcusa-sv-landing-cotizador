// Quote folio providers (ADR-010 §4, ADR-011 §5, ADR-012 §2/§4).
// Selected by PUBLIC_QUOTE_API = mock | http (same env name as the R5 agent).
//   mock -> local contingency folio (prefix L in the 8-char suffix, never in DB)
//   http -> POST quote-create; on timeout/5xx/network falls back to local.

export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const QUOTE_CREATE_PATH = '/api/quote-create.php';
export const QUOTE_CREATE_TIMEOUT_MS = 4000;

export interface QuoteFolioItem {
  productSlug: string;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface QuoteFolioRequest {
  idempotencyKey: string;
  customer: { name?: string; phone?: string; email?: string };
  delivery: { mode: 'pickup' | 'delivery'; zone?: string };
  items: QuoteFolioItem[];
  transportFee: number;
  total: number;
}

export interface QuoteFolio {
  /** ALC-AAAAMMDD-XXXXXXXX (server) or ALC-AAAAMMDD-L???????? (local). */
  code: string;
  validUntil?: string;
  source: 'server' | 'local';
}

export interface QuoteFolioProvider {
  issue(req: QuoteFolioRequest): Promise<QuoteFolio>;
}

export function isContingencyFolio(code: string): boolean {
  return /^ALC-\d{8}-L[0-9A-HJKMNP-TV-Z]{7}$/.test(code);
}

function svDateStamp(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p.replaceAll('-', '');
}

export interface LocalFolioDeps {
  now?: () => Date;
  random?: (n: number) => Uint8Array;
}

export function createLocalFolioProvider(deps: LocalFolioDeps = {}): QuoteFolioProvider {
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));
  return {
    issue(): Promise<QuoteFolio> {
      const suffix = Array.from(random(7), (b) => CROCKFORD[b % 32]).join('');
      return Promise.resolve({ code: `ALC-${svDateStamp(now())}-L${suffix}`, source: 'local' });
    },
  };
}

export interface ServerFolioDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Adapter for POST /api/quote-create.php. NOT deployed yet: throws on any non-2xx so callers can fall back. */
export function createServerFolioProvider(deps: ServerFolioDeps = {}): QuoteFolioProvider {
  const doFetch = deps.fetchImpl ?? fetch;
  return {
    async issue(req: QuoteFolioRequest): Promise<QuoteFolio> {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), deps.timeoutMs ?? QUOTE_CREATE_TIMEOUT_MS);
      try {
        const res = await doFetch(QUOTE_CREATE_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...req, consent: true, hp: '' }),
          signal: ctl.signal,
        });
        if (!res.ok) throw new Error(`quote-create ${res.status}`);
        const body = (await res.json()) as { code?: string; validUntil?: string };
        if (!body.code) throw new Error('quote-create: missing code');
        return { code: body.code, ...(body.validUntil ? { validUntil: body.validUntil } : {}), source: 'server' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** ADR-011 §5: API down => local contingency folio, never block the quote. */
export function withContingency(primary: QuoteFolioProvider, fallback: QuoteFolioProvider): QuoteFolioProvider {
  return {
    async issue(req) {
      try {
        return await primary.issue(req);
      } catch {
        return fallback.issue(req);
      }
    },
  };
}

export type QuoteApiMode = 'mock' | 'http';

export function quoteApiMode(raw: string | undefined): QuoteApiMode {
  return raw === 'http' ? 'http' : 'mock';
}

export function createQuoteFolioProvider(mode: QuoteApiMode = quoteApiMode(import.meta.env.PUBLIC_QUOTE_API)): QuoteFolioProvider {
  const local = createLocalFolioProvider();
  return mode === 'http' ? withContingency(createServerFolioProvider(), local) : local;
}
