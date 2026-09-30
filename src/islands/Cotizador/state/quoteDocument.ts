// R4 — pure mapper OrderLineItem[] -> QuoteDocument (PDF) / folio request.
// `detail` formats come from state/quote.ts buildLineItem (split on " · "):
//   "0.90 × 1.85 m · Negro · Templado 10 mm[ · Cant. 2]"   (recta/bisagra/jardín)
//   "0.80 × 0.80 × 1.85 m · Modelo · Color"                (L)
//   "3 ventanas · Color · Vidrio"                          (ventana: no single size)
import type { QuoteDocument, QuoteDocumentItem } from '../../../lib/quote-pdf/types';
import type { QuoteFolioRequest } from '../../../lib/quote-folio';
import type { OrderLineItem } from './order';

const SEP = ' · ';
const METRES = /^\d+(?:\.\d+)?(?: × \d+(?:\.\d+)?)+ m$/;
const QTY = /^Cant\. (\d+)$/;

/** "0.90 × 1.85 m" -> "90 × 185" (cm, no unit: the PDF header and the chat text add it). */
export function metresToCm(part: string): string {
  return part
    .replace(/ m$/, '')
    .split(' × ')
    .map((n) => String(Math.round(Number(n) * 100)))
    .join(' × ');
}

export function toQuoteDocumentItem(item: OrderLineItem): QuoteDocumentItem {
  const parts = item.detail.split(SEP);
  let measures = '';
  if (parts[0] && METRES.test(parts[0])) measures = metresToCm(parts.shift() as string);
  let qty = 1;
  const last = parts[parts.length - 1];
  const m = last ? QTY.exec(last) : null;
  if (m) {
    qty = Number(m[1]);
    parts.pop();
  }
  if (item.requiresQuote) parts.push('Por cotizar');
  return { name: item.name, variant: parts.join(SEP), measures, qty, price: item.requiresQuote ? 0 : item.subtotal };
}

export interface QuoteDocumentInput {
  folio: string;
  issuedAt: Date;
  items: readonly OrderLineItem[];
  entrega: 'instalacion' | 'retiro';
  zone: string;
  transport: number;
  total: number;
}

export function toQuoteDocument(i: QuoteDocumentInput): QuoteDocument {
  const delivery = i.entrega === 'instalacion';
  return {
    folio: i.folio,
    issuedAt: i.issuedAt,
    customer: delivery ? { zone: i.zone } : {},
    items: i.items.map(toQuoteDocumentItem),
    ...(delivery ? { transportLabel: i.zone } : {}),
    transport: i.transport,
    total: i.total,
  };
}

/** Provisional contract (senior-be has not published quote-create yet). */
export function toFolioRequest(i: Omit<QuoteDocumentInput, 'folio' | 'issuedAt'>, idempotencyKey: string): QuoteFolioRequest {
  return {
    idempotencyKey,
    customer: {},
    delivery: { mode: i.entrega === 'instalacion' ? 'delivery' : 'pickup', ...(i.entrega === 'instalacion' ? { zone: i.zone } : {}) },
    items: i.items.map((it) => {
      const d = toQuoteDocumentItem(it);
      return { productSlug: it.productId, description: [d.name, d.variant, d.measures && `${d.measures} cm`].filter(Boolean).join(SEP), qty: d.qty, unitPrice: d.price / d.qty, lineTotal: d.price };
    }),
    transportFee: i.transport,
    total: i.total,
  };
}

/** Stable key for the prewarm cache and the idempotency key. */
export function cartHash(i: Omit<QuoteDocumentInput, 'folio' | 'issuedAt'>): string {
  const s = JSON.stringify([i.items.map((x) => [x.id, x.productId, x.detail, x.subtotal, x.requiresQuote]), i.entrega, i.zone, i.transport, i.total]);
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) | 0;
  return (h >>> 0).toString(36);
}
