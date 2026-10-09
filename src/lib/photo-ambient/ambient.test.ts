import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AMBIENT_SUFFIX, ambientThumbSrc, bakedAmbientSrc, bakedFlyerAmbientSrc } from './index';

describe('bakedAmbientSrc: miniatura ambiental derivada de la URL de la foto', () => {
  it('foto oficial: <stem>-<ancho>.webp -> <stem>-amb.webp, sea cual sea el ancho', () => {
    expect(bakedAmbientSrc('/images/fotos/recta-800.webp')).toBe('/images/fotos/recta-amb.webp');
    expect(bakedAmbientSrc('/images/fotos/recta-1086.webp')).toBe('/images/fotos/recta-amb.webp');
    expect(bakedAmbientSrc('/images/fotos/jardin-2-fijas-2-corredizas-480.webp')).toBe(
      '/images/fotos/jardin-2-fijas-2-corredizas-amb.webp',
    );
  });

  it('stems con numeros y guiones: solo el ultimo -<ancho> se reemplaza', () => {
    expect(bakedAmbientSrc('/images/fotos/jardin-1-hoja-1086.webp')).toBe('/images/fotos/jardin-1-hoja-amb.webp');
    expect(bakedAmbientSrc('/images/fotos/templada-10mm-800.webp')).toBe('/images/fotos/templada-10mm-amb.webp');
    expect(bakedAmbientSrc('/images/fotos/templada-10mm-abatible-1086.webp')).toBe(
      '/images/fotos/templada-10mm-abatible-amb.webp',
    );
    expect(bakedAmbientSrc('/images/fotos/jardin-3-hojas-galeria-844.webp')).toBe(
      '/images/fotos/jardin-3-hojas-galeria-amb.webp',
    );
  });

  it('tolera prefijo, base y origen absoluto', () => {
    expect(bakedAmbientSrc('/alcusa/images/fotos/recta-800.webp')).toBe('/alcusa/images/fotos/recta-amb.webp');
    expect(bakedAmbientSrc('https://cdn.alcusa.test/base/images/fotos/en-l-800.webp')).toBe(
      'https://cdn.alcusa.test/base/images/fotos/en-l-amb.webp',
    );
  });

  it('bakedAmbientSrc no cubre flyers (convencion de fotos intacta); los flyers van por bakedFlyerAmbientSrc', () => {
    expect(bakedAmbientSrc('/images/promos/flyer-800.webp')).toBeUndefined();
    expect(bakedAmbientSrc('/images/promos/puertas-ducha-image2.jpg')).toBeUndefined();
  });

  it('srcs ajenos o que no siguen el patron: undefined', () => {
    for (const src of [
      '',
      '/images/logo-primary.png',
      '/images/renders/recta-800.webp',
      '/images/fotos/recta.webp', // sin ancho
      '/images/fotos/recta-800.jpg', // otra extension
      '/images/fotos/recta-amb.webp', // ya es la miniatura: no se encadena -amb-amb
      '/images/fotos/sub/recta-800.webp', // carpeta anidada
      '/images/fotos/recta-800.webp?v=2', // con query
    ]) {
      expect(bakedAmbientSrc(src), src).toBeUndefined();
    }
  });
});

describe('bakedFlyerAmbientSrc / ambientThumbSrc: miniatura ambiental de los flyers de promos', () => {
  it('flyers del build (/images/promos/) y del admin (/media/promos/): <stem>-<ancho>.webp -> <stem>-amb.webp', () => {
    expect(bakedFlyerAmbientSrc('/images/promos/promo-1-900.webp')).toBe('/images/promos/promo-1-amb.webp');
    expect(bakedFlyerAmbientSrc('/images/promos/promo-1-600.webp')).toBe('/images/promos/promo-1-amb.webp');
    expect(bakedFlyerAmbientSrc('/media/promos/a1b2c3d4-900.webp')).toBe('/media/promos/a1b2c3d4-amb.webp');
    expect(bakedFlyerAmbientSrc('https://admin.alcusa.test/media/promos/k-900.webp')).toBe(
      'https://admin.alcusa.test/media/promos/k-amb.webp',
    );
  });

  it('sin convencion (jpg antiguo, otra carpeta, ya miniatura, query): undefined => color solido, nunca blur', () => {
    for (const src of [
      '',
      '/images/promos/puertas-ducha-image2.jpg',
      '/images/promos/flyer.webp',
      '/images/promos/promo-1-amb.webp',
      '/images/promos/promo-1-900.webp?v=2',
      '/images/promos/sub/promo-1-900.webp',
      '/images/fotos/recta-800.webp',
      '/media/otro/x-900.webp',
    ]) {
      expect(bakedFlyerAmbientSrc(src), src).toBeUndefined();
    }
  });

  it('ambientThumbSrc resuelve fotos y flyers con la misma convencion', () => {
    expect(ambientThumbSrc('/images/fotos/recta-800.webp')).toBe('/images/fotos/recta-amb.webp');
    expect(ambientThumbSrc('/images/promos/promo-2-900.webp')).toBe('/images/promos/promo-2-amb.webp');
    expect(ambientThumbSrc('/images/renders/x-800.webp')).toBeUndefined();
  });
});

describe('miniaturas ambientales de los flyers en public/images/promos', () => {
  const dir = join(process.cwd(), 'public', 'images', 'promos');
  const files = readdirSync(dir);

  it('cada flyer del build tiene su <stem>-amb.webp, minuscula (regenerar con node scripts/bake-ambient.mjs)', () => {
    const flyers = files.filter((f) => /-\d+\.webp$/.test(f));
    expect(flyers.length).toBeGreaterThan(0);
    for (const file of flyers) {
      const thumb = bakedFlyerAmbientSrc(`/images/promos/${file}`) as string;
      const path = join(process.cwd(), 'public', thumb);
      expect(existsSync(path), `falta ${thumb}`).toBe(true);
      expect(statSync(path).size, thumb).toBeLessThan(8 * 1024);
    }
  });
});

describe('miniaturas ambientales en public/images/fotos', () => {
  const dir = join(process.cwd(), 'public', 'images', 'fotos');
  const files = readdirSync(dir);
  const photos = files.filter((f) => /-\d+\.webp$/.test(f));
  const thumbs = files.filter((f) => f.endsWith(`-${AMBIENT_SUFFIX}.webp`));

  it('cada <stem>-<ancho>.webp tiene su <stem>-amb.webp (regenerar con node scripts/bake-ambient.mjs)', () => {
    expect(photos.length).toBeGreaterThan(0);
    for (const file of photos) {
      const thumb = bakedAmbientSrc(`/images/fotos/${file}`);
      expect(thumb, file).toBeDefined();
      expect(existsSync(join(process.cwd(), 'public', thumb as string)), `falta ${thumb}`).toBe(true);
    }
  });

  it('no quedan miniaturas huerfanas (cada <stem>-amb.webp tiene su foto)', () => {
    expect(thumbs.length).toBeGreaterThan(0);
    for (const thumb of thumbs) {
      const stem = thumb.slice(0, -`-${AMBIENT_SUFFIX}.webp`.length);
      const hasPhoto = photos.some((f) => f.startsWith(`${stem}-`) && /^\d+\.webp$/.test(f.slice(stem.length + 1)));
      expect(hasPhoto, `huerfana ${thumb}`).toBe(true);
    }
  });

  it('las miniaturas son minusculas (< 8 KB): no se copio una foto completa', () => {
    for (const thumb of thumbs) {
      expect(statSync(join(dir, thumb)).size, thumb).toBeLessThan(8 * 1024);
    }
  });
});
