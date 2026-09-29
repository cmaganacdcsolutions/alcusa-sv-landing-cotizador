import { describe, expect, it } from 'vitest';
import { priceWindow } from './windows';

// Fixture values from exploratory-report.md §3.3, expressed as the S2
// product-cost subtotal (zone fee excluded, see S2-pricing-engine.md T2.3).
describe('engine/pricing/windows — priceWindow', () => {
  it('prices 1.20x1.00 Francesa blanco claro qty1, no extras (AC: $162)', () => {
    const result = priceWindow({
      widthM: 1.2,
      heightM: 1.0,
      model: 'francesa',
      frame: 'blanco',
      glass: 'claro',
      zaranda: false,
      desmontaje: false,
      qty: 1,
    });
    expect(result).toEqual({ subtotal: 162, requiresQuote: false });
  });

  it('adds zaranda at $30/m2 (AC: $198)', () => {
    const result = priceWindow({
      widthM: 1.2,
      heightM: 1.0,
      model: 'francesa',
      frame: 'blanco',
      glass: 'claro',
      zaranda: true,
      desmontaje: false,
      qty: 1,
    });
    expect(result).toEqual({ subtotal: 198, requiresQuote: false });
  });

  it('multiplies by qty (AC: $486 subtotal, legacy $606 with zone x qty)', () => {
    const result = priceWindow({
      widthM: 1.2,
      heightM: 1.0,
      model: 'francesa',
      frame: 'blanco',
      glass: 'claro',
      zaranda: false,
      desmontaje: false,
      qty: 3,
    });
    expect(result).toEqual({ subtotal: 486, requiresQuote: false });
  });

  it('prices Bilbao 1.5x1.2 bronce/super_gris + zaranda + desmontaje (AC: $459.16)', () => {
    const result = priceWindow({
      widthM: 1.5,
      heightM: 1.2,
      model: 'bilbao',
      frame: 'bronce',
      glass: 'super_gris',
      zaranda: true,
      desmontaje: true,
      qty: 1,
    });
    expect(result).toEqual({ subtotal: 459.16, requiresQuote: false });
  });

  it('applies the 0.8m2 minimum area (0.6x0.6 Francesa, AC: $108)', () => {
    const result = priceWindow({
      widthM: 0.6,
      heightM: 0.6,
      model: 'francesa',
      frame: 'blanco',
      glass: 'claro',
      zaranda: false,
      desmontaje: false,
      qty: 1,
    });
    expect(result).toEqual({ subtotal: 108, requiresQuote: false });
  });

  it('flags requiresQuote for Natural frame', () => {
    const result = priceWindow({
      widthM: 1.2,
      heightM: 1.0,
      model: 'francesa',
      frame: 'natural',
      glass: 'claro',
      zaranda: false,
      desmontaje: false,
      qty: 1,
    });
    expect(result).toEqual({ subtotal: null, requiresQuote: true });
  });

  it('flags requiresQuote for Reflectivo bronce glass', () => {
    const result = priceWindow({
      widthM: 1.2,
      heightM: 1.0,
      model: 'francesa',
      frame: 'blanco',
      glass: 'reflectivo_bronce',
      zaranda: false,
      desmontaje: false,
      qty: 1,
    });
    expect(result).toEqual({ subtotal: null, requiresQuote: true });
  });
});
