import { describe, expect, it } from 'vitest';
import { isMoney, toCents, centsToDecimal } from '../../src/modules/quotes/money.ts';
import { normalizeName, normalizeWhatsapp } from '../../src/modules/quotes/normalize.ts';

describe('normalizeWhatsapp (ADR-011 §5)', () => {
  it.each([
    ['7123-4567', '+50371234567'],
    ['71234567', '+50371234567'],
    ['503 7123 4567', '+50371234567'],
    ['50371234567', '+50371234567'],
    ['+503 (6123) 4567', '+50361234567'],
    ['00503 71234567', '+50371234567'],
    ['+1 305 555 0100', '+13055550100'],
    ['0013055550100', '+13055550100'],
  ])('%s -> %s', (raw, e164) => expect(normalizeWhatsapp(raw)).toBe(e164));

  it.each(['', 'abc', '2200-1234', '+50322001234', '+5037123456', '1234567', '+0123456789', '+123456', '9'.repeat(41)])('rejects %j', (raw) =>
    expect(normalizeWhatsapp(raw)).toBeNull(),
  );
});

describe('normalizeName', () => {
  it('NFC + trim + collapse', () => {
    const r = normalizeName('  José   Peña ');
    expect(r).toEqual({ ok: true, value: 'José Peña' });
  });
  it.each([
    ['A', 'too_short'],
    ['a'.repeat(81), 'too_long'],
    ['1234', 'invalid'],
    ['ab\u0007c', 'invalid'],
    ['visit http://x.co', 'invalid'],
    ['WWW.spam', 'invalid'],
  ])('%j -> %s', (raw, issue) => expect(normalizeName(raw)).toEqual({ ok: false, issue }));
  it('keeps legitimate symbols', () => expect(normalizeName("María-José O'Neil Jr.")).toMatchObject({ ok: true }));
});

describe('money (2 decimals, cents)', () => {
  it.each([0, 0.1, 19.99, 222, 1_000_000, 0.29, 1.15])('accepts %s', (v) => expect(isMoney(v)).toBe(true));
  it.each([-0.01, 1.005, 19.999, Number.NaN, Infinity, 1_000_000.01])('rejects %s', (v) => expect(isMoney(v)).toBe(false));
  it('converts to cents and decimal strings without float drift', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.29)).toBe(29);
    expect(toCents(1.15)).toBe(115);
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(46300)).toBe('463.00');
  });
});
