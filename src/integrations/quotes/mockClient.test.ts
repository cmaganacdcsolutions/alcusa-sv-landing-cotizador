import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalFolioProvider, createMockFolioProvider, withContingency, type QuoteFolioRequest } from '../../lib/quote-folio';
import { createMockQuoteClient, mockCodes, mockFixturesEnabled } from './mockClient';
import { QuoteLoadFailure } from './types';

// Hotfix 2026-10-24: prod corre en mock (navegador). Los folios de muestra NO se cargan en prod; los folios
// emitidos por el proveedor mock si, tambien tras "recargar" (nuevo cliente sobre el mismo localStorage).

const NOW = new Date('2026-10-24T12:00:00Z');

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

const req: QuoteFolioRequest = {
  idempotencyKey: 'k',
  customer: { name: 'A', whatsapp: '71234567' },
  delivery: { mode: 'pickup' },
  items: [{ productSlug: 'recta', description: 'Puerta recta', qty: 1, unitPrice: 300, lineTotal: 300, config: { width: '110' }, configSchemaVersion: 1, promoRef: null }],
  transportFee: 0,
  total: 300,
  consent: true,
  privacyNoticeVersion: 'v1',
};

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('folios de muestra del mock', () => {
  it('mockFixturesEnabled: solo fuera de prod o con PUBLIC_QUOTE_FIXTURES=1', () => {
    expect(mockFixturesEnabled(false, undefined)).toBe(true);
    expect(mockFixturesEnabled(true, undefined)).toBe(false);
    expect(mockFixturesEnabled(true, '1')).toBe(true);
  });

  it('con fixtures apagados (build de prod) ningun folio de muestra carga: not_found', async () => {
    const prod = createMockQuoteClient({ now: () => NOW, latencyMs: 0, fixtures: false });
    for (const code of Object.values(mockCodes(NOW))) {
      await expect(prod.getQuote(code)).rejects.toMatchObject({ code: 'not_found' });
    }
    await expect(prod.getQuote(mockCodes(NOW).found)).rejects.toBeInstanceOf(QuoteLoadFailure);
  });

  it('con fixtures encendidos (dev/test) el folio de muestra sigue cargando', async () => {
    const dev = createMockQuoteClient({ now: () => NOW, latencyMs: 0, fixtures: true });
    await expect(dev.getQuote(mockCodes(NOW).found)).resolves.toMatchObject({ code: mockCodes(NOW).found });
  });
});

describe('cadena real en prod: emitir -> recargar -> cargar', () => {
  it('el folio emitido por el proveedor mock lo encuentra un cliente nuevo (fixtures apagados)', async () => {
    const folio = await createMockFolioProvider(() => 'ok', { now: () => NOW }).issue(req);
    expect(folio.source).toBe('server');
    const afterReload = createMockQuoteClient({ now: () => NOW, latencyMs: 0, fixtures: false });
    const q = await afterReload.getQuote(folio.code);
    expect(q.code).toBe(folio.code);
    expect(q.saved.total).toBe(300);
    expect(q.items[0]?.productSlug).toBe('recta');
  });

  it('un folio de contingencia (U) no se guarda: no hay nada que cargar', async () => {
    const failing = createMockFolioProvider(() => 'server_error', { now: () => NOW });
    const folio = await withContingency(failing, createLocalFolioProvider({ now: () => NOW })).issue(req);
    expect(folio.source).toBe('local');
    expect(localStorage.getItem('alcusa.mock.quotes.v1')).toBeNull();
    const client = createMockQuoteClient({ now: () => NOW, latencyMs: 0, fixtures: false });
    await expect(client.getQuote(folio.code)).rejects.toMatchObject({ code: 'not_found' });
  });
});
