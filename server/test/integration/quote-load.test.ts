import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatQuoteCode, makeQuoteCode, QUOTE_VALIDITY_DAYS } from '../../../src/integrations/quotes/code.ts';
import type { QuoteLoadResponse } from '../../../src/integrations/quotes/types.ts';
import { QuoteLoadResponseSchema } from '../../src/modules/quotes/schemas.ts';
import { addDays, svDate } from '../../src/modules/quotes/folio.ts';
import { PUBLIC_QUOTE_SQL } from '../../src/modules/quotes/repository.ts';
import { cartConfig, feRequest, get, makeApp, post, resetDb, type TestApp } from '../helpers.ts';

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

const create = async (over: Parameters<typeof feRequest>[0] = {}, app: TestApp = t, ip = '10.0.0.1') => {
  const body = feRequest(over);
  const res = await post(app, body, ip);
  expect(res.statusCode).toBe(201);
  return { body, code: res.json<{ code: string }>().code };
};

/** A well-formed folio (valid check digit, today's SV date) that is not in the DB. */
const unknownCode = () => makeQuoteCode(svDate(new Date()).replaceAll('-', ''), 'H8T2NWB');

describe('GET /api/quotes/:code', () => {
  it('200: round trip equals what was posted (config deep-equals), exactly QuoteLoadResponse', async () => {
    const { body, code } = await create();
    const res = await get(t, code);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['etag']).toBeUndefined();
    const out = res.json<QuoteLoadResponse>();
    expect(QuoteLoadResponseSchema.strict().safeParse(out).success).toBe(true);
    const today = svDate(new Date());
    expect(out).toEqual({
      code,
      createdAt: today,
      validUntil: addDays(today, QUOTE_VALIDITY_DAYS),
      expired: false,
      currency: 'USD',
      delivery: { mode: 'delivery', zone: 'San Salvador' },
      items: body.items.map((it, i) => ({
        position: i + 1,
        productSlug: it.productSlug,
        description: it.description,
        qty: it.qty,
        savedUnitPrice: it.unitPrice,
        savedLineTotal: it.lineTotal,
        promoRef: it.promoRef,
        configSchemaVersion: it.configSchemaVersion,
        config: it.config,
      })),
      saved: { subtotal: 438, transportFee: 25, total: 463 },
    });
  });

  it('pickup: zone null; promoRef string kept; items ordered by position', async () => {
    const body = feRequest({ delivery: { mode: 'pickup' }, transportFee: 0, total: 438 });
    body.items[1]!.promoRef = '9003';
    body.items[1]!.config = cartConfig('x', { z: [3, 2, { b: 1, a: [] }], n: null, big: 1e21 });
    const res = await post(t, body);
    const out = (await get(t, res.json<{ code: string }>().code)).json<QuoteLoadResponse>();
    expect(out.delivery).toEqual({ mode: 'pickup', zone: null });
    expect(out.saved).toEqual({ subtotal: 438, transportFee: 0, total: 438 });
    expect(out.items.map((i) => i.position)).toEqual([1, 2]);
    expect(out.items[1]?.promoRef).toBe('9003');
    expect(out.items[1]?.config).toEqual(body.items[1]!.config);
  });

  it('decimal money survives the round trip without float drift', async () => {
    const body = feRequest({ transportFee: 0.1, total: 0.3 });
    body.items = [{ ...body.items[0]!, qty: 3, unitPrice: 0.06, lineTotal: 0.18 }];
    body.total = 0.28;
    const res = await post(t, body);
    expect(res.statusCode).toBe(201);
    const out = (await get(t, res.json<{ code: string }>().code)).json<QuoteLoadResponse>();
    expect(out.items[0]).toMatchObject({ savedUnitPrice: 0.06, savedLineTotal: 0.18 });
    expect(out.saved).toEqual({ subtotal: 0.18, transportFee: 0.1, total: 0.28 });
  });

  it('expired: valid_until in the past (SV date) still loads with expired=true', async () => {
    const issued = new Date();
    const early = await makeApp({ now: () => issued });
    const { code } = await create({}, early);
    await early.close();
    const later = await makeApp({ now: () => new Date(issued.getTime() + (QUOTE_VALIDITY_DAYS + 1) * 86_400_000) });
    try {
      const out = (await get(later, code)).json<QuoteLoadResponse>();
      expect(out.expired).toBe(true);
      const last = await makeApp({ now: () => new Date(issued.getTime() + QUOTE_VALIDITY_DAYS * 86_400_000) });
      expect((await get(last, code)).json<QuoteLoadResponse>().expired).toBe(false); // valid through valid_until
      await last.close();
    } finally {
      await later.close();
    }
  });

  it('normalizes lowercase, grouped, no-prefix and Crockford-confusable input to the same quote', async () => {
    const { code } = await create();
    const grouped = formatQuoteCode(code);
    const variants = [code.toLowerCase(), grouped, grouped.toLowerCase(), code.replaceAll('-', ''), code.slice(4), ` ${code} `, `retoma tu cotización ${grouped} gracias`];
    for (const v of variants) {
      const res = await get(t, v);
      expect(res.statusCode, v).toBe(200);
      expect(res.json<QuoteLoadResponse>().code).toBe(code);
    }
  });

  it('a cancelled quote is indistinguishable from a missing one (same status, body, headers)', async () => {
    const { code } = await create();
    await t.pool.execute("UPDATE quotes SET status = 'cancelled' WHERE code = ?", [code]);
    const cancelled = await get(t, code);
    const missing = await get(t, unknownCode());
    expect(cancelled.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(cancelled.body).toBe(missing.body);
    expect(missing.json()).toEqual({ error: { code: 'not_found', message: 'No encontramos una cotización con ese folio.' } });
    const strip = (h: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(h).filter(([k]) => !['date', 'x-request-id', 'content-length'].includes(k)));
    expect(strip(cancelled.headers)).toEqual(strip(missing.headers));
    expect(missing.headers['cache-control']).toBe('no-store');
  });

  it('a superseded quote and an old-version quote still load (supersedes only links)', async () => {
    const first = await create();
    await create({ supersedesCode: first.code });
    expect((await get(t, first.code)).statusCode).toBe(200);
  });

  it.each([
    ['garbage', 'hola'],
    ['wrong check digit', 'ALC-20261001-H8T2NWB5'],
    ['suffix only (no date)', 'H8T2NWB4'],
    ['future date', 'ALC-20991231-H8T2NWB4'],
    ['too old (> 90 days)', 'ALC-20200101-H8T2NWB4'],
    ['contingency folio', `ALC-${svDate(new Date()).replaceAll('-', '')}-U1234567`],
    ['over-long input', 'A'.repeat(150)],
  ])('422 invalid_code without reading quotes: %s', async (_n, input) => {
    const spy = vi.spyOn(t.pool, 'execute');
    const res = await get(t, input);
    const sqls = spy.mock.calls.map((c) => String(c[0]));
    spy.mockRestore();
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: { code: 'invalid_code', message: 'El folio no es válido.' } });
    expect(sqls.some((s) => /FROM quotes/i.test(s))).toBe(false);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('404 reads quotes exactly once (single query path)', async () => {
    const spy = vi.spyOn(t.pool, 'execute');
    await get(t, unknownCode());
    const reads = spy.mock.calls.map((c) => String(c[0])).filter((s) => /FROM quotes/i.test(s));
    spy.mockRestore();
    expect(reads).toHaveLength(1);
  });
});

describe('GET /api/quotes/:code: no PII (contract)', () => {
  const FORBIDDEN = ['customer', 'whatsapp', 'email', 'delivery_address', 'deliveryAddress', 'address', 'ip_hash', 'ipHash', 'consent', 'privacy', 'idempotency', 'cart_hash', 'client_cart_hash'];

  it('the SELECT is an explicit column list without PII columns and never *', () => {
    expect(PUBLIC_QUOTE_SQL).not.toMatch(/\*/);
    for (const col of ['customer_name', 'customer_whatsapp', 'customer_email', 'delivery_address', 'ip_hash', 'consent_at', 'privacy_notice_version', 'idempotency_key', 'client_cart_hash']) {
      expect(PUBLIC_QUOTE_SQL).not.toContain(col);
    }
    const selectList = PUBLIC_QUOTE_SQL.split(/\bFROM\b/)[0] ?? '';
    expect(selectList).not.toMatch(/\b(q|i)\.id\b/);
  });

  it('no response key or value carries customer or delivery_address data', async () => {
    const { code } = await create({
      customer: { name: 'Zoila Secreta Quinteros', whatsapp: '+50370004321', email: 'zoila.secreta@example.com' },
      delivery: { mode: 'delivery', zone: 'Santa Tecla', address: 'Pasaje Reservado 77, Colonia Oculta' },
    });
    const res = await get(t, code);
    const keys: string[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) {
          keys.push(k);
          // config is the customer's own cart snapshot; its keys are product options, not contact data
          if (k !== 'config') walk(x);
        }
    };
    walk(res.json());
    for (const k of keys) for (const f of FORBIDDEN) expect(k.toLowerCase(), k).not.toContain(f.toLowerCase());
    expect(res.body).not.toMatch(/Zoila|Quinteros|70004321|zoila\.secreta|Pasaje Reservado|Colonia Oculta/);
    expect(Object.keys(res.json()).sort()).toEqual(['code', 'createdAt', 'currency', 'delivery', 'expired', 'items', 'saved', 'validUntil']);
    expect(Object.keys(res.json<QuoteLoadResponse>().delivery).sort()).toEqual(['mode', 'zone']);
  });
});

describe('GET /api/quotes/:code: rate limit (rate_limits table)', () => {
  it('429 + Retry-After after the hourly query budget; per ip_hash; persisted in the table', async () => {
    const lim = await makeApp({ limits: { loadPerIpHour: 3, loadFailuresPerIpHour: 99 } });
    try {
      const { code } = await create({}, lim, '10.5.0.1');
      for (let i = 0; i < 3; i += 1) expect((await get(lim, code, '10.5.5.5')).statusCode).toBe(200);
      const res = await get(lim, code, '10.5.5.5');
      expect(res.statusCode).toBe(429);
      expect(res.json()).toMatchObject({ error: { code: 'rate_limited' } });
      const ra = Number(res.headers['retry-after']);
      expect(ra).toBeGreaterThan(0);
      expect(ra).toBeLessThanOrEqual(3600);
      expect(res.headers['cache-control']).toBe('no-store');
      expect((await get(lim, code, '10.5.5.6')).statusCode).toBe(200); // another IP
      const [rows] = await lim.pool.query('SELECT bucket, hits FROM rate_limits WHERE bucket LIKE "ql:%"');
      expect(JSON.stringify(rows)).not.toContain('10.5.5.5');
    } finally {
      await lim.close();
    }
  });

  it('429 after N failures (404/422) per hour, even for a valid folio afterwards', async () => {
    const lim = await makeApp({ limits: { loadFailuresPerIpHour: 3 } });
    try {
      const { code } = await create({}, lim, '10.6.0.1');
      expect((await get(lim, unknownCode(), '10.6.6.6')).statusCode).toBe(404);
      expect((await get(lim, 'zzz', '10.6.6.6')).statusCode).toBe(422);
      expect((await get(lim, unknownCode(), '10.6.6.6')).statusCode).toBe(404);
      const blocked = await get(lim, code, '10.6.6.6');
      expect(blocked.statusCode).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await lim.close();
    }
  });

  it('the counters survive an app restart (state lives in the DB)', async () => {
    const a = await makeApp({ limits: { loadPerIpHour: 2 } });
    const { code } = await create({}, a, '10.7.0.1');
    await get(a, code, '10.7.7.7');
    await get(a, code, '10.7.7.7');
    await a.close();
    const b = await makeApp({ limits: { loadPerIpHour: 2 } });
    try {
      expect((await get(b, code, '10.7.7.7')).statusCode).toBe(429);
    } finally {
      await b.close();
    }
  });
});
