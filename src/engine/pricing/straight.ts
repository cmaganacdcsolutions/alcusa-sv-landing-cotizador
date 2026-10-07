// straight — pure pricing module for "Puerta de baño recta" (Slice 1 scope).
// No React/Astro/window/document/fetch imports. Formula + check-values from
// exploratory-report.md §3.1. S2 adds the other products in this same shape.
import {
  AQUAFOLD_PROMO_MAX_CM,
  AQUAFOLD_PROMO_MIN_CM,
  AQUAFOLD_PROMO_PRICE,
  STRAIGHT_PROMO, STRAIGHT_TABLE_COLOR, STRAIGHT_TABLE_NATURAL,
} from '@content/pricingTables';
import type { BaseGlass, StraightPriceInput, StraightPriceResult } from './types';

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

  const aquafoldPromo =
    glass === 'aquafold' &&
    color === 'natural' &&
    widthCm >= AQUAFOLD_PROMO_MIN_CM &&
    widthCm <= AQUAFOLD_PROMO_MAX_CM;
  // PENDIENTE DE ALCUSA: Aquafold fuera de 1.00-1.20 m (o con aluminio blanco/bronce)
  // no tiene precio oficial; se cotiza con la tabla/promo de "decorado" hasta que
  // Alcusa confirme.
  const tableGlass: BaseGlass = glass === 'aquafold' ? 'decorado' : glass;

  const isPromo =
    !aquafoldPromo &&
    color === 'natural' &&
    widthCm >= 80 &&
    widthCm <= 120 &&
    (tableGlass === 'claro' || tableGlass === 'nevado' || tableGlass === 'decorado');

  let base: number;
  if (aquafoldPromo) {
    base = AQUAFOLD_PROMO_PRICE;
  } else if (isPromo) {
    base = STRAIGHT_PROMO[tableGlass as 'claro' | 'nevado' | 'decorado'];
  } else {
    const tier = straightTierMeters(widthCm);
    const table = color === 'natural' ? STRAIGHT_TABLE_NATURAL : STRAIGHT_TABLE_COLOR;
    base = table[tier.toFixed(1)][tableGlass];
  }

  const price = pickup ? round2(base * 0.85) : base;

  return { price, transportIncluded: pickup, requiresQuote: false };
}
