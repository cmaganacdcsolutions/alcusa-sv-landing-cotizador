import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AMBIENT_SUFFIX, bakedAmbientSrc } from './index';

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

  it('flyers de promos: sin miniatura (la capa conserva el blur en vivo)', () => {
    expect(bakedAmbientSrc('/images/promos/puertas-ducha-image2.jpg')).toBeUndefined();
    expect(bakedAmbientSrc('/images/promos/flyer-800.webp')).toBeUndefined();
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
