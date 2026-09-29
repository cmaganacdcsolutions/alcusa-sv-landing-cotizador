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
    expect(url).toBe('/api/wompi-create-link.php');
    expect(JSON.parse(init.body as string)).not.toHaveProperty('amount');
  });

  it('maps the server error envelope to WompiClientError', async () => {
    const f = () =>
      json(422, { error: { code: 'invalid_total', message: 'fuera de rango' } });
    await expect(
      createWompiPaymentLink(req, f as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'invalid_total' });
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
