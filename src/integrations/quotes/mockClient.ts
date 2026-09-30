// Adaptador mock (dev/test): fixtures que cubren encontrada, precios cambiados,
// vencida, no encontrada, 429 y sin conexion. SOLO datos de muestra: cuando
// exista B6 se cambia PUBLIC_QUOTE_API=http y este archivo no se usa.
import { priceStraight } from '@engine/pricing';
import { makeQuoteCode } from './code';
import { QuoteLoadFailure, type QuoteClient, type QuoteLoadItem, type QuoteLoadResponse } from './types';

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const iso = (d: Date): string => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const daysAgo = (now: Date, n: number): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n));

/** Cuerpos (7 chars) de los folios de muestra; el digito de control se calcula. */
export const MOCK_BODIES = {
  found: 'K7QM3X9',
  changed: 'M4N8P2R',
  expired: 'B6C2D4F',
  rateLimited: 'R8S4T6V',
  offline: 'W2X4Y6Z',
  server: 'Z9Y8X7W',
} as const;
export type MockScenario = keyof typeof MOCK_BODIES;

/** Folios canonicos de muestra con fecha relativa a `now` (siempre cargables). */
export function mockCodes(now: Date = new Date()): Record<MockScenario, string> {
  const fresh = ymd(daysAgo(now, 2));
  const old = ymd(daysAgo(now, 20));
  return {
    found: makeQuoteCode(fresh, MOCK_BODIES.found),
    changed: makeQuoteCode(fresh, MOCK_BODIES.changed),
    expired: makeQuoteCode(old, MOCK_BODIES.expired),
    rateLimited: makeQuoteCode(fresh, MOCK_BODIES.rateLimited),
    offline: makeQuoteCode(fresh, MOCK_BODIES.offline),
    server: makeQuoteCode(fresh, MOCK_BODIES.server),
  };
}

// Base de un CartItem (sin id) como lo persistiria B3: snapshot completo.
const BASE = {
  width: '110',
  color: 'natural',
  glass: 'claro',
  cornerModel: 'aquaclara',
  hingedQty: '1',
  hingedFixedPanelEnabled: false,
  hingedFixedPanelWidthM: '',
  hingedFixedPanelHeightM: '',
  windowModel: 'francesa',
  windowFrame: 'blanco',
  windowGlass: 'claro',
  windowZaranda: false,
  windowDesmontaje: false,
  windowRows: [{ id: 'row-1', qty: '1', widthM: '1.20', heightM: '1.00' }],
  gardenHojas: 1,
  gardenWidth: '1.00',
  gardenHeightOption: '2.10',
  gardenHeightOtra: '',
  gardenColor: 'blanco',
  gardenGlass: 'claro',
  gardenQty: '1',
} as const;

const item = (
  position: number,
  slug: string,
  description: string,
  config: Record<string, unknown>,
  saved: number,
  extra: Partial<QuoteLoadItem> = {},
): QuoteLoadItem => ({
  position,
  productSlug: slug,
  description,
  qty: 1,
  savedUnitPrice: saved,
  savedLineTotal: saved,
  promoRef: null,
  configSchemaVersion: 1,
  config: { ...BASE, ...config },
  ...extra,
});

function build(code: string, createdAt: Date, expired: boolean, items: QuoteLoadItem[]): QuoteLoadResponse {
  const subtotal = items.reduce((s, i) => s + i.savedLineTotal, 0);
  const validUntil = new Date(createdAt.getTime() + 15 * 86_400_000);
  return {
    code,
    createdAt: iso(createdAt),
    validUntil: iso(validUntil),
    expired,
    currency: 'USD',
    delivery: { mode: 'pickup', zone: null },
    items,
    saved: { subtotal, transportFee: 0, total: subtotal },
  };
}

export function createMockQuoteClient(opts: { now?: () => Date; latencyMs?: number } = {}): QuoteClient {
  const now = opts.now ?? ((): Date => new Date());
  const latency = opts.latencyMs ?? 350;
  return {
    async getQuote(code, o) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, latency);
        o?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      const c = mockCodes(now());
      const fresh = daysAgo(now(), 2);
      switch (code) {
        case c.found:
          // savedLineTotal = precio de hoy del motor para recta 110 cm (sin cambio).
          return build(code, fresh, false, [
            item(0, 'recta', 'Puerta de baño recta', { productId: 'recta', width: '110' }, foundSaved()),
          ]);
        case c.changed:
          // Precios guardados distintos a los de hoy + un producto retirado.
          return build(code, fresh, false, [
            item(0, 'l-aquaclara', 'Puerta en L Aquaclara', { productId: 'l', cornerModel: 'aquaclara' }, 400),
            item(1, 'ventana-bilbao', 'Ventana Bilbao', { productId: 'ventana', windowModel: 'bilbao' }, 100, {
              promoRef: 'PROMO-MOCK',
            }),
            item(2, 'persiana-x', 'Producto retirado', { productId: 'persiana' }, 50),
          ]);
        case c.expired:
          return build(code, daysAgo(now(), 20), true, [
            item(0, 'templada-10mm', 'Puerta templada 10 mm', { productId: 'templado', width: '150' }, 600),
          ]);
        case c.rateLimited:
          throw new QuoteLoadFailure('rate_limited', 240);
        case c.offline:
          throw new QuoteLoadFailure('offline');
        case c.server:
          throw new QuoteLoadFailure('server_error');
        default:
          throw new QuoteLoadFailure('not_found');
      }
    },
  };
}

/** Guardado = precio de hoy del motor (recta 110 cm, retiro): "sin cambios". */
function foundSaved(): number {
  return priceStraight({ widthCm: 110, color: 'natural', glass: 'claro', pickup: true }).price ?? 0;
}
