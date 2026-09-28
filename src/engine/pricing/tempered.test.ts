import { describe, expect, it } from 'vitest';
import { isTemperedWidthInRange, priceTempered } from './tempered';

// Fixture values from exploratory-report.md §3.1 "Verified UI outputs"
// (Templado row), with the +$40 Soyapango zone fee subtracted — this module
// returns the pre-zone-fee price (S2-pricing-engine.md T2.2).
describe('engine/pricing/tempered — priceTempered', () => {
  it('prices 120cm (AC: $672, UI $712 incl. +40 zone)', () => {
    expect(priceTempered({ widthCm: 120 })).toEqual({ price: 672, requiresQuote: false });
  });

  it('prices 150cm (AC: $840, UI $880 incl. +40 zone)', () => {
    expect(priceTempered({ widthCm: 150 })).toEqual({ price: 840, requiresQuote: false });
  });

  it('prices 175cm (AC: $980, UI $1,020 incl. +40 zone)', () => {
    expect(priceTempered({ widthCm: 175 })).toEqual({ price: 980, requiresQuote: false });
  });

  it('prices 200cm (AC: $1,120, UI $1,160 incl. +40 zone)', () => {
    expect(priceTempered({ widthCm: 200 })).toEqual({ price: 1120, requiresQuote: false });
  });

  it('flags requiresQuote below the valid range (119cm)', () => {
    expect(priceTempered({ widthCm: 119 })).toEqual({ price: null, requiresQuote: true });
  });

  it('flags requiresQuote above the valid range (201cm)', () => {
    expect(priceTempered({ widthCm: 201 })).toEqual({ price: null, requiresQuote: true });
  });

  it('reports the valid width range', () => {
    expect(isTemperedWidthInRange(120)).toBe(true);
    expect(isTemperedWidthInRange(200)).toBe(true);
    expect(isTemperedWidthInRange(119)).toBe(false);
    expect(isTemperedWidthInRange(201)).toBe(false);
    expect(isTemperedWidthInRange(NaN)).toBe(false);
  });
});
