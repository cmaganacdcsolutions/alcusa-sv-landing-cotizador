// zoneFee — pure pricing module. No React/Astro/window/document/fetch imports.
// 23-municipio transport table, shared by every product's pricing (README §4).
// Source: exploratory-report.md §3.1 "Zone fees". Zone fee is charged ONCE per
// order in this unified checkout (see prototype-spec.md §2.4 assumption).
export const ZONE_FEES: Readonly<Record<string, number>> = {
  'San Salvador': 0,
  'Santa Tecla': 0,
  'San Marcos': 25,
  'Santo Tomás': 30,
  'Planes de Renderos': 30,
  Zaragoza: 30,
  'Ciudad Delgado': 30,
  Cuscatancingo: 30,
  'Redondel Integración': 30,
  Soyapango: 40,
  'Paseo del Prado': 40,
  'San José Villanueva': 50,
  Apopa: 60,
  Nejapa: 65,
  Lourdes: 65,
  Ilopango: 65,
  'San Bartolo': 65,
  'San Martín': 70,
  Altavista: 70,
  'Ciudad Versalles': 70,
  'Desvío de Opico': 75,
  Quezaltepeque: 75,
  'Ciudad Arce': 85,
};

export const ZONE_NAMES: readonly string[] = Object.keys(ZONE_FEES);

export function hasZoneFee(zone: string): boolean {
  return Object.prototype.hasOwnProperty.call(ZONE_FEES, zone);
}

export function getZoneFee(zone: string): number | undefined {
  return hasZoneFee(zone) ? ZONE_FEES[zone] : undefined;
}
