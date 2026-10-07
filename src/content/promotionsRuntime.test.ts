import { describe, expect, it } from 'vitest';
import adminPublished from './__fixtures__/admin-published-promotions.json';
import { resolveRuntimePromotions } from '../components/promotionsRuntime';
import {
  MAX_PROMOS,
  PROMOTIONS_ENDPOINT,
  isSafePromoImage,
  parsePromotions,
  promoHref,
  promoImageSrcSet,
  promosTitle,
  selectActivePromotions,
} from './promotionsParser';

// Contrato admin -> sitio (ADR-014 A5). `__fixtures__/admin-published-promotions.json` lo genero el codigo REAL del
// admin (admin-v1/server/src/modules/promotions/publish.ts `buildDocument` + `validatePromotions`, 4 promos: con
// color+vidrio, solo vidrio sin precio anterior, sin acabados, y una 4a que la landing no debe mostrar). Si el admin
// cambia su formato, se regenera y este test dice si el sitio lo sigue aceptando.

const IN_RANGE = '2026-10-15';
const clone = (): { promotions: Record<string, unknown>[] } => structuredClone(adminPublished) as never;

describe('contrato: lo que publica el admin lo acepta el parser del sitio', () => {
  it('parsePromotions acepta el documento publicado tal cual (mismos campos, cotizador_params con color)', () => {
    const list = parsePromotions(adminPublished);
    expect(list.map((p) => p.id)).toEqual(['promo-a1b2c3', 'promo-d4e5f6', 'promo-0a1b2c', 'promo-cuarta']);
    expect(list[0]).toMatchObject({
      image: '/media/promos/9f2c1a7b3d4e-900.webp',
      imageAlt: 'Flyer: Puerta Aquaclara, $222.',
      antes: 280,
      ahora: 222,
      productSlug: 'recta',
      cotizadorParams: { color: 'natural', vidrio: 'claro' },
      desde: '2026-10-01',
      hasta: '2026-10-31',
      rules: ['Instalada', 'Entrega en 5 días'],
      placeholder: false,
    });
    expect(list[1]).toMatchObject({ antes: null, cotizadorParams: { vidrio: 'nevado' } });
    expect(list[2].cotizadorParams).toBeUndefined();
  });

  it('el admin solo publica campos que el sitio conoce (nada se ignora en silencio)', () => {
    const known = new Set(['id', 'placeholder', 'title', 'description', 'image', 'image_alt', 'price_before', 'price_promo', 'product_slug', 'cotizador_params', 'starts_on', 'ends_on', 'rules']);
    for (const p of adminPublished.promotions) {
      for (const k of Object.keys(p)) expect(known.has(k), k).toBe(true);
      for (const k of Object.keys((p as { cotizador_params?: object }).cotizador_params ?? {})) expect(['color', 'vidrio']).toContain(k);
    }
  });

  it('el CTA conserva el deep link a Medidas con color + vidrio (promoHref)', () => {
    const [a, b, c] = parsePromotions(adminPublished);
    expect(promoHref(a)).toBe('/cotizador?producto=recta&paso=medidas&color=natural&vidrio=claro');
    expect(promoHref(b)).toBe('/cotizador?producto=recta&paso=medidas&vidrio=nevado');
    expect(promoHref(c)).toBe('/cotizador?producto=ventana-francesa');
  });

  it('el endpoint es el que sirve nginx', () => {
    expect(PROMOTIONS_ENDPOINT).toBe('/api/promotions.json');
  });
});

describe('resolveRuntimePromotions (lo que hace el navegador con el JSON)', () => {
  it('vigentes hoy y maximo 3: la 4a promo del JSON nunca se muestra', () => {
    const out = resolveRuntimePromotions(adminPublished, IN_RANGE);
    expect(out?.map((p) => p.id)).toEqual(['promo-a1b2c3', 'promo-d4e5f6', 'promo-0a1b2c']);
    expect(out).toHaveLength(MAX_PROMOS);
  });

  it('filtra por vigencia: fuera de rango = lista vacia (seccion oculta), no null', () => {
    expect(resolveRuntimePromotions(adminPublished, '2026-11-01')).toEqual([]);
    expect(resolveRuntimePromotions(adminPublished, '2026-09-30')).toEqual([]);
    expect(resolveRuntimePromotions({ promotions: [] }, IN_RANGE)).toEqual([]);
  });

  it('una promo archivada (ausente del JSON) desaparece', () => {
    const doc = clone();
    doc.promotions.splice(1, 1);
    expect(resolveRuntimePromotions(doc, IN_RANGE)?.map((p) => p.id)).toEqual(['promo-a1b2c3', 'promo-0a1b2c', 'promo-cuarta']);
    doc.promotions.splice(1, 2);
    expect(resolveRuntimePromotions(doc, IN_RANGE)).toHaveLength(1);
  });

  it('JSON invalido => null (el llamador conserva el HTML horneado)', () => {
    for (const bad of [null, undefined, 'x', 42, [], {}, { promotions: 'no' }, { promotions: [null] }]) {
      expect(resolveRuntimePromotions(bad, IN_RANGE), String(bad)).toBeNull();
    }
    const doc = clone();
    doc.promotions[0].price_promo = -1;
    expect(resolveRuntimePromotions(doc, IN_RANGE)).toBeNull();
    const slug = clone();
    slug.promotions[0].product_slug = 'no-existe';
    expect(resolveRuntimePromotions(slug, IN_RANGE)).toBeNull();
  });

  it('imagenes fuera de /media/promos/ y /images/promos/ => null', () => {
    for (const image of [
      'https://evil.example/x-900.webp',
      '//evil.example/x-900.webp',
      'javascript:alert(1)',
      'data:image/svg+xml;base64,AAAA',
      '/media/promos/../../etc/passwd',
      '/media/other/x-900.webp',
      '/images/promos/',
      '/images/promos/a/b-900.webp',
      '/media\\promos\\x-900.webp',
    ]) {
      const doc = clone();
      doc.promotions[0].image = image;
      expect(resolveRuntimePromotions(doc, IN_RANGE), image).toBeNull();
    }
  });
});

describe('helpers del parser compartido', () => {
  it('isSafePromoImage: solo mismo origen en las dos carpetas de promos', () => {
    expect(isSafePromoImage('/media/promos/9f2c1a7b3d4e-900.webp')).toBe(true);
    expect(isSafePromoImage('/images/promos/promo-1-900.webp')).toBe(true);
    expect(isSafePromoImage('/images/logo.webp')).toBe(false);
    expect(isSafePromoImage('http://localhost/media/promos/a.webp')).toBe(false);
    expect(isSafePromoImage('')).toBe(false);
  });

  it('promoImageSrcSet: 600w/900w para <clave>-900.webp; sin srcset en otro nombre', () => {
    expect(promoImageSrcSet('/images/promos/promo-1-900.webp')).toBe('/images/promos/promo-1-600.webp 600w, /images/promos/promo-1-900.webp 900w');
    expect(promoImageSrcSet('/media/promos/x.png')).toBeUndefined();
  });

  it('selectActivePromotions: vigencia y tope', () => {
    const mk = (id: string, desde: string, hasta: string) => ({ id, desde, hasta });
    const all = [
      mk('a', '2026-10-01', '2026-10-31'),
      mk('b', '2026-10-01', '2026-10-31'),
      mk('c', '2026-10-01', '2026-10-31'),
      mk('d', '2026-10-01', '2026-10-31'),
      mk('old', '2026-01-01', '2026-01-31'),
    ];
    expect(selectActivePromotions(all, IN_RANGE).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(selectActivePromotions(all, '2026-01-15').map((p) => p.id)).toEqual(['old']);
  });

  it('promosTitle: singular con 1, plural con otro conteo', () => {
    expect(promosTitle(1)).toBe('Una oferta que puedes aprovechar hoy');
    expect(promosTitle(2)).toBe('Ofertas que puedes aprovechar hoy');
    expect(promosTitle(3)).toBe('Ofertas que puedes aprovechar hoy');
  });
});
