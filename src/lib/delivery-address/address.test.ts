import { describe, expect, it } from 'vitest';
import { getZoneFee } from '@engine/pricing/zoneFee';
import { DEPARTAMENTOS } from '@content/elSalvadorTerritory';
import { OTHER_ZONE_LABEL, ZONE_OPTIONS, zoneOptionLabel } from '@content/deliveryZones';
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
  zoneOf,
  type DeliveryAddress,
} from './index';

/** Id de distrito de un estado guardado antiguo (cascada departamento/municipio/distrito). */
function legacyDistritoId(dep: string, mun: string, dist: string): string {
  const d = DEPARTAMENTOS.find((x) => x.name === dep)!;
  const m = d.municipios.find((x) => x.name === mun)!;
  return m.distritos.find((x) => x.name === dist)!.id;
}

const complete: DeliveryAddress = {
  ...EMPTY_ADDRESS,
  zona: 'Soyapango',
  colonia: 'Residencial Las Flores',
  calle: 'Pasaje 3, casa 12',
  referencia: 'frente a la iglesia, portón negro',
  telefono: '7123-4567',
};

describe('validateAddress', () => {
  it('direccion vacia: todos los campos con mensaje, foco al primero', () => {
    const e = validateAddress(EMPTY_ADDRESS);
    expect(Object.keys(e)).toHaveLength(5);
    expect(firstInvalidField(e)).toBe('zona');
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
    expect(isAddressComplete({ ...complete, zona: '' })).toBe(false);
    expect(isAddressComplete({ ...complete, zona: 'zzz' })).toBe(false);
  });

  it('gating del total: zona sola o direccion sola NO completan; zona + direccion si', () => {
    const textOnly = { ...complete, zona: '' };
    const zoneOnly = { ...EMPTY_ADDRESS, zona: 'Soyapango' };
    expect(isAddressComplete(zoneOnly)).toBe(false);
    expect(isAddressComplete(textOnly)).toBe(false);
    expect(isAddressComplete({ ...textOnly, zona: 'Soyapango' })).toBe(true);
  });

  it('"Otra zona" (otro) cuenta como zona elegida: no bloquea', () => {
    expect(isAddressComplete({ ...complete, zona: 'otro' })).toBe(true);
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

describe('dropdown de zonas', () => {
  it('opciones en orden de la tabla, con precio, y "Otra zona" al final', () => {
    const labels = ZONE_OPTIONS.map((o) => o.label);
    expect(labels[0]).toBe('San Salvador (zona metropolitana) — Incluido');
    expect(labels[1]).toBe('Santa Tecla — Incluido');
    expect(labels[2]).toBe('San Marcos — $25.00');
    expect(labels[labels.length - 2]).toBe('Ciudad Arce — $85.00');
    expect(labels[labels.length - 1]).toBe(OTHER_ZONE_LABEL);
    expect(ZONE_OPTIONS).toHaveLength(24);
  });

  it('cada opcion con tarifa trae el monto exacto de la tabla', () => {
    for (const o of ZONE_OPTIONS.slice(0, -1)) {
      const fee = getZoneFee(o.value);
      expect(fee).toBeDefined();
      expect(zoneOptionLabel(o.value)).toContain(fee === 0 ? 'Incluido' : `$${(fee ?? 0).toFixed(2)}`);
    }
    expect(getZoneFee('otro')).toBeUndefined();
  });

  it('la zona elegida es la zona; vacia o desconocida = sin zona; el telefono se enmascara', () => {
    expect(zoneOf(applyAddressField(EMPTY_ADDRESS, 'zona', 'Apopa'))).toBe('Apopa');
    expect(zoneOf(applyAddressField(EMPTY_ADDRESS, 'zona', 'otro'))).toBe('otro');
    expect(zoneOf(EMPTY_ADDRESS)).toBe('');
    expect(zoneOf({ zona: 'zzz' })).toBe('');
    expect(applyAddressField(EMPTY_ADDRESS, 'telefono', '71234567').telefono).toBe('7123-4567');
  });

  it('estado antiguo con distrito: migra a la zona (o queda sin zona), nunca lanza', () => {
    const old = (distritoId: string): unknown => ({ departamentoId: '06', municipioId: '0603', distritoId, colonia: 'Col X' });
    expect(parseStoredAddress(old(legacyDistritoId('San Salvador', 'San Salvador Este', 'Soyapango'))).zona).toBe('Soyapango');
    expect(parseStoredAddress(old(legacyDistritoId('Santa Ana', 'Santa Ana Centro', 'Santa Ana'))).zona).toBe('');
    expect(parseStoredAddress(old('zzz')).zona).toBe('');
    expect(parseStoredAddress(old('zzz')).colonia).toBe('Col X');
  });
});

describe('formatos', () => {
  it('payload plano y texto de mensaje', () => {
    const a = { ...complete, geo: { lat: 13.69, lng: -89.19 } };
    const p = toAddressPayload(a);
    expect(p).toMatchObject({
      zona: 'Soyapango',
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
