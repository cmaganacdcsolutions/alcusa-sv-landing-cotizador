import { describe, expect, it } from 'vitest';
import {
  priceStraight,
  priceCorner,
  priceTempered,
  priceHinged,
  priceWindow,
  priceGarden,
  getZoneFee,
} from './index';

// Barrel-export smoke test — real coverage lives in each product's own
// <product>.test.ts / zoneFee.test.ts.
describe('engine/pricing barrel', () => {
  it('re-exports every S1/S2 product pricing function and zoneFee', () => {
    expect(priceStraight({ widthCm: 110, color: 'natural', glass: 'claro', pickup: false }).price).toBe(222);
    expect(priceCorner({ color: 'natural', model: 'aquaclara' }).price).toBe(444);
    expect(priceTempered({ widthCm: 120 }).price).toBe(672);
    expect(priceHinged({ widthCm: 70, color: 'natural', glass: 'claro', qty: 1 }).subtotal).toBe(270);
    expect(
      priceWindow({
        widthM: 1.2,
        heightM: 1.0,
        model: 'francesa',
        frame: 'blanco',
        glass: 'claro',
        zaranda: false,
        desmontaje: false,
        qty: 1,
      }).subtotal
    ).toBe(162);
    expect(priceGarden({ widthM: 1.0, heightM: 2.1, hojas: 1, color: 'blanco', glass: 'claro', qty: 1 }).subtotal).toBe(
      410
    );
    expect(getZoneFee('Soyapango')).toBe(40);
  });
});
