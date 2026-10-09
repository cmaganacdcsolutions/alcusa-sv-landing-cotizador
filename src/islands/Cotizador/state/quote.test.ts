import { describe, expect, it } from 'vitest';
import { initialCotizadorState } from './cotizadorStore';
import { buildLineItem, computeQuote, parseHingedQty } from './quote';

// S5-derived check-values (docs/product/slices/S5-cotizador-corner-tempered-hinged.md).
describe('state/quote — computeQuote', () => {
  it('returns NO_QUOTE before a product is selected', () => {
    expect(computeQuote(initialCotizadorState)).toEqual({ amount: null, requiresQuote: false });
  });

  it('recta: reuses priceStraight (110cm natural claro, con instalación)', () => {
    const result = computeQuote({ ...initialCotizadorState, productId: 'recta' });
    expect(result).toEqual({ amount: 258, requiresQuote: false });
  });

  // computeQuote is pre-zone; the AC figures ($484/$620/$690) include the Soyapango +$40 fee (exploratory-report §3.1).
  it('corner: Natural Aquaclara/Frosted/Aquafold → $444/$580/$650 pre-zone (T5.1)', () => {
    expect(
      computeQuote({ ...initialCotizadorState, productId: 'l', color: 'natural', cornerModel: 'aquaclara' }),
    ).toEqual({ amount: 444, requiresQuote: false });
    expect(
      computeQuote({ ...initialCotizadorState, productId: 'l', color: 'natural', cornerModel: 'frosted' }),
    ).toEqual({ amount: 580, requiresQuote: false });
    expect(
      computeQuote({ ...initialCotizadorState, productId: 'l', color: 'natural', cornerModel: 'aquafold' }),
    ).toEqual({ amount: 650, requiresQuote: false });
  });

  it('corner: Blanco requires a quote (not rendered in the UI, but the engine still flags it)', () => {
    expect(computeQuote({ ...initialCotizadorState, productId: 'l', color: 'blanco' })).toEqual({
      amount: null,
      requiresQuote: true,
    });
  });

  it('tempered: 120/150/175/200cm → $672/$840/$980/$1,120 pre-zone (T5.2)', () => {
    expect(computeQuote({ ...initialCotizadorState, productId: 'templado', width: '120' }).amount).toBe(672);
    expect(computeQuote({ ...initialCotizadorState, productId: 'templado', width: '150' }).amount).toBe(840);
    expect(computeQuote({ ...initialCotizadorState, productId: 'templado', width: '175' }).amount).toBe(980);
    expect(computeQuote({ ...initialCotizadorState, productId: 'templado', width: '200' }).amount).toBe(1120);
  });

  it('tempered: 119cm and 201cm require a quote (out of range)', () => {
    expect(computeQuote({ ...initialCotizadorState, productId: 'templado', width: '119' }).requiresQuote).toBe(true);
    expect(computeQuote({ ...initialCotizadorState, productId: 'templado', width: '201' }).requiresQuote).toBe(true);
  });

  it('hinged: 70cm natural claro qty1 → $270 (T5.3 AC)', () => {
    expect(
      computeQuote({ ...initialCotizadorState, productId: 'bisagra', width: '70', color: 'natural', glass: 'claro', hingedQty: '1' }),
    ).toEqual({ amount: 270, requiresQuote: false });
  });

  it('hinged: 65cm natural nevado qty2 → $622 (T5.3 AC)', () => {
    expect(
      computeQuote({ ...initialCotizadorState, productId: 'bisagra', width: '65', color: 'natural', glass: 'nevado', hingedQty: '2' }),
    ).toEqual({ amount: 622, requiresQuote: false });
  });

  it('hinged: 40cm decorado (blanco) qty1 → $449 exactly as encoded (T5.3 AC, ASSUMPTION q17)', () => {
    expect(
      computeQuote({ ...initialCotizadorState, productId: 'bisagra', width: '40', color: 'blanco', glass: 'decorado', hingedQty: '1' }),
    ).toEqual({ amount: 449, requiresQuote: false });
  });

  it('hinged: qty boundary 0/1/50/51 — 0 and 51 require a quote, 1 and 50 price', () => {
    const base = { ...initialCotizadorState, productId: 'bisagra' as const, width: '70', color: 'natural' as const, glass: 'claro' as const };
    expect(computeQuote({ ...base, hingedQty: '0' }).requiresQuote).toBe(true);
    expect(computeQuote({ ...base, hingedQty: '1' }).requiresQuote).toBe(false);
    expect(computeQuote({ ...base, hingedQty: '50' }).requiresQuote).toBe(false);
    expect(computeQuote({ ...base, hingedQty: '51' }).requiresQuote).toBe(true);
  });

  it('parseHingedQty: rejects blank/non-integer input as NaN', () => {
    expect(parseHingedQty('1')).toBe(1);
    expect(parseHingedQty('50')).toBe(50);
    expect(Number.isNaN(parseHingedQty(''))).toBe(true);
    expect(Number.isNaN(parseHingedQty('abc'))).toBe(true);
    expect(Number.isNaN(parseHingedQty('1.5'))).toBe(true);
  });
});

// sf-cot-polish item 5 — buildLineItem must show the human label
// ("Súper gris"), never the raw WindowGlass id ("super_gris").
describe('state/quote — buildLineItem (ventana glass label)', () => {
  it('uses WINDOW_GLASS_LABELS, not the raw windowGlass id, in both detail and vidrio', () => {
    const item = buildLineItem({
      ...initialCotizadorState,
      productId: 'ventana',
      windowGlass: 'super_gris',
    });
    expect(item.vidrio).toBe('Súper gris');
    expect(item.detail).toContain('Súper gris');
    expect(item.detail).not.toContain('super_gris');
  });
});
