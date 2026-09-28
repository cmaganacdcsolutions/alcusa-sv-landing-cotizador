// garden — pure pricing module for "Puerta de jardín". No
// React/Astro/window/document/fetch imports. Formula + check-values from
// exploratory-report.md §3.4.
//
// subtotal excludes transport — see S7 for the once-per-order transport
// calculation. Zone fee is NEVER added inside this function.
import { GARDEN_PROMO_BANDS, GARDEN_PROMO_HEIGHTS_M, GARDEN_RATE_PER_M2 } from '@content/pricingTables';
import type { GardenPriceInput, GardenPriceResult } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isPromoHeight(heightM: number): boolean {
  return GARDEN_PROMO_HEIGHTS_M.some((h) => h === heightM);
}

export function priceGarden(input: GardenPriceInput): GardenPriceResult {
  const { widthM, heightM, hojas, color, glass, qty } = input;

  // Priced only with white frame + clear glass; other frames/glasses require
  // a quote (§3.4).
  if (color !== 'blanco' || glass !== 'claro') {
    return { subtotal: null, requiresQuote: true };
  }

  let unitPrice: number;

  // ASSUMPTION(q16): 'custom' ("A la medida") always uses the m² formula,
  // even when width/height happen to coincide with a promo band — this
  // matches the legacy source's own inversion (e.g. 1.00x2.10 = $399, m²,
  // cheaper than the $410 promo it would otherwise qualify for). Flagged in
  // client-questions.md #16 ("Inversión de precio en puertas de jardín").
  // Do not "fix" without a client answer landing there.
  const band = hojas === 'custom' ? undefined : GARDEN_PROMO_BANDS[hojas];
  const inPromoBand = band !== undefined && isPromoHeight(heightM) && widthM >= band.minWidthM && widthM <= band.maxWidthM;

  if (inPromoBand && band) {
    unitPrice = band.price;
  } else {
    unitPrice = round2(widthM * heightM * GARDEN_RATE_PER_M2);
  }

  const subtotal = round2(unitPrice * qty);
  return { subtotal, requiresQuote: false };
}
