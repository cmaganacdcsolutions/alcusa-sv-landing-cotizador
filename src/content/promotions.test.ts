import { describe, expect, it } from 'vitest';
import {
  PROMOTIONS,
  PromotionsDataError,
  activePromotions,
  MAX_PROMOS,
  discountPct,
  formatUsd,
  getActivePromotions,
  isActive,
  parsePromotions,
  savings,
  todayInSV,
  vigenciaLabel,
} from './promotions';

const base = {
  id: 'p1',
  title: 'T',
  description: 'D',
  image: '/images/x.jpg',
  image_alt: 'alt',
  price_before: 260,
  price_promo: 222,
  product_slug: 'recta',
  starts_on: '2026-09-01',
  ends_on: '2026-10-31',
};
const wrap = (...items: object[]) => ({ promotions: items });

describe('schema', () => {
  it('el JSON entregado valida y toda promo semilla esta marcada placeholder', () => {
    expect(PROMOTIONS.length).toBeGreaterThan(0);
    expect(PROMOTIONS.every((p) => p.placeholder)).toBe(true);
  });
  it('mapea snake_case a modelo de UI', () => {
    const [p] = parsePromotions(wrap(base));
    expect(p).toMatchObject({ antes: 260, ahora: 222, desde: '2026-09-01', hasta: '2026-10-31', imageAlt: 'alt', rules: [] });
  });
  it('acepta promo sin precio anterior', () => {
    expect(parsePromotions(wrap({ ...base, price_before: null }))[0].antes).toBeNull();
  });
  it.each([
    ['id faltante', { ...base, id: '' }, /"id"/],
    ['alt faltante', { ...base, image_alt: '' }, /"image_alt"/],
    ['precio ahora >= antes', { ...base, price_promo: 260 }, /menor que/],
    ['fecha invalida', { ...base, ends_on: '2026-02-31' }, /"ends_on"/],
    ['desde > hasta', { ...base, starts_on: '2026-12-01' }, /posterior/],
    ['slug inexistente', { ...base, product_slug: 'nope' }, /no existe en el catalogo/],
    ['rules no texto', { ...base, rules: [1] }, /"rules"/],
  ])('rechaza con mensaje claro: %s', (_n, item, msg) => {
    expect(() => parsePromotions(wrap(item))).toThrow(PromotionsDataError);
    expect(() => parsePromotions(wrap(item))).toThrow(msg);
  });
  it('rechaza ids duplicados y estructura sin arreglo', () => {
    expect(() => parsePromotions(wrap(base, base))).toThrow(/duplicado/);
    expect(() => parsePromotions({})).toThrow(/promotions/);
  });
  it('junta todos los errores con su indice e id', () => {
    try {
      parsePromotions(wrap({ ...base, id: 'a', price_promo: 0 }, { ...base, id: 'b', title: '' }));
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/promotions\[0\] \(a\)[\s\S]*promotions\[1\] \(b\)/);
    }
  });
});

describe('badge y ahorro', () => {
  it('badge = (antes-ahora)/antes redondeado (muestras del board)', () => {
    expect(discountPct({ antes: 260, ahora: 222 })).toBe(15);
    expect(discountPct({ antes: 127, ahora: 108 })).toBe(15);
    expect(discountPct({ antes: 482, ahora: 410 })).toBe(15);
    expect(discountPct({ antes: 790, ahora: 672 })).toBe(15);
    expect(discountPct({ antes: 100, ahora: 67 })).toBe(33);
  });
  it('sin precio anterior no hay badge ni ahorro', () => {
    expect(discountPct({ antes: null, ahora: 50 })).toBeNull();
    expect(savings({ antes: null, ahora: 50 })).toBeNull();
  });
  it('descuento que redondea a 0% se omite', () => {
    expect(discountPct({ antes: 1000, ahora: 998 })).toBeNull();
  });
  it('ahorro = antes - ahora', () => {
    expect(savings({ antes: 260, ahora: 222 })).toBe(38);
  });
});

describe('vigencia', () => {
  const p3 = [
    { desde: '2026-09-01', hasta: '2026-10-31' },
    { desde: '2026-09-01', hasta: '2026-11-15' },
    { desde: '2026-08-01', hasta: '2026-09-15' }, // vencida
  ];
  it('oculta vencidas con fecha fija (2 de 3)', () => {
    expect(activePromotions(p3, '2026-09-30')).toHaveLength(2);
  });
  it('limites inclusivos y promos futuras ocultas', () => {
    expect(isActive(p3[0], '2026-10-31')).toBe(true);
    expect(isActive(p3[0], '2026-11-01')).toBe(false);
    expect(isActive(p3[0], '2026-08-31')).toBe(false);
  });
  it('0 vigentes = lista vacia', () => {
    expect(activePromotions(p3, '2027-01-01')).toEqual([]);
  });
  it('hoy se calcula en hora de El Salvador (UTC-6)', () => {
    expect(todayInSV(new Date('2026-10-01T03:00:00Z'))).toBe('2026-09-30');
  });
  it('etiqueta "Vigente hasta el D de mes"', () => {
    expect(vigenciaLabel('2026-10-31')).toBe('Vigente hasta el 31 de octubre');
    expect(vigenciaLabel('2026-11-15')).toBe('Vigente hasta el 15 de noviembre');
  });
});

describe('formato y tope', () => {
  it('formatUsd usa separador de miles como el board r02 ($1,260)', () => {
    expect(formatUsd(260)).toBe('$260');
    expect(formatUsd(1260)).toBe('$1,260');
    expect(formatUsd(1071)).toBe('$1,071');
    expect(formatUsd(12.5)).toBe('$12.50');
  });
  it('la landing muestra como maximo 3 promos vigentes (decision 2026-09-30)', () => {
    expect(MAX_PROMOS).toBe(3);
    expect(getActivePromotions(new Date('2026-09-30T18:00:00Z')).length).toBeLessThanOrEqual(3);
  });
});
