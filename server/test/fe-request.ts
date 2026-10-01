// A realistic QuoteFolioRequest, shaped exactly like the FE builder's output
// (src/islands/Cotizador/state/quoteDocument.ts: toFolioRequest/toFolioItem). The builder itself is not
// imported: it drags the cotizador store (path aliases, DOM state) into the server's tsc program. The
// type annotation keeps it honest against the FE contract. Pure: usable by tests and scripts/.
import { randomUUID } from 'node:crypto';
import type { QuoteFolioRequest } from '../../src/lib/quote-folio/index.ts';

/** Full CartItem snapshot without `id` (the shape the cotizador stores as `config`). */
export function cartConfig(productId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    productId,
    width: '110',
    height: '185',
    color: 'natural',
    glass: 'claro',
    cornerModel: 'aquaclara',
    hingedQty: '1',
    hingedFixedPanelEnabled: false,
    hingedFixedPanelWidthM: '',
    hingedFixedPanelHeightM: '',
    windowModel: 'francesa',
    windowQty: '2',
    gardenHojas: '3',
    notes: 'Ñandú: instalación en planta alta, vidrio templado 6 mm "extra"',
    ...over,
  };
}

/** 2 items, installation in San Salvador, +503 WhatsApp, consent, versioned privacy notice. */
export function feRequest(over: Partial<QuoteFolioRequest> = {}): QuoteFolioRequest {
  return {
    idempotencyKey: randomUUID(),
    customer: { name: 'María José Peña', whatsapp: '+50371234567' },
    delivery: { mode: 'delivery', zone: 'San Salvador' },
    items: [
      {
        productSlug: 'recta',
        description: 'Puerta de baño recta · Natural · Claro · 110 × 185 cm',
        qty: 1,
        unitPrice: 222,
        lineTotal: 222,
        config: cartConfig('recta'),
        configSchemaVersion: 1,
        promoRef: null,
      },
      {
        productSlug: 'ventana-francesa',
        description: 'Ventana Francesa · Blanco · 120 × 100 cm',
        qty: 2,
        unitPrice: 108,
        lineTotal: 216,
        config: cartConfig('ventana-francesa'),
        configSchemaVersion: 1,
        promoRef: null,
      },
    ],
    transportFee: 25,
    total: 463,
    consent: true,
    privacyNoticeVersion: '2026-10-v1',
    ...over,
  };
}
