// R4 — pure mapper OrderLineItem[] -> QuoteDocument (PDF) / folio request.
// `detail` formats come from state/quote.ts buildLineItem (split on " · "):
//   "0.90 × 1.85 m · Negro · Templado 10 mm[ · Cant. 2]"   (recta/bisagra/jardín)
//   "0.80 × 0.80 × 1.85 m · Modelo · Color"                (L)
//   "3 ventanas · Color · Vidrio"                          (ventana: no single size)
import type { QuoteDocument, QuoteDocumentItem } from '../../../lib/quote-pdf/types';
import {
  CONFIG_MAX_BYTES,
  CONFIG_SCHEMA_VERSION,
  type QuoteDiscount,
  type QuoteFolioItem,
  type QuoteFolioRequest,
} from '../../../lib/quote-folio';
import { formatWhatsappPrint, PRIVACY_NOTICE_VERSION, type CustomerData } from '../../../lib/quote-customer';
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
  /** CartItem snapshot (without `id`) per OrderLineItem.id; goes to the server as `config` (ADR-012 §2). */
  configs?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  entrega: 'instalacion' | 'retiro';
  zone: string;
  /** Direccion de entrega ya formateada (formatAddressLine); solo instalacion. */
  address?: string;
  transport: number;
  total: number;
  /** Distrito sin tarifa: `transport` es 0 y se muestra "Por confirmar". */
  shippingPending?: boolean;
  /** 10% online-card discount; only present once the customer chose card (the folio is normally issued before). */
  discount?: QuoteDiscount;
  /** Contexto promo: viaja como `promoId` y como `promoRef` de cada item (carga por folio restaura el contexto). */
  promoId?: string | null;
  customer?: CustomerData;
}

export function toQuoteDocument(i: QuoteDocumentInput): QuoteDocument {
  const delivery = i.entrega === 'instalacion';
  return {
    folio: i.folio,
    issuedAt: i.issuedAt,
    customer: {
      ...(i.customer ? { name: i.customer.name, whatsapp: formatWhatsappPrint(i.customer.whatsapp) } : {}),
      ...(delivery ? { zone: i.zone } : {}),
    },
    items: i.items.map(toQuoteDocumentItem),
    ...(delivery ? { transportLabel: i.zone } : {}),
    transport: i.transport,
    total: i.total,
    ...(i.shippingPending ? { shippingPending: true } : {}),
    ...(i.discount ? { discount: i.discount.amount } : {}),
  };
}

/** USD decimals with at most 2 decimals (never integer cents). */
export const usd = (n: number): number => Math.round(n * 100) / 100;

export function toFolioItem(it: OrderLineItem, config: Readonly<Record<string, unknown>> = {}, promoRef: string | null = null): QuoteFolioItem {
  const d = toQuoteDocumentItem(it);
  const cents = Math.round(d.price * 100);
  // lineTotal must equal qty * unitPrice in cents: if the split is not exact, send one line of qty 1.
  const exact = d.qty >= 1 && cents % d.qty === 0;
  const qty = exact ? d.qty : 1;
  const description = [d.name, d.variant, d.measures && `${d.measures} cm`].filter(Boolean).join(SEP);
  const snapshot = { ...config };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > CONFIG_MAX_BYTES) throw new Error(`config of ${it.productId} exceeds ${CONFIG_MAX_BYTES} bytes`);
  return {
    productSlug: it.productId,
    description: (exact || d.qty === 1 ? description : `${description} (x${d.qty})`).slice(0, 255),
    qty,
    unitPrice: usd(cents / qty / 100),
    lineTotal: usd(cents / 100),
    config: snapshot,
    configSchemaVersion: CONFIG_SCHEMA_VERSION,
    promoRef,
  };
}

/** ADR-011 §5 final contract. `idempotencyKey` is a UUIDv4 owned by the caller. */
export function toFolioRequest(
  i: Omit<QuoteDocumentInput, 'folio' | 'issuedAt' | 'customer'>,
  customer: CustomerData,
  idempotencyKey: string,
  supersedesCode?: string,
): QuoteFolioRequest {
  return {
    idempotencyKey,
    ...(supersedesCode ? { supersedesCode } : {}),
    customer: { name: customer.name, whatsapp: customer.whatsapp },
    delivery: { mode: i.entrega === 'instalacion' ? 'delivery' : 'pickup', ...(i.entrega === 'instalacion' ? { zone: i.zone, ...(i.address ? { address: i.address } : {}) } : {}) },
    items: i.items.map((it) => toFolioItem(it, i.configs?.[it.id], i.promoId ?? null)),
    transportFee: usd(i.transport),
    ...(i.shippingPending ? { shippingPending: true } : {}),
    ...(i.discount ? { discount: { code: i.discount.code, amount: usd(i.discount.amount) } } : {}),
    ...(i.promoId ? { promoId: i.promoId } : {}),
    total: usd(i.total),
    consent: true,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
  };
}

/** Stable key for the prewarm cache and the idempotency key. */
export function cartHash(i: Omit<QuoteDocumentInput, 'folio' | 'issuedAt' | 'customer' | 'configs'>): string {
  const s = JSON.stringify([i.items.map((x) => [x.id, x.productId, x.detail, x.subtotal, x.requiresQuote]), i.entrega, i.zone, i.address ?? '', i.transport, i.total, ...(i.shippingPending ? ['pending'] : []), ...(i.promoId ? ['promo:' + i.promoId] : [])]);
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) | 0;
  return (h >>> 0).toString(36);
}
