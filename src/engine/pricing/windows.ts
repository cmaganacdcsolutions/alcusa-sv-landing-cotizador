// windows — pure pricing module for "Ventana Francesa o Bilbao". No
// React/Astro/window/document/fetch imports. Formula + check-values from
// exploratory-report.md §3.3.
//
// subtotal excludes transport — see S7 for the once-per-order transport
// calculation. Zone fee is NEVER added inside this function.
//
// Deviation from S2-pricing-engine.md's literal param list: a `frame`
// (AluminumColor) field was added. It's required to implement "Natural
// frame → requiresQuote" (§3.3) — the doc's signature omits frame color but
// the source rules can't be encoded without it. Flagged to fe-senior-react
// in the HANDOFF.
import {
  WINDOW_DESMONTAJE_FLAT,
  WINDOW_GLASS_FACTOR_CLEAR,
  WINDOW_GLASS_FACTOR_OTHER,
  WINDOW_MIN_AREA_M2,
  WINDOW_RATE,
  WINDOW_ZARANDA_RATE_PER_M2,
} from '@content/pricingTables';
import type { WindowPriceInput, WindowPriceResult } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function priceWindow(input: WindowPriceInput): WindowPriceResult {
  const { widthM, heightM, model, frame, glass, zaranda, desmontaje, qty } = input;

  // Priced only for frame white/bronze and glass clear/bronze/frosted/gray/
  // reflective-azul; Natural frame or Reflectivo bronce → pendiente de
  // cotización (§3.3).
  if (frame === 'natural' || glass === 'reflectivo_bronce') {
    return { subtotal: null, requiresQuote: true };
  }

  const area = Math.max(WINDOW_MIN_AREA_M2, widthM * heightM);
  const glassFactor = glass === 'claro' ? WINDOW_GLASS_FACTOR_CLEAR : WINDOW_GLASS_FACTOR_OTHER;
  const base = area * WINDOW_RATE[model] * glassFactor;
  const zarandaCost = zaranda ? area * WINDOW_ZARANDA_RATE_PER_M2 : 0;
  const desmontajeCost = desmontaje ? WINDOW_DESMONTAJE_FLAT : 0;

  const perWindow = base + zarandaCost + desmontajeCost;
  const subtotal = round2(perWindow * qty);

  return { subtotal, requiresQuote: false };
}
