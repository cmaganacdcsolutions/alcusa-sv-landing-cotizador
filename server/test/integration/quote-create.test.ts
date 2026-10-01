import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizeQuoteCode } from '../../../src/integrations/quotes/code.ts';
import { validateCreate } from '../../src/modules/quotes/create-request.ts';
import { insertQuote } from '../../src/modules/quotes/repository.ts';
import { cartConfig, feRequest, makeApp, post, resetDb, type TestApp } from '../helpers.ts';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await resetDb();
});

const count = async (table: 'quotes' | 'quote_items'): Promise<number> => {
  const sql = table === 'quotes' ? 'SELECT COUNT(*) AS n FROM quotes' : 'SELECT COUNT(*) AS n FROM quote_items';
  const [rows] = await t.pool.query<RowDataPacket[]>(sql);
  return Number(rows[0]?.['n']);
};

describe('POST /api/quote-create: happy path', () => {
  it('201 with a canonical folio valid per code.ts, validUntil = SV today + 15, total echoed', async () => {
    const body = feRequest();
    const res = await post(t, body);
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const out = res.json<{ code: string; validUntil: string; total: number }>();
    expect(Object.keys(out).sort()).toEqual(['code', 'total', 'validUntil']);
    const n = normalizeQuoteCode(out.code);
    expect(n).toMatchObject({ ok: true, code: out.code });
    expect(out.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out.total).toBe(463);
    expect(await count('quotes')).toBe(1);
    expect(await count('quote_items')).toBe(2);
  });

  it('stores PII only in the quote columns, pricing_source=client, normalized E.164, hashed ip', async () => {
    const res = await post(t, feRequest({ customer: { name: '  Ana   Paz ', whatsapp: '7123-4567', email: 'ana@example.com' } }));
    expect(res.statusCode).toBe(201);
    const [rows] = await t.pool.query<RowDataPacket[]>(
      'SELECT customer_name, customer_whatsapp, customer_email, pricing_source, status, ip_hash, subtotal, transport_fee, total, consent_at, delivery_mode, delivery_zone FROM quotes',
    );
    const q = rows[0] as RowDataPacket;
    expect(q).toMatchObject({
      customer_name: 'Ana Paz',
      customer_whatsapp: '+50371234567',
      customer_email: 'ana@example.com',
      pricing_source: 'client',
      status: 'issued',
      subtotal: '438.00',
      transport_fee: '25.00',
      total: '463.00',
      delivery_mode: 'delivery',
      delivery_zone: 'San Salvador',
    });
    expect(q['ip_hash']).toMatch(/^[0-9a-f]{64}$/);
    expect(q['ip_hash']).not.toContain('10.0.0.1');
    expect(q['consent_at']).toBeTruthy();
  });

  it('idempotent replay: same key + same cart => 200 and the same folio, no new rows', async () => {
    const body = feRequest();
    const a = await post(t, body);
    const b = await post(t, body);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(200);
    expect(b.json()).toEqual(a.json());
    expect(await count('quotes')).toBe(1);
  });

  it('same key but different cart => 409 idempotency_conflict', async () => {
    const body = feRequest();
    expect((await post(t, body)).statusCode).toBe(201);
    const other = feRequest({ idempotencyKey: body.idempotencyKey, transportFee: 0, total: 438 });
    const res = await post(t, other);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'idempotency_conflict' } });
  });

  it('ignores the hp honeypot when empty and rejects it when filled (nothing stored)', async () => {
    const ok = await post(t, { ...feRequest(), hp: '' });
    expect(ok.statusCode).toBe(201);
    const bot = await post(t, { ...feRequest(), hp: 'http://spam' });
    expect(bot.statusCode).toBe(422);
    expect(await count('quotes')).toBe(1);
  });

  it('supersedesCode links the previous quote and never changes its status; an unknown one is ignored', async () => {
    const first = (await post(t, feRequest())).json<{ code: string }>();
    const second = await post(t, feRequest({ supersedesCode: first.code.toLowerCase() }));
    expect(second.statusCode).toBe(201);
    const [rows] = await t.pool.query<RowDataPacket[]>(
      'SELECT n.code AS code, p.code AS prev, p.status AS prev_status FROM quotes n JOIN quotes p ON p.id = n.supersedes_quote_id',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: second.json<{ code: string }>().code, prev: first.code, prev_status: 'issued' });
    const unknown = await post(t, feRequest({ supersedesCode: 'ALC-20261001-H8T2NWB4' }));
    expect(unknown.statusCode).toBe(201);
  });

  it('pickup drops zone/address; config is stored as received and round-trips', async () => {
    const cfg = cartConfig('recta', { notes: 'ñ "q" \\ \n 日本' });
    const body = feRequest({ delivery: { mode: 'pickup', zone: 'x', address: 'y' } });
    body.items[0]!.config = cfg;
    const res = await post(t, body);
    expect(res.statusCode).toBe(201);
    const [rows] = await t.pool.query<RowDataPacket[]>('SELECT delivery_zone, delivery_address FROM quotes');
    expect(rows[0]).toMatchObject({ delivery_zone: null, delivery_address: null });
    const [items] = await t.pool.query<RowDataPacket[]>('SELECT config FROM quote_items WHERE position = 1');
    const raw = items[0]?.['config'] as unknown;
    expect(typeof raw === 'string' ? JSON.parse(raw) : raw).toEqual(cfg);
  });
});

describe('POST /api/quote-create: 4xx matrix (envelope + statuses the FE propagates)', () => {
  const cases: [string, (b: ReturnType<typeof feRequest>) => unknown, number, string, string?][] = [
    ['name too short', (b) => ({ ...b, customer: { ...b.customer, name: 'A' } }), 422, 'invalid_customer', 'customer.name'],
    ['name only digits', (b) => ({ ...b, customer: { ...b.customer, name: '12345' } }), 422, 'invalid_customer', 'customer.name'],
    ['name looks like URL', (b) => ({ ...b, customer: { ...b.customer, name: 'www.spam.com' } }), 422, 'invalid_customer', 'customer.name'],
    ['name too long', (b) => ({ ...b, customer: { ...b.customer, name: 'a'.repeat(81) } }), 422, 'invalid_customer', 'customer.name'],
    ['whatsapp +503 landline', (b) => ({ ...b, customer: { ...b.customer, whatsapp: '+50322001234' } }), 422, 'invalid_customer', 'customer.whatsapp'],
    ['whatsapp garbage', (b) => ({ ...b, customer: { ...b.customer, whatsapp: 'abc' } }), 422, 'invalid_customer', 'customer.whatsapp'],
    ['whatsapp empty', (b) => ({ ...b, customer: { ...b.customer, whatsapp: '' } }), 422, 'invalid_customer', 'customer.whatsapp'],
    ['bad email', (b) => ({ ...b, customer: { ...b.customer, email: 'nope' } }), 422, 'invalid_customer', 'customer.email'],
    ['consent false', (b) => ({ ...b, consent: false }), 422, 'consent_required', 'consent'],
    ['consent missing', (b) => ({ ...b, consent: undefined }), 422, 'consent_required', 'consent'],
    ['no items', (b) => ({ ...b, items: [] }), 422, 'invalid_request', 'items'],
    ['31 items', (b) => ({ ...b, items: Array.from({ length: 31 }, () => b.items[0]) }), 422, 'invalid_request', 'items'],
    ['qty fractional', (b) => ({ ...b, items: [{ ...b.items[0], qty: 1.5 }] }), 422, 'invalid_request', 'items.0.qty'],
    ['qty 0', (b) => ({ ...b, items: [{ ...b.items[0], qty: 0 }] }), 422, 'invalid_request', 'items.0.qty'],
    ['qty 1000', (b) => ({ ...b, items: [{ ...b.items[0], qty: 1000 }] }), 422, 'invalid_request', 'items.0.qty'],
    ['negative money', (b) => ({ ...b, transportFee: -1, total: 437 }), 422, 'invalid_request', 'transportFee'],
    ['3 decimals', (b) => ({ ...b, items: [{ ...b.items[0], unitPrice: 222.005, lineTotal: 222.005 }, b.items[1]] }), 422, 'invalid_request', 'items.0.unitPrice'],
    ['money as string', (b) => ({ ...b, total: '463' }), 422, 'invalid_request', 'total'],
    ['bad slug', (b) => ({ ...b, items: [{ ...b.items[0], productSlug: 'Bad Slug' }] }), 422, 'invalid_request', 'items.0.productSlug'],
    ['lineTotal != qty*unit', (b) => ({ ...b, items: [{ ...b.items[0], qty: 2 }, b.items[1]] }), 422, 'invalid_request', 'items.0.lineTotal'],
    ['total mismatch', (b) => ({ ...b, total: 462.99 }), 422, 'invalid_request', 'total'],
    ['bad idempotency key', (b) => ({ ...b, idempotencyKey: 'not-a-uuid' }), 422, 'invalid_request', 'idempotencyKey'],
    ['bad supersedesCode', (b) => ({ ...b, supersedesCode: 'ALC-20260930-U7QM3X9' }), 422, 'invalid_request', 'supersedesCode'],
    ['unknown delivery mode', (b) => ({ ...b, delivery: { mode: 'drone' } }), 422, 'invalid_request', 'delivery.mode'],
    ['body is an array', () => [1, 2], 422, 'invalid_request'],
    ['config too big (4 KB cap)', (b) => ({ ...b, items: [{ ...b.items[0], config: { blob: 'x'.repeat(4100) } }, b.items[1]] }), 413, 'payload_too_large'],
  ];

  it.each(cases)('%s', async (_n, mut, status, code, field) => {
    const res = await post(t, mut(feRequest()));
    expect(res.statusCode).toBe(status);
    const err = res.json<{ error: { code: string; message: string; fields?: Record<string, string> } }>().error;
    expect(err.code).toBe(code);
    expect(err.message).toBeTruthy();
    if (field) expect(err.fields).toHaveProperty([field]);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await count('quotes')).toBe(0);
  });

  it('config of exactly 4096 bytes is accepted, 4097 is 413', async () => {
    const fit = (size: number) => {
      const b = feRequest();
      const overhead = Buffer.byteLength(JSON.stringify({ k: '' }));
      b.items[0]!.config = { k: 'x'.repeat(size - overhead) };
      expect(Buffer.byteLength(JSON.stringify(b.items[0]!.config))).toBe(size);
      return b;
    };
    expect((await post(t, fit(4096))).statusCode).toBe(201);
    expect((await post(t, fit(4097))).statusCode).toBe(413);
  });

  it('multi-byte config is measured in bytes, not characters', async () => {
    const b = feRequest();
    b.items[0]!.config = { k: 'ñ'.repeat(2100) }; // 2100 chars, 4200 bytes
    expect((await post(t, b)).statusCode).toBe(413);
  });

  it('body over 32 KB => 413 payload_too_large', async () => {
    const b = feRequest();
    b.items[0]!.description = 'x'.repeat(40_000);
    const res = await post(t, b);
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: { code: 'payload_too_large' } });
  });

  it('malformed JSON => 400 invalid_request', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/quote-create', headers: { 'content-type': 'application/json' }, payload: '{"a":' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'invalid_request' } });
  });

  it('a validation error never echoes PII', async () => {
    const res = await post(t, feRequest({ customer: { name: 'Zoila Secreta', whatsapp: '+50370001111', email: 'bad' } }));
    expect(res.body).not.toMatch(/Zoila|70001111/);
  });

  it('priority: invalid_request beats invalid_customer beats consent_required', async () => {
    const b = feRequest({ consent: false as unknown as true, customer: { name: 'A', whatsapp: '+50371234567' } });
    expect(((await post(t, b)).json() as { error: { code: string } }).error.code).toBe('invalid_customer');
    expect(((await post(t, { ...b, total: 1 })).json() as { error: { code: string } }).error.code).toBe('invalid_request');
  });
});

describe('POST /api/quote-create: rate limits (rate_limits table)', () => {
  it('429 + Retry-After after N quotes per IP; replays do not count; another IP is unaffected', async () => {
    const lim = await makeApp({ limits: { createPerIpHour: 2 } });
    try {
      const first = feRequest();
      expect((await post(lim, first, '10.9.9.9')).statusCode).toBe(201);
      expect((await post(lim, first, '10.9.9.9')).statusCode).toBe(200); // replay: free
      expect((await post(lim, feRequest(), '10.9.9.9')).statusCode).toBe(201);
      const res = await post(lim, feRequest(), '10.9.9.9');
      expect(res.statusCode).toBe(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(res.json()).toMatchObject({ error: { code: 'rate_limited' } });
      expect((await post(lim, feRequest(), '10.9.9.10')).statusCode).toBe(201);
    } finally {
      await lim.close();
    }
  });

  it('429 per WhatsApp (5/hour) across different IPs; the bucket stores an HMAC, not the number', async () => {
    const lim = await makeApp();
    try {
      for (let i = 0; i < 5; i += 1) expect((await post(lim, feRequest(), `10.1.0.${i + 1}`)).statusCode).toBe(201);
      expect((await post(lim, feRequest(), '10.1.0.99')).statusCode).toBe(429);
      const [rows] = await lim.pool.query<RowDataPacket[]>('SELECT bucket FROM rate_limits');
      expect(JSON.stringify(rows)).not.toMatch(/71234567|10\.1\.0/);
    } finally {
      await lim.close();
    }
  });
});

describe('POST /api/quote-create: persistence guarantees', () => {
  it('retries on a folio UNIQUE collision with a new suffix; gives up after 5 attempts', async () => {
    const first = (await post(t, feRequest())).json<{ code: string }>();
    const fresh = 'ALC-20261001-H8T2NWB4';
    const seq = [first.code, first.code, fresh];
    const retry = await makeApp({ generateCode: () => seq.shift() ?? fresh });
    try {
      const res = await post(retry, feRequest(), '10.3.0.1');
      expect(res.statusCode).toBe(201);
      expect(res.json<{ code: string }>().code).toBe(fresh);
      expect(await count('quotes')).toBe(2);
    } finally {
      await retry.close();
    }
    const stuck = await makeApp({ generateCode: () => first.code });
    try {
      const res = await post(stuck, feRequest(), '10.3.0.2');
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: { code: 'server_error', message: 'Internal server error' } });
      expect(await count('quotes')).toBe(2);
    } finally {
      await stuck.close();
    }
  });

  it('transaction rolls back the quote when an item insert fails (no orphan rows)', async () => {
    const v = validateCreate(feRequest());
    if (!v.ok) throw new Error('fixture invalid');
    const broken = { ...v.data, items: [v.data.items[0]!, { ...v.data.items[1]!, position: 1 }] }; // duplicate position => UNIQUE violation
    await expect(
      insertQuote(t.pool, broken, { code: 'ALC-20261001-H8T2NWB4', validUntil: '2026-12-31', consentAt: '2026-10-01 10:00:00', ipHash: 'x', supersedesQuoteId: null }),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    expect(await count('quotes')).toBe(0);
    expect(await count('quote_items')).toBe(0);
  });

  it('the DB itself refuses an inconsistent total (CHECK) even if validation were bypassed', async () => {
    const v = validateCreate(feRequest());
    if (!v.ok) throw new Error('fixture invalid');
    await expect(
      insertQuote(t.pool, { ...v.data, totalCents: v.data.totalCents + 1 }, { code: 'ALC-20261001-H8T2NWB4', validUntil: '2026-12-31', consentAt: '2026-10-01 10:00:00', ipHash: 'x', supersedesQuoteId: null }),
    ).rejects.toBeTruthy();
    expect(await count('quotes')).toBe(0);
  });

  it('two concurrent identical submits end with one quote and the same folio', async () => {
    const body = feRequest();
    const [a, b] = await Promise.all([post(t, body), post(t, body)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json()).toEqual(b.json());
    expect(await count('quotes')).toBe(1);
  });

  it('uses a fresh random suffix per quote', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 4; i += 1) codes.add((await post(t, feRequest({ idempotencyKey: randomUUID() }), `10.2.0.${i}`)).json<{ code: string }>().code);
    expect(codes.size).toBe(4);
  });
});
