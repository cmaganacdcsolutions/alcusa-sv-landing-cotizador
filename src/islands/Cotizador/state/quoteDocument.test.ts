import { describe, expect, it } from 'vitest';
import type { OrderLineItem } from './order';
import { cartHash, metresToCm, toFolioRequest, toQuoteDocument, toQuoteDocumentItem } from './quoteDocument';

const line = (detail: string, o: Partial<OrderLineItem> = {}): OrderLineItem => ({
  id: 'a', productId: 'recta', name: 'Puerta de baño recta', detail, subtotal: 222, requiresQuote: false, ...o,
});

describe('quoteDocument mapper', () => {
  it('converts metres to cm without unit', () => {
    expect(metresToCm('0.90 × 1.85 m')).toBe('90 × 185');
    expect(metresToCm('0.80 × 0.80 × 1.85 m')).toBe('80 × 80 × 185');
    expect(metresToCm('1.10 × 1.85 m')).toBe('110 × 185');
  });
  it('splits detail on " · " into measures / variant / qty', () => {
    expect(toQuoteDocumentItem(line('1.10 × 1.85 m · Natural · Claro 5 mm'))).toEqual({
      name: 'Puerta de baño recta', variant: 'Natural · Claro 5 mm', measures: '110 × 185', qty: 1, price: 222,
    });
    const hinged = toQuoteDocumentItem(line('0.90 × 1.85 m · Negro · Templado · Cant. 2'));
    expect(hinged.qty).toBe(2);
    expect(hinged.variant).toBe('Negro · Templado');
  });
  it('keeps window summaries whole (no single size) and flags quote-only items at $0', () => {
    expect(toQuoteDocumentItem(line('3 ventanas · Blanco · Claro')).measures).toBe('');
    const q = toQuoteDocumentItem(line('1.00 × 1.85 m · Mate · Claro', { requiresQuote: true, subtotal: 0 }));
    expect(q.price).toBe(0);
    expect(q.variant).toBe('Mate · Claro · Por cotizar');
  });
  it('builds the document, folio request and a stable hash', () => {
    const base = { items: [line('1.10 × 1.85 m · Natural · Claro 5 mm')], entrega: 'instalacion' as const, zone: 'Soyapango', transport: 40, total: 262 };
    const doc = toQuoteDocument({ ...base, folio: 'ALC-20260929-L0000000', issuedAt: new Date('2026-09-29T18:00:00Z') });
    expect(doc.transportLabel).toBe('Soyapango');
    expect(doc.customer).toEqual({ zone: 'Soyapango' });
    expect(toFolioRequest(base, 'k').delivery).toEqual({ mode: 'delivery', zone: 'Soyapango' });
    expect(cartHash(base)).toBe(cartHash({ ...base }));
    expect(cartHash(base)).not.toBe(cartHash({ ...base, total: 263 }));
    const pickup = toQuoteDocument({ ...base, entrega: 'retiro', folio: 'x', issuedAt: new Date() });
    expect(pickup.transportLabel).toBeUndefined();
  });
});
