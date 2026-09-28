// Shared pricing types. Pure types only, zero runtime code.
export type Currency = 'USD';

export interface Money {
  amount: number;
  currency: Currency;
}

// STRAIGHT ("Puerta de baño recta") — Slice 1 scope. Other products (corner,
// tempered, hinged, windows, garden) land in Slice 2 in the same shape.
export type AluminumColor = 'natural' | 'blanco' | 'bronce';
export type StraightGlass = 'claro' | 'nevado' | 'decorado' | 'mallado' | 'duplex';

export interface StraightPriceInput {
  widthCm: number;
  color: AluminumColor;
  glass: StraightGlass;
  pickup: boolean;
}

export interface StraightPriceResult {
  /** null when requiresQuote is true — out of the priceable width range. */
  price: number | null;
  /** true when transport is not needed (retiro en tienda). */
  transportIncluded: boolean;
  requiresQuote: boolean;
}
