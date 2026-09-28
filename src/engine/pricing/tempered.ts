// tempered — pure pricing module for "Templado 10 mm" (alto fijo 2.00m, no
// color/glass pickers). No React/Astro/window/document/fetch imports.
// Formula + check-values from exploratory-report.md §3.1. Price is
// pre-zone-fee — zone fee is added by the caller (see S7).
import { TEMPERED_RATE_PER_METER } from '@content/pricingTables';
import type { TemperedPriceInput, TemperedPriceResult } from './types';

export const TEMPERED_WIDTH_MIN_CM = 120;
export const TEMPERED_WIDTH_MAX_CM = 200;

export function isTemperedWidthInRange(widthCm: number): boolean {
  return Number.isFinite(widthCm) && widthCm >= TEMPERED_WIDTH_MIN_CM && widthCm <= TEMPERED_WIDTH_MAX_CM;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function priceTempered(input: TemperedPriceInput): TemperedPriceResult {
  const { widthCm } = input;

  if (!isTemperedWidthInRange(widthCm)) {
    return { price: null, requiresQuote: true };
  }

  const price = round2((widthCm / 100) * TEMPERED_RATE_PER_METER);
  return { price, requiresQuote: false };
}
