import { describe, expect, it } from 'vitest';
import { priceWindow, windowZarandaCost } from './windows';
import { WINDOW_ZARANDA_MIN_AREA_M2, WINDOW_ZARANDA_RATE_PER_M2 } from '@content/pricingTables';
import type { WindowPriceInput } from './types';

const base: WindowPriceInput = {
  widthM: 1.2,
  heightM: 1.0,
  model: 'francesa',
  frame: 'blanco',
  glass: 'claro',
  zaranda: false,
  desmontaje: false,
  qty: 1,
};

// Decision 2026-10-16 (client): ventanas francesas/bilbao se cotizan SOLO con asesor
// ("solo con las puertas de ducha se puede dar una cotizacion certera").
describe('engine/pricing/windows — priceWindow (solo asesor)', () => {
  it.each([
    ['francesa blanco claro', base],
    ['bilbao bronce super_gris con extras', { ...base, model: 'bilbao', frame: 'bronce', glass: 'super_gris', zaranda: true, desmontaje: true, qty: 3 }],
    ['medida minima', { ...base, widthM: 0.6, heightM: 0.6 }],
    ['marco natural', { ...base, frame: 'natural' }],
    ['marco negro', { ...base, frame: 'negro' }],
    ['reflectivo bronce', { ...base, glass: 'reflectivo_bronce' }],
  ] as const)('%s => sin precio, requiresQuote', (_name, input) => {
    expect(priceWindow(input)).toEqual({ subtotal: null, requiresQuote: true });
  });
});

describe('engine/pricing/windows — windowZarandaCost', () => {
  it('tarifa $25/m2 (2026-10-16)', () => {
    expect(WINDOW_ZARANDA_RATE_PER_M2).toBe(25);
    expect(windowZarandaCost(1.2, 1.0)).toBe(30);
  });

  it('area minima facturable 0.80 m2 por ventana', () => {
    expect(WINDOW_ZARANDA_MIN_AREA_M2).toBe(0.8);
    expect(windowZarandaCost(0.6, 0.6)).toBe(20); // 0.36 m2 -> 0.80 * 25
    expect(windowZarandaCost(1.0, 0.8)).toBe(20); // justo el minimo
    expect(windowZarandaCost(1.0, 0.9)).toBe(22.5);
  });

  it('medida invalida => 0', () => {
    expect(windowZarandaCost(0, 1)).toBe(0);
    expect(windowZarandaCost(Number.NaN, 1)).toBe(0);
  });
});
