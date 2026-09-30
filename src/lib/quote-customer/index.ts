// R07.1 — customer mini form: pure validation / normalization + sessionStorage.
// Rules are the REDLINE "Reglas del formulario" of ios-r07 (estado H) and
// desktop-r07 (estado E); same vectors as the server (ADR-011 §5).

/** DATOS A CARGAR: version of the privacy notice the checkbox refers to (ADR-011 §5 example '2026-10-v1'). */
export const PRIVACY_NOTICE_VERSION = '2026-10-v1';
/** DATOS A CARGAR: real privacy-notice URL from ALCUSA (board placeholder anchor until then). */
export const PRIVACY_NOTICE_URL = '#aviso-de-privacidad-pendiente';
export const CUSTOMER_STORAGE_KEY = 'alcusa.cliente.v1';

export const NAME_MIN = 2;
export const NAME_MAX = 80;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const WHATSAPP_RE = /^[67]\d{7}$/;

export const MSG = {
  nameRequired: 'Escribe tu nombre.',
  nameShort: 'El nombre debe tener al menos 2 letras.',
  nameLong: 'El nombre no puede pasar de 80 caracteres.',
  nameChars: 'Usa solo letras y espacios.',
  waRequired: 'Escribe tu número de WhatsApp.',
  waInvalid: 'Revisa el número: deben ser 8 dígitos y empezar con 6 o 7.',
  consent: 'Marca la casilla para continuar.',
} as const;

/** NFC + trim + collapse whitespace. */
export function normalizeName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateName(raw: string): FieldResult<string> {
  const value = normalizeName(raw);
  if (!value) return { ok: false, error: MSG.nameRequired };
  if (!NAME_RE.test(value)) return { ok: false, error: MSG.nameChars };
  const len = [...value].length;
  if (len < NAME_MIN) return { ok: false, error: MSG.nameShort };
  if (len > NAME_MAX) return { ok: false, error: MSG.nameLong };
  return { ok: true, value };
}

/** Strips formatting and a leading 503 when 11 digits remain. Non-digit leftovers are kept so validation rejects them. */
export function whatsappDigits(raw: string): string {
  const s = raw.replace(/[\s\-().+]/g, '');
  return /^503\d{8}$/.test(s) ? s.slice(3) : s;
}

/** Live mask while typing: digits only, max 8, "####-####". */
export function formatWhatsappInput(raw: string): string {
  const d = whatsappDigits(raw).replace(/\D/g, '').slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
}

export interface WhatsappValue {
  /** ####-#### */
  display: string;
  /** +503######## */
  e164: string;
}

export function validateWhatsapp(raw: string): FieldResult<WhatsappValue> {
  if (!raw.replace(/[\s\-().+]/g, '')) return { ok: false, error: MSG.waRequired };
  const d = whatsappDigits(raw);
  if (!WHATSAPP_RE.test(d)) return { ok: false, error: MSG.waInvalid };
  return { ok: true, value: { display: `${d.slice(0, 4)}-${d.slice(4)}`, e164: `+503${d}` } };
}

/** PDF / chat print format: "+503 ####-####". */
export function formatWhatsappPrint(e164: string): string {
  const m = /^\+503(\d{4})(\d{4})$/.exec(e164);
  return m ? `+503 ${m[1]}-${m[2]}` : e164;
}

export interface CustomerData {
  name: string;
  /** E.164, +503######## */
  whatsapp: string;
}

export interface CustomerConsent {
  accepted: true;
  noticeVersion: string;
}

export interface StoredCustomer {
  name: string;
  whatsapp: string;
  consent: { accepted: boolean; noticeVersion: string };
  savedAt: string;
}

function store(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function loadStoredCustomer(): StoredCustomer | null {
  try {
    const raw = store()?.getItem(CUSTOMER_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredCustomer> | null;
    if (!v || typeof v.name !== 'string' || typeof v.whatsapp !== 'string' || typeof v.savedAt !== 'string') return null;
    const c = v.consent;
    if (!c || typeof c.accepted !== 'boolean' || typeof c.noticeVersion !== 'string') return null;
    return { name: v.name, whatsapp: v.whatsapp, consent: { accepted: c.accepted, noticeVersion: c.noticeVersion }, savedAt: v.savedAt };
  } catch {
    return null;
  }
}

/** Saved only after the folio request succeeded. */
export function saveStoredCustomer(c: CustomerData, now: Date = new Date()): void {
  const v: StoredCustomer = {
    name: c.name,
    whatsapp: c.whatsapp,
    consent: { accepted: true, noticeVersion: PRIVACY_NOTICE_VERSION },
    savedAt: now.toISOString(),
  };
  try {
    store()?.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable: the form simply starts empty next time */
  }
}

export function clearStoredCustomer(): void {
  try {
    store()?.removeItem(CUSTOMER_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/** Authorization is remembered only for the notice version it was given for. */
export function consentStillValid(s: StoredCustomer): boolean {
  return s.consent.accepted && s.consent.noticeVersion === PRIVACY_NOTICE_VERSION;
}
