import { describe, expect, it } from 'vitest';
import { priceStraight, isStraightWidthInRange, straightTierMeters } from './straight';

// Fixture values taken verbatim from exploratory-report.md §3.1 and the
// acceptance criteria in docs/product/slices/S1-tracer-bullet.md T1.2/T1.3.
describe('engine/pricing/straight — priceStraight', () => {
  it('applies the promo band for 110cm Natural Claro (AC: $222)', () => {
    const result = priceStraight({ widthCm: 110, color: 'natural', glass: 'claro', pickup: false });
    expect(result).toEqual({ price: 222, transportIncluded: false, requiresQuote: false });
  });

  it('applies Table C tier 1.3 for 125cm Blanco Claro (AC: $366)', () => {
    const result = priceStraight({ widthCm: 125, color: 'blanco', glass: 'claro', pickup: false });
    expect(result).toEqual({ price: 366, transportIncluded: false, requiresQuote: false });
  });

  it('flags requiresQuote below the valid range (75cm)', () => {
    const result = priceStraight({ widthCm: 75, color: 'natural', glass: 'claro', pickup: false });
    expect(result).toEqual({ price: null, transportIncluded: false, requiresQuote: true });
  });

  it('flags requiresQuote above the valid range (201cm)', () => {
    const result = priceStraight({ widthCm: 201, color: 'natural', glass: 'claro', pickup: false });
    expect(result.requiresQuote).toBe(true);
    expect(result.price).toBeNull();
  });

  it('applies the 15% pickup discount, no promo band (110cm Natural Claro, retiro): $188.70', () => {
    const result = priceStraight({ widthCm: 110, color: 'natural', glass: 'claro', pickup: true });
    expect(result).toEqual({ price: 188.7, transportIncluded: true, requiresQuote: false });
  });

  it('applies promo for Nevado and Con diseño within 80-120cm Natural', () => {
    expect(priceStraight({ widthCm: 110, color: 'natural', glass: 'nevado', pickup: false }).price).toBe(290);
    expect(priceStraight({ widthCm: 110, color: 'natural', glass: 'decorado', pickup: false }).price).toBe(325);
  });

  it('falls back to Table N outside the promo band (110cm Natural Mallado): $321', () => {
    const result = priceStraight({ widthCm: 110, color: 'natural', glass: 'mallado', pickup: false });
    expect(result.price).toBe(321);
  });

  it('rounds width up to the next 10cm tier, floor 1.00m (200cm Natural Claro): $407', () => {
    expect(priceStraight({ widthCm: 200, color: 'natural', glass: 'claro', pickup: false }).price).toBe(407);
    expect(straightTierMeters(80)).toBe(1.0);
    expect(straightTierMeters(200)).toBe(2.0);
  });

  it('prices Bronce the same as Blanco via Table C (110cm Bronce Claro): $332', () => {
    expect(priceStraight({ widthCm: 110, color: 'bronce', glass: 'claro', pickup: false }).price).toBe(332);
  });

  it('reports the valid width range', () => {
    expect(isStraightWidthInRange(80)).toBe(true);
    expect(isStraightWidthInRange(200)).toBe(true);
    expect(isStraightWidthInRange(79)).toBe(false);
    expect(isStraightWidthInRange(201)).toBe(false);
    expect(isStraightWidthInRange(NaN)).toBe(false);
  });

  it('aquafold promo is 279.99 for 100/110/120 cm natural', () => {
    for (const widthCm of [100, 110, 120]) {
      expect(priceStraight({ widthCm, color: 'natural', glass: 'aquafold', pickup: false }).price).toBe(279.99);
    }
  });

  it('aquafold outside the promo range mirrors decorado (pendiente de Alcusa)', () => {
    expect(priceStraight({ widthCm: 130, color: 'natural', glass: 'aquafold', pickup: false }).price).toBe(371);
    expect(priceStraight({ widthCm: 110, color: 'bronce', glass: 'aquafold', pickup: false }).price).toBe(407);
  });
});
