// Pure aggregation layer over engine/pricing for the ventana/jardin products
// (S6). No React/window/document/fetch imports — safe to unit-test in
// isolation and safe to import from any step component.
//
// Gating rule (T6.3, prototype-spec.md §2.3): a `requiresQuote` line never
// hard-blocks checkout on its own. For "ventana" repeatable rows this means
// the AGGREGATE requiresQuote flag below only turns on when NOT A SINGLE row
// is priceable — individual rows keep their own requiresQuote flag (used to
// render the per-row chip and the WhatsApp fallback copy), but as long as at
// least one row is priced, Step1/Step2 must let the user continue.
import { priceGarden, priceWindow } from '@engine/pricing';
import type { CotizadorState } from './cotizadorStore';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Parses a comma/point decimal string; falls back to `fallback` when blank, NaN, or <= 0. */
function toPositiveNumber(raw: string, fallback: number): number {
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface WindowRowQuote {
  id: string;
  qty: number;
  widthM: number;
  heightM: number;
  /** null when this specific row requires a quote. */
  subtotal: number | null;
  requiresQuote: boolean;
}

export interface WindowQuote {
  rows: WindowRowQuote[];
  /** Sum of priced rows only (a requiresQuote row contributes $0 here, not null-poisoned). */
  subtotal: number | null;
  /** Aggregate gating flag — see module doc comment. */
  requiresQuote: boolean;
}

type WindowQuoteState = Pick<
  CotizadorState,
  'windowModel' | 'windowFrame' | 'windowGlass' | 'windowZaranda' | 'windowDesmontaje' | 'windowRows'
>;

export function computeWindowQuote(state: WindowQuoteState): WindowQuote {
  const rows: WindowRowQuote[] = state.windowRows.map((row) => {
    const qty = Math.min(50, Math.max(1, Math.round(toPositiveNumber(row.qty, 1))));
    const widthM = toPositiveNumber(row.widthM, 0);
    const heightM = toPositiveNumber(row.heightM, 0);
    const result = priceWindow({
      widthM,
      heightM,
      model: state.windowModel,
      frame: state.windowFrame,
      glass: state.windowGlass,
      zaranda: state.windowZaranda,
      desmontaje: state.windowDesmontaje,
      qty,
    });
    return { id: row.id, qty, widthM, heightM, subtotal: result.subtotal, requiresQuote: result.requiresQuote };
  });

  const pricedRows = rows.filter((r) => r.subtotal !== null);
  const subtotal = pricedRows.length > 0 ? round2(pricedRows.reduce((sum, r) => sum + (r.subtotal ?? 0), 0)) : null;
  const requiresQuote = pricedRows.length === 0;

  return { rows, subtotal, requiresQuote };
}

export interface GardenQuote {
  widthM: number;
  heightM: number;
  qty: number;
  subtotal: number | null;
  requiresQuote: boolean;
}

type GardenQuoteState = Pick<
  CotizadorState,
  'gardenHojas' | 'gardenWidth' | 'gardenHeightOption' | 'gardenHeightOtra' | 'gardenColor' | 'gardenGlass' | 'gardenQty'
>;

export function computeGardenQuote(state: GardenQuoteState): GardenQuote {
  const widthM = toPositiveNumber(state.gardenWidth, 0);
  const heightM =
    state.gardenHeightOption === 'otra'
      ? toPositiveNumber(state.gardenHeightOtra, 0)
      : parseFloat(state.gardenHeightOption);
  const qty = Math.min(50, Math.max(1, Math.round(toPositiveNumber(state.gardenQty, 1))));

  const result = priceGarden({
    widthM,
    heightM,
    hojas: state.gardenHojas,
    color: state.gardenColor,
    glass: state.gardenGlass,
    qty,
  });

  return { widthM, heightM, qty, subtotal: result.subtotal, requiresQuote: result.requiresQuote };
}
