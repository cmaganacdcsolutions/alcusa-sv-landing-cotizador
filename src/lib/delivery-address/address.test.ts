import { describe, expect, it } from 'vitest';
import { getZoneFee } from '@engine/pricing/zoneFee';
import { DEPARTAMENTOS } from '@content/elSalvadorTerritory';
import {
  ADDRESS_MSG,
  applyAddressField,
  EMPTY_ADDRESS,
  firstInvalidField,
  formatAddressForMessage,
  isAddressComplete,
  mapsUrl,
  parseStoredAddress,
  toAddressPayload,
  validateAddress,
  validateAddressPhone,
  zoneForDistrito,
  type DeliveryAddress,
} from './index';

type Ids = Pick<DeliveryAddress, 'departamentoId' | 'municipioId' | 'distritoId'>;

function pick(dep: string, mun: string, dist: string): Ids {
  const d = DEPARTAMENTOS.find((x) => x.name === dep)!;
  const m = d.municipios.find((x) => x.name === mun)!;
  const t = m.distritos.find((x) => x.name === dist)!;
  return { departamentoId: d.id, municipioId: m.id, distritoId: t.id };
}

const complete: DeliveryAddress = {
  ...EMPTY_ADDRESS,
  ...pick('San Salvador', 'San Salvador Este', 'Soyapango'),
  colonia: 'Residencial Las Flores',
  calle: 'Pasaje 3, casa 12',
  referencia: 'frente a la iglesia, portón negro',
  telefono: '7123-4567',
};

describe('validateAddress', () => {
  it('direccion vacia: todos los campos con mensaje, foco al primero', () => {
    const e = validateAddress(EMPTY_ADDRESS);
    expect(Object.keys(e)).toHaveLength(7);
    expect(firstInvalidField(e)).toBe('departamentoId');
    expect(isAddressComplete(EMPTY_ADDRESS)).toBe(false);
  });

  it('direccion completa valida', () => {
    expect(validateAddress(complete)).toEqual({});
    expect(isAddressComplete(complete)).toBe(true);
  });

  it('cada campo faltante bloquea', () => {
    for (const f of ['colonia', 'calle', 'referencia', 'telefono'] as const) {
      expect(isAddressComplete({ ...complete, [f]: '  ' })).toBe(false);
    }
    expect(isAddressComplete({ ...complete, distritoId: '' })).toBe(false);
    expect(isAddressComplete({ ...complete, municipioId: 'zzz' })).toBe(false);
  });

  it('rechaza ids que no pertenecen a la cascada', () => {
    const other = pick('La Libertad', 'La Libertad Sur', 'Santa Tecla');
    expect(isAddressComplete({ ...complete, distritoId: other.distritoId })).toBe(false);
  });

  it('telefono: 8 digitos, acepta +503 y guion, rechaza el resto', () => {
    expect(validateAddressPhone('7123-4567')).toBe('');
    expect(validateAddressPhone('+503 2222 3333')).toBe('');
    expect(validateAddressPhone('')).toBe(ADDRESS_MSG.telefonoRequired);
    expect(validateAddressPhone('712345')).toBe(ADDRESS_MSG.telefonoInvalid);
    expect(validateAddressPhone('1123-4567')).toBe(ADDRESS_MSG.telefonoInvalid);
  });

  it('texto muy corto o muy largo', () => {
    expect(isAddressComplete({ ...complete, colonia: 'ab' })).toBe(false);
    expect(isAddressComplete({ ...complete, calle: 'x'.repeat(121) })).toBe(false);
  });
});

describe('cascada y zona', () => {
  it('cambiar el departamento limpia municipio y distrito; cambiar municipio limpia distrito', () => {
    const lib = pick('La Libertad', 'La Libertad Sur', 'Santa Tecla');
    const a1 = applyAddressField(complete, 'departamentoId', lib.departamentoId);
    expect(a1.municipioId).toBe('');
    expect(a1.distritoId).toBe('');
    const a2 = applyAddressField(complete, 'municipioId', pick('San Salvador', 'San Salvador Centro', 'San Salvador').municipioId);
    expect(a2.distritoId).toBe('');
    expect(a2.colonia).toBe(complete.colonia);
  });

  it('el telefono se enmascara ####-####', () => {
    expect(applyAddressField(EMPTY_ADDRESS, 'telefono', '71234567').telefono).toBe('7123-4567');
  });

  it('la tarifa de los municipios existentes no cambia', () => {
    const cases: [string, string, string, string, number][] = [
      ['San Salvador', 'San Salvador Centro', 'San Salvador', 'San Salvador', 0],
      ['La Libertad', 'La Libertad Sur', 'Santa Tecla', 'Santa Tecla', 0],
      ['San Salvador', 'San Salvador Sur', 'San Marcos', 'San Marcos', 25],
      ['San Salvador', 'San Salvador Este', 'Soyapango', 'Soyapango', 40],
      ['San Salvador', 'San Salvador Oeste', 'Apopa', 'Apopa', 60],
      ['La Libertad', 'La Libertad Centro', 'Ciudad Arce', 'Ciudad Arce', 85],
    ];
    for (const [dep, mun, dist, zone, fee] of cases) {
      const z = zoneForDistrito(pick(dep, mun, dist));
      expect(z).toBe(zone);
      expect(getZoneFee(z)).toBe(fee);
    }
  });

  it('distrito sin tarifa conocida resuelve a "otro" y sin distrito a vacio', () => {
    expect(zoneForDistrito(pick('Santa Ana', 'Santa Ana Centro', 'Santa Ana'))).toBe('otro');
    expect(getZoneFee('otro')).toBeUndefined();
    expect(zoneForDistrito(EMPTY_ADDRESS)).toBe('');
  });
});

describe('formatos', () => {
  it('payload plano y texto de mensaje', () => {
    const a = { ...complete, geo: { lat: 13.69, lng: -89.19 } };
    const p = toAddressPayload(a);
    expect(p).toMatchObject({
      departamento: 'San Salvador',
      municipio: 'San Salvador Este',
      distrito: 'Soyapango',
      telefono: '+50371234567',
      geo: { lat: 13.69, lng: -89.19 },
    });
    const t = formatAddressForMessage(a);
    expect(t).toContain('Residencial Las Flores');
    expect(t).toContain('Tel: 7123-4567');
    expect(t).toContain('https://www.google.com/maps?q=13.69,-89.19');
    expect(mapsUrl({ lat: 1, lng: 2 })).toBe('https://www.google.com/maps?q=1,2');
  });

  it('parseStoredAddress tolera basura', () => {
    expect(parseStoredAddress(null)).toEqual(EMPTY_ADDRESS);
    expect(parseStoredAddress({ colonia: 5, geo: { lat: 'x' } })).toEqual(EMPTY_ADDRESS);
    expect(parseStoredAddress(JSON.parse(JSON.stringify(complete)))).toEqual(complete);
  });
});
