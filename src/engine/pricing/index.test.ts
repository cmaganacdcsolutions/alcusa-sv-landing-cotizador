import { describe, expect, it } from 'vitest';
import { priceStraight, getZoneFee } from './index';

// Barrel-export smoke test — real coverage lives in straight.test.ts /
// zoneFee.test.ts.
describe('engine/pricing barrel', () => {
  it('re-exports the straight and zoneFee modules', () => {
    expect(priceStraight({ widthCm: 110, color: 'natural', glass: 'claro', pickup: false }).price).toBe(222);
    expect(getZoneFee('Soyapango')).toBe(40);
  });
});
