// DEV-ONLY (PUBLIC_QUOTE_API=mock). Interim stand-in for B3 (persist) + B6 (GET /api/quotes/{code}):
// the mock folio provider saves the snapshot of every quote it issues here, and the mock QuoteClient
// reads it back before its fixtures. Disappears with PUBLIC_QUOTE_API=http (neither caller is used).
// Shape = what B3 must persist and B6 must return (QuoteLoadResponse, ADR-012 §3). NO PII: GET returns
// none (ADR-012), so name/whatsapp/address are never stored.
import { QUOTE_VALIDITY_DAYS } from './code';
import type { QuoteLoadItem, QuoteLoadResponse } from './types';

export const MOCK_QUOTES_KEY = 'alcusa.mock.quotes.v1';
export const MOCK_QUOTES_MAX = 20;
const DAY_MS = 86_400_000;

export interface MockQuoteInput {
  code: string;
  now: Date;
  delivery: { mode: 'pickup' | 'delivery'; zone?: string };
  items: ReadonlyArray<{
    productSlug: string;
    description: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    config: Record<string, unknown>;
    configSchemaVersion: number;
    promoRef: string | null;
  }>;
  transportFee: number;
  total: number;
}

type Stored = Omit<QuoteLoadResponse, 'expired'>;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readAll(st: Storage): Stored[] {
  try {
    const raw = st.getItem(MOCK_QUOTES_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as Stored[]) : [];
  } catch {
    return [];
  }
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Saves the snapshot (newest last, capped at MOCK_QUOTES_MAX, oldest dropped). Never throws. */
export function saveMockQuote(q: MockQuoteInput): void {
  try {
    const st = storage();
    if (!st) return;
    const items: QuoteLoadItem[] = q.items.map((it, position) => ({
      position,
      productSlug: it.productSlug,
      description: it.description,
      qty: it.qty,
      savedUnitPrice: it.unitPrice,
      savedLineTotal: it.lineTotal,
      promoRef: it.promoRef,
      configSchemaVersion: it.configSchemaVersion,
      config: it.config,
    }));
    const entry: Stored = {
      code: q.code,
      createdAt: isoDay(q.now),
      validUntil: isoDay(new Date(q.now.getTime() + QUOTE_VALIDITY_DAYS * DAY_MS)),
      currency: 'USD',
      delivery: { mode: q.delivery.mode, zone: q.delivery.zone ?? null },
      items,
      saved: { subtotal: q.total - q.transportFee, transportFee: q.transportFee, total: q.total },
    };
    const all = readAll(st).filter((e) => e.code !== entry.code);
    all.push(entry);
    st.setItem(MOCK_QUOTES_KEY, JSON.stringify(all.slice(-MOCK_QUOTES_MAX)));
  } catch {
    /* quota / private mode: the quote just won't be loadable */
  }
}

/** Looks a canonical code up; `expired` is derived from validUntil. Null when unknown. */
export function loadMockQuote(code: string, now: Date = new Date()): QuoteLoadResponse | null {
  try {
    const st = storage();
    if (!st) return null;
    const e = readAll(st).find((x) => x && x.code === code);
    if (!e) return null;
    return { ...e, expired: isoDay(now) > e.validUntil };
  } catch {
    return null;
  }
}
