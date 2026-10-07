// Online-card discount rule for quotes (confirmed by the client owner 2026-10-06).
// Mirrors the browser (src/engine/pricing/onlineDiscount.ts) and api/_lib/wompi-pricing.php:
//   discount = 10% of the item subtotals (which already carry the "retiro" -15%), never over shipping;
//   total    = subtotal - discount + transport (transport 0 when shippingPending).
// The server recomputes the discount and never trusts the browser's number.
export const ONLINE_DISCOUNT_CODE = 'online_card_10';
export const ONLINE_DISCOUNT_PERCENT = 10;
/** One cent of slack: JS Math.round (browser) and PHP round() disagree on exact half-cents. */
export const DISCOUNT_TOLERANCE_CENTS = 1;

/** round(10% of the subtotal), in integer cents. */
export function expectedDiscountCents(subtotalCents: number): number {
  return Math.round((subtotalCents * ONLINE_DISCOUNT_PERCENT) / 100);
}

export function discountMatches(amountCents: number, subtotalCents: number): boolean {
  return amountCents > 0 && Math.abs(amountCents - expectedDiscountCents(subtotalCents)) <= DISCOUNT_TOLERANCE_CENTS;
}
