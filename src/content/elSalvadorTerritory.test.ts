import { describe, expect, it } from 'vitest';
import { DEPARTAMENTOS, getDistrito, getMunicipio } from './elSalvadorTerritory';
import { ZONE_BY_DISTRITO } from './deliveryZones';
import { ZONE_FEES } from '@engine/pricing/zoneFee';

const allDistritos = DEPARTAMENTOS.flatMap((d) => d.municipios.flatMap((m) => m.distritos));

describe('elSalvadorTerritory (reforma 2024)', () => {
  it('tiene 14 departamentos, 44 municipios y 262 distritos', () => {
    expect(DEPARTAMENTOS).toHaveLength(14);
    expect(DEPARTAMENTOS.flatMap((d) => d.municipios)).toHaveLength(44);
    expect(allDistritos).toHaveLength(262);
  });

  it('los ids son unicos y no hay nombres vacios', () => {
    expect(new Set(allDistritos.map((d) => d.id)).size).toBe(262);
    expect(allDistritos.every((d) => d.name.trim().length > 0)).toBe(true);
  });

  it('resuelve la cascada por ids', () => {
    const dep = DEPARTAMENTOS.find((d) => d.name === 'San Salvador');
    const mun = dep?.municipios.find((m) => m.name === 'San Salvador Este');
    const dist = mun?.distritos.find((x) => x.name === 'Soyapango');
    expect(dep && mun && dist).toBeTruthy();
    expect(getMunicipio(dep!.id, mun!.id)?.name).toBe('San Salvador Este');
    expect(getDistrito(dep!.id, mun!.id, dist!.id)?.name).toBe('Soyapango');
    expect(getDistrito(dep!.id, mun!.id, 'x')).toBeUndefined();
  });
});

describe('deliveryZones', () => {
  it('cada zona mapeada existe en la tabla de tarifas (montos intactos)', () => {
    const ids = new Set(allDistritos.map((d) => d.id));
    for (const [distritoId, zone] of Object.entries(ZONE_BY_DISTRITO)) {
      expect(ids.has(distritoId)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(ZONE_FEES, zone)).toBe(true);
    }
    expect(Object.keys(ZONE_BY_DISTRITO)).toHaveLength(15);
  });
});
