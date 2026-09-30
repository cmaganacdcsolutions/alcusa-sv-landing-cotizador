import { describe, expect, it } from 'vitest';
import {
  formatQuoteCode,
  groupQuoteInput,
  makeQuoteCode,
  normalizeQuoteCode,
  QUOTE_CODE_ALPHABET,
  quoteCheckChar,
} from './code';

const NOW = new Date('2026-09-30T12:00:00Z');
// Vectores calculados a mano con check = ALPHABET[(sum v_i*(i+1)) mod 31].
// K7QM3X9: 19+14+69+80+15+174+63 = 434 = 14*31 -> '0'. (El ejemplo del ADR,
// "...K7QM3X90", NO cumple su propia formula: aqui se fija la formula.)
const GOOD = 'ALC-20260930-K7QM3X90';

describe('quoteCheckChar (vectores)', () => {
  it.each([
    ['K7QM3X9', '0'],
    ['0000001', '7'],
    ['1000000', '1'],
    ['0000000', '0'],
    ['ZZZZZZZ', '0'],
    ['A000000', 'A'], // 10*1 = 10 -> 'A'
  ])('%s -> %s', (body, check) => {
    expect(quoteCheckChar(body)).toBe(check);
  });

  it('detecta todo error de un caracter y toda transposicion adyacente', () => {
    const body = 'K7QM3X9';
    const good = quoteCheckChar(body);
    for (let i = 0; i < body.length; i += 1) {
      for (const ch of QUOTE_CODE_ALPHABET) {
        if (ch === body[i]) continue;
        const mutated = body.slice(0, i) + ch + body.slice(i + 1);
        expect(quoteCheckChar(mutated)).not.toBe(good);
      }
    }
    for (let i = 0; i < body.length - 1; i += 1) {
      if (body[i] === body[i + 1]) continue;
      const swapped = body.slice(0, i) + body[i + 1] + body[i] + body.slice(i + 2);
      expect(quoteCheckChar(swapped)).not.toBe(good);
    }
  });
});

describe('makeQuoteCode / formatQuoteCode', () => {
  it('arma el canonico y lo agrupa 4+4', () => {
    expect(makeQuoteCode('20260930', 'K7QM3X9')).toBe(GOOD);
    expect(formatQuoteCode(GOOD)).toBe('ALC-20260930-K7QM-3X90');
    expect(formatQuoteCode('basura')).toBe('basura');
  });
});

describe('normalizeQuoteCode', () => {
  const ok = { ok: true, code: GOOD, date: '20260930' };

  it.each([
    ['canonico', GOOD],
    ['agrupado', 'ALC-20260930-K7QM-3X90'],
    ['minusculas y espacios', 'alc 20260930 k7qm 3x90'],
    ['sin prefijo', '20260930-K7QM-3X90'],
    ['pegado sin separadores', 'ALC20260930K7QM3X90'],
    ['puntos y guiones bajos', 'alc_20260930_k7qm.3x90'],
    ['espacios alrededor', '   ALC-20260930-K7QM-3X90  '],
    ['O->0 en el sufijo', 'ALC-20260930-K7QM-3X9O'],
  ])('acepta %s', (_n, input) => {
    expect(normalizeQuoteCode(input, NOW)).toEqual(ok);
  });

  it('mapea I y L a 1 en el sufijo (no en la fecha)', () => {
    const code = makeQuoteCode('20260930', 'K7Q1M3X');
    expect(normalizeQuoteCode(code.replace(/1/g, 'I'), NOW)).toEqual({ ok: true, code, date: '20260930' });
    expect(normalizeQuoteCode(code.replace('Q1', 'QL'), NOW)).toEqual({ ok: true, code, date: '20260930' });
  });

  it('encuentra el folio dentro de un mensaje pegado de WhatsApp', () => {
    const msg = 'Hola, te comparto mi cotizacion ALC-20260930-K7QM-3X90 de ALCUSA. Gracias!';
    expect(normalizeQuoteCode(msg, NOW)).toEqual(ok);
  });

  it('rechaza sufijo sin fecha', () => {
    expect(normalizeQuoteCode('K7QM-3X90', NOW)).toEqual({ ok: false, reason: 'incomplete' });
  });

  it('incompleto', () => {
    expect(normalizeQuoteCode('ALC-20260930-K7QM', NOW)).toEqual({ ok: false, reason: 'incomplete' });
    expect(normalizeQuoteCode('', NOW)).toEqual({ ok: false, reason: 'incomplete' });
  });

  it('digito verificador malo y U (no existe en el alfabeto)', () => {
    expect(normalizeQuoteCode('ALC-20260930-K7QM-3X91', NOW)).toEqual({ ok: false, reason: 'check' });
    expect(normalizeQuoteCode('ALC-20260930-K7QM-3X9U', NOW)).toEqual({ ok: false, reason: 'check' });
    expect(normalizeQuoteCode('ALC-20260930-K7QM-3X90Z', NOW)).toEqual({ ok: false, reason: 'check' });
  });

  it('fecha futura, inexistente o mas vieja que LOAD_MAX_AGE_DAYS = formato invalido', () => {
    const future = makeQuoteCode('20261001', 'K7QM3X9');
    const fake = makeQuoteCode('20260231', 'K7QM3X9');
    const old = makeQuoteCode('20260101', 'K7QM3X9');
    for (const c of [future, fake, old]) expect(normalizeQuoteCode(c, NOW)).toEqual({ ok: false, reason: 'incomplete' });
    const edge = makeQuoteCode('20260702', 'K7QM3X9'); // 90 dias exactos
    expect(normalizeQuoteCode(edge, NOW).ok).toBe(true);
  });

  it('folio de contingencia (U inicial) se reconoce sin consultar', () => {
    expect(normalizeQuoteCode('ALC-20260930-UK7Q-M3X9', NOW)).toEqual({ ok: false, reason: 'contingency' });
    expect(normalizeQuoteCode('ALC-20260930-UK7QM3X9', NOW)).toEqual({ ok: false, reason: 'contingency' });
    // La L ya NO es marcador: se normaliza a 1 (un folio real que empieza en 1).
    expect(normalizeQuoteCode('ALC-20260930-LK7QM3X9', NOW)).toEqual({ ok: false, reason: 'check' });
  });
});

describe('groupQuoteInput', () => {
  it('agrupa mientras escribe y pone mayusculas', () => {
    expect(groupQuoteInput('alc20260930k7qm3x90')).toBe('ALC-20260930-K7QM-3X90');
    expect(groupQuoteInput('alc-2026')).toBe('ALC-2026');
    expect(groupQuoteInput('20260930')).toBe('ALC-20260930');
    expect(groupQuoteInput('')).toBe('');
  });
});
