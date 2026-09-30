// Single source of company data printed on the quote PDF (board pdf-r08).
// Nothing in render.ts is hardcoded: every value here carries `placeholder`
// so the HANDOFF "DATOS A CARGAR" list can be derived from it. When the
// client confirms a value (or the backend serves it), flip `placeholder`
// to false / replace `value`; the renderer does not change.

export interface ConfigValue<T> {
  value: T;
  /** true = unconfirmed by the client (pending) */
  placeholder: boolean;
}

export interface ContactChannel {
  label: string;
  value: string;
}

export interface QuoteCompanyConfig {
  name: string;
  /** Not in board pdf-r08: optional, not printed until the client provides and design places them. */
  address?: ConfigValue<string>;
  nit?: ConfigValue<string>;
  nrc?: ConfigValue<string>;
  whatsappDisplay: string;
  /** pdf-r08 E62..E69 order: row1 col1, row1 col2, row2 col1, row2 col2 */
  channels: ContactChannel[];
  /** Printed as "Válida por N días" (E11). Pending client confirmation. */
  validityDays: ConfigValue<number>;
  /** E59. Until confirmed (placeholder) the PDF omits the IVA line/box entirely (board rule). */
  ivaNote: ConfigValue<string>;
  currencyNote: string;
  /** E41..E48 anticipo/saldo scheme. */
  paymentScheme: { anticipoPct: number };
  logoUrl: string;
  fontUrls: { fraunces600: string; manrope400: string; manrope700: string };
  author: string;
  language: string;
}

export const QUOTE_COMPANY: QuoteCompanyConfig = {
  name: 'Alcusa',
  whatsappDisplay: '+503 7680-2410',
  channels: [
    { label: 'Instagram', value: 'alcusasv' }, // printed as the client gave it (no @); confirm
    { label: 'TikTok', value: '@alcusaes' },
    { label: 'YouTube', value: '@alcusaelsalvador8209' },
  ],
  validityDays: { value: 15, placeholder: true },
  ivaNote: { value: 'IVA: [confirmar — incluido / no incluido].', placeholder: true },
  currencyNote: 'Precios en dólares estadounidenses (USD).',
  paymentScheme: { anticipoPct: 80 },
  logoUrl: '/brand/pdf-logo.png',
  fontUrls: {
    fraunces600: '/fonts/pdf/fraunces-latin-600-normal.ttf',
    manrope400: '/fonts/pdf/manrope-latin-400-normal.ttf',
    manrope700: '/fonts/pdf/manrope-latin-700-normal.ttf',
  },
  author: 'ALCUSA',
  language: 'es-SV',
};

/** Every unconfirmed datum (drives the HANDOFF list and a unit test). */
export function pendingCompanyData(c: QuoteCompanyConfig = QUOTE_COMPANY): string[] {
  const out: string[] = [];
  if (c.validityDays.placeholder) out.push('validityDays');
  if (c.ivaNote.placeholder) out.push('ivaNote');
  for (const k of ['address', 'nit', 'nrc'] as const) if (c[k]?.placeholder) out.push(k);
  return out;
}
