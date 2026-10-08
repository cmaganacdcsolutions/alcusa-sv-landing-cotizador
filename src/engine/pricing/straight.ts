// straight — pure pricing module for "Puerta de baño recta" (Slice 1 scope).
// No React/Astro/window/document/fetch imports. Formula + check-values from
// exploratory-report.md §3.1. S2 adds the other products in this same shape.
import { STRAIGHT_TABLE_COLOR, STRAIGHT_TABLE_NATURAL } from '@content/pricingTables';
import type { StraightPriceInput, StraightPriceResult } from './types';

export const STRAIGHT_WIDTH_MIN_CM = 80;
export const STRAIGHT_WIDTH_MAX_CM = 200;
export const STRAIGHT_ALTO_M = 1.85;

export function isStraightWidthInRange(widthCm: number): boolean {
  return Number.isFinite(widthCm) && widthCm >= STRAIGHT_WIDTH_MIN_CM && widthCm <= STRAIGHT_WIDTH_MAX_CM;
}

/** Rounds a width in cm UP to the next 10cm tier, floor 1.00m, returned in meters. */
export function straightTierMeters(widthCm: number): number {
  const tierCm = Math.max(100, Math.ceil(widthCm / 10) * 10);
  return tierCm / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function priceStraight(input: StraightPriceInput): StraightPriceResult {
  const { widthCm, color, glass, pickup } = input;

  if (!isStraightWidthInRange(widthCm)) {
    return { price: null, transportIncluded: false, requiresQuote: true };
  }

  // Contexto NORMAL (sin `?promo=`): no hay precios promocionales. Las 3 promos viven en
  // content/promotions.json y se cotizan en state/quote.ts (promoQuote) solo con la entrada por promo.
  // Aquafold no tiene precio regular oficial todavia: se cotiza con asesor (WhatsApp) en toda medida.
  if (glass === 'aquafold') {
    return { price: null, transportIncluded: false, requiresQuote: true };
  }
  // Aluminio NEGRO (2026-10-08): sin precio oficial; siempre se cotiza con asesor (WhatsApp).
  if (color === 'negro') {
    return { price: null, transportIncluded: false, requiresQuote: true };
  }
  const tier = straightTierMeters(widthCm);
  const table = color === 'natural' ? STRAIGHT_TABLE_NATURAL : STRAIGHT_TABLE_COLOR;
  const row = table[tier.toFixed(1)];
  if (!row) return { price: null, transportIncluded: false, requiresQuote: true };
  const base = row[glass];

  const price = pickup ? round2(base * 0.85) : base;

  return { price, transportIncluded: pickup, requiresQuote: false };
}
