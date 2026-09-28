import { describe, expect, it } from 'vitest';
import { priceCorner } from './corner';

// Fixture values from exploratory-report.md §3.1 "Verified UI outputs"
// (L Natural/Bronce rows), with the +$40 Soyapango zone fee subtracted —
// this module returns the pre-zone-fee price (S2-pricing-engine.md T2.2).
describe('engine/pricing/corner — priceCorner', () => {
  it('prices Natural Aquaclara (AC: $444, UI $484 incl. +40 zone)', () => {
    expect(priceCorner({ color: 'natural', model: 'aquaclara' })).toEqual({ price: 444, requiresQuote: false });
  });

  it('prices Natural Frosted (AC: $580, UI $620 incl. +40 zone)', () => {
    expect(priceCorner({ color: 'natural', model: 'frosted' })).toEqual({ price: 580, requiresQuote: false });
  });

  it('prices Natural Aquafold (AC: $650, UI $690 incl. +40 zone)', () => {
    expect(priceCorner({ color: 'natural', model: 'aquafold' })).toEqual({ price: 650, requiresQuote: false });
  });

  it('applies the bronce x1.10 multiplier (AC: $488.40, UI $528.40 incl. +40 zone)', () => {
    expect(priceCorner({ color: 'bronce', model: 'aquaclara' })).toEqual({ price: 488.4, requiresQuote: false });
  });

  it('applies the bronce x1.10 multiplier to Frosted (AC: $638, UI $678 incl. +40 zone)', () => {
    expect(priceCorner({ color: 'bronce', model: 'frosted' })).toEqual({ price: 638, requiresQuote: false });
  });

  it('applies the bronce x1.10 multiplier to Aquafold (AC: $715, UI $755 incl. +40 zone)', () => {
    expect(priceCorner({ color: 'bronce', model: 'aquafold' })).toEqual({ price: 715, requiresQuote: false });
  });

  it('flags requiresQuote for blanco (not offered for corner)', () => {
    expect(priceCorner({ color: 'blanco', model: 'aquaclara' })).toEqual({ price: null, requiresQuote: true });
  });
});
