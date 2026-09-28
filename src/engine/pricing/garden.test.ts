import { describe, expect, it } from 'vitest';
import { priceGarden } from './garden';

// Fixture values from exploratory-report.md §3.4, expressed as the S2
// product-cost subtotal (zone fee excluded, see S2-pricing-engine.md T2.3).
describe('engine/pricing/garden — priceGarden', () => {
  it('applies the 1-hoja promo at exact height 2.10m (AC: $410)', () => {
    const result = priceGarden({ widthM: 1.0, heightM: 2.1, hojas: 1, color: 'blanco', glass: 'claro', qty: 1 });
    expect(result).toEqual({ subtotal: 410, requiresQuote: false });
  });

  it('applies the 1-hoja promo at exact height 2.40m (AC: $410, legacy $470 with +60 Apopa zone)', () => {
    const result = priceGarden({ widthM: 1.0, heightM: 2.4, hojas: 1, color: 'blanco', glass: 'claro', qty: 1 });
    expect(result).toEqual({ subtotal: 410, requiresQuote: false });
  });

  it('applies the 2-hoja promo (AC: $819)', () => {
    const result = priceGarden({ widthM: 2.0, heightM: 2.1, hojas: 2, color: 'blanco', glass: 'claro', qty: 1 });
    expect(result).toEqual({ subtotal: 819, requiresQuote: false });
  });

  it('falls back to m2 when height is not an exact promo height (2.00x2.20, AC: $836)', () => {
    const result = priceGarden({ widthM: 2.0, heightM: 2.2, hojas: 2, color: 'blanco', glass: 'claro', qty: 1 });
    expect(result).toEqual({ subtotal: 836, requiresQuote: false });
  });

  it('applies the 3-hoja promo (AC: $1,229)', () => {
    const result = priceGarden({ widthM: 3.0, heightM: 2.4, hojas: 3, color: 'blanco', glass: 'claro', qty: 1 });
    expect(result).toEqual({ subtotal: 1229, requiresQuote: false });
  });

  it('prices custom ("A la medida") by m2 even at a non-promo width (3.00x2.60, AC: $1,482)', () => {
    const result = priceGarden({ widthM: 3.0, heightM: 2.6, hojas: 'custom', color: 'blanco', glass: 'claro', qty: 1 });
    expect(result).toEqual({ subtotal: 1482, requiresQuote: false });
  });

  // ASSUMPTION(q16): 'custom' always uses the m2 formula, even when
  // width/height coincide with a promo band — reproduces the legacy
  // source's own inversion (1.00x2.10 custom = $399, cheaper than the $410
  // promo it would otherwise qualify for). Flagged in client-questions.md
  // #16 ("Inversión de precio en puertas de jardín"). Do not "fix" without
  // a client answer landing there.
  it('prices custom 1.00x2.10 by m2, cheaper than the 1-hoja promo (ASSUMPTION q16, AC: $399)', () => {
    const result = priceGarden({ widthM: 1.0, heightM: 2.1, hojas: 'custom', color: 'blanco', glass: 'claro', qty: 1 });
    expect(result).toEqual({ subtotal: 399, requiresQuote: false });
  });

  it('falls back to m2 in the gap between promo bands (1.27x2.10, AC: $506.73)', () => {
    const result = priceGarden({ widthM: 1.27, heightM: 2.1, hojas: 2, color: 'blanco', glass: 'claro', qty: 1 });
    expect(result).toEqual({ subtotal: 506.73, requiresQuote: false });
  });

  it('flags requiresQuote for non-white frame color', () => {
    const result = priceGarden({ widthM: 1.0, heightM: 2.1, hojas: 1, color: 'natural', glass: 'claro', qty: 1 });
    expect(result).toEqual({ subtotal: null, requiresQuote: true });
  });

  it('flags requiresQuote for non-clear glass', () => {
    const result = priceGarden({ widthM: 1.0, heightM: 2.1, hojas: 1, color: 'blanco', glass: 'nevado', qty: 1 });
    expect(result).toEqual({ subtotal: null, requiresQuote: true });
  });
});
