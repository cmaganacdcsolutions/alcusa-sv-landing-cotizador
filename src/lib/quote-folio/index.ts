// Quote folio providers (ADR-010 §4, ADR-011 §5 final contract, ADR-012 §2, ADR-003 error envelope).
// Selected by PUBLIC_QUOTE_API = mock | http (same env name as the R5 agent).
//   mock -> scripted provider (sessionStorage 'alcusa.mock.quote' picks an error state for e2e)
//           wrapped with the same contingency rules as http
//   http -> POST quote-create; timeout/network/5xx fall back to a local U folio, 4xx propagates.

import { LOADED_FROM_KEY, QUOTE_CODE_ALPHABET, makeQuoteCode, normalizeQuoteCode } from '../../integrations/quotes/code';
import { saveMockQuote } from '../../integrations/quotes/mockStore';

export const CROCKFORD = QUOTE_CODE_ALPHABET;
export const QUOTE_CREATE_PATH = '/api/quote-create';
export const QUOTE_CREATE_TIMEOUT_MS = 4000;
/** Contingency marker: 'U' is not in the Crockford alphabet and no normalization rule corrects it (ADR-011 §5). */
export const CONTINGENCY_MARKER = 'U';
/** R5 (QuoteLoadBlock) writes the folio of a quote loaded by code here; read-only for us. Same key, asserted in folio.test.ts. */
export { LOADED_FROM_KEY };
export const MOCK_SCENARIO_KEY = 'alcusa.mock.quote';
/** e2e: artificial latency (ms) so the H3/E3 "enviando" state is observable. */
export const MOCK_DELAY_KEY = 'alcusa.mock.quote-delay';
export const CONFIG_SCHEMA_VERSION = 1;
export const CONFIG_MAX_BYTES = 4096;

/** USD decimals, at most 2 (19.99). Never integer cents. */
export type Money = number;

export interface QuoteFolioItem {
  productSlug: string;
  description: string;
  qty: number;
  unitPrice: Money;
  lineTotal: Money;
  /** Full CartItem snapshot without `id`, <= 4 KB. */
  config: Record<string, unknown>;
  configSchemaVersion: number;
  promoRef: string | null;
}

export interface QuoteDiscount {
  code: 'online_card_10';
  amount: Money;
}

export interface QuoteFolioRequest {
  /** UUIDv4; a new key for any change of cart, delivery or customer data. */
  idempotencyKey: string;
  /** Previous canonical or loaded folio; only links. */
  supersedesCode?: string;
  customer: { name: string; whatsapp: string; email?: string };
  delivery: { mode: 'pickup' | 'delivery'; zone?: string; address?: string };
  items: QuoteFolioItem[];
  transportFee: Money;
  /** Distrito sin tarifa: transportFee es 0 y el envio se confirma por WhatsApp (senior-be lo acepta server-side). */
  shippingPending?: boolean;
  /** 10% online-card discount; only when the customer already chose card. total = sum(items) - discount.amount + transportFee. */
  discount?: QuoteDiscount;
  /** Contexto promo (`?promo=<id>`): sin 10%; el server rechaza discount + promoId. */
  promoId?: string;
  total: Money;
  consent: true;
  privacyNoticeVersion: string;
}

/** What the server answers: 201 new | 200 same idempotencyKey. */
export interface QuoteFolioResponse {
  code: string;
  validUntil: string;
  total: Money;
}

export interface QuoteFolio {
  /** ALC-AAAAMMDD-XXXXXXXX (server) or ALC-AAAAMMDD-U???????? (local contingency). */
  code: string;
  /** Only server folios carry it. */
  validUntil?: string;
  total?: Money;
  source: 'server' | 'local';
}

export interface QuoteFolioProvider {
  issue(req: QuoteFolioRequest): Promise<QuoteFolio>;
}

// ---- ADR-003 error envelope -------------------------------------------------
export type QuoteFolioErrorCode =
  | 'invalid_request'
  | 'invalid_customer'
  | 'consent_required'
  | 'invalid_discount'
  | 'idempotency_conflict'
  | 'payload_too_large'
  | 'rate_limited'
  | 'server_error';
export type QuoteFolioFieldIssue = 'required' | 'invalid' | 'too_short' | 'too_long';
export interface QuoteFolioError {
  error: { code: QuoteFolioErrorCode; message: string; fields?: Record<string, QuoteFolioFieldIssue> };
}

export class QuoteFolioApiError extends Error {
  readonly status: number;
  readonly code: QuoteFolioErrorCode;
  readonly fields: Readonly<Record<string, QuoteFolioFieldIssue>>;
  readonly retryAfter?: number;
  constructor(status: number, code: QuoteFolioErrorCode, message: string, fields: Record<string, QuoteFolioFieldIssue> = {}, retryAfter?: number) {
    super(message);
    this.name = 'QuoteFolioApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

/** 4xx the server uses on purpose (422/409/413/429 + 400): they never fall back to contingency. */
export const PROPAGATED_STATUSES: readonly number[] = [400, 409, 413, 422, 429];
export function isClientError(err: unknown): err is QuoteFolioApiError {
  return err instanceof QuoteFolioApiError && PROPAGATED_STATUSES.includes(err.status);
}

// ---- codes ------------------------------------------------------------------
/** Single contingency detector: r5's normalizeQuoteCode (suffix starts with `U`, ADR-012 §4). */
export function isContingencyFolio(code: string): boolean {
  const r = normalizeQuoteCode(code);
  return !r.ok && r.reason === 'contingency';
}

/** Previous/loaded folio worth linking as supersedesCode (never a contingency one: it is not in the DB). */
export function readLoadedFromCode(storage: Pick<Storage, 'getItem'> | null = safeSession()): string | undefined {
  try {
    const raw = storage?.getItem(LOADED_FROM_KEY);
    if (!raw) return undefined;
    const v = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
    const n = normalizeQuoteCode(v);
    return n.ok ? n.code : undefined;
  } catch {
    return undefined;
  }
}

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
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
      return Promise.resolve({ code: `ALC-${svDateStamp(now())}-${CONTINGENCY_MARKER}${suffix}`, source: 'local' });
    },
  };
}

// ---- http adapter -----------------------------------------------------------
export interface ServerFolioDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function parseResponse(body: unknown): QuoteFolioResponse {
  const b = body as Partial<QuoteFolioResponse> | null;
  // Canonical server folio only: shape + check digit (normalizeQuoteCode); contingency (`U`) is rejected.
  const norm = b && typeof b.code === 'string' ? normalizeQuoteCode(b.code) : null;
  if (!b || !norm || !norm.ok || norm.code !== b.code) throw new Error('quote-create: invalid code');
  if (typeof b.validUntil !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.validUntil)) throw new Error('quote-create: invalid validUntil');
  if (typeof b.total !== 'number' || !Number.isFinite(b.total)) throw new Error('quote-create: invalid total');
  return { code: b.code, validUntil: b.validUntil, total: b.total };
}

async function readEnvelope(res: Response): Promise<QuoteFolioApiError> {
  let env: Partial<QuoteFolioError> | null = null;
  try {
    env = (await res.json()) as Partial<QuoteFolioError>;
  } catch {
    /* non-JSON body */
  }
  const e = env?.error;
  const code: QuoteFolioErrorCode = e?.code ?? (res.status >= 500 ? 'server_error' : 'invalid_request');
  const ra = Number(res.headers?.get?.('Retry-After'));
  return new QuoteFolioApiError(res.status, code, e?.message ?? `quote-create ${res.status}`, e?.fields, Number.isFinite(ra) && ra > 0 ? ra : undefined);
}

/** Adapter for POST /api/quote-create. Throws QuoteFolioApiError on non-2xx, any other Error on timeout/network/bad body. */
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
          body: JSON.stringify({ ...req, hp: '' }),
          signal: ctl.signal,
        });
        if (res.status !== 200 && res.status !== 201) throw await readEnvelope(res); // 200 and 201 are alike
        const ok = parseResponse(await res.json());
        return { ...ok, source: 'server' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// ---- mock adapter (e2e can reach every error state) -------------------------
export type MockScenario =
  | 'ok'
  | 'invalid_customer'
  | 'consent_required'
  | 'rate_limited'
  | 'idempotency_conflict'
  | 'payload_too_large'
  | 'server_error';

const MOCK_ERRORS: Record<Exclude<MockScenario, 'ok'>, () => QuoteFolioApiError> = {
  invalid_customer: () =>
    new QuoteFolioApiError(422, 'invalid_customer', 'Revisa tus datos.', { 'customer.name': 'invalid', 'customer.whatsapp': 'invalid' }),
  consent_required: () => new QuoteFolioApiError(422, 'consent_required', 'Falta el consentimiento.', { consent: 'required' }),
  rate_limited: () => new QuoteFolioApiError(429, 'rate_limited', 'Demasiadas solicitudes.', {}, 60),
  idempotency_conflict: () => new QuoteFolioApiError(409, 'idempotency_conflict', 'Clave repetida con otro carrito.'),
  payload_too_large: () => new QuoteFolioApiError(413, 'payload_too_large', 'Cotización demasiado grande.'),
  server_error: () => new QuoteFolioApiError(503, 'server_error', 'Servicio no disponible.'),
};

export function readMockScenario(storage: Pick<Storage, 'getItem'> | null = safeSession()): MockScenario {
  try {
    const v = storage?.getItem(MOCK_SCENARIO_KEY);
    return v && v in MOCK_ERRORS ? (v as MockScenario) : 'ok';
  } catch {
    return 'ok';
  }
}

function readMockDelay(): number {
  try {
    const n = Number(safeSession()?.getItem(MOCK_DELAY_KEY));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 0;
  } catch {
    return 0;
  }
}

/** Succeeds with a canonical-looking server folio, or throws the scripted error. */
export function createMockFolioProvider(scenario: () => MockScenario = readMockScenario, deps: LocalFolioDeps = {}): QuoteFolioProvider {
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));
  return {
    async issue(req: QuoteFolioRequest): Promise<QuoteFolio> {
      const wait = readMockDelay();
      if (wait) await new Promise((r) => setTimeout(r, wait));
      const s = scenario();
      if (s !== 'ok') throw MOCK_ERRORS[s]();
      // DEV-ONLY stand-in for B3: a canonical folio (valid check digit) whose snapshot is kept in
      // localStorage so the mock QuoteClient can load it back. Contingency (U) folios come only from
      // the withContingency fallback (scenario 'server_error'), never from the 'ok' scenario.
      const at = now();
      const body = Array.from(random(7), (b) => CROCKFORD[b % 32]).join('');
      const code = makeQuoteCode(svDateStamp(at), body);
      saveMockQuote({ code, now: at, delivery: req.delivery, items: req.items, transportFee: req.transportFee, total: req.total });
      return { code, validUntil: new Date(at.getTime() + 15 * 86_400_000).toISOString().slice(0, 10), total: req.total, source: 'server' };
    },
  };
}

/** ADR-011 §5: timeout/network/5xx => local contingency folio; 4xx (422/409/413/429) propagates with `fields`. */
export function withContingency(primary: QuoteFolioProvider, fallback: QuoteFolioProvider): QuoteFolioProvider {
  return {
    async issue(req) {
      try {
        return await primary.issue(req);
      } catch (err) {
        if (isClientError(err)) throw err;
        return fallback.issue(req);
      }
    },
  };
}

export type QuoteApiMode = 'mock' | 'http';

// Same rule as resolveQuoteApiMode (@integrations/quotes): the env wins, otherwise http in prod and mock in dev/test,
// so a prod build never issues mock folios that the http loader can't find.
export function quoteApiMode(raw: string | undefined, isProd = false): QuoteApiMode {
  if (raw === 'mock' || raw === 'http') return raw;
  return isProd ? 'http' : 'mock';
}

export function createQuoteFolioProvider(
  mode: QuoteApiMode = quoteApiMode(import.meta.env.PUBLIC_QUOTE_API, import.meta.env.PROD),
): QuoteFolioProvider {
  const local = createLocalFolioProvider();
  return withContingency(mode === 'http' ? createServerFolioProvider() : createMockFolioProvider(), local);
}
