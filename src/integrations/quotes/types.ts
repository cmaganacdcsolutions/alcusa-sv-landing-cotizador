// Contrato ADR-012 §3 (GET /api/quotes/{code}). Importes en USD (decimales);
// B3/B6 deben confirmar si la convencion final es centavos enteros.
export interface QuoteLoadItem {
  position: number;
  productSlug: string;
  description: string;
  qty: number;
  savedUnitPrice: number;
  savedLineTotal: number;
  promoRef: string | null;
  configSchemaVersion: number;
  config: Record<string, unknown>;
}

export interface QuoteLoadResponse {
  code: string;
  createdAt: string;
  validUntil: string;
  expired: boolean;
  currency: 'USD';
  delivery: { mode: 'pickup' | 'delivery'; zone: string | null };
  items: QuoteLoadItem[];
  saved: { subtotal: number; transportFee: number; total: number };
}

export type QuoteLoadErrorCode = 'invalid_code' | 'not_found' | 'rate_limited' | 'server_error';
/** `offline` = no hubo respuesta (red caida); nunca viene del servidor. */
export type QuoteLoadFailureCode = QuoteLoadErrorCode | 'offline';

export interface QuoteLoadError {
  error: { code: QuoteLoadErrorCode; message: string };
}

export class QuoteLoadFailure extends Error {
  readonly code: QuoteLoadFailureCode;
  readonly retryAfterSec?: number;
  constructor(code: QuoteLoadFailureCode, retryAfterSec?: number) {
    super(code);
    this.name = 'QuoteLoadFailure';
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

export interface QuoteClient {
  /** `code` ya normalizado (canonico). Rechaza con QuoteLoadFailure. */
  getQuote(code: string, opts?: { signal?: AbortSignal }): Promise<QuoteLoadResponse>;
}
