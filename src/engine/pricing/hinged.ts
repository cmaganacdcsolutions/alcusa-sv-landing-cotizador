// hinged — pure pricing module for "Puerta con bisagra" (alto fijo 1.85m).
// No React/Astro/window/document/fetch imports. Formula + check-values from
// exploratory-report.md §3.2.
//
// subtotal excludes transport — see S7 for the once-per-order transport
// calculation. Zone fee is NEVER added inside this function.
import {
  HINGED_FIXED_PANEL_MIN_M2,
  HINGED_FIXED_PANEL_RATE,
  HINGED_TABLE_COLOR,
  HINGED_TABLE_NATURAL,
} from '@content/pricingTables';
import type { HingedPriceInput, HingedPriceResult } from './types';

export const HINGED_WIDTH_MIN_CM = 40;
export const HINGED_WIDTH_MAX_CM = 90;
export const HINGED_QTY_MIN = 1;
export const HINGED_QTY_MAX = 50;

export function isHingedWidthInRange(widthCm: number): boolean {
  return Number.isFinite(widthCm) && widthCm >= HINGED_WIDTH_MIN_CM && widthCm <= HINGED_WIDTH_MAX_CM;
}

export function isHingedQtyInRange(qty: number): boolean {
  return Number.isInteger(qty) && qty >= HINGED_QTY_MIN && qty <= HINGED_QTY_MAX;
}

/** Rounds a width in cm UP to the next 10cm tier (40-90 range), as a string key. */
function hingedTierKey(widthCm: number): string {
  return String(Math.ceil(widthCm / 10) * 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fixedPanelCost(fixedPanel: HingedPriceInput['fixedPanel']): number {
  if (!fixedPanel) return 0;
  const area = Math.max(HINGED_FIXED_PANEL_MIN_M2, fixedPanel.widthM * fixedPanel.heightM);
  return round2(area * HINGED_FIXED_PANEL_RATE);
}

export function priceHinged(input: HingedPriceInput): HingedPriceResult {
  const { widthCm, color, glass, qty, fixedPanel } = input;

  if (!isHingedWidthInRange(widthCm) || !isHingedQtyInRange(qty)) {
    return { subtotal: null, requiresQuote: true };
  }

  const tier = hingedTierKey(widthCm);
  const table = color === 'natural' ? HINGED_TABLE_NATURAL : HINGED_TABLE_COLOR;
  // ASSUMPTION(q17): 40cm decorado (color table) is encoded as $449, matching
  // the legacy source verbatim even though it looks like a transcription
  // error against 50cm's $355 (client-questions.md #17). Do not "fix" this
  // without a client answer landing in client-questions.md.
  const base = table[tier][glass];

  const subtotal = round2((base + fixedPanelCost(fixedPanel)) * qty);
  return { subtotal, requiresQuote: false };
}
