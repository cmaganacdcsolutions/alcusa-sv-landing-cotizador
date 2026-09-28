// Shared pricing types. No runtime code — implemented alongside Slice 2.
export type Currency = 'USD';

export interface Money {
  amount: number;
  currency: Currency;
}
