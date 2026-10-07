import { describe, expect, it } from 'vitest';
import type { OrderLineItem } from './order';
import { cartHash, metresToCm, toFolioItem, toFolioRequest, toQuoteDocument, toQuoteDocumentItem } from './quoteDocument';

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
  it('keeps money at <= 2 decimals and lineTotal == qty * unitPrice', () => {
    const cust = { name: 'Ana', whatsapp: '+50371234567' };
    const base = { entrega: 'retiro' as const, zone: '', transport: 0, total: 100 };
    const d = '0.90 × 1.85 m · Negro · Templado 10 mm · Cant. 3';
    const even = toFolioRequest({ ...base, items: [line(d, { subtotal: 100.5 })] }, cust, 'k').items[0]!;
    expect(even).toMatchObject({ qty: 3, unitPrice: 33.5, lineTotal: 100.5 });
    const odd = toFolioRequest({ ...base, items: [line(d, { subtotal: 100 })] }, cust, 'k').items[0]!;
    expect(odd).toMatchObject({ qty: 1, unitPrice: 100, lineTotal: 100 });
    expect(odd.description).toContain('(x3)');
  });
  it('measures the config 4 KB guard in bytes (server returns 413 on bytes)', () => {
    const multi = { note: 'ñ'.repeat(2100) }; // ~2.1k chars but ~4.2k bytes
    expect(JSON.stringify(multi).length).toBeLessThan(4096);
    expect(() => toFolioItem(line('1.10 × 1.85 m · Natural'), multi)).toThrow(/exceeds 4096 bytes/);
    expect(() => toFolioItem(line('1.10 × 1.85 m · Natural'), { note: 'n'.repeat(2100) })).not.toThrow();
  });
  it('builds the document, folio request and a stable hash', () => {
    const base = { items: [line('1.10 × 1.85 m · Natural · Claro 5 mm')], entrega: 'instalacion' as const, zone: 'Soyapango', transport: 40, total: 262 };
    const doc = toQuoteDocument({ ...base, folio: 'ALC-20260929-U0000000', issuedAt: new Date('2026-09-29T18:00:00Z') });
    expect(doc.transportLabel).toBe('Soyapango');
    expect(doc.customer).toEqual({ zone: 'Soyapango' });
    const cust = { name: 'María López', whatsapp: '+50371234567' };
    const fr = toFolioRequest({ ...base, configs: { a: { productId: 'recta', width: '110' } } }, cust, 'k', 'ALC-20260929-K7QM3X90');
    expect(fr.delivery).toEqual({ mode: 'delivery', zone: 'Soyapango' });
    expect(fr).toMatchObject({ customer: cust, consent: true, privacyNoticeVersion: '2026-10-v1', supersedesCode: 'ALC-20260929-K7QM3X90', transportFee: 40, total: 262 });
    expect(fr.items[0]).toMatchObject({ productSlug: 'recta', qty: 1, unitPrice: 222, lineTotal: 222, config: { productId: 'recta', width: '110' }, configSchemaVersion: 1, promoRef: null });
    expect(toFolioRequest(base, cust, 'k').supersedesCode).toBeUndefined();
    const withCust = toQuoteDocument({ ...base, customer: cust, folio: 'x', issuedAt: new Date() });
    expect(withCust.customer).toEqual({ name: 'María López', whatsapp: '+503 7123-4567', zone: 'Soyapango' });
    expect(cartHash(base)).toBe(cartHash({ ...base }));
    expect(cartHash(base)).not.toBe(cartHash({ ...base, total: 263 }));
    const pickup = toQuoteDocument({ ...base, entrega: 'retiro', folio: 'x', issuedAt: new Date() });
    expect(pickup.transportLabel).toBeUndefined();
  });

  it('shippingPending / discount: opcionales, solo viajan cuando existen (folio sin descuento por defecto)', () => {
    const cust = { name: 'Ana', whatsapp: '+50371234567' };
    const base = { items: [line('1.10 × 1.85 m · Natural · Claro 5 mm')], entrega: 'instalacion' as const, zone: 'otro', transport: 0, total: 222 };
    const plain = toFolioRequest(base, cust, 'k');
    expect(plain).not.toHaveProperty('shippingPending');
    expect(plain).not.toHaveProperty('discount');
    expect(toQuoteDocument({ ...base, folio: 'x', issuedAt: new Date() })).not.toHaveProperty('discount');

    const pending = { ...base, shippingPending: true };
    expect(toFolioRequest(pending, cust, 'k')).toMatchObject({ shippingPending: true, transportFee: 0, total: 222 });
    expect(toQuoteDocument({ ...pending, folio: 'x', issuedAt: new Date() }).shippingPending).toBe(true);
    expect(cartHash(pending)).not.toBe(cartHash(base));

    const withDiscount = { ...base, total: 199.8, discount: { code: 'online_card_10' as const, amount: 22.2 } };
    expect(toFolioRequest(withDiscount, cust, 'k')).toMatchObject({ discount: { code: 'online_card_10', amount: 22.2 }, total: 199.8 });
    expect(toQuoteDocument({ ...withDiscount, folio: 'x', issuedAt: new Date() }).discount).toBe(22.2);
  });
});
