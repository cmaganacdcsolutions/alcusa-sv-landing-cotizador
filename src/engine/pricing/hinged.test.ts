import { describe, expect, it } from 'vitest';
import { isHingedQtyInRange, isHingedWidthInRange, priceHinged } from './hinged';

// Fixture values from exploratory-report.md §3.2, expressed as the S2
// product-cost subtotal (zone fee excluded, see S2-pricing-engine.md T2.3
// AC — these numbers are the derived subtotal, not the legacy UI total).
describe('engine/pricing/hinged — priceHinged', () => {
  it('prices 70cm natural claro qty1, no fixed panel (AC: $270, San Salvador zone-free case)', () => {
    const result = priceHinged({ widthCm: 70, color: 'natural', glass: 'claro', qty: 1 });
    expect(result).toEqual({ subtotal: 270, requiresQuote: false });
  });

  it('prices 70cm bronce claro qty1 via the color table (AC: $291)', () => {
    const result = priceHinged({ widthCm: 70, color: 'bronce', glass: 'claro', qty: 1 });
    expect(result).toEqual({ subtotal: 291, requiresQuote: false });
  });

  it('prices 65cm natural nevado qty2, tier rounds up to 70 (AC: $622 subtotal, legacy $702 with zone)', () => {
    const result = priceHinged({ widthCm: 65, color: 'natural', glass: 'nevado', qty: 2 });
    expect(result).toEqual({ subtotal: 622, requiresQuote: false });
  });

  it('prices 90cm blanco duplex qty1 + fijo 0.5x0.5 at the 0.8m2 minimum (AC: $569)', () => {
    const result = priceHinged({
      widthCm: 90,
      color: 'blanco',
      glass: 'duplex',
      qty: 1,
      fixedPanel: { widthM: 0.5, heightM: 0.5 },
    });
    expect(result).toEqual({ subtotal: 569, requiresQuote: false });
  });

  // ASSUMPTION(q17): encoded as $449 per the legacy source, flagged as a
  // likely transcription error vs $355 at 50cm (client-questions.md #17).
  // Do not silently change to $355 without client confirmation.
  it('prices 40cm blanco decorado qty1 as encoded ($449, ASSUMPTION q17)', () => {
    const result = priceHinged({ widthCm: 40, color: 'blanco', glass: 'decorado', qty: 1 });
    expect(result).toEqual({ subtotal: 449, requiresQuote: false });
  });

  it('flags requiresQuote below the valid width range (30cm)', () => {
    expect(priceHinged({ widthCm: 30, color: 'natural', glass: 'claro', qty: 1 })).toEqual({
      subtotal: null,
      requiresQuote: true,
    });
  });

  it('flags requiresQuote above the valid width range (100cm)', () => {
    expect(priceHinged({ widthCm: 100, color: 'natural', glass: 'claro', qty: 1 })).toEqual({
      subtotal: null,
      requiresQuote: true,
    });
  });

  it('flags requiresQuote for qty outside 1-50', () => {
    expect(priceHinged({ widthCm: 70, color: 'natural', glass: 'claro', qty: 0 }).requiresQuote).toBe(true);
    expect(priceHinged({ widthCm: 70, color: 'natural', glass: 'claro', qty: 51 }).requiresQuote).toBe(true);
  });

  it('reports the valid width and qty ranges', () => {
    expect(isHingedWidthInRange(40)).toBe(true);
    expect(isHingedWidthInRange(90)).toBe(true);
    expect(isHingedWidthInRange(39)).toBe(false);
    expect(isHingedWidthInRange(91)).toBe(false);
    expect(isHingedQtyInRange(1)).toBe(true);
    expect(isHingedQtyInRange(50)).toBe(true);
    expect(isHingedQtyInRange(0)).toBe(false);
    expect(isHingedQtyInRange(51)).toBe(false);
    expect(isHingedQtyInRange(1.5)).toBe(false);
  });
});
