import { describe, expect, it } from 'vitest';
import { getZoneFee, hasZoneFee, ZONE_NAMES } from './zoneFee';

describe('engine/pricing/zoneFee', () => {
  it('returns the known fee for a listed municipio (Soyapango: $40)', () => {
    expect(hasZoneFee('Soyapango')).toBe(true);
    expect(getZoneFee('Soyapango')).toBe(40);
  });

  it('returns 0 for the metropolitan zones with no transport charge', () => {
    expect(getZoneFee('San Salvador')).toBe(0);
    expect(getZoneFee('Santa Tecla')).toBe(0);
  });

  it('reports no fee / not found for a municipio outside the 23-zone list', () => {
    expect(hasZoneFee('otro')).toBe(false);
    expect(getZoneFee('otro')).toBeUndefined();
  });

  it('lists exactly 23 municipios', () => {
    expect(ZONE_NAMES).toHaveLength(23);
  });
});
