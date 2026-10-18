import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLASS_SWATCHES } from '../islands/Cotizador/steps/measures/glassSwatches';
import { GLASS_PHOTO_KEYS, GLASS_PHOTO_SIZES, glassPhotoCss, glassPhotoUrl } from './glassSwatchPhotos';

const root = process.cwd();
const card = readFileSync(join(root, 'src/components/home/ProductCard.astro'), 'utf8');

describe('glass swatch photos (2026-10-17)', () => {
  it('cubre exactamente mallado, nevado y aquafold', () => {
    expect([...GLASS_PHOTO_KEYS].sort()).toEqual(['aquafold', 'mallado', 'nevado']);
  });

  it.each(GLASS_PHOTO_KEYS.flatMap((k) => GLASS_PHOTO_SIZES.map((px) => [k, px] as const)))(
    'existe public/%s %ipx y pesa <= 4 KB',
    (k, px) => {
      const file = join(root, 'public', glassPhotoUrl(k, px));
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeLessThanOrEqual(4096);
    },
  );

  it.each(GLASS_PHOTO_KEYS)('cotizador %s usa la foto', (k) => {
    expect(GLASS_SWATCHES[k].css).toBe(glassPhotoCss(k));
  });

  it.each(GLASS_PHOTO_KEYS)('inicio %s usa la misma foto que el cotizador (paridad)', (k) => {
    expect(card).toContain(`.pcard__sw[data-sw='glass:${k}'] { background: ${glassPhotoCss(k)}; }`);
  });

  it('claro, duplex y decorado siguen en CSS', () => {
    for (const k of ['claro', 'duplex', 'decorado'] as const) expect(GLASS_SWATCHES[k].css).not.toContain('url(');
  });
});
