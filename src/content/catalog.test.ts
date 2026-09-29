// Guards CATALOG_PRODUCTS[].fromPrice against drift from engine/pricing.
// Each case feeds the *cheapest documented valid config* for that product
// into its pricing function and asserts the result matches the catalog's
// advertised "Desde $X". If a pricing table changes, this test fails instead
// of the landing silently showing a stale price (S4 T4.1).
import { describe, expect, it } from 'vitest';
import { CATALOG_PRODUCTS } from './catalog';
import { priceStraight } from '@engine/pricing/straight';
import { priceCorner } from '@engine/pricing/corner';
import { priceTempered } from '@engine/pricing/tempered';
import { priceHinged } from '@engine/pricing/hinged';
import { priceWindow } from '@engine/pricing/windows';
import { priceGarden } from '@engine/pricing/garden';

function fromPriceOf(id: string): number {
  const product = CATALOG_PRODUCTS.find((p) => p.id === id);
  if (!product) throw new Error(`catalog product not found: ${id}`);
  return product.fromPrice;
}

describe('content/catalog — fromPrice matches engine/pricing minimum', () => {
  it('recta: promo band, natural/claro, no pickup (cheapest advertised, excludes retiro discount)', () => {
    const result = priceStraight({ widthCm: 80, color: 'natural', glass: 'claro', pickup: false });
    expect(result.requiresQuote).toBe(false);
    expect(result.price).toBe(fromPriceOf('recta'));
  });

  it('l (cabina en L): natural aquaclara, the cheapest model/color combo', () => {
    const result = priceCorner({ color: 'natural', model: 'aquaclara' });
    expect(result.requiresQuote).toBe(false);
    expect(result.price).toBe(fromPriceOf('l'));
  });

  it('templado: minimum priceable width, 120cm', () => {
    const result = priceTempered({ widthCm: 120 });
    expect(result.requiresQuote).toBe(false);
    expect(result.price).toBe(fromPriceOf('templado'));
  });

  it('bisagra: natural/claro at the 40cm tier, qty 1, no fixed panel', () => {
    const result = priceHinged({ widthCm: 40, color: 'natural', glass: 'claro', qty: 1 });
    expect(result.requiresQuote).toBe(false);
    expect(result.subtotal).toBe(fromPriceOf('bisagra'));
  });

  it('jardin: promo band 1 (blanco/claro, 1 hoja, 0.80x2.10m, qty 1)', () => {
    const result = priceGarden({ widthM: 0.8, heightM: 2.1, hojas: 1, color: 'blanco', glass: 'claro', qty: 1 });
    expect(result.requiresQuote).toBe(false);
    expect(result.subtotal).toBe(fromPriceOf('jardin'));
  });

  it('ventana: francesa/claro at the minimum billable area (0.8 m2), no extras', () => {
    const result = priceWindow({
      widthM: 0.8,
      heightM: 1,
      model: 'francesa',
      frame: 'blanco',
      glass: 'claro',
      zaranda: false,
      desmontaje: false,
      qty: 1,
    });
    expect(result.requiresQuote).toBe(false);
    expect(result.subtotal).toBe(fromPriceOf('ventana'));
  });
});
