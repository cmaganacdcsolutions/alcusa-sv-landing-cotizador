import { describe, expect, it, vi } from 'vitest';
import { resolveWompiMode } from './config';
import {
  createWompiPaymentLink,
  loadPendingPayment,
  parseWompiReturn,
  WompiClientError,
} from './client';

const req = {
  pct: 80 as const,
  total: 1148,
  items: [{ name: 'Puerta', subtotal: 1148 }],
};
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('resolveWompiMode', () => {
  it('only "wompi" enables the gateway; everything else is mock', () => {
    expect(resolveWompiMode('wompi')).toBe('wompi');
    expect(resolveWompiMode('mock')).toBe('mock');
    expect(resolveWompiMode('live')).toBe('mock');
    expect(resolveWompiMode(undefined)).toBe('mock');
  });
});

describe('createWompiPaymentLink', () => {
  it('posts the cart (no amount) to our own endpoint and returns the link', async () => {
    const f = vi.fn(() =>
      json(201, {
        urlEnlace: 'https://lk.wompi.sv/abcd',
        reference: 'ALC-2026-7F3A9C',
        amount: 918.4,
      }),
    );
    const out = await createWompiPaymentLink(req, f as unknown as typeof fetch);
    expect(out.urlEnlace).toBe('https://lk.wompi.sv/abcd');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/wompi-create-link');
    expect(JSON.parse(init.body as string)).not.toHaveProperty('amount');
  });

  it('maps the server error envelope to WompiClientError', async () => {
    const f = () =>
      json(422, { error: { code: 'invalid_total', message: 'fuera de rango' } });
    await expect(
      createWompiPaymentLink(req, f as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'invalid_total' });
  });

  it('discount drift (invalid_discount / discount_mismatch) keeps the code but hides the server message', async () => {
    for (const code of ['invalid_discount', 'discount_mismatch']) {
      const f = () => json(422, { error: { code, message: 'esperado 22.20 recibido 20.00' } });
      const err = await createWompiPaymentLink(req, f as unknown as typeof fetch).catch((e: unknown) => e);
      expect(err).toMatchObject({ code });
      expect((err as Error).message).not.toContain('22.20');
      expect((err as Error).message).toContain('descuento');
    }
  });

  it('sends discount and shippingPending only when present, total already discounted', async () => {
    let body = '';
    const f = (_u: string, init: RequestInit) => {
      body = String(init.body);
      return json(200, { urlEnlace: 'https://checkout.wompi.sv/l/x', reference: 'ALC-2026-7F3A9C', amount: 191.84 });
    };
    await createWompiPaymentLink(
      { pct: 80, total: 239.8, items: [{ name: 'Puerta', subtotal: 222 }], discount: { code: 'online_card_10', amount: 22.2 } },
      f as unknown as typeof fetch,
    );
    expect(JSON.parse(body)).toMatchObject({ total: 239.8, discount: { code: 'online_card_10', amount: 22.2 } });
    expect(JSON.parse(body)).not.toHaveProperty('shippingPending');
  });

  it('rejects a non-https link and network failures with a generic message', async () => {
    const bad = () =>
      json(201, { urlEnlace: 'http://evil.test', reference: 'ALC-2026-7F3A9C' });
    await expect(
      createWompiPaymentLink(req, bad as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(WompiClientError);
    const down = () => Promise.reject(new TypeError('failed'));
    await expect(
      createWompiPaymentLink(req, down as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'network' });
  });
});

describe('parseWompiReturn', () => {
  it('reads pago + ref from the fragment', () => {
    expect(
      parseWompiReturn('#cotizador/7-resultado?pago=aprobado&ref=ALC-2026-7F3A9C'),
    ).toEqual({ pago: 'aprobado', ref: 'ALC-2026-7F3A9C' });
    expect(parseWompiReturn('#cotizador/7-resultado?pago=pendiente')).toEqual({
      pago: 'pendiente',
      ref: null,
    });
  });
  it('ignores anything else', () => {
    expect(parseWompiReturn('#cotizador/7-resultado')).toBeNull();
    expect(parseWompiReturn('#cotizador/7-resultado?pago=hack')).toBeNull();
    expect(parseWompiReturn('#cotizador/4-resumen?pago=aprobado')).toBeNull();
  });
});

describe('loadPendingPayment', () => {
  it('validates the stored snapshot', () => {
    const ok = {
      getItem: () =>
        JSON.stringify({
          reference: 'ALC-2026-7F3A9C',
          pct: 80,
          zone: 'Soyapango',
          entrega: 'retiro',
        }),
    };
    expect(loadPendingPayment(ok)?.entrega).toBe('retiro');
    expect(
      loadPendingPayment({ getItem: () => JSON.stringify({ pct: 50, reference: 'x' }) }),
    ).toBeNull();
    expect(loadPendingPayment({ getItem: () => 'not json' })).toBeNull();
  });
});
