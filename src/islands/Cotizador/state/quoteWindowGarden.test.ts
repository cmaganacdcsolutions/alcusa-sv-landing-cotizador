import { describe, expect, it } from 'vitest';
import { computeGardenQuote, computeWindowQuote } from './quoteWindowGarden';
import type { WindowRowState } from './cotizadorStore';

function row(partial: Partial<WindowRowState> & { id: string }): WindowRowState {
  return { qty: '1', widthM: '1.20', heightM: '1.00', ...partial };
}

const windowState = {
  windowModel: 'francesa',
  windowFrame: 'blanco',
  windowGlass: 'claro',
  windowZaranda: false,
  windowDesmontaje: false,
} as const;

const gardenState = {
  gardenHojas: 1,
  gardenWidth: '1.00',
  gardenHeightOption: '2.10',
  gardenHeightOtra: '',
  gardenColor: 'blanco',
  gardenGlass: 'claro',
  gardenQty: '1',
} as const;

// 2026-10-16: ventanas y jardin son solo-asesor. Se sigue recogiendo la configuracion (medidas, cantidad),
// pero nunca hay precio ni suma al total.
describe('state/quoteWindowGarden — computeWindowQuote (solo asesor)', () => {
  it('una fila: conserva medidas y cantidad, sin precio', () => {
    expect(computeWindowQuote({ ...windowState, windowRows: [row({ id: 'r1' })] })).toEqual({
      rows: [{ id: 'r1', qty: 1, widthM: 1.2, heightM: 1.0, subtotal: null, requiresQuote: true }],
      subtotal: null,
      requiresQuote: true,
    });
  });

  it('varias filas con extras: ninguna aporta al subtotal', () => {
    const quote = computeWindowQuote({
      ...windowState,
      windowModel: 'bilbao',
      windowFrame: 'bronce',
      windowGlass: 'super_gris',
      windowZaranda: true,
      windowDesmontaje: true,
      windowRows: [row({ id: 'r1', widthM: '1.5', heightM: '1.2' }), row({ id: 'r2', qty: '3' })],
    });
    expect(quote.subtotal).toBeNull();
    expect(quote.requiresQuote).toBe(true);
    expect(quote.rows.map((r) => [r.qty, r.subtotal, r.requiresQuote])).toEqual([
      [1, null, true],
      [3, null, true],
    ]);
  });

  it('clamps qty to 1-50 and falls back to safe defaults on blank/invalid input', () => {
    const quote = computeWindowQuote({
      ...windowState,
      windowRows: [row({ id: 'r1', qty: '999', widthM: '', heightM: 'abc' })],
    });
    expect(quote.rows[0].qty).toBe(50);
    expect(quote.rows[0].widthM).toBe(0);
    expect(quote.rows[0].heightM).toBe(0);
  });
});

describe('state/quoteWindowGarden — computeGardenQuote (solo asesor)', () => {
  it('1 hoja 2.10: conserva la configuracion, sin precio', () => {
    expect(computeGardenQuote({ ...gardenState })).toEqual({ widthM: 1.0, heightM: 2.1, qty: 1, subtotal: null, requiresQuote: true });
  });

  it('"Otra" altura por texto libre: conserva la medida, sin precio', () => {
    const quote = computeGardenQuote({
      ...gardenState,
      gardenHojas: 2,
      gardenWidth: '2.00',
      gardenHeightOption: 'otra',
      gardenHeightOtra: '2.20',
    });
    expect(quote).toEqual({ widthM: 2.0, heightM: 2.2, qty: 1, subtotal: null, requiresQuote: true });
  });

  it('a la medida y otros acabados tambien: sin precio', () => {
    expect(computeGardenQuote({ ...gardenState, gardenHojas: 'custom' }).subtotal).toBeNull();
    expect(computeGardenQuote({ ...gardenState, gardenColor: 'natural' }).requiresQuote).toBe(true);
  });
});
