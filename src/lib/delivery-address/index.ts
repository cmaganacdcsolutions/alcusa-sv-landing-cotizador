// Direccion completa de entrega (solo "Con instalacion"). Modulo puro: validacion,
// resolucion de zona de transporte y formatos de texto. Sin React/window/fetch.
// PII: este modulo nunca registra en consola ni arma URLs con la direccion; el unico
// enlace que genera es el de mapa a partir de lat/lng (sin llamadas externas).
import { ZONE_UNMAPPED, isKnownZone, zoneDisplayName, zoneFromLegacyDistrito } from '@content/deliveryZones';
import { formatWhatsappInput, whatsappDigits } from '../quote-customer';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DeliveryAddress {
  /** Zona de cobertura elegida (clave de ZONE_FEES o ZONE_UNMAPPED 'otro'); '' = sin elegir. */
  zona: string;
  colonia: string;
  calle: string;
  referencia: string;
  /** Mascara "####-####" mientras se escribe. */
  telefono: string;
  geo: GeoPoint | null;
}

export const EMPTY_ADDRESS: DeliveryAddress = {
  zona: '',
  colonia: '',
  calle: '',
  referencia: '',
  telefono: '',
  geo: null,
};

export type AddressTextField = 'colonia' | 'calle' | 'referencia' | 'telefono';
export type AddressField = 'zona' | AddressTextField;
/** Orden visual = orden de foco al primer error. */
export const ADDRESS_FIELD_ORDER: readonly AddressField[] = [
  'zona',
  'colonia',
  'calle',
  'referencia',
  'telefono',
];

export const ADDRESS_MSG = {
  zona: 'Elige tu zona de cobertura de la lista.',
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

/** Mensaje de error de un campo ('' si es valido). La zona se valida contra la tabla de cobertura. */
export function validateAddressField(a: DeliveryAddress, field: AddressField): string {
  switch (field) {
    case 'zona':
      return isKnownZone(a.zona) ? '' : ADDRESS_MSG.zona;
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
 * Clave de ZONE_FEES de la direccion: la zona elegida ('otro' = sin tarifa automatica, cotiza por
 * WhatsApp). '' mientras no se elija zona.
 */
export function zoneOf(a: Pick<DeliveryAddress, 'zona'>): string {
  return isKnownZone(a.zona) ? a.zona : '';
}

/** Aplica un cambio de campo. */
export function applyAddressField(a: DeliveryAddress, field: AddressField, value: string): DeliveryAddress {
  if (field === 'telefono') return { ...a, telefono: formatWhatsappInput(value) };
  return { ...a, [field]: value };
}

export function mapsUrl(g: GeoPoint): string {
  return `https://www.google.com/maps?q=${g.lat},${g.lng}`;
}

/** Nombre legible de la zona elegida ('' si no hay; "Otra zona" para ZONE_UNMAPPED). */
export function zonaName(a: Pick<DeliveryAddress, 'zona'>): string {
  if (a.zona === ZONE_UNMAPPED) return 'Otra zona';
  return isKnownZone(a.zona) ? zoneDisplayName(a.zona) : '';
}

/** "Colonia X, Calle Y #3. Ref: ... · Zona de cobertura" */
export function formatAddressLine(a: DeliveryAddress): string {
  const place = zonaName(a);
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
  zona: string;
  colonia: string;
  calle: string;
  referencia: string;
  /** E.164 +503######## */
  telefono: string;
  geo?: GeoPoint;
}

export function toAddressPayload(a: DeliveryAddress): AddressPayload {
  return {
    zona: zonaName(a),
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
    // Estados antiguos guardaban departamento/municipio/distrito: se migra via la tabla de distritos o se
    // deja la zona sin elegir (el cliente la elige de nuevo). Nunca lanza.
    zona: isKnownZone(s('zona')) ? s('zona') : zoneFromLegacyDistrito(s('distritoId')),
    colonia: s('colonia'),
    calle: s('calle'),
    referencia: s('referencia'),
    telefono: formatWhatsappInput(s('telefono')),
    geo,
  };
}
