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
  promoHref,
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
  it('el JSON entregado valida: 3 flyers oficiales (no placeholder), sin precio anterior', () => {
    expect(PROMOTIONS.map((p) => [p.title, p.ahora])).toEqual([
      ['Puerta Aquaclara', 222],
      ['Puerta corrediza con vidrio nevado', 260],
      ['Modelo Aquafold', 279.99],
    ]);
    expect(PROMOTIONS.every((p) => !p.placeholder && p.antes === null && p.rules.length > 0)).toBe(true);
    expect(PROMOTIONS.every((p) => p.desde === '2026-10-01' && p.hasta === '2026-10-31')).toBe(true);
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

  it('cotizador_params.vidrio: valida y se mapea', () => {
    const [p] = parsePromotions({ promotions: [{ ...base, cotizador_params: { vidrio: 'nevado' } }] }, () => true);
    expect(p.cotizadorParams).toEqual({ vidrio: 'nevado' });
    expect(() => parsePromotions({ promotions: [{ ...base, cotizador_params: { vidrio: 'rosa' } }] }, () => true)).toThrow(/vidrio/);
  });

  it('cotizador_params.color: valida (natural/blanco/bronce) y se mapea junto al vidrio', () => {
    for (const color of ['natural', 'blanco', 'bronce']) {
      const [p] = parsePromotions(wrap({ ...base, cotizador_params: { color, vidrio: 'claro' } }));
      expect(p.cotizadorParams).toEqual({ color, vidrio: 'claro' });
    }
    const [soloColor] = parsePromotions(wrap({ ...base, cotizador_params: { color: 'bronce' } }));
    expect(soloColor.cotizadorParams).toEqual({ color: 'bronce' });
  });

  it('cotizador_params.color: rechaza colores desconocidos o que no son texto', () => {
    for (const color of ['fucsia', '', 'Natural', 7, null]) {
      const item = { ...base, cotizador_params: { color, vidrio: 'claro' } };
      expect(() => parsePromotions(wrap(item)), String(color)).toThrow(/cotizador_params.color/);
    }
  });

  it('cotizador_params ausente o vacio no genera cotizadorParams', () => {
    expect(parsePromotions(wrap(base))[0].cotizadorParams).toBeUndefined();
    expect(parsePromotions(wrap({ ...base, cotizador_params: {} }))[0].cotizadorParams).toBeUndefined();
  });
});

describe('promoHref (contrato del inicio: producto -> paso -> color -> vidrio)', () => {
  it('el seed: las 3 promos caen en Medidas con recta + natural + su vidrio', () => {
    expect(PROMOTIONS.map((p) => [p.id, promoHref(p)])).toEqual([
      ['promo-puerta-aquaclara', '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=claro'],
      ['promo-corrediza-nevado', '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=nevado'],
      ['promo-aquafold', '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=aquafold'],
    ]);
  });
  it('orden de parametros estable aunque el JSON liste vidrio antes que color', () => {
    const [p] = parsePromotions(wrap({ ...base, cotizador_params: { vidrio: 'nevado', color: 'bronce' } }));
    expect(promoHref(p)).toBe('/cotizador?producto=recta&paso=medidas&color=bronce&vidrio=nevado');
  });
  it('solo vidrio o solo color: omite el parametro que falta', () => {
    expect(promoHref({ productSlug: 'recta', cotizadorParams: { vidrio: 'duplex' } })).toBe(
      '/cotizador?producto=recta&paso=medidas&vidrio=duplex',
    );
    expect(promoHref({ productSlug: 'recta', cotizadorParams: { color: 'blanco' } })).toBe(
      '/cotizador?producto=recta&paso=medidas&color=blanco',
    );
  });
  it('sin parametros conserva el enlace previo (?producto=<slug>)', () => {
    expect(promoHref({ productSlug: 'recta' })).toBe('/cotizador?producto=recta');
    expect(promoHref({ productSlug: 'recta', cotizadorParams: {} })).toBe('/cotizador?producto=recta');
  });
});
