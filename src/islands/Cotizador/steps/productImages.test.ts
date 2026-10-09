import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@content/catalog';
import { CATEGORY_MEDIA, PRODUCT_MEDIA, coverFor } from '@content/home-media';
import { CORNER_IMAGES, categoryImage, PRODUCT_IMAGES, TYPE_IMAGES, estimateImage, typeImage, variantImage } from './productImages';
import { WINDOW_MODEL_IMAGES, modelImage } from './measures/windowModelImages';
import { GLASS_SWATCHES } from './measures/glassSwatches';

const exists = (p: string): boolean => existsSync(join(process.cwd(), 'public', p));
const LEGACY = /\/(images\/(renders|catalog|card-|hero-|galeria|finish-)|img\/cotizador)/;

describe('cotizador: imagenes solo desde las fotos oficiales de home-media', () => {
  const all: string[] = [
    ...Object.values(PRODUCT_IMAGES),
    ...Object.values(CORNER_IMAGES),
    ...Object.values(TYPE_IMAGES),
    ...Object.values(WINDOW_MODEL_IMAGES).flatMap((w) => [w.src, w.srcSet.split(' ')[0] as string]),
  ];

  it('toda imagen es una foto oficial existente de /images/fotos/ (ni renders ni rutas legacy)', () => {
    expect(all.length).toBeGreaterThan(20);
    for (const src of all) {
      expect(src).toMatch(/^\/images\/fotos\/.+\.webp$/);
      expect(src).not.toMatch(LEGACY);
      expect(exists(src), src).toBe(true);
    }
  });

  it('cada producto/tipo resuelve por coverFor (un cambio en home-media se propaga)', () => {
    expect(PRODUCT_IMAGES.recta).toBe(coverFor('recta')?.src);
    expect(PRODUCT_IMAGES.l).toBe(coverFor('en-l')?.src);
    expect(typeImage('jardin-1-hoja')).toBe(coverFor('jardin-1-hoja')?.src);
    expect(typeImage('ventana-bilbao')).toBe(coverFor('ventana-bilbao')?.src);
    expect(WINDOW_MODEL_IMAGES.francesa.src).toBe(coverFor('ventana-francesa')?.src);
    for (const slug of Object.keys(TYPE_IMAGES)) expect(PRODUCT_MEDIA[slug], slug).toBeDefined();
  });

  it('todas las hojas del catalogo tienen imagen de tile y la de Precio coincide', () => {
    const leaves = CATEGORIES.flatMap((c) => c.subcategories).filter((s) => s.quoterModel !== undefined);
    expect(leaves.length).toBeGreaterThan(6);
    for (const s of leaves) {
      const tile = typeImage(s.slug);
      expect(tile, s.slug).not.toBeNull();
      if (s.quoterModel === 'jardin') {
        expect(estimateImage('jardin', { gardenHojas: s.preset?.gardenHojas })).toBe(tile);
      }
      if (s.quoterModel === 'ventana') {
        expect(estimateImage('ventana', { windowModel: s.preset?.windowType })).toBe(tile);
      }
    }
  });

  it('los acabados de la cabina en L resuelven por coverFor: aquaclara = portada; frosted y aquafold con su propia foto', () => {
    const tiles = (['l-aquaclara', 'l-frosted', 'l-aquafold'] as const).map((slug) => {
      expect(variantImage(slug)).toBe(coverFor('en-l', { color: 'natural', acabado: slug })?.src);
      return variantImage(slug);
    });
    expect(tiles[0]).toBe(coverFor('en-l')?.src);
    expect(new Set(tiles).size).toBe(3);
    expect(variantImage('recta')).toBeNull();
  });

  it('portada de categoria del paso 1 = foto oficial de la categoria', () => {
    expect(categoryImage('puertas-de-bano')).toBe(CATEGORY_MEDIA['puertas-de-bano']?.src);
    for (const c of CATEGORIES) expect(exists(categoryImage(c.slug)), c.slug).toBe(true);
    expect(() => categoryImage('no-existe')).toThrow();
  });

  describe('estimateImage: la foto sigue la eleccion (vidrio -> color -> portada) en Step2 y Step4', () => {
    const f = (name: string): string => `/images/fotos/${name}-800.webp`;

    it('ventana: el marco decide la foto (blanco / negro); el modelo Bilbao tiene una sola', () => {
      expect(estimateImage('ventana', { windowModel: 'bilbao', windowFrame: 'natural', windowGlass: 'super_gris' })).toBe(f('ventana-bilbao'));
      expect(estimateImage('ventana', { windowFrame: 'bronce', windowGlass: 'reflectivo_azul' })).toBe(f('ventana-francesa'));
      expect(estimateImage('ventana', { windowFrame: 'blanco', windowGlass: 'claro' })).toBe(f('ventana-francesa'));
    });

    it('jardin: una foto por numero de hojas (custom cae a la de 3 hojas)', () => {
      expect(estimateImage('jardin', { gardenHojas: 2, gardenColor: 'bronce', gardenGlass: 'nevado' })).toBe(f('jardin-2-hojas'));
      expect(estimateImage('jardin', { gardenHojas: 1, gardenColor: 'natural', gardenGlass: 'mallado' })).toBe(f('jardin-1-hoja'));
      expect(estimateImage('jardin', { gardenHojas: 'custom', gardenColor: 'blanco', gardenGlass: 'duplex' })).toBe(f('jardin-3-hojas'));
    });

    it('recta y bisagra por vidrio; cabina en L por acabado', () => {
      expect(estimateImage('recta', { color: 'bronce', glass: 'aquafold' })).toBe(f('recta-aquafold'));
      expect(estimateImage('recta', { color: 'natural', glass: 'nevado' })).toBe(f('recta-nevado'));
      expect(estimateImage('recta', { color: 'natural', glass: 'mallado' })).toBe(f('recta'));
      expect(estimateImage('bisagra', { color: 'blanco', glass: 'duplex' })).toBe(f('bisagra'));
      expect(estimateImage('bisagra', { color: 'blanco', glass: 'decorado' })).toBe(f('bisagra-decorado'));
      expect(estimateImage('l', { color: 'bronce', cornerModel: 'frosted' })).toBe(f('en-l-frosted'));
      expect(estimateImage('l', { color: 'natural', cornerModel: 'aquaclara' })).toBe(f('en-l'));
      expect(estimateImage('l', { color: 'natural', cornerModel: 'aquafold' })).toBe(f('en-l-aquafold'));
    });

    it('cambiar solo el vidrio (o solo el acabado) cambia la foto donde hay match; sin eleccion es la portada; templado no cambia', () => {
      expect(estimateImage('recta', { color: 'natural', glass: 'claro' })).not.toBe(estimateImage('recta', { color: 'natural', glass: 'nevado' }));
      // francesa: blanco y bronce muestran la misma foto por ahora
      expect(estimateImage('ventana', { windowFrame: 'blanco', windowGlass: 'claro' })).toBe(
        estimateImage('ventana', { windowFrame: 'bronce', windowGlass: 'claro' }),
      );
      expect(estimateImage('l', { color: 'natural', cornerModel: 'aquaclara' })).not.toBe(estimateImage('l', { color: 'natural', cornerModel: 'aquafold' }));
      expect(estimateImage('recta')).toBe(PRODUCT_IMAGES.recta);
      expect(estimateImage('templado', { color: 'bronce', glass: 'nevado' })).toBe(PRODUCT_IMAGES.templado);
    });

    it('las tarjetas "Modelo" de la ventana reflejan el marco elegido (y sin eleccion son la portada)', () => {
      expect(modelImage('francesa').src).toBe(WINDOW_MODEL_IMAGES.francesa.src);
      expect(modelImage('bilbao', { color: 'bronce', vidrio: 'super_gris' }).src).toBe(f('ventana-bilbao'));
      expect(modelImage('francesa', { color: 'bronce', vidrio: 'super_gris' }).src).toBe(f('ventana-francesa'));
    });
  });

  it('las muestras de vidrio son CSS (sin fotos)', () => {
    for (const def of Object.values(GLASS_SWATCHES)) {
      expect(def.css).toMatch(/gradient/);
      expect(def.css).not.toMatch(/url\(/);
    }
  });
});
