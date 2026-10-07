import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@content/catalog';
import { PRODUCT_MEDIA, coverFor } from '@content/home-media';
import { CORNER_IMAGES, PRODUCT_IMAGES, TYPE_IMAGES, estimateImage, typeImage, variantImage } from './productImages';
import { WINDOW_MODEL_IMAGES, modelImage } from './measures/windowModelImages';
import { GLASS_SWATCHES } from './measures/glassSwatches';

const exists = (p: string): boolean => existsSync(join(process.cwd(), 'public', p));
const LEGACY = /\/(images\/(catalog|card-|hero-|galeria|finish-)|img\/cotizador)/;

describe('cotizador: imagenes solo desde los renders de home-media', () => {
  const all: string[] = [
    ...Object.values(PRODUCT_IMAGES),
    ...Object.values(CORNER_IMAGES),
    ...Object.values(TYPE_IMAGES),
    ...Object.values(WINDOW_MODEL_IMAGES).flatMap((w) => [w.src, w.srcSet.split(' ')[0] as string]),
  ];

  it('toda imagen es un render existente de /images/renders/ y ninguna ruta legacy de Alcusa', () => {
    expect(all.length).toBeGreaterThan(20);
    for (const src of all) {
      expect(src).toMatch(/^\/images\/renders\/.+\.webp$/);
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

  it('los acabados de la cabina en L tienen render propio (color por defecto) y ya no caen a la portada', () => {
    const tiles = (['l-aquaclara', 'l-frosted', 'l-aquafold'] as const).map((slug) => {
      expect(variantImage(slug)).toBe(coverFor('en-l', { color: 'natural', acabado: slug })?.src);
      expect(variantImage(slug)).not.toBe(coverFor('en-l')?.src);
      return variantImage(slug);
    });
    expect(new Set(tiles).size).toBe(3);
    expect(variantImage('recta')).toBeNull();
  });

  describe('estimateImage: el render sigue la eleccion de color y vidrio (Step2 y Step4)', () => {
    const src = (slug: string, color: string, token: string): string => `/images/renders/${slug}-${color}-${token}-800.webp`;

    it('ventana: modelo + marco + vidrio', () => {
      expect(estimateImage('ventana', { windowModel: 'bilbao', windowFrame: 'natural', windowGlass: 'super_gris' })).toBe(
        src('ventana-bilbao', 'natural', 'super-gris'),
      );
      expect(estimateImage('ventana', { windowFrame: 'bronce', windowGlass: 'reflectivo_azul' })).toBe(
        src('ventana-francesa', 'bronce', 'reflectivo-azul'),
      );
    });

    it('jardin: hojas + color + vidrio (custom cae al render de 3 hojas)', () => {
      expect(estimateImage('jardin', { gardenHojas: 2, gardenColor: 'bronce', gardenGlass: 'nevado' })).toBe(
        src('jardin-2-hojas', 'bronce', 'nevado'),
      );
      expect(estimateImage('jardin', { gardenHojas: 1, gardenColor: 'natural', gardenGlass: 'mallado' })).toBe(
        src('jardin-1-hoja', 'natural', 'mallado'),
      );
      expect(estimateImage('jardin', { gardenHojas: 'custom', gardenColor: 'blanco', gardenGlass: 'duplex' })).toBe(
        src('jardin-3-hojas', 'blanco', 'duplex'),
      );
    });

    it('recta y bisagra: color + vidrio; cabina en L: color + acabado', () => {
      expect(estimateImage('recta', { color: 'bronce', glass: 'aquafold' })).toBe(src('recta', 'bronce', 'aquafold'));
      expect(estimateImage('bisagra', { color: 'blanco', glass: 'duplex' })).toBe(src('bisagra', 'blanco', 'duplex'));
      expect(estimateImage('l', { color: 'bronce', cornerModel: 'frosted' })).toBe(src('en-l', 'bronce', 'frosted'));
      expect(estimateImage('l', { color: 'natural', cornerModel: 'aquaclara' })).toBe(src('en-l', 'natural', 'aquaclara'));
    });

    it('cambiar solo el vidrio (o solo el acabado) cambia la imagen; sin eleccion es la portada; templado no cambia', () => {
      expect(estimateImage('recta', { color: 'natural', glass: 'claro' })).not.toBe(estimateImage('recta', { color: 'natural', glass: 'nevado' }));
      expect(estimateImage('ventana', { windowFrame: 'blanco', windowGlass: 'claro' })).not.toBe(
        estimateImage('ventana', { windowFrame: 'blanco', windowGlass: 'bronce' }),
      );
      expect(estimateImage('l', { color: 'natural', cornerModel: 'aquaclara' })).not.toBe(estimateImage('l', { color: 'natural', cornerModel: 'aquafold' }));
      expect(estimateImage('recta')).toBe(PRODUCT_IMAGES.recta);
      expect(estimateImage('templado', { color: 'bronce', glass: 'nevado' })).toBe(PRODUCT_IMAGES.templado);
    });

    it('las tarjetas "Modelo" de la ventana reflejan marco y vidrio elegidos (y sin eleccion son la portada)', () => {
      expect(modelImage('francesa').src).toBe(WINDOW_MODEL_IMAGES.francesa.src);
      expect(modelImage('bilbao', { color: 'bronce', vidrio: 'super_gris' }).src).toBe(src('ventana-bilbao', 'bronce', 'super-gris'));
      expect(modelImage('francesa', { color: 'bronce', vidrio: 'super_gris' }).src).toBe(src('ventana-francesa', 'bronce', 'super-gris'));
    });
  });

  it('las muestras de vidrio son CSS (sin fotos)', () => {
    for (const def of Object.values(GLASS_SWATCHES)) {
      expect(def.css).toMatch(/gradient/);
      expect(def.css).not.toMatch(/url\(/);
    }
  });
});
