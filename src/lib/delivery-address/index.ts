// Direccion completa de entrega (solo "Con instalacion"). Modulo puro: validacion,
// resolucion de zona de transporte y formatos de texto. Sin React/window/fetch.
// PII: este modulo nunca registra en consola ni arma URLs con la direccion; el unico
// enlace que genera es el de mapa a partir de lat/lng (sin llamadas externas).
import { DEPARTAMENTOS, getDistrito, getMunicipio, getDepartamento } from '@content/elSalvadorTerritory';
import { ZONE_BY_DISTRITO, ZONE_UNMAPPED } from '@content/deliveryZones';
import { formatWhatsappInput, whatsappDigits } from '../quote-customer';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DeliveryAddress {
  departamentoId: string;
  municipioId: string;
  distritoId: string;
  colonia: string;
  calle: string;
  referencia: string;
  /** Mascara "####-####" mientras se escribe. */
  telefono: string;
  geo: GeoPoint | null;
}

export const EMPTY_ADDRESS: DeliveryAddress = {
  departamentoId: '',
  municipioId: '',
  distritoId: '',
  colonia: '',
  calle: '',
  referencia: '',
  telefono: '',
  geo: null,
};

export type AddressTextField = 'colonia' | 'calle' | 'referencia' | 'telefono';
export type AddressField = 'departamentoId' | 'municipioId' | 'distritoId' | AddressTextField;
/** Orden visual = orden de foco al primer error. */
export const ADDRESS_FIELD_ORDER: readonly AddressField[] = [
  'departamentoId',
  'municipioId',
  'distritoId',
  'colonia',
  'calle',
  'referencia',
  'telefono',
];

export const ADDRESS_MSG = {
  departamento: 'Elige tu departamento de la lista.',
  municipio: 'Elige tu municipio de la lista.',
  distrito: 'Elige tu distrito de la lista.',
  colonia: 'Escribe el nombre de tu colonia, residencial o barrio.',
  calle: 'Escribe tu calle, pasaje o avenida y el número de casa.',
  referencia: 'Escribe un punto de referencia para ubicar tu casa. Ejemplo: frente a la iglesia, portón negro.',
  telefonoRequired: 'Escribe tu teléfono o WhatsApp.',
  telefonoInvalid: 'Revisa el número: deben ser 8 dígitos. Ejemplo: 7123-4567.',
  tooLong: 'Es muy largo. Usa máximo 120 caracteres.',
} as const;

export const TEXT_MIN = 3;
export const TEXT_MAX = 120;
const PHONE_RE = /^[267]\d{7}$/;

export type AddressErrors = Partial<Record<AddressField, string>>;

function normalizeText(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

function validateText(raw: string, msg: string): string {
  const v = normalizeText(raw);
  if ([...v].length < TEXT_MIN) return msg;
  if ([...v].length > TEXT_MAX) return ADDRESS_MSG.tooLong;
  return '';
}

export function validateAddressPhone(raw: string): string {
  if (!raw.replace(/[\s\-().+]/g, '')) return ADDRESS_MSG.telefonoRequired;
  return PHONE_RE.test(whatsappDigits(raw)) ? '' : ADDRESS_MSG.telefonoInvalid;
}

/** Mensaje de error de un campo ('' si es valido). Los ids de territorio se validan contra el catalogo. */
export function validateAddressField(a: DeliveryAddress, field: AddressField): string {
  switch (field) {
    case 'departamentoId':
      return getDepartamento(a.departamentoId) ? '' : ADDRESS_MSG.departamento;
    case 'municipioId':
      return getMunicipio(a.departamentoId, a.municipioId) ? '' : ADDRESS_MSG.municipio;
    case 'distritoId':
      return getDistrito(a.departamentoId, a.municipioId, a.distritoId) ? '' : ADDRESS_MSG.distrito;
    case 'colonia':
      return validateText(a.colonia, ADDRESS_MSG.colonia);
    case 'calle':
      return validateText(a.calle, ADDRESS_MSG.calle);
    case 'referencia':
      return validateText(a.referencia, ADDRESS_MSG.referencia);
    case 'telefono':
      return validateAddressPhone(a.telefono);
  }
}

export function validateAddress(a: DeliveryAddress): AddressErrors {
  const out: AddressErrors = {};
  for (const f of ADDRESS_FIELD_ORDER) {
    const e = validateAddressField(a, f);
    if (e) out[f] = e;
  }
  return out;
}

export function firstInvalidField(errors: AddressErrors): AddressField | null {
  return ADDRESS_FIELD_ORDER.find((f) => errors[f]) ?? null;
}

export function isAddressComplete(a: DeliveryAddress): boolean {
  return firstInvalidField(validateAddress(a)) === null;
}

/**
 * Clave de ZONE_FEES para un distrito. Los distritos sin tarifa conocida devuelven
 * ZONE_UNMAPPED ('otro'), que el flujo trata como "sin tarifa automatica" (cotiza por
 * WhatsApp). '' mientras no haya distrito.
 */
export function zoneForDistrito(a: Pick<DeliveryAddress, 'departamentoId' | 'municipioId' | 'distritoId'>): string {
  const d = getDistrito(a.departamentoId, a.municipioId, a.distritoId);
  if (!d) return '';
  return ZONE_BY_DISTRITO[d.id] ?? ZONE_UNMAPPED;
}

/** Aplica un cambio de campo respetando la cascada (cambiar departamento limpia municipio y distrito). */
export function applyAddressField(a: DeliveryAddress, field: AddressField, value: string): DeliveryAddress {
  switch (field) {
    case 'departamentoId':
      return a.departamentoId === value ? a : { ...a, departamentoId: value, municipioId: '', distritoId: '' };
    case 'municipioId':
      return a.municipioId === value ? a : { ...a, municipioId: value, distritoId: '' };
    case 'telefono':
      return { ...a, telefono: formatWhatsappInput(value) };
    default:
      return { ...a, [field]: value };
  }
}

export function mapsUrl(g: GeoPoint): string {
  return `https://www.google.com/maps?q=${g.lat},${g.lng}`;
}

export function departamentoName(a: DeliveryAddress): string {
  return getDepartamento(a.departamentoId)?.name ?? '';
}
export function municipioName(a: DeliveryAddress): string {
  return getMunicipio(a.departamentoId, a.municipioId)?.name ?? '';
}
export function distritoName(a: DeliveryAddress): string {
  return getDistrito(a.departamentoId, a.municipioId, a.distritoId)?.name ?? '';
}

/** "Colonia X, Calle Y #3. Ref: ... · Distrito, Municipio, Departamento" */
export function formatAddressLine(a: DeliveryAddress): string {
  const place = [distritoName(a), municipioName(a), departamentoName(a)].filter(Boolean).join(', ');
  const street = [normalizeText(a.colonia), normalizeText(a.calle)].filter(Boolean).join(', ');
  const ref = normalizeText(a.referencia);
  return [street, ref ? `Ref: ${ref}` : '', place].filter(Boolean).join(' · ');
}

/** Texto para el mensaje de WhatsApp: direccion + telefono (+ enlace de mapa si hay GPS). */
export function formatAddressForMessage(a: DeliveryAddress): string {
  return [
    formatAddressLine(a),
    a.telefono ? `Tel: ${a.telefono}` : '',
    a.geo ? `Ubicación: ${mapsUrl(a.geo)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Payload plano para el adaptador de cotizaciones (sin ids internos de UI). */
export interface AddressPayload {
  departamento: string;
  municipio: string;
  distrito: string;
  colonia: string;
  calle: string;
  referencia: string;
  /** E.164 +503######## */
  telefono: string;
  geo?: GeoPoint;
}

export function toAddressPayload(a: DeliveryAddress): AddressPayload {
  return {
    departamento: departamentoName(a),
    municipio: municipioName(a),
    distrito: distritoName(a),
    colonia: normalizeText(a.colonia),
    calle: normalizeText(a.calle),
    referencia: normalizeText(a.referencia),
    telefono: `+503${whatsappDigits(a.telefono)}`,
    ...(a.geo ? { geo: a.geo } : {}),
  };
}

/** Valida la forma de un valor restaurado desde sessionStorage (retorno de Wompi). */
export function parseStoredAddress(v: unknown): DeliveryAddress {
  if (typeof v !== 'object' || v === null) return EMPTY_ADDRESS;
  const o = v as Record<string, unknown>;
  const s = (k: string): string => (typeof o[k] === 'string' ? (o[k] as string) : '');
  const g = o.geo as Record<string, unknown> | null | undefined;
  const geo: GeoPoint | null =
    g && typeof g.lat === 'number' && typeof g.lng === 'number' && Number.isFinite(g.lat) && Number.isFinite(g.lng)
      ? { lat: g.lat, lng: g.lng }
      : null;
  return {
    departamentoId: s('departamentoId'),
    municipioId: s('municipioId'),
    distritoId: s('distritoId'),
    colonia: s('colonia'),
    calle: s('calle'),
    referencia: s('referencia'),
    telefono: formatWhatsappInput(s('telefono')),
    geo,
  };
}

export { DEPARTAMENTOS };
