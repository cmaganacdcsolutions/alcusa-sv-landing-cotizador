import { describe, expect, it } from 'vitest';
import { cotizadorHref, parseDeepLink, parseGlassParam, toColorParam } from './deepLink';

describe('content/deepLink', () => {
  it('resolves a leaf slug to model + preset', () => {
    expect(parseDeepLink('?producto=jardin-3-hojas')).toMatchObject({ kind: 'priced', quoterModel: 'jardin', preset: { gardenHojas: 3 } });
    expect(parseDeepLink('?producto=ventana-bilbao')).toMatchObject({ kind: 'priced', quoterModel: 'ventana', preset: { windowType: 'bilbao' } });
    expect(parseDeepLink('?producto=l-frosted')).toMatchObject({ kind: 'priced', quoterModel: 'l', preset: { cornerFinish: 'frosted' } });
  });

  it('canonical slugs advance to Medidas', () => {
    for (const slug of ['templada-10mm', 'en-l', 'l-frosted', 'jardin-2-hojas', 'ventana-bilbao']) {
      expect(parseDeepLink(`?producto=${slug}`), slug).toMatchObject({ kind: 'priced', advance: true });
    }
  });

  it('a subcategory with variants resolves to its cheapest priced variant', () => {
    expect(parseDeepLink('?producto=en-l')).toMatchObject({ kind: 'priced', quoterModel: 'l', preset: { cornerFinish: 'aquaclara' } });
  });

  it('legacy ids keep working through SLUG_ALIASES', () => {
    const legacy = ['recta', 'l', 'templado', 'bisagra', 'jardin', 'ventana'] as const;
    for (const id of legacy) expect(parseDeepLink(`?producto=${id}`), id).toMatchObject({ kind: 'priced', quoterModel: id });
    for (const id of legacy) expect(parseDeepLink(`?producto=${id}`), id).toMatchObject({ advance: false });
    expect(parseDeepLink('?producto=jardin')).toMatchObject({ preset: { gardenHojas: 1 } });
    expect(parseDeepLink('?producto=ventana')).toMatchObject({ preset: { windowType: 'francesa' } });
  });

  it('advisorOnly slugs never resolve to a priced model', () => {
    expect(parseDeepLink('?producto=jardin-2-fijas-2-corredizas')).toEqual({
      kind: 'advisor',
      slug: 'jardin-2-fijas-2-corredizas',
      name: '2 fijas + 2 corredizas',
    });
  });

  it('a category slug is reported as category (R5 opens it in step 0)', () => {
    expect(parseDeepLink('?producto=ventanas')).toEqual({ kind: 'category', slug: 'ventanas' });
  });

  it('invalid, empty, missing and prototype-key values are ignored', () => {
    for (const s of ['', '?', '?producto=', '?producto=nope', '?producto=__proto__', '?producto=constructor', '?x=recta']) {
      expect(parseDeepLink(s), s).toEqual({ kind: 'none' });
    }
  });

  it('cotizadorHref builds the deep link', () => {
    expect(cotizadorHref('en-l')).toBe('/cotizador?producto=en-l');
  });

  it('vidrio param: href + parse, unknown values ignored', () => {
    expect(cotizadorHref('recta', { vidrio: 'nevado' })).toBe('/cotizador?producto=recta&vidrio=nevado');
    expect(parseGlassParam('?producto=recta&vidrio=aquafold')).toBe('aquafold');
    expect(parseGlassParam('?vidrio=__x')).toBeNull();
    expect(parseGlassParam('')).toBeNull();
  });

  it('color param: colores de aluminio validos, desconocidos se ignoran', () => {
    for (const c of ['natural', 'blanco', 'bronce']) expect(toColorParam(c)).toBe(c);
    for (const c of ['fucsia', '', 'Natural', null, undefined]) expect(toColorParam(c), String(c)).toBeNull();
  });
});
