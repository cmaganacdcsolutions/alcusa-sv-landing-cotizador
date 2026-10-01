// The server uses the FE module as is (ADR-013 §2.1: one implementation).
// Normative vectors from src/integrations/quotes/code.test.ts.
import { describe, expect, it } from 'vitest';
import { makeQuoteCode, normalizeQuoteCode, QUOTE_CODE_ALPHABET, quoteCheckChar } from '../../../src/integrations/quotes/code.ts';

const NOW = new Date('2026-09-30T12:00:00Z');

describe('quote code (shared FE module)', () => {
  it.each([
    ['K7QM3X9', '0'],
    ['0000001', '7'],
    ['1000000', '1'],
    ['0000000', '0'],
    ['ZZZZZZZ', '0'],
    ['A000000', 'A'],
  ])('check char %s -> %s', (body, check) => {
    expect(quoteCheckChar(body)).toBe(check);
  });

  it('builds and normalizes the canonical folio', () => {
    const code = makeQuoteCode('20260930', 'K7QM3X9');
    expect(code).toBe('ALC-20260930-K7QM3X90');
    expect(normalizeQuoteCode(code, NOW)).toEqual({ ok: true, code, date: '20260930' });
  });

  it('rejects a bad check digit, short input, and contingency (U) folios', () => {
    expect(normalizeQuoteCode('ALC-20260930-K7QM3X91', NOW)).toEqual({ ok: false, reason: 'check' });
    expect(normalizeQuoteCode('ALC-20260930-K7QM3', NOW)).toEqual({ ok: false, reason: 'incomplete' });
    expect(normalizeQuoteCode('ALC-20260930-U7QM3X90', NOW)).toEqual({ ok: false, reason: 'contingency' });
  });

  it('uses the Crockford alphabet (no I, L, O, U)', () => {
    expect(QUOTE_CODE_ALPHABET).toHaveLength(32);
    for (const ch of 'ILOU') expect(QUOTE_CODE_ALPHABET).not.toContain(ch);
  });
});

describe('dev seed folios (server/db/seed/dev.sql) are valid for the shared module', () => {
  // The DBA computed these with a reimplementation; this pins them to code.ts.
  it.each(['ALC-20260930-D3VK7QMR', 'ALC-20261001-H8T2NWB4', 'ALC-20260901-R5C9XJ4F'])('%s', (code) => {
    const res = normalizeQuoteCode(code, new Date('2026-10-01T12:00:00Z'));
    expect(res).toMatchObject({ ok: true, code });
  });
});
