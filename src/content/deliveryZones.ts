// Distrito (reforma 2024) -> clave de la tabla de transporte (engine/pricing/zoneFee.ts).
// La tabla ZONE_FEES esta escrita con los nombres comerciales previos a la reforma
// (los antiguos municipios). Aqui se mapea SOLO donde el nombre del distrito coincide
// exactamente con una zona de la tabla. NO cambia ningun monto.
// Zonas de la tabla que NO son un distrito (colonias/puntos de referencia) y por eso no
// se pueden mapear sin confirmacion del cliente: Planes de Renderos, Redondel Integración,
// Paseo del Prado, San Bartolo, Altavista, Ciudad Versalles, Lourdes, Desvío de Opico.
// Un distrito sin mapeo resuelve a ZONE_UNMAPPED y el flujo ofrece cotizar por WhatsApp.
// 2026-10-08: la UI ya NO pide departamento/municipio/distrito; el cliente elige directo una zona de
// cobertura (ZONE_OPTIONS). ZONE_BY_DISTRITO queda solo para migrar estados guardados antiguos.
import { DEPARTAMENTOS } from './elSalvadorTerritory';
import { ZONE_FEES, hasZoneFee } from '../engine/pricing/zoneFee';

export const ZONE_UNMAPPED = 'otro';

/** [departamento, municipio, distrito, zona de ZONE_FEES] */
const MAP: readonly (readonly [string, string, string, string])[] = [
  ['San Salvador', 'San Salvador Centro', 'San Salvador', 'San Salvador'],
  ['San Salvador', 'San Salvador Centro', 'Ciudad Delgado', 'Ciudad Delgado'],
  ['San Salvador', 'San Salvador Centro', 'Cuscatancingo', 'Cuscatancingo'],
  ['San Salvador', 'San Salvador Este', 'Soyapango', 'Soyapango'],
  ['San Salvador', 'San Salvador Este', 'Ilopango', 'Ilopango'],
  ['San Salvador', 'San Salvador Este', 'San Martín', 'San Martín'],
  ['San Salvador', 'San Salvador Oeste', 'Apopa', 'Apopa'],
  ['San Salvador', 'San Salvador Oeste', 'Nejapa', 'Nejapa'],
  ['San Salvador', 'San Salvador Sur', 'San Marcos', 'San Marcos'],
  ['San Salvador', 'San Salvador Sur', 'Santo Tomás', 'Santo Tomás'],
  ['La Libertad', 'La Libertad Sur', 'Santa Tecla', 'Santa Tecla'],
  ['La Libertad', 'La Libertad Este', 'Zaragoza', 'Zaragoza'],
  ['La Libertad', 'La Libertad Este', 'San José Villanueva', 'San José Villanueva'],
  ['La Libertad', 'La Libertad Norte', 'Quezaltepeque', 'Quezaltepeque'],
  ['La Libertad', 'La Libertad Centro', 'Ciudad Arce', 'Ciudad Arce'],
];

function build(): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [dep, mun, dist, zone] of MAP) {
    const m = DEPARTAMENTOS.find((d) => d.name === dep)?.municipios.find((x) => x.name === mun);
    const d = m?.distritos.find((x) => x.name === dist);
    if (d) out[d.id] = zone;
  }
  return out;
}

/** id de distrito -> clave de ZONE_FEES. */
export const ZONE_BY_DISTRITO: Readonly<Record<string, string>> = build();

/** Texto de la opcion "Otra zona" (sin tarifa automatica; Alcusa confirma por WhatsApp). */
export const OTHER_ZONE_LABEL = 'Otra zona — envío por confirmar';

const ZONE_DISPLAY_NAME: Readonly<Record<string, string>> = {
  'San Salvador': 'San Salvador (zona metropolitana)',
};

export function zoneDisplayName(zone: string): string {
  return ZONE_DISPLAY_NAME[zone] ?? zone;
}

/** Etiqueta del dropdown: nombre + precio de envio ("Incluido" cuando es $0). */
export function zoneOptionLabel(zone: string): string {
  const fee = ZONE_FEES[zone] ?? 0;
  return `${zoneDisplayName(zone)} — ${fee === 0 ? 'Incluido' : `$${fee.toFixed(2)}`}`;
}

export interface ZoneOption {
  value: string;
  label: string;
}

/** Opciones del dropdown, en el orden de la tabla (precio ascendente) y "Otra zona" al final. */
export const ZONE_OPTIONS: readonly ZoneOption[] = [
  ...Object.keys(ZONE_FEES).map((z) => ({ value: z, label: zoneOptionLabel(z) })),
  { value: ZONE_UNMAPPED, label: OTHER_ZONE_LABEL },
];

export function isKnownZone(zone: string): boolean {
  return zone === ZONE_UNMAPPED || hasZoneFee(zone);
}

/** Zona de un estado guardado antiguo (id de distrito) o '' si no se puede migrar limpio. */
export function zoneFromLegacyDistrito(distritoId: string): string {
  return ZONE_BY_DISTRITO[distritoId] ?? '';
}
