import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderQuotePdf } from './quote-pdf/render';
import { pendingCompanyData } from './quote-pdf/config';
import { quoteFileName } from './quote-pdf/format';
import type { QuoteDocument, QuotePdfAssets } from './quote-pdf/types';
import {
  createLocalFolioProvider,
  createServerFolioProvider,
  isContingencyFolio,
  quoteApiMode,
  withContingency,
  type QuoteFolioRequest,
} from './quote-folio';
import { buildQuoteShareMessage, chooseDelivery, runShare, WA_ENCODED_BUDGET } from './quote-share';

const read = (p: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../../public/${p}`, import.meta.url)));
const assets: QuotePdfAssets = {
  fonts: {
    fraunces600: read('fonts/pdf/fraunces-latin-600-normal.ttf'),
    manrope400: read('fonts/pdf/manrope-latin-400-normal.ttf'),
    manrope700: read('fonts/pdf/manrope-latin-700-normal.ttf'),
  },
  logoPng: read('brand/pdf-logo.png'),
};
const doc: QuoteDocument = {
  folio: 'ALC-20260929-K7QM3X90',
  issuedAt: new Date('2026-09-29T18:00:00Z'),
  customer: { name: 'María Fernanda López', whatsapp: '+503 7000-0000', zone: 'Soyapango' },
  items: [
    { name: 'Puerta en L', variant: 'Aquaclara', measures: '80 × 180', qty: 1, price: 444 },
    { name: 'Puerta de jardín 2 hojas', variant: 'Aquaclara', measures: '150 × 210', qty: 1, price: 819 },
  ],
  transportLabel: 'Soyapango',
  transport: 30,
  total: 1293,
};

describe('quote pdf', () => {
  it('builds a selectable-text A4 pdf, byte-stable, under 500 KB', async () => {
    const a = await renderQuotePdf(doc, assets);
    const b = await renderQuotePdf(doc, assets);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a.slice(0, 5)).toString()).toBe('%PDF-');
    expect(a.length).toBeLessThan(500 * 1024);
    const raw = Buffer.from(a).toString('latin1');
    expect(raw).toContain('/MediaBox [ 0 0 595.28 841.89 ]');
    expect(raw).toContain('/Lang (es-SV)');
  }, 30_000);
  it('paginates >5 items with n/N footer and works with Helvetica fallback', async () => {
    const many = { ...doc, items: Array.from({ length: 12 }, (_, i) => ({ ...doc.items[0]!, name: `Producto ${i} con un nombre largo que envuelve a dos lineas` })) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bytes = await renderQuotePdf(many);
    warn.mockRestore();
    expect(Buffer.from(bytes).toString('latin1').match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
  });
  it('file name matches ADR-009/012 regex and pending data is listed', () => {
    expect(quoteFileName(doc.folio)).toMatch(/^Cotizacion-ALC-\d{8}-[0-9A-HJKMNP-TV-Z]{8}\.pdf$/);
    expect(pendingCompanyData()).toEqual(['validityDays', 'ivaNote']);
  });
});

const req: QuoteFolioRequest = {
  idempotencyKey: 'k', customer: { name: 'María López', whatsapp: '+50371234567' }, delivery: { mode: 'delivery' }, items: [], transportFee: 0, total: 0,
  consent: true, privacyNoticeVersion: '2026-10-v1',
};
describe('folio providers', () => {
  it('local folio uses the U marker, SV date, never collides with server alphabet', async () => {
    const p = createLocalFolioProvider({ now: () => new Date('2026-09-30T05:00:00Z'), random: () => new Uint8Array(7).fill(1) });
    const f = await p.issue(req);
    expect(f).toEqual({ code: 'ALC-20260929-U1111111', source: 'local' });
    expect(isContingencyFolio('ALC-20260929-L1111111')).toBe(false);
    expect(isContingencyFolio(f.code)).toBe(true);
    expect(isContingencyFolio('ALC-20260929-K7QM3X90')).toBe(false);
  });
  it('server adapter posts and returns code; contingency falls back on failure', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ code: 'ALC-20260929-K7QM3X90', validUntil: '2026-10-14', total: 0 }) });
    const s = await createServerFolioProvider({ fetchImpl: ok as unknown as typeof fetch }).issue(req);
    expect(s.source).toBe('server');
    expect(ok.mock.calls[0]![0]).toBe('/api/quote-create');
    const bad = createServerFolioProvider({ fetchImpl: vi.fn().mockRejectedValue(new Error('net')) as unknown as typeof fetch });
    const f = await withContingency(bad, createLocalFolioProvider()).issue(req);
    expect(f.source).toBe('local');
  });
  it('PUBLIC_QUOTE_API defaults to mock', () => {
    expect(quoteApiMode(undefined)).toBe('mock');
    expect(quoteApiMode('http')).toBe('http');
    // Aligned with resolveQuoteApiMode: prod without env must issue real (http) folios.
    expect(quoteApiMode(undefined, true)).toBe('http');
    expect(quoteApiMode('mock', true)).toBe('mock');
    expect(quoteApiMode('otro', true)).toBe('http');
  });
});

describe('share', () => {
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
  it('message matches the board miniature 1:1', () => {
    const m = buildQuoteShareMessage({
      folio: 'ALC-20260929-K7QM3X90',
      items: doc.items.map((i) => ({ name: i.name, variant: i.variant, measures: i.measures, price: i.price })),
      transport: 30,
      total: 1293,
    });
    expect(m).toBe(
      'Hola, ALCUSA. Quiero confirmar mi cotización.\nN.º ALC-20260929-K7QM3X90\n1. Puerta en L · Aquaclara · 80 × 180 cm — $444\n2. Puerta de jardín 2 hojas · Aquaclara · 150 × 210 cm — $819\nTransporte: $30\nTotal: $1,293\nAdjunto el PDF de mi cotización.',
    );
  });
  it('degrades a 30-item cart under the encoded budget', () => {
    const items = Array.from({ length: 30 }, () => ({ name: 'Puerta de jardín 2 hojas', variant: 'Aquaclara', measures: '150 × 210', price: 819 }));
    const m = buildQuoteShareMessage({ folio: 'ALC-20260929-K7QM3X90', items, transport: 30, total: 99999 });
    expect(encodeURIComponent(m).length).toBeLessThanOrEqual(WA_ENCODED_BUDGET);
    expect(m).toContain('30 productos (ver PDF)');
  });
  it('chooseDelivery: mobile+canShare -> share; desktop or no support -> fallback', () => {
    const nav = { canShare: () => true, share: () => Promise.resolve() };
    expect(chooseDelivery(nav, file, true)).toBe('share');
    expect(chooseDelivery(nav, file, false)).toBe('fallback');
    expect(chooseDelivery({ canShare: () => false, share: nav.share }, file, true)).toBe('fallback');
    expect(chooseDelivery({}, file, true)).toBe('fallback');
  });
  it('runShare maps shared / AbortError / NotAllowedError / other', async () => {
    const mk = (name?: string) => ({ share: () => (name ? Promise.reject(new DOMException('x', name)) : Promise.resolve()) });
    expect(await runShare(mk(), file, 't', 'x')).toBe('shared');
    expect(await runShare(mk('AbortError'), file, 't', 'x')).toBe('cancelled');
    expect(await runShare(mk('NotAllowedError'), file, 't', 'x')).toBe('needs-second-tap');
    expect(await runShare(mk('DataError'), file, 't', 'x')).toBe('fallback');
  });
});
