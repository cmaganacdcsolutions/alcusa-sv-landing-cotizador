// Distrito (reforma 2024) -> clave de la tabla de transporte (engine/pricing/zoneFee.ts).
// La tabla ZONE_FEES esta escrita con los nombres comerciales previos a la reforma
// (los antiguos municipios). Aqui se mapea SOLO donde el nombre del distrito coincide
// exactamente con una zona de la tabla. NO cambia ningun monto.
// Zonas de la tabla que NO son un distrito (colonias/puntos de referencia) y por eso no
// se pueden mapear sin confirmacion del cliente: Planes de Renderos, Redondel Integración,
// Paseo del Prado, San Bartolo, Altavista, Ciudad Versalles, Lourdes, Desvío de Opico.
// Un distrito sin mapeo resuelve a ZONE_UNMAPPED y el flujo ofrece cotizar por WhatsApp.
import { DEPARTAMENTOS } from './elSalvadorTerritory';

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
