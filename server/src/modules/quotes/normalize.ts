// Customer normalization (ADR-011 §5). Pure functions.

export type NameResult = { ok: true; value: string } | { ok: false; issue: 'too_short' | 'too_long' | 'invalid' };

/** NFC, trim, collapse whitespace; 2..80; >= 2 letters; no control chars; no URL look. */
export function normalizeName(raw: string): NameResult {
  if (raw.length > 400) return { ok: false, issue: 'too_long' };
  const v = raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
  const len = [...v].length;
  if (len < 2) return { ok: false, issue: 'too_short' };
  if (len > 80) return { ok: false, issue: 'too_long' };
  if (/\p{Cc}/u.test(v)) return { ok: false, issue: 'invalid' };
  if ((v.match(/\p{L}/gu) ?? []).length < 2) return { ok: false, issue: 'invalid' };
  if (/http|www\./iu.test(v)) return { ok: false, issue: 'invalid' };
  return { ok: true, value: v };
}

/**
 * E.164 (ADR-011 §5): strip spaces/dashes/dots/parens; `00` -> `+`; 8 digits -> +503;
 * 503 + 8 digits -> +503...; +503 needs a mobile first digit (6|7); otherwise ^\+[1-9]\d{7,14}$.
 */
export function normalizeWhatsapp(raw: string): string | null {
  if (raw.length > 40) return null;
  let s = raw.trim().replace(/[\s\-.()]/gu, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^\d{8}$/u.test(s)) s = `+503${s}`;
  else if (/^503\d{8}$/u.test(s)) s = `+${s}`;
  if (!/^\+[1-9]\d{7,14}$/u.test(s)) return null;
  if (s.startsWith('+503') && !/^\+503[67]\d{7}$/u.test(s)) return null;
  return s;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
export function normalizeEmail(raw: string): string | null {
  const v = raw.trim();
  return v.length >= 3 && v.length <= 160 && EMAIL.test(v) && !/\p{Cc}/u.test(v) ? v : null;
}
