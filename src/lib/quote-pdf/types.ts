export interface QuoteDocumentItem {
  name: string;
  /** "Variante / acabado" column (E25/E30). */
  variant: string;
  /** "ancho × alto", no unit (E26/E31). */
  measures: string;
  qty: number;
  /** Line price in USD (E33). */
  price: number;
}

export interface QuoteDocument {
  /** Server folio or contingency folio starting with L (ADR-012). */
  folio: string;
  issuedAt: Date;
  customer: { name?: string; phone?: string; zone?: string };
  items: QuoteDocumentItem[];
  /** Label after "Transporte ·" e.g. "Soyapango"; undefined prints "Transporte". */
  transportLabel?: string;
  transport: number;
  total: number;
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
