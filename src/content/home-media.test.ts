import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './catalog';
import { PRODUCT_CONFIGS } from './catalogHome';
import { CATEGORY_MEDIA, PRODUCT_MEDIA, coverFor, defaultFinishOf, pickVariant, variantKey, variantsOf } from './home-media';
import { CATEGORY_TEASERS } from './categoryTeasers';

const exists = (p: string): boolean => existsSync(join(process.cwd(), 'public', p));
const LEGACY = /\/images\/(catalog|card-|hero-|galeria|finish-)/;

describe('home-media: solo renders profesionales', () => {
  it('cada tarjeta del inicio tiene portada render existente en /images/renders/', () => {
    for (const slug of Object.keys(PRODUCT_CONFIGS)) {
      const m = PRODUCT_MEDIA[slug];
      expect(m, slug).toBeDefined();
      expect(m!.cover.src).toMatch(/^\/images\/renders\//);
      expect(m!.cover.kind).toBe('render');
      expect(exists(m!.cover.src), m!.cover.src).toBe(true);
    }
  });

  it('todas las variantes, categorias y teasers existen y no usan rutas legacy', () => {
    const refs = [
      ...Object.values(PRODUCT_MEDIA).flatMap((m) => [m.cover, ...Object.values(m.variants ?? {})]),
      ...Object.values(CATEGORY_MEDIA),
      ...CATEGORY_TEASERS.map((t) => t.image),
    ];
    expect(refs.length).toBeGreaterThan(15);
    for (const r of refs) {
      expect(r.src).not.toMatch(LEGACY);
      expect(r.alt.length).toBeGreaterThan(8);
      expect(exists(r.src), r.src).toBe(true);
    }
  });

  it('coverFor: variante exacta por color x vidrio (en-l: color x acabado); si falta, el vidrio por defecto y luego la portada', () => {
    // Exacta: cada combinacion tiene su propio archivo (antes decorado/aquafold... caian a "claro").
    expect(coverFor('recta', { color: 'bronce', vidrio: 'nevado' })?.src).toBe('/images/renders/recta-bronce-nevado-800.webp');
    expect(coverFor('recta', { color: 'bronce', vidrio: 'decorado' })?.src).toBe('/images/renders/recta-bronce-decorado-800.webp');
    expect(coverFor('recta', { color: 'bronce', vidrio: 'aquafold' })?.src).toBe('/images/renders/recta-bronce-aquafold-800.webp');
    expect(coverFor('ventana-francesa', { color: 'natural', vidrio: 'super_gris' })?.src).toBe(
      '/images/renders/ventana-francesa-natural-super-gris-800.webp',
    );
    expect(coverFor('ventana-bilbao', { color: 'blanco', vidrio: 'reflectivo_bronce' })?.src).toBe(
      '/images/renders/ventana-bilbao-blanco-reflectivo-bronce-800.webp',
    );
    expect(coverFor('bisagra', { color: 'blanco', vidrio: 'duplex' })?.src).toBe('/images/renders/bisagra-blanco-duplex-800.webp');
    // En L el vidrio sale del acabado (prefijo `l-` fuera del nombre de archivo).
    expect(coverFor('en-l', { color: 'natural', acabado: 'l-aquaclara' })?.src).toBe('/images/renders/en-l-natural-aquaclara-800.webp');
    expect(coverFor('en-l', { color: 'bronce', acabado: 'l-aquafold' })?.src).toBe('/images/renders/en-l-bronce-aquafold-800.webp');
    // Escalera: vidrio desconocido -> mismo color con el vidrio por defecto; acabado ausente -> el acabado por defecto.
    expect(coverFor('recta', { color: 'bronce', vidrio: 'no-existe' })?.src).toBe('/images/renders/recta-bronce-claro-800.webp');
    expect(coverFor('en-l', { color: 'bronce' })?.src).toBe('/images/renders/en-l-bronce-aquaclara-800.webp');
    // Sin color (o sin variantes) -> portada.
    expect(coverFor('recta')?.src).toBe('/images/renders/recta-800.webp');
    expect(coverFor('recta', { vidrio: 'nevado' })?.src).toBe('/images/renders/recta-800.webp');
    expect(coverFor('templada-10mm', { color: 'bronce', vidrio: 'claro' })?.src).toBe('/images/renders/templada-10mm-800.webp');
    expect(coverFor('nope')).toBeNull();
    expect(Object.keys(variantsOf('recta'))).toContain(variantKey('natural', 'claro'));
    expect(Object.keys(variantsOf('en-l'))).toContain(variantKey('natural', 'l-aquaclara'));
    expect(Object.keys(variantsOf('ventana-bilbao'))).toHaveLength(15); // 3 marcos x 5 vidrios
    expect(Object.keys(variantsOf('templada-10mm'))).toHaveLength(0);
  });

  it('pickVariant (pura): exacta -> mismo color con el vidrio por defecto -> undefined', () => {
    const v = { 'bronce-claro': 'A', 'bronce-nevado': 'B', 'natural-claro': 'C' } as const;
    expect(pickVariant(v, { color: 'bronce', vidrio: 'nevado' }, 'claro')).toBe('B');
    expect(pickVariant(v, { color: 'bronce', vidrio: 'decorado' }, 'claro')).toBe('A');
    expect(pickVariant(v, { color: 'bronce' }, 'claro')).toBe('A');
    expect(pickVariant(v, { color: 'natural', vidrio: 'nevado' }, 'claro')).toBe('C'); // 'natural-nevado' no existe: cae a 'natural-claro'
    expect(pickVariant(v, { color: 'blanco', vidrio: 'nevado' }, 'claro')).toBeUndefined(); // ni exacta ni por defecto: el llamador usa la portada
    expect(pickVariant(v, { color: 'bronce', acabado: 'nevado' }, 'claro')).toBe('B'); // acabado cuando no hay vidrio
    expect(pickVariant(v, { color: 'bronce', vidrio: 'nevado', acabado: 'claro' }, 'claro')).toBe('B'); // vidrio manda sobre acabado
    expect(pickVariant(v, { vidrio: 'nevado' }, 'claro')).toBeUndefined(); // sin color no hay variante
    expect(pickVariant(v, { color: 'bronce', vidrio: 'decorado' }, undefined)).toBeUndefined();
  });

  it('TODA combinacion de PRODUCT_CONFIGS resuelve por coverFor a su variante exacta, con archivo existente en public/', () => {
    let combos = 0;
    for (const [slug, config] of Object.entries(PRODUCT_CONFIGS)) {
      const color = config.groups.find((g) => g.name === 'color');
      const glass = config.groups.find((g) => g.name === 'vidrio');
      const acabado = config.groups.find((g) => g.name === 'acabado');
      const finish = glass ?? acabado;
      const media = PRODUCT_MEDIA[slug]!;
      if (!color || !finish) {
        // Sin opciones (templada-10mm): solo portada, sin variantes.
        expect(config.groups, slug).toHaveLength(0);
        expect(media.variants, slug).toBeUndefined();
        continue;
      }
      expect(defaultFinishOf(config), slug).toBe(finish.defaultValue);
      const seen = new Set<string>();
      for (const c of color.options) {
        for (const f of finish.options) {
          const choice = glass ? { color: c.value, vidrio: f.value } : { color: c.value, acabado: f.value };
          const hit = coverFor(slug, choice)!;
          const exact = media.variants?.[variantKey(c.value, f.value)];
          const token = f.value.replace(/^l-/, '').replace(/_/g, '-');
          expect(exact, `${slug} ${c.value} ${f.value}`).toBeDefined();
          expect(hit, `${slug} ${c.value} ${f.value}: variante exacta (no portada ni escalera)`).toBe(exact);
          expect(hit.src).toBe(`/images/renders/${slug}-${c.value}-${token}-800.webp`);
          expect(hit.src).not.toBe(media.cover.src);
          expect(exists(hit.src), hit.src).toBe(true);
          expect(hit.alt).toMatch(/ con aluminio (natural|blanco|bronce) y vidrio /);
          seen.add(hit.src);
          combos++;
        }
      }
      // Una imagen distinta por combinacion (ninguna colisiona con otra del mismo producto).
      expect(seen.size, slug).toBe(color.options.length * finish.options.length);
      expect(Object.keys(media.variants ?? {}), slug).toHaveLength(seen.size);
    }
    expect(combos).toBeGreaterThan(100);
  });

  it('puertas de jardin: el inicio muestra exactamente 3 productos (sin "Más opciones")', () => {
    const jardin = CATEGORIES.find((c) => c.slug === 'puertas-de-jardin')!;
    const cards = jardin.subcategories.filter((s) => s.slug in PRODUCT_CONFIGS);
    expect(cards.map((s) => s.slug)).toEqual(['jardin-1-hoja', 'jardin-2-hojas', 'jardin-3-hojas']);
  });
});
