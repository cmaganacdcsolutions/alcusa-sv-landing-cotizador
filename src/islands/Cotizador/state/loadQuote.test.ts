import { describe, expect, it } from 'vitest';
import { createMockQuoteClient, mockCodes } from '@integrations/quotes/mockClient';
import { createHttpQuoteClient } from '@integrations/quotes/httpClient';
import { resolveQuoteApiMode } from '@integrations/quotes';
import { QuoteLoadFailure } from '@integrations/quotes/types';
import { applyLoadedQuote } from './loadQuote';
import { cotizadorReducer, initialCotizadorState } from './cotizadorStore';
import { buildOrderItems } from './order';
import { CATALOG_PRODUCTS } from '@content/catalog';

const NOW = new Date('2026-09-30T12:00:00Z');
const client = createMockQuoteClient({ now: () => NOW, latencyMs: 0 });
const codes = mockCodes(NOW);

describe('mock QuoteClient', () => {
  it('found / changed / expired', async () => {
    expect((await client.getQuote(codes.found)).items).toHaveLength(1);
    expect((await client.getQuote(codes.changed)).items).toHaveLength(3);
    expect((await client.getQuote(codes.expired)).expired).toBe(true);
  });
  it.each([
    ['rateLimited', 'rate_limited'],
    ['offline', 'offline'],
    ['server', 'server_error'],
  ] as const)('%s -> %s', async (k, code) => {
    await expect(client.getQuote(codes[k])).rejects.toMatchObject({ code });
  });
  it('desconocido -> not_found', async () => {
    await expect(client.getQuote('ALC-20260930-00000000')).rejects.toBeInstanceOf(QuoteLoadFailure);
  });
  it('429 trae Retry-After', async () => {
    await expect(client.getQuote(codes.rateLimited)).rejects.toMatchObject({ retryAfterSec: 240 });
  });
});

describe('http QuoteClient (GET /api/quotes/{code})', () => {
  const mk = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
    createHttpQuoteClient('', (async () => new Response(JSON.stringify(body), { status, headers })) as typeof fetch);
  it.each([
    [404, 'not_found'],
    [422, 'invalid_code'],
    [429, 'rate_limited'],
    [500, 'server_error'],
    [503, 'server_error'],
  ])('status %i -> %s', async (status, code) => {
    await expect(mk(status).getQuote('X')).rejects.toMatchObject({ code });
  });
  it('429 lee Retry-After', async () => {
    await expect(mk(429, {}, { 'Retry-After': '120' }).getQuote('X')).rejects.toMatchObject({ retryAfterSec: 120 });
  });
  it('red caida -> offline; 200 -> cuerpo', async () => {
    const off = createHttpQuoteClient('', (async () => {
      throw new TypeError('network');
    }) as typeof fetch);
    await expect(off.getQuote('X')).rejects.toMatchObject({ code: 'offline' });
    await expect(mk(200, { code: 'ok' }).getQuote('X')).resolves.toMatchObject({ code: 'ok' });
  });
  it('usa la ruta y no manda cookies', async () => {
    let seen = '';
    let cred: RequestCredentials | undefined;
    const c = createHttpQuoteClient('', (async (url: string, init?: RequestInit) => {
      seen = url;
      cred = init?.credentials;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch);
    await c.getQuote('ALC-20260930-K7QM3X90');
    expect(seen).toBe('/api/quotes/ALC-20260930-K7QM3X90');
    expect(cred).toBe('omit');
  });
});

describe('resolveQuoteApiMode', () => {
  it('defecto: mock en dev/test, http en prod; el env manda', () => {
    expect(resolveQuoteApiMode(undefined, false)).toBe('mock');
    expect(resolveQuoteApiMode(undefined, true)).toBe('http');
    expect(resolveQuoteApiMode('mock', true)).toBe('mock');
    expect(resolveQuoteApiMode('http', false)).toBe('http');
    expect(resolveQuoteApiMode('otro', true)).toBe('http');
  });
});

describe('applyLoadedQuote', () => {
  it('sin cambios: precios de hoy == guardados', async () => {
    const r = applyLoadedQuote(await client.getQuote(codes.found));
    expect(r.items).toHaveLength(1);
    expect(r.notice.changes).toEqual([]);
    expect(r.entrega).toBe('retiro');
  });

  it('cambios: precio, promo vencida, producto retirado; total nuevo viene del motor', async () => {
    const r = applyLoadedQuote(await client.getQuote(codes.changed));
    const kinds = r.notice.changes.map((c) => c.kind).sort();
    expect(kinds).toEqual(['discontinued', 'price_changed', 'price_changed', 'promo_expired']);
    expect(r.items).toHaveLength(2);
    const lines = buildOrderItems({ ...initialCotizadorState, cart: r.items, entrega: 'retiro' }, CATALOG_PRODUCTS);
    expect(r.notice.totalAfter).toBe(lines.reduce((s, l) => s + l.subtotal, 0));
    expect(r.notice.totalBefore).toBe(550);
  });

  it('config con opcion desconocida -> unsupported; version distinta -> unsupported', async () => {
    const res = await client.getQuote(codes.found);
    const bad = { ...res, items: [{ ...res.items[0]!, config: { ...res.items[0]!.config, color: 'fucsia' } }] };
    expect(applyLoadedQuote(bad).notice.changes).toEqual([{ kind: 'unsupported', name: 'Puerta de baño recta' }]);
    const v2 = { ...res, items: [{ ...res.items[0]!, configSchemaVersion: 2 }] };
    expect(applyLoadedQuote(v2).items).toEqual([]);
  });

  it('vencida: conserva expired para la etiqueta', async () => {
    expect(applyLoadedQuote(await client.getQuote(codes.expired)).notice.expired).toBe(true);
  });
});

describe('reducer LOAD_QUOTE', () => {
  it('reemplaza el carrito, promueve el ultimo item a current y va a Resumen; Resumen lo lista', async () => {
    const r = applyLoadedQuote(await client.getQuote(codes.changed));
    const before = { ...initialCotizadorState, cart: [{ ...r.items[0]!, id: 'viejo' }], productId: 'jardin' as const };
    const next = cotizadorReducer(before, { type: 'LOAD_QUOTE', items: r.items, entrega: r.entrega, zone: r.zone, notice: r.notice });
    expect(next.step).toBe('resumen');
    expect(next.cart.map((i) => i.id)).not.toContain('viejo');
    expect(next.cart).toHaveLength(1);
    expect(next.productId).toBe(r.items[1]!.productId);
    expect(next.quoteLoad).toBe(r.notice);
    expect(buildOrderItems(next, CATALOG_PRODUCTS)).toHaveLength(2);
  });
  it('EDIT_ITEM sigue funcionando sobre un carrito cargado', async () => {
    const r = applyLoadedQuote(await client.getQuote(codes.changed));
    const loaded = cotizadorReducer(initialCotizadorState, { type: 'LOAD_QUOTE', items: r.items, entrega: r.entrega, zone: r.zone, notice: r.notice });
    const edited = cotizadorReducer(loaded, { type: 'EDIT_ITEM', id: loaded.cart[0]!.id });
    expect(edited.step).toBe('medidas');
    expect(buildOrderItems(edited, CATALOG_PRODUCTS)).toHaveLength(2);
  });
  it('sin items no cambia nada; DISMISS limpia el aviso', async () => {
    expect(cotizadorReducer(initialCotizadorState, { type: 'LOAD_QUOTE', items: [], entrega: 'retiro', zone: '', notice: {} as never })).toBe(initialCotizadorState);
    const r = applyLoadedQuote(await client.getQuote(codes.found));
    const loaded = cotizadorReducer(initialCotizadorState, { type: 'LOAD_QUOTE', items: r.items, entrega: r.entrega, zone: r.zone, notice: r.notice });
    expect(cotizadorReducer(loaded, { type: 'DISMISS_QUOTE_NOTICE' }).quoteLoad).toBeNull();
  });
});
