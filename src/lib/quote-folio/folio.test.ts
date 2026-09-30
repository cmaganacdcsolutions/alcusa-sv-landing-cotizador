import { describe, expect, it, vi } from 'vitest';
import {
  createLocalFolioProvider,
  createMockFolioProvider,
  createServerFolioProvider,
  isContingencyFolio,
  readLoadedFromCode,
  withContingency,
  type MockScenario,
  type QuoteFolioRequest,
} from './index';

const req: QuoteFolioRequest = {
  idempotencyKey: 'k',
  customer: { name: 'María López', whatsapp: '+50371234567' },
  delivery: { mode: 'delivery' },
  items: [],
  transportFee: 0,
  total: 0,
  consent: true,
  privacyNoticeVersion: '2026-10-v1',
};
const res = (status: number, body: unknown): { ok: boolean; status: number; headers: Headers; json: () => Promise<unknown> } => ({
  ok: status < 300,
  status,
  headers: new Headers(),
  json: () => Promise.resolve(body),
});
const serverBody = { code: 'ALC-20260929-K7QM3X90', validUntil: '2026-10-14', total: 262 };
const http = (status: number, body: unknown = {}) =>
  createServerFolioProvider({ fetchImpl: vi.fn().mockResolvedValue(res(status, body)) as unknown as typeof fetch });
const local = createLocalFolioProvider();

describe('server adapter', () => {
  it('posts the contract (consent from the request, hp empty); 200 and 201 alike', async () => {
    for (const st of [200, 201]) {
      const f = vi.fn().mockResolvedValue(res(st, serverBody));
      const out = await createServerFolioProvider({ fetchImpl: f as unknown as typeof fetch }).issue(req);
      expect(out).toEqual({ ...serverBody, source: 'server' });
      expect(f.mock.calls[0]![0]).toBe('/api/quote-create.php');
      const sent = JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
      expect(sent).toMatchObject({ consent: true, privacyNoticeVersion: '2026-10-v1', hp: '' });
    }
  });
  it('rejects a 2xx without code, validUntil or total, or with a contingency-shaped code', async () => {
    const bad = [{}, { code: serverBody.code, total: 1 }, { code: serverBody.code, validUntil: '2026-10-14' }, { ...serverBody, code: 'ALC-20260929-U7QM3X9T' }, { ...serverBody, code: 'ALC-20260929-K7QM3X9Z' }];
    for (const body of bad) await expect(http(201, body).issue(req)).rejects.toThrow();
  });
});

describe('withContingency', () => {
  it('falls back on network error, timeout and 5xx only', async () => {
    const net = createServerFolioProvider({ fetchImpl: vi.fn().mockRejectedValue(new Error('net')) as unknown as typeof fetch });
    expect((await withContingency(net, local).issue(req)).source).toBe('local');
    const hang = createServerFolioProvider({
      timeoutMs: 5,
      fetchImpl: ((_u: string, init: RequestInit) =>
        new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('t', 'AbortError'))))) as unknown as typeof fetch,
    });
    expect((await withContingency(hang, local).issue(req)).source).toBe('local');
    for (const st of [500, 502, 503]) {
      const out = await withContingency(http(st, { error: { code: 'server_error', message: 'x' } }), local).issue(req);
      expect(out.source).toBe('local');
    }
  });
  it('propagates 422/409/413/429 with code and fields, never a local folio', async () => {
    const fields = { 'customer.whatsapp': 'invalid' };
    for (const [st, code] of [[422, 'invalid_customer'], [409, 'idempotency_conflict'], [413, 'payload_too_large'], [429, 'rate_limited']] as const) {
      const p = withContingency(http(st, { error: { code, message: 'm', fields } }), local);
      await expect(p.issue(req)).rejects.toMatchObject({ name: 'QuoteFolioApiError', status: st, code, fields });
    }
  });
  it('mock provider reaches every error state (422 fields, 429, 503 -> contingency)', async () => {
    let s: MockScenario = 'invalid_customer';
    const p = withContingency(createMockFolioProvider(() => s), local);
    await expect(p.issue(req)).rejects.toMatchObject({ status: 422, fields: { 'customer.name': 'invalid', 'customer.whatsapp': 'invalid' } });
    s = 'consent_required';
    await expect(p.issue(req)).rejects.toMatchObject({ code: 'consent_required', fields: { consent: 'required' } });
    s = 'rate_limited';
    await expect(p.issue(req)).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    s = 'server_error';
    expect((await p.issue(req)).source).toBe('local');
    s = 'ok';
    expect(isContingencyFolio((await p.issue(req)).code)).toBe(true);
  });
});

describe('supersedesCode source', () => {
  it('reads it only when it is a canonical folio', () => {
    const seen: string[] = [];
    const st = (v: string | null) => ({ getItem: (k: string) => (seen.push(k), v) });
    expect(readLoadedFromCode(st('ALC-20260929-K7QM3X90'))).toBe('ALC-20260929-K7QM3X90');
    expect(readLoadedFromCode(st('"ALC-20260929-K7QM3X90"'))).toBe('ALC-20260929-K7QM3X90');
    expect(readLoadedFromCode(st('ALC-20260929-U1111111'))).toBeUndefined();
    expect(readLoadedFromCode(st('ALC-20260929-K7QM3X9Z'))).toBeUndefined(); // bad check digit
    expect(readLoadedFromCode(st(null))).toBeUndefined();
    expect(new Set(seen)).toEqual(new Set(['alcusa-cotizador-loaded-from'])); // r5 writes this key
  });
});
