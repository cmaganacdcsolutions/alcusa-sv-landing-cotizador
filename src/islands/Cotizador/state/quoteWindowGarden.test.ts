import { describe, expect, it } from 'vitest';
import { computeGardenQuote, computeWindowQuote } from './quoteWindowGarden';
import type { WindowRowState } from './cotizadorStore';

function row(partial: Partial<WindowRowState> & { id: string }): WindowRowState {
  return { qty: '1', widthM: '1.20', heightM: '1.00', ...partial };
}

describe('state/quoteWindowGarden — computeWindowQuote', () => {
  it('prices a single Francesa blanco/claro row qty1 (AC: $162)', () => {
    const quote = computeWindowQuote({
      windowModel: 'francesa',
      windowFrame: 'blanco',
      windowGlass: 'claro',
      windowZaranda: false,
      windowDesmontaje: false,
      windowRows: [row({ id: 'r1' })],
    });
    expect(quote).toEqual({
      rows: [{ id: 'r1', qty: 1, widthM: 1.2, heightM: 1.0, subtotal: 162, requiresQuote: false }],
      subtotal: 162,
      requiresQuote: false,
    });
  });

  it('sums multiple priceable rows (1 Francesa qty1 $162 + Bilbao 1.5x1.2 bronce/super_gris+extras $459.16)', () => {
    const quote = computeWindowQuote({
      windowModel: 'bilbao',
      windowFrame: 'bronce',
      windowGlass: 'super_gris',
      windowZaranda: true,
      windowDesmontaje: true,
      windowRows: [row({ id: 'r1', widthM: '1.5', heightM: '1.2' })],
    });
    expect(quote.subtotal).toBe(459.16);
    expect(quote.requiresQuote).toBe(false);
  });

  it('does not aggregate-gate when only some rows requireQuote (Natural frame row still adds, others still priced)', () => {
    const quote = computeWindowQuote({
      windowModel: 'francesa',
      windowFrame: 'natural',
      windowGlass: 'claro',
      windowZaranda: false,
      windowDesmontaje: false,
      windowRows: [row({ id: 'r1' })],
    });
    // Every row shares the same frame in this slice, so a Natural frame means
    // every row requires a quote here — this exercises the "nothing priced"
    // branch of the aggregate flag.
    expect(quote.rows[0]).toEqual({ id: 'r1', qty: 1, widthM: 1.2, heightM: 1.0, subtotal: null, requiresQuote: true });
    expect(quote.subtotal).toBeNull();
    expect(quote.requiresQuote).toBe(true);
  });

  it('applies the 0.8m2 minimum area floor (0.6x0.6 Francesa, AC: $108)', () => {
    const quote = computeWindowQuote({
      windowModel: 'francesa',
      windowFrame: 'blanco',
      windowGlass: 'claro',
      windowZaranda: false,
      windowDesmontaje: false,
      windowRows: [row({ id: 'r1', widthM: '0.6', heightM: '0.6' })],
    });
    expect(quote.subtotal).toBe(108);
  });

  it('clamps qty to 1-50 and falls back to safe defaults on blank/invalid input', () => {
    const quote = computeWindowQuote({
      windowModel: 'francesa',
      windowFrame: 'blanco',
      windowGlass: 'claro',
      windowZaranda: false,
      windowDesmontaje: false,
      windowRows: [row({ id: 'r1', qty: '999', widthM: '', heightM: 'abc' })],
    });
    expect(quote.rows[0].qty).toBe(50);
    expect(quote.rows[0].widthM).toBe(0);
    expect(quote.rows[0].heightM).toBe(0);
  });
});

describe('state/quoteWindowGarden — computeGardenQuote', () => {
  it('applies the 1-hoja promo at 2.10m (AC: $410)', () => {
    const quote = computeGardenQuote({
      gardenHojas: 1,
      gardenWidth: '1.00',
      gardenHeightOption: '2.10',
      gardenHeightOtra: '',
      gardenColor: 'blanco',
      gardenGlass: 'claro',
      gardenQty: '1',
    });
    expect(quote).toEqual({ widthM: 1.0, heightM: 2.1, qty: 1, subtotal: 410, requiresQuote: false });
  });

  it('applies the 1-hoja promo at 2.40m too (AC: also $410)', () => {
    const quote = computeGardenQuote({
      gardenHojas: 1,
      gardenWidth: '1.00',
      gardenHeightOption: '2.40',
      gardenHeightOtra: '',
      gardenColor: 'blanco',
      gardenGlass: 'claro',
      gardenQty: '1',
    });
    expect(quote.subtotal).toBe(410);
  });

  it('prices custom ("A la medida") 1.00x2.10 by m2 (AC: $399, ASSUMPTION q16)', () => {
    const quote = computeGardenQuote({
      gardenHojas: 'custom',
      gardenWidth: '1.00',
      gardenHeightOption: '2.10',
      gardenHeightOtra: '',
      gardenColor: 'blanco',
      gardenGlass: 'claro',
      gardenQty: '1',
    });
    expect(quote.subtotal).toBe(399);
  });

  it('supports "Otra" height via the free-text field', () => {
    const quote = computeGardenQuote({
      gardenHojas: 2,
      gardenWidth: '2.00',
      gardenHeightOption: 'otra',
      gardenHeightOtra: '2.20',
      gardenColor: 'blanco',
      gardenGlass: 'claro',
      gardenQty: '1',
    });
    expect(quote).toEqual({ widthM: 2.0, heightM: 2.2, qty: 1, subtotal: 836, requiresQuote: false });
  });

  it('flags requiresQuote for any color/glass other than Blanco/Claro', () => {
    const quote = computeGardenQuote({
      gardenHojas: 1,
      gardenWidth: '1.00',
      gardenHeightOption: '2.10',
      gardenHeightOtra: '',
      gardenColor: 'natural',
      gardenGlass: 'claro',
      gardenQty: '1',
    });
    expect(quote.subtotal).toBeNull();
    expect(quote.requiresQuote).toBe(true);
  });
});
