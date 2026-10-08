import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, allLeaves } from './catalog';
import { PRODUCT_CONFIGS } from './catalogHome';
import {
  CATEGORY_MEDIA,
  FOTO_NATIVE,
  HOME_HERO_MEDIA,
  PRODUCT_MEDIA,
  coverFor,
  defaultFinishOf,
  galleryOf,
  photoNameFor,
  pickVariant,
  variantKey,
  variantsOf,
  type MediaRef,
} from './home-media';
import { CATEGORY_TEASERS } from './categoryTeasers';

const exists = (p: string): boolean => existsSync(join(process.cwd(), 'public', p));
const LEGACY = /\/images\/(renders|catalog|card-|hero-|galeria|finish-)/;
const F = '/images/fotos';

function allRefs(): MediaRef[] {
  return [
    ...Object.values(PRODUCT_MEDIA).flatMap((m) => [m.cover, ...Object.values(m.variants ?? {}), ...(m.gallery ?? [])]),
    ...Object.values(CATEGORY_MEDIA),
    ...CATEGORY_TEASERS.map((t) => t.image),
    ...(HOME_HERO_MEDIA ? [HOME_HERO_MEDIA] : []),
  ];
}

describe('home-media: solo fotos oficiales del portafolio', () => {
  it('cada hoja del catalogo (con o sin precio) tiene portada foto existente en /images/fotos/', () => {
    for (const leaf of allLeaves()) {
      const m = PRODUCT_MEDIA[leaf.slug] ?? PRODUCT_MEDIA['en-l'];
      if (leaf.slug.startsWith('l-')) continue; // acabados de en-l: heredan la foto de en-l
      expect(PRODUCT_MEDIA[leaf.slug], leaf.slug).toBeDefined();
      expect(m!.cover.src).toMatch(new RegExp(`^${F}/`));
      expect(m!.cover.kind).toBe('photo');
      expect(exists(m!.cover.src), m!.cover.src).toBe(true);
    }
  });

  it('toda referencia existe, no usa rutas legacy ni renders, y sus dimensiones son intrinsecas y veraces', () => {
    const refs = allRefs();
    expect(refs.length).toBeGreaterThan(30);
    for (const r of refs) {
      expect(r.src).not.toMatch(LEGACY);
      expect(r.src).toMatch(new RegExp(`^${F}/`));
      expect(r.alt.length).toBeGreaterThan(8);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      expect(exists(r.src), r.src).toBe(true);
      // srcset con descriptores veraces: cada archivo existe y el ancho declarado es el del archivo.
      for (const cand of (r.srcSet ?? '').split(',').filter(Boolean)) {
        const [url, desc] = cand.trim().split(/\s+/);
        expect(exists(url!), url).toBe(true);
        expect(desc).toMatch(/^\d+w$/);
        expect(url).toMatch(new RegExp(`-${parseInt(desc!, 10)}\\.webp$`));
      }
    }
  });

  it('el alto declarado conserva la proporcion nativa de la foto y no hay upscale', () => {
    for (const r of allRefs()) {
      const name = r.src.replace(`${F}/`, '').replace(/-\d+\.webp$/, '');
      const [nw, nh] = FOTO_NATIVE[name] ?? FOTO_NATIVE[name.replace(/-(480)$/, '')] ?? [0, 0];
      expect(nw, name).toBeGreaterThan(0);
      expect(r.width).toBeLessThanOrEqual(nw);
      expect(Math.abs(r.height - Math.round((r.width * nh) / nw))).toBeLessThanOrEqual(1);
    }
  });

  it('photoNameFor (pura): match de vidrio -> match de color -> portada', () => {
    const spec = { cover: 'c', byGlass: { nevado: 'g' }, byColor: { blanco: 'w' } } as const;
    expect(photoNameFor(spec, 'blanco', 'nevado')).toBe('g'); // vidrio manda sobre color
    expect(photoNameFor(spec, 'blanco', 'claro')).toBe('w');
    expect(photoNameFor(spec, 'bronce', 'claro')).toBe('c');
  });

  it('aluminio negro: foto por color (el vidrio manda sobre el color)', () => {
    const n = (s: MediaRef | null): string | undefined => s?.src.replace(`${F}/`, '').replace('-800.webp', '');
    expect(n(coverFor('recta', { color: 'negro', vidrio: 'claro' }))).toBe('recta-galeria'); // #21
    expect(n(coverFor('recta', { color: 'negro', vidrio: 'nevado' }))).toBe('recta-nevado'); // vidrio manda
    expect(n(coverFor('bisagra', { color: 'negro', vidrio: 'claro' }))).toBe('bisagra-decorado'); // #15
    expect(n(coverFor('jardin-1-hoja', { color: 'negro', vidrio: 'claro' }))).toBe('jardin-1-hoja'); // #7
    expect(n(coverFor('jardin-2-hojas', { color: 'negro', vidrio: 'claro' }))).toBe('jardin-2-hojas'); // #17
    expect(n(coverFor('jardin-3-hojas', { color: 'negro', vidrio: 'claro' }))).toBe('jardin-3-hojas-galeria'); // #4
    expect(n(coverFor('ventana-francesa', { color: 'negro', vidrio: 'claro' }))).toBe('ventana-francesa-negro'); // #1
    expect(n(coverFor('recta', { color: 'natural', vidrio: 'claro' }))).toBe('recta');
  });

  it('negro solo en recta, bisagra, jardin x3 y ventana francesa (no en L, templada ni Bilbao)', () => {
    const withNegro = Object.keys(PRODUCT_CONFIGS).filter((k) => PRODUCT_CONFIGS[k].groups.some((g) => g.name === 'color' && g.options.some((o) => o.value === 'negro'))).sort();
    expect(withNegro).toEqual(['bisagra', 'jardin-1-hoja', 'jardin-2-hojas', 'jardin-3-hojas', 'recta', 'ventana-francesa']);
  });

  it('mapeo del portafolio: recta, bisagra, en L, ventana francesa', () => {
    const n = (s: MediaRef | null): string | undefined => s?.src.replace(`${F}/`, '').replace('-800.webp', '');
    // recta: default aquaclara/claro, nevado, aquafold y decorado
    expect(n(coverFor('recta', { color: 'natural', vidrio: 'claro' }))).toBe('recta');
    expect(n(coverFor('recta', { color: 'bronce', vidrio: 'nevado' }))).toBe('recta-nevado');
    expect(n(coverFor('recta', { color: 'blanco', vidrio: 'aquafold' }))).toBe('recta-aquafold');
    expect(n(coverFor('recta', { color: 'natural', vidrio: 'decorado' }))).toBe('recta-aquafold');
    expect(n(coverFor('recta', { color: 'natural', vidrio: 'mallado' }))).toBe('recta'); // sin match -> default
    expect(n(coverFor('recta'))).toBe('recta');
    // bisagra: portada (#9) para nevado y claro; decorado/aquafold -> foto con diseno (#15)
    expect(n(coverFor('bisagra'))).toBe('bisagra');
    expect(n(coverFor('bisagra', { color: 'natural', vidrio: 'nevado' }))).toBe('bisagra');
    expect(n(coverFor('bisagra', { color: 'natural', vidrio: 'claro' }))).toBe('bisagra');
    expect(n(coverFor('bisagra', { color: 'blanco', vidrio: 'decorado' }))).toBe('bisagra-decorado');
    expect(n(coverFor('bisagra', { color: 'blanco', vidrio: 'duplex' }))).toBe('bisagra');
    // en L: por acabado
    expect(n(coverFor('en-l', { color: 'natural', acabado: 'l-aquaclara' }))).toBe('en-l');
    expect(n(coverFor('en-l', { color: 'bronce', acabado: 'l-frosted' }))).toBe('en-l-frosted');
    expect(n(coverFor('en-l', { color: 'natural', acabado: 'l-aquafold' }))).toBe('en-l-aquafold');
    // francesa: una sola foto (n18) para todos los marcos; la negra (n1) es del color negro
    expect(n(coverFor('ventana-francesa'))).toBe('ventana-francesa');
    expect(n(coverFor('ventana-francesa', { color: 'blanco', vidrio: 'claro' }))).toBe('ventana-francesa');
    expect(n(coverFor('ventana-francesa', { color: 'bronce', vidrio: 'bronce' }))).toBe('ventana-francesa');
    // sin variantes -> portada
    expect(n(coverFor('templada-10mm', { color: 'bronce', vidrio: 'claro' }))).toBe('templada-10mm');
    expect(coverFor('nope')).toBeNull();
  });

  it('coverFor: escalera vidrio -> color por defecto -> portada, y variantsOf', () => {
    expect(coverFor('recta', { color: 'bronce', vidrio: 'no-existe' })?.src).toBe(`${F}/recta-800.webp`);
    expect(coverFor('en-l', { color: 'bronce' })?.src).toBe(`${F}/en-l-800.webp`);
    expect(coverFor('recta', { vidrio: 'nevado' })?.src).toBe(`${F}/recta-800.webp`); // sin color -> portada
    expect(Object.keys(variantsOf('recta'))).toContain(variantKey('natural', 'claro'));
    expect(Object.keys(variantsOf('en-l'))).toContain(variantKey('natural', 'l-aquaclara'));
    // francesa: la foto negra (n1) solo sale con el aluminio negro; el resto usa la portada (n18)
    const fr = variantsOf('ventana-francesa');
    expect(fr[variantKey('negro', 'claro')]?.src).toBe(`${F}/ventana-francesa-negro-800.webp`);
    expect(fr[variantKey('blanco', 'claro')]?.src).toBe(`${F}/ventana-francesa-800.webp`);
    expect(Object.keys(variantsOf('ventana-bilbao'))).toHaveLength(0); // una sola foto
    expect(Object.keys(variantsOf('templada-10mm'))).toHaveLength(0);
  });

  it('pickVariant (pura): exacta -> mismo color con el vidrio por defecto -> undefined', () => {
    const v = { 'bronce-claro': 'A', 'bronce-nevado': 'B', 'natural-claro': 'C' } as const;
    expect(pickVariant(v, { color: 'bronce', vidrio: 'nevado' }, 'claro')).toBe('B');
    expect(pickVariant(v, { color: 'bronce', vidrio: 'decorado' }, 'claro')).toBe('A');
    expect(pickVariant(v, { color: 'bronce' }, 'claro')).toBe('A');
    expect(pickVariant(v, { color: 'natural', vidrio: 'nevado' }, 'claro')).toBe('C');
    expect(pickVariant(v, { color: 'blanco', vidrio: 'nevado' }, 'claro')).toBeUndefined();
    expect(pickVariant(v, { color: 'bronce', acabado: 'nevado' }, 'claro')).toBe('B');
    expect(pickVariant(v, { color: 'bronce', vidrio: 'nevado', acabado: 'claro' }, 'claro')).toBe('B');
    expect(pickVariant(v, { vidrio: 'nevado' }, 'claro')).toBeUndefined();
    expect(pickVariant(v, { color: 'bronce', vidrio: 'decorado' }, undefined)).toBeUndefined();
  });

  it('TODA combinacion de PRODUCT_CONFIGS resuelve por coverFor a una foto existente (variante exacta si el producto tiene variantes)', () => {
    let combos = 0;
    for (const [slug, config] of Object.entries(PRODUCT_CONFIGS)) {
      const color = config.groups.find((g) => g.name === 'color');
      const glass = config.groups.find((g) => g.name === 'vidrio');
      const finish = glass ?? config.groups.find((g) => g.name === 'acabado');
      const media = PRODUCT_MEDIA[slug]!;
      if (!color || !finish) {
        expect(media.variants, slug).toBeUndefined();
        continue;
      }
      expect(defaultFinishOf(config), slug).toBe(finish.defaultValue);
      for (const c of color.options) {
        for (const f of finish.options) {
          const choice = glass ? { color: c.value, vidrio: f.value } : { color: c.value, acabado: f.value };
          const hit = coverFor(slug, choice)!;
          const exact = media.variants?.[variantKey(c.value, f.value)];
          if (media.variants) {
            expect(exact, `${slug} ${c.value} ${f.value}`).toBeDefined();
            expect(hit).toBe(exact);
          } else {
            expect(hit).toBe(media.cover);
          }
          expect(exists(hit.src), hit.src).toBe(true);
          combos++;
        }
      }
    }
    expect(combos).toBeGreaterThan(100);
  });

  it('puertas de jardin: 3 productos con opciones + "Más opciones" (2 solo asesor, portada sin variantes)', () => {
    const jardin = CATEGORIES.find((c) => c.slug === 'puertas-de-jardin')!;
    const cards = jardin.subcategories.filter((s) => s.slug in PRODUCT_CONFIGS);
    expect(cards.map((s) => s.slug)).toEqual(['jardin-1-hoja', 'jardin-2-hojas', 'jardin-3-hojas']);
    const more = jardin.subcategories.filter((s) => s.group === 'mas-opciones');
    expect(more.map((s) => s.slug)).toEqual(['jardin-2-fijas-2-corredizas', 'jardin-1-fijo-3-corredizas']);
    const expected: Record<string, string> = {
      'jardin-1-hoja': 'jardin-1-hoja',
      'jardin-2-hojas': 'jardin-2-hojas',
      'jardin-3-hojas': 'jardin-3-hojas',
      'jardin-2-fijas-2-corredizas': 'jardin-2-fijas-2-corredizas',
      'jardin-1-fijo-3-corredizas': 'jardin-1-fijo-3-corredizas',
    };
    for (const [slug, file] of Object.entries(expected)) expect(PRODUCT_MEDIA[slug]!.cover.src).toBe(`${F}/${file}-800.webp`);
    for (const s of more) {
      expect(s.slug in PRODUCT_CONFIGS, `${s.slug}: sin opciones de cotizador`).toBe(false);
      expect(PRODUCT_MEDIA[s.slug]!.variants, `${s.slug}: solo portada`).toBeUndefined();
    }
    // La de 2 fijas + 2 corredizas es horizontal (1448x1086 -> 800x600); las demas son 3:4.
    expect(PRODUCT_MEDIA['jardin-2-fijas-2-corredizas']!.cover).toMatchObject({ width: 800, height: 600, kind: 'photo' });
    expect(PRODUCT_MEDIA['jardin-1-hoja']!.cover).toMatchObject({ width: 800, height: 1067, kind: 'photo' });
  });

  it('solo asesor nuevos: templada abatible, Bilbao con medio punto y las 3 puertas abatibles', () => {
    const adv = allLeaves().filter((l) => l.advisorOnly).map((l) => l.slug);
    expect(adv).toEqual([
      'templada-10mm-abatible',
      'jardin-2-fijas-2-corredizas',
      'jardin-1-fijo-3-corredizas',
      'ventana-bilbao-medio-punto',
      'abatible-interior-exterior',
      'abatible-oficina-vidrio-fijo',
      'abatible-oficina-cerrador',
    ]);
    for (const slug of adv) {
      expect(slug in PRODUCT_CONFIGS, `${slug} no entra al wizard`).toBe(false);
      expect(PRODUCT_MEDIA[slug]!.cover.src, slug).toBe(`${F}/${slug}-800.webp`);
    }
    const abatibles = CATEGORIES.find((c) => c.slug === 'puertas-abatibles')!;
    expect(abatibles.subcategories.every((s) => s.advisorOnly === true)).toBe(true);
    expect(CATEGORIES.map((c) => c.slug)).toEqual(['puertas-de-bano', 'puertas-de-jardin', 'ventanas', 'puertas-abatibles']);
  });

  it('portadas de categoria, galerias y hero', () => {
    const f = (r: MediaRef): string => r.src;
    expect(f(CATEGORY_MEDIA['puertas-de-bano']!)).toBe(`${F}/en-l-galeria-800.webp`);
    expect(f(CATEGORY_MEDIA['puertas-de-jardin']!)).toBe(`${F}/jardin-1-fijo-3-corredizas-800.webp`);
    expect(f(CATEGORY_MEDIA['ventanas']!)).toBe(`${F}/ventana-francesa-negro-800.webp`);
    expect(f(CATEGORY_MEDIA['puertas-abatibles']!)).toBe(`${F}/abatible-oficina-vidrio-fijo-800.webp`);
    expect(galleryOf('recta').map(f)).toEqual([`${F}/recta-galeria-800.webp`]);
    expect(galleryOf('jardin-3-hojas').map(f)).toEqual([`${F}/jardin-3-hojas-galeria-800.webp`]);
    expect(galleryOf('jardin-1-hoja')).toEqual([]);
    expect(HOME_HERO_MEDIA).toMatchObject({ src: `${F}/jardin-2-fijas-2-corredizas-800.webp`, width: 800, height: 600 });
    expect(HOME_HERO_MEDIA!.srcSet).toContain('480w');
    expect(HOME_HERO_MEDIA!.srcSet).toContain('1448w');
  });
});
