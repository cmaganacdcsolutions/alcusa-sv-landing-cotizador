// Folio de cotizacion (ADR-012 §4-§5): `ALC-AAAAMMDD-XXXXXXXX`, sufijo de 8
// chars Crockford base32 = 7 aleatorios + 1 digito verificador. Funciones puras
// (sin window/Date global): `now` se inyecta. Mismas reglas que el PHP (B6).

export const QUOTE_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const QUOTE_CODE_PREFIX = 'ALC';
/** ADR-012 §3, supuesto pendiente de confirmar con el cliente. */
export const LOAD_MAX_AGE_DAYS = 90;
/** ADR-012 §1.3, pendiente de confirmar con el cliente. */
export const QUOTE_VALIDITY_DAYS = 15;

const SEP = /[\s\-_.]+/g;
const DAY_MS = 86_400_000;

export type QuoteCodeRejection = 'incomplete' | 'check' | 'contingency';

export type NormalizedQuoteCode =
  | { ok: true; code: string; date: string }
  | { ok: false; reason: QuoteCodeRejection };

const alphaIndex = (ch: string): number => QUOTE_CODE_ALPHABET.indexOf(ch);

/** check = ALPHABET[(sum v_i * (i+1)) mod 31] sobre los 7 chars aleatorios. */
export function quoteCheckChar(body7: string): string {
  let sum = 0;
  for (let i = 0; i < body7.length; i += 1) sum += alphaIndex(body7[i] as string) * (i + 1);
  return QUOTE_CODE_ALPHABET[sum % 31] as string;
}

/** Arma el folio canonico a partir de la fecha (AAAAMMDD) y 7 chars aleatorios. */
export function makeQuoteCode(yyyymmdd: string, body7: string): string {
  return `${QUOTE_CODE_PREFIX}-${yyyymmdd}-${body7}${quoteCheckChar(body7)}`;
}

/** `ALC-20260930-K7QM-3X90` (agrupado 4+4 para dictar). */
export function formatQuoteCode(canonical: string): string {
  const m = /^ALC-(\d{8})-([0-9A-Z]{4})([0-9A-Z]{4})$/.exec(canonical);
  return m ? `ALC-${m[1]}-${m[2]}-${m[3]}` : canonical;
}

function isRealDate(yyyymmdd: string): number | null {
  const y = Number(yyyymmdd.slice(0, 4));
  const mo = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? t : null;
}

const FOLIO_IN_TEXT = /(?:ALC[\s\-_.]*)?(\d{4}[\s\-_.]*\d{2}[\s\-_.]*\d{2})[\s\-_.]*((?:[0-9A-Z][\s\-_.]*){8})/;

/**
 * Normaliza lo que escribio/pego el cliente. Acepta con o sin `ALC`, con o sin
 * guiones/espacios/puntos, minusculas, y busca el folio dentro de un texto
 * largo. Sufijo solo (sin fecha) NO se acepta. `O`->`0`, `I`/`L`->`1`. Un
 * sufijo de 8 que EMPIEZA con `U` (no existe en el alfabeto; ADR-012 §4,
 * enmienda 2026-09-30) es un folio de contingencia: se clasifica ANTES de
 * validar el digito y nunca se consulta.
 */
export function normalizeQuoteCode(input: string, now: Date = new Date()): NormalizedQuoteCode {
  const upper = input.trim().toUpperCase();
  const compact = upper.replace(SEP, '');
  let date: string;
  let rawSuffix: string;
  const direct = /^(?:ALC)?(\d{8})([0-9A-Z]+)$/.exec(compact);
  if (direct && (upper.length <= 40 || !FOLIO_IN_TEXT.test(upper))) {
    date = direct[1] as string;
    rawSuffix = direct[2] as string;
  } else {
    const found = FOLIO_IN_TEXT.exec(upper);
    if (!found) return { ok: false, reason: 'incomplete' };
    date = (found[1] as string).replace(SEP, '');
    rawSuffix = (found[2] as string).replace(SEP, '');
  }
  if (rawSuffix.startsWith('U') && rawSuffix.length === 8) return { ok: false, reason: 'contingency' };
  if (rawSuffix.length < 8) return { ok: false, reason: 'incomplete' };
  if (rawSuffix.length > 8) return { ok: false, reason: 'check' };

  const t = isRealDate(date);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (t === null || t > todayUtc || (todayUtc - t) / DAY_MS > LOAD_MAX_AGE_DAYS) {
    return { ok: false, reason: 'incomplete' };
  }

  const suffix = [...rawSuffix].map((ch) => (ch === 'O' ? '0' : ch === 'I' || ch === 'L' ? '1' : ch)).join('');
  if ([...suffix].some((ch) => alphaIndex(ch) === -1)) return { ok: false, reason: 'check' };
  if (quoteCheckChar(suffix.slice(0, 7)) !== suffix[7]) return { ok: false, reason: 'check' };
  return { ok: true, code: `${QUOTE_CODE_PREFIX}-${date}-${suffix}`, date };
}

/** Agrupa mientras escribe: mayusculas, sin separadores, ALC-AAAAMMDD-XXXX-XXXX. */
export function groupQuoteInput(raw: string): string {
  let s = raw.toUpperCase().replace(SEP, '');
  if (s.length > 40) {
    const found = FOLIO_IN_TEXT.exec(raw.toUpperCase());
    if (found) s = `${(found[1] as string).replace(SEP, '')}${(found[2] as string).replace(SEP, '')}`;
  }
  if (/^\d/.test(s)) s = `ALC${s}`;
  const parts: string[] = [];
  const push = (from: number, to: number): void => {
    const p = s.slice(from, to);
    if (p) parts.push(p);
  };
  if (s.startsWith('ALC')) {
    push(0, 3);
    push(3, 11);
    push(11, 15);
    push(15, 19);
    return parts.join('-');
  }
  return s;
}
