/** Money crosses the API as USD decimals (max 2 decimals); all arithmetic is done in integer cents. */
export const MAX_MONEY = 1_000_000;

export function isMoney(v: number): boolean {
  if (!Number.isFinite(v) || v < 0 || v > MAX_MONEY) return false;
  const c = v * 100;
  return Math.abs(c - Math.round(c)) < 1e-6;
}

export function toCents(v: number): number {
  return Math.round(v * 100);
}

/** Cents -> decimal string for DECIMAL(10,2) binds (never a float). */
export function centsToDecimal(c: number): string {
  return `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

export function centsToNumber(c: number): number {
  return c / 100;
}

/** DECIMAL string from the driver -> integer cents. */
export function decimalToCents(s: string): number {
  return Math.round(Number(s) * 100);
}
