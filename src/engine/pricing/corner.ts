// corner — pure pricing module for "Cabina en L" (fixed 0.80x0.80x1.85m).
// No React/Astro/window/document/fetch imports. Formula + check-values from
// exploratory-report.md §3.1. Price is pre-zone-fee — zone fee is added by
// the caller (see S7 for the once-per-order transport calculation).
import { CORNER_BASE, CORNER_BRONCE_MULTIPLIER } from '@content/pricingTables';
import type { CornerPriceInput, CornerPriceResult } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function priceCorner(input: CornerPriceInput): CornerPriceResult {
  const { color, model } = input;

  // Blanco is not offered for corner (§3.1: "blanco not offered").
  if (color === 'blanco' || color === 'negro') {
    return { price: null, requiresQuote: true };
  }

  const base = CORNER_BASE[model];
  const price = color === 'bronce' ? round2(base * CORNER_BRONCE_MULTIPLIER) : base;

  return { price, requiresQuote: false };
}
