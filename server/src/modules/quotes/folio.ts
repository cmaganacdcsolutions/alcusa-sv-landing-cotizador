// The server uses the FE module as is (ADR-013 §2.1: one implementation of the folio rules).
import { randomBytes } from 'node:crypto';
import {
  LOAD_MAX_AGE_DAYS,
  QUOTE_CODE_ALPHABET,
  QUOTE_VALIDITY_DAYS,
  makeQuoteCode,
  normalizeQuoteCode,
  type NormalizedQuoteCode,
} from '../../../../src/integrations/quotes/code.ts';

export { LOAD_MAX_AGE_DAYS, QUOTE_VALIDITY_DAYS, normalizeQuoteCode, type NormalizedQuoteCode };

const SV_TZ = 'America/El_Salvador';
const svFmt = new Intl.DateTimeFormat('en-CA', { timeZone: SV_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** El Salvador calendar date as `YYYY-MM-DD` (SV has no DST, UTC-6). */
export function svDate(d: Date): string {
  return svFmt.format(d);
}

/** `YYYY-MM-DD` + n days (pure calendar math, no timezone involved). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** New canonical folio: SV date + 7 random Crockford chars + check char. */
export function generateQuoteCode(now: Date): string {
  const bytes = randomBytes(7);
  let body = '';
  for (const b of bytes) body += QUOTE_CODE_ALPHABET[b % 32];
  return makeQuoteCode(svDate(now).replaceAll('-', ''), body);
}
