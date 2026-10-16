export interface QuoteDocumentItem {
  name: string;
  /** "Variante / acabado" column (E25/E30). */
  variant: string;
  /** "ancho × alto", no unit (E26/E31). */
  measures: string;
  qty: number;
  /** Line price in USD (E33). */
  price: number;
  /** Se cotiza con un asesor: la columna de precio imprime "Por cotizar" y no suma al total. */
  pending?: boolean;
}

export interface QuoteDocument {
  /** Server folio or contingency folio with the U marker (ADR-011 §5). */
  folio: string;
  issuedAt: Date;
  /** `whatsapp` is the printed form "+503 ####-####" (E13d / E20). */
  customer: { name?: string; whatsapp?: string; zone?: string };
  items: QuoteDocumentItem[];
  /** Label after "Transporte ·" e.g. "Soyapango"; undefined prints "Transporte". */
  transportLabel?: string;
  transport: number;
  total: number;
  /** Distrito sin tarifa: the transport row prints "Por confirmar" instead of $0.00. */
  shippingPending?: boolean;
  /** Todos los items son solo-asesor: subtotal/total/anticipo/saldo imprimen "Por cotizar". */
  allPending?: boolean;
}

export interface QuoteFontBytes {
  fraunces600: ArrayBuffer | Uint8Array;
  manrope400: ArrayBuffer | Uint8Array;
  manrope700: ArrayBuffer | Uint8Array;
}

export interface QuotePdfAssets {
  fonts?: QuoteFontBytes;
  /** PNG bytes of the square logo (optional; omitted when missing). */
  logoPng?: ArrayBuffer | Uint8Array;
}
