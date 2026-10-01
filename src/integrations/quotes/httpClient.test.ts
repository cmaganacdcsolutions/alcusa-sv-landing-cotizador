import { describe, expect, it, vi } from 'vitest';
import { createHttpQuoteClient } from './httpClient';
import { QuoteLoadFailure, type QuoteLoadResponse } from './types';

// Status matrix of GET /api/quotes/:code (server/README "Quotes API", ADR-013 N2).
const CODE = 'ALC-20261001-K7QM3X90';
const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}): typeof fetch =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers })) as unknown as typeof fetch;
const failure = async (f: typeof fetch): Promise<QuoteLoadFailure> => {
  const err = await createHttpQuoteClient('', f).getQuote(CODE).then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(QuoteLoadFailure);
  return err as QuoteLoadFailure;
};

describe('http quote client status matrix', () => {
  it('200 returns the QuoteLoadResponse; requests are cookie-less, uncached and URL-encoded', async () => {
    const body = { code: CODE, expired: false } as unknown as QuoteLoadResponse;
    const f = reply(200, body);
    await expect(createHttpQuoteClient('', f).getQuote(CODE)).resolves.toEqual(body);
    expect(f).toHaveBeenCalledWith(`/api/quotes/${CODE}`, expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store' }));
  });
  it('404 -> not_found, 422 -> invalid_code (U folios and folios older than 90 days)', async () => {
    expect((await failure(reply(404, { error: { code: 'not_found' } }))).code).toBe('not_found');
    expect((await failure(reply(422, { error: { code: 'invalid_code' } }))).code).toBe('invalid_code');
  });
  it('429 -> rate_limited with Retry-After seconds (absent or bad -> undefined)', async () => {
    const a = await failure(reply(429, {}, { 'Retry-After': '240' }));
    expect([a.code, a.retryAfterSec]).toEqual(['rate_limited', 240]);
    expect((await failure(reply(429))).retryAfterSec).toBeUndefined();
  });
  it('5xx, unexpected statuses and a 200 with a broken body -> server_error; network failure -> offline', async () => {
    expect((await failure(reply(500))).code).toBe('server_error');
    expect((await failure(reply(503))).code).toBe('server_error');
    expect((await failure(reply(400))).code).toBe('server_error');
    const broken = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    expect((await failure(broken)).code).toBe('server_error');
    const down = vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect((await failure(down)).code).toBe('offline');
  });
});
