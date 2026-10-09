// Shared Wompi request/response types (browser <-> our api/* only).
// The browser never talks to Wompi and never sees a Wompi credential (ADR-003).

/** PUBLIC_COTIZADOR_MODE. Anything other than 'wompi' resolves to mock. */
export type WompiMode = 'mock' | 'wompi';

export interface CreateLinkItem {
  name: string;
  subtotal: number;
}

/** POST /api/wompi-create-link. No amount to charge: the server derives it. */
export interface CreateLinkRequest {
  pct: 80 | 100;
  /** What the customer pays: sum(items) - discount.amount + transport (already discounted). */
  total: number;
  /** Undiscounted item subtotals. */
  items: CreateLinkItem[];
  /** 10% online-card discount; present only when it applies. The server validates the arithmetic. */
  discount?: CreateLinkDiscount;
  /** Distrito sin tarifa: envio "por confirmar" (no esta sumado en `total`). */
  shippingPending?: boolean;
  /** Orden en contexto promo (`?promo=<id>`): va SIN descuento; el server rechaza un 10% sobre una promo. */
  promoId?: string;
}

export interface CreateLinkDiscount {
  code: 'online_card_10';
  /** Positive amount subtracted from the items sum. */
  amount: number;
}

export interface CreateLinkResponse {
  urlEnlace: string;
  reference: string;
  amount: number;
}

/** Stable error envelope of every api/wompi-* endpoint. */
export interface ApiErrorEnvelope {
  error: { code: string; message: string };
}

/** Result the return endpoint puts in `#cotizador/7-resultado?pago=...&ref=...`. */
export type ReturnOutcome = 'aprobado' | 'rechazado' | 'pendiente';

export interface WompiReturn {
  pago: ReturnOutcome;
  ref: string | null;
}

/** Snapshot kept across the redirect to Wompi (the wizard state does not survive it). */
export interface PendingPayment {
  reference: string;
  pct: 80 | 100;
  zone: string;
  /** Direccion de entrega (solo instalacion); se restaura al volver de Wompi. */
  address?: unknown;
  entrega: 'instalacion' | 'retiro';
  /** Contexto promo con el que se pago; se restaura al volver de Wompi. */
  promoId?: string | null;
}
