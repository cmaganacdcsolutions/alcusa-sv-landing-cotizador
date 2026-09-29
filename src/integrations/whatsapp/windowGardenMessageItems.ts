// Maps the ventana/jardin (S6) quote shapes into buildMessage.ts's already
// generic `QuoteMessageItem[]` — no changes needed to buildMessage.ts itself,
// its §2.6 template already repeats "items" per line. Pure mapping only, no
// pricing math here (that lives in state/quoteWindowGarden.ts).
import type { QuoteMessageItem } from './buildMessage';
import type { WindowRowQuote } from '@islands/Cotizador/state/quoteWindowGarden';

export type EntregaLabel = 'con instalación' | 'retiro en tienda';

export interface WindowMessageContext {
  modelLabel: string;
  frameLabel: string;
  glassLabel: string;
  zona: string;
  entrega: EntregaLabel;
}

/** One item per repeatable row (T6.1). A requiresQuote row keeps its $0 subtotal
 * but its vidrio field is annotated so the advisor sees it needs a manual quote. */
export function buildWindowMessageItems(rows: WindowRowQuote[], ctx: WindowMessageContext): QuoteMessageItem[] {
  return rows.map((row) => ({
    producto: `Ventana ${ctx.modelLabel}`,
    anchoM: row.widthM,
    altoM: row.heightM,
    color: ctx.frameLabel,
    vidrio: row.requiresQuote ? `${ctx.glassLabel} (cotización personalizada)` : ctx.glassLabel,
    zona: ctx.zona,
    entrega: ctx.entrega,
    subtotal: row.subtotal ?? 0,
  }));
}

export interface GardenMessageInput {
  hojasLabel: string;
  widthM: number;
  heightM: number;
  colorLabel: string;
  glassLabel: string;
  subtotal: number | null;
  requiresQuote: boolean;
  zona: string;
  entrega: EntregaLabel;
}

export function buildGardenMessageItem(input: GardenMessageInput): QuoteMessageItem {
  return {
    producto: `Puerta de jardín · ${input.hojasLabel}`,
    anchoM: input.widthM,
    altoM: input.heightM,
    color: input.colorLabel,
    vidrio: input.requiresQuote ? `${input.glassLabel} (cotización personalizada)` : input.glassLabel,
    zona: input.zona,
    entrega: input.entrega,
    subtotal: input.subtotal ?? 0,
  };
}
